import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import TaskComposer from "../components/TaskComposer.jsx";

export default function InboxScreen({ reloadKey, onOpen, onMutated }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const rows = await api.listItems({
      status: "inbox",
      orderBy: "createdAt",
      orderDirection: "desc",
    });
    setItems(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function activate(item) {
    await api.activateItem(item.id);
    onMutated();
  }

  async function remove(item) {
    await api.deleteItem(item.id);
    onMutated();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, maxWidth: 800 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", marginBottom: 8 }}>
          Sorgente · manuale
        </div>
        <h2 style={{ margin: 0, fontSize: 38 }}>Inbox</h2>
      </div>

      <div style={{ marginBottom: 22 }}>
        <TaskComposer mode="inline" onCreated={onMutated} />
      </div>

      {!loading && items.length === 0 && (
        <p style={{ fontSize: 13, color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
          Nessun elemento da smistare. Tutto ciò che aggiungi qui resta in attesa finché non lo attivi o lo elimini.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", minHeight: 0, paddingRight: 6 }}>
        {items.map((item) => (
          <div
            key={item.id}
            className="card"
            style={{ gap: 0, padding: 12, borderLeft: "2px solid var(--color-accent)", cursor: "pointer" }}
            onClick={() => onOpen(item)}
          >
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 14.5, letterSpacing: "-0.01em" }}>
              {item.title}
            </div>
            {item.description && (
              <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6, color: "color-mix(in srgb, var(--color-text) 78%, transparent)" }}>
                {item.description}
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 11,
                paddingTop: 11,
                borderTop: "1px solid var(--color-divider)",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: 27, minHeight: 0, padding: "0 10px", fontSize: 12 }}
                onClick={(e) => {
                  e.stopPropagation();
                  activate(item);
                }}
              >
                Attiva
              </button>
              <button
                type="button"
                className="ghost-send"
                title="Scarta"
                aria-label="Scarta"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(item);
                }}
                style={{
                  marginLeft: "auto",
                  display: "grid",
                  placeItems: "center",
                  width: 27,
                  height: 27,
                  padding: 0,
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  background: "transparent",
                  cursor: "pointer",
                  color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
