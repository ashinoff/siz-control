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
    return user


def get_platform_user(
    request: Request, db: Session = Depends(get_db)
) -> User:
    """Resolve the local user from a Keycloak platform token (feature-flagged).

    Step 1: verify the ``Authorization: Bearer`` token via Keycloak JWKS.
    Step 2: bind it to a local account — by ``keycloak_id`` first, then, on
    first login, one-time by ``email`` (setting ``keycloak_id``). No auto-create.

    Only meaningful when ``PLATFORM_SSO`` is on; it is not yet attached to any
    route (that is a later step), so with the flag OFF nothing changes.
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
    if not keycloak_id:
        logger.info("Platform SSO 401: token has no sub")
        raise unauthorized

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
    return user


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
