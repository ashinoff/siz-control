"""Охрана труда (ОТ) — deadline control & report.

Deliberately separate from the СИЗ deadline/verification logic (status.py):
its own warning threshold (7 days), its own date sources (electrical-safety
re-exam date + each authorization's expiry), its own endpoints and pages.
"""
from datetime import date
from typing import Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from ..models.organization import Employee

# Порог предупреждения для ОТ — СВОЙ, не путать с СИЗ (30 дней).
OT_WARNING_DAYS = 7

OT_STATUS_LABELS = {
    "expired": "Просрочено",
    "expiring": "Подходит срок",
    "in_date": "В норме",
    "none": "—",
}


def ot_status(target: Optional[date], today: date) -> str:
    """expired (< сегодня) / expiring (сегодня..+7) / in_date / none (нет даты)."""
    if target is None:
        return "none"
    delta = (target - today).days
    if delta < 0:
        return "expired"
    if delta <= OT_WARNING_DAYS:
        return "expiring"
    return "in_date"


def _employee_query(db: Session, scope_department_id: Optional[int]):
    query = (
        db.query(Employee)
        .options(joinedload(Employee.department), joinedload(Employee.authorizations))
        .filter(Employee.is_active.is_(True))
    )
    if scope_department_id is not None:
        query = query.filter(Employee.department_id == scope_department_id)
    return query


def _entry(kind: str, emp: Employee, dept: str, title: str, d: Optional[date], today: date, status: str) -> Dict:
    return {
        "kind": kind,  # "eb" | "auth"
        "employee_id": emp.id,
        "full_name": emp.full_name,
        "department": dept,
        "position": emp.position or "",
        "title": title,
        "date": d.isoformat() if d else None,
        "days_left": (d - today).days if d else None,
        "status": status,
    }


def deadlines(
    db: Session,
    *,
    scope_department_id: Optional[int] = None,
    department_id: Optional[int] = None,
) -> Dict:
    """Entries (EB re-exam + authorizations) that are expiring or expired."""
    today = date.today()
    query = _employee_query(db, scope_department_id)
    if department_id is not None and scope_department_id is None:
        query = query.filter(Employee.department_id == department_id)

    items: List[Dict] = []
    for emp in query.order_by(Employee.full_name).all():
        dept = emp.department.name if emp.department else ""

        st = ot_status(emp.eb_next_exam_date, today)
        if st in ("expired", "expiring"):
            title = "Проверка знаний по ЭБ"
            if emp.eb_group:
                title += f" (гр. {emp.eb_group})"
            items.append(_entry("eb", emp, dept, title, emp.eb_next_exam_date, today, st))

        for a in emp.authorizations:
            st = ot_status(a.expiry_date, today)
            if st in ("expired", "expiring"):
                items.append(_entry("auth", emp, dept, a.name, a.expiry_date, today, st))

    # Most overdue first.
    items.sort(key=lambda x: x["days_left"] if x["days_left"] is not None else 0)
    counts = {
        "expiring": sum(1 for i in items if i["status"] == "expiring"),
        "expired": sum(1 for i in items if i["status"] == "expired"),
    }
    return {"warning_days": OT_WARNING_DAYS, "counts": counts, "items": items}


def report_rows(
    db: Session,
    *,
    scope_department_id: Optional[int] = None,
    department_id: Optional[int] = None,
) -> List[Dict[str, object]]:
    """One row per employee: EB data + status + a summary of authorizations."""
    today = date.today()
    query = _employee_query(db, scope_department_id)
    if department_id is not None and scope_department_id is None:
        query = query.filter(Employee.department_id == department_id)

    rows: List[Dict[str, object]] = []
    for emp in query.order_by(Employee.full_name).all():
        auths = "; ".join(
            (f"{a.name} — до {a.expiry_date.isoformat()}" if a.expiry_date else a.name)
            for a in emp.authorizations
        )
        rows.append({
            "ФИО": emp.full_name,
            "Подразделение": emp.department.name if emp.department else "",
            "Должность": emp.position or "",
            "Группа ЭБ": emp.eb_group or "",
            "Дата экзамена ЭБ": emp.eb_exam_date.isoformat() if emp.eb_exam_date else "",
            "Следующий экзамен ЭБ": emp.eb_next_exam_date.isoformat() if emp.eb_next_exam_date else "",
            "Статус (ЭБ)": OT_STATUS_LABELS[ot_status(emp.eb_next_exam_date, today)],
            "Допуски / права": auths,
        })
    return rows
