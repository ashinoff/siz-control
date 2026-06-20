"""Department, warehouse and employee schemas."""
from typing import Optional

from pydantic import BaseModel, Field

from ..enums import EmployeeStatus
from .common import ORMModel


# Departments ---------------------------------------------------------------

class DepartmentOut(ORMModel):
    id: int
    name: str
    code: Optional[str] = None
    is_active: bool


class WarehouseOut(ORMModel):
    id: int
    name: str
    department_id: int
    is_active: bool


# Employees -----------------------------------------------------------------

class EmployeeBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    personnel_number: Optional[str] = None
    position: Optional[str] = None
    department_id: int
    brigade: Optional[str] = None
    phone: Optional[str] = None
    status: EmployeeStatus = EmployeeStatus.WORKING
    comment: Optional[str] = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    personnel_number: Optional[str] = None
    position: Optional[str] = None
    department_id: Optional[int] = None
    brigade: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[EmployeeStatus] = None
    comment: Optional[str] = None


class EmployeeOut(ORMModel):
    id: int
    full_name: str
    personnel_number: Optional[str] = None
    position: Optional[str] = None
    department_id: int
    department: Optional[DepartmentOut] = None
    brigade: Optional[str] = None
    phone: Optional[str] = None
    status: str
    comment: Optional[str] = None
    is_active: bool
