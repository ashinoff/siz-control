"""Position norms — required catalog items per job position (ТОН)."""
from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base
from .base import TimestampMixin


class PositionNorm(Base, TimestampMixin):
    __tablename__ = "position_norms"

    id = Column(Integer, primary_key=True)
    position = Column(String(255), nullable=False, index=True)
    catalog_item_id = Column(Integer, ForeignKey("catalog_items.id"), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)

    # Interchangeability group. Rows within the same position sharing the same
    # non-null ``alt_group`` are alternatives ("или") for ONE requirement: the
    # requirement is satisfied by issuing ANY of the member catalog items.
    # NULL means a standalone requirement (legacy behaviour — satisfied only by
    # that exact catalog item). The group id equals the id of the anchor row.
    alt_group = Column(Integer, nullable=True, index=True)

    catalog_item = relationship("CatalogItem")
