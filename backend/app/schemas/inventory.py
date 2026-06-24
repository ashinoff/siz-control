"""Inventory item schemas, including computed status output."""
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field

from ..enums import InventoryStatus, LifeUnit
from .catalog import CatalogItemOut
from .common import ORMModel
from .organization import DepartmentOut, EmployeeOut, WarehouseOut


class InventoryItemBase(BaseModel):
    catalog_item_id: int
    inventory_number: Optional[str] = None
    serial_number: Optional[str] = None
    brand_model: Optional[str] = None
    quantity: int = 1
    department_owner_id: int
    current_warehouse_id: Optional[int] = None
    date_received: Optional[date] = None
    life_value: Optional[int] = None
    life_unit: Optional[LifeUnit] = None
    life_starts_in_stock: bool = False
    requires_verification: Optional[bool] = None
    last_verification_date: Optional[date] = None
    next_verification_date: Optional[date] = None
    next_inspection_date: Optional[date] = None
    last_inspection_result: Optional[str] = None
    repair_info: Optional[str] = None
    comment: Optional[str] = None


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    inventory_number: Optional[str] = None
    serial_number: Optional[str] = None
    brand_model: Optional[str] = None
    quantity: Optional[int] = None
    current_warehouse_id: Optional[int] = None
    date_received: Optional[date] = None
    service_start_date: Optional[date] = None
    life_value: Optional[int] = None
    life_unit: Optional[LifeUnit] = None
    life_starts_in_stock: Optional[bool] = None
    requires_verification: Optional[bool] = None
    last_verification_date: Optional[date] = None
    next_verification_date: Optional[date] = None
    next_inspection_date: Optional[date] = None
    last_inspection_result: Optional[str] = None
    repair_info: Optional[str] = None
    comment: Optional[str] = None


class InventoryItemOut(ORMModel):
    id: int
    catalog_item_id: int
    catalog_item: Optional[CatalogItemOut] = None
    item_type: str
    inventory_number: Optional[str] = None
    serial_number: Optional[str] = None
    brand_model: Optional[str] = None
    quantity: int

    department_owner_id: int
    department_owner: Optional[DepartmentOut] = None
    current_warehouse_id: Optional[int] = None
    current_warehouse: Optional[WarehouseOut] = None
    current_employee_id: Optional[int] = None
    current_employee: Optional[EmployeeOut] = None
    status: str

    date_received: Optional[date] = None
    date_issued: Optional[date] = None
    service_start_date: Optional[date] = None
    service_end_date: Optional[date] = None
    life_value: Optional[int] = None
    life_unit: Optional[str] = None
    life_starts_in_stock: bool

    requires_verification: bool
    last_verification_date: Optional[date] = None
    next_verification_date: Optional[date] = None

    next_inspection_date: Optional[date] = None
    last_inspection_result: Optional[str] = None
    repair_info: Optional[str] = None

    comment: Optional[str] = None
    is_active: bool

    # Computed fields (populated by the router)
    deadline_status: Optional[str] = None
    verification_status: Optional[str] = None
