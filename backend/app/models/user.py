"""User and Role models."""
from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base
from .base import SoftDeleteMixin, TimestampMixin


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # RoleCode
    name = Column(String(120), nullable=False)

    users = relationship("User", back_populates="role")


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    login = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)

    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    # NULL for administrators (they are not bound to a single department).
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)

    # ── Platform SSO (Keycloak) — all nullable so schema_sync can add them
    #    to the existing table on Amvera without touching data.
    # Used to match/bind an account to a Keycloak identity (email one-time link).
    email = Column(String(255), nullable=True, index=True)
    keycloak_id = Column(String(255), unique=True, nullable=True, index=True)

    role = relationship("Role", back_populates="users")
    department = relationship("Department", back_populates="users")
