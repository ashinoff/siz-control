"""FastAPI application entrypoint.

Wires together middleware and all routers. On startup it ensures the
database schema exists. For local development with SQLite this means the
app is fully runnable with zero configuration (``uvicorn app.main:app``).
In production with PostgreSQL the same ``create_all`` is idempotent; Alembic
migrations are also provided for controlled schema evolution.
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine

# Import models so that they are registered on Base.metadata before create_all.
from . import models  # noqa: F401
from .routers import (
    auth,
    catalog,
    dashboard,
    departments,
    employees,
    export,
    inventory,
    journal,
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
    """Create database tables if they do not exist yet."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database schema ensured (%s).", "sqlite" if settings.is_sqlite else "postgresql")


@app.get("/", tags=["health"])
def root() -> dict:
    return {"service": "siz-control", "status": "ok", "docs": "/docs"}


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}


# Register routers ----------------------------------------------------------
app.include_router(auth.router)
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
