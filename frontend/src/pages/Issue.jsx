import React, { useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, Field, Input, Select, Textarea, Alert, SearchBox } from "../components/ui.jsx";
import { ITEM_TYPE_LABEL } from "../lib/format.js";
import { IconArrowOut, IconBox } from "../components/icons.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export default function Issue() {
  const { isPrivileged } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [issuedDate, setIssuedDate] = useState(today());
  const [comment, setComment] = useState("");
  const [search, setSearch] = useState("");
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
    setLoading(true);
    setSelected(new Set());
    const params = { status: "in_stock" };
    if (departmentId) params.department_id = departmentId;
    if (search) params.search = search;
    api
      .get("/api/inventory", { params })
      .then(({ data }) => setItems(data))
      .finally(() => setLoading(false));
  }, [departmentId, search]);

  const toggle = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const submit = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await api.post("/api/operations/issue", {
        employee_id: Number(employeeId),
        inventory_item_ids: Array.from(selected),
        issued_date: issuedDate,
        comment: comment || null,
      });
      setMsg({ kind: "success", text: `Выдано позиций: ${selected.size}. Срок эксплуатации начат с ${issuedDate}.` });
      setSelected(new Set());
      setComment("");
      const params = { status: "in_stock" };
      if (departmentId) params.department_id = departmentId;
      const { data } = await api.get("/api/inventory", { params });
      setItems(data);
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = employeeId && selected.size > 0 && issuedDate;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Выдача имущества</h1>
          <div className="subtitle">Передача позиций со склада сотруднику. Срок эксплуатации стартует с даты выдачи.</div>
        </div>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          {isPrivileged && departments.length > 1 && (
            <Field label="Подразделение / склад" required>
              <Select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setEmployeeId("");
                }}
              >
                <option value="">— выберите —</option>
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
          <Field label="Дата выдачи" required>
            <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
          </Field>
          <div className="field full">
            <label>Комментарий</label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Доступно на складе</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Выбрано: <strong>{selected.size}</strong>
            </span>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={!canSubmit || busy}>
              <IconArrowOut size={16} /> Выдать ({selected.size})
            </button>
          </div>
        </div>
        <div style={{ padding: "12px 16px 0" }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Поиск по наименованию или номеру" />
        </div>
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="Нет доступных позиций на складе" icon={<IconBox size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Наименование</th>
                  <th>Тип</th>
                  <th>Инв. / Серийный №</th>
                  <th>Склад</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className="row-click"
                    onClick={() => toggle(it.id)}
                    style={selected.has(it.id) ? { background: "var(--accent-soft)" } : null}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(it.id)}
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
                    <td className="muted">{it.current_warehouse?.name || "—"}</td>
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
