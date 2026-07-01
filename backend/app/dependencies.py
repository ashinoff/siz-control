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
from .models.organization import Department
from .models.user import User
from .security import decode_access_token
from .services import keycloak as keycloak_service

logger = logging.getLogger("siz_control")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# res_user without a resolvable department is scoped to this non-existent id so
# it safely sees NO data (rather than falling through to unscoped "all access").
_NO_DEPARTMENT_SENTINEL = -1

# Optional overrides if a Keycloak `res` code differs from SIZ Department.code.
# Single place to reconcile the taxonomies if/when their formats diverge.
RES_CODE_ALIASES: dict = {}


class _RoleView:
    """Minimal stand-in for the ORM Role (only .code / .name are read)."""

    def __init__(self, code: str):
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


def _department_id_for_res(db: Session, res_code: str) -> Optional[int]:
    """Match a Keycloak `res` code to a SIZ department (by ``Department.code``)."""
    code = RES_CODE_ALIASES.get(res_code, res_code)
    dept = (
        db.query(Department)
        .filter(func.lower(Department.code) == code.lower(), Department.is_active.is_(True))
        .first()
    )
    return dept.id if dept else None


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


def get_platform_user(request: Request, db: Session = Depends(get_db)) -> "PlatformUser":
    """Resolve the current user from a Keycloak platform token (feature-flagged).

    Step 1: verify the ``Authorization: Bearer`` token via Keycloak JWKS.
    Step 2: bind it to a local account — by ``keycloak_id`` first, then, on
    first login, one-time by ``email`` (setting ``keycloak_id``). No auto-create.
    Step 3: map roles + department from the token to internal SIZ authorization:
      - no siz- role at all → 403 (authenticated, but not permitted for SIZ);
      - highest functional role wins (admin > sue > lab > res_user); ``siz-user``
        alone grants app access but no function (→ no data, scoped to nothing);
      - res_user is scoped to the department resolved from the ``res`` claim; a
        missing/unknown ``res`` denies data (never falls through to "all").

    Only meaningful when ``PLATFORM_SSO`` is on; it is not yet attached to any
    route (that is a later step), so with the flag OFF nothing changes.

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
    res_code = identity["res"]
    if not keycloak_id:
        logger.info("Platform SSO 401: token has no sub")
        raise unauthorized

    # Step 3: authenticated but no SIZ role of any kind → 403 (not 401).
    if not keycloak_service.has_siz_access(roles):
        logger.info("Platform SSO 403: token has no siz- role")
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

    # Step 3: internal role + department from the token.
    internal = keycloak_service.internal_role(roles)  # None ⇒ only siz-user
    department_id: Optional[int] = None
    if internal == RoleCode.RES_USER.value:
        if not res_code:
            logger.info(
                "Platform SSO: res_user without `res` claim — denying data (user id=%s)", user.id
            )
            department_id = _NO_DEPARTMENT_SENTINEL
        else:
            resolved = _department_id_for_res(db, res_code)
            if resolved is None:
                logger.info(
                    "Platform SSO: res code %r not matched to a department — denying data (user id=%s)",
                    res_code, user.id,
                )
                department_id = _NO_DEPARTMENT_SENTINEL
            else:
                department_id = resolved
    elif internal is None:
        # Only siz-user: app access, no function → scope to nothing (no data).
        department_id = _NO_DEPARTMENT_SENTINEL
    # admin / sue / lab are privileged → department_id stays None (see all).

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
