import React, { useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client.js";
import { Badge, Spinner, EmptyState, Field, Input, Select, Textarea, Alert, SearchBox } from "../components/ui.jsx";
import { ITEM_TYPE_LABEL } from "../lib/format.js";
import { IconMove, IconBox } from "../components/icons.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export default function Move() {
  const [departments, setDepartments] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [fromDept, setFromDept] = useState("");
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [moveQty, setMoveQty] = useState(1);
  const [toDept, setToDept] = useState("");
  const [toWarehouse, setToWarehouse] = useState("");
  const [movedDate, setMovedDate] = useState(today());
  const [comment, setComment] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
    api.get("/api/warehouses").then(({ data }) => setWarehouses(data));
  }, []);

  useEffect(() => {
    setLoading(true);
    setSelectedId(null);
    const params = { status: "in_stock" };
    if (fromDept) params.department_id = fromDept;
    if (search) params.search = search;
    api
      .get("/api/inventory", { params })
      .then(({ data }) => setItems(data))
      .finally(() => setLoading(false));
  }, [fromDept, search]);

  const targetWarehouses = useMemo(
    () => warehouses.filter((w) => w.department_id === Number(toDept)),
    [warehouses, toDept]
  );

  const submit = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await api.post("/api/operations/move", {
        inventory_item_id: selectedId,
        quantity: moveQty,
        to_department_id: Number(toDept),
        to_warehouse_id: Number(toWarehouse),
        moved_date: movedDate,
        comment: comment || null,
      });
      setMsg({ kind: "success", text: `Перемещено ${moveQty} шт.` });
      setSelectedId(null);
      setMoveQty(1);
      setComment("");
      const params = { status: "in_stock" };
      if (fromDept) params.department_id = fromDept;
      const { data } = await api.get("/api/inventory", { params });
      setItems(data);
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = selectedId && toDept && toWarehouse && movedDate;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Перемещение между подразделениями</h1>
          <div className="subtitle">Доступно Лаборатории, Службе учёта и Администратору.</div>
        </div>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start" }}>
        <div className="card">
          <div className="card-header">
            <h3>1. Выберите позицию (на складе)</h3>
            <Select value={fromDept} onChange={(e) => setFromDept(e.target.value)} style={{ width: "auto" }}>
              <option value="">Все подразделения</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ padding: "12px 16px 0" }}>
            <SearchBox value={search} onChange={setSearch} placeholder="Поиск по наименованию или номеру" />
          </div>
          {loading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState title="Нет позиций на складе" icon={<IconBox size={36} />} />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 460, overflowY: "auto" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Наименование</th>
                    <th>Инв. №</th>
                    <th>Кол-во</th>
                    <th>Подразделение</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className="row-click"
                      onClick={() => { setSelectedId(it.id); setMoveQty(it.quantity); }}
                      style={selectedId === it.id ? { background: "var(--accent-soft)" } : null}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="radio"
                          name="moveitem"
                          checked={selectedId === it.id}
                          onChange={() => { setSelectedId(it.id); setMoveQty(it.quantity); }}
                          style={{ accentColor: "var(--navy)" }}
                        />
                      </td>
                      <td>
                        <div className="cell-strong">{it.catalog_item?.name || "—"}</div>
                        <div className="cell-sub">
                          <Badge kind="badge-gray" dot={false}>
                            {ITEM_TYPE_LABEL[it.item_type]}
                          </Badge>
                        </div>
                      </td>
                      <td className="num">{it.inventory_number || "—"}</td>
                      <td className="num">{it.quantity}</td>
                      <td className="muted">{it.department_owner?.name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 14.5, marginBottom: 16 }}>2. Куда переместить</h3>
          <Field label="Подразделение-получатель" required>
            <Select
              value={toDept}
              onChange={(e) => {
                setToDept(e.target.value);
                setToWarehouse("");
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
          <Field label="Склад-получатель" required>
            <Select value={toWarehouse} onChange={(e) => setToWarehouse(e.target.value)} disabled={!toDept}>
              <option value="">— выберите —</option>
              {targetWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          {selectedId && (() => {
            const sel = items.find((i) => i.id === selectedId);
            const max = sel ? sel.quantity : 1;
            return (
              <Field label={`Количество (макс. ${max})`} required>
                <Input
                  type="number"
                  min={1}
                  max={max}
                  value={moveQty}
                  onChange={(e) => setMoveQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
                />
              </Field>
            );
          })()}
          <Field label="Дата перемещения" required>
            <Input type="date" value={movedDate} onChange={(e) => setMovedDate(e.target.value)} />
          </Field>
          <Field label="Комментарий">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit || busy} style={{ width: "100%" }}>
            <IconMove size={16} /> Переместить
          </button>
        </div>
      </div>
    </div>
  );
}
