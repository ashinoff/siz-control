import React, { useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client.js";
import { Badge, Spinner, EmptyState, Field, Input, Select, Textarea, Alert, SearchBox } from "../components/ui.jsx";
import {
  ITEM_TYPE_LABEL,
  VERIF_LABEL,
  VERIF_BADGE,
  VERIF_RESULT_OPTIONS,
  fmtDate,
} from "../lib/format.js";
import { IconCheckShield } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export default function Verify() {
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, []);

  const load = () => {
    setLoading(true);
    const params = {};
    if (departmentId) params.department_id = departmentId;
    if (search) params.search = search;
    api
      .get("/api/inventory", { params })
      .then(({ data }) => setItems(data.filter((i) => i.requires_verification)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [departmentId, search]);

  const filtered = useMemo(() => {
    if (!onlyDue) return items;
    return items.filter((i) => ["expiring", "expired"].includes(i.verification_status));
  }, [items, onlyDue]);

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Поверка</PageHeading>
          <div className="subtitle">Регистрация поверки и продление срока. Доступно Лаборатории, Службе учёта и Администратору.</div>
        </div>
      </div>

      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Наименование, инв. или серийный №" />
        {departments.length > 1 && (
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Все подразделения</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        <label className="checkbox-row" style={{ margin: 0 }}>
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Только требующие поверки</span>
        </label>
      </div>

      <div className="card">
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="Нет позиций, требующих поверки" icon={<IconCheckShield size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Тип</th>
                  <th>Инв. / Серийный №</th>
                  <th>Подразделение</th>
                  <th>Последняя</th>
                  <th>Следующая</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.id}>
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
                    <td className="muted">{it.department_owner?.name || "—"}</td>
                    <td>{fmtDate(it.last_verification_date)}</td>
                    <td>{fmtDate(it.next_verification_date)}</td>
                    <td>
                      <Badge kind={VERIF_BADGE[it.verification_status]}>{VERIF_LABEL[it.verification_status]}</Badge>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setSelected(it)}>
                        <IconCheckShield className="ico-neon-red" size={15} /> Поверка
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <VerifyModal
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function VerifyModal({ item, onClose, onSaved }) {
  const [verificationDate, setVerificationDate] = useState(today());
  const [nextDate, setNextDate] = useState("");
  const [result, setResult] = useState("passed");
  const [protocol, setProtocol] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/operations/verify", {
        inventory_item_id: item.id,
        verification_date: verificationDate,
        next_verification_date: nextDate || null,
        result,
        protocol_number: protocol || null,
        comment: comment || null,
      });
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Регистрация поверки</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="tag-pill" style={{ marginBottom: 16 }}>
            {item.catalog_item?.name} {item.inventory_number ? `· ${item.inventory_number}` : ""}
          </div>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="form-grid">
            <Field label="Дата поверки" required>
              <Input type="date" value={verificationDate} onChange={(e) => setVerificationDate(e.target.value)} />
            </Field>
            <Field label="Следующая поверка">
              <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </Field>
            <Field label="Результат" required>
              <Select value={result} onChange={(e) => setResult(e.target.value)}>
                {VERIF_RESULT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Номер протокола">
              <Input value={protocol} onChange={(e) => setProtocol(e.target.value)} />
            </Field>
            <div className="field full">
              <label>Комментарий</label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          </div>
          {result === "failed" && (
            <Alert kind="info">При результате «Не годно» позиция будет переведена в статус «К списанию».</Alert>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !verificationDate}>
            Сохранить поверку
          </button>
        </div>
      </div>
    </div>
  );
}
