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

export default function Compliance() {
  const { isPrivileged } = useAuth();
  const [view, setView] = useState("employees");
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [deptList, setDeptList] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
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
                                {e.details.map((d, i) => (
                                  <tr key={i}>
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
                                ))}
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
                  <tr key={d.department_id}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
