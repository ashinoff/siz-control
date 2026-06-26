import React, { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client.js";
import { Badge, Spinner, EmptyState, Modal, Field, Input, Textarea, Select, Alert, ConfirmDialog } from "../components/ui.jsx";
import { ITEM_TYPE_LABEL, LIFE_UNIT_OPTIONS, MEASURE_UNIT_OPTIONS, GENDER_OPTIONS, fmtLife } from "../lib/format.js";
import { IconPlus, IconEdit, IconTrash, IconBook } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

const TYPE_TABS = [
  { key: "ppe", label: "СИЗ" },
  { key: "equipment", label: "Оборудование" },
  { key: "material", label: "Материалы" },
];

export default function Catalog() {
  const [view, setView] = useState("nomenclature");
  const [type, setType] = useState("ppe");

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Справочники</PageHeading>
          <div className="subtitle">Категории, подкатегории и номенклатура СИЗ, материалов и оборудования.</div>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab ${view === "nomenclature" ? "active" : ""}`} onClick={() => setView("nomenclature")}>
          Номенклатура
        </div>
        <div className={`tab ${view === "categories" ? "active" : ""}`} onClick={() => setView("categories")}>
          Категории и подкатегории
        </div>
      </div>

      <div className="toolbar">
        {TYPE_TABS.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${type === t.key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "nomenclature" ? <Nomenclature type={type} /> : <Categories type={type} />}
    </div>
  );
}

// ---------- Categories & subcategories ----------
function Categories({ type }) {
  const [categories, setCategories] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catModal, setCatModal] = useState(null);
  const [subModal, setSubModal] = useState(null);
  const [del, setDel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        api.get("/api/catalog/categories", { params: { item_type: type } }),
        api.get("/api/catalog/subcategories"),
      ]);
      setCategories(c.data);
      setSubs(s.data);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const subsByCat = useMemo(() => {
    const m = {};
    subs.forEach((s) => (m[s.category_id] = m[s.category_id] || []).push(s));
    return m;
  }, [subs]);

  const doDelete = async () => {
    try {
      const url =
        del.kind === "cat" ? `/api/catalog/categories/${del.id}` : `/api/catalog/subcategories/${del.id}`;
      await api.delete(url);
      setDel(null);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <span className="text-muted" style={{ fontSize: 13 }}>
          Категорий: {categories.length}
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => setCatModal({ name: "", item_type: type })}>
          <IconPlus size={16} /> Категория
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="card">
          <EmptyState title="Нет категорий" icon={<IconBook size={36} />} />
        </div>
      ) : (
        categories.map((c) => (
          <div className="card" key={c.id} style={{ marginBottom: 12 }}>
            <div className="card-header">
              <h3>{c.name}</h3>
              <div className="btn-row">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSubModal({ name: "", category_id: c.id, _catName: c.name })}
                >
                  <IconPlus size={14} /> Подкатегория
                </button>
                <button className="btn btn-icon btn-ghost" onClick={() => setCatModal(c)}>
                  <IconEdit size={15} />
                </button>
                <button
                  className="btn btn-icon btn-ghost"
                  style={{ color: "var(--red)" }}
                  onClick={() => setDel({ kind: "cat", id: c.id, name: c.name })}
                >
                  <IconTrash size={15} />
                </button>
              </div>
            </div>
            <div className="card-pad">
              {(subsByCat[c.id] || []).length === 0 ? (
                <span className="text-muted" style={{ fontSize: 13 }}>
                  Нет подкатегорий
                </span>
              ) : (
                <div className="chips">
                  {subsByCat[c.id].map((s) => (
                    <span className="tag-pill" key={s.id}>
                      {s.name}
                      <button
                        onClick={() => setSubModal(s)}
                        style={{ border: "none", background: "none", cursor: "pointer", color: "var(--navy-600)", padding: 0 }}
                      >
                        <IconEdit size={13} />
                      </button>
                      <button
                        onClick={() => setDel({ kind: "sub", id: s.id, name: s.name })}
                        style={{ border: "none", background: "none", cursor: "pointer", color: "var(--red)", padding: 0 }}
                      >
                        <IconTrash size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {catModal && (
        <CategoryModal cat={catModal} type={type} onClose={() => setCatModal(null)} onSaved={() => { setCatModal(null); load(); }} />
      )}
      {subModal && (
        <SubcategoryModal sub={subModal} onClose={() => setSubModal(null)} onSaved={() => { setSubModal(null); load(); }} />
      )}
      <ConfirmDialog
        open={!!del}
        danger
        title="Удалить запись?"
        message={`«${del?.name}» будет деактивирована.`}
        confirmText="Удалить"
        onConfirm={doDelete}
        onClose={() => setDel(null)}
      />
    </div>
  );
}

function CategoryModal({ cat, type, onClose, onSaved }) {
  const isEdit = !!cat.id;
  const [name, setName] = useState(cat.name || "");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isEdit) await api.put(`/api/catalog/categories/${cat.id}`, { name });
      else await api.post("/api/catalog/categories", { name, item_type: type });
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
      title={isEdit ? "Категория" : "Новая категория"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !name}>Сохранить</button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <Field label="Название" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}

function SubcategoryModal({ sub, onClose, onSaved }) {
  const isEdit = !!sub.id;
  const [name, setName] = useState(sub.name || "");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isEdit) await api.put(`/api/catalog/subcategories/${sub.id}`, { name });
      else await api.post("/api/catalog/subcategories", { name, category_id: sub.category_id });
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
      title={isEdit ? "Подкатегория" : `Подкатегория · ${sub._catName || ""}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !name}>Сохранить</button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <Field label="Название" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}

