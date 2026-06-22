"""Database backup & restore — admin only.

Exports all table data as a single JSON file and can restore from it.
Works identically on SQLite and PostgreSQL, making it safe for
migrating between hosting providers (e.g. Render → Amvera).

Table order is derived from SQLAlchemy metadata FK dependencies,
so no manual ordering is needed and FK checks stay enabled.
"""
import io
import json
from datetime import date, datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from ..database import Base, get_db
from ..dependencies import require_admin
from ..models.user import User

router = APIRouter(prefix="/api", tags=["backup"])


def _table_order() -> List[str]:
    """Return table names sorted by FK dependencies (parents first).

    Uses SQLAlchemy's ``Base.metadata.sorted_tables`` which performs a
    topological sort based on foreign-key references.
    """
    return [t.name for t in Base.metadata.sorted_tables]


def _serialize(val: Any) -> Any:
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, bytes):
        import base64
        return base64.b64encode(val).decode()
    return val


@router.get("/backup")
def export_backup(
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    """Download a full database dump as JSON."""
    table_order = _table_order()
    inspector = inspect(db.bind)
    existing_tables = set(inspector.get_table_names())

    dump: Dict[str, List[dict]] = {}
    for table_name in table_order:
        if table_name not in existing_tables:
            continue
        rows = db.execute(text(f"SELECT * FROM {table_name}")).mappings().all()
        dump[table_name] = [
            {k: _serialize(v) for k, v in dict(row).items()} for row in rows
        ]

    content = json.dumps(dump, ensure_ascii=False, indent=2).encode("utf-8")

    now = datetime.now().strftime("%Y-%m-%d")
    filename = f"siz-control-backup-{now}.json"

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/restore")
def restore_backup_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    """Restore database from a JSON backup.

    REPLACES all existing data in a single transaction:
    1. DELETE rows in REVERSE dependency order (children → parents).
    2. INSERT rows in FORWARD dependency order (parents → children).
    3. Reset PostgreSQL sequence counters to max(id) + 1.
    Any error → full rollback, database unchanged.
    """
    if not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Допустимы только файлы .json")

    try:
        raw = file.file.read()
        dump: Dict[str, List[dict]] = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Не удалось прочитать JSON-файл")

    if not isinstance(dump, dict):
        raise HTTPException(status_code=400, detail="Неверный формат бэкапа")

    table_order = _table_order()
    inspector = inspect(db.bind)
    existing_tables = set(inspector.get_table_names())
    is_pg = not str(db.bind.url).startswith("sqlite")

    try:
        # ── 1. DELETE in reverse order (children first) ──────────────
        for table_name in reversed(table_order):
            if table_name in existing_tables:
                db.execute(text(f"DELETE FROM {table_name}"))

        # ── 2. INSERT in forward order (parents first) ───────────────
        restored = {}
        for table_name in table_order:
            rows = dump.get(table_name, [])
            if not rows or table_name not in existing_tables:
                restored[table_name] = 0
                continue

            # Filter to actual columns (ignore unknown keys in backup).
            table_columns = {c["name"] for c in inspector.get_columns(table_name)}

            for row in rows:
                filtered = {k: v for k, v in row.items() if k in table_columns}
                if not filtered:
                    continue
                cols = ", ".join(filtered.keys())
                placeholders = ", ".join(f":{k}" for k in filtered.keys())
                db.execute(
                    text(f"INSERT INTO {table_name} ({cols}) VALUES ({placeholders})"),
                    filtered,
                )

            restored[table_name] = len(rows)

        # ── 3. Reset sequences (PostgreSQL only) ─────────────────────
        if is_pg:
            for table_name in table_order:
                if restored.get(table_name, 0) > 0:
                    try:
                        db.execute(text(
                            f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                            f"COALESCE((SELECT MAX(id) FROM {table_name}), 0) + 1, false)"
                        ))
                    except Exception:
                        pass  # Table may not have a serial id column

        # ── Single commit ────────────────────────────────────────────
        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка восстановления: {str(e)}")

    total = sum(restored.values())
    return {
        "detail": f"База восстановлена. Записей: {total}",
        "tables": restored,
    }
