import React, { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, Select } from "../components/ui.jsx";
import { IconUsers, IconDownload } from "../components/icons.jsx";
import exportExcel from "../lib/exportExcel.js";
import PageHeading from "../components/PageHeading.jsx";

function pctBadge(pct) {
  if (pct >= 100) return "badge-green";
  if (pct >= 50) return "badge-amber";
  return "badge-red";
}

// Pct for a given item type from a categories[] array (— if absent).
function catPct(categories, itemType) {
  const c = (categories || []).find((x) => x.item_type === itemType);
  return c ? c.compliance_pct : "";
}

// Inline per-category breakdown: «СИЗ 80% (4/5) · СИ 100% (2/2)».
function CategoryBreakdown({ categories, style }) {
  if (!categories || categories.length === 0) {
    return <span className="text-muted" style={{ fontSize: 13 }}>Нет норм</span>;
  }
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", ...style }}>
      {categories.map((c) => (
        <span key={c.item_type} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span className="text-muted">{c.label}:</span>
          <Badge kind={pctBadge(c.compliance_pct)}>{c.compliance_pct}%</Badge>
          <span className="text-muted" style={{ fontSize: 12 }}>({c.issued}/{c.required})</span>
        </span>
      ))}
    </div>
  );
}

// One requirement row inside an employee's expanded detail table.
function DetailRow({ d }) {
  return (
    <tr>
      <td style={{ paddingLeft: 32 }}>{d.name}</td>
      <td style={{ textAlign: "center" }}>{d.required}</td>
      <td style={{ textAlign: "center" }}>{d.issued}</td>
      <td style={{ textAlign: "center", color: d.missing ? "var(--red)" : "inherit", fontWeight: d.missing ? 600 : 400 }}>
        {d.missing}
      </td>
      <td>
        {d.expired ? (
          <Badge kind="badge-red">Просрочено</Badge>
        ) : d.missing > 0 ? (
          <Badge kind="badge-amber">Не хватает</Badge>
        ) : (
          <Badge kind="badge-green">Ок</Badge>
        )}
      </td>
    </tr>
  );
}

