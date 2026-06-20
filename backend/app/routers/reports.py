"""Report endpoints returning JSON rows or Excel/CSV downloads."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, scoped_department_id
from ..models.user import User
from ..services import reports as report_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/types")
def report_types(_: User = Depends(get_current_user)):
    return [{"key": k, "name": v} for k, v in report_service.REPORTS.items()]


@router.get("/{report}")
def get_report(
    report: str,
    department_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if report not in report_service.REPORTS:
        raise HTTPException(status_code=404, detail="Неизвестный отчет")
    rows = report_service.build_report(
        db,
        report,
        scope_department_id=scoped_department_id(current),
        department_id=department_id,
        employee_id=employee_id,
    )
    return {"report": report, "name": report_service.REPORTS[report], "rows": rows}


@router.get("/{report}/export")
def export_report(
    report: str,
    fmt: str = Query(default="xlsx", pattern="^(xlsx|csv)$"),
    department_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if report not in report_service.REPORTS:
        raise HTTPException(status_code=404, detail="Неизвестный отчет")
    name = report_service.REPORTS[report]
    rows = report_service.build_report(
        db,
        report,
        scope_department_id=scoped_department_id(current),
        department_id=department_id,
        employee_id=employee_id,
    )

    if fmt == "csv":
        content = report_service.to_csv(rows)
        media = "text/csv"
        ext = "csv"
    else:
        content = report_service.to_xlsx(rows, name)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ext = "xlsx"

    filename = f"{report}.{ext}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    import io

    return StreamingResponse(io.BytesIO(content), media_type=media, headers=headers)
