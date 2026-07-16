"""Employee registry endpoints."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import (
    assert_department_access,
    get_current_user,
    is_privileged,
    require_privileged,
    scoped_department_id,
)
from ..enums import InventoryStatus
from ..models.inventory import InventoryItem
from ..models.organization import Employee, EmployeeAuthorization
from ..models.user import User
from ..schemas.organization import (
    AuthorizationCreate,
    AuthorizationOut,
    AuthorizationUpdate,
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
)
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
    employees = query.order_by(Employee.full_name).all()

    # Кол-во выданных позиций на каждого сотрудника — одним групповым запросом.
    if employees:
        ids = [e.id for e in employees]
        counts = dict(
            db.query(InventoryItem.current_employee_id, func.count(InventoryItem.id))
            .filter(
                InventoryItem.current_employee_id.in_(ids),
                InventoryItem.status == InventoryStatus.ISSUED.value,
                InventoryItem.is_active.is_(True),
            )
            .group_by(InventoryItem.current_employee_id)
            .all()
        )
        for e in employees:
            e.issued_count = int(counts.get(e.id, 0))
    return employees


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


# ── Допуски / права / проверки (ОТ) ────────────────────────────────────────

def _get_scoped_employee(db: Session, current: User, employee_id: int) -> Employee:
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    assert_department_access(current, emp.department_id)
    return emp


@router.get("/{employee_id}/authorizations", response_model=List[AuthorizationOut])
def list_authorizations(
    employee_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    _get_scoped_employee(db, current, employee_id)
    return (
        db.query(EmployeeAuthorization)
        .filter(EmployeeAuthorization.employee_id == employee_id)
        .order_by(EmployeeAuthorization.id)
        .all()
    )


@router.post("/{employee_id}/authorizations", response_model=AuthorizationOut, status_code=201)
def create_authorization(
    employee_id: int,
    payload: AuthorizationCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    _get_scoped_employee(db, current, employee_id)
    auth = EmployeeAuthorization(employee_id=employee_id, **payload.model_dump())
    db.add(auth)
    db.flush()
    log_audit(db, user_id=current.id, action="create_authorization",
              entity_type="employee_authorization", entity_id=auth.id)
    db.commit()
    db.refresh(auth)
    return auth


@router.put("/{employee_id}/authorizations/{auth_id}", response_model=AuthorizationOut)
def update_authorization(
    employee_id: int,
    auth_id: int,
    payload: AuthorizationUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    _get_scoped_employee(db, current, employee_id)
    auth = (
        db.query(EmployeeAuthorization)
        .filter(EmployeeAuthorization.id == auth_id, EmployeeAuthorization.employee_id == employee_id)
        .first()
    )
    if not auth:
        raise HTTPException(status_code=404, detail="Запись допуска не найдена")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(auth, key, value)
    log_audit(db, user_id=current.id, action="update_authorization",
              entity_type="employee_authorization", entity_id=auth.id)
    db.commit()
    db.refresh(auth)
    return auth


@router.delete("/{employee_id}/authorizations/{auth_id}")
def delete_authorization(
    employee_id: int,
    auth_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    _get_scoped_employee(db, current, employee_id)
    auth = (
        db.query(EmployeeAuthorization)
        .filter(EmployeeAuthorization.id == auth_id, EmployeeAuthorization.employee_id == employee_id)
        .first()
    )
    if not auth:
        raise HTTPException(status_code=404, detail="Запись допуска не найдена")
    db.delete(auth)
    log_audit(db, user_id=current.id, action="delete_authorization",
              entity_type="employee_authorization", entity_id=auth_id)
    db.commit()
    return {"detail": "Запись допуска удалена"}
