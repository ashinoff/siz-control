"""Inventory model — concrete tracked units of PPE / materials / equipment."""
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..enums import InventoryStatus, LifeUnit
from .base import SoftDeleteMixin, TimestampMixin


class InventoryItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True)

    catalog_item_id = Column(Integer, ForeignKey("catalog_items.id"), nullable=False)
    item_type = Column(String(20), nullable=False, index=True)  # denormalized from catalog

    inventory_number = Column(String(120), nullable=True, index=True)  # инвентарный
    serial_number = Column(String(120), nullable=True, index=True)     # серийный
    brand_model = Column(String(255), nullable=True)                   # марка / тип
    quantity = Column(Integer, default=1, nullable=False)

    # Ownership and location
    department_owner_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    current_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True)
    current_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status = Column(String(20), default=InventoryStatus.IN_STOCK.value, nullable=False, index=True)

    # Dates
    date_received = Column(Date, nullable=True)        # дата поступления
    date_issued = Column(Date, nullable=True)          # дата текущей выдачи
    service_start_date = Column(Date, nullable=True)   # дата начала эксплуатации
    service_end_date = Column(Date, nullable=True)     # расчетная дата окончания

    # Service life override (falls back to the catalog values if NULL)
    life_value = Column(Integer, nullable=True)
    life_unit = Column(String(10), nullable=True)
    # If True, the clock runs even while the item sits in the warehouse.
    life_starts_in_stock = Column(Boolean, default=False, nullable=False)

    # Метрология (средства измерений — СИ): паспортные характеристики прибора
    manufacture_year = Column(Integer, nullable=True)           # год выпуска
    accuracy_class = Column(String(50), nullable=True)          # класс точности (погрешность)
    measurement_range = Column(String(255), nullable=True)      # предел (диапазон) измерений
    metrology_type = Column(String(50), nullable=True)          # вид КМХ: поверка/калибровка/контроль исправности
    metrology_interval_months = Column(Integer, nullable=True)  # периодичность КМХ, мес.

    # Verification
    requires_verification = Column(Boolean, default=False, nullable=False)
    last_verification_date = Column(Date, nullable=True)
    next_verification_date = Column(Date, nullable=True)
    verification_certificate = Column(String(120), nullable=True)  # № свидетельства о поверке

    # Inspection (осмотр — отдельно от поверки)
    next_inspection_date = Column(Date, nullable=True)
    last_inspection_result = Column(String(50), nullable=True)  # good, failed, repair

    # Repair history
    repair_info = Column(Text, nullable=True)

    comment = Column(Text, nullable=True)

    catalog_item = relationship("CatalogItem", back_populates="inventory_items")
    department_owner = relationship("Department")
    current_warehouse = relationship("Warehouse")
    current_employee = relationship("Employee")

    assignments = relationship(
        "Assignment", back_populates="inventory_item", order_by="Assignment.issued_date"
    )
    verification_records = relationship(
        "VerificationRecord",
        back_populates="inventory_item",
        order_by="VerificationRecord.verification_date",
    )
    files = relationship("FileAttachment", back_populates="inventory_item")
