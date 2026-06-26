import React, { useState } from "react";
import api, { apiError } from "../api/client.js";
import { Alert, Spinner } from "../components/ui.jsx";
import { IconDownload, IconPlus } from "../components/icons.jsx";
import exportExcel from "../lib/exportExcel.js";
import PageHeading from "../components/PageHeading.jsx";

export default function ImportIssued() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [errors, setErrors] = useState([]);

  const downloadTemplate = async () => {
    const resp = await api.get("/api/import-issued/template", { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([resp.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = "issued_register_template.xlsx";
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
      const { data } = await api.post("/api/import-issued/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMsg({ kind: data.error_count > 0 ? "warning" : "success", text: data.detail });
      if (data.errors) setErrors(data.errors);
      setFile(null);
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const exportErrors = async () => {
    const rows = errors.map((e) => ({
      "Строка": e.row,
      "ФИО": e.fio,
      "Наименование": e.item,
      "Причины ошибки": e.errors.join("; "),
    }));
    await exportExcel(rows, "Ошибки импорта", "import_errors");
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Импорт реестра выданного</PageHeading>
          <div className="subtitle">Загрузка реестров выданных СИЗ, СИ и оборудования из Excel</div>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 700 }}>
        <h3 style={{ fontSize: 14.5, marginBottom: 8 }}>1. Скачайте шаблон</h3>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 6 }}>
          Заполните шаблон данными. Формат ФИО — полностью как в базе (Фамилия Имя Отчество).
        </p>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          <strong>Проверяется при загрузке:</strong> наличие ФИО в базе, наличие номенклатуры в справочнике,
          принадлежность сотрудника к указанному подразделению.
        </p>
        <button className="btn btn-secondary" onClick={downloadTemplate}>
          <IconDownload size={16} /> Скачать шаблон
        </button>

        <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid var(--border)" }} />

        <h3 style={{ fontSize: 14.5, marginBottom: 12 }}>2. Загрузите заполненный файл</h3>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files[0] || null)}
          style={{ fontSize: 13, marginBottom: 12 }}
        />
        <br />
        <button className="btn btn-primary" onClick={upload} disabled={!file || busy}>
          {busy ? <Spinner /> : <><IconPlus size={16} /> Загрузить реестр</>}
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 16 }}>
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}

      {errors.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h3 style={{ color: "var(--red)" }}>Ошибки загрузки ({errors.length})</h3>
            <button className="btn btn-secondary btn-sm" onClick={exportErrors}>
              <IconDownload size={14} /> Выгрузить ошибки в Excel
            </button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Строка</th>
                  <th>ФИО</th>
                  <th>Наименование</th>
                  <th>Причины</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i}>
                    <td className="num">{e.row}</td>
                    <td className="cell-strong">{e.fio || "—"}</td>
                    <td>{e.item || "—"}</td>
                    <td style={{ color: "var(--red)", fontSize: 12 }}>
                      {e.errors.map((err, j) => (
                        <div key={j}>• {err}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
