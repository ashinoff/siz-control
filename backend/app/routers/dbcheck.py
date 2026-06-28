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
from ..models.catalog import CatalogItem, Category, Subcategory
from ..models.inventory import InventoryItem
from ..models.journal import Assignment, VerificationRecord
from ..models.norms import PositionNorm
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
    # Optional secondary/fallback action (e.g. deactivate when the preferred
    # fix is to restore something instead).
    alt_action: Optional[str] = None
    alt_label: Optional[str] = None
    # Optional in-app link to fix the issue by editing a card.
    link: Optional[str] = None
    link_label: Optional[str] = None


# InventoryItem.item_type → list route used for "go fix the card" links.
_INV_ROUTE = {"ppe": "/ppe", "material": "/materials", "equipment": "/equipment"}


def _inv_card_link(item: InventoryItem) -> str:
    """Deep link that opens this inventory item's edit card."""
    return f"{_INV_ROUTE.get(item.item_type, '/ppe')}?edit={item.id}"


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
            link=_inv_card_link(item),
            link_label="Открыть карточку",
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
            link=_inv_card_link(item),
            link_label="Открыть карточку",
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
                message=(
                    f"Сотрудник «{emp.full_name}» (ID {emp.id}) привязан к несуществующему "
                    f"подразделению {emp.department_id} — назначьте действующее подразделение"
                ),
                link=f"/employees?edit={emp.id}",
                link_label="Перейти и исправить",
                alt_action=f"deactivate_employee:{emp.id}",
                alt_label="Деактивировать сотрудника",
            ))

    # ── 4. Inventory referencing deleted catalog items ────────────
    # Two sub-cases: the catalog row still exists but is soft-deleted (the
    # common case — fixable by restoring it, which heals every item pointing
    # to it at once), or the row is truly gone (reassign in the item's card,
    # or deactivate as a last resort).
    all_catalog_ids = {c.id for c in db.query(CatalogItem).all()}
    active_catalog_ids = {c.id for c in db.query(CatalogItem).filter(CatalogItem.is_active.is_(True)).all()}
    inv_bad_catalog = (
        db.query(InventoryItem)
        .filter(InventoryItem.is_active.is_(True))
        .all()
    )
    for item in inv_bad_catalog:
        if item.catalog_item_id in active_catalog_ids:
            continue
        if item.catalog_item_id in all_catalog_ids:
            # Catalog row exists but deactivated → restore it.
            issues.append(Issue(
                id=f"inv_bad_catalog_{item.id}",
                severity="error",
                category="Удалённая номенклатура",
                message=f"Позиция #{item.id} ссылается на деактивированную позицию каталога {item.catalog_item_id}",
                fix_action=f"reactivate_catalog:{item.catalog_item_id}",
                fix_label="Восстановить позицию каталога",
                alt_action=f"deactivate_item:{item.id}",
                alt_label="Деактивировать позицию",
                link="/catalog",
                link_label="В номенклатуру",
            ))
        else:
            # Catalog row is gone for good → reassign in the card or deactivate.
            route = _INV_ROUTE.get(item.item_type, "/ppe")
            issues.append(Issue(
                id=f"inv_bad_catalog_{item.id}",
                severity="error",
                category="Удалённая номенклатура",
                message=(
                    f"Позиция #{item.id} ссылается на несуществующую позицию каталога "
                    f"{item.catalog_item_id} — переназначьте её на действующую позицию справочника"
                ),
                link=f"{route}?edit={item.id}",
                link_label="Перейти и исправить",
                alt_action=f"deactivate_item:{item.id}",
                alt_label="Деактивировать позицию",
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
                link=_inv_card_link(item),
                link_label="Открыть карточку",
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
            link=_inv_card_link(item),
            link_label="Открыть карточку",
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
            link=_inv_card_link(item),
            link_label="Открыть карточку",
        ))

    # ── 9. Orphaned assignments (referenced item no longer exists) ─
    all_item_ids = {r[0] for r in db.query(InventoryItem.id).all()}
    for asn in db.query(Assignment).all():
        if asn.inventory_item_id not in all_item_ids:
            issues.append(Issue(
                id=f"orphan_assignment_{asn.id}",
                severity="warning",
                category="Осиротевшая выдача",
                message=f"Запись выдачи #{asn.id} ссылается на несуществующую позицию учёта {asn.inventory_item_id}",
                fix_action=f"delete_assignment:{asn.id}",
                fix_label="Удалить запись выдачи",
            ))

    # ── 10. Orphaned verification records ────────────────────────
    for vr in db.query(VerificationRecord).all():
        if vr.inventory_item_id not in all_item_ids:
            issues.append(Issue(
                id=f"orphan_verif_{vr.id}",
                severity="warning",
                category="Осиротевшая поверка",
                message=f"Запись поверки #{vr.id} ссылается на несуществующую позицию учёта {vr.inventory_item_id}",
                fix_action=f"delete_verification:{vr.id}",
                fix_label="Удалить запись поверки",
            ))

    # ── 11. Norms referencing deleted catalog ────────────────────
    # active_catalog_ids / all_catalog_ids were computed in check 4.
    for norm in db.query(PositionNorm).all():
        if norm.catalog_item_id in active_catalog_ids:
            continue
        if norm.catalog_item_id in all_catalog_ids:
            issues.append(Issue(
                id=f"norm_bad_catalog_{norm.id}",
                severity="warning",
                category="Норма на удалённую номенклатуру",
                message=f"Норма ТОН #{norm.id} ({norm.position}) ссылается на деактивированную позицию каталога {norm.catalog_item_id}",
                fix_action=f"reactivate_catalog:{norm.catalog_item_id}",
                fix_label="Восстановить позицию каталога",
                alt_action=f"delete_norm:{norm.id}",
                alt_label="Удалить из норматива",
                link="/norms",
                link_label="К нормам",
            ))
        else:
            issues.append(Issue(
                id=f"norm_bad_catalog_{norm.id}",
                severity="error",
                category="Норма на удалённую номенклатуру",
                message=f"Норма ТОН #{norm.id} ({norm.position}) ссылается на несуществующую позицию каталога {norm.catalog_item_id}",
                fix_action=f"delete_norm:{norm.id}",
                fix_label="Удалить из норматива",
                link="/norms",
                link_label="К нормам",
            ))

    # ── 12. Subcategories whose category no longer exists ────────
    all_category_ids = {r[0] for r in db.query(Category.id).all()}
    for sub in db.query(Subcategory).filter(Subcategory.is_active.is_(True)).all():
        if sub.category_id not in all_category_ids:
            issues.append(Issue(
                id=f"sub_bad_category_{sub.id}",
                severity="error",
                category="Подкатегория без категории",
                message=f"Подкатегория «{sub.name}» (ID {sub.id}) привязана к несуществующей категории {sub.category_id}",
                fix_action=f"deactivate_subcategory:{sub.id}",
                fix_label="Деактивировать подкатегорию",
                link="/catalog",
                link_label="К справочникам",
            ))

    # ── 13. Warehouses whose department no longer exists ─────────
    all_dept_ids_any = {r[0] for r in db.query(Department.id).all()}
    for wh in db.query(Warehouse).filter(Warehouse.is_active.is_(True)).all():
        if wh.department_id not in all_dept_ids_any:
            issues.append(Issue(
                id=f"wh_bad_dept_{wh.id}",
                severity="error",
                category="Склад без подразделения",
                message=f"Склад «{wh.name}» (ID {wh.id}) привязан к несуществующему подразделению {wh.department_id}",
                fix_action=f"deactivate_warehouse:{wh.id}",
                fix_label="Деактивировать склад",
            ))

    # ── 14. Junk in the trash bin that can be purged ─────────────
    trash_total = sum(
        db.query(model).filter(model.is_active.is_(False)).count()
        for model in (InventoryItem, CatalogItem, Category, Subcategory, Employee, Department, Warehouse, User)
    )
    if trash_total:
        issues.append(Issue(
            id="trash_pending",
            severity="warning",
            category="Корзина",
            message=f"В корзине {trash_total} удалённых записей — просмотрите и при необходимости удалите навсегда",
            link="/trash",
            link_label="В корзину",
        ))

    # ── 15. Written-off items still active (not moved to trash) ──
    wo_active = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.is_active.is_(True),
            InventoryItem.status == InventoryStatus.WRITTEN_OFF.value,
        )
        .count()
    )
    if wo_active:
        issues.append(Issue(
            id="written_off_active",
            severity="warning",
            category="Списанные не в корзине",
            message=f"Списанных позиций в реестрах: {wo_active} — их можно перенести в «Удалённое»",
            fix_action="archive_written_off:0",
            fix_label="Перенести в корзину",
            link="/trash",
            link_label="В корзину",
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

    elif action == "reactivate_catalog" and item_id:
        # item_id here is the catalog item id carried by the action string.
        cat = db.query(CatalogItem).filter(CatalogItem.id == item_id).first()
        if not cat:
            raise HTTPException(404, "Позиция каталога не найдена")
        cat.is_active = True
        db.commit()
        return {"detail": f"Позиция каталога «{cat.name}» восстановлена"}

    elif action == "delete_assignment" and item_id:
        asn = db.query(Assignment).filter(Assignment.id == item_id).first()
        if not asn:
            raise HTTPException(404, "Запись выдачи не найдена")
        db.delete(asn)
        db.commit()
        return {"detail": f"Запись выдачи #{item_id} удалена"}

    elif action == "delete_verification" and item_id:
        vr = db.query(VerificationRecord).filter(VerificationRecord.id == item_id).first()
        if not vr:
            raise HTTPException(404, "Запись поверки не найдена")
        db.delete(vr)
        db.commit()
        return {"detail": f"Запись поверки #{item_id} удалена"}

    elif action == "delete_norm" and item_id:
        norm = db.query(PositionNorm).filter(PositionNorm.id == item_id).first()
        if not norm:
            raise HTTPException(404, "Позиция норматива не найдена")
        db.delete(norm)
        db.commit()
        return {"detail": f"Позиция норматива #{item_id} удалена"}

    elif action == "deactivate_subcategory" and item_id:
        sub = db.query(Subcategory).filter(Subcategory.id == item_id).first()
        if not sub:
            raise HTTPException(404, "Подкатегория не найдена")
        sub.is_active = False
        db.commit()
        return {"detail": f"Подкатегория «{sub.name}» деактивирована"}

    elif action == "deactivate_warehouse" and item_id:
        wh = db.query(Warehouse).filter(Warehouse.id == item_id).first()
        if not wh:
            raise HTTPException(404, "Склад не найден")
        wh.is_active = False
        db.commit()
        return {"detail": f"Склад «{wh.name}» деактивирован"}

    elif action == "archive_written_off":
        items = (
            db.query(InventoryItem)
            .filter(
                InventoryItem.is_active.is_(True),
                InventoryItem.status == InventoryStatus.WRITTEN_OFF.value,
            )
            .all()
        )
        for it in items:
            it.is_active = False
        db.commit()
        return {"detail": f"Перенесено в корзину: {len(items)}"}

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
