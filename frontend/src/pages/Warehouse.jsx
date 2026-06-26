import React, { useEffect, useMemo, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Badge, Spinner, EmptyState, SearchBox, Select } from "../components/ui.jsx";
import InventoryDetail from "../components/InventoryDetail.jsx";
import {
  ITEM_TYPE_LABEL,
  DEADLINE_LABEL,
  DEADLINE_BADGE,
  VERIF_LABEL,
  VERIF_BADGE,
  fmtDate,
} from "../lib/format.js";
import { IconWarehouse, IconDownload } from "../components/icons.jsx";
import exportExcel from "../lib/exportExcel.js";
import PageHeading from "../components/PageHeading.jsx";

export default function Warehouse() {
  const { isPrivileged } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState("");
  const [typeF, setTypeF] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get("/api/departments").then(({ data }) => setDepartments(data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { status: "in_stock" };
    if (search) params.search = search;
    if (typeF) params.item_type = typeF;
    if (departmentId) params.department_id = departmentId;
    api
      .get("/api/inventory", { params })
      .then(({ data }) => setItems(data))
      .finally(() => setLoading(false));
  }, [search, typeF, departmentId]);

  const grouped = useMemo(() => {
    const map = {};
    for (const it of items) {
      const key = it.current_warehouse?.name || it.department_owner?.name || "Без склада";
      (map[key] = map[key] || []).push(it);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [items]);

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Склад</PageHeading>
          <div className="subtitle">Позиции на складах подразделений: {items.length}</div>
        </div>
        <button
          className="btn btn-secondary"
          disabled={exporting || items.length === 0}
          onClick={async () => {
            setExporting(true);
            try {
              const rows = items.map((it) => ({
                "Наименование": it.catalog_item?.name || "",
                "Тип": ITEM_TYPE_LABEL[it.item_type] || it.item_type,
                "Инв. номер": it.inventory_number || "",
                "Серийный номер": it.serial_number || "",
                "Кол-во": it.quantity,
                "Склад": it.current_warehouse?.name || "",
                "Подразделение": it.department_owner?.name || "",
                "Поступление": it.date_received || "",
                "Статус срока": DEADLINE_LABEL[it.deadline_status] || "",
                "Статус поверки": VERIF_LABEL[it.verification_status] || "",
              }));
              await exportExcel(rows, "Склад", "warehouse");
            } finally {
              setExporting(false);
            }
          }}
        >
          <IconDownload size={16} /> Excel
        </button>
      </div>

      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Наименование, инв. или серийный №" />
        <Select value={typeF} onChange={(e) => setTypeF(e.target.value)}>
          <option value="">Все типы</option>
          {Object.entries(ITEM_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
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

      {loading ? (
        <Spinner />
      ) : grouped.length === 0 ? (
        <div className="card">
          <EmptyState title="На складах нет позиций" icon={<IconWarehouse size={40} />} />
        </div>
      ) : (
        grouped.map(([wh, rows]) => (
          <div className="card" key={wh} style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3>
                <IconWarehouse size={16} style={{ verticalAlign: "-3px", marginRight: 7, color: "var(--navy-500)" }} />
                {wh}
              </h3>
              <span className="text-muted" style={{ fontSize: 13 }}>
                {rows.length} поз.
              </span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Наименование</th>
                    <th>Тип</th>
                    <th>Инв. / Серийный №</th>
                    <th className="text-right">Кол-во</th>
                    <th>Поступление</th>
                    <th>Срок</th>
                    <th>Поверка</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it) => (
                    <tr key={it.id} className="row-click" onClick={() => setDetailId(it.id)}>
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
                      <td className="text-right num">{it.quantity}</td>
                      <td>{fmtDate(it.date_received)}</td>
                      <td>
                        <Badge kind={DEADLINE_BADGE[it.deadline_status]}>
                          {DEADLINE_LABEL[it.deadline_status]}
                        </Badge>
                      </td>
                      <td>
                        <Badge kind={VERIF_BADGE[it.verification_status]}>
                          {VERIF_LABEL[it.verification_status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <InventoryDetail open={!!detailId} itemId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
