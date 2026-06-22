"""Generic Excel export endpoint — accepts arbitrary rows and returns .xlsx."""
import io
from typing import Dict, List

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..dependencies import get_current_user
from ..models.user import User
from ..services.reports import to_xlsx

router = APIRouter(prefix="/api/export", tags=["export"])


class ExportRequest(BaseModel):
    title: str = "Выгрузка"
    filename: str = "export"
    rows: List[Dict[str, object]]


@router.post("/xlsx")
def export_xlsx(payload: ExportRequest, _: User = Depends(get_current_user)):
    content = to_xlsx(payload.rows, payload.title)
    headers = {"Content-Disposition": f'attachment; filename="{payload.filename}.xlsx"'}
    return StreamingResponse(io.BytesIO(content),
                             media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers=headers)
