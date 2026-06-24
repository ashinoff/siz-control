"""Database integrity checker — admin only.

Scans the database for inconsistencies and offers fixes.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import require_admin
from ..enums import InventoryStatus
from ..models.catalog import CatalogItem
from ..models.inventory import InventoryItem
from ..models.journal import Assignment
from ..models.organization import Department, Employee, Warehouse
from ..models.user import User
from ..services import status as status_service
from datetime import date

router = APIRouter(prefix="/api/dbcheck", tags=["dbcheck"])


class Issue(BaseModel):
    id: str
    severity: str  # error, warning
    category: str
    message: str
    fix_action: Optional[str] = None
    fix_label: Optional[str] = None


class CheckResult(BaseModel):
    total_issues: int
    errors: int
    warnings: int
    issues: List[Issue]


def _run_checks(db: Session) -> List[Issue]:
    issues: List[Issue] = []
    today = date.today()

    # ── 1. Issued items without employee ─────────────────────────
    orphan_issued = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.is_active.is_(True),
            InventoryItem.status == InventoryStatus.ISSUED.value,
            InventoryItem.current_employee_id.is_(None),
        )
        .all()
    )
    for item in orphan_issued:
        issues.append(Issue(
            id=f"issued_no_employee_{item.id}",
            severity="error",
            category="Выданные без сотрудника",
            message=f"Позиция #{item.id} «{item.inventory_number or '—'}» имеет статус 'Выдано', но сотрудник не указан",
            fix_action=f"return_to_stock:{item.id}",
            fix_label="Вернуть на склад",
        ))

    # ── 2. In-stock items without warehouse ──────────────────────
    stock_no_wh = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.is_active.is_(True),
            InventoryItem.status == InventoryStatus.IN_STOCK.value,
            InventoryItem.current_warehouse_id.is_(None),
        )
        .all()
    )
    for item in stock_no_wh:
        issues.append(Issue(
            id=f"stock_no_warehouse_{item.id}",
            severity="error",
            category="На складе без склада",
            message=f"Позиция #{item.id} «{item.inventory_number or '—'}» на складе, но склад не указан",
            fix_action=f"assign_warehouse:{item.id}",
            fix_label="Назначить склад по умолчанию",
        ))

    # ── 3. Employees without valid department ────────────────────
    all_dept_ids = {d.id for d in db.query(Department).filter(Department.is_active.is_(True)).all()}
    bad_emps = (
        db.query(Employee)
        .filter(Employee.is_active.is_(True))
        .all()
    )
    for emp in bad_emps:
        if emp.department_id not in all_dept_ids:
            issues.append(Issue(
                id=f"emp_bad_dept_{emp.id}",
                severity="error",
                category="Сотрудник без подразделения",
                message=f"Сотрудник «{emp.full_name}» (ID {emp.id}) привязан к несуществующему подразделению {emp.department_id}",
                fix_action=f"deactivate_employee:{emp.id}",
                fix_label="Деактивировать сотрудника",
            ))

    # ── 4. Inventory referencing deleted catalog items ────────────
    active_catalog_ids = {c.id for c in db.query(CatalogItem).filter(CatalogItem.is_active.is_(True)).all()}
    inv_bad_catalog = (
        db.query(InventoryItem)
        .filter(InventoryItem.is_active.is_(True))
        .all()
    )
    for item in inv_bad_catalog:
        if item.catalog_item_id not in active_catalog_ids:
            issues.append(Issue(
                id=f"inv_bad_catalog_{item.id}",
                severity="error",
                category="Удалённая номенклатура",
                message=f"Позиция #{item.id} ссылается на удалённую/несуществующую позицию каталога {item.catalog_item_id}",
                fix_action=f"deactivate_item:{item.id}",
                fix_label="Деактивировать позицию",
            ))

    # ── 5. Open assignments for returned/stock items ─────────────
    open_assignments = (
        db.query(Assignment)
        .filter(Assignment.returned_date.is_(None))
        .all()
    )
    for asn in open_assignments:
        item = db.query(InventoryItem).filter(InventoryItem.id == asn.inventory_item_id).first()
        if item and item.status != InventoryStatus.ISSUED.value:
            issues.append(Issue(
                id=f"open_assignment_{asn.id}",
                severity="warning",
                category="Незакрытая выдача",
                message=f"Выдача #{asn.id} не закрыта (нет даты возврата), но позиция #{item.id} уже не 'Выдано' (статус: {item.status})",
                fix_action=f"close_assignment:{asn.id}",
                fix_label="Закрыть выдачу текущей датой",
            ))

    # ── 6. Missing service dates ─────────────────────────────────
    issued_no_start = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.is_active.is_(True),
            InventoryItem.status == InventoryStatus.ISSUED.value,
            InventoryItem.service_start_date.is_(None),
        )
        .all()
    )
    for item in issued_no_start:
        issues.append(Issue(
            id=f"issued_no_start_{item.id}",
            severity="warning",
            category="Нет даты начала эксплуатации",
            message=f"Позиция #{item.id} «{item.inventory_number or '—'}» выдана, но дата начала эксплуатации не задана",
            fix_action=f"set_start_date:{item.id}",
            fix_label="Установить дату выдачи как начало",
        ))

    # ── 7. Duplicate inventory numbers within same department ────
    from collections import Counter
    active_items = (
        db.query(InventoryItem)
        .filter(InventoryItem.is_active.is_(True), InventoryItem.inventory_number.isnot(None))
        .all()
    )
    inv_nums = Counter((it.inventory_number, it.department_owner_id) for it in active_items)
    for (inv_num, dept_id), count in inv_nums.items():
        if count > 1:
            issues.append(Issue(
                id=f"dup_inv_{inv_num}_{dept_id}",
                severity="warning",
                category="Дубликат инв. номера",
                message=f"Инвентарный номер «{inv_num}» встречается {count} раз в подразделении ID {dept_id}",
            ))

    # ── 8. Items with quantity <= 0 ──────────────────────────────
    bad_qty = (
        db.query(InventoryItem)
        .filter(InventoryItem.is_active.is_(True), InventoryItem.quantity <= 0)
        .all()
    )
    for item in bad_qty:
        issues.append(Issue(
            id=f"bad_qty_{item.id}",
            severity="error",
            category="Нулевое количество",
            message=f"Позиция #{item.id} «{item.inventory_number or '—'}» имеет количество {item.quantity}",
            fix_action=f"set_qty_one:{item.id}",
            fix_label="Установить количество = 1",
        ))

    return issues


@router.get("", response_model=CheckResult)
def check_database(
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    issues = _run_checks(db)
    errors = sum(1 for i in issues if i.severity == "error")
    warnings = sum(1 for i in issues if i.severity == "warning")
    return CheckResult(
        total_issues=len(issues),
        errors=errors,
        warnings=warnings,
        issues=issues,
    )


class FixRequest(BaseModel):
    action: str  # e.g. "return_to_stock:123"


@router.post("/fix")
def fix_issue(
    payload: FixRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    parts = payload.action.split(":", 1)
    action = parts[0]
    item_id = int(parts[1]) if len(parts) > 1 else None

    if action == "return_to_stock" and item_id:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(404, "Позиция не найдена")
        wh = db.query(Warehouse).filter(
            Warehouse.department_id == item.department_owner_id,
            Warehouse.is_active.is_(True),
        ).first()
        item.status = InventoryStatus.IN_STOCK.value
        item.current_employee_id = None
        item.date_issued = None
        item.current_warehouse_id = wh.id if wh else None
        db.commit()
        return {"detail": f"Позиция #{item_id} возвращена на склад"}

    elif action == "assign_warehouse" and item_id:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(404, "Позиция не найдена")
        wh = db.query(Warehouse).filter(
            Warehouse.department_id == item.department_owner_id,
            Warehouse.is_active.is_(True),
        ).first()
        if wh:
            item.current_warehouse_id = wh.id
            db.commit()
            return {"detail": f"Позиции #{item_id} назначен склад «{wh.name}»"}
        raise HTTPException(400, "Нет доступного склада для этого подразделения")

    elif action == "deactivate_employee" and item_id:
        emp = db.query(Employee).filter(Employee.id == item_id).first()
        if not emp:
            raise HTTPException(404, "Сотрудник не найден")
        emp.is_active = False
        db.commit()
        return {"detail": f"Сотрудник «{emp.full_name}» деактивирован"}

    elif action == "deactivate_item" and item_id:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(404, "Позиция не найдена")
        item.is_active = False
        db.commit()
        return {"detail": f"Позиция #{item_id} деактивирована"}

    elif action == "close_assignment" and item_id:
        asn = db.query(Assignment).filter(Assignment.id == item_id).first()
        if not asn:
            raise HTTPException(404, "Выдача не найдена")
        asn.returned_date = date.today()
        asn.return_condition = "good"
        asn.return_comment = "Автоматическое закрытие при проверке базы"
        db.commit()
        return {"detail": f"Выдача #{item_id} закрыта"}

    elif action == "set_start_date" and item_id:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(404, "Позиция не найдена")
        item.service_start_date = item.date_issued or date.today()
        status_service.recalc_service_dates(item)
        db.commit()
        return {"detail": f"Дата начала эксплуатации для #{item_id} установлена"}

    elif action == "set_qty_one" and item_id:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(404, "Позиция не найдена")
        item.quantity = 1
        db.commit()
        return {"detail": f"Количество для #{item_id} установлено = 1"}

    raise HTTPException(400, f"Неизвестное действие: {action}")
