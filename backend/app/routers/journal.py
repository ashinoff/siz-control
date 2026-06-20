"""Journal endpoints: movement log and audit (security) log."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
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
from ..schemas.journal import AuditLogOut, MovementOut

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
