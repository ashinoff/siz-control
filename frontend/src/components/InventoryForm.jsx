import React, { useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client.js";
import { Modal, Field, Input, Textarea, Select, Alert } from "./ui.jsx";
import { ITEM_TYPE_LABEL, LIFE_UNIT_OPTIONS } from "../lib/format.js";

const empty = {
  catalog_item_id: "",
  inventory_number: "",
  serial_number: "",
  brand_model: "",
  quantity: 1,
  department_owner_id: "",
  current_warehouse_id: "",
  date_received: "",
  life_value: "",
  life_unit: "",
  life_starts_in_stock: false,
  requires_verification: null,
  last_verification_date: "",
  next_verification_date: "",
  next_inspection_date: "",
  last_inspection_result: "",
  repair_info: "",
  comment: "",
};

export default function InventoryForm({ open, onClose, onSaved, editItem, defaultType }) {
  const isEdit = !!editItem;
  const [form, setForm] = useState(empty);
  const [catalog, setCatalog] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api.get("/api/catalog/items").then(({ data }) => setCatalog(data));
    api.get("/api/departments").then(({ data }) => setDepartments(data));
    api.get("/api/warehouses").then(({ data }) => setWarehouses(data));

    if (editItem) {
      setForm({
        ...empty,
        ...editItem,
        catalog_item_id: editItem.catalog_item_id,
        department_owner_id: editItem.department_owner_id || "",
        current_warehouse_id: editItem.current_warehouse_id || "",
        life_value: editItem.life_value ?? "",
        life_unit: editItem.life_unit ?? "",
        requires_verification: editItem.requires_verification,
        date_received: editItem.date_received || "",
        last_verification_date: editItem.last_verification_date || "",
        next_verification_date: editItem.next_verification_date || "",
        comment: editItem.comment || "",
        inventory_number: editItem.inventory_number || "",
        serial_number: editItem.serial_number || "",
        brand_model: editItem.brand_model || "",
        next_inspection_date: editItem.next_inspection_date || "",
        last_inspection_result: editItem.last_inspection_result || "",
        repair_info: editItem.repair_info || "",
      });
    } else {
      setForm(empty);
    }
  }, [open, editItem]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const catalogFiltered = useMemo(() => {
    if (isEdit) return catalog;
    if (defaultType === "ppe") return catalog.filter((c) => c.item_type === "ppe");
    if (defaultType === "equipment")
      return catalog.filter((c) => c.item_type === "material" || c.item_type === "equipment");
    return catalog;
  }, [catalog, defaultType, isEdit]);

  const whFiltered = useMemo(() => {
    if (!form.department_owner_id) return warehouses;
    return warehouses.filter((w) => w.department_id === Number(form.department_owner_id));
  }, [warehouses, form.department_owner_id]);

  const selectedCatalog = catalog.find((c) => c.id === Number(form.catalog_item_id));

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        inventory_number: form.inventory_number || null,
        serial_number: form.serial_number || null,
        brand_model: form.brand_model || null,
        quantity: Number(form.quantity) || 1,
        current_warehouse_id: form.current_warehouse_id ? Number(form.current_warehouse_id) : null,
        date_received: form.date_received || null,
        life_value: form.life_value === "" ? null : Number(form.life_value),
        life_unit: form.life_unit || null,
        life_starts_in_stock: !!form.life_starts_in_stock,
        requires_verification: form.requires_verification,
        last_verification_date: form.last_verification_date || null,
        next_verification_date: form.next_verification_date || null,
        next_inspection_date: form.next_inspection_date || null,
        last_inspection_result: form.last_inspection_result || null,
        repair_info: form.repair_info || null,
        comment: form.comment || null,
      };
      if (isEdit) {
        await api.put(`/api/inventory/${editItem.id}`, payload);
      } else {
        await api.post("/api/inventory", {
          ...payload,
          catalog_item_id: Number(form.catalog_item_id),
          department_owner_id: Number(form.department_owner_id),
        });
      }
      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = isEdit
    ? true
    : form.catalog_item_id && form.department_owner_id;

  return (
    <Modal
      open={open}
      wide
      title={isEdit ? "Редактирование позиции" : "Новая позиция учёта"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !canSubmit}>
            {busy ? "Сохранение..." : "Сохранить"}
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}

      <div className="form-grid">
        {!isEdit && (
          <Field label="Позиция справочника" required>
            <Select
              value={form.catalog_item_id}
              onChange={(e) => set("catalog_item_id", e.target.value)}
            >
              <option value="">— выберите —</option>
              {catalogFiltered.map((c) => (
                <option key={c.id} value={c.id}>
                  {ITEM_TYPE_LABEL[c.item_type]}: {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {isEdit && (
          <Field label="Позиция справочника">
            <Input value={editItem.catalog_item?.name || ""} disabled />
          </Field>
        )}

        {!isEdit ? (
          <Field label="Подразделение-владелец" required>
            <Select
              value={form.department_owner_id}
              onChange={(e) => {
                set("department_owner_id", e.target.value);
                set("current_warehouse_id", "");
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
        ) : (
          <Field label="Подразделение-владелец">
            <Input value={editItem.department_owner?.name || ""} disabled />
          </Field>
        )}

        <Field label="Склад">
          <Select
            value={form.current_warehouse_id}
            onChange={(e) => set("current_warehouse_id", e.target.value)}
          >
            <option value="">— не на складе —</option>
            {whFiltered.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Кол-во">
          <Input
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </Field>

        <Field label="Инвентарный номер">
          <Input value={form.inventory_number} onChange={(e) => set("inventory_number", e.target.value)} />
        </Field>
        <Field label="Серийный номер">
          <Input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
        </Field>
        <Field label="Марка / тип">
          <Input value={form.brand_model} onChange={(e) => set("brand_model", e.target.value)} placeholder="Модель или тип СИЗ" />
        </Field>

        <Field label="Дата поступления">
          <Input type="date" value={form.date_received} onChange={(e) => set("date_received", e.target.value)} />
        </Field>
        <div className="field">
          <label>Срок службы (переопределение)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              type="number"
              min="0"
              placeholder={selectedCatalog?.life_value ? `из справочника: ${selectedCatalog.life_value}` : "не задан"}
              value={form.life_value}
              onChange={(e) => set("life_value", e.target.value)}
              style={{ flex: 1 }}
            />
            <Select value={form.life_unit} onChange={(e) => set("life_unit", e.target.value)} style={{ width: 130 }}>
              <option value="">ед.</option>
              {LIFE_UNIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="hint">Если пусто — берётся срок из справочника.</div>
        </div>

        <div className="checkbox-row full">
          <input
            type="checkbox"
            id="lsis"
            checked={!!form.life_starts_in_stock}
            onChange={(e) => set("life_starts_in_stock", e.target.checked)}
          />
          <label htmlFor="lsis">
            Срок эксплуатации идёт уже на складе (по умолчанию срок стартует при выдаче сотруднику)
          </label>
        </div>

        <Field label="Дата последней поверки">
          <Input
            type="date"
            value={form.last_verification_date}
            onChange={(e) => set("last_verification_date", e.target.value)}
          />
        </Field>
        <Field label="Дата следующей поверки">
          <Input
            type="date"
            value={form.next_verification_date}
            onChange={(e) => set("next_verification_date", e.target.value)}
          />
        </Field>

        <Field label="Дата следующего осмотра">
          <Input type="date" value={form.next_inspection_date} onChange={(e) => set("next_inspection_date", e.target.value)} />
        </Field>
        <Field label="Результат предыдущего осмотра">
          <Select value={form.last_inspection_result} onChange={(e) => set("last_inspection_result", e.target.value)}>
            <option value="">— не указано —</option>
            <option value="good">Годен</option>
            <option value="failed">Негоден</option>
            <option value="repair">Требует ремонта</option>
          </Select>
        </Field>
        <div className="field full">
          <label>Сведения о ремонтах</label>
          <Textarea value={form.repair_info} onChange={(e) => set("repair_info", e.target.value)} placeholder="Информация о ремонтах, дефектах, восстановлении" />
        </div>
        <div className="field full">
          <label>Комментарий</label>
          <Textarea value={form.comment} onChange={(e) => set("comment", e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
