import React, { useState } from "react";
import api, { apiError } from "../api/client.js";
import { Alert, Spinner, ConfirmDialog } from "../components/ui.jsx";
import { IconDownload, IconUpload } from "../components/icons.jsx";

export default function Backup() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [file, setFile] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [details, setDetails] = useState(null);

  const doExport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const resp = await api.get("/api/backup", { responseType: "blob" });
      const disposition = resp.headers["content-disposition"] || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "backup.json";
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setMsg({ kind: "success", text: "Бэкап скачан" });
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    setConfirmRestore(false);
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setDetails(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/api/restore", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMsg({ kind: "success", text: data.detail });
      setDetails(data.tables);
      setFile(null);
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Резервное копирование</h1>
          <div className="subtitle">Создание и восстановление резервной копии базы данных</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card card-pad">
          <h3 style={{ fontSize: 14.5, marginBottom: 8 }}>Создать бэкап</h3>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Скачивается полная копия базы данных в формате JSON. Файл содержит все таблицы: пользователи, сотрудники, инвентарь, журнал и т.д.
          </p>
          <button className="btn btn-primary" onClick={doExport} disabled={busy}>
            {busy ? <Spinner /> : <><IconDownload size={16} /> Скачать бэкап</>}
          </button>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 14.5, marginBottom: 8 }}>Восстановить из бэкапа</h3>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            Загрузите ранее скачанный файл бэкапа (.json).
          </p>
          <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 16, fontWeight: 500 }}>
            Внимание: все текущие данные будут заменены данными из бэкапа!
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="file"
              accept=".json"
              onChange={(e) => setFile(e.target.files[0] || null)}
              style={{ fontSize: 13 }}
            />
          </div>
          <button
            className="btn btn-danger"
            onClick={() => setConfirmRestore(true)}
            disabled={!file || busy}
            style={{ marginTop: 12, background: "var(--red)", color: "#fff" }}
          >
            {busy ? <Spinner /> : <><IconUpload size={16} /> Восстановить</>}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ marginTop: 16 }}>
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}

      {details && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h3>Результат восстановления</h3>
          </div>
          <div className="table-wrap">
            <table className="data data-bordered">
              <thead>
                <tr>
                  <th>Таблица</th>
                  <th style={{ textAlign: "center" }}>Записей</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(details).map(([table, count]) => (
                  <tr key={table}>
                    <td>{table}</td>
                    <td style={{ textAlign: "center" }}>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRestore}
        danger
        title="Восстановить базу из бэкапа?"
        message="Все текущие данные будут удалены и заменены данными из файла бэкапа. Это действие необратимо. Рекомендуется сначала скачать текущий бэкап."
        confirmText="Восстановить"
        onConfirm={doRestore}
        onClose={() => setConfirmRestore(false)}
      />
    </div>
  );
}
