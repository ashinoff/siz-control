import React, { useEffect, useState } from "react";
import api, { apiError } from "../api/client.js";
import { Spinner, EmptyState, Alert } from "../components/ui.jsx";
import { IconBook, IconDownload } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

// Same-origin URL of a document (the API is served from the same host).
const fileUrl = (filename) => `/api/documents/${encodeURIComponent(filename)}`;

export default function Documents() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get("/api/documents")
      .then(({ data }) => setDocs(data))
      .catch((e) => {
        setError(apiError(e));
        setDocs([]);
      });
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <PageHeading>Нормативные акты</PageHeading>
          <div className="subtitle">Библиотека нормативных документов (PDF)</div>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {docs === null ? (
        <Spinner />
      ) : docs.length === 0 ? (
        <div className="card">
          <EmptyState title="Документы не добавлены" icon={<IconBook size={40} />} />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          {docs.map((d) => (
            <div
              key={d.filename}
              className="card card-pad clickable"
              title="Открыть для просмотра"
              onClick={() => window.open(fileUrl(d.filename), "_blank", "noopener")}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <a
                href={fileUrl(d.filename)}
                download
                title="Скачать"
                onClick={(e) => e.stopPropagation()}
                style={{ position: "absolute", top: 8, right: 8, color: "var(--navy)", display: "inline-flex" }}
              >
                <IconDownload size={18} />
              </a>
              <IconBook size={40} style={{ color: "var(--navy)" }} />
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, wordBreak: "break-word" }}>
                {d.title}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
