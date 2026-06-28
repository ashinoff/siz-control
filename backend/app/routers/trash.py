"""Корзина — soft-deleted records: restore or permanently purge (admin only).

Every soft-deletable entity (is_active=False) shows up here. Permanent
deletion is blocked while other rows still reference the record, so history
(journal, assignments, verifications) and foreign keys stay intact; the API
reports exactly what is blocking so the admin can clear it first.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_admin
from ..models.catalog import CatalogItem, Category, Subcategory
from ..models.inventory import InventoryItem
from ..models.journal import Assignment, AuditLog, FileAttachment, Movement, VerificationRecord
from ..models.norms import PositionNorm
from ..models.organization import Department, Employee, Warehouse
from ..models.user import User
from ..services.audit import log_audit

router = APIRouter(prefix="/api/trash", tags=["trash"])


# kind → (model, human label). Order drives display order.
_KINDS = {
    "inventory": (InventoryItem, "Позиции учёта"),
    "catalog": (CatalogItem, "Номенклатура"),
    "category": (Category, "Категории"),
    "subcategory": (Subcategory, "Подкатегории"),
    "employee": (Employee, "Сотрудники"),
    "department": (Department, "Отделы"),
    "warehouse": (Warehouse, "Склады"),
    "user": (User, "Пользователи"),
}
_ORDER = list(_KINDS.keys())


# ── Schemas ────────────────────────────────────────────────────────────────

class TrashRecord(BaseModel):
    kind: str
    id: int
    title: str
    subtitle: Optional[str] = None
    # Non-empty → cannot purge yet; each entry is a "что мешает" description.
    blockers: List[str] = []


class TrashGroup(BaseModel):
    kind: str
    label: str
    count: int
    records: List[TrashRecord]


class TrashResult(BaseModel):
    total: int
    groups: List[TrashGroup]


class TrashAction(BaseModel):
    kind: str
    id: int


# ── Helpers ────────────────────────────────────────────────────────────────

def _title(kind: str, obj) -> tuple[str, Optional[str]]:
    """Human title + optional subtitle for a trashed record."""
    if kind == "inventory":
        name = obj.catalog_item.name if obj.catalog_item else (obj.brand_model or "—")
        return f"#{obj.id} · {name}", (obj.inventory_number or obj.serial_number or None)
    if kind == "employee":
        return obj.full_name, obj.position
    if kind == "user":
        return obj.full_name, obj.login
    # catalog / category / subcategory / department / warehouse all have .name
    return getattr(obj, "name", f"#{obj.id}"), None


def _blockers(db: Session, kind: str, obj) -> List[str]:
    """References that must be cleared before this record can be purged."""
    b: List[str] = []

    def add(label: str, n: int):
        if n:
            b.append(f"{label}: {n}")

    if kind == "inventory":
        add("история выдач", db.query(Assignment).filter(Assignment.inventory_item_id == obj.id).count())
        add("записи поверок", db.query(VerificationRecord).filter(VerificationRecord.inventory_item_id == obj.id).count())
        add("записи журнала", db.query(Movement).filter(Movement.inventory_item_id == obj.id).count())
        add("файлы", db.query(FileAttachment).filter(FileAttachment.inventory_item_id == obj.id).count())
    elif kind == "catalog":
        add("позиции учёта", db.query(InventoryItem).filter(InventoryItem.catalog_item_id == obj.id).count())
        add("нормы ТОН", db.query(PositionNorm).filter(PositionNorm.catalog_item_id == obj.id).count())
    elif kind == "category":
        add("подкатегории", db.query(Subcategory).filter(Subcategory.category_id == obj.id).count())
        add("позиции каталога", db.query(CatalogItem).filter(CatalogItem.category_id == obj.id).count())
    elif kind == "subcategory":
        add("позиции каталога", db.query(CatalogItem).filter(CatalogItem.subcategory_id == obj.id).count())
    elif kind == "employee":
        add("история выдач", db.query(Assignment).filter(Assignment.employee_id == obj.id).count())
        add("числится инвентарь", db.query(InventoryItem).filter(InventoryItem.current_employee_id == obj.id).count())
        add("записи журнала", db.query(Movement).filter(Movement.employee_id == obj.id).count())
    elif kind == "department":
        add("сотрудники", db.query(Employee).filter(Employee.department_id == obj.id).count())
        add("склады", db.query(Warehouse).filter(Warehouse.department_id == obj.id).count())
        add("позиции учёта", db.query(InventoryItem).filter(InventoryItem.department_owner_id == obj.id).count())
        add("пользователи", db.query(User).filter(User.department_id == obj.id).count())
        add("записи журнала", db.query(Movement).filter(or_(
            Movement.department_id == obj.id,
            Movement.from_department_id == obj.id,
            Movement.to_department_id == obj.id,
        )).count())
    elif kind == "warehouse":
        add("позиции учёта", db.query(InventoryItem).filter(InventoryItem.current_warehouse_id == obj.id).count())
        add("записи журнала", db.query(Movement).filter(or_(
            Movement.from_warehouse_id == obj.id,
            Movement.to_warehouse_id == obj.id,
        )).count())
    elif kind == "user":
        add("записи журнала", db.query(Movement).filter(Movement.user_id == obj.id).count())
        add("журнал действий", db.query(AuditLog).filter(AuditLog.user_id == obj.id).count())
        add("выдачи (оформил)", db.query(Assignment).filter(or_(
            Assignment.issued_by_user_id == obj.id,
            Assignment.returned_by_user_id == obj.id,
        )).count())
        add("поверки (оформил)", db.query(VerificationRecord).filter(VerificationRecord.user_id == obj.id).count())

    return b


def _get(db: Session, kind: str, obj_id: int):
    if kind not in _KINDS:
        raise HTTPException(400, f"Неизвестный тип: {kind}")
    model, _ = _KINDS[kind]
    obj = db.query(model).filter(model.id == obj_id).first()
    if not obj:
        raise HTTPException(404, "Запись не найдена")
    return obj


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("", response_model=TrashResult)
def list_trash(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    groups: List[TrashGroup] = []
    total = 0
    for kind in _ORDER:
        model, label = _KINDS[kind]
        rows = db.query(model).filter(model.is_active.is_(False)).all()
        records = []
        for obj in rows:
            title, subtitle = _title(kind, obj)
            records.append(TrashRecord(
                kind=kind,
                id=obj.id,
                title=title,
                subtitle=subtitle,
                blockers=_blockers(db, kind, obj),
            ))
        total += len(records)
        groups.append(TrashGroup(kind=kind, label=label, count=len(records), records=records))
    return TrashResult(total=total, groups=groups)


@router.post("/restore")
def restore(payload: TrashAction, db: Session = Depends(get_db), current: User = Depends(require_admin)):
    obj = _get(db, payload.kind, payload.id)
    if obj.is_active:
        raise HTTPException(400, "Запись уже активна")
    obj.is_active = True
    log_audit(db, user_id=current.id, action="restore", entity_type=payload.kind, entity_id=obj.id)
    db.commit()
    return {"detail": "Запись восстановлена"}


@router.post("/purge")
def purge(payload: TrashAction, db: Session = Depends(get_db), current: User = Depends(require_admin)):
    obj = _get(db, payload.kind, payload.id)
    if obj.is_active:
        raise HTTPException(400, "Сначала удалите запись (мягко), затем её можно стереть навсегда")
    if payload.kind == "user" and obj.id == current.id:
        raise HTTPException(400, "Нельзя удалить навсегда свою учётную запись")
    blockers = _blockers(db, payload.kind, obj)
    if blockers:
        raise HTTPException(
            400,
            "Нельзя удалить навсегда, пока есть связанные записи — " + "; ".join(blockers),
        )
    # Audit BEFORE delete so the entity_id is still meaningful.
    log_audit(db, user_id=current.id, action="purge", entity_type=payload.kind, entity_id=obj.id)
    db.delete(obj)
    db.commit()
    return {"detail": "Запись удалена навсегда"}
