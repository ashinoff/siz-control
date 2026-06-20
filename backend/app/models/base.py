"""Shared column mixins for models."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer


def _utcnow():
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )


class SoftDeleteMixin:
    """Soft delete flag — records are deactivated, never hard-deleted."""
    is_active = Column(Boolean, default=True, nullable=False)
