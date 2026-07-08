"""FastAPI dependencies: current user, role guards, department scoping."""
import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .enums import PRIVILEGED_ROLES, RoleCode
from .models.user import User
from .security import decode_access_token
from .services import keycloak as keycloak_service

logger = logging.getLogger("siz_control")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


class _RoleView:
    """Minimal stand-in for the ORM Role (id kept so UserOut can serialize)."""

    def __init__(self, code: str):
        self.id = 0
        self.code = code
        self.name = code


class PlatformUser:
    """Current user derived from a Keycloak token (not an ORM row).

    Duck-types exactly what the permission helpers and endpoints read: ``id``,
    ``role`` (with ``.code``), ``department_id``, ``is_active`` etc. Authorization
    (role + department) comes from the token; identity/``id`` from the linked
    local account, so audit logging and ownership keep working.
    """

    def __init__(self, local: User, role_code: Optional[str], department_id: Optional[int]):
        self.id = local.id
        self.login = local.login
        self.full_name = local.full_name
        self.email = local.email
        self.is_active = local.is_active
        self.keycloak_id = local.keycloak_id
        self.department_id = department_id
        self.department = None
        self.role = _RoleView(role_code) if role_code else None


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Учетная запись заблокирована"
        )
    # A SIZ session minted from a platform token (step 4) carries the token's
    # internal role + department, so honour those instead of the DB row's.
    if payload.get("platform"):
        return PlatformUser(user, payload.get("role") or None, payload.get("dept"))
    return user


def get_platform_user(request: Request, db: Session = Depends(get_db)) -> "PlatformUser":
    """Resolve the current user from a Keycloak platform token (feature-flagged).

    Step 1: verify the ``Authorization: Bearer`` token via Keycloak JWKS.
    Step 2: gate access on the single realm role ``siz-user`` (Keycloak carries
    no functional roles) — no role → 403.
    Step 3: bind to a local account — by ``keycloak_id`` first, then, on first
    login, one-time by ``email`` (setting ``keycloak_id``). No auto-create.
    Step 4: take the functional role and department (РЭС) from the LOCAL DB row,
    not the token — Keycloak says «who you are», SIZ says «what you may do».

    Only meaningful when ``PLATFORM_SSO`` is on; with the flag OFF nothing changes.

    Returns a :class:`PlatformUser` ready for the existing permission helpers
    (``role_code`` / ``is_privileged`` / ``scoped_department_id`` / guards).
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить токен платформы",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not settings.PLATFORM_SSO:
        logger.info("Platform SSO 401: feature disabled")
        raise unauthorized

    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        logger.info("Platform SSO 401: missing or malformed Authorization header")
        raise unauthorized
    token = header.split(" ", 1)[1].strip()

    try:
        claims = keycloak_service.verify_token(token)
    except keycloak_service.TokenError as exc:
        # Log the reason only — never the token itself.
        logger.info("Platform SSO 401: %s", exc)
        raise unauthorized

    identity = keycloak_service.identity_from_claims(claims)
    keycloak_id = identity["keycloak_id"]
    email = identity["email"]
    roles = identity["roles"]
    if not keycloak_id:
        logger.info("Platform SSO 401: token has no sub")
        raise unauthorized

    # Доступ к приложению — единственная realm-роль siz-user.
    if not keycloak_service.has_siz_access(roles):
        logger.info("Platform SSO 403: token has no siz-user role")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к приложению СИЗ"
        )

    user = db.query(User).filter(User.keycloak_id == keycloak_id).first()
    if user is None and email:
        # First login: link an existing account by email (one-time).
        user = db.query(User).filter(func.lower(User.email) == email.lower()).first()
        if user is not None and not user.keycloak_id:
            user.keycloak_id = keycloak_id
            db.commit()
            logger.info("Platform SSO: linked local user id=%s to a keycloak identity", user.id)

    if user is None:
        logger.info("Platform SSO 401: no local user matched by keycloak_id or email")
        raise unauthorized
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Учетная запись заблокирована"
        )

    # Функциональная роль и подразделение (РЭС) — из СВОЕЙ БД, а не из токена.
    # email/Keycloak определяют личность, права — из учётки СИЗ.
    internal = user.role.code if user.role else None
    department_id = user.department_id
    return PlatformUser(user, internal, department_id)


def role_code(user: User) -> str:
    return user.role.code if user.role else ""


def is_privileged(user: User) -> bool:
    """Admin / Lab / SUE — full access roles."""
    return role_code(user) in {r.value for r in PRIVILEGED_ROLES}


def require_roles(*roles: RoleCode):
    """Dependency factory enforcing that the user has one of the given roles."""
    allowed = {r.value for r in roles}

    def checker(user: User = Depends(get_current_user)) -> User:
        if role_code(user) not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав для выполнения операции",
            )
        return user

    return checker


def require_admin(user: User = Depends(get_current_user)) -> User:
    if role_code(user) != RoleCode.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Операция доступна только администратору",
        )
    return user


def require_privileged(user: User = Depends(get_current_user)) -> User:
    """Admin / Lab / SUE only."""
    if not is_privileged(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Операция доступна только Лаборатории, Службе учета и Администратору",
        )
    return user


def scoped_department_id(user: User) -> Optional[int]:
    """Return the department id a RES user is restricted to, else None.

    Privileged roles see everything (returns None). RES users are limited to
    their own department.
    """
    if is_privileged(user):
        return None
    return user.department_id


def assert_department_access(user: User, department_id: Optional[int]) -> None:
    """Raise 403 if a RES user tries to touch another department's data."""
    scope = scoped_department_id(user)
    if scope is not None and department_id is not None and department_id != scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к данным другого подразделения",
        )
