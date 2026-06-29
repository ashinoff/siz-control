"""Department, warehouse and employee schemas."""
from datetime import date
from typing import List, Optional

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
    # Охрана труда — электробезопасность
    eb_group: Optional[str] = None
    eb_exam_date: Optional[date] = None
    eb_next_exam_date: Optional[date] = None


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
    eb_group: Optional[str] = None
    eb_exam_date: Optional[date] = None
    eb_next_exam_date: Optional[date] = None


# Допуски / права / периодические проверки (ОТ) -----------------------------

class AuthorizationBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None
    note: Optional[str] = None


class AuthorizationCreate(AuthorizationBase):
    pass


class AuthorizationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None
    note: Optional[str] = None


class AuthorizationOut(ORMModel):
    id: int
    employee_id: int
    name: str
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None
    note: Optional[str] = None


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
    eb_group: Optional[str] = None
    eb_exam_date: Optional[date] = None
    eb_next_exam_date: Optional[date] = None
    authorizations: List[AuthorizationOut] = []
