"""Inventory endpoints: list/search/filter, detail with history, CRUD."""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import (
    assert_department_access,
    get_current_user,
    require_privileged,
    scoped_department_id,
)
from ..enums import DeadlineStatus, InventoryStatus, OperationType, VerificationStatus
from ..models.catalog import CatalogItem
from ..models.inventory import InventoryItem
from ..models.journal import Assignment, VerificationRecord
from ..models.user import User
from ..schemas.inventory import (
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
)
from ..schemas.journal import AssignmentOut, VerificationRecordOut
from ..services import status as status_service
from ..services.audit import log_movement

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


def serialize(item: InventoryItem, today: Optional[date] = None) -> InventoryItemOut:
    """Build the output schema with computed deadline/verification statuses."""
    out = InventoryItemOut.model_validate(item)
    out.deadline_status = status_service.deadline_status(item, today).value
    out.verification_status = status_service.verification_status(item, today).value
    return out


def _base_query(db: Session, current: User):
    query = db.query(InventoryItem).options(
        joinedload(InventoryItem.catalog_item),
        joinedload(InventoryItem.department_owner),
        joinedload(InventoryItem.current_warehouse),
        joinedload(InventoryItem.current_employee),
    )
    scope = scoped_department_id(current)
    if scope is not None:
        query = query.filter(InventoryItem.department_owner_id == scope)
    return query


@router.get("", response_model=List[InventoryItemOut])
def list_inventory(
    item_type: Optional[str] = None,
    department_id: Optional[int] = None,
    category_id: Optional[int] = None,
    subcategory_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    deadline: Optional[str] = Query(default=None, description="in_date|expiring|expired"),
    verification: Optional[str] = Query(default=None, description="in_date|expiring|expired"),
    search: Optional[str] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = _base_query(db, current)
    if not include_inactive:
        query = query.filter(InventoryItem.is_active.is_(True))
    if item_type:
        query = query.filter(InventoryItem.item_type == item_type)
    if department_id is not None and scoped_department_id(current) is None:
        query = query.filter(InventoryItem.department_owner_id == department_id)
    if employee_id is not None:
        query = query.filter(InventoryItem.current_employee_id == employee_id)
    if status_filter:
        query = query.filter(InventoryItem.status == status_filter)
    if category_id is not None or subcategory_id is not None or search:
        query = query.join(CatalogItem, InventoryItem.catalog_item_id == CatalogItem.id)
        if category_id is not None:
            query = query.filter(CatalogItem.category_id == category_id)
        if subcategory_id is not None:
            query = query.filter(CatalogItem.subcategory_id == subcategory_id)
        if search:
            like = f"%{search}%"
            query = query.filter(
                or_(
                    CatalogItem.name.ilike(like),
                    InventoryItem.inventory_number.ilike(like),
                    InventoryItem.serial_number.ilike(like),
                )
            )

    items = query.order_by(InventoryItem.id.desc()).all()
    today = date.today()
    result = [serialize(i, today) for i in items]

    # Computed-status filters are applied in Python (data volume is small).
    if deadline:
        result = [r for r in result if r.deadline_status == deadline]
    if verification:
        result = [r for r in result if r.verification_status == verification]
    return result


@router.get("/{item_id}", response_model=InventoryItemOut)
def get_inventory_item(item_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = _base_query(db, current).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    assert_department_access(current, item.department_owner_id)
    return serialize(item)


@router.get("/{item_id}/assignments", response_model=List[AssignmentOut])
def item_assignments(item_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    assert_department_access(current, item.department_owner_id)
    return (
        db.query(Assignment)
        .filter(Assignment.inventory_item_id == item_id)
        .order_by(Assignment.issued_date.desc())
        .all()
    )


@router.get("/{item_id}/verifications", response_model=List[VerificationRecordOut])
def item_verifications(item_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    assert_department_access(current, item.department_owner_id)
    return (
        db.query(VerificationRecord)
        .filter(VerificationRecord.inventory_item_id == item_id)
        .order_by(VerificationRecord.verification_date.desc())
        .all()
    )


@router.post("", response_model=InventoryItemOut, status_code=201)
def create_inventory_item(
    payload: InventoryItemCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    catalog = db.query(CatalogItem).filter(CatalogItem.id == payload.catalog_item_id).first()
    if not catalog:
        raise HTTPException(status_code=400, detail="Указанная позиция справочника не найдена")

    data = payload.model_dump()
    if payload.life_unit:
        data["life_unit"] = payload.life_unit.value
    # Inherit verification flag from catalog when not explicitly provided.
    if data.get("requires_verification") is None:
        data["requires_verification"] = catalog.requires_verification

    item = InventoryItem(**data)
    item.item_type = catalog.item_type
    item.status = InventoryStatus.IN_STOCK.value

    # If the item is configured to age while in stock, start the clock now.
    if item.life_starts_in_stock and item.date_received:
        item.service_start_date = item.date_received
        status_service.recalc_service_dates(item)

    db.add(item)
    db.flush()
    log_movement(
        db,
        user_id=current.id,
        operation_type=OperationType.CREATE.value,
        inventory_item_id=item.id,
        department_id=item.department_owner_id,
        object_label=catalog.name,
        new_value={"inventory_number": item.inventory_number, "serial_number": item.serial_number},
        comment="Создание позиции",
    )
    db.commit()
    db.refresh(item)
    return serialize(item)


@router.put("/{item_id}", response_model=InventoryItemOut)
def update_inventory_item(
    item_id: int,
    payload: InventoryItemUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    data = payload.model_dump(exclude_unset=True)
    if "life_unit" in data and data["life_unit"] is not None:
        data["life_unit"] = data["life_unit"].value
    for k, v in data.items():
        setattr(item, k, v)
    # Keep the end date consistent if life/start changed.
    status_service.recalc_service_dates(item)

    log_movement(
        db,
        user_id=current.id,
        operation_type=OperationType.UPDATE.value,
        inventory_item_id=item.id,
        department_id=item.department_owner_id,
        object_label=item.catalog_item.name if item.catalog_item else None,
        comment="Редактирование позиции",
    )
    db.commit()
    db.refresh(item)
    return serialize(item)


@router.delete("/{item_id}")
def delete_inventory_item(
    item_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    item.is_active = False  # soft delete
    log_movement(
        db,
        user_id=current.id,
        operation_type=OperationType.DELETE.value,
        inventory_item_id=item.id,
        department_id=item.department_owner_id,
        object_label=item.catalog_item.name if item.catalog_item else None,
        comment="Удаление (мягкое) позиции",
    )
    db.commit()
    return {"detail": "Позиция деактивирована"}
