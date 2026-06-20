"""Centralized enumerations used across the application.

These are stored as plain strings in the database (portable between
SQLite and PostgreSQL) and validated in the Pydantic schemas.
"""
from enum import Enum


class RoleCode(str, Enum):
    ADMIN = "admin"          # Администратор
    LAB = "lab"              # Лаборатория
    SUE = "sue"              # Служба учета
    RES_USER = "res_user"    # Пользователь РЭС


class ItemType(str, Enum):
    PPE = "ppe"              # СИЗ
    MATERIAL = "material"    # Материал
    EQUIPMENT = "equipment"  # Оборудование


class LifeUnit(str, Enum):
    DAYS = "days"
    MONTHS = "months"
    YEARS = "years"


class InventoryStatus(str, Enum):
    IN_STOCK = "in_stock"        # На складе
    ISSUED = "issued"            # У сотрудника
    TO_WRITEOFF = "to_writeoff"  # К списанию
    WRITTEN_OFF = "written_off"  # Списано


class DeadlineStatus(str, Enum):
    """Computed status for the service-life deadline."""
    IN_DATE = "in_date"              # В сроке
    EXPIRING = "expiring"            # Скоро истекает (<= 30 дней)
    EXPIRED = "expired"              # Просрочено
    NOT_STARTED = "not_started"      # Эксплуатация не начата (на складе)
    NOT_APPLICABLE = "not_applicable"


class VerificationStatus(str, Enum):
    """Computed status for the verification (поверка) deadline."""
    IN_DATE = "in_date"
    EXPIRING = "expiring"
    EXPIRED = "expired"
    NOT_REQUIRED = "not_required"    # Не требуется


class OperationType(str, Enum):
    CREATE = "create"        # Создание
    UPDATE = "update"        # Редактирование
    ISSUE = "issue"          # Выдача
    RETURN = "return"        # Возврат
    MOVE = "move"            # Перемещение
    WRITEOFF = "writeoff"    # Списание
    VERIFY = "verify"        # Поверка
    DELETE = "delete"        # Удаление


class ReturnCondition(str, Enum):
    GOOD = "good"                    # Исправно
    NEEDS_CHECK = "needs_check"      # Требует проверки
    NEEDS_WRITEOFF = "needs_writeoff"  # Требует списания
    LOST = "lost"                    # Утеряно


class VerificationResult(str, Enum):
    PASSED = "passed"        # Годно
    FAILED = "failed"        # Не годно
    REPAIR = "repair"        # Требуется ремонт


class EmployeeStatus(str, Enum):
    WORKING = "working"      # Работает
    DISMISSED = "dismissed"  # Уволен
    INACTIVE = "inactive"    # Временно неактивен


# Default seed data ---------------------------------------------------------

DEPARTMENTS = [
    "Адлерский РЭС",
    "Краснополянский РЭС",
    "Сочинский РЭС",
    "Хостинский РЭС",
    "Дагомысский РЭС",
    "Туапсинский РЭС",
    "Лазаревский РЭС",
    "Лаборатория",
    "Служба учета",
]

ROLES = [
    (RoleCode.ADMIN, "Администратор"),
    (RoleCode.LAB, "Лаборатория"),
    (RoleCode.SUE, "Служба учета"),
    (RoleCode.RES_USER, "Пользователь РЭС"),
]

# Roles that can manage inventory globally (add/edit/delete/move/verify)
PRIVILEGED_ROLES = {RoleCode.ADMIN, RoleCode.LAB, RoleCode.SUE}

# Number of days before a deadline at which the status flips to "expiring".
EXPIRY_WARNING_DAYS = 30
