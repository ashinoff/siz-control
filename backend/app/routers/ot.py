"""Охрана труда (ОТ) — deadline control & report endpoints.

Separate from the СИЗ deadline/report endpoints by design (own prefix /api/ot,
own service with a 7-day warning threshold).
"""
import io
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, scoped_department_id
from ..models.user import User
from ..services import ot as ot_service
from ..services import reports as report_service

router = APIRouter(prefix="/api/ot", tags=["ot"])

_REPORT_NAME = "Охрана труда — сводка"


@router.get("/deadlines")
def ot_deadlines(
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    return ot_service.deadlines(
        db,
        scope_department_id=scoped_department_id(current),
        department_id=department_id,
    )


@router.get("/report")
def ot_report(
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = ot_service.report_rows(
        db,
        scope_department_id=scoped_department_id(current),
        department_id=department_id,
    )
    return {"name": _REPORT_NAME, "rows": rows}


@router.get("/report/export")
def ot_report_export(
    fmt: str = Query(default="xlsx", pattern="^(xlsx|csv)$"),
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = ot_service.report_rows(
        db,
        scope_department_id=scoped_department_id(current),
        department_id=department_id,
    )
    if fmt == "csv":
        content = report_service.to_csv(rows)
        media = "text/csv"
        ext = "csv"
    else:
        content = report_service.to_xlsx(rows, _REPORT_NAME)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"

    headers = {"Content-Disposition": f'attachment; filename="ot_report.{ext}"'}
    return StreamingResponse(io.BytesIO(content), media_type=media, headers=headers)
