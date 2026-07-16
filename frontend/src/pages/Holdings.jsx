import React, { useEffect, useMemo, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, Select, SearchBox } from "../components/ui.jsx";
import { IconBox, IconDownload, IconEdit } from "../components/icons.jsx";
import InventoryForm from "../components/InventoryForm.jsx";
import InventoryDetail from "../components/InventoryDetail.jsx";
import exportExcel from "../lib/exportExcel.js";
import { fmtDate } from "../lib/format.js";
import PageHeading from "../components/PageHeading.jsx";

const DL_BADGE = { in_date: "badge-green", expiring: "badge-amber", expired: "badge-red" };
const DL_LABEL = { in_date: "В сроке", expiring: "Истекает", expired: "Просрочен" };

export default function Holdings() {
  const { isPrivileged, isAdmin, roleCode } = useAuth();
  // Править карточку выданного имущества может только админ или лаборатория.
  const canEdit = isAdmin || roleCode === "lab";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  const [state, setState] = useState("issued");
  const [itemType, setItemType] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");
  const [catalogItems, setCatalogItems] = useState([]);
  const [search, setSearch] = useState("");

  // Карточка (просмотр) и форма правки
  const [detailId, setDetailId] = useState(null);
  const [editItem, setEditItem] = useState(null);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
    api.get("/api/catalog/subcategories").then(({ data }) => setSubcategories(data));
  }, []);

  useEffect(() => {
    const params = itemType ? { item_type: itemType } : {};
    api.get("/api/catalog/categories", { params }).then(({ data }) => setCategories(data));
    setCategoryId(""); setSubcategoryId("");
  }, [itemType]);

  const subOptions = useMemo(
    () => subcategories.filter((s) => !categoryId || String(s.category_id) === String(categoryId)),
    [subcategories, categoryId],
  );

  // Список конкретных позиций для фильтра по названию — реагирует на тип/категорию/подкатегорию.
  useEffect(() => {
    const params = {};
    if (itemType) params.item_type = itemType;
    if (categoryId) params.category_id = categoryId;
    if (subcategoryId) params.subcategory_id = subcategoryId;
    api.get("/api/catalog/items", { params }).then(({ data }) => setCatalogItems(data));
    setCatalogItemId("");
  }, [itemType, categoryId, subcategoryId]);

  useEffect(() => {
    setLoading(true);
    const params = { state };
    if (itemType) params.item_type = itemType;
    if (departmentId) params.department_id = departmentId;
    if (categoryId) params.category_id = categoryId;
    if (subcategoryId) params.subcategory_id = subcategoryId;
    if (catalogItemId) params.catalog_item_id = catalogItemId;
    if (search.trim()) params.search = search.trim();
    const t = setTimeout(() => {
      api.get("/api/analytics/holdings", { params })
        .then(({ data }) => setData(data))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [state, itemType, departmentId, categoryId, subcategoryId, catalogItemId, search, reloadTick]);

  const rows = data?.rows || [];

  const openEdit = async (id) => {
    try {
      const { data } = await api.get(`/api/inventory/${id}`);
      setEditItem(data);
    } catch {
      /* нет доступа/не найдено — просто не открываем */
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const out = rows.map((r) => ({
        "Сотрудник": r.employee || "—",
        "Должность": r.position || "",
        "Подразделение": r.department,
        "Наименование": r.name,
        "Категория": r.category,
        "Подкатегория": r.subcategory,
        "Тип": r.type_label,
        "Инв. №": r.inventory_number || "",
        "Серийный №": r.serial_number || "",
        "Марка/модель": r.brand_model || "",
        "Кол-во": r.quantity,
        "Дата выдачи": r.date_issued ? fmtDate(r.date_issued) : "",
        "Статус срока": DL_LABEL[r.deadline_status] || "",
      }));
      await exportExcel(out, "Наличие", "holdings");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Наличие</PageHeading>
          <div className="subtitle">Что фактически имеется у персонала и на складах — по структуре, категориям и позициям</div>
        </div>
        <button className="btn btn-secondary" onClick={doExport} disabled={exporting || !rows.length}>
          <IconDownload size={16} /> Excel
        </button>
      </div>

      <div className="toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <Select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="issued">У сотрудников</option>
          <option value="in_stock">На складе</option>
          <option value="all">Всё (склад + выдано)</option>
        </Select>
        <Select value={itemType} onChange={(e) => setItemType(e.target.value)}>
          <option value="">Все типы</option>
          <option value="ppe">СИЗ</option>
          <option value="material">Материалы</option>
          <option value="equipment">Оборудование</option>
        </Select>
        {isPrivileged && departments.length > 1 && (
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Все подразделения</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        )}
        <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(""); }}>
          <option value="">Все категории</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!subOptions.length}>
          <option value="">Все подкатегории</option>
          {subOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={catalogItemId} onChange={(e) => setCatalogItemId(e.target.value)} disabled={!catalogItems.length} style={{ minWidth: 220 }}>
          <option value="">Все наименования{catalogItems.length ? ` (${catalogItems.length})` : ""}</option>
          {catalogItems.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <SearchBox value={search} onChange={setSearch} placeholder="Наименование, инв./сер. №" />
      </div>

      {data && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat"><div className="label">Позиций</div><div className="value">{data.total_items}</div></div>
          <div className="stat"><div className="label">Единиц</div><div className="value" style={{ color: "var(--accent, #2563a8)" }}>{data.total_qty}</div></div>
          <div className="stat"><div className="label">Сотрудников</div><div className="value">{data.total_employees}</div></div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="Ничего не найдено" hint="Измените фильтры — здесь показывается фактически имеющееся" icon={<IconBox size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Должность</th>
                  <th>Подразделение</th>
                  <th>Наименование</th>
                  <th>Категория</th>
                  <th>Инв. / Серийный №</th>
                  <th style={{ textAlign: "center" }}>Кол-во</th>
                  <th>Выдано</th>
                  <th>Срок</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="cell-strong">{r.employee || <span className="muted">склад</span>}</td>
                    <td className="muted">{r.position || "—"}</td>
                    <td className="muted">{r.department}</td>
                    <td>
                      <span
                        onClick={() => setDetailId(r.id)}
                        title="Открыть карточку"
                        style={{ cursor: "pointer", color: "var(--accent, #2563a8)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 2 }}
                      >
                        {r.name}
                      </span>
                      {r.brand_model ? <span className="text-muted" style={{ fontSize: 12 }}> · {r.brand_model}</span> : null}
                    </td>
                    <td className="muted">{r.category}{r.subcategory ? ` / ${r.subcategory}` : ""}</td>
                    <td className="num">{r.inventory_number || r.serial_number || "—"}</td>
                    <td style={{ textAlign: "center" }}>{r.quantity}</td>
                    <td>{r.date_issued ? fmtDate(r.date_issued) : "—"}</td>
                    <td>{DL_BADGE[r.deadline_status] ? <Badge kind={DL_BADGE[r.deadline_status]}>{DL_LABEL[r.deadline_status]}</Badge> : "—"}</td>
                    {canEdit && (
                      <td>
                        <button className="btn btn-icon btn-ghost" title="Корректировать карточку" onClick={() => openEdit(r.id)}>
                          <IconEdit size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {data && data.shown < data.total_items && (
              <div className="text-muted" style={{ padding: "8px 12px", fontSize: 12 }}>
                Показано {data.shown} из {data.total_items} позиций · уточните фильтры или выгрузите в Excel
              </div>
            )}
          </div>
        )}
      </div>

      {/* Карточка позиции (просмотр) */}
      <InventoryDetail open={!!detailId} itemId={detailId} onClose={() => setDetailId(null)} />

      {/* Правка карточки выданного имущества (админ / лаборатория) */}
      <InventoryForm
        open={!!editItem}
        editItem={editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => { setEditItem(null); setReloadTick((t) => t + 1); }}
      />
    </div>
  );
}
