"""ТОН — position norms and compliance endpoints."""
from collections import defaultdict
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..dependencies import get_current_user, require_privileged, scoped_department_id
from ..enums import InventoryStatus
from ..models.catalog import CatalogItem
from ..models.inventory import InventoryItem
from ..models.norms import PositionNorm
from ..models.organization import Department, Employee
from ..models.user import User
from ..schemas.catalog import CatalogItemOut

router = APIRouter(prefix="/api/norms", tags=["norms"])

POSITIONS = ["Мастер", "Электромонтер", "Начальник", "Инженер"]


# ── Schemas ──────────────────────────────────────────────────────────────

class NormItemOut(BaseModel):
    id: int
    catalog_item_id: int
    catalog_item: Optional[CatalogItemOut] = None
    quantity: int

    class Config:
        from_attributes = True


class NormItemIn(BaseModel):
    catalog_item_id: int
    quantity: int = 1


class SetNormRequest(BaseModel):
    items: List[NormItemIn]


class EmployeeCompliance(BaseModel):
    employee_id: int
    full_name: str
    position: str
    department: str
    department_id: int
    required: int
    issued: int
    missing: int
    expired: int
    compliance_pct: float
    details: List[dict]


class DepartmentCompliance(BaseModel):
    department_id: int
    department: str
    employees_total: int
    fully_equipped: int
    partially_equipped: int
    not_equipped: int
    compliance_pct: float


# ── Positions ────────────────────────────────────────────────────────────

@router.get("/positions")
def list_positions(_: User = Depends(get_current_user)):
    return POSITIONS


# ── CRUD for norms ───────────────────────────────────────────────────────

