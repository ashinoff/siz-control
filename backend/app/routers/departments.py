"""Departments and warehouses endpoints."""
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, is_privileged
from ..models.organization import Department, Warehouse
from ..models.user import User
from ..schemas.organization import DepartmentOut, WarehouseOut

router = APIRouter(prefix="/api", tags=["organization"])


@router.get("/departments", response_model=List[DepartmentOut])
def list_departments(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(Department).filter(Department.is_active.is_(True))
    # RES users only see their own department.
    if not is_privileged(current) and current.department_id:
        query = query.filter(Department.id == current.department_id)
    return query.order_by(Department.id).all()


@router.get("/warehouses", response_model=List[WarehouseOut])
def list_warehouses(
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(Warehouse).filter(Warehouse.is_active.is_(True))
    if not is_privileged(current) and current.department_id:
        query = query.filter(Warehouse.department_id == current.department_id)
    elif department_id is not None:
        query = query.filter(Warehouse.department_id == department_id)
    return query.order_by(Warehouse.department_id).all()
