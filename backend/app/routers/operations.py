"""Inventory operation endpoints: issue, return, move, verify, writeoff.

All write operations enforce role permissions on the backend and append to
the movement journal. Date logic follows the service rules in services.status.
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import (
    assert_department_access,
    get_current_user,
    require_privileged,
)
from ..enums import (
    InventoryStatus,
    OperationType,
    ReturnCondition,
    VerificationResult,
)
from ..models.inventory import InventoryItem
from ..models.journal import Assignment, VerificationRecord
from ..models.organization import Employee, Warehouse
from ..models.user import User
from ..schemas.operations import (
    IssueRequest,
    MoveRequest,
    ReturnRequest,
    VerifyRequest,
)
from ..services import status as status_service
from ..services.audit import log_movement

router = APIRouter(prefix="/api/operations", tags=["operations"])


def _default_warehouse_id(db: Session, department_id: int) -> Optional[int]:
    wh = (
        db.query(Warehouse)
        .filter(Warehouse.department_id == department_id, Warehouse.is_active.is_(True))
        .order_by(Warehouse.id)
        .first()
    )
    return wh.id if wh else None


@router.post("/issue")
def issue_items(
    payload: IssueRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    employee = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    issued: List[int] = []
    for item_id in payload.inventory_item_ids:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item or not item.is_active:
            raise HTTPException(status_code=404, detail=f"Позиция {item_id} не найдена")
        if item.status == InventoryStatus.ISSUED.value:
            raise HTTPException(status_code=400, detail=f"Позиция {item_id} уже выдана сотруднику")
        if item.status == InventoryStatus.WRITTEN_OFF.value:
            raise HTTPException(status_code=400, detail=f"Позиция {item_id} списана")

        prev_status = item.status
        item.status = InventoryStatus.ISSUED.value
        item.current_employee_id = employee.id
        item.date_issued = payload.issued_date

        # Service-life clock starts on first issue, if not already started.
        if item.service_start_date is None:
            item.service_start_date = payload.issued_date
        status_service.recalc_service_dates(item)

        assignment = Assignment(
            inventory_item_id=item.id,
            employee_id=employee.id,
            issued_date=payload.issued_date,
            issued_by_user_id=current.id,
            issue_comment=payload.comment,
        )
        db.add(assignment)

        log_movement(
            db,
            user_id=current.id,
            operation_type=OperationType.ISSUE.value,
            inventory_item_id=item.id,
            department_id=item.department_owner_id,
            employee_id=employee.id,
            object_label=item.catalog_item.name if item.catalog_item else None,
            old_value={"status": prev_status},
            new_value={"status": item.status, "employee": employee.full_name,
                       "service_start": str(item.service_start_date)},
            comment=payload.comment,
        )
        issued.append(item.id)

    db.commit()
    return {"detail": f"Выдано позиций: {len(issued)}", "items": issued}


@router.post("/return")
def return_items(
    payload: ReturnRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    employee = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    returned: List[int] = []
    for entry in payload.items:
        item = db.query(InventoryItem).filter(InventoryItem.id == entry.inventory_item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Позиция {entry.inventory_item_id} не найдена")
        if item.current_employee_id != employee.id:
            raise HTTPException(
                status_code=400,
                detail=f"Позиция {item.id} не числится за выбранным сотрудником",
            )

        # New status depends on returned condition.
        if entry.condition == ReturnCondition.NEEDS_WRITEOFF:
            new_status = InventoryStatus.TO_WRITEOFF.value
        elif entry.condition == ReturnCondition.LOST:
            new_status = InventoryStatus.WRITTEN_OFF.value
        else:  # good / needs_check
            new_status = InventoryStatus.IN_STOCK.value

        item.status = new_status
        item.current_employee_id = None
        item.date_issued = None
        if new_status == InventoryStatus.IN_STOCK.value and item.current_warehouse_id is None:
            item.current_warehouse_id = _default_warehouse_id(db, item.department_owner_id)

        # Close the open assignment record (history preserved).
        assignment = (
            db.query(Assignment)
            .filter(
                Assignment.inventory_item_id == item.id,
                Assignment.employee_id == employee.id,
                Assignment.returned_date.is_(None),
            )
            .order_by(Assignment.issued_date.desc())
            .first()
        )
        if assignment:
            assignment.returned_date = payload.returned_date
            assignment.returned_by_user_id = current.id
            assignment.return_condition = entry.condition.value
            assignment.return_comment = payload.comment

        log_movement(
            db,
            user_id=current.id,
            operation_type=OperationType.RETURN.value,
            inventory_item_id=item.id,
            department_id=item.department_owner_id,
            employee_id=employee.id,
            object_label=item.catalog_item.name if item.catalog_item else None,
            new_value={"status": new_status, "condition": entry.condition.value},
            comment=payload.comment,
        )
        returned.append(item.id)

    db.commit()
    return {"detail": f"Возвращено позиций: {len(returned)}", "items": returned}


@router.post("/move")
def move_item(
    payload: MoveRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == payload.inventory_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    if item.status == InventoryStatus.ISSUED.value:
        raise HTTPException(
            status_code=400,
            detail="Нельзя перемещать позицию, выданную сотруднику. Сначала оформите возврат.",
        )

    warehouse = db.query(Warehouse).filter(Warehouse.id == payload.to_warehouse_id).first()
    if not warehouse or warehouse.department_id != payload.to_department_id:
        raise HTTPException(status_code=400, detail="Склад не принадлежит выбранному подразделению")

    from_department = item.department_owner_id
    from_warehouse = item.current_warehouse_id

    item.department_owner_id = payload.to_department_id
    item.current_warehouse_id = payload.to_warehouse_id

    log_movement(
        db,
        user_id=current.id,
        operation_type=OperationType.MOVE.value,
        inventory_item_id=item.id,
        department_id=payload.to_department_id,
        from_department_id=from_department,
        to_department_id=payload.to_department_id,
        from_warehouse_id=from_warehouse,
        to_warehouse_id=payload.to_warehouse_id,
        object_label=item.catalog_item.name if item.catalog_item else None,
        comment=payload.comment,
    )
    db.commit()
    return {"detail": "Позиция перемещена"}


@router.post("/verify")
def verify_item(
    payload: VerifyRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == payload.inventory_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    # Determine the next verification date: explicit, else from catalog period.
    next_date = payload.next_verification_date
    if next_date is None and item.catalog_item:
        next_date = status_service.add_period(
            payload.verification_date,
            item.catalog_item.verification_period_value,
            item.catalog_item.verification_period_unit,
        )

    item.requires_verification = True
    item.last_verification_date = payload.verification_date
    item.next_verification_date = next_date

    record = VerificationRecord(
        inventory_item_id=item.id,
        verification_date=payload.verification_date,
        next_verification_date=next_date,
        result=payload.result.value,
        protocol_number=payload.protocol_number,
        comment=payload.comment,
        user_id=current.id,
    )
    db.add(record)

    # A failed verification flags the item for write-off.
    if payload.result == VerificationResult.FAILED:
        item.status = InventoryStatus.TO_WRITEOFF.value

    log_movement(
        db,
        user_id=current.id,
        operation_type=OperationType.VERIFY.value,
        inventory_item_id=item.id,
        department_id=item.department_owner_id,
        object_label=item.catalog_item.name if item.catalog_item else None,
        new_value={"result": payload.result.value, "next_verification": str(next_date),
                   "protocol": payload.protocol_number},
        comment=payload.comment,
    )
    db.commit()
    return {"detail": "Поверка зарегистрирована", "next_verification_date": str(next_date) if next_date else None}


@router.post("/writeoff/{item_id}")
def writeoff_item(
    item_id: int,
    comment: Optional[str] = None,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    if item.status == InventoryStatus.ISSUED.value:
        raise HTTPException(status_code=400, detail="Нельзя списать выданную позицию. Сначала возврат.")
    item.status = InventoryStatus.WRITTEN_OFF.value
    item.current_employee_id = None
    log_movement(
        db,
        user_id=current.id,
        operation_type=OperationType.WRITEOFF.value,
        inventory_item_id=item.id,
        department_id=item.department_owner_id,
        object_label=item.catalog_item.name if item.catalog_item else None,
        comment=comment,
    )
    db.commit()
    return {"detail": "Позиция списана"}
