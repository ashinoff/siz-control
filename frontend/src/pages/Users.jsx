import React, { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client.js";
import { Badge, Spinner, EmptyState, Modal, Field, Input, Select, Alert } from "../components/ui.jsx";
import { ROLE_LABEL } from "../lib/format.js";
import { IconPlus, IconEdit, IconLock, IconUnlock, IconShieldUser } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/users");
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api.get("/api/users/roles").then(({ data }) => setRoles(data));
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, [load]);

  const toggleBlock = async (u) => {
    try {
      await api.post(`/api/users/${u.id}/${u.is_active ? "block" : "unblock"}`);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Пользователи</PageHeading>
          <div className="subtitle">Учётные записи, роли и доступ к подразделениям.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({})}>
          <IconPlus size={17} /> Добавить пользователя
        </button>
      </div>

      <div className="card">
        {loading ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState title="Нет пользователей" icon={<IconShieldUser size={40} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Логин</th>
                  <th>Роль</th>
                  <th>Подразделение</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="cell-strong">{u.full_name}</td>
                    <td className="num">{u.login}</td>
                    <td>
                      <Badge kind={u.role?.code === "admin" ? "badge-blue" : "badge-gray"} dot={false}>
                        {ROLE_LABEL[u.role?.code] || u.role?.name}
                      </Badge>
                    </td>
                    <td>{u.department?.name || <span className="muted">— все —</span>}</td>
                    <td>
                      {u.is_active ? (
                        <Badge kind="badge-green">Активен</Badge>
                      ) : (
                        <Badge kind="badge-red">Заблокирован</Badge>
                      )}
                    </td>
                    <td>
                      <div className="btn-row">
                        <button className="btn btn-icon btn-ghost" onClick={() => setModal(u)} title="Изменить">
                          <IconEdit size={15} />
                        </button>
                        <button
                          className="btn btn-icon btn-ghost"
                          onClick={() => toggleBlock(u)}
                          title={u.is_active ? "Заблокировать" : "Разблокировать"}
                          style={{ color: u.is_active ? "var(--red)" : "var(--green)" }}
                        >
                          {u.is_active ? <IconLock size={15} /> : <IconUnlock size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <UserModal
          user={modal}
          roles={roles}
          departments={departments}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function UserModal({ user, roles, departments, onClose, onSaved }) {
  const isEdit = !!user.id;
  const [form, setForm] = useState({
    login: user.login || "",
    password: "",
    full_name: user.full_name || "",
    role_code: user.role?.code || "res_user",
    department_id: user.department?.id || "",
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const needsDept = form.role_code !== "admin";

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isEdit) {
        const payload = {
          full_name: form.full_name,
          role_code: form.role_code,
          department_id: needsDept && form.department_id ? Number(form.department_id) : null,
        };
        if (form.password) payload.password = form.password;
        await api.put(`/api/users/${user.id}`, payload);
      } else {
        await api.post("/api/users", {
          login: form.login,
          password: form.password,
          full_name: form.full_name,
          role_code: form.role_code,
          department_id: needsDept && form.department_id ? Number(form.department_id) : null,
        });
      }
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const valid = form.full_name && form.role_code && (isEdit || (form.login && form.password)) && (!needsDept || form.department_id);

  return (
    <Modal
      open
      wide
      title={isEdit ? "Редактирование пользователя" : "Новый пользователь"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !valid}>Сохранить</button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="form-grid">
        <Field label="ФИО" required>
          <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <Field label="Логин" required={!isEdit}>
          <Input value={form.login} onChange={(e) => set("login", e.target.value)} disabled={isEdit} />
        </Field>
        <Field label={isEdit ? "Новый пароль" : "Пароль"} required={!isEdit} hint={isEdit ? "Оставьте пустым, чтобы не менять" : "Минимум 4 символа"}>
          <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} />
        </Field>
        <Field label="Роль" required>
          <Select value={form.role_code} onChange={(e) => set("role_code", e.target.value)}>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {ROLE_LABEL[r.code] || r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Подразделение" required={needsDept} hint={!needsDept ? "Администратор не привязан к подразделению" : undefined}>
          <Select value={form.department_id} onChange={(e) => set("department_id", e.target.value)} disabled={!needsDept}>
            <option value="">{needsDept ? "— выберите —" : "— все —"}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
