import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  formatDueLabel,
  tomorrowIso,
} from "../lib/format.js";

export default function TaskDetailModal({ item, onClose, onChanged, onDeleted }) {
  const [menu, setMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = item.status === "completed";

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function toggleComplete() {
    const updated = done ? await api.activateItem(item.id) : await api.completeItem(item.id);
    onChanged(updated);
  }

  async function postponeToTomorrow() {
    const updated = await api.updateItem(item.id, { dueAt: tomorrowIso() });
    onChanged(updated);
  }

  async function setPriority(value) {
    const updated = await api.updateItem(item.id, { priority: value });
    onChanged(updated);
    setMenu(null);
  }

  async function remove() {
    await api.deleteItem(item.id);
    onDeleted(item.id);
  }

  const dueLabel = formatDueLabel(item.dueAt) ?? "Nessuna";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, #0a0b0b 64%, transparent)",
        zIndex: 20,
      }}
      onClick={onClose}
    >
      {/* Centrato sull'area del contenuto (dopo la sidebar), non su tutta la finestra */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 224,
          display: "grid",
          placeItems: "start center",
          paddingTop: 96,
        }}
      >
      <div
        className="card elev-lg"
        style={{
          width: 640,
          maxWidth: "90vw",
          maxHeight: "80vh",
          gap: 0,
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-divider)",
          }}
        >
          <span style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 74%, transparent)" }}>
            {STATUS_LABELS[item.status]}
          </span>
          <button
            type="button"
            className="ghost-send"
            aria-label="Chiudi"
            onClick={onClose}
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <span
              style={{
                flex: "0 0 auto",
                width: 17,
                height: 17,
                marginTop: 5,
                borderRadius: 999,
                border: `1.5px solid ${done ? "var(--color-neutral-700)" : "var(--color-accent)"}`,
                background: done ? "var(--color-neutral-700)" : "transparent",
              }}
            />
            <div style={{ minWidth: 0 }}>
              <h4
                style={{
                  margin: 0,
                  fontSize: 22,
                  letterSpacing: "-0.015em",
                  textDecoration: done ? "line-through" : "none",
                }}
              >
                {item.title}
              </h4>
              {item.description && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: "color-mix(in srgb, var(--color-text) 78%, transparent)",
                  }}
                >
                  {item.description}
                </p>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "14px 0",
              borderTop: "1px solid var(--color-divider)",
              borderBottom: "1px solid var(--color-divider)",
            }}
          >
            <Field label="Scadenza" value={dueLabel} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
              <span
                style={{
                  flex: "0 0 104px",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "color-mix(in srgb, var(--color-text) 57%, transparent)",
                }}
              >
                Priorità
              </span>
              <button
                type="button"
                className="chip"
                onClick={() => setMenu(menu === "priority" ? null : "priority")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 27,
                  padding: "0 10px",
                  fontSize: 12,
                  borderRadius: "var(--radius-md)",
                  border: `1px solid ${item.priority !== "none" ? "var(--color-accent)" : "var(--color-divider)"}`,
                  color: item.priority !== "none" ? "var(--color-accent-300)" : "var(--color-text)",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                {PRIORITY_LABELS[item.priority]}
              </button>
              {menu === "priority" && (
                <div
                  style={{
                    position: "absolute",
                    left: 116,
                    top: "calc(100% + 4px)",
                    zIndex: 5,
                    minWidth: 160,
                    padding: "var(--space-2)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-surface)",
                    boxShadow: "var(--shadow-md)",
                  }}
                >
                  {[...PRIORITY_ORDER].reverse().map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="menu-item"
                      onClick={() => setPriority(value)}
                      style={{
                        display: "block",
                        width: "100%",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "var(--font-body)",
                        fontSize: 13,
                        padding: "6px 8px",
                        borderRadius: "var(--radius-sm)",
                        color: value === item.priority ? "var(--color-accent-300)" : "var(--color-text)",
                      }}
                    >
                      {PRIORITY_LABELS[value]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid var(--color-divider)",
          }}
        >
          <button type="button" className="btn btn-primary" onClick={toggleComplete}>
            {done ? "Riapri" : "Segna come completato"}
          </button>
          {!done && (
            <button type="button" className="btn btn-secondary" onClick={postponeToTomorrow}>
              Rimanda a domani
            </button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "color-mix(in srgb, var(--color-text) 56%, transparent)" }}>
            Esc per chiudere
          </span>
          {confirmDelete ? (
            <button type="button" className="btn btn-secondary" style={{ color: "#ff6b6b", borderColor: "#ff6b6b" }} onClick={remove}>
              Conferma eliminazione
            </button>
          ) : (
            <button
              type="button"
              className="ghost-send"
              aria-label="Elimina"
              onClick={() => setConfirmDelete(true)}
              style={{
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span
        style={{
          flex: "0 0 104px",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--color-text) 57%, transparent)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 27,
          padding: "0 10px",
          fontSize: 12,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-divider)",
          color: "var(--color-text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
