import React, { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner, EmptyState, Select, SearchBox, Badge, Field, Input } from "../components/ui.jsx";
import { IconPlus, IconTrash, IconShield } from "../components/icons.jsx";

export default function Norms() {
  const { isPrivileged } = useAuth();
  const [positions, setPositions] = useState([]);
  const [position, setPosition] = useState("");
  const [normItems, setNormItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/api/norms/positions").then(({ data }) => {
      setPositions(data);
      if (data.length) setPosition(data[0]);
    });
    api.get("/api/catalog/items").then(({ data }) => setCatalog(data.filter((c) => c.is_active)));
  }, []);

  const loadNorm = useCallback(async () => {
    if (!position) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/api/norms/${encodeURIComponent(position)}`);
      setNormItems(data);
    } finally {
      setLoading(false);
    }
  }, [position]);

  useEffect(() => {
    loadNorm();
  }, [loadNorm]);

  const addItem = async (catalogItem) => {
    try {
      await api.post(`/api/norms/${encodeURIComponent(position)}/add`, {
        catalog_item_id: catalogItem.id,
        quantity: 1,
      });
      loadNorm();
    } catch (e) {
      alert(apiError(e));
    }
  };

  const removeItem = async (normId) => {
    try {
      await api.delete(`/api/norms/${encodeURIComponent(position)}/${normId}`);
      loadNorm();
    } catch (e) {
      alert(apiError(e));
    }
  };

  const updateQty = async (normId, qty) => {
    const item = normItems.find((n) => n.id === normId);
    if (!item) return;
    try {
      await api.post(`/api/norms/${encodeURIComponent(position)}/add`, {
        catalog_item_id: item.catalog_item_id,
        quantity: qty,
      });
      loadNorm();
    } catch (e) {
      alert(apiError(e));
    }
  };

  const normCatalogIds = new Set(normItems.map((n) => n.catalog_item_id));

  const filteredCatalog = catalog.filter((c) => {
    if (normCatalogIds.has(c.id)) return false;
    if (c.item_type !== "ppe" && c.item_type !== "equipment") return false;
    if (search) {
      const s = search.toLowerCase();
      return c.name.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>ТОН — Типовые отраслевые нормы</h1>
          <div className="subtitle">Обязательные СИЗ и СИ для каждой должности</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <Field label="Должность">
          <Select value={position} onChange={(e) => setPosition(e.target.value)}>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left: catalog */}
        <div className="card">
          <div className="card-header">
            <h3>Реестр СИЗ и СИ</h3>
          </div>
          <div style={{ padding: "12px 16px 0" }}>
            <SearchBox value={search} onChange={setSearch} placeholder="Поиск по наименованию" />
          </div>
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            {filteredCatalog.length === 0 ? (
              <EmptyState title="Нет доступных позиций" icon={<IconShield size={32} />} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Наименование</th>
                    <th>Тип</th>
                    {isPrivileged && <th style={{ width: 50 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((c) => (
                    <tr key={c.id}>
                      <td className="cell-strong">{c.name}</td>
                      <td>
                        <Badge kind="badge-gray" dot={false}>
                          {c.item_type === "ppe" ? "СИЗ" : "СИ"}
                        </Badge>
                      </td>
                      {isPrivileged && (
                        <td>
                          <button
                            className="btn btn-icon btn-ghost"
                            title="Добавить в норматив"
                            style={{ color: "var(--navy)" }}
                            onClick={() => addItem(c)}
                          >
                            <IconPlus size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: norm */}
        <div className="card">
          <div className="card-header">
            <h3>Норматив: {position}</h3>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Позиций: {normItems.length}
            </span>
          </div>
          {loading ? (
            <Spinner />
          ) : normItems.length === 0 ? (
            <EmptyState
              title="Норматив пуст"
              hint={isPrivileged ? "Добавьте позиции из реестра слева" : "Нормы ещё не заданы"}
              icon={<IconShield size={32} />}
            />
          ) : (
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Наименование</th>
                    <th style={{ width: 80, textAlign: "center" }}>Кол-во</th>
                    {isPrivileged && <th style={{ width: 50 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {normItems.map((n) => (
                    <tr key={n.id}>
                      <td className="cell-strong">{n.catalog_item?.name || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        {isPrivileged ? (
                          <input
                            type="number"
                            min={1}
                            value={n.quantity}
                            onChange={(e) => {
                              const v = Math.max(1, Number(e.target.value) || 1);
                              updateQty(n.id, v);
                            }}
                            style={{ width: 50, textAlign: "center", padding: "2px 4px" }}
                          />
                        ) : (
                          n.quantity
                        )}
                      </td>
                      {isPrivileged && (
                        <td>
                          <button
                            className="btn btn-icon btn-ghost"
                            title="Удалить из норматива"
                            style={{ color: "var(--red)" }}
                            onClick={() => removeItem(n.id)}
                          >
                            <IconTrash size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
