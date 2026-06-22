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
  const [compliance, setCompliance] = useState(null);
  const navigate = useNavigate();

  const [complianceDepts, setComplianceDepts] = useState([]);

  useEffect(() => {
    api.get("/api/dashboard").then(({ data }) => setStats(data));
    api.get("/api/norms/compliance/summary").then(({ data }) => setCompliance(data)).catch(() => {});
    api.get("/api/norms/compliance/departments").then(({ data }) => setComplianceDepts(data)).catch(() => {});
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

      {compliance && compliance.total_employees > 0 && (
        <>
          <div className="section-title">Укомплектованность по ТОН</div>
          <div className="stat-grid">
            <Stat
              label="Средняя укомплектованность"
              value={`${compliance.compliance_pct}%`}
              color={compliance.compliance_pct >= 100 ? "#15803d" : compliance.compliance_pct >= 50 ? "#d97706" : "#dc2626"}
              onClick={() => navigate("/compliance")}
            />
            <Stat
              label="Полностью укомплектовано"
              value={compliance.fully_equipped}
              color="#15803d"
            />
            <Stat
              label="Частично укомплектовано"
              value={compliance.partially_equipped}
              color="#d97706"
              onClick={() => navigate("/compliance")}
            />
            <Stat
              label="Не укомплектовано"
              value={compliance.not_equipped}
              color="#dc2626"
              onClick={() => navigate("/compliance")}
            />
          </div>

          {complianceDepts.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
              <div className="card">
                <div className="card-header">
                  <h3>Укомплектованность по подразделениям</h3>
                </div>
                <div className="card-pad" style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={complianceDepts.map((d) => ({ name: d.department, pct: d.compliance_pct }))}
                      margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5b6b82" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#5b6b82" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                      <Tooltip
                        cursor={{ fill: "rgba(37,99,168,0.06)" }}
                        contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
                        formatter={(v) => [`${v}%`, "Укомплект."]}
                      />
                      <Bar dataKey="pct" radius={[6, 6, 0, 0]} name="Укомплект.">
                        {complianceDepts.map((d, i) => (
                          <Cell
                            key={i}
                            fill={d.compliance_pct >= 100 ? "#15803d" : d.compliance_pct >= 50 ? "#d97706" : "#dc2626"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Статус укомплектованности</h3>
                </div>
                <div className="card-pad" style={{ height: 280, display: "flex", alignItems: "center" }}>
                  {(() => {
                    const pieData = [
                      { name: "Полностью", value: compliance.fully_equipped, color: "#15803d" },
                      { name: "Частично", value: compliance.partially_equipped, color: "#d97706" },
                      { name: "Не укомпл.", value: compliance.not_equipped, color: "#dc2626" },
                    ].filter((d) => d.value > 0);
                    return pieData.length ? (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={90}
                              paddingAngle={2}
                            >
                              {pieData.map((d, i) => (
                                <Cell key={i} fill={d.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ paddingLeft: 12, minWidth: 130 }}>
                          {pieData.map((d) => (
                            <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13 }}>
                              <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                              <span style={{ color: "var(--text-muted)" }}>{d.name}</span>
                              <strong style={{ marginLeft: "auto" }}>{d.value}</strong>
                            </div>
                          ))}
                          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4, fontSize: 13 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "var(--text-muted)" }}>Всего</span>
                              <strong>{compliance.total_employees}</strong>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="empty" style={{ margin: "auto" }}>Нет данных</div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {stats.by_department?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h3>По подразделениям</h3>
          </div>
          <div className="table-wrap">
            <table className="data data-bordered">
              <thead>
                <tr>
                  <th>Подразделение</th>
                  <th style={{ textAlign: "center" }}>Всего</th>
                  <th style={{ textAlign: "center" }}>На складе</th>
                  <th style={{ textAlign: "center" }}>Выдано</th>
                  <th style={{ textAlign: "center" }}>Просрочено экспл.</th>
                  <th style={{ textAlign: "center" }}>Просрочено поверка</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_department.map((d, i) => (
                  <tr key={i}>
                    <td className="cell-strong">{d.department}</td>
                    <td style={{ textAlign: "center" }}>{d.total}</td>
                    <td style={{ textAlign: "center" }}>{d.in_warehouse}</td>
                    <td style={{ textAlign: "center" }}>{d.issued}</td>
                    <td style={{ textAlign: "center", color: d.expired ? "var(--red)" : "inherit", fontWeight: d.expired ? 600 : 400 }}>
                      {d.expired}
                    </td>
                    <td style={{ textAlign: "center", color: d.verification_expired ? "var(--red)" : "inherit", fontWeight: d.verification_expired ? 600 : 400 }}>
                      {d.verification_expired}
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
