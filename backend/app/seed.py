"""Seed the database with reference data and a small demo dataset.

Run with:  python -m app.seed

It is idempotent for the structural data (roles, departments, warehouses,
admin user): running it twice will not create duplicates. The demo dataset
(catalog items, employees, inventory) is only inserted when the database is
empty, so production deployments can run the seed once to bootstrap and then
manage data through the UI.
"""
from datetime import date, timedelta

from sqlalchemy import select

from .config import settings
from .database import Base, SessionLocal, engine
from .enums import (
    DEPARTMENTS,
    ROLES,
    EmployeeStatus,
    InventoryStatus,
    ItemType,
    LifeUnit,
    RoleCode,
)
from .models import (
    CatalogItem,
    Category,
    Department,
    Employee,
    InventoryItem,
    Role,
    Subcategory,
    User,
    Warehouse,
)
from .security import hash_password
from .services.status import add_period, recalc_service_dates


def _get_or_create(db, model, defaults=None, **filters):
    instance = db.execute(select(model).filter_by(**filters)).scalar_one_or_none()
    if instance:
        return instance, False
    params = {**filters, **(defaults or {})}
    instance = model(**params)
    db.add(instance)
    db.flush()
    return instance, True


def seed_structural(db) -> dict:
    """Roles, departments, one warehouse per department, admin user."""
    role_by_code = {}
    for code, name in ROLES:
        role, _ = _get_or_create(db, Role, code=code.value, defaults={"name": name})
        role_by_code[code] = role

    dept_by_name = {}
    for name in DEPARTMENTS:
        dept, _ = _get_or_create(db, Department, name=name)
        dept_by_name[name] = dept

    # One default warehouse per department.
    for name, dept in dept_by_name.items():
        _get_or_create(
            db,
            Warehouse,
            name=f"Склад — {name}",
            department_id=dept.id,
        )

    # Administrator.
    admin = db.execute(
        select(User).filter_by(login=settings.ADMIN_LOGIN)
    ).scalar_one_or_none()
    if not admin:
        admin = User(
            login=settings.ADMIN_LOGIN,
            password_hash=hash_password(settings.ADMIN_PASSWORD),
            full_name=settings.ADMIN_FULL_NAME,
            role_id=role_by_code[RoleCode.ADMIN].id,
            department_id=None,
        )
        db.add(admin)

    db.flush()
    return {"roles": role_by_code, "departments": dept_by_name}


