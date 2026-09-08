const NAV_ITEMS = [
  {
    key: "sources",
    label: "Inbox",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 13h4l2 3h6l2-3h4" />
        <path d="M5 5h14l2 8v6H3v-6z" />
      </svg>
    ),
  },
  {
    key: "today",
    label: "Oggi",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l3 2" />
      </svg>
    ),
  },
  {
    key: "list",
    label: "Tutti i task",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
      </svg>
    ),
  },
  {
    key: "calendar",
    label: "Calendario",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 11h18" />
      </svg>
    ),
  },
  {
    key: "gantt",
    label: "Gantt",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="10" height="3" rx="1" />
        <rect x="8" y="11" width="13" height="3" rx="1" />
        <rect x="5" y="17" width="9" height="3" rx="1" />
      </svg>
    ),
  },
];

export default function Sidebar({ view, onNavigate, counts, onAddTask, projects, onSelectProject }) {
  return (
    <aside
      style={{
        width: 224,
        flex: "0 0 224px",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: "color-mix(in srgb, #101112 45%, var(--color-bg))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 6px" }}>
        <svg width="21" height="21" viewBox="0 0 32 32" fill="none" stroke="var(--color-text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="24" height="24" rx="7" />
          <path d="M11 20l10-8M21 12v6.5" />
        </svg>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 19, letterSpacing: "-0.02em" }}>
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
          gap: 9,
          width: "100%",
          textAlign: "left",
          border: "1px dashed var(--color-divider)",
          borderRadius: "var(--radius-md)",
          background: "transparent",
          cursor: "pointer",
          padding: "8px 10px",
          color: "color-mix(in srgb, var(--color-text) 80%, transparent)",
          fontFamily: "var(--font-body)",
          fontSize: 13,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Aggiungi task
        <span style={{ marginLeft: "auto", fontSize: 10.5, opacity: 0.8 }}>⌘K</span>
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
                gap: 9,
                padding: "8px 10px",
                borderRadius: "var(--radius-md)",
                fontSize: 13.5,
                cursor: "pointer",
                border: `1px solid ${active ? "var(--color-accent)" : "transparent"}`,
                color: active ? "var(--color-accent-300)" : "var(--color-text)",
              }}
            >
              {n.icon}
              <span>{n.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 56%, transparent)" }}>
                {counts?.[n.key] ?? ""}
              </span>
            </div>
          );
        })}
      </nav>

      {projects?.length > 0 && (
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", padding: "0 10px", marginBottom: 8 }}>
            Progetti
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {projects.map((p) => (
              <div
                key={p.name}
                className="nav-row"
                role="button"
                tabIndex={0}
                onClick={() => onSelectProject?.(p.name)}
                onKeyDown={(e) => e.key === "Enter" && onSelectProject?.(p.name)}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: "var(--radius-md)", fontSize: 13, cursor: "pointer" }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: p.dot }} />
                <span>{p.name}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 56%, transparent)" }}>{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="nav-row"
        style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: 13, color: "color-mix(in srgb, var(--color-text) 74%, transparent)" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>Impostazioni</span>
      </div>
    </aside>
  );
}
