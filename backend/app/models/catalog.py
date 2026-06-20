"""Catalog (reference data) models.

A single CatalogItem table holds both the PPE (СИЗ) reference book and the
materials/equipment reference book, distinguished by ``item_type``. Categories
and subcategories are user-editable through the API.
"""
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base
from ..enums import ItemType, LifeUnit
from .base import SoftDeleteMixin, TimestampMixin


class Category(Base, SoftDeleteMixin):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    # Which kind of item this category applies to (ppe / material / equipment).
    item_type = Column(String(20), nullable=False, index=True)

    subcategories = relationship(
        "Subcategory", back_populates="category", cascade="all, delete-orphan"
    )
    catalog_items = relationship("CatalogItem", back_populates="category")


class Subcategory(Base, SoftDeleteMixin):
    __tablename__ = "subcategories"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)

    category = relationship("Category", back_populates="subcategories")
    catalog_items = relationship("CatalogItem", back_populates="subcategory")


class CatalogItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "catalog_items"

    id = Column(Integer, primary_key=True)
    item_type = Column(String(20), nullable=False, index=True)  # ItemType
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    subcategory_id = Column(Integer, ForeignKey("subcategories.id"), nullable=True)

    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)

    # Normative service life
    life_value = Column(Integer, nullable=True)
    life_unit = Column(String(10), default=LifeUnit.MONTHS.value, nullable=True)

    # Verification / inspection (поверка / проверка)
    requires_verification = Column(Boolean, default=False, nullable=False)
    verification_period_value = Column(Integer, nullable=True)
    verification_period_unit = Column(String(10), nullable=True)

    category = relationship("Category", back_populates="catalog_items")
    subcategory = relationship("Subcategory", back_populates="catalog_items")
    inventory_items = relationship("InventoryItem", back_populates="catalog_item")
