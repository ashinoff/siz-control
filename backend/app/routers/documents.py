"""Нормативные акты — PDF library served from the repo's docs/ folder.

PDFs are placed manually into docs/ at the project root (next to backend/ and
frontend/). The folder is scanned on every request, so newly added files show
up without restarting. The display name is the file name without the «.pdf»
extension, with underscores turned into spaces.
"""
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.responses import FileResponse

from ..dependencies import get_current_user
from ..models.user import User

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Project root = .../siz-control (parents: routers→app→backend→root). docs/
# sits beside backend/ both locally and in the container (copied to /app/docs).
DOCS_DIR = Path(__file__).resolve().parents[3] / "docs"


class DocumentOut(BaseModel):
    filename: str
    title: str


def _display_name(filename: str) -> str:
    stem = filename[:-4] if filename.lower().endswith(".pdf") else filename
    return stem.replace("_", " ")


@router.get("", response_model=List[DocumentOut])
def list_documents(_: User = Depends(get_current_user)):
    """List PDF documents currently in docs/. Empty/missing folder → []."""
    if not DOCS_DIR.is_dir():
        return []
    docs = [
        DocumentOut(filename=p.name, title=_display_name(p.name))
        for p in DOCS_DIR.iterdir()
        if p.is_file() and p.suffix.lower() == ".pdf"
    ]
    docs.sort(key=lambda d: d.title.lower())
    return docs


@router.get("/{filename}")
def get_document(filename: str):
    """Serve a single PDF inline (viewed in the browser, not downloaded).

    Public (no auth) so the file opens in a new browser tab, which cannot send
    the bearer token. Hardened against path traversal: the name must be a plain
    «*.pdf» with no separators or «..», and the resolved path must stay inside
    docs/.
    """
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Недопустимое имя файла")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=404, detail="Документ не найден")

    docs_root = DOCS_DIR.resolve()
    target = (docs_root / filename).resolve()
    try:
        target.relative_to(docs_root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Недопустимый путь")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Документ не найден")

    return FileResponse(
        str(target),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
