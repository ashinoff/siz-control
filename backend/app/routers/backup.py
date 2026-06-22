"""Database backup & restore — admin only.

Exports all table data as a single JSON file and can restore from it.
Works identically on SQLite and PostgreSQL, making it safe for
migrating between hosting providers (e.g. Render → Amvera).
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

router = APIRouter(prefix="/api/backup", tags=["backup"])

# Order matters: referenced tables must be restored before referencing ones.
TABLE_ORDER = [
    "roles",
    "departments",
    "warehouses",
    "employees",
    "users",
    "categories",
    "subcategories",
    "catalog_items",
    "inventory_items",
    "assignments",
    "movements",
    "verification_records",
    "audit_logs",
    "files",
    "position_norms",
]


def _serialize(val: Any) -> Any:
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, bytes):
        import base64
        return base64.b64encode(val).decode()
    return val


@router.get("/export")
def export_backup(
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    """Download a full database dump as JSON."""
    inspector = inspect(db.bind)
    existing_tables = set(inspector.get_table_names())

    dump: Dict[str, List[dict]] = {}
    for table_name in TABLE_ORDER:
        if table_name not in existing_tables:
            continue
        rows = db.execute(text(f"SELECT * FROM {table_name}")).mappings().all()
        dump[table_name] = [{k: _serialize(v) for k, v in dict(row).items()} for row in rows]

    content = json.dumps(dump, ensure_ascii=False, indent=2).encode("utf-8")

    now = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"siz_control_backup_{now}.json"

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/restore")
def restore_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    """Restore database from a JSON backup. REPLACES all existing data."""
    if not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Допустимы только файлы .json")

    try:
        raw = file.file.read()
        dump: Dict[str, List[dict]] = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Не удалось прочитать JSON-файл")

    if not isinstance(dump, dict):
        raise HTTPException(status_code=400, detail="Неверный формат бэкапа")

    inspector = inspect(db.bind)
    existing_tables = set(inspector.get_table_names())

    # Validate that backup contains known tables.
    unknown = set(dump.keys()) - set(TABLE_ORDER)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Неизвестные таблицы в бэкапе: {', '.join(unknown)}")

    try:
        # Disable FK checks during restore.
        is_sqlite = str(db.bind.url).startswith("sqlite")
        if is_sqlite:
            db.execute(text("PRAGMA foreign_keys = OFF"))
        else:
            db.execute(text("SET session_replication_role = 'replica'"))

        # Clear tables in reverse order (children first).
        for table_name in reversed(TABLE_ORDER):
            if table_name in existing_tables:
                db.execute(text(f"DELETE FROM {table_name}"))

        # Insert data in correct order.
        restored = {}
        for table_name in TABLE_ORDER:
            rows = dump.get(table_name, [])
            if not rows or table_name not in existing_tables:
                restored[table_name] = 0
                continue

            # Get column names from the actual table to filter out unknown columns.
            table_columns = {c["name"] for c in inspector.get_columns(table_name)}

            for row in rows:
                filtered = {k: v for k, v in row.items() if k in table_columns}
                if not filtered:
                    continue
                cols = ", ".join(filtered.keys())
                placeholders = ", ".join(f":{k}" for k in filtered.keys())
                db.execute(text(f"INSERT INTO {table_name} ({cols}) VALUES ({placeholders})"), filtered)

            restored[table_name] = len(rows)

        # Re-enable FK checks.
        if is_sqlite:
            db.execute(text("PRAGMA foreign_keys = ON"))
        else:
            db.execute(text("SET session_replication_role = 'origin'"))
            # Reset sequences for PostgreSQL.
            for table_name in TABLE_ORDER:
                if table_name in existing_tables and restored.get(table_name, 0) > 0:
                    try:
                        db.execute(text(
                            f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                            f"COALESCE((SELECT MAX(id) FROM {table_name}), 0) + 1, false)"
                        ))
                    except Exception:
                        pass  # Table may not have serial id

        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка восстановления: {str(e)}")

    total = sum(restored.values())
    return {
        "detail": f"База восстановлена. Записей: {total}",
        "tables": restored,
    }
