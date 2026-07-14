import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, Select, SearchBox } from "../components/ui.jsx";
import { IconBox, IconDownload } from "../components/icons.jsx";
import exportExcel from "../lib/exportExcel.js";
import { fmtDate } from "../lib/format.js";
import PageHeading from "../components/PageHeading.jsx";

const TYPE_COLORS = { ppe: "#2563a8", equipment: "#0e9488", material: "#9333a8" };
const PALETTE = ["#2563a8", "#0e9488", "#9333a8", "#e8830c", "#3f7fe0", "#0891b2", "#7c3aed", "#dc2626", "#16a34a", "#ca8a04"];
const DL_BADGE = { in_date: "badge-green", expiring: "badge-amber", expired: "badge-red" };
const DL_LABEL = { in_date: "В сроке", expiring: "Истекает", expired: "Просрочен" };

function ChartCard({ title, children }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>{title}</div>
      <div style={{ height: 260 }}>{children}</div>
    </div>
  );
}

export default function Holdings() {
  const { isPrivileged } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  const [state, setState] = useState("issued");
  const [itemType, setItemType] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
    api.get("/api/catalog/subcategories").then(({ data }) => setSubcategories(data));
  }, []);

  // категории зависят от выбранного типа
  useEffect(() => {
    const params = itemType ? { item_type: itemType } : {};
    api.get("/api/catalog/categories", { params }).then(({ data }) => setCategories(data));
    setCategoryId(""); setSubcategoryId("");
  }, [itemType]);

  const subOptions = useMemo(
    () => subcategories.filter((s) => !categoryId || String(s.category_id) === String(categoryId)),
    [subcategories, categoryId],
  );

  useEffect(() => {
    setLoading(true);
    const params = { state };
    if (itemType) params.item_type = itemType;
    if (departmentId) params.department_id = departmentId;
    if (categoryId) params.category_id = categoryId;
    if (subcategoryId) params.subcategory_id = subcategoryId;
    if (search.trim()) params.search = search.trim();
    const t = setTimeout(() => {
      api.get("/api/analytics/holdings", { params })
        .then(({ data }) => setData(data))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [state, itemType, departmentId, categoryId, subcategoryId, search]);

  const rows = data?.rows || [];

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
        <SearchBox value={search} onChange={setSearch} placeholder="Наименование, инв./сер. №" />
      </div>

      {data && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat"><div className="label">Позиций</div><div className="value">{data.total_items}</div></div>
          <div className="stat"><div className="label">Единиц</div><div className="value" style={{ color: "var(--accent, #2563a8)" }}>{data.total_qty}</div></div>
          <div className="stat"><div className="label">Сотрудников</div><div className="value">{data.total_employees}</div></div>
        </div>
      )}

      {data && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }} className="holdings-charts">
          <ChartCard title="По подразделениям (единиц)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_department.slice(0, 12)} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="qty" name="Единиц" radius={[6, 6, 0, 0]}>
                  {data.by_department.slice(0, 12).map((d, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="По категориям">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Pie data={data.by_category.slice(0, 8)} dataKey="qty" nameKey="name" outerRadius={95} label={(e) => e.name}>
                  {data.by_category.slice(0, 8).map((d, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Топ позиций (единиц)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_item.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={150} />
                <Tooltip />
                <Bar dataKey="qty" name="Единиц" radius={[0, 6, 6, 0]} fill="#2563a8" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="По типам">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_type} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="qty" name="Единиц" radius={[6, 6, 0, 0]}>
                  {data.by_type.map((d, i) => <Cell key={i} fill={TYPE_COLORS[d.key] || "#2563a8"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
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
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="cell-strong">{r.employee || <span className="muted">склад</span>}</td>
                    <td className="muted">{r.position || "—"}</td>
                    <td className="muted">{r.department}</td>
                    <td>{r.name}{r.brand_model ? <span className="text-muted" style={{ fontSize: 12 }}> · {r.brand_model}</span> : null}</td>
                    <td className="muted">{r.category}{r.subcategory ? ` / ${r.subcategory}` : ""}</td>
                    <td className="num">{r.inventory_number || r.serial_number || "—"}</td>
                    <td style={{ textAlign: "center" }}>{r.quantity}</td>
                    <td>{r.date_issued ? fmtDate(r.date_issued) : "—"}</td>
                    <td>{DL_BADGE[r.deadline_status] ? <Badge kind={DL_BADGE[r.deadline_status]}>{DL_LABEL[r.deadline_status]}</Badge> : "—"}</td>
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
    </div>
  );
}
