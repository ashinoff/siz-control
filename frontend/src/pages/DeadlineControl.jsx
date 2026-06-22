import React, { useEffect, useMemo, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, SearchBox, Select } from "../components/ui.jsx";
import InventoryDetail from "../components/InventoryDetail.jsx";
import {
  ITEM_TYPE_LABEL,
  DEADLINE_LABEL,
  DEADLINE_BADGE,
  VERIF_LABEL,
  VERIF_BADGE,
  fmtDate,
  daysLeft,
} from "../lib/format.js";
import { IconClock } from "../components/icons.jsx";

const TABS = [
  { key: "exp_expiring", label: "Истекает эксплуатация", filter: { deadline: "expiring" }, kind: "deadline", countKey: "expiring_soon" },
  { key: "exp_expired", label: "Просрочено (эксплуатация)", filter: { deadline: "expired" }, kind: "deadline", countKey: "expired" },
  { key: "ver_expiring", label: "Истекает поверка", filter: { verification: "expiring" }, kind: "verif", countKey: "verification_expiring" },
  { key: "ver_expired", label: "Просрочена поверка", filter: { verification: "expired" }, kind: "verif", countKey: "verification_expired" },
];

export default function DeadlineControl() {
  const { isPrivileged } = useAuth();
  const [tab, setTab] = useState(TABS[0]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
    api.get("/api/catalog/categories").then(({ data }) => setCategories(data));
    api.get("/api/dashboard").then(({ data }) =>
      setCounts({
        expiring_soon: data.expiring_soon || 0,
        expired: data.expired || 0,
        verification_expiring: data.verification_expiring || 0,
        verification_expired: data.verification_expired || 0,
      })
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { ...tab.filter };
    if (search) params.search = search;
    if (departmentId) params.department_id = departmentId;
    if (categoryId) params.category_id = categoryId;
    api
      .get("/api/inventory", { params })
      .then(({ data }) => setItems(data))
      .finally(() => setLoading(false));
  }, [tab, search, departmentId, categoryId]);

  const isVerif = tab.kind === "verif";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Контроль сроков</h1>
          <div className="subtitle">Позиции с истекающими и просроченными сроками эксплуатации и поверки.</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => {
          const cnt = counts[t.countKey] || 0;
          return (
            <div key={t.key} className={`tab ${tab.key === t.key ? "active" : ""}`} onClick={() => setTab(t)}>
              {t.label}
              {cnt > 0 && <span className="tab-badge">{cnt}</span>}
            </div>
          );
        })}
      </div>

      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Наименование или номер" />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {isPrivileged && departments.length > 1 && (
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Все подразделения</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="card">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="Нет позиций в этой категории" hint="Все сроки в норме." icon={<IconClock size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Тип</th>
                  <th>Инв. №</th>
                  <th>Подразделение</th>
                  <th>Местонахождение</th>
                  <th>{isVerif ? "Дата поверки" : "Окончание срока"}</th>
                  <th>Осталось</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const date = isVerif ? it.next_verification_date : it.service_end_date;
                  const left = daysLeft(date);
                  return (
                    <tr key={it.id} className="row-click" onClick={() => setDetailId(it.id)}>
                      <td className="cell-strong">{it.catalog_item?.name || "—"}</td>
                      <td>
                        <Badge kind="badge-gray" dot={false}>
                          {ITEM_TYPE_LABEL[it.item_type]}
                        </Badge>
                      </td>
                      <td className="num">{it.inventory_number || "—"}</td>
                      <td className="muted">{it.department_owner?.name || "—"}</td>
                      <td>
                        {it.status === "issued" ? it.current_employee?.full_name || "—" : it.current_warehouse?.name || "склад"}
                      </td>
                      <td>{fmtDate(date)}</td>
                      <td
                        className="num"
                        style={{ color: left != null && left < 0 ? "var(--red)" : "var(--amber)", fontWeight: 600 }}
                      >
                        {left == null ? "—" : left < 0 ? `${Math.abs(left)} дн. назад` : `${left} дн.`}
                      </td>
                      <td>
                        {isVerif ? (
                          <Badge kind={VERIF_BADGE[it.verification_status]}>{VERIF_LABEL[it.verification_status]}</Badge>
                        ) : (
                          <Badge kind={DEADLINE_BADGE[it.deadline_status]}>{DEADLINE_LABEL[it.deadline_status]}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InventoryDetail open={!!detailId} itemId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
