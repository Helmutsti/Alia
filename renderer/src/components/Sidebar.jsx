import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { refreshProjects } from "../lib/projectsStore.js";

const PROJECT_PALETTE = ["#45aeee", "#c78bff", "#3ddc97", "#ffb454", "#ff6b81", "#f7b955", "#7ee8fa", "#c9a24d", "#e9eaea", "#5a5e61"];

const PencilIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const TrashIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
);
const PlusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
);
const CloseIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

function actionButtonStyle() {
  return { display: "grid", placeItems: "center", width: 20, height: 20, padding: 0, border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 60%, transparent)" };
}

const NAV_ITEMS = [
  {
    key: "sources",
    label: "Inbox",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 13h4l2 3h6l2-3h4" />
        <path d="M5 5h14l2 8v6H3v-6z" />
      </svg>
    ),
  },
  {
    key: "today",
    label: "Oggi",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l3 2" />
      </svg>
    ),
  },
  {
    key: "list",
    label: "Tutti i task",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
      </svg>
    ),
  },
  {
    key: "calendar",
    label: "Calendario",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 11h18" />
      </svg>
    ),
  },
  {
    key: "gantt",
    label: "Gantt",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="10" height="3" rx="1" />
        <rect x="8" y="11" width="13" height="3" rx="1" />
        <rect x="5" y="17" width="9" height="3" rx="1" />
      </svg>
    ),
  },
];

