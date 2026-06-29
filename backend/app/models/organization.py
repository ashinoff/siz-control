"""Organizational models: Department, Warehouse, Employee."""
from sqlalchemy import Column, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base
from ..enums import EmployeeStatus
from .base import SoftDeleteMixin, TimestampMixin


class Department(Base, SoftDeleteMixin):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), unique=True, nullable=False)
    code = Column(String(50), nullable=True)

    users = relationship("User", back_populates="department")
    employees = relationship("Employee", back_populates="department")
    warehouses = relationship("Warehouse", back_populates="department")


class Warehouse(Base, SoftDeleteMixin):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)

    department = relationship("Department", back_populates="warehouses")


class Employee(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True)
    full_name = Column(String(255), nullable=False, index=True)
    personnel_number = Column(String(50), nullable=True, index=True)  # табельный номер
    position = Column(String(255), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    brigade = Column(String(255), nullable=True)  # участок / бригада
    phone = Column(String(50), nullable=True)
    status = Column(String(20), default=EmployeeStatus.WORKING.value, nullable=False)
    comment = Column(Text, nullable=True)

    # ── Охрана труда (ОТ) — электробезопасность ──────────────────────────
    # All nullable so schema_sync can add them to an existing table on Amvera.
    eb_group = Column(String(10), nullable=True)        # группа по ЭБ: II–V
    eb_exam_date = Column(Date, nullable=True)          # последняя проверка знаний
    eb_next_exam_date = Column(Date, nullable=True)     # следующая проверка знаний

    department = relationship("Department", back_populates="employees")
    authorizations = relationship(
        "EmployeeAuthorization",
        back_populates="employee",
        cascade="all, delete-orphan",
        order_by="EmployeeAuthorization.id",
    )


class EmployeeAuthorization(Base):
    """Допуски / права / периодические проверки сотрудника (ОТ).

    Open-ended one-to-many list — ``name`` is free-form so any kind of
    authorization can be tracked. ``expiry_date`` feeds the ОТ deadline control.
    """
    __tablename__ = "employee_authorizations"

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)       # вид допуска/права/проверки
    issued_date = Column(Date, nullable=True)         # когда выдан/пройдена
    expiry_date = Column(Date, nullable=True)         # срок действия / следующая
    note = Column(Text, nullable=True)

    employee = relationship("Employee", back_populates="authorizations")
