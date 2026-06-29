import React, { useEffect, useMemo, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, SearchBox, Select } from "../components/ui.jsx";
import { IconAlert } from "../components/icons.jsx";
import { fmtDate } from "../lib/format.js";
import PageHeading from "../components/PageHeading.jsx";

const OT_LABEL = { expired: "Просрочено", expiring: "Подходит срок" };
const OT_BADGE = { expired: "badge-red", expiring: "badge-amber" };
// Subtle row tint (separate visuals from the СИЗ deadline page).
const ROW_BG = { expired: "rgba(220,38,38,0.07)", expiring: "rgba(217,119,6,0.07)" };

export default function OtDeadlines() {
  const { isPrivileged } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (departmentId) params.department_id = departmentId;
    api
      .get("/api/ot/deadlines", { params })
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  }, [departmentId]);

  const items = useMemo(() => {
    const all = data?.items || [];
    if (!search) return all;
    const s = search.toLowerCase();
    return all.filter((i) => i.full_name.toLowerCase().includes(s) || i.title.toLowerCase().includes(s));
  }, [data, search]);

  const counts = data?.counts || { expiring: 0, expired: 0 };
  const warningDays = data?.warning_days ?? 7;

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Контроль сроков ОТ</PageHeading>
          <div className="subtitle">
            Электробезопасность и допуски с подходящими (≤ {warningDays} дн.) и просроченными сроками.
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="label" style={{ color: "var(--red)" }}>Просрочено</div>
          <div className="value" style={{ color: "var(--red)" }}>{counts.expired}</div>
        </div>
        <div className="stat">
          <div className="label" style={{ color: "var(--amber)" }}>Подходит срок (≤ {warningDays} дн.)</div>
          <div className="value" style={{ color: "var(--amber)" }}>{counts.expiring}</div>
        </div>
      </div>

      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="ФИО или вид допуска" />
        {isPrivileged && departments.length > 1 && (
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Все подразделения</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        )}
      </div>

      <div className="card">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="Сроки в норме" hint="Нет подходящих и просроченных сроков по ОТ." icon={<IconAlert size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Подразделение</th>
                  <th>Должность</th>
                  <th>Вид / проверка</th>
                  <th>Срок</th>
                  <th>Осталось</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i, idx) => (
                  <tr key={idx} style={{ background: ROW_BG[i.status] }}>
                    <td className="cell-strong">{i.full_name}</td>
                    <td className="muted">{i.department || "—"}</td>
                    <td>{i.position || "—"}</td>
                    <td>{i.title}</td>
                    <td>{fmtDate(i.date)}</td>
                    <td
                      className="num"
                      style={{ color: i.days_left != null && i.days_left < 0 ? "var(--red)" : "var(--amber)", fontWeight: 600 }}
                    >
                      {i.days_left == null
                        ? "—"
                        : i.days_left < 0
                        ? `${Math.abs(i.days_left)} дн. назад`
                        : `${i.days_left} дн.`}
                    </td>
                    <td>
                      <Badge kind={OT_BADGE[i.status]}>{OT_LABEL[i.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
