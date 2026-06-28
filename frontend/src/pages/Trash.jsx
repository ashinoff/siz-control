import React, { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client.js";
import { Alert, Badge, Spinner, EmptyState, ConfirmDialog } from "../components/ui.jsx";
import { IconTrash, IconCheckShield } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

export default function Trash() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // `${kind}:${id}` being acted on
  const [msg, setMsg] = useState(null);
  const [toPurge, setToPurge] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/trash");
      setResult(data);
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (rec) => {
    setBusy(`${rec.kind}:${rec.id}`);
    setMsg(null);
    try {
      const { data } = await api.post("/api/trash/restore", { kind: rec.kind, id: rec.id });
      setMsg({ kind: "success", text: data.detail });
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setBusy(null);
    }
  };

  const purge = async (rec) => {
    setBusy(`${rec.kind}:${rec.id}`);
    setMsg(null);
    try {
      const { data } = await api.post("/api/trash/purge", {
        kind: rec.kind,
        id: rec.id,
        // Sever links automatically when the record is blocked by references.
        force: rec.blockers.length > 0,
      });
      setMsg({ kind: "success", text: data.detail });
      setToPurge(null);
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
      setToPurge(null);
    } finally {
      setBusy(null);
    }
  };

  const groups = (result?.groups || []).filter((g) => g.count > 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Удалённое</PageHeading>
          <div className="subtitle">
            Мягко удалённые записи: восстановите или сотрите навсегда. Удаление навсегда возможно
            только если на запись ничего не ссылается.
          </div>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          Обновить
        </button>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {loading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <div className="card">
          <EmptyState title="Корзина пуста" hint="Удалённых записей нет" icon={<IconCheckShield size={40} />} />
        </div>
      ) : (
        groups.map((g) => (
          <div className="card" key={g.kind} style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3>{g.label}</h3>
              <span className="text-muted" style={{ fontSize: 13 }}>{g.count}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Запись</th>
                    <th>Связи (мешают удалить навсегда)</th>
                    <th style={{ width: 230 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {g.records.map((rec) => {
                    const key = `${rec.kind}:${rec.id}`;
                    const blocked = rec.blockers.length > 0;
                    return (
                      <tr key={key}>
                        <td>
                          <div className="cell-strong">{rec.title}</div>
                          {rec.subtitle && <div className="cell-sub">{rec.subtitle}</div>}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {blocked ? (
                            <span className="text-muted">{rec.blockers.join(" · ")}</span>
                          ) : (
                            <Badge kind="badge-green">Нет связей</Badge>
                          )}
                        </td>
                        <td>
                          <div className="btn-row" style={{ gap: 6, justifyContent: "flex-end" }}>
                            <button
                              className="btn btn-sm btn-secondary"
                              disabled={busy === key}
                              onClick={() => restore(rec)}
                            >
                              {busy === key ? "..." : "Восстановить"}
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ color: "var(--red)" }}
                              disabled={busy === key}
                              title={blocked ? "Разорвать связи и удалить навсегда" : "Удалить навсегда"}
                              onClick={() => setToPurge(rec)}
                            >
                              <IconTrash size={14} /> Навсегда
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <ConfirmDialog
        open={!!toPurge}
        danger
        title="Удалить навсегда?"
        message={
          toPurge?.blockers?.length
            ? `«${toPurge.title}» имеет связи: ${toPurge.blockers.join(" · ")}. ` +
              "Они будут разорваны (отвязка сотрудника/категории/склада и удаление связанной истории), " +
              "после чего запись будет стёрта из базы. Действие необратимо. " +
              "Если останутся зависимые записи (например, позиции учёта у категории) — удаление не выполнится."
            : `«${toPurge?.title || ""}» будет стёрта из базы без возможности восстановления.`
        }
        confirmText="Удалить навсегда"
        onConfirm={() => toPurge && purge(toPurge)}
        onClose={() => setToPurge(null)}
      />
    </div>
  );
}
