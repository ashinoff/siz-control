import React, { useEffect, useMemo, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner, EmptyState, Select, Field } from "../components/ui.jsx";
import { IconReport, IconDownload } from "../components/icons.jsx";

export default function Reports() {
  const { isPrivileged } = useAuth();
  const [types, setTypes] = useState([]);
  const [report, setReport] = useState("");
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get("/api/reports/types").then(({ data }) => {
      setTypes(data);
      if (data.length) setReport(data[0].key);
    });
    api.get("/api/departments").then(({ data }) => setDepartments(data));
    api.get("/api/employees").then(({ data }) => setEmployees(data));
  }, []);

  const load = () => {
    if (!report) return;
    setLoading(true);
    const params = {};
    if (departmentId) params.department_id = departmentId;
    if (employeeId) params.employee_id = employeeId;
    api
      .get(`/api/reports/${report}`, { params })
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [report, departmentId, employeeId]);

  const exportFile = async (fmt) => {
    setExporting(true);
    try {
      const params = { fmt };
      if (departmentId) params.department_id = departmentId;
      if (employeeId) params.employee_id = employeeId;
      const resp = await api.get(`/api/reports/${report}/export`, { params, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo(() => {
    if (!data?.rows?.length) return [];
    return Object.keys(data.rows[0]);
  }, [data]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Отчёты и выгрузки</h1>
          <div className="subtitle">Формирование отчётов с выгрузкой в Excel и CSV.</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 16, alignItems: "end" }}>
          <Field label="Отчёт">
            <Select value={report} onChange={(e) => setReport(e.target.value)}>
              {types.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          {isPrivileged && departments.length > 1 && (
            <Field label="Подразделение">
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">Все</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Сотрудник">
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Все</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => exportFile("xlsx")} disabled={exporting || !data?.rows?.length}>
              <IconDownload size={16} /> Excel
            </button>
            <button className="btn btn-secondary" onClick={() => exportFile("csv")} disabled={exporting || !data?.rows?.length}>
              <IconDownload size={16} /> CSV
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{data?.name || "Отчёт"}</h3>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {data?.rows?.length ? `Строк: ${data.rows.length}` : ""}
          </span>
        </div>
        {loading ? (
          <Spinner />
        ) : !data?.rows?.length ? (
          <EmptyState title="Нет данных для отчёта" icon={<IconReport size={40} />} />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 560, overflowY: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>{row[c] == null || row[c] === "" ? "—" : String(row[c])}</td>
                    ))}
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
