import React, { useState } from "react";
import api, { apiError } from "../api/client.js";
import { Alert, Spinner } from "../components/ui.jsx";
import { IconDownload, IconPlus } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

export default function Import() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [errors, setErrors] = useState([]);

  const downloadTemplate = async () => {
    const resp = await api.get("/api/import/template", { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([resp.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_template.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const upload = async () => {
    if (!file) return;
    setMsg(null);
    setErrors([]);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/api/import/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMsg({ kind: "success", text: data.detail });
      if (data.errors) setErrors(data.errors);
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
          <PageHeading>Импорт из Excel</PageHeading>
          <div className="subtitle">Массовая загрузка СИЗ, материалов и оборудования из файла .xlsx</div>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 600 }}>
        <h3 style={{ fontSize: 14.5, marginBottom: 12 }}>1. Скачайте шаблон</h3>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Заполните шаблон данными. Первая строка — заголовки (не удаляйте). Каждая последующая строка — одна позиция.
        </p>
        <button className="btn btn-secondary" onClick={downloadTemplate}>
          <IconDownload size={16} /> Скачать шаблон
        </button>

        <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid var(--border)" }} />

        <h3 style={{ fontSize: 14.5, marginBottom: 12 }}>2. Загрузите заполненный файл</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files[0] || null)}
            style={{ fontSize: 13 }}
          />
        </div>
        <button className="btn btn-primary" onClick={upload} disabled={!file || busy}>
          {busy ? <Spinner /> : <><IconPlus size={16} /> Импортировать</>}
        </button>

        {msg && (
          <div style={{ marginTop: 16 }}>
            <Alert kind={msg.kind}>{msg.text}</Alert>
          </div>
        )}
        {errors.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--red)" }}>
                Ошибки ({errors.length})
              </summary>
              <ul style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, paddingLeft: 20 }}>
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
