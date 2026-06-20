"""Journal / history models.

* Assignment          — issue/return history (who held an item and when).
* Movement            — append-only journal of all inventory operations.
* VerificationRecord  — history of verifications (поверка).
* AuditLog            — append-only journal of user/security actions.
* FileAttachment      — optional attached files / photos.
"""
from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ..database import Base
from .base import _utcnow


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)

    issued_date = Column(Date, nullable=False)
    issued_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    issue_comment = Column(Text, nullable=True)

    returned_date = Column(Date, nullable=True)
    returned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    return_condition = Column(String(30), nullable=True)  # ReturnCondition
    return_comment = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    inventory_item = relationship("InventoryItem", back_populates="assignments")
    employee = relationship("Employee")


class Movement(Base):
    """Immutable journal of inventory operations (Журнал движения)."""
    __tablename__ = "movements"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    operation_type = Column(String(20), nullable=False, index=True)  # OperationType

    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    from_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    to_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    from_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True)
    to_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True)

    object_label = Column(String(255), nullable=True)  # human readable object name
    old_value = Column(Text, nullable=True)            # JSON string
    new_value = Column(Text, nullable=True)            # JSON string
    comment = Column(Text, nullable=True)

    user = relationship("User")
    inventory_item = relationship("InventoryItem")
    department = relationship("Department", foreign_keys=[department_id])
    employee = relationship("Employee")


class VerificationRecord(Base):
    __tablename__ = "verification_records"

    id = Column(Integer, primary_key=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)

    verification_date = Column(Date, nullable=False)
    next_verification_date = Column(Date, nullable=True)
    result = Column(String(20), nullable=False)  # VerificationResult
    protocol_number = Column(String(120), nullable=True)
    comment = Column(Text, nullable=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    inventory_item = relationship("InventoryItem", back_populates="verification_records")
    files = relationship("FileAttachment", back_populates="verification_record")


class AuditLog(Base):
    """Immutable journal of user/security actions (Журнал действий)."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(120), nullable=False)
    entity_type = Column(String(80), nullable=True)
    entity_id = Column(Integer, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)

    user = relationship("User")


class FileAttachment(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    content_type = Column(String(120), nullable=True)
    size = Column(Integer, nullable=True)

    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True)
    verification_record_id = Column(Integer, ForeignKey("verification_records.id"), nullable=True)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    inventory_item = relationship("InventoryItem", back_populates="files")
    verification_record = relationship("VerificationRecord", back_populates="files")
