"""Authentication and user schemas."""
from typing import Optional

from pydantic import BaseModel, Field

from .common import ORMModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RoleOut(ORMModel):
    id: int
    code: str
    name: str


class DepartmentBrief(ORMModel):
    id: int
    name: str


class UserOut(ORMModel):
    id: int
    login: str
    full_name: str
    is_active: bool
    role: RoleOut
    department: Optional[DepartmentBrief] = None
    email: Optional[str] = None


class UserCreate(BaseModel):
    login: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=4, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    role_code: str
    department_id: Optional[int] = None
    # Used to link the account to a Keycloak identity (platform SSO).
    email: Optional[str] = None


class UserUpdate(BaseModel):
    login: Optional[str] = Field(default=None, min_length=3, max_length=120)
    full_name: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=4, max_length=255)
    role_code: Optional[str] = None
    department_id: Optional[int] = None
    is_active: Optional[bool] = None
    email: Optional[str] = None


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=4, max_length=255)
