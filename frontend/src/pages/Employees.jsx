import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { apiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, SearchBox, Select, Modal, Field, Input, Textarea, Alert, ConfirmDialog } from "../components/ui.jsx";
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_BADGE,
  ITEM_TYPE_LABEL,
  DEADLINE_LABEL,
  DEADLINE_BADGE,
  fmtDate,
} from "../lib/format.js";
import { IconPlus, IconEdit, IconTrash, IconUsers, IconDownload, IconClipboard } from "../components/icons.jsx";
import exportExcel from "../lib/exportExcel.js";
import { OT_RIGHTS } from "../lib/otRights.js";
import PageHeading from "../components/PageHeading.jsx";

const emptyEmp = {
  full_name: "",
  personnel_number: "",
  position: "",
  department_id: "",
  brigade: "",
  phone: "",
  status: "working",
  comment: "",
  eb_group: "",
  eb_exam_date: "",
  eb_next_exam_date: "",
};

const EB_GROUPS = ["II", "III", "IV", "V"];

export default function Employees() {
  const { isPrivileged, user } = useAuth();
  const [list, setList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [viewIssued, setViewIssued] = useState(null);

  const canManage = isPrivileged;

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (departmentId) params.department_id = departmentId;
    try {
      const { data } = await api.get("/api/employees", { params });
      setList(data);
    } finally {
      setLoading(false);
    }
  }, [search, departmentId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, []);

  const openCreate = () => {
    setEditEmp({ ...emptyEmp, department_id: departments[0]?.id || "" });
    setModalOpen(true);
  };
  const openEdit = (e) => {
    setEditEmp({ ...emptyEmp, ...e, department_id: e.department_id });
    setModalOpen(true);
  };

  // Deep-link: /employees?edit=123 auto-opens that employee's edit form.
  // Used by the DB-integrity check to jump straight to a record to fix.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || loading) return;
    const emp = list.find((x) => x.id === Number(editId));
    if (emp) openEdit(emp);
    searchParams.delete("edit");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, loading, searchParams]);

  const doDelete = async () => {
    try {
      await api.delete(`/api/employees/${toDelete.id}`);
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
          <PageHeading>Персонал</PageHeading>
          <div className="subtitle">Сотрудников: {list.length}</div>
        </div>
        <div className="btn-row">
          <button
            className="btn btn-secondary"
            disabled={exporting || list.length === 0}
            onClick={async () => {
              setExporting(true);
              try {
                const rows = list.map((e) => ({
                  "ФИО": e.full_name,
                  "Таб. №": e.personnel_number || "",
                  "Должность": e.position || "",
                  "Подразделение": e.department?.name || "",
                  "Бригада": e.brigade || "",
                  "Телефон": e.phone || "",
                  "Статус": EMPLOYEE_STATUS_LABEL[e.status] || e.status,
                }));
                await exportExcel(rows, "Персонал", "employees");
              } finally {
                setExporting(false);
              }
            }}
          >
            <IconDownload size={16} /> Excel
          </button>
          {canManage && (
            <button className="btn btn-primary" onClick={openCreate}>
              <IconPlus size={17} /> Добавить сотрудника
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="ФИО или табельный номер" />
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
        ) : list.length === 0 ? (
          <EmptyState title="Сотрудники не найдены" icon={<IconUsers size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Таб. №</th>
                  <th>Должность</th>
                  <th>Подразделение</th>
                  <th>Бригада</th>
                  <th>Телефон</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-strong">{e.full_name}</td>
                    <td className="num">{e.personnel_number || "—"}</td>
                    <td>{e.position || "—"}</td>
                    <td>{e.department?.name || "—"}</td>
                    <td>{e.brigade || "—"}</td>
                    <td className="num">{e.phone || "—"}</td>
                    <td>
                      <Badge kind={EMPLOYEE_STATUS_BADGE[e.status]}>{EMPLOYEE_STATUS_LABEL[e.status]}</Badge>
                    </td>
                    <td>
                      <div className="btn-row">
                        <button
                          className="btn btn-icon btn-ghost"
                          style={{ color: "var(--navy)" }}
                          onClick={() => setViewIssued(e)}
                          title="Что выдано сотруднику"
                        >
                          <IconClipboard size={16} />
                        </button>
                        {canManage && (
                          <>
                            <button className="btn btn-icon btn-ghost" onClick={() => openEdit(e)} title="Изменить">
                              <IconEdit size={16} />
                            </button>
                            <button
                              className="btn btn-icon btn-ghost"
                              style={{ color: "var(--red)" }}
                              onClick={() => setToDelete(e)}
                              title="Удалить"
                            >
                              <IconTrash size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <EmployeeModal
          emp={editEmp}
          departments={departments}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Удалить сотрудника?"
        message={`Сотрудник «${toDelete?.full_name || ""}» будет деактивирован.`}
        confirmText="Удалить"
        onConfirm={doDelete}
        onClose={() => setToDelete(null)}
      />
      {viewIssued && <IssuedItemsModal employee={viewIssued} onClose={() => setViewIssued(null)} />}
    </div>
  );
}

// Registry of everything currently issued to an employee, grouped by category
// so PPE / equipment / materials are shown separately rather than mixed.
function IssuedItemsModal({ employee, onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get("/api/inventory", { params: { employee_id: employee.id, status: "issued" } })
      .then(({ data }) => setItems(data))
      .catch((e) => setError(apiError(e)));
  }, [employee.id]);

  const groups = useMemo(() => {
    if (!items) return [];
    const map = new Map();
    for (const it of items) {
      const key =
        it.catalog_item?.category?.name || ITEM_TYPE_LABEL[it.item_type] || "Без категории";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [items]);

  return (
    <Modal
      open
      wide
      title={`Выдано — ${employee.full_name}`}
      onClose={onClose}
      footer={
        <button className="btn btn-secondary" onClick={onClose}>
          Закрыть
        </button>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Сотруднику ничего не выдано" icon={<IconClipboard size={36} />} />
      ) : (
        groups.map(([category, list]) => (
          <div key={category} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 8px" }}>
              <h4 style={{ margin: 0 }}>{category}</h4>
              <Badge kind="badge-gray" dot={false}>{list.length}</Badge>
            </div>
            <table className="data">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Инв. / сер. №</th>
                  <th style={{ textAlign: "center" }}>Кол-во</th>
                  <th>Выдано</th>
                  <th>Срок до</th>
                  <th>Состояние</th>
                </tr>
              </thead>
              <tbody>
                {list.map((it) => (
                  <tr key={it.id}>
                    <td className="cell-strong">
                      {it.catalog_item?.name || "—"}
                      {it.catalog_item?.subcategory?.name && (
                        <div className="cell-sub">{it.catalog_item.subcategory.name}</div>
                      )}
                    </td>
                    <td>{it.inventory_number || it.serial_number || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      {it.quantity}
                      {it.catalog_item?.unit ? ` ${it.catalog_item.unit}` : ""}
                    </td>
                    <td>{fmtDate(it.date_issued)}</td>
                    <td>{fmtDate(it.service_end_date)}</td>
                    <td>
                      <Badge kind={DEADLINE_BADGE[it.deadline_status] || "badge-gray"}>
                        {DEADLINE_LABEL[it.deadline_status] || "—"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </Modal>
  );
}

function EmployeeModal({ emp, departments, onClose, onSaved }) {
  const isEdit = !!emp.id;
  const [form, setForm] = useState({
    ...emp,
    eb_group: emp.eb_group || "",
    eb_exam_date: emp.eb_exam_date || "",
    eb_next_exam_date: emp.eb_next_exam_date || "",
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    setBusy(true);
    const payload = {
      full_name: form.full_name,
      personnel_number: form.personnel_number || null,
      position: form.position || null,
      department_id: Number(form.department_id),
      brigade: form.brigade || null,
      phone: form.phone || null,
      status: form.status,
      comment: form.comment || null,
      eb_group: form.eb_group || null,
      eb_exam_date: form.eb_exam_date || null,
      eb_next_exam_date: form.eb_next_exam_date || null,
    };
    try {
      if (isEdit) await api.put(`/api/employees/${emp.id}`, payload);
      else await api.post("/api/employees", payload);
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={isEdit ? "Редактирование сотрудника" : "Новый сотрудник"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !form.full_name || !form.department_id}>
            Сохранить
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="form-grid">
        <Field label="ФИО" required>
          <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <Field label="Табельный номер">
          <Input value={form.personnel_number} onChange={(e) => set("personnel_number", e.target.value)} />
        </Field>
        <Field label="Должность">
          <Select value={form.position} onChange={(e) => set("position", e.target.value)}>
            <option value="">— выберите —</option>
            <option value="Мастер">Мастер</option>
            <option value="Электромонтер">Электромонтер</option>
            <option value="Начальник">Начальник</option>
            <option value="Инженер">Инженер</option>
          </Select>
        </Field>
        <Field label="Подразделение" required>
          <Select value={form.department_id} onChange={(e) => set("department_id", e.target.value)}>
            <option value="">— выберите —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Участок / бригада">
          <Input value={form.brigade} onChange={(e) => set("brigade", e.target.value)} />
        </Field>
        <Field label="Телефон">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Статус">
          <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
            {Object.entries(EMPLOYEE_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>

        {/* Охрана труда — электробезопасность */}
        <div className="field full" style={{ marginTop: 4 }}>
          <label style={{ fontWeight: 600, color: "var(--navy)" }}>Охрана труда — электробезопасность</label>
        </div>
        <Field label="Группа по ЭБ">
          <Select value={form.eb_group} onChange={(e) => set("eb_group", e.target.value)}>
            <option value="">—</option>
            {EB_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="Дата проверки знаний ЭБ">
          <Input type="date" value={form.eb_exam_date} onChange={(e) => set("eb_exam_date", e.target.value)} />
        </Field>
        <Field label="Следующая проверка ЭБ">
          <Input type="date" value={form.eb_next_exam_date} onChange={(e) => set("eb_next_exam_date", e.target.value)} />
        </Field>

        <div className="field full">
          <label>Допуски / права</label>
          {isEdit ? (
            <AuthorizationsEditor employeeId={emp.id} />
          ) : (
            <div className="hint">Сохраните сотрудника, затем добавьте допуски в его карточке.</div>
          )}
        </div>

        <div className="field full">
          <label>Комментарий</label>
          <Textarea value={form.comment} onChange={(e) => set("comment", e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// Editable list of an employee's authorizations / rights (ОТ). Free-form name.
function AuthorizationsEditor({ employeeId }) {
  const blank = { name: "", issued_date: "", expiry_date: "", note: "", custom: false };
  const [list, setList] = useState([]);
  const [draft, setDraft] = useState(null); // null = closed; object = add/edit form
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    () => api.get(`/api/employees/${employeeId}/authorizations`).then(({ data }) => setList(data)).catch(() => {}),
    [employeeId]
  );
  useEffect(() => {
    load();
  }, [load]);

  const setD = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  // Rights already assigned drop out of the dropdown, so you keep adding the
  // remaining ones until the list is exhausted (Render-env-vars style). When
  // editing, the row's own value stays selectable.
  const used = new Set(list.map((a) => a.name));
  const availableRights = OT_RIGHTS.filter((r) => !used.has(r) || (draft && r === draft.name));

  const save = async (again) => {
    setBusy(true);
    setError(null);
    const payload = {
      name: draft.name,
      issued_date: draft.issued_date || null,
      expiry_date: draft.expiry_date || null,
      note: draft.note || null,
    };
    try {
      if (draft.id) await api.put(`/api/employees/${employeeId}/authorizations/${draft.id}`, payload);
      else await api.post(`/api/employees/${employeeId}/authorizations`, payload);
      await load();
      setDraft(again ? { ...blank } : null);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Удалить запись допуска?")) return;
    try {
      await api.delete(`/api/employees/${employeeId}/authorizations/${id}`);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  const startEdit = (a) =>
    setDraft({
      ...a,
      issued_date: a.issued_date || "",
      expiry_date: a.expiry_date || "",
      note: a.note || "",
      custom: !OT_RIGHTS.includes(a.name),
    });

  return (
    <div>
      {list.length === 0 && !draft && <div className="hint">Допуски не добавлены.</div>}
      {list.length > 0 && (
        <table className="data" style={{ margin: "4px 0 8px" }}>
          <thead>
            <tr>
              <th>Вид допуска / права</th>
              <th>Выдан</th>
              <th>Действует до</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td className="cell-strong">
                  {a.name}
                  {a.note && <div className="cell-sub">{a.note}</div>}
                </td>
                <td>{a.issued_date || "—"}</td>
                <td>{a.expiry_date || "—"}</td>
                <td>
                  <div className="btn-row">
                    <button type="button" className="btn btn-icon btn-ghost" title="Изменить" onClick={() => startEdit(a)}>
                      <IconEdit size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost"
                      style={{ color: "var(--red)" }}
                      title="Удалить"
                      onClick={() => remove(a.id)}
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {draft ? (
        <div className="card card-pad" style={{ background: "var(--surface-2)" }}>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="form-grid">
            <div className="field full">
              <label>Вид допуска / права <span style={{ color: "var(--red)" }}>*</span></label>
              <Select
                value={draft.custom ? "__custom__" : draft.name || ""}
                onChange={(e) => {
                  if (e.target.value === "__custom__") setDraft((d) => ({ ...d, custom: true, name: "" }));
                  else setDraft((d) => ({ ...d, custom: false, name: e.target.value }));
                }}
              >
                <option value="">— выберите право —</option>
                {availableRights.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="__custom__">Другое (вписать вручную)…</option>
              </Select>
              {draft.custom && (
                <Input
                  style={{ marginTop: 6 }}
                  value={draft.name}
                  onChange={(e) => setD("name", e.target.value)}
                  placeholder="Впишите вид права / допуска"
                  autoFocus
                />
              )}
            </div>
            <Field label="Дата выдачи / проверки">
              <Input type="date" value={draft.issued_date} onChange={(e) => setD("issued_date", e.target.value)} />
            </Field>
            <Field label="Действует до / следующая">
              <Input type="date" value={draft.expiry_date} onChange={(e) => setD("expiry_date", e.target.value)} />
            </Field>
            <div className="field full">
              <label>Примечание</label>
              <Textarea value={draft.note} onChange={(e) => setD("note", e.target.value)} />
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>
              Отмена
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => save(false)} disabled={busy || !draft.name}>
              Сохранить
            </button>
            {!draft.id && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => save(true)} disabled={busy || !draft.name}>
                Сохранить и добавить ещё
              </button>
            )}
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft({ ...blank })}>
          <IconPlus size={15} /> Добавить право
        </button>
      )}
    </div>
  );
}
