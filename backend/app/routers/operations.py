"""Inventory operation endpoints: issue, return, move, verify, writeoff.

All write operations enforce role permissions on the backend and append to
the movement journal. Date logic follows the service rules in services.status.
"""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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
    current: User = Depends(get_current_user),
):
    employee = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    # RES users may only issue to staff of their own department.
    assert_department_access(current, employee.department_id)

    issued: List[int] = []
    for entry in payload.items:
        item = db.query(InventoryItem).filter(InventoryItem.id == entry.inventory_item_id).first()
        if not item or not item.is_active:
            raise HTTPException(status_code=404, detail=f"Позиция {entry.inventory_item_id} не найдена")
        # RES users may only issue stock owned by their own department.
        assert_department_access(current, item.department_owner_id)
        if item.status == InventoryStatus.ISSUED.value:
            raise HTTPException(status_code=400, detail=f"Позиция {entry.inventory_item_id} уже выдана сотруднику")
        if item.status == InventoryStatus.WRITTEN_OFF.value:
            raise HTTPException(status_code=400, detail=f"Позиция {entry.inventory_item_id} списана")
        if entry.quantity > item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Запрошено {entry.quantity} шт., на складе только {item.quantity} шт. (позиция {item.id})",
            )

        issue_qty = entry.quantity

        if issue_qty < item.quantity:
            # Split: reduce the stock item, create a new issued item.
            item.quantity -= issue_qty

            issued_item = InventoryItem(
                catalog_item_id=item.catalog_item_id,
                item_type=item.item_type,
                inventory_number=item.inventory_number,
                serial_number=item.serial_number,
                quantity=issue_qty,
                department_owner_id=item.department_owner_id,
                current_warehouse_id=None,
                current_employee_id=employee.id,
                status=InventoryStatus.ISSUED.value,
                date_received=item.date_received,
                date_issued=payload.issued_date,
                service_start_date=payload.issued_date,
                life_value=item.life_value,
                life_unit=item.life_unit,
                life_starts_in_stock=item.life_starts_in_stock,
                requires_verification=item.requires_verification,
                last_verification_date=item.last_verification_date,
                next_verification_date=item.next_verification_date,
                comment=item.comment,
            )
            status_service.recalc_service_dates(issued_item)
            db.add(issued_item)
            db.flush()  # get issued_item.id
            target = issued_item
        else:
            # Issue the entire item.
            item.status = InventoryStatus.ISSUED.value
            item.current_employee_id = employee.id
            item.current_warehouse_id = None
            item.date_issued = payload.issued_date
            if item.service_start_date is None:
                item.service_start_date = payload.issued_date
            status_service.recalc_service_dates(item)
            target = item

        assignment = Assignment(
            inventory_item_id=target.id,
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
            inventory_item_id=target.id,
            department_id=target.department_owner_id,
            employee_id=employee.id,
            object_label=target.catalog_item.name if target.catalog_item else None,
            old_value={"status": InventoryStatus.IN_STOCK.value, "quantity": issue_qty},
            new_value={"status": target.status, "employee": employee.full_name,
                       "service_start": str(target.service_start_date)},
            comment=payload.comment,
        )
        issued.append(target.id)

    db.commit()
    return {"detail": f"Выдано позиций: {len(issued)}", "items": issued}


