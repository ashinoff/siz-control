import React, { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, SearchBox, Select, Modal, Field, Input, Textarea, Alert, ConfirmDialog } from "../components/ui.jsx";
import { EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_BADGE } from "../lib/format.js";
import { IconPlus, IconEdit, IconTrash, IconUsers, IconDownload } from "../components/icons.jsx";
import exportExcel from "../lib/exportExcel.js";

const emptyEmp = {
  full_name: "",
  personnel_number: "",
  position: "",
  department_id: "",
  brigade: "",
  phone: "",
  status: "working",
  comment: "",
};

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
          <h1>Персонал</h1>
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
                  {canManage && <th></th>}
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
                    {canManage && (
                      <td>
                        <div className="btn-row">
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
                        </div>
                      </td>
                    )}
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
    </div>
  );
}

function EmployeeModal({ emp, departments, onClose, onSaved }) {
  const isEdit = !!emp.id;
  const [form, setForm] = useState(emp);
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
        <div className="field full">
          <label>Комментарий</label>
          <Textarea value={form.comment} onChange={(e) => set("comment", e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