export default function Compliance() {
  const { isPrivileged } = useAuth();
  const [view, setView] = useState("employees");
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [deptList, setDeptList] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [expandedDept, setExpandedDept] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDeptList(data));
  }, []);

  useEffect(() => {
    setLoading(true);
    if (view === "employees") {
      const params = {};
      if (departmentId) params.department_id = departmentId;
      api
        .get("/api/norms/compliance/employees", { params })
        .then(({ data }) => setEmployees(data))
        .finally(() => setLoading(false));
    } else {
      api
        .get("/api/norms/compliance/departments")
        .then(({ data }) => setDepartments(data))
        .finally(() => setLoading(false));
    }
  }, [view, departmentId]);

  const doExport = async () => {
    setExporting(true);
    try {
      if (view === "employees") {
        const rows = employees.map((e) => ({
          "ФИО": e.full_name,
          "Должность": e.position,
          "Подразделение": e.department,
          "Требуется": e.required,
          "Выдано": e.issued,
          "Не хватает": e.missing,
          "Просрочено": e.expired,
          "Укомплект. %": e.compliance_pct,
          "СИЗ %": catPct(e.categories, "ppe"),
          "СИ %": catPct(e.categories, "equipment"),
          "Материалы %": catPct(e.categories, "material"),
        }));
        await exportExcel(rows, "Укомплектованность персонала", "compliance_employees");
      } else {
        const rows = departments.map((d) => ({
          "Подразделение": d.department,
          "Сотрудников": d.employees_total,
          "Полностью": d.fully_equipped,
          "Частично": d.partially_equipped,
          "Не укомпл.": d.not_equipped,
          "Укомплект. %": d.compliance_pct,
          "СИЗ %": catPct(d.categories, "ppe"),
          "СИ %": catPct(d.categories, "equipment"),
          "Материалы %": catPct(d.categories, "material"),
        }));
        await exportExcel(rows, "Укомплектованность по подразделениям", "compliance_departments");
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Укомплектованность</PageHeading>
          <div className="subtitle">Контроль обеспеченности персонала по нормам ТОН</div>
        </div>
        <button className="btn btn-secondary" onClick={doExport} disabled={exporting}>
          <IconDownload size={16} /> Excel
        </button>
      </div>

      <div className="toolbar">
        <Select value={view} onChange={(e) => setView(e.target.value)}>
          <option value="employees">По сотрудникам</option>
          <option value="departments">По подразделениям</option>
        </Select>
        {view === "employees" && isPrivileged && deptList.length > 1 && (
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Все подразделения</option>
            {deptList.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        )}
      </div>

      <div className="card">
        {loading ? (
          <Spinner />
        ) : view === "employees" ? (
          employees.length === 0 ? (
            <EmptyState title="Нет данных" hint="Задайте нормы ТОН и назначьте должности сотрудникам" icon={<IconUsers size={40} />} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>ФИО</th>
                    <th>Должность</th>
                    <th>Подразделение</th>
                    <th style={{ textAlign: "center" }}>Требуется</th>
                    <th style={{ textAlign: "center" }}>Выдано</th>
                    <th style={{ textAlign: "center" }}>Не хватает</th>
                    <th style={{ textAlign: "center" }}>Просрочено</th>
                    <th style={{ textAlign: "center" }}>Укомплект.</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <React.Fragment key={e.employee_id}>
                      <tr
                        className="row-click"
                        onClick={() => setExpanded(expanded === e.employee_id ? null : e.employee_id)}
                      >
                        <td className="cell-strong">{e.full_name}</td>
                        <td>{e.position}</td>
                        <td className="muted">{e.department}</td>
                        <td style={{ textAlign: "center" }}>{e.required}</td>
                        <td style={{ textAlign: "center" }}>{e.issued}</td>
                        <td style={{ textAlign: "center", color: e.missing ? "var(--red)" : "inherit", fontWeight: e.missing ? 600 : 400 }}>
                          {e.missing}
                        </td>
                        <td style={{ textAlign: "center", color: e.expired ? "var(--red)" : "inherit", fontWeight: e.expired ? 600 : 400 }}>
                          {e.expired}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <Badge kind={pctBadge(e.compliance_pct)}>{e.compliance_pct}%</Badge>
                        </td>
                      </tr>
                      {expanded === e.employee_id && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0, background: "var(--surface-2)" }}>
                            <table className="data" style={{ margin: 0 }}>
                              <thead>
                                <tr>
                                  <th style={{ paddingLeft: 32 }}>Наименование</th>
                                  <th style={{ textAlign: "center" }}>Норма</th>
                                  <th style={{ textAlign: "center" }}>Выдано</th>
                                  <th style={{ textAlign: "center" }}>Не хватает</th>
                                  <th>Статус</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.categories.map((cat) => {
                                  const rows = e.details.filter((d) => d.item_type === cat.item_type);
                                  if (rows.length === 0) return null;
                                  return (
                                    <React.Fragment key={cat.item_type}>
                                      <tr>
                                        <td colSpan={5} style={{ paddingLeft: 24, background: "var(--surface-3, #eef1f6)", fontWeight: 600 }}>
                                          {cat.label}
                                          <span style={{ marginLeft: 8 }}>
                                            <Badge kind={pctBadge(cat.compliance_pct)}>{cat.compliance_pct}%</Badge>
                                          </span>
                                          <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                                            выдано {cat.issued} из {cat.required}
                                          </span>
                                        </td>
                                      </tr>
                                      {rows.map((d, i) => (
                                        <DetailRow key={i} d={d} />
                                      ))}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : departments.length === 0 ? (
          <EmptyState title="Нет данных" icon={<IconUsers size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data data-bordered">
              <thead>
                <tr>
                  <th>Подразделение</th>
                  <th style={{ textAlign: "center" }}>Сотрудников</th>
                  <th style={{ textAlign: "center" }}>Полностью</th>
                  <th style={{ textAlign: "center" }}>Частично</th>
                  <th style={{ textAlign: "center" }}>Не укомпл.</th>
                  <th style={{ textAlign: "center" }}>Укомплект.</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <React.Fragment key={d.department_id}>
                    <tr
                      className="row-click"
                      onClick={() => setExpandedDept(expandedDept === d.department_id ? null : d.department_id)}
                    >
                      <td className="cell-strong">{d.department}</td>
                      <td style={{ textAlign: "center" }}>{d.employees_total}</td>
                      <td style={{ textAlign: "center", color: "var(--green)" }}>{d.fully_equipped}</td>
                      <td style={{ textAlign: "center", color: "var(--amber)" }}>{d.partially_equipped}</td>
                      <td style={{ textAlign: "center", color: d.not_equipped ? "var(--red)" : "inherit", fontWeight: d.not_equipped ? 600 : 400 }}>
                        {d.not_equipped}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <Badge kind={pctBadge(d.compliance_pct)}>{d.compliance_pct}%</Badge>
                      </td>
                    </tr>
                    {expandedDept === d.department_id && (
                      <tr>
                        <td colSpan={6} style={{ background: "var(--surface-2)" }}>
                          <CategoryBreakdown categories={d.categories} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
