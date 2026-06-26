import React, { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, SearchBox, Select, ConfirmDialog } from "../components/ui.jsx";
import InventoryDetail from "../components/InventoryDetail.jsx";
import { ITEM_TYPE_LABEL, fmtDate } from "../lib/format.js";
import { IconWriteoff, IconArrowIn, IconReport } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

const TYPE_OPTIONS = [
  { value: "", label: "Все типы" },
  { value: "ppe", label: "СИЗ" },
  { value: "material", label: "Материалы" },
  { value: "equipment", label: "Оборудование" },
];

// Items condemned as unfit collect here (status "К списанию") before a formal
// write-off memo (М-37) is produced. Privileged users can finalize the
// write-off or return a wrongly-marked item back to stock.
export default function Writeoff() {
  const { isPrivileged } = useAuth();
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeF, setTypeF] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [toWriteoff, setToWriteoff] = useState(null);
  const [toRestore, setToRestore] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = { status: "to_writeoff" };
    if (search) params.search = search;
    if (typeF) params.item_type = typeF;
    if (departmentId) params.department_id = departmentId;
    api
      .get("/api/inventory", { params })
      .then(({ data }) => setItems(data))
      .finally(() => setLoading(false));
  }, [search, typeF, departmentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, []);

  const doWriteoff = async () => {
    try {
      await api.post(`/api/operations/writeoff/${toWriteoff.id}`);
      setToWriteoff(null);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  const doRestore = async () => {
    try {
      await api.post(`/api/operations/restore/${toRestore.id}`);
      setToRestore(null);
      load();
    } catch (e) {
      alert(apiError(e));
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Списание</PageHeading>
          <div className="subtitle">
            Позиции, отмеченные негодными. Отсюда формируется служебная записка на списание (М-37).
          </div>
        </div>
      </div>

      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Наименование, инв. или серийный №" />
        <Select value={typeF} onChange={(e) => setTypeF(e.target.value)}>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
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
            title="Нет позиций к списанию"
            hint="Сюда попадают позиции, отмеченные негодными при поверке, возврате или вручную."
            icon={<IconWriteoff size={40} />}
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Тип</th>
                  <th>Инв. / Серийный №</th>
                  <th>Подразделение</th>
                  <th>Кол-во</th>
                  <th>Окончание срока</th>
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
                    <td className="muted">{it.department_owner?.name || "—"}</td>
                    <td className="num">
                      {it.quantity}
                      {it.catalog_item?.unit ? ` ${it.catalog_item.unit}` : ""}
                    </td>
                    <td>{fmtDate(it.service_end_date)}</td>
                    {isPrivileged && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="btn-row">
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Вернуть на склад (отменить списание)"
                            onClick={() => setToRestore(it)}
                          >
                            <IconArrowIn size={15} /> На склад
                          </button>
                          <button
                            className="btn btn-outline-danger btn-sm"
                            title="Списать окончательно"
                            onClick={() => setToWriteoff(it)}
                          >
                            <IconWriteoff size={15} /> Списать
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Служебная записка М-37 — будет добавлена позже"
                            disabled
                          >
                            <IconReport size={15} /> М-37
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

      <InventoryDetail open={!!detailId} itemId={detailId} onClose={() => setDetailId(null)} />
      <ConfirmDialog
        open={!!toWriteoff}
        danger
        title="Списать позицию?"
        message={`Позиция «${toWriteoff?.catalog_item?.name || ""}» будет списана (статус «Списано»). Действие можно проследить в журнале.`}
        confirmText="Списать"
        onConfirm={doWriteoff}
        onClose={() => setToWriteoff(null)}
      />
      <ConfirmDialog
        open={!!toRestore}
        title="Вернуть на склад?"
        message={`Позиция «${toRestore?.catalog_item?.name || ""}» вернётся на склад со статусом «На складе».`}
        confirmText="Вернуть"
        onConfirm={doRestore}
        onClose={() => setToRestore(null)}
      />
    </div>
  );
}