// ---------- Nomenclature (catalog items) ----------
function Nomenclature({ type }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/catalog/items", { params: { item_type: type } });
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const doDelete = async () => {
    try {
      await api.delete(`/api/catalog/items/${del.id}`);
      setDel(null);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <span className="text-muted" style={{ fontSize: 13 }}>
          Позиций: {items.length}
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ item_type: type })}>
          <IconPlus size={16} /> Позиция справочника
        </button>
      </div>

      <div className="card">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="Справочник пуст" icon={<IconBook size={36} />} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Категория</th>
                  <th>Ед. изм.</th>
                  <th>Пол</th>
                  <th>Срок службы</th>
                  <th>Поверка</th>
                  <th>Период поверки</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <div className="cell-strong">{it.name}</div>
                      {it.description && <div className="cell-sub">{it.description}</div>}
                    </td>
                    <td>
                      {it.category?.name || "—"}
                      {it.subcategory ? ` / ${it.subcategory.name}` : ""}
                    </td>
                    <td>{it.unit || "—"}</td>
                    <td>{it.gender || "—"}</td>
                    <td>{fmtLife(it.life_value, it.life_unit)}</td>
                    <td>
                      {it.requires_verification ? (
                        <Badge kind="badge-blue">Требуется</Badge>
                      ) : (
                        <Badge kind="badge-gray">Нет</Badge>
                      )}
                    </td>
                    <td>{it.requires_verification ? fmtLife(it.verification_period_value, it.verification_period_unit) : "—"}</td>
                    <td>
                      <div className="btn-row">
                        <button className="btn btn-icon btn-ghost" onClick={() => setModal(it)}>
                          <IconEdit size={15} />
                        </button>
                        <button
                          className="btn btn-icon btn-ghost"
                          style={{ color: "var(--red)" }}
                          onClick={() => setDel(it)}
                        >
                          <IconTrash size={15} />
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
        <CatalogItemModal item={modal} type={type} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      <ConfirmDialog
        open={!!del}
        danger
        title="Удалить позицию справочника?"
        message={`«${del?.name}» будет деактивирована.`}
        confirmText="Удалить"
        onConfirm={doDelete}
        onClose={() => setDel(null)}
      />
    </div>
  );
}

