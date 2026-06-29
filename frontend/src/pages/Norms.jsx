import React, { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner, EmptyState, Select, SearchBox, Badge, Field, Input } from "../components/ui.jsx";
import { IconPlus, IconTrash, IconShield, IconX } from "../components/icons.jsx";
import PageHeading from "../components/PageHeading.jsx";

// Item types that may be added to a position norm (ТОН), with their short
// registry-badge labels (СИ = средства измерения, not "оборудование" here).
const NORM_ITEM_TYPES = ["ppe", "equipment", "material"];
const NORM_TYPE_BADGE = { ppe: "СИЗ", equipment: "СИ", material: "Материал" };

export default function Norms() {
  const { isPrivileged } = useAuth();
  const [positions, setPositions] = useState([]);
  const [position, setPosition] = useState("");
  const [normItems, setNormItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(false);
  // When set to a norm id, picking a catalog item adds it as an
  // interchangeable alternative ("или") to that requirement instead of
  // creating a new one.
  const [altTarget, setAltTarget] = useState(null);

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
      if (altTarget != null) {
        await api.post(
          `/api/norms/${encodeURIComponent(position)}/${altTarget}/alternative`,
          { catalog_item_id: catalogItem.id, quantity: 1 }
        );
      } else {
        await api.post(`/api/norms/${encodeURIComponent(position)}/add`, {
          catalog_item_id: catalogItem.id,
          quantity: 1,
        });
      }
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

  // Remove a whole requirement (all interchangeable members), sequentially to
  // avoid racing the server-side group bookkeeping.
  const removeGroup = async (memberIds) => {
    try {
      for (const id of memberIds) {
        await api.delete(`/api/norms/${encodeURIComponent(position)}/${id}`);
      }
      if (memberIds.includes(altTarget)) setAltTarget(null);
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

  // Collapse interchangeability groups (rows sharing alt_group) into one
  // requirement; standalone rows are their own group, keyed by id.
  const groups = [];
  const groupByKey = new Map();
  for (const n of normItems) {
    const key = n.alt_group != null ? `g${n.alt_group}` : `s${n.id}`;
    let g = groupByKey.get(key);
    if (!g) {
      g = { key, anchorId: n.id, members: [] };
      groupByKey.set(key, g);
      groups.push(g);
    }
    g.members.push(n);
  }
  const altTargetGroup = altTarget != null
    ? groups.find((g) => g.members.some((m) => m.id === altTarget))
    : null;

  // Category options derived from the registry items themselves (СИЗ/СИ only),
  // so the dropdown only lists categories that actually have positions.
  const categoryOptions = useMemo(() => {
    const m = new Map();
    for (const c of catalog) {
      if (!NORM_ITEM_TYPES.includes(c.item_type)) continue;
      if (c.category?.id) m.set(c.category.id, c.category.name);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [catalog]);

  const filteredCatalog = catalog.filter((c) => {
    if (normCatalogIds.has(c.id)) return false;
    if (!NORM_ITEM_TYPES.includes(c.item_type)) return false;
    if (categoryFilter && c.category_id !== Number(categoryFilter)) return false;
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
          <PageHeading>ТОН — Типовые отраслевые нормы</PageHeading>
          <div className="subtitle">Обязательные СИЗ, СИ и материалы для каждой должности</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <Field label="Должность">
          <Select
            value={position}
            onChange={(e) => {
              setPosition(e.target.value);
              setAltTarget(null);
            }}
          >
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
            <h3>Реестр СИЗ, СИ и материалов</h3>
          </div>
          <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Все категории</option>
              {categoryOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
            <SearchBox value={search} onChange={setSearch} placeholder="Поиск по наименованию" />
          </div>
          {altTarget != null && (
            <div
              style={{
                margin: "12px 16px 0",
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--navy-50, #eef2ff)",
                border: "1px solid var(--navy)",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>
                Режим «или»: выбранная позиция станет альтернативой к «
                {altTargetGroup?.members?.[0]?.catalog_item?.name || "—"}»
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setAltTarget(null)}>
                Отмена
              </button>
            </div>
          )}
          <div style={{ maxHeight: 500, overflowY: "auto" }}>
            {filteredCatalog.length === 0 ? (
              <EmptyState title="Нет доступных позиций" icon={<IconShield size={32} />} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Наименование</th>
                    <th>Подкатегория</th>
                    <th>Тип</th>
                    {isPrivileged && <th style={{ width: 50 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((c) => (
                    <tr key={c.id}>
                      <td className="cell-strong">{c.name}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{c.subcategory?.name || "—"}</td>
                      <td>
                        <Badge kind="badge-gray" dot={false}>
                          {NORM_TYPE_BADGE[c.item_type] || c.item_type}
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
                    {isPrivileged && <th style={{ width: 90 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const anchor = g.members[0];
                    const isAltTarget = g.members.some((m) => m.id === altTarget);
                    return (
                      <tr key={g.key}>
                        <td className="cell-strong">
                          {g.members.map((m, i) => (
                            <span key={m.id}>
                              {i > 0 && (
                                <span className="text-muted" style={{ margin: "0 6px", fontStyle: "italic" }}>
                                  или
                                </span>
                              )}
                              {m.catalog_item?.name || "—"}
                              {isPrivileged && g.members.length > 1 && (
                                <button
                                  className="btn btn-icon btn-ghost"
                                  title="Убрать эту альтернативу"
                                  style={{ color: "var(--red)", padding: "0 2px", verticalAlign: "middle" }}
                                  onClick={() => removeItem(m.id)}
                                >
                                  <IconX size={13} />
                                </button>
                              )}
                            </span>
                          ))}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isPrivileged ? (
                            <input
                              type="number"
                              min={1}
                              value={anchor.quantity}
                              onChange={(e) => {
                                const v = Math.max(1, Number(e.target.value) || 1);
                                updateQty(anchor.id, v);
                              }}
                              style={{ width: 50, textAlign: "center", padding: "2px 4px" }}
                            />
                          ) : (
                            anchor.quantity
                          )}
                        </td>
                        {isPrivileged && (
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button
                              className="btn btn-sm"
                              title="Добавить взаимозаменяемую позицию (или)"
                              style={{
                                padding: "2px 10px",
                                fontSize: 12,
                                fontWeight: 700,
                                borderRadius: 999,
                                border: "1px solid var(--navy)",
                                color: isAltTarget ? "#fff" : "var(--navy)",
                                background: isAltTarget ? "var(--navy)" : "var(--navy-50, #eef2ff)",
                              }}
                              onClick={() => setAltTarget(isAltTarget ? null : anchor.id)}
                            >
                              + или
                            </button>
                            <button
                              className="btn btn-icon btn-ghost"
                              title="Удалить требование"
                              style={{ color: "var(--red)" }}
                              onClick={() => removeGroup(g.members.map((m) => m.id))}
                            >
                              <IconTrash size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
