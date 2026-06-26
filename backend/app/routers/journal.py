"""Journal endpoints: movement log and audit (security) log."""
from datetime import datetime, time, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import (
    get_current_user,
    is_privileged,
    require_admin,
    scoped_department_id,
)
from ..models.journal import AuditLog, Movement
from ..models.user import User
from ..schemas.journal import AuditLogOut, MovementOut, MovementPurgeRequest

router = APIRouter(prefix="/api/journal", tags=["journal"])


@router.get("/movements", response_model=List[MovementOut])
def list_movements(
    department_id: Optional[int] = None,
    operation_type: Optional[str] = None,
    inventory_item_id: Optional[int] = None,
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(Movement).options(joinedload(Movement.user))

    scope = scoped_department_id(current)
    if scope is not None:
        # RES users see only movements of their own department.
        query = query.filter(Movement.department_id == scope)
    elif department_id is not None:
        query = query.filter(Movement.department_id == department_id)

    if operation_type:
        query = query.filter(Movement.operation_type == operation_type)
    if inventory_item_id is not None:
        query = query.filter(Movement.inventory_item_id == inventory_item_id)

    return query.order_by(Movement.created_at.desc()).limit(limit).all()


@router.delete("/movements/{movement_id}")
def delete_movement(
    movement_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Delete a single journal record (admin only)."""
    movement = db.query(Movement).filter(Movement.id == movement_id).first()
    if not movement:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    db.delete(movement)
    db.commit()
    return {"detail": "Запись журнала удалена"}


@router.post("/movements/purge")
def purge_movements(
    payload: MovementPurgeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Bulk-delete journal records by period (admin only).

    Requires at least one date bound so the whole journal can't be wiped by an
    empty request. ``date_from``/``date_to`` are inclusive calendar days
    (interpreted in UTC, matching how created_at is stored). Optional
    operation_type / department_id narrow the deletion further.
    """
    if payload.date_from is None and payload.date_to is None:
        raise HTTPException(status_code=400, detail="Укажите период: дату «с» и/или «по»")
    if payload.date_from and payload.date_to and payload.date_from > payload.date_to:
        raise HTTPException(status_code=400, detail="Дата «с» позже даты «по»")

    query = db.query(Movement)
    if payload.date_from is not None:
        start = datetime.combine(payload.date_from, time.min, tzinfo=timezone.utc)
        query = query.filter(Movement.created_at >= start)
    if payload.date_to is not None:
        end = datetime.combine(payload.date_to + timedelta(days=1), time.min, tzinfo=timezone.utc)
        query = query.filter(Movement.created_at < end)
    if payload.operation_type:
        query = query.filter(Movement.operation_type == payload.operation_type)
    if payload.department_id is not None:
        query = query.filter(Movement.department_id == payload.department_id)

    deleted = query.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@router.get("/audit", response_model=List[AuditLogOut])
def list_audit(
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return (
        db.query(AuditLog)
        .options(joinedload(AuditLog.user))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
