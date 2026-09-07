const NAV_ITEMS = [
  {
    key: "inbox",
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
];

export default function Sidebar({ view, onNavigate, counts, onAddTask }) {
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
    </aside>
  );
}
