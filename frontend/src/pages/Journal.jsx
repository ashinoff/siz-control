import React, { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, Select } from "../components/ui.jsx";
import { OPERATION_LABEL, OPERATION_BADGE, fmtDateTime } from "../lib/format.js";
import { IconList, IconDownload } from "../components/icons.jsx";
import exportExcel from "../lib/exportExcel.js";
import PageHeading from "../components/PageHeading.jsx";

export default function Journal() {
  const { isPrivileged } = useAuth();
  const [moves, setMoves] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opType, setOpType] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (opType) params.operation_type = opType;
    if (departmentId) params.department_id = departmentId;
    api
      .get("/api/journal/movements", { params })
      .then(({ data }) => setMoves(data))
      .finally(() => setLoading(false));
  }, [opType, departmentId]);

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Журнал действий</PageHeading>
          <div className="subtitle">Неизменяемая история операций с имуществом.</div>
        </div>
        <button
          className="btn btn-secondary"
          disabled={exporting || moves.length === 0}
          onClick={async () => {
            setExporting(true);
            try {
              const rows = moves.map((m) => ({
                "Дата и время": fmtDateTime(m.created_at),
                "Операция": OPERATION_LABEL[m.operation_type] || m.operation_type,
                "Объект": m.object_label || "",
                "Пользователь": m.user?.full_name || "система",
                "Комментарий": m.comment || "",
              }));
              await exportExcel(rows, "Журнал действий", "journal");
            } finally {
              setExporting(false);
            }
          }}
        >
          <IconDownload size={16} /> Excel
        </button>
      </div>

      <div className="toolbar">
        <Select value={opType} onChange={(e) => setOpType(e.target.value)}>
          <option value="">Все операции</option>
          {Object.entries(OPERATION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
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
        ) : moves.length === 0 ? (
          <EmptyState title="Записей нет" icon={<IconList size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Дата и время</th>
                  <th>Операция</th>
                  <th>Объект</th>
                  <th>Пользователь</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td className="nowrap num">{fmtDateTime(m.created_at)}</td>
                    <td>
                      <Badge kind={OPERATION_BADGE[m.operation_type] || "badge-gray"} dot={false}>
                        {OPERATION_LABEL[m.operation_type] || m.operation_type}
                      </Badge>
                    </td>
                    <td className="cell-strong">{m.object_label || "—"}</td>
                    <td>{m.user?.full_name || <span className="muted">система</span>}</td>
                    <td className="muted">{m.comment || "—"}</td>
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
