"""Employee registry endpoints."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import (
    assert_department_access,
    get_current_user,
    is_privileged,
    require_privileged,
    scoped_department_id,
)
from ..models.organization import Employee
from ..models.user import User
from ..schemas.organization import EmployeeCreate, EmployeeOut, EmployeeUpdate
from ..services.audit import log_audit

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("", response_model=List[EmployeeOut])
def list_employees(
    department_id: Optional[int] = None,
    search: Optional[str] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(Employee)
    if not include_inactive:
        query = query.filter(Employee.is_active.is_(True))

    scope = scoped_department_id(current)
    if scope is not None:
        query = query.filter(Employee.department_id == scope)
    elif department_id is not None:
        query = query.filter(Employee.department_id == department_id)

    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(Employee.full_name.ilike(like), Employee.personnel_number.ilike(like))
        )
    return query.order_by(Employee.full_name).all()


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    assert_department_access(current, emp.department_id)
    return emp


@router.post("", response_model=EmployeeOut, status_code=201)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    emp = Employee(**payload.model_dump())
    emp.status = payload.status.value
    db.add(emp)
    db.flush()
    log_audit(db, user_id=current.id, action="create_employee", entity_type="employee",
              entity_id=emp.id, new_value={"full_name": emp.full_name})
    db.commit()
    db.refresh(emp)
    return emp


@router.put("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] is not None:
        data["status"] = data["status"].value
    for key, value in data.items():
        setattr(emp, key, value)
    log_audit(db, user_id=current.id, action="update_employee", entity_type="employee", entity_id=emp.id)
    db.commit()
    db.refresh(emp)
    return emp


@router.delete("/{employee_id}")
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    # Soft delete.
    emp.is_active = False
    log_audit(db, user_id=current.id, action="delete_employee", entity_type="employee", entity_id=emp.id)
    db.commit()
    return {"detail": "Сотрудник деактивирован"}