@router.get("/{position}", response_model=List[NormItemOut])
def get_norm(position: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    norms = (
        db.query(PositionNorm)
        .options(joinedload(PositionNorm.catalog_item))
        .filter(PositionNorm.position == position)
        .order_by(PositionNorm.id)
        .all()
    )
    return norms


@router.put("/{position}")
def set_norm(
    position: str,
    payload: SetNormRequest,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    # Delete old norms for this position.
    db.query(PositionNorm).filter(PositionNorm.position == position).delete()
    # Insert new ones.
    for item in payload.items:
        cat = db.query(CatalogItem).filter(CatalogItem.id == item.catalog_item_id).first()
        if not cat:
            raise HTTPException(status_code=400, detail=f"Позиция каталога {item.catalog_item_id} не найдена")
        db.add(PositionNorm(position=position, catalog_item_id=item.catalog_item_id, quantity=item.quantity))
    db.commit()
    return {"detail": f"Норматив для «{position}» сохранён ({len(payload.items)} поз.)"}


@router.post("/{position}/add")
def add_norm_item(
    position: str,
    item: NormItemIn,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    existing = (
        db.query(PositionNorm)
        .filter(PositionNorm.position == position, PositionNorm.catalog_item_id == item.catalog_item_id)
        .first()
    )
    if existing:
        existing.quantity = item.quantity
    else:
        db.add(PositionNorm(position=position, catalog_item_id=item.catalog_item_id, quantity=item.quantity))
    db.commit()
    return {"detail": "Добавлено"}


@router.delete("/{position}/{norm_id}")
def remove_norm_item(
    position: str,
    norm_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    norm = db.query(PositionNorm).filter(PositionNorm.id == norm_id, PositionNorm.position == position).first()
    if not norm:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    db.delete(norm)
    db.commit()
    return {"detail": "Удалено"}


# ── Compliance ───────────────────────────────────────────────────────────

def _calc_compliance(db: Session, scope_department_id: Optional[int] = None):
    """Calculate per-employee compliance against position norms."""
    from ..services import status as status_service
    from ..enums import DeadlineStatus
    from datetime import date

    today = date.today()

    # Load all norms grouped by position.
    all_norms = db.query(PositionNorm).options(joinedload(PositionNorm.catalog_item)).all()
    norms_by_position: Dict[str, List[PositionNorm]] = defaultdict(list)
    for n in all_norms:
        norms_by_position[n.position].append(n)

    # Load employees.
    emp_query = (
        db.query(Employee)
        .options(joinedload(Employee.department))
        .filter(Employee.is_active.is_(True), Employee.status == "working")
    )
    if scope_department_id is not None:
        emp_query = emp_query.filter(Employee.department_id == scope_department_id)
    employees = emp_query.all()

    # Load all issued items grouped by employee.
    issued_items = (
        db.query(InventoryItem)
        .options(joinedload(InventoryItem.catalog_item))
        .filter(
            InventoryItem.is_active.is_(True),
            InventoryItem.status == InventoryStatus.ISSUED.value,
            InventoryItem.current_employee_id.isnot(None),
        )
        .all()
    )
    items_by_employee: Dict[int, List[InventoryItem]] = defaultdict(list)
    for item in issued_items:
        items_by_employee[item.current_employee_id].append(item)

    results = []
    for emp in employees:
        position_norms = norms_by_position.get(emp.position, [])
        if not position_norms:
            continue  # No norms defined for this position

        emp_items = items_by_employee.get(emp.id, [])

        # Count issued items by catalog_item_id.
        issued_by_catalog: Dict[int, int] = defaultdict(int)
        expired_catalog_ids = set()
        for item in emp_items:
            issued_by_catalog[item.catalog_item_id] += item.quantity
            d = status_service.deadline_status(item, today)
            if d == DeadlineStatus.EXPIRED:
                expired_catalog_ids.add(item.catalog_item_id)

        details = []
        total_required = 0
        total_issued = 0
        total_expired = 0

        for norm in position_norms:
            req = norm.quantity
            have = min(issued_by_catalog.get(norm.catalog_item_id, 0), req)
            is_expired = norm.catalog_item_id in expired_catalog_ids
            total_required += req
            total_issued += have
            if is_expired:
                total_expired += 1

            details.append({
                "catalog_item_id": norm.catalog_item_id,
                "name": norm.catalog_item.name if norm.catalog_item else "",
                "required": req,
                "issued": have,
                "missing": max(0, req - have),
                "expired": is_expired,
            })

        missing = total_required - total_issued
        pct = round(total_issued / total_required * 100, 1) if total_required > 0 else 100.0

        results.append(EmployeeCompliance(
            employee_id=emp.id,
            full_name=emp.full_name,
            position=emp.position or "",
            department=emp.department.name if emp.department else "",
            department_id=emp.department_id,
            required=total_required,
            issued=total_issued,
            missing=missing,
            expired=total_expired,
            compliance_pct=pct,
            details=details,
        ))

    return results


@router.get("/compliance/employees", response_model=List[EmployeeCompliance])
def compliance_employees(
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    scope = scoped_department_id(current)
    if scope is None and department_id is not None:
        scope = department_id
    return _calc_compliance(db, scope)


@router.get("/compliance/departments", response_model=List[DepartmentCompliance])
def compliance_departments(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    scope = scoped_department_id(current)
    employees = _calc_compliance(db, scope)

    by_dept: Dict[int, dict] = {}
    for emp in employees:
        if emp.department_id not in by_dept:
            by_dept[emp.department_id] = {
                "department_id": emp.department_id,
                "department": emp.department,
                "total": 0,
                "full": 0,
                "partial": 0,
                "none": 0,
                "pct_sum": 0.0,
            }
        d = by_dept[emp.department_id]
        d["total"] += 1
        d["pct_sum"] += emp.compliance_pct
        if emp.compliance_pct >= 100:
            d["full"] += 1
        elif emp.compliance_pct > 0:
            d["partial"] += 1
        else:
            d["none"] += 1

    return [
        DepartmentCompliance(
            department_id=d["department_id"],
            department=d["department"],
            employees_total=d["total"],
            fully_equipped=d["full"],
            partially_equipped=d["partial"],
            not_equipped=d["none"],
            compliance_pct=round(d["pct_sum"] / d["total"], 1) if d["total"] else 100.0,
        )
        for d in sorted(by_dept.values(), key=lambda x: x["department"])
    ]


@router.get("/compliance/summary")
def compliance_summary(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    scope = scoped_department_id(current)
    employees = _calc_compliance(db, scope)
    if not employees:
        return {"total_employees": 0, "fully_equipped": 0, "compliance_pct": 100.0}
    fully = sum(1 for e in employees if e.compliance_pct >= 100)
    avg_pct = round(sum(e.compliance_pct for e in employees) / len(employees), 1)
    return {
        "total_employees": len(employees),
        "fully_equipped": fully,
        "partially_equipped": sum(1 for e in employees if 0 < e.compliance_pct < 100),
        "not_equipped": sum(1 for e in employees if e.compliance_pct == 0),
        "compliance_pct": avg_pct,
    }
