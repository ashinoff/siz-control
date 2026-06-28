"""Dashboard statistics endpoint."""
from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import get_current_user, scoped_department_id
from ..enums import (
    DeadlineStatus,
    InventoryStatus,
    ItemType,
    VerificationStatus,
)
from ..models.inventory import InventoryItem
from ..models.organization import Department
from ..models.user import User
from ..schemas.journal import DashboardStats
from ..services import status as status_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardStats)
def dashboard(
    department_id: Optional[int] = None,
    item_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = (
        db.query(InventoryItem)
        .options(joinedload(InventoryItem.catalog_item))
        .filter(InventoryItem.is_active.is_(True))
    )

    scope = scoped_department_id(current)
    if scope is not None:
        query = query.filter(InventoryItem.department_owner_id == scope)
    elif department_id is not None:
        query = query.filter(InventoryItem.department_owner_id == department_id)
    if item_type:
        query = query.filter(InventoryItem.item_type == item_type)

    items = query.all()
    today = date.today()

    stats = {
        "total_items": 0,
        "in_warehouse": 0,
        "issued": 0,
        "in_date": 0,
        "expiring_soon": 0,
        "expired": 0,
        "verification_expiring": 0,
        "verification_expired": 0,
        "alert_items": 0,
        "to_writeoff": 0,
    }
    by_type: dict = defaultdict(int)
    by_department_counts: dict = defaultdict(lambda: defaultdict(int))

    for item in items:
        # Counts are in physical units (a stock row may hold many), so a row of
        # 23 laptops counts as 23, not 1.
        qty = item.quantity or 1
        stats["total_items"] += qty
        by_type[item.item_type] += qty

        if item.status == InventoryStatus.IN_STOCK.value:
            stats["in_warehouse"] += qty
        elif item.status == InventoryStatus.ISSUED.value:
            stats["issued"] += qty
        elif item.status == InventoryStatus.TO_WRITEOFF.value:
            stats["to_writeoff"] += qty

        d_status = status_service.deadline_status(item, today)
        if d_status == DeadlineStatus.IN_DATE:
            stats["in_date"] += qty
        elif d_status == DeadlineStatus.EXPIRING:
            stats["expiring_soon"] += qty
        elif d_status == DeadlineStatus.EXPIRED:
            stats["expired"] += qty

        v_status = status_service.verification_status(item, today)
        if v_status == VerificationStatus.EXPIRING:
            stats["verification_expiring"] += qty
        elif v_status == VerificationStatus.EXPIRED:
            stats["verification_expired"] += qty

        # Count units that have at least one problem.
        has_problem = d_status in (DeadlineStatus.EXPIRING, DeadlineStatus.EXPIRED) or \
                      v_status in (VerificationStatus.EXPIRING, VerificationStatus.EXPIRED)
        if has_problem:
            stats["alert_items"] += qty

        # Per-department breakdown.
        dept_bucket = by_department_counts[item.department_owner_id]
        dept_bucket["total"] += qty
        if item.status == InventoryStatus.IN_STOCK.value:
            dept_bucket["in_warehouse"] = dept_bucket.get("in_warehouse", 0) + qty
        elif item.status == InventoryStatus.ISSUED.value:
            dept_bucket["issued"] = dept_bucket.get("issued", 0) + qty
        if d_status == DeadlineStatus.EXPIRED:
            dept_bucket["expired"] += qty
        if v_status == VerificationStatus.EXPIRED:
            dept_bucket["verification_expired"] += qty

    # Resolve department names for the breakdown.
    dept_names = {
        d.id: d.name for d in db.query(Department).filter(Department.is_active.is_(True)).all()
    }
    by_department = [
        {
            "department_id": dept_id,
            "department": dept_names.get(dept_id, str(dept_id)),
            "total": counts["total"],
            "in_warehouse": counts.get("in_warehouse", 0),
            "issued": counts.get("issued", 0),
            "expired": counts["expired"],
            "verification_expired": counts["verification_expired"],
        }
        for dept_id, counts in sorted(by_department_counts.items())
    ]

    return DashboardStats(by_type=dict(by_type), by_department=by_department, **stats)