@router.post("/return")
def return_items(
    payload: ReturnRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    employee = db.query(Employee).filter(Employee.id == payload.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    # RES users may only return items for staff of their own department.
    assert_department_access(current, employee.department_id)

    returned: List[int] = []
    for entry in payload.items:
        item = db.query(InventoryItem).filter(InventoryItem.id == entry.inventory_item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Позиция {entry.inventory_item_id} не найдена")
        # RES users may only touch stock owned by their own department.
        assert_department_access(current, item.department_owner_id)
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

    move_qty = payload.quantity if payload.quantity is not None else item.quantity
    if move_qty > item.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Запрошено {move_qty} шт., на складе только {item.quantity} шт.",
        )

    from_department = item.department_owner_id
    from_warehouse = item.current_warehouse_id

    if move_qty < item.quantity:
        # Partial move: reduce original, create new item at destination.
        item.quantity -= move_qty
        moved_item = InventoryItem(
            catalog_item_id=item.catalog_item_id,
            item_type=item.item_type,
            inventory_number=item.inventory_number,
            serial_number=item.serial_number,
            quantity=move_qty,
            department_owner_id=payload.to_department_id,
            current_warehouse_id=payload.to_warehouse_id,
            status=InventoryStatus.IN_STOCK.value,
            date_received=item.date_received,
            life_value=item.life_value,
            life_unit=item.life_unit,
            life_starts_in_stock=item.life_starts_in_stock,
            requires_verification=item.requires_verification,
            last_verification_date=item.last_verification_date,
            next_verification_date=item.next_verification_date,
            comment=item.comment,
        )
        if item.life_starts_in_stock and item.service_start_date:
            moved_item.service_start_date = item.service_start_date
            moved_item.service_end_date = item.service_end_date
        db.add(moved_item)
        db.flush()
        target = moved_item
    else:
        # Full move.
        item.department_owner_id = payload.to_department_id
        item.current_warehouse_id = payload.to_warehouse_id
        target = item

    log_movement(
        db,
        user_id=current.id,
        operation_type=OperationType.MOVE.value,
        inventory_item_id=target.id,
        department_id=payload.to_department_id,
        from_department_id=from_department,
        to_department_id=payload.to_department_id,
        from_warehouse_id=from_warehouse,
        to_warehouse_id=payload.to_warehouse_id,
        object_label=target.catalog_item.name if target.catalog_item else None,
        old_value={"quantity": move_qty},
        comment=payload.comment,
    )
    db.commit()
    return {"detail": f"Перемещено {move_qty} шт."}


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

    # A failed verification condemns the item: move it to the write-off queue
    # and detach it from its warehouse shelf (and from an employee, closing the
    # open assignment) so it leaves circulation.
    if payload.result == VerificationResult.FAILED:
        item.status = InventoryStatus.TO_WRITEOFF.value
        item.current_warehouse_id = None
        if item.current_employee_id is not None:
            open_asn = (
                db.query(Assignment)
                .filter(
                    Assignment.inventory_item_id == item.id,
                    Assignment.returned_date.is_(None),
                )
                .order_by(Assignment.issued_date.desc())
                .first()
            )
            if open_asn:
                open_asn.returned_date = payload.verification_date
                open_asn.returned_by_user_id = current.id
                open_asn.return_condition = ReturnCondition.NEEDS_WRITEOFF.value
                open_asn.return_comment = "Поверка не пройдена — в списание"
            item.current_employee_id = None
            item.date_issued = None

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


class CondemnRequest(BaseModel):
    inventory_item_id: int
    comment: Optional[str] = None


@router.post("/condemn")
def condemn_item(
    payload: CondemnRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Mark an in-stock item as unfit and move it to the write-off queue.

    The item is detached from its warehouse shelf and its status becomes
    "К списанию", so it shows up in the «Списание» section. Items currently
    issued to an employee must go through the return flow (condition «Требует
    списания») instead — that path already detaches and condemns them.
    """
    item = db.query(InventoryItem).filter(InventoryItem.id == payload.inventory_item_id).first()
    if not item or not item.is_active:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    assert_department_access(current, item.department_owner_id)

    if item.status == InventoryStatus.ISSUED.value:
        raise HTTPException(
            status_code=400,
            detail="Позиция выдана сотруднику. Оформите возврат с состоянием «Требует списания».",
        )
    if item.status == InventoryStatus.WRITTEN_OFF.value:
        raise HTTPException(status_code=400, detail="Позиция уже списана.")

    item.status = InventoryStatus.TO_WRITEOFF.value
    item.current_warehouse_id = None

    log_movement(
        db,
        user_id=current.id,
        operation_type=OperationType.UPDATE.value,
        inventory_item_id=item.id,
        department_id=item.department_owner_id,
        object_label=item.catalog_item.name if item.catalog_item else None,
        new_value={"status": item.status},
        comment=payload.comment or "Отмечено негодным — в списание",
    )
    db.commit()
    return {"detail": "Позиция отправлена в раздел «Списание»"}


@router.post("/restore/{item_id}")
def restore_item(
    item_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    """Undo a condemnation: return a to-be-written-off item back to stock."""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    if item.status != InventoryStatus.TO_WRITEOFF.value:
        raise HTTPException(
            status_code=400,
            detail="Вернуть на склад можно только позицию со статусом «К списанию».",
        )
    item.status = InventoryStatus.IN_STOCK.value
    item.current_employee_id = None
    item.current_warehouse_id = _default_warehouse_id(db, item.department_owner_id)

    log_movement(
        db,
        user_id=current.id,
        operation_type=OperationType.UPDATE.value,
        inventory_item_id=item.id,
        department_id=item.department_owner_id,
        object_label=item.catalog_item.name if item.catalog_item else None,
        new_value={"status": item.status},
        comment="Возврат из списания на склад",
    )
    db.commit()
    return {"detail": "Позиция возвращена на склад"}


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