function CatalogItemModal({ item, type, onClose, onSaved }) {
  const isEdit = !!item.id;
  const [form, setForm] = useState({
    name: item.name || "",
    description: item.description || "",
    unit: item.unit || "шт",
    gender: item.gender || "",
    category_id: item.category_id || "",
    subcategory_id: item.subcategory_id || "",
    life_value: item.life_value ?? "",
    life_unit: item.life_unit || "months",
    requires_verification: item.requires_verification ?? false,
    verification_period_value: item.verification_period_value ?? "",
    verification_period_unit: item.verification_period_unit || "months",
  });
  const [categories, setCategories] = useState([]);
  const [subs, setSubs] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get("/api/catalog/categories", { params: { item_type: type } }).then(({ data }) => setCategories(data));
    api.get("/api/catalog/subcategories").then(({ data }) => setSubs(data));
  }, [type]);

  const subOptions = subs.filter((s) => s.category_id === Number(form.category_id));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name,
      description: form.description || null,
      unit: form.unit || null,
      gender: form.gender || null,
      category_id: form.category_id ? Number(form.category_id) : null,
      subcategory_id: form.subcategory_id ? Number(form.subcategory_id) : null,
      life_value: form.life_value === "" ? null : Number(form.life_value),
      life_unit: form.life_unit || null,
      requires_verification: !!form.requires_verification,
      verification_period_value:
        form.requires_verification && form.verification_period_value !== ""
          ? Number(form.verification_period_value)
          : null,
      verification_period_unit: form.requires_verification ? form.verification_period_unit : null,
    };
    try {
      if (isEdit) await api.put(`/api/catalog/items/${item.id}`, payload);
      else await api.post("/api/catalog/items", { ...payload, item_type: type });
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
      title={`${isEdit ? "Редактирование" : "Новая позиция"} · ${ITEM_TYPE_LABEL[type]}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !form.name}>Сохранить</button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="form-grid">
        <div className="field full">
          <label>Наименование <span style={{ color: "var(--red)" }}>*</span></label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <Field label="Категория">
          <Select value={form.category_id} onChange={(e) => { set("category_id", e.target.value); set("subcategory_id", ""); }}>
            <option value="">— нет —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Подкатегория">
          <Select value={form.subcategory_id} onChange={(e) => set("subcategory_id", e.target.value)} disabled={!form.category_id}>
            <option value="">— нет —</option>
            {subOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Единица измерения">
          <Select value={form.unit} onChange={(e) => set("unit", e.target.value)}>
            {MEASURE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Пол">
          <Select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            {GENDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <div className="field">
          <label>Нормативный срок службы</label>
          <div style={{ display: "flex", gap: 8 }}>
            <Input type="number" min="0" value={form.life_value} onChange={(e) => set("life_value", e.target.value)} style={{ flex: 1 }} />
            <Select value={form.life_unit} onChange={(e) => set("life_unit", e.target.value)} style={{ width: 130 }}>
              {LIFE_UNIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="checkbox-row full" style={{ marginTop: 6 }}>
          <input type="checkbox" id="rv" checked={!!form.requires_verification} onChange={(e) => set("requires_verification", e.target.checked)} />
          <label htmlFor="rv">Требуется поверка / проверка</label>
        </div>
        {form.requires_verification && (
          <div className="field">
            <label>Периодичность поверки</label>
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                type="number"
                min="0"
                value={form.verification_period_value}
                onChange={(e) => set("verification_period_value", e.target.value)}
                style={{ flex: 1 }}
              />
              <Select value={form.verification_period_unit} onChange={(e) => set("verification_period_unit", e.target.value)} style={{ width: 130 }}>
                {LIFE_UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          </div>
        )}
        <div className="field full">
          <label>Описание</label>
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
