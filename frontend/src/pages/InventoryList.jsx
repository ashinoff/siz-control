import React, { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, SearchBox, Select, ConfirmDialog } from "../components/ui.jsx";
import InventoryForm from "../components/InventoryForm.jsx";
import InventoryDetail from "../components/InventoryDetail.jsx";
import {
  ITEM_TYPE_LABEL,
  INV_STATUS_LABEL,
  INV_STATUS_BADGE,
  DEADLINE_LABEL,
  DEADLINE_BADGE,
  VERIF_LABEL,
  VERIF_BADGE,
  fmtDate,
} from "../lib/format.js";
import { IconPlus, IconEdit, IconTrash, IconBox, IconDownload, IconWriteoff } from "../components/icons.jsx";
import exportExcel from "../lib/exportExcel.js";
import PageHeading from "../components/PageHeading.jsx";

const CONFIG = {
  ppe: { title: "Средства индивидуальной защиты", types: ["ppe"], itemType: "ppe" },
  material: { title: "Материалы", types: ["material"], itemType: "material" },
  equipment: { title: "Оборудование", types: ["equipment"], itemType: "equipment" },
};

export default function InventoryList({ scope }) {
  const cfg = CONFIG[scope];
  const { isPrivileged, isAdmin } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statusF, setStatusF] = useState("");
  const [deadlineF, setDeadlineF] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [toCondemn, setToCondemn] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (cfg.itemType) params.item_type = cfg.itemType;
      if (search) params.search = search;
      if (categoryId) params.category_id = categoryId;
      if (statusF) params.status = statusF;
      if (deadlineF) params.deadline = deadlineF;
      if (departmentId) params.department_id = departmentId;
      const { data } = await api.get("/api/inventory", { params });
      const filtered = data.filter((i) => cfg.types.includes(i.item_type));
      setItems(filtered);
    } finally {
      setLoading(false);
    }
  }, [cfg.itemType, search, categoryId, statusF, deadlineF, departmentId, cfg.types]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get("/api/catalog/categories").then(({ data }) =>
      setCategories(data.filter((c) => cfg.types.includes(c.item_type)))
    );
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, [scope]);

  const doDelete = async () => {
    try {
      await api.delete(`/api/inventory/${toDelete.id}`);
      setToDelete(null);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  const doCondemn = async () => {
    try {
      await api.post("/api/operations/condemn", { inventory_item_id: toCondemn.id });
      setToCondemn(null);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const rows = items.map((it) => ({
        "Наименование": it.catalog_item?.name || "",
        "Тип": ITEM_TYPE_LABEL[it.item_type] || it.item_type,
        "Инв. номер": it.inventory_number || "",
        "Серийный номер": it.serial_number || "",
        "Кол-во": it.quantity,
        "Статус": INV_STATUS_LABEL[it.status] || it.status,
        "Местонахождение": it.status === "issued"
          ? (it.current_employee?.full_name || "")
          : (it.current_warehouse?.name || ""),
        "Подразделение": it.department_owner?.name || "",
        "Окончание срока": it.service_end_date || "",
        "Статус срока": DEADLINE_LABEL[it.deadline_status] || "",
        "Поверка до": it.next_verification_date || "",
        "Статус поверки": VERIF_LABEL[it.verification_status] || "",
      }));
      await exportExcel(rows, cfg.title, scope);
    } finally {
      setExporting(false);
    }
  };

  const openCreate = () => {
    setEditItem(null);
    setFormOpen(true);
  };
  const openEdit = (item) => {
    setEditItem(item);
    setFormOpen(true);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>{cfg.title}</PageHeading>
          <div className="subtitle">Единицы учёта: {items.length}</div>
        </div>
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={doExport} disabled={exporting || items.length === 0}>
            <IconDownload size={16} /> Excel
          </button>
          {isPrivileged && (
            <button className="btn btn-primary" onClick={openCreate}>
              <IconPlus size={17} /> Добавить позицию
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Наименование, инв. или серийный №" />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">Любой статус</option>
          {Object.entries(INV_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={deadlineF} onChange={(e) => setDeadlineF(e.target.value)}>
          <option value="">Любой срок</option>
          <option value="in_date">В сроке</option>
          <option value="expiring">Истекает</option>
          <option value="expired">Просрочено</option>
          <option value="not_started">Не начата</option>
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
        ) : items.length === 0 ? (
          <EmptyState
            title="Позиции не найдены"
            hint={isPrivileged ? "Добавьте первую позицию учёта." : "Нет позиций по заданным условиям."}
            icon={<IconBox size={40} />}
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Тип</th>
                  <th>Инв. / Серийный №</th>
                  <th>Статус</th>
                  <th>Местонахождение</th>
                  <th>Окончание / срок</th>
                  <th>Поверка</th>
                  {isPrivileged && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="row-click" onClick={() => setDetailId(it.id)}>
                    <td>
                      <div className="cell-strong">{it.catalog_item?.name || "—"}</div>
                      {it.catalog_item?.category && (
                        <div className="cell-sub">{it.catalog_item.category.name}</div>
                      )}
                    </td>
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
                      <Badge kind={INV_STATUS_BADGE[it.status]}>{INV_STATUS_LABEL[it.status]}</Badge>
                    </td>
                    <td>
                      {it.status === "issued" ? (
                        <span>{it.current_employee?.full_name || "—"}</span>
                      ) : (
                        <span className="muted">{it.current_warehouse?.name || "—"}</span>
                      )}
                    </td>
                    <td>
                      <Badge kind={DEADLINE_BADGE[it.deadline_status]}>
                        {DEADLINE_LABEL[it.deadline_status]}
                      </Badge>
                      {it.service_end_date && (
                        <div className="cell-sub">{fmtDate(it.service_end_date)}</div>
                      )}
                    </td>
                    <td>
                      <Badge kind={VERIF_BADGE[it.verification_status]}>
                        {VERIF_LABEL[it.verification_status]}
                      </Badge>
                      {it.next_verification_date && it.requires_verification && (
                        <div className="cell-sub">{fmtDate(it.next_verification_date)}</div>
                      )}
                    </td>
                    {isPrivileged && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="btn-row">
                          <button className="btn btn-icon btn-ghost" title="Изменить" onClick={() => openEdit(it)}>
                            <IconEdit size={16} />
                          </button>
                          {it.status === "in_stock" && (
                          <button
                            className="btn btn-icon btn-ghost"
                            title="Отметить негодным (в списание)"
                            style={{ color: "#e8830c" }}
                            onClick={() => setToCondemn(it)}
                          >
                            <IconWriteoff size={16} />
                          </button>
                          )}
                          {isAdmin && it.status === "in_stock" && (
                          <button
                            className="btn btn-icon btn-ghost"
                            title="Удалить"
                            style={{ color: "var(--red)" }}
                            onClick={() => setToDelete(it)}
                          >
                            <IconTrash size={16} />
                          </button>
                          )}
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

      <InventoryForm
        open={formOpen}
        editItem={editItem}
        defaultType={scope}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />
      <InventoryDetail open={!!detailId} itemId={detailId} onClose={() => setDetailId(null)} />
      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Удалить позицию?"
        message={`Позиция «${toDelete?.catalog_item?.name || ""}» будет деактивирована (мягкое удаление). Данные и история сохранятся.`}
        confirmText="Удалить"
        onConfirm={doDelete}
        onClose={() => setToDelete(null)}
      />
      <ConfirmDialog
        open={!!toCondemn}
        danger
        title="Отметить негодным?"
        message={`Позиция «${toCondemn?.catalog_item?.name || ""}» будет снята со склада и перенесена в раздел «Списание».`}
        confirmText="В списание"
        onConfirm={doCondemn}
        onClose={() => setToCondemn(null)}
      />
    </div>
  );
}
