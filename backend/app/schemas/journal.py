"""Read schemas for journals, assignments, verification records, dashboard."""
from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel

from .common import ORMModel


class UserBrief(ORMModel):
    id: int
    full_name: str
    login: str


class EmployeeBrief(ORMModel):
    id: int
    full_name: str


class AssignmentOut(ORMModel):
    id: int
    inventory_item_id: int
    employee_id: int
    employee: Optional[EmployeeBrief] = None
    issued_date: date
    issue_comment: Optional[str] = None
    returned_date: Optional[date] = None
    return_condition: Optional[str] = None
    return_comment: Optional[str] = None


class VerificationRecordOut(ORMModel):
    id: int
    inventory_item_id: int
    verification_date: date
    next_verification_date: Optional[date] = None
    result: str
    protocol_number: Optional[str] = None
    comment: Optional[str] = None
    created_at: datetime


class MovementOut(ORMModel):
    id: int
    created_at: datetime
    operation_type: str
    user: Optional[UserBrief] = None
    inventory_item_id: Optional[int] = None
    department_id: Optional[int] = None
    employee_id: Optional[int] = None
    object_label: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    comment: Optional[str] = None


class AuditLogOut(ORMModel):
    id: int
    created_at: datetime
    action: str
    user: Optional[UserBrief] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None


# Dashboard -----------------------------------------------------------------

class DashboardStats(BaseModel):
    total_items: int
    in_warehouse: int
    issued: int
    in_date: int
    expiring_soon: int
    expired: int
    verification_expiring: int
    verification_expired: int
    to_writeoff: int
    by_type: Dict[str, int]
    by_department: List[Dict[str, object]]