def seed_demo(db, ctx) -> None:
    """Insert a small, realistic demo dataset (only when DB is empty)."""
    role_by_code = ctx["roles"]
    dept_by_name = ctx["departments"]

    # --- Demo users (one РЭС user + lab + accounting) -----------------------
    demo_users = [
        ("res_adler", "Иванов Иван Иванович", RoleCode.RES_USER, "Адлерский РЭС"),
        ("res_hosta", "Петров Петр Петрович", RoleCode.RES_USER, "Хостинский РЭС"),
        ("lab", "Сидорова Анна Викторовна", RoleCode.LAB, "Лаборатория"),
        ("uchet", "Кузнецова Мария Сергеевна", RoleCode.SUE, "Служба учета"),
    ]
    for login, full_name, role_code, dept_name in demo_users:
        exists = db.execute(select(User).filter_by(login=login)).scalar_one_or_none()
        if not exists:
            db.add(
                User(
                    login=login,
                    password_hash=hash_password("demo123"),
                    full_name=full_name,
                    role_id=role_by_code[role_code].id,
                    department_id=dept_by_name[dept_name].id,
                )
            )
    db.flush()

    # --- Categories & subcategories ----------------------------------------
    # PPE
    cat_dielectric, _ = _get_or_create(
        db, Category, name="Диэлектрические СИЗ", item_type=ItemType.PPE.value
    )
    cat_head, _ = _get_or_create(
        db, Category, name="Защита головы и лица", item_type=ItemType.PPE.value
    )
    sub_gloves, _ = _get_or_create(
        db, Subcategory, name="Перчатки диэлектрические", category_id=cat_dielectric.id
    )
    sub_boots, _ = _get_or_create(
        db, Subcategory, name="Боты диэлектрические", category_id=cat_dielectric.id
    )
    sub_helmet, _ = _get_or_create(
        db, Subcategory, name="Каски защитные", category_id=cat_head.id
    )

    # Equipment
    cat_measure, _ = _get_or_create(
        db, Category, name="Измерительные приборы", item_type=ItemType.EQUIPMENT.value
    )
    sub_indicator, _ = _get_or_create(
        db, Subcategory, name="Указатели напряжения", category_id=cat_measure.id
    )

    # Materials
    cat_cable, _ = _get_or_create(
        db, Category, name="Кабельная продукция", item_type=ItemType.MATERIAL.value
    )

    # --- Catalog items ------------------------------------------------------
    ci_gloves, _ = _get_or_create(
        db,
        CatalogItem,
        name="Перчатки диэлектрические штанцованные",
        item_type=ItemType.PPE.value,
        defaults={
            "category_id": cat_dielectric.id,
            "subcategory_id": sub_gloves.id,
            "life_value": 6,
            "life_unit": LifeUnit.MONTHS.value,
            "requires_verification": True,
            "verification_period_value": 6,
            "verification_period_unit": LifeUnit.MONTHS.value,
            "description": "Испытание 1 раз в 6 месяцев.",
        },
    )
    ci_boots, _ = _get_or_create(
        db,
        CatalogItem,
        name="Боты диэлектрические",
        item_type=ItemType.PPE.value,
        defaults={
            "category_id": cat_dielectric.id,
            "subcategory_id": sub_boots.id,
            "life_value": 36,
            "life_unit": LifeUnit.MONTHS.value,
            "requires_verification": True,
            "verification_period_value": 36,
            "verification_period_unit": LifeUnit.MONTHS.value,
        },
    )
    ci_helmet, _ = _get_or_create(
        db,
        CatalogItem,
        name="Каска защитная СОМЗ-55",
        item_type=ItemType.PPE.value,
        defaults={
            "category_id": cat_head.id,
            "subcategory_id": sub_helmet.id,
            "life_value": 3,
            "life_unit": LifeUnit.YEARS.value,
            "requires_verification": False,
        },
    )
    ci_indicator, _ = _get_or_create(
        db,
        CatalogItem,
        name="Указатель напряжения УВН-10",
        item_type=ItemType.EQUIPMENT.value,
        defaults={
            "category_id": cat_measure.id,
            "subcategory_id": sub_indicator.id,
            "life_value": 5,
            "life_unit": LifeUnit.YEARS.value,
            "requires_verification": True,
            "verification_period_value": 12,
            "verification_period_unit": LifeUnit.MONTHS.value,
        },
    )
    ci_cable, _ = _get_or_create(
        db,
        CatalogItem,
        name="Кабель ВВГнг 3x2.5",
        item_type=ItemType.MATERIAL.value,
        defaults={"category_id": cat_cable.id},
    )

    # --- Employees ----------------------------------------------------------
    adler = dept_by_name["Адлерский РЭС"]
    hosta = dept_by_name["Хостинский РЭС"]
    emp_specs = [
        ("Электромонтер Васильев В.В.", "1024", "Электромонтер ОВБ", adler, "Бригада №1"),
        ("Электромонтер Григорьев Г.Г.", "1025", "Электромонтер ОВБ", adler, "Бригада №1"),
        ("Мастер Дмитриев Д.Д.", "1026", "Мастер участка", adler, "Бригада №2"),
        ("Электромонтер Егоров Е.Е.", "2011", "Электромонтер", hosta, "Бригада №1"),
    ]
    employees = []
    for full_name, pers_no, position, dept, brigade in emp_specs:
        emp, _ = _get_or_create(
            db,
            Employee,
            full_name=full_name,
            personnel_number=pers_no,
            defaults={
                "position": position,
                "department_id": dept.id,
                "brigade": brigade,
                "status": EmployeeStatus.WORKING.value,
            },
        )
        employees.append(emp)
    db.flush()

    # --- Inventory units ----------------------------------------------------
    today = date.today()

    def make_inv(catalog_item, dept, **kw):
        status = kw.pop("status", InventoryStatus.IN_STOCK.value)
        wh = db.execute(
            select(Warehouse).filter_by(department_id=dept.id)
        ).scalars().first()
        item = InventoryItem(
            catalog_item=catalog_item,  # set relationship so effective_life works pre-flush
            item_type=catalog_item.item_type,
            department_owner_id=dept.id,
            current_warehouse_id=wh.id if status == InventoryStatus.IN_STOCK.value else None,
            status=status,
            requires_verification=catalog_item.requires_verification,
            **kw,
        )
        # Compute the next verification date from the catalog period, if applicable.
        if (
            catalog_item.requires_verification
            and item.last_verification_date
            and catalog_item.verification_period_value
        ):
            item.next_verification_date = add_period(
                item.last_verification_date,
                catalog_item.verification_period_value,
                catalog_item.verification_period_unit,
            )
        recalc_service_dates(item)
        db.add(item)
        db.flush()
        return item

    # In stock, never issued
    make_inv(
        ci_helmet, adler,
        inventory_number="СИЗ-0001",
        date_received=today - timedelta(days=20),
    )
    # Issued recently, in date
    make_inv(
        ci_gloves, adler,
        inventory_number="СИЗ-0002",
        serial_number="G-2024-114",
        status=InventoryStatus.ISSUED.value,
        current_employee_id=employees[0].id,
        date_received=today - timedelta(days=120),
        date_issued=today - timedelta(days=20),
        service_start_date=today - timedelta(days=20),
        last_verification_date=today - timedelta(days=20),
    )
    # Issued, verification expiring soon (gloves: 6 months verification)
    make_inv(
        ci_gloves, adler,
        inventory_number="СИЗ-0003",
        serial_number="G-2023-090",
        status=InventoryStatus.ISSUED.value,
        current_employee_id=employees[1].id,
        date_received=today - timedelta(days=200),
        date_issued=today - timedelta(days=175),
        service_start_date=today - timedelta(days=175),
        last_verification_date=today - timedelta(days=175),
    )
    # Issued, service life EXPIRED (gloves 6 months, started 220 days ago)
    make_inv(
        ci_gloves, hosta,
        inventory_number="СИЗ-0004",
        serial_number="G-2023-001",
        status=InventoryStatus.ISSUED.value,
        current_employee_id=employees[3].id,
        date_received=today - timedelta(days=260),
        date_issued=today - timedelta(days=220),
        service_start_date=today - timedelta(days=220),
        last_verification_date=today - timedelta(days=220),
    )
    # Equipment in stock, verification due soon
    make_inv(
        ci_indicator, adler,
        inventory_number="ОБ-0001",
        serial_number="UVN-77123",
        date_received=today - timedelta(days=400),
        last_verification_date=today - timedelta(days=350),
    )
    # Boots in stock
    make_inv(
        ci_boots, hosta,
        inventory_number="СИЗ-0005",
        date_received=today - timedelta(days=10),
    )
    # Material — bulk quantity
    make_inv(
        ci_cable, adler,
        inventory_number="МТ-0001",
        quantity=500,
        date_received=today - timedelta(days=5),
    )

    db.flush()


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ctx = seed_structural(db)

        # Only insert demo data when there is no inventory yet.
        has_inventory = db.execute(select(InventoryItem.id)).first() is not None
        if not has_inventory:
            seed_demo(db, ctx)
            print("Demo dataset inserted.")
        else:
            print("Inventory already present — skipped demo dataset.")

        db.commit()
        print("Seed complete.")
        print(f"  Admin login: {settings.ADMIN_LOGIN} / {settings.ADMIN_PASSWORD}")
        print("  Demo users (password 'demo123'): res_adler, res_hosta, lab, uchet")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
