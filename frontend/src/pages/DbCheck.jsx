import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client.js";
import { Alert, Badge, Spinner, EmptyState } from "../components/ui.jsx";
import { IconCheckShield, IconAlert } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

export default function DbCheck() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(null);
  const [msg, setMsg] = useState(null);

  const runCheck = async () => {
    setLoading(true);
    setMsg(null);
    setResult(null);
    try {
      const { data } = await api.get("/api/dbcheck");
      setResult(data);
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setLoading(false);
    }
  };

  const doFix = async (action) => {
    setFixing(action);
    setMsg(null);
    try {
      const { data } = await api.post("/api/dbcheck/fix", { action });
      setMsg({ kind: "success", text: data.detail });
      // Re-run check
      const { data: updated } = await api.get("/api/dbcheck");
      setResult(updated);
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setFixing(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Проверка базы данных</PageHeading>
          <div className="subtitle">Поиск и исправление ошибок целостности данных</div>
        </div>
        <button className="btn btn-primary" onClick={runCheck} disabled={loading}>
          {loading ? <Spinner /> : <><IconCheckShield size={16} /> Запустить проверку</>}
        </button>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {result && (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="label">Всего проблем</div>
              <div className="value">{result.total_issues}</div>
            </div>
            <div className="stat">
              <div className="label" style={{ color: "var(--red)" }}>Ошибки</div>
              <div className="value" style={{ color: "var(--red)" }}>{result.errors}</div>
            </div>
            <div className="stat">
              <div className="label" style={{ color: "var(--amber)" }}>Предупреждения</div>
              <div className="value" style={{ color: "var(--amber)" }}>{result.warnings}</div>
            </div>
          </div>

          <div className="card">
            {result.issues.length === 0 ? (
              <EmptyState
                title="Ошибок не найдено"
                hint="База данных в порядке"
                icon={<IconCheckShield size={40} />}
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Тип</th>
                      <th>Категория</th>
                      <th>Описание</th>
                      <th style={{ width: 230 }}>Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.issues.map((issue) => (
                      <tr key={issue.id}>
                        <td>
                          <Badge kind={issue.severity === "error" ? "badge-red" : "badge-amber"}>
                            {issue.severity === "error" ? "Ошибка" : "Внимание"}
                          </Badge>
                        </td>
                        <td className="cell-strong" style={{ fontSize: 12 }}>{issue.category}</td>
                        <td style={{ fontSize: 12 }}>{issue.message}</td>
                        <td>
                          <div className="btn-row" style={{ flexWrap: "wrap", gap: 6 }}>
                            {issue.fix_action && (
                              <button
                                className="btn btn-sm btn-primary"
                                disabled={fixing === issue.fix_action}
                                onClick={() => doFix(issue.fix_action)}
                                style={{ fontSize: 11 }}
                              >
                                {fixing === issue.fix_action ? "..." : issue.fix_label}
                              </button>
                            )}
                            {issue.link && (
                              <Link
                                className="btn btn-sm btn-secondary"
                                to={issue.link}
                                style={{ fontSize: 11 }}
                              >
                                {issue.link_label || "Перейти"}
                              </Link>
                            )}
                            {issue.alt_action && (
                              <button
                                className="btn btn-sm btn-ghost"
                                disabled={fixing === issue.alt_action}
                                onClick={() => doFix(issue.alt_action)}
                                style={{ fontSize: 11, color: "var(--red)" }}
                              >
                                {fixing === issue.alt_action ? "..." : issue.alt_label}
                              </button>
                            )}
                            {!issue.fix_action && !issue.link && !issue.alt_action && (
                              <span className="muted" style={{ fontSize: 11 }}>Ручное исправление</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
