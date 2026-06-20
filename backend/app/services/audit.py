"""Helpers for writing to the movement journal and the audit log."""
import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.journal import AuditLog, Movement


def _dump(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def log_movement(
    db: Session,
    *,
    user_id: Optional[int],
    operation_type: str,
    inventory_item_id: Optional[int] = None,
    department_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    from_department_id: Optional[int] = None,
    to_department_id: Optional[int] = None,
    from_warehouse_id: Optional[int] = None,
    to_warehouse_id: Optional[int] = None,
    object_label: Optional[str] = None,
    old_value: Any = None,
    new_value: Any = None,
    comment: Optional[str] = None,
) -> Movement:
    movement = Movement(
        user_id=user_id,
        operation_type=operation_type,
        inventory_item_id=inventory_item_id,
        department_id=department_id,
        employee_id=employee_id,
        from_department_id=from_department_id,
        to_department_id=to_department_id,
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=to_warehouse_id,
        object_label=object_label,
        old_value=_dump(old_value),
        new_value=_dump(new_value),
        comment=comment,
    )
    db.add(movement)
    return movement


def log_audit(
    db: Session,
    *,
    user_id: Optional[int],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    old_value: Any = None,
    new_value: Any = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    record = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=_dump(old_value),
        new_value=_dump(new_value),
        ip_address=ip_address,
    )
    db.add(record)
    return record
