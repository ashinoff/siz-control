"""Platform badge — notification count for the desktop platform icon.

Read-only and feature-flagged behind PLATFORM_SSO. The platform calls this
cross-origin with the user's Keycloak token to show a badge on the SIZ icon.
Token verification mirrors /auth/platform, but no session is created and the
account is only read (никакой записи keycloak_id / привязки здесь нет).
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..database import get_db
from ..dependencies import scoped_department_id
from ..enums import DeadlineStatus, VerificationStatus
from ..models.inventory import InventoryItem
from ..models.user import User
from ..services import keycloak as keycloak_service
from ..services import ot as ot_service
from ..services import status as status_service

router = APIRouter(prefix="/api/platform", tags=["platform"])


def _siz_alert_count(db: Session, scope: Optional[int]) -> int:
    """Позиции СИЗ, требующие действия — та же логика, что `alert_items` в
    /api/dashboard: срок службы ИЛИ поверка «истекает/просрочен». Считаем в
    физических единицах (quantity), с тем же scope по подразделению."""
    query = (
        db.query(InventoryItem)
        .options(joinedload(InventoryItem.catalog_item))
        .filter(InventoryItem.is_active.is_(True))
    )
    if scope is not None:
        query = query.filter(InventoryItem.department_owner_id == scope)

    today = date.today()
    total = 0
    for item in query.all():
        d_status = status_service.deadline_status(item, today)
        v_status = status_service.verification_status(item, today)
        if d_status in (DeadlineStatus.EXPIRING, DeadlineStatus.EXPIRED) or \
           v_status in (VerificationStatus.EXPIRING, VerificationStatus.EXPIRED):
            total += item.quantity or 1
    return total


@router.get("/badge")
def platform_badge(request: Request, db: Session = Depends(get_db)) -> dict:
    """Счётчик уведомлений для бейджа приложения на платформе.

    Токен Keycloak проверяется как в /auth/platform, но БЕЗ создания сессии.
    PLATFORM_SSO выключен / нет токена / невалиден → 401. Пользователь не найден
    или неактивен → {"count": 0}. Возвращает {"count": N} — сумму того, что
    требует действия для роли/подразделения пользователя (просроч./истекающие
    сроки СИЗ + сроки ОТ). Только быстрые агрегаты, без выгрузки списков.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить токен платформы",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not settings.PLATFORM_SSO:
        raise unauthorized

    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        raise unauthorized
    token = header.split(" ", 1)[1].strip()

    try:
        claims = keycloak_service.verify_token(token)
    except keycloak_service.TokenError:
        raise unauthorized

    identity = keycloak_service.identity_from_claims(claims)
    keycloak_id = identity["keycloak_id"]
    email = identity["email"]
    roles = identity["roles"]
    if not keycloak_id or not keycloak_service.has_siz_access(roles):
        return {"count": 0}

    # Тот же поиск учётки, что при платформенном входе (keycloak_id → email),
    # но только чтение: без привязки keycloak_id и без создания сессии.
    user = db.query(User).filter(User.keycloak_id == keycloak_id).first()
    if user is None and email:
        user = db.query(User).filter(func.lower(User.email) == email.lower()).first()
    if user is None or not user.is_active:
        return {"count": 0}

    scope = scoped_department_id(user)  # None у admin/lab/sue, dept_id у res_user
    total = _siz_alert_count(db, scope)
    ot = ot_service.deadlines(db, scope_department_id=scope)
    counts = ot.get("counts", {})
    total += counts.get("expiring", 0) + counts.get("expired", 0)
    return {"count": total}
