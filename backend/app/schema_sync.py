"""Self-healing schema reconciliation.

``Base.metadata.create_all`` creates missing *tables* but never alters
existing ones — so when a model gains a new column after its table was
already created (the common case on Amvera, where the schema was first
built by an earlier model version), the column is silently absent and
every query that selects it fails with ``UndefinedColumn``.

This module closes that gap: after ``create_all`` it inspects each table
that exists in the database, compares its real columns against the model
definition, and issues ``ALTER TABLE ... ADD COLUMN`` for any column the
model declares but the table lacks.

The operation is idempotent and additive only — it never drops or
modifies existing columns, so it is safe to run on every startup and
cannot lose data. New columns are always added as NULLABLE (carrying a
server default when the model defines one) so the ALTER never fails on a
table that already holds rows.
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .database import Base

logger = logging.getLogger("siz_control")


def _column_ddl(column, dialect) -> str:
    """Render ``<name> <type> [DEFAULT ...]`` for an ADD COLUMN clause.

    The column is rendered without a NOT NULL constraint regardless of the
    model definition: adding a NOT NULL column to a table that already has
    rows would fail. A server default is included when the model defines a
    literal one, which also back-fills existing rows on databases that
    support it.
    """
    preparer = dialect.identifier_preparer
    name = preparer.format_column(column)
    type_sql = column.type.compile(dialect=dialect)
    ddl = f"{name} {type_sql}"

    default = column.server_default
    if default is not None and hasattr(default, "arg"):
        arg = default.arg
        text = arg if isinstance(arg, str) else getattr(arg, "text", None)
        if text:
            ddl += f" DEFAULT {text}"

    return ddl


def sync_schema(engine: Engine) -> None:
    """Add any model-declared columns that are missing from real tables.

    Inspects every table registered on ``Base.metadata`` that already
    exists in the database and adds columns present in the model but
    absent in the table. Tables that do not yet exist are skipped — they
    will have been (or will be) created in full by ``create_all``.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    dialect = engine.dialect
    preparer = dialect.identifier_preparer
    added_total = 0

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue

        real_columns = {col["name"] for col in inspector.get_columns(table.name)}
        missing = [c for c in table.columns if c.name not in real_columns]
        if not missing:
            continue

        table_sql = preparer.format_table(table)
        for column in missing:
            column_sql = _column_ddl(column, dialect)
            stmt = f"ALTER TABLE {table_sql} ADD COLUMN {column_sql}"
            with engine.begin() as conn:
                conn.execute(text(stmt))
            added_total += 1
            logger.warning(
                "Schema sync: added missing column %s.%s", table.name, column.name
            )

    if added_total:
        logger.warning("Schema sync: added %d missing column(s).", added_total)
    else:
        logger.info("Schema sync: all model columns present, nothing to add.")
