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
    analytics,
    auth,
    backup,
    catalog,
    dashboard,
    dbcheck,
    departments,
    documents,
    employees,
    export,
    import_issued,
    importdata,
    inventory,
    journal,
    norms,
    operations,
    ot,
    platform,
    reports,
    trash,
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

# Origin платформы должен быть разрешён — она кросс-доменно дёргает
# /api/platform/badge с заголовком Authorization.
_cors_origins = settings.cors_origins_list
if "*" not in _cors_origins and settings.PLATFORM_ORIGIN not in _cors_origins:
    _cors_origins = [*_cors_origins, settings.PLATFORM_ORIGIN]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def frame_ancestors_header(request, call_next):
    """Allow only the platform to embed SIZ in an iframe.

    Sets `Content-Security-Policy: frame-ancestors 'self' <platform>` on EVERY
    response — including the SPA's index.html and static assets, which is the
    document actually loaded in the iframe (not just /api). Only the
    frame-ancestors directive is set, so nothing else in the app's loading is
    affected. Any legacy X-Frame-Options is dropped (it can't list a domain and
    frame-ancestors supersedes it). This is headers only — auth is untouched.
    """
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = f"frame-ancestors 'self' {settings.PLATFORM_ORIGIN}"
    if "x-frame-options" in response.headers:
        del response.headers["X-Frame-Options"]
    return response


def _wait_for_db(max_attempts: int = 15, delay_seconds: float = 3.0) -> None:
    """Block until the database accepts a connection, retrying on failure.

    On Amvera the app container can start before the database's DNS name is
    resolvable, so the very first connection raises (e.g. psycopg
    OperationalError "Temporary failure in name resolution"). Rather than rely
    on the container being restarted, we retry the connection a bounded number
    of times and only proceed once the database actually answers. If it never
    does, we re-raise the last error so startup fails loudly and clearly.
    """
    import time

    from sqlalchemy import text
    from sqlalchemy.exc import SQLAlchemyError

    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database connection established (attempt %d/%d).", attempt, max_attempts)
            return
        except (SQLAlchemyError, OSError) as exc:  # connection/DNS/auth errors surface here
            # OSError catches a bare socket.gaierror ("Temporary failure in name
            # resolution") in the rare case the driver hasn't wrapped it in a
            # SQLAlchemyError yet — exactly the Amvera DNS race we retry for.
            last_error = exc
            if attempt < max_attempts:
                logger.warning(
                    "Database not ready (attempt %d/%d): %s. Retrying in %.1fs...",
                    attempt,
                    max_attempts,
                    exc.__class__.__name__,
                    delay_seconds,
                )
                time.sleep(delay_seconds)
            else:
                logger.warning(
                    "Database not ready (attempt %d/%d): %s.",
                    attempt,
                    max_attempts,
                    exc.__class__.__name__,
                )

    logger.error("Database unreachable after %d attempts; aborting startup.", max_attempts)
    raise RuntimeError(
        f"Could not connect to the database after {max_attempts} attempts"
    ) from last_error


@app.on_event("startup")
def on_startup() -> None:
    """Create database tables and seed structural data (roles, departments, admin)."""
    # Wait out the start-up race where the DB's DNS name isn't resolvable yet.
    _wait_for_db()

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

    # Platform SSO: schema_sync only ADDs the column — it can't add the unique
    # index. Ensure it here (only when the flag is on, so OFF changes nothing).
    # Postgres allows multiple NULLs under a unique index → safe on existing rows.
    if settings.PLATFORM_SSO:
        from sqlalchemy import text as _sql_text
        try:
            with engine.begin() as conn:
                conn.execute(_sql_text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_keycloak_id ON users (keycloak_id)"
                ))
        except Exception:
            logger.exception("Could not ensure users.keycloak_id unique index")

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

    # Security posture check: warn (do NOT fail) if running on a real database
    # with the shipped default secrets still in place.
    if not settings.is_sqlite:
        if settings.SECRET_KEY == "CHANGE_ME_IN_PRODUCTION_use_a_long_random_string":
            logger.warning(
                "SECURITY: SECRET_KEY is still the default value — set a strong "
                "SECRET_KEY in the environment for production."
            )
        if settings.ADMIN_PASSWORD == "admin123":
            logger.warning(
                "SECURITY: ADMIN_PASSWORD is still the default 'admin123' — "
                "change it in the environment for production."
            )


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
app.include_router(analytics.router)
app.include_router(journal.router)
app.include_router(export.router)
app.include_router(norms.router)
app.include_router(importdata.router)
app.include_router(import_issued.router)
app.include_router(dbcheck.router)
app.include_router(trash.router)
app.include_router(documents.router)
app.include_router(ot.router)
app.include_router(platform.router)


# Serve frontend static build -----------------------------------------------
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

# index.html / SPA fallback must never be cached, so a new deploy is picked up
# immediately (the stale-index-after-deploy bug). Other loose dist files
# (favicon, svg) revalidate. Hashed /assets are safe to cache forever.
_NO_STORE = "no-cache, no-store, must-revalidate"
_NO_CACHE = "no-cache"
_IMMUTABLE = "public, max-age=31536000, immutable"


class _CachedStaticFiles(StaticFiles):
    """StaticFiles that marks Vite's content-hashed assets as immutable."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = _IMMUTABLE
        return response


if FRONTEND_DIR.is_dir():
    app.mount("/assets", _CachedStaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        """Serve index.html for any non-API route (SPA client-side routing).

        Guards against path traversal: a real file is served only when the
        resolved path stays inside the dist/ directory; otherwise we fall back
        to index.html (never leak files outside the build).

        Caching: index.html (and the SPA fallback) is sent no-store so browsers
        always revalidate after a redeploy; other loose files revalidate too.
        """
        root = FRONTEND_DIR.resolve()
        resolved = (root / full_path).resolve()
        if resolved.is_file() and resolved.is_relative_to(root):
            cache = _NO_STORE if resolved.name == "index.html" else _NO_CACHE
            return FileResponse(str(resolved), headers={"Cache-Control": cache})
        return FileResponse(str(root / "index.html"), headers={"Cache-Control": _NO_STORE})
else:
    @app.get("/", tags=["health"])
    def root() -> dict:
        return {"service": "siz-control", "status": "ok", "docs": "/docs"}
