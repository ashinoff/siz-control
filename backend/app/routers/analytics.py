"""Аналитика наличия — «что у кого есть».

Обратная сторона укомплектованности ТОН (та показывает, чего НЕ хватает из
положенного). Здесь — факт: какие позиции реально имеются/выданы, с фильтрами
(структура, категория/подкатегория, конкретный СИЗ/материал, тип, состояние) и
агрегатами для графиков. Логику ТОН не трогает.
"""
from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import get_current_user, scoped_department_id
from ..enums import InventoryStatus
from ..models.catalog import CatalogItem
from ..models.inventory import InventoryItem
from ..models.user import User
from ..services import status as status_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

TYPE_LABELS = {"ppe": "СИЗ", "equipment": "Оборудование", "material": "Материалы"}


@router.get("/holdings")
def holdings(
    item_type: Optional[str] = None,
    department_id: Optional[int] = None,
    category_id: Optional[int] = None,
    subcategory_id: Optional[int] = None,
    catalog_item_id: Optional[int] = None,
    state: str = Query(default="issued", description="issued | in_stock | all"),
    search: Optional[str] = None,
    limit: int = 1500,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Фактическое наличие с фильтрами + агрегаты для графиков."""
    q = (
        db.query(InventoryItem)
        .options(
            joinedload(InventoryItem.catalog_item).joinedload(CatalogItem.category),
            joinedload(InventoryItem.catalog_item).joinedload(CatalogItem.subcategory),
            joinedload(InventoryItem.department_owner),
            joinedload(InventoryItem.current_employee),
        )
        .filter(InventoryItem.is_active.is_(True))
    )

    # Скоуп по подразделению: РЭС-пользователь видит только своё, привилегированные — всё.
    scope = scoped_department_id(current)
    if scope is not None:
        q = q.filter(InventoryItem.department_owner_id == scope)
    elif department_id is not None:
        q = q.filter(InventoryItem.department_owner_id == department_id)

    if state == "issued":
        q = q.filter(InventoryItem.status == InventoryStatus.ISSUED.value)
    elif state == "in_stock":
        q = q.filter(InventoryItem.status == InventoryStatus.IN_STOCK.value)
    # state == "all" — без фильтра по статусу (но только активные)

    if item_type:
        q = q.filter(InventoryItem.item_type == item_type)
    if catalog_item_id is not None:
        q = q.filter(InventoryItem.catalog_item_id == catalog_item_id)
    if category_id is not None or subcategory_id is not None or search:
        q = q.join(CatalogItem, InventoryItem.catalog_item_id == CatalogItem.id)
        if category_id is not None:
            q = q.filter(CatalogItem.category_id == category_id)
        if subcategory_id is not None:
            q = q.filter(CatalogItem.subcategory_id == subcategory_id)
        if search:
            like = f"%{search}%"
            q = q.filter(
                or_(
                    CatalogItem.name.ilike(like),
                    InventoryItem.inventory_number.ilike(like),
                    InventoryItem.serial_number.ilike(like),
                    InventoryItem.brand_model.ilike(like),
                )
            )

    items = q.all()
    today = date.today()

    by_cat = defaultdict(lambda: [0, 0])   # name -> [count, qty]
    by_dept = defaultdict(lambda: [0, 0])
    by_item = defaultdict(lambda: [0, 0])
    by_type = defaultdict(lambda: [0, 0])
    emp_ids = set()
    total_qty = 0
    rows = []

    for it in items:
        ci = it.catalog_item
        qty = it.quantity or 1
        total_qty += qty
        cat = ci.category.name if ci and ci.category else "Без категории"
        sub = ci.subcategory.name if ci and ci.subcategory else ""
        name = ci.name if ci else "—"
        dept = it.department_owner.name if it.department_owner else "—"
        by_cat[cat][0] += 1; by_cat[cat][1] += qty
        by_dept[dept][0] += 1; by_dept[dept][1] += qty
        by_item[name][0] += 1; by_item[name][1] += qty
        by_type[it.item_type][0] += 1; by_type[it.item_type][1] += qty
        if it.current_employee_id:
            emp_ids.add(it.current_employee_id)
        if len(rows) < limit:
            emp = it.current_employee
            rows.append({
                "employee": emp.full_name if emp else None,
                "position": (emp.position if emp else None) or "",
                "department": dept,
                "name": name,
                "category": cat,
                "subcategory": sub,
                "item_type": it.item_type,
                "type_label": TYPE_LABELS.get(it.item_type, it.item_type),
                "inventory_number": it.inventory_number,
                "serial_number": it.serial_number,
                "brand_model": it.brand_model,
                "quantity": qty,
                "date_issued": it.date_issued.isoformat() if it.date_issued else None,
                "status": it.status,
                "deadline_status": status_service.deadline_status(it, today).value,
            })

    def top(d, n=None):
        arr = sorted(([k, v[0], v[1]] for k, v in d.items()), key=lambda x: -x[1])
        if n:
            arr = arr[:n]
        return [{"name": k, "count": c, "qty": qv} for k, c, qv in arr]

    return {
        "total_items": len(items),
        "total_qty": total_qty,
        "total_employees": len(emp_ids),
        "shown": len(rows),
        "by_category": top(by_cat),
        "by_department": top(by_dept),
        "by_item": top(by_item, 15),
        "by_type": [
            {"key": k, "label": TYPE_LABELS.get(k, k), "count": v[0], "qty": v[1]}
            for k, v in by_type.items()
        ],
        "rows": rows,
    }
