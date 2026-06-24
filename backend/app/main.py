"""FastAPI application entrypoint.

Wires together middleware and all routers. On startup it creates the
database schema and seeds structural data (roles, departments, admin).
In production the frontend build (dist/) is served as static files.
"""
import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

from .config import settings
from .database import Base, engine

# Import models so that they are registered on Base.metadata before create_all.
from . import models  # noqa: F401
from .routers import (
    auth,
    backup,
    catalog,
    dashboard,
    dbcheck,
    departments,
    employees,
    export,
    import_issued,
    importdata,
    inventory,
    journal,
    norms,
    operations,
    reports,
    users,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("siz_control")

app = FastAPI(
    title="СИЗ Контроль — API",
    description=(
        "Система учета и контроля средств индивидуальной защиты, "
        "материалов и оборудования."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Create database tables and seed structural data (roles, departments, admin)."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database schema ensured (%s).", "sqlite" if settings.is_sqlite else "postgresql")

    # create_all only creates missing tables; it never adds columns to
    # existing ones. Reconcile model columns against the real tables so a
    # schema that predates a model change (the Amvera case) self-heals.
    from .schema_sync import sync_schema
    try:
        sync_schema(engine)
    except Exception:
        logger.exception("Schema sync failed")

    # Seed roles, departments, warehouses and admin user (idempotent).
    from .database import SessionLocal
    from .seed import seed_structural
    db = SessionLocal()
    try:
        seed_structural(db)
        db.commit()
        logger.info("Structural seed complete (roles, departments, admin).")
    except Exception:
        db.rollback()
        logger.exception("Seed failed")
    finally:
        db.close()


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}


# Register routers ----------------------------------------------------------
app.include_router(auth.router)
app.include_router(backup.router)
app.include_router(users.router)
app.include_router(departments.router)
app.include_router(employees.router)
app.include_router(catalog.router)
app.include_router(inventory.router)
app.include_router(operations.router)
app.include_router(reports.router)
app.include_router(dashboard.router)
app.include_router(journal.router)
app.include_router(export.router)
app.include_router(norms.router)
app.include_router(importdata.router)
app.include_router(import_issued.router)
app.include_router(dbcheck.router)


# Serve frontend static build -----------------------------------------------
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        """Serve index.html for any non-API route (SPA client-side routing)."""
        file = FRONTEND_DIR / full_path
        if file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(FRONTEND_DIR / "index.html"))
else:
    @app.get("/", tags=["health"])
    def root() -> dict:
        return {"service": "siz-control", "status": "ok", "docs": "/docs"}
