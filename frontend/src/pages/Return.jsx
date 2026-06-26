import React, { useEffect, useState } from "react";
import api, { apiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, Field, Input, Select, Textarea, Alert } from "../components/ui.jsx";
import { ITEM_TYPE_LABEL, RETURN_CONDITION_OPTIONS } from "../lib/format.js";
import { IconArrowIn, IconUser } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export default function Return() {
  const { isPrivileged } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [items, setItems] = useState([]);
  const [rows, setRows] = useState({}); // id -> {selected, condition}
  const [returnedDate, setReturnedDate] = useState(today());
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => {
      setDepartments(data);
      if (data.length === 1) setDepartmentId(String(data[0].id));
    });
  }, []);

  useEffect(() => {
    const params = {};
    if (departmentId) params.department_id = departmentId;
    api.get("/api/employees", { params }).then(({ data }) => setEmployees(data));
  }, [departmentId]);

  useEffect(() => {
    if (!employeeId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setRows({});
    api
      .get("/api/inventory", { params: { status: "issued", employee_id: employeeId } })
      .then(({ data }) => setItems(data))
      .finally(() => setLoading(false));
  }, [employeeId]);

  const toggle = (id) =>
    setRows((r) => {
      const cur = r[id] || { selected: false, condition: "good" };
      return { ...r, [id]: { ...cur, selected: !cur.selected } };
    });
  const setCond = (id, condition) =>
    setRows((r) => ({ ...r, [id]: { ...(r[id] || { selected: true }), selected: true, condition } }));

  const selectedItems = items.filter((it) => rows[it.id]?.selected);

  const submit = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await api.post("/api/operations/return", {
        employee_id: Number(employeeId),
        items: selectedItems.map((it) => ({
          inventory_item_id: it.id,
          condition: rows[it.id]?.condition || "good",
        })),
        returned_date: returnedDate,
        comment: comment || null,
      });
      setMsg({ kind: "success", text: `Возвращено позиций: ${selectedItems.length}.` });
      setComment("");
      const { data } = await api.get("/api/inventory", { params: { status: "issued", employee_id: employeeId } });
      setItems(data);
      setRows({});
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Возврат имущества</PageHeading>
          <div className="subtitle">Приём позиций от сотрудника на склад. История эксплуатации сохраняется.</div>
        </div>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          {isPrivileged && departments.length > 1 && (
            <Field label="Подразделение">
              <Select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setEmployeeId("");
                }}
              >
                <option value="">Все подразделения</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Сотрудник" required>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">— выберите сотрудника —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                  {emp.personnel_number ? ` (${emp.personnel_number})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Дата возврата" required>
            <Input type="date" value={returnedDate} onChange={(e) => setReturnedDate(e.target.value)} />
          </Field>
          <div className="field full">
            <label>Комментарий</label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Числится за сотрудником</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={selectedItems.length === 0 || busy || !returnedDate}
          >
            <IconArrowIn size={16} /> Принять ({selectedItems.length})
          </button>
        </div>
        {!employeeId ? (
          <EmptyState title="Выберите сотрудника" hint="Чтобы увидеть выданные позиции." icon={<IconUser size={40} />} />
        ) : loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="За сотрудником нет позиций" icon={<IconUser size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Наименование</th>
                  <th>Тип</th>
                  <th>Инв. / Серийный №</th>
                  <th style={{ width: 280 }}>Состояние при возврате</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const row = rows[it.id] || {};
                  return (
                    <tr key={it.id} style={row.selected ? { background: "var(--accent-soft)" } : null}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!row.selected}
                          onChange={() => toggle(it.id)}
                          style={{ width: 16, height: 16, accentColor: "var(--navy)" }}
                        />
                      </td>
                      <td className="cell-strong">{it.catalog_item?.name || "—"}</td>
                      <td>
                        <Badge kind="badge-gray" dot={false}>
                          {ITEM_TYPE_LABEL[it.item_type]}
                        </Badge>
                      </td>
                      <td className="num">
                        {it.inventory_number || "—"}
                        {it.serial_number && <div className="cell-sub">{it.serial_number}</div>}
                      </td>
                      <td>
                        <Select
                          value={row.condition || "good"}
                          onChange={(e) => setCond(it.id, e.target.value)}
                          disabled={!row.selected}
                        >
                          {RETURN_CONDITION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
