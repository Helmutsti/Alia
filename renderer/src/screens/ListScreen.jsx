import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { STATUS_LABELS, dueColor, formatDueLabel } from "../lib/format.js";

const FILTERS = [
  { key: "all", label: "Tutti" },
  { key: "open", label: "Aperti" },
  { key: "done", label: "Fatti" },
];

export default function ListScreen({ reloadKey, onOpen }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const rows = await api.listItems({
      orderBy: "updatedAt",
      orderDirection: "desc",
      limit: 200,
      ...(search.trim() ? { search: search.trim() } : {}),
    });
    setItems(rows);
  }, [search]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const filtered = items.filter((item) => {
    if (filter === "open") return item.status === "inbox" || item.status === "active";
    if (filter === "done") return item.status === "completed";
    return item.status !== "archived";
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", marginBottom: 8 }}>
            Archivio
          </div>
          <h2 style={{ margin: 0, fontSize: 38 }}>Tutti i task</h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <input
            className="input"
            placeholder="Cerca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 190, height: 34, minHeight: 34 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <span
                  key={f.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFilter(f.key)}
                  onKeyDown={(e) => e.key === "Enter" && setFilter(f.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 34,
                    padding: "0 12px",
                    fontSize: 12.5,
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    border: `1px solid ${active ? "var(--color-accent)" : "transparent"}`,
                    color: active ? "var(--color-accent-300)" : "color-mix(in srgb, var(--color-text) 62%, transparent)",
                  }}
                >
                  {f.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "18px 1fr 90px 90px",
          gap: 16,
          padding: "0 12px 10px",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--color-text) 57%, transparent)",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        <span />
        <span>Task</span>
        <span>Scadenza</span>
        <span style={{ textAlign: "right" }}>Stato</span>
      </div>

      {filtered.map((item) => {
        const done = item.status === "completed";
        return (
          <div
            key={item.id}
            className="row"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(item)}
            style={{
              display: "grid",
              gridTemplateColumns: "18px 1fr 90px 90px",
              gap: 16,
              alignItems: "center",
              padding: 12,
              borderRadius: "var(--radius-sm)",
              borderBottom: "1px solid var(--color-divider)",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 999,
                border: `1.5px solid ${done ? "var(--color-neutral-700)" : "var(--color-accent)"}`,
                background: done ? "var(--color-neutral-700)" : "transparent",
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 500,
                  fontSize: 14.5,
                  letterSpacing: "-0.01em",
                  textDecoration: done ? "line-through" : "none",
                  color: done ? "color-mix(in srgb, var(--color-text) 55%, transparent)" : "var(--color-text)",
                }}
              >
                {item.title}
              </div>
            </div>
            <span style={{ fontSize: 12.5, color: dueColor(item.dueAt, item.status) }}>
              {formatDueLabel(item.dueAt) ?? "—"}
            </span>
            <span style={{ display: "flex", justifyContent: "flex-end" }}>
              <span className="tag tag-neutral">{STATUS_LABELS[item.status]}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
