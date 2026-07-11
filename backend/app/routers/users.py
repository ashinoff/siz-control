"""User management endpoints — administrator only."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_admin
from ..enums import RoleCode
from ..models.user import Role, User
from ..schemas.user import RoleOut, UserCreate, UserOut, UserUpdate
from ..security import hash_password
from ..services.audit import log_audit

router = APIRouter(prefix="/api/users", tags=["users"])


def _get_role(db: Session, code: str) -> Role:
    role = db.query(Role).filter(Role.code == code).first()
    if not role:
        raise HTTPException(status_code=400, detail=f"Роль '{code}' не найдена")
    return role


@router.get("/roles", response_model=List[RoleOut])
def list_roles(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Role).all()


@router.get("", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).order_by(User.full_name).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if db.query(User).filter(User.login == payload.login).first():
        raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")
    role = _get_role(db, payload.role_code)

    # RES users must belong to a department; admins must not be forced to.
    if role.code == RoleCode.RES_USER.value and payload.department_id is None:
        raise HTTPException(status_code=400, detail="Для пользователя РЭС укажите подразделение")

    user = User(
        login=payload.login,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role_id=role.id,
        department_id=payload.department_id,
        email=payload.email or None,
    )
    db.add(user)
    db.flush()
    log_audit(db, user_id=admin.id, action="create_user", entity_type="user", entity_id=user.id,
              new_value={"login": user.login, "role": role.code, "department_id": user.department_id})
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Логин можно менять, но он уникален — проверяем занятость другим пользователем.
    if payload.login is not None and payload.login != user.login:
        taken = db.query(User).filter(User.login == payload.login, User.id != user_id).first()
        if taken:
            raise HTTPException(status_code=400, detail="Логин уже занят")
        user.login = payload.login
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.password:
        user.password_hash = hash_password(payload.password)
    if payload.role_code is not None:
        user.role_id = _get_role(db, payload.role_code).id
    if payload.department_id is not None:
        user.department_id = payload.department_id
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.email is not None:
        user.email = payload.email or None

    log_audit(db, user_id=admin.id, action="update_user", entity_type="user", entity_id=user.id)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/block", response_model=UserOut)
def block_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать самого себя")
    user.is_active = False
    log_audit(db, user_id=admin.id, action="block_user", entity_type="user", entity_id=user.id)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/unblock", response_model=UserOut)
def unblock_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.is_active = True
    log_audit(db, user_id=admin.id, action="unblock_user", entity_type="user", entity_id=user.id)
    db.commit()
    db.refresh(user)
    return user
