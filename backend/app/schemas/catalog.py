"""Catalog schemas: category, subcategory, catalog item."""
from typing import Optional

from pydantic import BaseModel, Field

from ..enums import ItemType, LifeUnit
from .common import ORMModel


# Categories ----------------------------------------------------------------

class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    item_type: ItemType


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    item_type: Optional[ItemType] = None
    is_active: Optional[bool] = None


class CategoryOut(ORMModel):
    id: int
    name: str
    item_type: str
    is_active: bool


class SubcategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category_id: int


class SubcategoryUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None


class SubcategoryOut(ORMModel):
    id: int
    name: str
    category_id: int
    is_active: bool


# Catalog items -------------------------------------------------------------

class CatalogItemBase(BaseModel):
    item_type: ItemType
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    life_value: Optional[int] = None
    life_unit: Optional[LifeUnit] = LifeUnit.MONTHS
    requires_verification: bool = False
    verification_period_value: Optional[int] = None
    verification_period_unit: Optional[LifeUnit] = None


class CatalogItemCreate(CatalogItemBase):
    pass


class CatalogItemUpdate(BaseModel):
    item_type: Optional[ItemType] = None
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    life_value: Optional[int] = None
    life_unit: Optional[LifeUnit] = None
    requires_verification: Optional[bool] = None
    verification_period_value: Optional[int] = None
    verification_period_unit: Optional[LifeUnit] = None
    is_active: Optional[bool] = None


class CatalogItemOut(ORMModel):
    id: int
    item_type: str
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    category: Optional[CategoryOut] = None
    subcategory: Optional[SubcategoryOut] = None
    name: str
    description: Optional[str] = None
    life_value: Optional[int] = None
    life_unit: Optional[str] = None
    requires_verification: bool
    verification_period_value: Optional[int] = None
    verification_period_unit: Optional[str] = None
    is_active: bool
