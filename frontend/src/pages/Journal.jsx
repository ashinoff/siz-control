import React, { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, Select, Modal, Field, Input, Alert, ConfirmDialog } from "../components/ui.jsx";
import { OPERATION_LABEL, OPERATION_BADGE, fmtDateTime } from "../lib/format.js";
import { IconList, IconDownload, IconTrash } from "../components/icons.jsx";
import exportExcel from "../lib/exportExcel.js";
import PageHeading from "../components/PageHeading.jsx";

export default function Journal() {
  const { isPrivileged, isAdmin } = useAuth();
  const [moves, setMoves] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opType, setOpType] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (opType) params.operation_type = opType;
    if (departmentId) params.department_id = departmentId;
    api
      .get("/api/journal/movements", { params })
      .then(({ data }) => setMoves(data))
      .finally(() => setLoading(false));
  }, [opType, departmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const doDelete = async () => {
    try {
      await api.delete(`/api/journal/movements/${toDelete.id}`);
      setToDelete(null);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Журнал действий</PageHeading>
          <div className="subtitle">Неизменяемая история операций с имуществом.</div>
        </div>
        <div className="btn-row">
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
          {isAdmin && (
            <button className="btn btn-danger" onClick={() => setPurgeOpen(true)}>
              <IconTrash size={16} /> Очистить по периоду
            </button>
          )}
        </div>
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
                  {isAdmin && <th style={{ width: 44 }}></th>}
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
                    {isAdmin && (
                      <td>
                        <button
                          className="btn btn-icon btn-ghost"
                          style={{ color: "var(--red)" }}
                          title="Удалить запись"
                          onClick={() => setToDelete(m)}
                        >
                          <IconTrash size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Удалить запись журнала?"
        message={
          toDelete
            ? `Запись «${OPERATION_LABEL[toDelete.operation_type] || toDelete.operation_type}» от ${fmtDateTime(
                toDelete.created_at
              )} будет удалена безвозвратно.`
            : ""
        }
        confirmText="Удалить"
        onConfirm={doDelete}
        onClose={() => setToDelete(null)}
      />
      {purgeOpen && (
        <PurgeModal
          onClose={() => setPurgeOpen(false)}
          onDone={(count) => {
            setPurgeOpen(false);
            load();
            alert(`Удалено записей: ${count}`);
          }}
        />
      )}
    </div>
  );
}

function PurgeModal({ onClose, onDone }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [opType, setOpType] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!dateFrom && !dateTo) {
      setError("Укажите период: дату «с» и/или «по»");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/api/journal/movements/purge", {
        date_from: dateFrom || null,
        date_to: dateTo || null,
        operation_type: opType || null,
      });
      onDone(data.deleted);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Очистка журнала по периоду"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-danger" onClick={submit} disabled={busy}>
            Удалить записи
          </button>
        </>
      }
    >
      <Alert kind="error">
        Действие необратимо: записи журнала за выбранный период будут удалены навсегда.
      </Alert>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="form-grid">
        <Field label="Дата с">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="Дата по">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        <Field label="Только операции (необязательно)">
          <Select value={opType} onChange={(e) => setOpType(e.target.value)}>
            <option value="">Все операции</option>
            {Object.entries(OPERATION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
        Можно указать только одну границу: например, заполнив лишь «Дата по» — удалится всё до этой
        даты включительно. Даты считаются включительно.
      </div>
    </Modal>
  );
}
