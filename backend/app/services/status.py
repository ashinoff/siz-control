"""Core business logic: service-life and verification deadline calculations.

Rules implemented here (from the specification):
* The service-life clock starts when an item is issued to an employee, not
  while it sits in the warehouse (unless ``life_starts_in_stock`` is set).
* service_end = service_start + normative life.
* A deadline is "expiring" when <= EXPIRY_WARNING_DAYS remain, "expired" once
  the date is in the past, otherwise "in date".
* Verification is tracked independently from service life.
"""
from datetime import date
from typing import Optional

from .. import enums
from ..enums import DeadlineStatus, LifeUnit, VerificationStatus
from ..models.inventory import InventoryItem


def add_period(start: date, value: Optional[int], unit: Optional[str]) -> Optional[date]:
    """Add a duration expressed in days/months/years to a date."""
    if start is None or value is None or unit is None:
        return None
    if unit == LifeUnit.DAYS.value:
        from datetime import timedelta

        return start + timedelta(days=value)
    if unit == LifeUnit.MONTHS.value:
        return _add_months(start, value)
    if unit == LifeUnit.YEARS.value:
        return _add_months(start, value * 12)
    return None


def _add_months(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    # Clamp the day to the last valid day of the target month.
    import calendar

    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def effective_life(item: InventoryItem) -> tuple[Optional[int], Optional[str]]:
    """Item-level life override, falling back to the catalog values."""
    if item.life_value is not None and item.life_unit:
        return item.life_value, item.life_unit
    if item.catalog_item:
        return item.catalog_item.life_value, item.catalog_item.life_unit
    return None, None


def compute_service_end(item: InventoryItem) -> Optional[date]:
    if item.service_start_date is None:
        return None
    value, unit = effective_life(item)
    return add_period(item.service_start_date, value, unit)


def recalc_service_dates(item: InventoryItem) -> None:
    """Recompute the service-end date in place from the current start date."""
    item.service_end_date = compute_service_end(item)


def _deadline_for(target: Optional[date], today: date) -> DeadlineStatus:
    if target is None:
        return DeadlineStatus.NOT_APPLICABLE
    delta = (target - today).days
    if delta < 0:
        return DeadlineStatus.EXPIRED
    if delta <= enums.EXPIRY_WARNING_DAYS:
        return DeadlineStatus.EXPIRING
    return DeadlineStatus.IN_DATE


def deadline_status(item: InventoryItem, today: Optional[date] = None) -> DeadlineStatus:
    today = today or date.today()
    value, unit = effective_life(item)
    if value is None or unit is None:
        return DeadlineStatus.NOT_APPLICABLE
    if item.service_start_date is None:
        # Sitting in the warehouse — the clock has not started yet.
        return DeadlineStatus.NOT_STARTED
    return _deadline_for(item.service_end_date or compute_service_end(item), today)


def verification_status(item: InventoryItem, today: Optional[date] = None) -> VerificationStatus:
    today = today or date.today()
    if not item.requires_verification:
        return VerificationStatus.NOT_REQUIRED
    if item.next_verification_date is None:
        # Required but never scheduled — treat as expired so it surfaces.
        return VerificationStatus.EXPIRED
    delta = (item.next_verification_date - today).days
    if delta < 0:
        return VerificationStatus.EXPIRED
    if delta <= enums.EXPIRY_WARNING_DAYS:
        return VerificationStatus.EXPIRING
    return VerificationStatus.IN_DATE
