"""Import every model so SQLAlchemy & Alembic see them on the metadata."""
from .base import SoftDeleteMixin, TimestampMixin  # noqa: F401
from .catalog import Category, CatalogItem, Subcategory  # noqa: F401
from .inventory import InventoryItem  # noqa: F401
from .journal import (  # noqa: F401
    Assignment,
    AuditLog,
    FileAttachment,
    Movement,
    VerificationRecord,
)
from .norms import PositionNorm  # noqa: F401
from .organization import Department, Employee, Warehouse  # noqa: F401
from .user import Role, User  # noqa: F401

__all__ = [
    "Role",
    "User",
    "Department",
    "Warehouse",
    "Employee",
    "Category",
    "Subcategory",
    "CatalogItem",
    "InventoryItem",
    "Assignment",
    "Movement",
    "VerificationRecord",
    "AuditLog",
    "FileAttachment",
    "PositionNorm",
]