export default function Sidebar({ view, onNavigate, counts, onAddTask, projects, onSelectProject, onOpenSettings }) {
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [colorPickerId, setColorPickerId] = useState(null);
  const colorPickerRef = useRef(null);

  useEffect(() => {
    if (!colorPickerId) return;
    function onMouseDown(e) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) setColorPickerId(null);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") { e.stopPropagation(); setColorPickerId(null); }
    }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [colorPickerId]);

  async function setProjectColor(p, color) {
    setColorPickerId(null);
    if (color === p.color) return;
    await api.updateProject(p.id, { color });
    await refreshProjects();
  }

  async function addProject() {
    const name = addDraft.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    const color = PROJECT_PALETTE[(projects?.length ?? 0) % PROJECT_PALETTE.length];
    setAddDraft("");
    setAdding(false);
    await api.createProject({ name, color });
    await refreshProjects();
  }

  function startEdit(p) {
    setConfirmDeleteId(null);
    setEditingId(p.id);
    setEditDraft(p.name);
  }

  async function commitEdit(p) {
    const name = editDraft.trim();
    setEditingId(null);
    if (!name || name === p.name) return;
    await api.updateProject(p.id, { name });
    await refreshProjects();
  }

  async function removeProject(id) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    await api.deleteProject(id);
    await refreshProjects();
  }

  return (
    <aside
      style={{
        width: 252,
        flex: "0 0 252px",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: "color-mix(in srgb, #101112 45%, var(--color-bg))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px" }}>
        {/* logo: allineato al tier icone "primario" (20px) invece dei 21px originali */}
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" stroke="var(--color-text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="24" height="24" rx="7" />
          <path d="M11 20l10-8M21 12v6.5" />
        </svg>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: "var(--text-lg)", letterSpacing: "-0.02em" }}>
          Alia
        </span>
      </div>

      <button
        type="button"
        className="nav-row"
        onClick={onAddTask}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          border: "1px dashed var(--color-divider)",
          borderRadius: "var(--radius-md)",
          background: "transparent",
          cursor: "pointer",
          padding: "8px 12px",
          color: "color-mix(in srgb, var(--color-text) 80%, transparent)",
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-md)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Aggiungi task
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", opacity: 0.8 }}>⌘K</span>
      </button>

      <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV_ITEMS.map((n) => {
          const active = view === n.key;
          return (
            <div
              key={n.key}
              className="nav-row"
              role="button"
              tabIndex={0}
              onClick={() => onNavigate(n.key)}
              onKeyDown={(e) => e.key === "Enter" && onNavigate(n.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-md)",
                cursor: "pointer",
                border: `1px solid ${active ? "var(--color-accent)" : "transparent"}`,
                color: active ? "var(--color-accent-300)" : "var(--color-text)",
              }}
            >
              {n.icon}
              <span>{n.label}</span>
              <span style={{ marginLeft: "auto", fontSize: "var(--text-sm)", color: "color-mix(in srgb, var(--color-text) 56%, transparent)" }}>
                {counts?.[n.key] ?? ""}
              </span>
            </div>
          );
        })}
      </nav>

      <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", marginBottom: 8, flex: "0 0 auto" }}>
          <span style={{ fontSize: "var(--text-xs)", letterSpacing: "0.14em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)" }}>
            Progetti
          </span>
          <button
            type="button"
            className="ghost-ico"
            aria-label="Aggiungi progetto"
            title="Aggiungi progetto"
            onClick={() => { setAdding(true); setConfirmDeleteId(null); }}
            style={actionButtonStyle()}
          >
            {PlusIcon}
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, overflowY: "auto", minHeight: 0 }}>
          {(projects ?? []).map((p) => (
            <div
              key={p.id}
              className="nav-row proj-row"
              role="button"
              tabIndex={0}
              onClick={() => editingId !== p.id && onSelectProject?.(p.name)}
              onKeyDown={(e) => e.key === "Enter" && editingId !== p.id && onSelectProject?.(p.name)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "var(--radius-md)", fontSize: "var(--text-md)", cursor: "pointer" }}
            >
              <span style={{ position: "relative", flex: "0 0 auto", display: "inline-flex" }} ref={colorPickerId === p.id ? colorPickerRef : null}>
                <button
                  type="button"
                  aria-label={`Cambia colore di ${p.name}`}
                  title="Cambia colore"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); setColorPickerId(colorPickerId === p.id ? null : p.id); }}
                  style={{ display: "block", width: 10, height: 10, padding: 0, margin: 1, border: "none", borderRadius: 999, background: p.dot, cursor: "pointer" }}
                />
                {colorPickerId === p.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: "absolute", left: -6, top: "calc(100% + 6px)", zIndex: 9, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, padding: 8, borderRadius: "var(--radius-md)", background: "var(--color-surface)", boxShadow: "var(--shadow-md)" }}
                  >
                    {PROJECT_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        onClick={() => setProjectColor(p, c)}
                        style={{
                          width: 18,
                          height: 18,
                          padding: 0,
                          borderRadius: 999,
                          cursor: "pointer",
                          background: c,
                          border: c === p.color ? "2px solid var(--color-text)" : "2px solid transparent",
                          outline: c === p.color ? "1px solid var(--color-surface)" : "none",
                        }}
                      />
                    ))}
                  </div>
                )}
              </span>
              {editingId === p.id ? (
                <input
                  autoFocus
                  className="dnote"
                  value={editDraft}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => commitEdit(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitEdit(p); }
                    else if (e.key === "Escape") { e.stopPropagation(); setEditingId(null); }
                  }}
                  style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontFamily: "var(--font-body)", fontSize: "var(--text-md)", color: "var(--color-text)" }}
                />
              ) : (
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              )}
              {editingId !== p.id && (
                <span className="proj-actions" style={{ display: "flex", alignItems: "center", gap: 2, flex: "0 0 auto" }}>
                  <button type="button" className="ghost-ico" aria-label={`Rinomina ${p.name}`} onClick={(e) => { e.stopPropagation(); startEdit(p); }} style={actionButtonStyle()}>
                    {PencilIcon}
                  </button>
                  <button
                    type="button"
                    className="ghost-ico"
                    aria-label={confirmDeleteId === p.id ? `Conferma eliminazione di ${p.name}` : `Elimina ${p.name}`}
                    onClick={(e) => { e.stopPropagation(); removeProject(p.id); }}
                    style={{ ...actionButtonStyle(), color: confirmDeleteId === p.id ? "#ff6b6b" : actionButtonStyle().color }}
                  >
                    {TrashIcon}
                  </button>
                </span>
              )}
              {editingId !== p.id && (
                <span style={{ flex: "0 0 auto", fontSize: "var(--text-sm)", color: "color-mix(in srgb, var(--color-text) 56%, transparent)" }}>{p.count}</span>
              )}
            </div>
          ))}
          {adding && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
              <span style={{ flex: "0 0 auto", width: 6, height: 6, borderRadius: 999, border: "1.5px dashed color-mix(in srgb, var(--color-text) 45%, transparent)" }} />
              <input
                autoFocus
                className="dnote"
                placeholder="Nome progetto"
                value={addDraft}
                onChange={(e) => setAddDraft(e.target.value)}
                onBlur={addProject}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addProject(); }
                  else if (e.key === "Escape") { setAddDraft(""); setAdding(false); }
                }}
                style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontFamily: "var(--font-body)", fontSize: "var(--text-md)", color: "var(--color-text)" }}
              />
              <button
                type="button"
                className="ghost-ico"
                aria-label="Annulla"
                onClick={() => { setAddDraft(""); setAdding(false); }}
                style={actionButtonStyle()}
              >
                {CloseIcon}
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className="nav-row"
        role="button"
        tabIndex={0}
        onClick={onOpenSettings}
        onKeyDown={(e) => e.key === "Enter" && onOpenSettings?.()}
        style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: "var(--text-md)", color: "color-mix(in srgb, var(--color-text) 74%, transparent)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>Impostazioni</span>
      </div>
    </aside>
  );
}
