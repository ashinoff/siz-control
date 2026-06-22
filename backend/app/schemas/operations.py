"""Schemas for inventory operations: issue, return, move, verify."""
from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field

from ..enums import ReturnCondition, VerificationResult


class IssueItem(BaseModel):
    inventory_item_id: int
    quantity: int = Field(ge=1, default=1)


class IssueRequest(BaseModel):
    """Issue one or more items from a warehouse to an employee."""
    employee_id: int
    items: List[IssueItem] = Field(min_length=1)
    issued_date: date
    comment: Optional[str] = None


class ReturnItem(BaseModel):
    inventory_item_id: int
    condition: ReturnCondition = ReturnCondition.GOOD


class ReturnRequest(BaseModel):
    """Return items currently held by an employee back to the warehouse."""
    employee_id: int
    items: List[ReturnItem] = Field(min_length=1)
    returned_date: date
    comment: Optional[str] = None


class MoveRequest(BaseModel):
    """Move an item between departments / warehouses."""
    inventory_item_id: int
    to_department_id: int
    to_warehouse_id: int
    moved_date: date
    comment: Optional[str] = None


class VerifyRequest(BaseModel):
    """Register a verification (поверка) and extend the next due date."""
    inventory_item_id: int
    verification_date: date
    next_verification_date: Optional[date] = None
    result: VerificationResult = VerificationResult.PASSED
    protocol_number: Optional[str] = None
    comment: Optional[str] = None
