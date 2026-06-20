"""Organizational models: Department, Warehouse, Employee."""
from sqlalchemy import Column, ForeignKey, Integer, String, Text
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

    department = relationship("Department", back_populates="employees")
