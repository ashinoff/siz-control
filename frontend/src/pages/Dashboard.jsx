import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import api from "../api/client.js";
import { Spinner } from "../components/ui.jsx";
import { ITEM_TYPE_LABEL } from "../lib/format.js";
import {
  IconBox,
  IconWarehouse,
  IconArrowOut,
  IconClock,
  IconCheckShield,
  IconAlert,
} from "../components/icons.jsx";

const TYPE_COLORS = { ppe: "#2563a8", equipment: "#0e9488", material: "#9333a8" };

function Stat({ label, value, color, icon, onClick }) {
  return (
    <div className={`stat ${onClick ? "clickable" : ""}`} onClick={onClick}>
      <div className="label">
        {color ? <span className="dot" style={{ background: color }} /> : icon}
        {label}
      </div>
      <div className="value" style={color ? { color } : null}>
        {value}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/api/dashboard").then(({ data }) => setStats(data));
  }, []);

  if (!stats) return <Spinner />;

  const typeData = Object.entries(stats.by_type || {}).map(([k, v]) => ({
    name: ITEM_TYPE_LABEL[k] || k,
    key: k,
    value: v,
  }));

  const statusData = [
    { name: "В сроке", value: stats.in_date, color: "#15803d" },
    { name: "Истекает", value: stats.expiring_soon, color: "#d97706" },
    { name: "Просрочено", value: stats.expired, color: "#dc2626" },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Обзор</h1>
          <div className="subtitle">Сводная информация по учету и срокам</div>
        </div>
      </div>

      <div className="stat-grid">
        <Stat
          label="Всего позиций"
          value={stats.total_items}
          icon={<IconBox size={15} />}
          onClick={() => navigate("/ppe")}
        />
        <Stat
          label="На складе"
          value={stats.in_warehouse}
          icon={<IconWarehouse size={15} />}
          onClick={() => navigate("/warehouse")}
        />
        <Stat
          label="У сотрудников"
          value={stats.issued}
          icon={<IconArrowOut size={15} />}
        />
        <Stat
          label="К списанию"
          value={stats.to_writeoff}
          color="#b45309"
        />
      </div>

      <div className="section-title">Контроль сроков</div>
      <div className="stat-grid">
        <Stat label="Срок годности — в норме" value={stats.in_date} color="#15803d" />
        <Stat
          label="Срок истекает"
          value={stats.expiring_soon}
          color="#d97706"
          onClick={() => navigate("/deadlines")}
        />
        <Stat
          label="Срок просрочен"
          value={stats.expired}
          color="#dc2626"
          onClick={() => navigate("/deadlines")}
        />
        <Stat
          label="Поверка истекает"
          value={stats.verification_expiring}
          color="#d97706"
          onClick={() => navigate("/deadlines")}
        />
        <Stat
          label="Поверка просрочена"
          value={stats.verification_expired}
          color="#dc2626"
          onClick={() => navigate("/deadlines")}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
        <div className="card">
          <div className="card-header">
            <h3>Позиции по типу</h3>
          </div>
          <div className="card-pad" style={{ height: 260 }}>
            {typeData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#5b6b82" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#5b6b82" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(37,99,168,0.06)" }}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Позиций">
                    {typeData.map((d) => (
                      <Cell key={d.key} fill={TYPE_COLORS[d.key] || "#2563a8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty">Нет данных</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Состояние сроков годности</h3>
          </div>
          <div className="card-pad" style={{ height: 260, display: "flex", alignItems: "center" }}>
            {statusData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {statusData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty" style={{ margin: "auto" }}>Нет позиций в эксплуатации</div>
            )}
            <div style={{ paddingLeft: 12 }}>
              {statusData.map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
                  <span style={{ color: "var(--text-muted)" }}>{d.name}</span>
                  <strong style={{ marginLeft: "auto" }}>{d.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {stats.by_department?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h3>По подразделениям</h3>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Подразделение</th>
                  <th className="text-right">Всего</th>
                  <th className="text-right">На складе</th>
                  <th className="text-right">Выдано</th>
                  <th className="text-right">Просрочено</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_department.map((d, i) => (
                  <tr key={i}>
                    <td className="cell-strong">{d.department}</td>
                    <td className="text-right num">{d.total}</td>
                    <td className="text-right num">{d.in_warehouse}</td>
                    <td className="text-right num">{d.issued}</td>
                    <td className="text-right num" style={{ color: d.expired ? "var(--red)" : "inherit", fontWeight: d.expired ? 600 : 400 }}>
                      {d.expired}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
