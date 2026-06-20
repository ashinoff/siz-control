import React, { useEffect, useState } from "react";
import api from "../api/client.js";
import { Modal, Badge, Spinner } from "./ui.jsx";
import {
  ITEM_TYPE_LABEL,
  INV_STATUS_LABEL,
  INV_STATUS_BADGE,
  DEADLINE_LABEL,
  DEADLINE_BADGE,
  VERIF_LABEL,
  VERIF_BADGE,
  VERIF_RESULT_LABEL,
  fmtDate,
  fmtLife,
} from "../lib/format.js";

export default function InventoryDetail({ itemId, open, onClose }) {
  const [item, setItem] = useState(null);
  const [tab, setTab] = useState("info");
  const [assignments, setAssignments] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !itemId) return;
    setLoading(true);
    setTab("info");
    Promise.all([
      api.get(`/api/inventory/${itemId}`),
      api.get(`/api/inventory/${itemId}/assignments`),
      api.get(`/api/inventory/${itemId}/verifications`),
    ])
      .then(([i, a, v]) => {
        setItem(i.data);
        setAssignments(a.data);
        setVerifications(v.data);
      })
      .finally(() => setLoading(false));
  }, [open, itemId]);

  return (
    <Modal open={open} wide onClose={onClose} title={item ? item.catalog_item?.name || "Позиция" : "Позиция"}>
      {loading || !item ? (
        <Spinner />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <Badge kind="badge-gray" dot={false}>
              {ITEM_TYPE_LABEL[item.item_type]}
            </Badge>
            <Badge kind={INV_STATUS_BADGE[item.status]}>{INV_STATUS_LABEL[item.status]}</Badge>
            <Badge kind={DEADLINE_BADGE[item.deadline_status]}>
              Срок: {DEADLINE_LABEL[item.deadline_status]}
            </Badge>
            <Badge kind={VERIF_BADGE[item.verification_status]}>
              Поверка: {VERIF_LABEL[item.verification_status]}
            </Badge>
          </div>

          <div className="tabs">
            <div className={`tab ${tab === "info" ? "active" : ""}`} onClick={() => setTab("info")}>
              Информация
            </div>
            <div className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
              История выдач ({assignments.length})
            </div>
            <div className={`tab ${tab === "verif" ? "active" : ""}`} onClick={() => setTab("verif")}>
              Поверки ({verifications.length})
            </div>
          </div>

          {tab === "info" && (
            <dl className="kv">
              <dt>Инвентарный №</dt>
              <dd>{item.inventory_number || "—"}</dd>
              <dt>Серийный №</dt>
              <dd>{item.serial_number || "—"}</dd>
              <dt>Количество</dt>
              <dd>{item.quantity}</dd>
              <dt>Категория</dt>
              <dd>
                {item.catalog_item?.category?.name || "—"}
                {item.catalog_item?.subcategory ? ` / ${item.catalog_item.subcategory.name}` : ""}
              </dd>
              <dt>Подразделение</dt>
              <dd>{item.department_owner?.name || "—"}</dd>
              <dt>Текущее место</dt>
              <dd>
                {item.status === "issued"
                  ? `Сотрудник: ${item.current_employee?.full_name || "—"}`
                  : item.current_warehouse?.name || "—"}
              </dd>
              <dt>Срок службы</dt>
              <dd>{fmtLife(item.life_value ?? item.catalog_item?.life_value, item.life_unit ?? item.catalog_item?.life_unit)}</dd>
              <dt>Дата поступления</dt>
              <dd>{fmtDate(item.date_received)}</dd>
              <dt>Начало эксплуатации</dt>
              <dd>{fmtDate(item.service_start_date)}</dd>
              <dt>Окончание эксплуатации</dt>
              <dd>{fmtDate(item.service_end_date)}</dd>
              <dt>Требуется поверка</dt>
              <dd>{item.requires_verification ? "Да" : "Нет"}</dd>
              <dt>Последняя поверка</dt>
              <dd>{fmtDate(item.last_verification_date)}</dd>
              <dt>Следующая поверка</dt>
              <dd>{fmtDate(item.next_verification_date)}</dd>
              <dt>Комментарий</dt>
              <dd>{item.comment || "—"}</dd>
            </dl>
          )}

          {tab === "history" && (
            <div className="table-wrap">
              {assignments.length ? (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Выдано</th>
                      <th>Возвращено</th>
                      <th>Состояние</th>
                      <th>Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="cell-strong">{a.employee?.full_name || "—"}</td>
                        <td>{fmtDate(a.issued_date)}</td>
                        <td>{a.returned_date ? fmtDate(a.returned_date) : <span className="muted">на руках</span>}</td>
                        <td>{a.return_condition || "—"}</td>
                        <td className="muted">{a.return_comment || a.issue_comment || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">Позиция ещё не выдавалась</div>
              )}
            </div>
          )}

          {tab === "verif" && (
            <div className="table-wrap">
              {verifications.length ? (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Дата поверки</th>
                      <th>Следующая</th>
                      <th>Результат</th>
                      <th>Протокол</th>
                      <th>Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verifications.map((v) => (
                      <tr key={v.id}>
                        <td>{fmtDate(v.verification_date)}</td>
                        <td>{fmtDate(v.next_verification_date)}</td>
                        <td>{VERIF_RESULT_LABEL[v.result] || v.result}</td>
                        <td>{v.protocol_number || "—"}</td>
                        <td className="muted">{v.comment || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">Поверки не проводились</div>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
