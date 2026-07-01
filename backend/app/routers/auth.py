"""Authentication endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, get_platform_user
from ..models.user import User
from ..schemas.user import PasswordChange, Token, UserOut
from ..security import create_access_token, hash_password, verify_password
from ..services.audit import log_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.login == form.username).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Учетная запись заблокирована",
        )
    token = create_access_token(subject=user.id, extra={"role": user.role.code})
    log_audit(
        db,
        user_id=user.id,
        action="login",
        entity_type="user",
        entity_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return Token(access_token=token)


@router.post("/platform", response_model=Token)
def platform_login(
    request: Request,
    current=Depends(get_platform_user),
    db: Session = Depends(get_db),
):
    """Exchange a Keycloak platform token for a native SIZ session (step 4).

    ``get_platform_user`` verifies the Keycloak token and maps roles/РЭС
    (steps 1-3); it also enforces the PLATFORM_SSO flag (401 when OFF) and
    returns 401/403 on invalid/forbidden. The issued SIZ JWT is identical in
    shape to a password login, but carries the token-derived role + department
    (marked ``platform``) so later requests keep that authorization.
    """
    role_c = current.role.code if current.role else ""
    token = create_access_token(
        subject=current.id,
        extra={"platform": True, "role": role_c, "dept": current.department_id},
    )
    log_audit(
        db,
        user_id=current.id,
        action="login_platform",
        entity_type="user",
        entity_id=current.id,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return current


@router.post("/change-password")
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not verify_password(payload.old_password, current.password_hash):
        raise HTTPException(status_code=400, detail="Текущий пароль указан неверно")
    current.password_hash = hash_password(payload.new_password)
    log_audit(db, user_id=current.id, action="change_password", entity_type="user", entity_id=current.id)
    db.commit()
    return {"detail": "Пароль изменен"}
