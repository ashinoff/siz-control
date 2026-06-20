"""Catalog endpoints: categories, subcategories and catalog items."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_privileged
from ..models.catalog import CatalogItem, Category, Subcategory
from ..models.user import User
from ..schemas.catalog import (
    CatalogItemCreate,
    CatalogItemOut,
    CatalogItemUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    SubcategoryCreate,
    SubcategoryOut,
    SubcategoryUpdate,
)
from ..services.audit import log_audit

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


# --- Categories ------------------------------------------------------------

@router.get("/categories", response_model=List[CategoryOut])
def list_categories(
    item_type: Optional[str] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Category)
    if not include_inactive:
        query = query.filter(Category.is_active.is_(True))
    if item_type:
        query = query.filter(Category.item_type == item_type)
    return query.order_by(Category.name).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    cat = Category(name=payload.name, item_type=payload.item_type.value)
    db.add(cat)
    db.flush()
    log_audit(db, user_id=current.id, action="create_category", entity_type="category", entity_id=cat.id)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    data = payload.model_dump(exclude_unset=True)
    if "item_type" in data and data["item_type"] is not None:
        data["item_type"] = data["item_type"].value
    for k, v in data.items():
        setattr(cat, k, v)
    log_audit(db, user_id=current.id, action="update_category", entity_type="category", entity_id=cat.id)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    cat.is_active = False
    log_audit(db, user_id=current.id, action="delete_category", entity_type="category", entity_id=cat.id)
    db.commit()
    return {"detail": "Категория деактивирована"}


# --- Subcategories ---------------------------------------------------------

@router.get("/subcategories", response_model=List[SubcategoryOut])
def list_subcategories(
    category_id: Optional[int] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Subcategory)
    if not include_inactive:
        query = query.filter(Subcategory.is_active.is_(True))
    if category_id is not None:
        query = query.filter(Subcategory.category_id == category_id)
    return query.order_by(Subcategory.name).all()


@router.post("/subcategories", response_model=SubcategoryOut, status_code=201)
def create_subcategory(
    payload: SubcategoryCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    sub = Subcategory(name=payload.name, category_id=payload.category_id)
    db.add(sub)
    db.flush()
    log_audit(db, user_id=current.id, action="create_subcategory", entity_type="subcategory", entity_id=sub.id)
    db.commit()
    db.refresh(sub)
    return sub


@router.put("/subcategories/{subcategory_id}", response_model=SubcategoryOut)
def update_subcategory(
    subcategory_id: int,
    payload: SubcategoryUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    sub = db.query(Subcategory).filter(Subcategory.id == subcategory_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Подкатегория не найдена")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(sub, k, v)
    log_audit(db, user_id=current.id, action="update_subcategory", entity_type="subcategory", entity_id=sub.id)
    db.commit()
    db.refresh(sub)
    return sub


@router.delete("/subcategories/{subcategory_id}")
def delete_subcategory(
    subcategory_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    sub = db.query(Subcategory).filter(Subcategory.id == subcategory_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Подкатегория не найдена")
    sub.is_active = False
    log_audit(db, user_id=current.id, action="delete_subcategory", entity_type="subcategory", entity_id=sub.id)
    db.commit()
    return {"detail": "Подкатегория деактивирована"}


# --- Catalog items ---------------------------------------------------------

@router.get("/items", response_model=List[CatalogItemOut])
def list_catalog_items(
    item_type: Optional[str] = None,
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(CatalogItem)
    if not include_inactive:
        query = query.filter(CatalogItem.is_active.is_(True))
    if item_type:
        query = query.filter(CatalogItem.item_type == item_type)
    if category_id is not None:
        query = query.filter(CatalogItem.category_id == category_id)
    if search:
        query = query.filter(CatalogItem.name.ilike(f"%{search}%"))
    return query.order_by(CatalogItem.name).all()


@router.post("/items", response_model=CatalogItemOut, status_code=201)
def create_catalog_item(
    payload: CatalogItemCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    data = payload.model_dump()
    data["item_type"] = payload.item_type.value
    if payload.life_unit:
        data["life_unit"] = payload.life_unit.value
    if payload.verification_period_unit:
        data["verification_period_unit"] = payload.verification_period_unit.value
    item = CatalogItem(**data)
    db.add(item)
    db.flush()
    log_audit(db, user_id=current.id, action="create_catalog_item", entity_type="catalog_item", entity_id=item.id)
    db.commit()
    db.refresh(item)
    return item


@router.get("/items/{item_id}", response_model=CatalogItemOut)
def get_catalog_item(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.query(CatalogItem).filter(CatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция справочника не найдена")
    return item


@router.put("/items/{item_id}", response_model=CatalogItemOut)
def update_catalog_item(
    item_id: int,
    payload: CatalogItemUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    item = db.query(CatalogItem).filter(CatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция справочника не найдена")
    data = payload.model_dump(exclude_unset=True)
    for enum_field in ("item_type", "life_unit", "verification_period_unit"):
        if enum_field in data and data[enum_field] is not None:
            data[enum_field] = data[enum_field].value
    for k, v in data.items():
        setattr(item, k, v)
    log_audit(db, user_id=current.id, action="update_catalog_item", entity_type="catalog_item", entity_id=item.id)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_catalog_item(
    item_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_privileged),
):
    item = db.query(CatalogItem).filter(CatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция справочника не найдена")
    item.is_active = False
    log_audit(db, user_id=current.id, action="delete_catalog_item", entity_type="catalog_item", entity_id=item.id)
    db.commit()
    return {"detail": "Позиция справочника деактивирована"}
