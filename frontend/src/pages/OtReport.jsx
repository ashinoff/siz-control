import React, { useEffect, useMemo, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner, EmptyState, Select, Field } from "../components/ui.jsx";
import { IconClipboard, IconDownload } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

export default function OtReport() {
  const { isPrivileged } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (departmentId) params.department_id = departmentId;
    api
      .get("/api/ot/report", { params })
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  }, [departmentId]);

  const exportFile = async (fmt) => {
    setExporting(true);
    try {
      const params = { fmt };
      if (departmentId) params.department_id = departmentId;
      const resp = await api.get("/api/ot/report/export", { params, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `ot_report.${fmt}`;
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
          <PageHeading>Отчёт по ОТ</PageHeading>
          <div className="subtitle">Электробезопасность и допуски персонала с выгрузкой в Excel/CSV.</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "end" }}>
          {isPrivileged && departments.length > 1 ? (
            <Field label="Подразделение">
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">Все</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <div />
          )}
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
          <h3>{data?.name || "Охрана труда"}</h3>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {data?.rows?.length ? `Строк: ${data.rows.length}` : ""}
          </span>
        </div>
        {loading ? (
          <Spinner />
        ) : !data?.rows?.length ? (
          <EmptyState title="Нет данных для отчёта" icon={<IconClipboard size={40} />} />
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
