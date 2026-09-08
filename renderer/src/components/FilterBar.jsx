import { useEffect, useRef } from "react";
import { PRIORITY_LABELS, STATUS_LABELS, projectColor } from "../lib/format.js";

const STATUS_KEYS = ["inbox", "active", "completed", "archived"];
const PRIORITY_KEYS = ["urgent", "high", "medium", "low", "none"];

const SORT_LABELS = {
  dueAt: "Scadenza",
  priority: "Priorità",
  project: "Progetto",
  title: "Titolo",
};

const LIST_GROUPING = ["none", "project", "priority", "status"];
const KANBAN_GROUPING = ["status", "project", "priority"];
const GROUPING_LABELS = { none: "Nessuno", project: "Progetto", priority: "Priorità", status: "Stato" };

const SearchIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flex: "0 0 auto", color: "color-mix(in srgb, var(--color-text) 58%, transparent)" }}>
    <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
  </svg>
);
const ChevronIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const CheckIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const ListIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
);
const KanbanIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" />
  </svg>
);
function Dropdown({ label, active, open, onToggle, side = "left", children }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}>
      <button
        type="button"
        className="pill"
        onClick={onToggle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 29,
          padding: "0 12px",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          background: "transparent",
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-base-sm)",
          border: `1px solid ${active || open ? "var(--color-accent)" : "transparent"}`,
          color: active ? "var(--color-accent-300)" : "color-mix(in srgb, var(--color-text) 70%, transparent)",
        }}
      >
        <span>{label}</span>
        {ChevronIcon}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            [side]: 0,
            top: "calc(100% + 4px)",
            zIndex: 6,
            minWidth: 196,
            padding: 6,
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}

function MenuItem({ label, active, count, dot, onClick }) {
  return (
    <button
      type="button"
      className="menu-item"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-base-sm)",
        padding: "8px 8px",
        borderRadius: "var(--radius-sm)",
        color: active ? "var(--color-accent-300)" : "var(--color-text)",
      }}
    >
      {dot && <span style={{ width: 6, height: 6, flex: "0 0 auto", borderRadius: 999, background: dot }} />}
      <span>{label}</span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {count != null && <span style={{ fontSize: "var(--text-sm)", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{count}</span>}
        {active && CheckIcon}
      </span>
    </button>
  );
}

export default function FilterBar({
  search, onSearch,
  statusMulti, projectMulti, priorityMulti, onToggleMulti,
  projectOptions, counts,
  sortBy, sortDir, onSort, onToggleSortDir,
  view, onSetView,
  grouping, onSetGrouping,
  menu, onSetMenu,
  onClearAll,
}) {
  const barRef = useRef(null);

  useEffect(() => {
    if (!menu) return;
    function onMouseDown(e) {
      if (barRef.current && !barRef.current.contains(e.target)) onSetMenu(null);
    }
    function onKey(e) {
      if (e.key === "Escape") onSetMenu(null);
    }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, onSetMenu]);

  const groupingOptions = view === "kanban" ? KANBAN_GROUPING : LIST_GROUPING;
  const activeChips = [
    search ? { key: "search", label: `“${search}”`, onRemove: () => onSearch("") } : null,
    ...statusMulti.map((s) => ({ key: `status:${s}`, label: STATUS_LABELS[s], onRemove: () => onToggleMulti("status", s) })),
    ...projectMulti.map((p) => ({ key: `project:${p}`, label: p, onRemove: () => onToggleMulti("project", p) })),
    ...priorityMulti.map((p) => ({ key: `priority:${p}`, label: `Priorità ${PRIORITY_LABELS[p].toLowerCase()}`, onRemove: () => onToggleMulti("priority", p) })),
  ].filter(Boolean);

  return (
    <div>
      <div ref={barRef} style={{ position: "relative", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, paddingBottom: 10, borderBottom: "1px solid var(--color-divider)" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 29, padding: "0 12px", borderRadius: "var(--radius-md)", border: `1px solid ${search ? "var(--color-accent)" : "var(--color-divider)"}`, minWidth: 150, flex: "1 1 210px" }}>
          {SearchIcon}
          <input
            className="fsearch"
            placeholder="Cerca"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            style={{ minWidth: 0, flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "var(--font-body)", fontSize: "var(--text-base-sm)", color: "var(--color-text)" }}
          />
        </label>

        <Dropdown
          label={statusMulti.length ? (statusMulti.length === 1 ? STATUS_LABELS[statusMulti[0]] : `${statusMulti.length} stati`) : "Stato"}
          active={statusMulti.length > 0}
          open={menu === "status"}
          onToggle={() => onSetMenu(menu === "status" ? null : "status")}
        >
          <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", padding: "4px 8px 8px" }}>Stato</div>
          {STATUS_KEYS.map((s) => (
            <MenuItem key={s} label={STATUS_LABELS[s]} active={statusMulti.includes(s)} count={counts.status[s] ?? 0} onClick={() => onToggleMulti("status", s)} />
          ))}
        </Dropdown>

        <Dropdown
          label={projectMulti.length ? (projectMulti.length === 1 ? projectMulti[0] : `${projectMulti.length} progetti`) : "Progetto"}
          active={projectMulti.length > 0}
          open={menu === "project"}
          onToggle={() => onSetMenu(menu === "project" ? null : "project")}
        >
          <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", padding: "4px 8px 8px" }}>Progetto</div>
          {projectOptions.map((p) => (
            <MenuItem key={p} label={p} dot={projectColor(p)} active={projectMulti.includes(p)} count={counts.project[p] ?? 0} onClick={() => onToggleMulti("project", p)} />
          ))}
        </Dropdown>

        <Dropdown
          label={priorityMulti.length ? (priorityMulti.length === 1 ? PRIORITY_LABELS[priorityMulti[0]] : `${priorityMulti.length} priorità`) : "Priorità"}
          active={priorityMulti.length > 0}
          open={menu === "priority"}
          onToggle={() => onSetMenu(menu === "priority" ? null : "priority")}
        >
          <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", padding: "4px 8px 8px" }}>Priorità</div>
          {PRIORITY_KEYS.map((p) => (
            <MenuItem key={p} label={PRIORITY_LABELS[p]} active={priorityMulti.includes(p)} count={counts.priority[p] ?? 0} onClick={() => onToggleMulti("priority", p)} />
          ))}
        </Dropdown>

        <Dropdown
          label={SORT_LABELS[sortBy]}
          active={false}
          open={menu === "sort"}
          onToggle={() => onSetMenu(menu === "sort" ? null : "sort")}
        >
          <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", padding: "4px 8px 8px" }}>Ordina per</div>
          {Object.keys(SORT_LABELS).map((key) => (
            <MenuItem key={key} label={SORT_LABELS[key]} active={sortBy === key} onClick={() => { onSort(key); onSetMenu(null); }} />
          ))}
        </Dropdown>

        <span
          role="button"
          tabIndex={0}
          title={sortDir === "asc" ? "Crescente" : "Decrescente"}
          onClick={onToggleSortDir}
          onKeyDown={(e) => e.key === "Enter" && onToggleSortDir()}
          style={{ display: "grid", placeItems: "center", width: 29, height: 29, borderRadius: "var(--radius-md)", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sortDir === "asc" ? "scaleY(-1)" : "none" }}>
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </span>

        <Dropdown
          label={GROUPING_LABELS[grouping]}
          active={grouping !== "none"}
          open={menu === "grouping"}
          side="right"
          onToggle={() => onSetMenu(menu === "grouping" ? null : "grouping")}
        >
          <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", padding: "4px 8px 8px" }}>Raggruppa per</div>
          {groupingOptions.map((g) => (
            <MenuItem key={g} label={GROUPING_LABELS[g]} active={grouping === g} onClick={() => { onSetGrouping(g); onSetMenu(null); }} />
          ))}
        </Dropdown>

        <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", flex: "0 0 auto" }}>
          {[
            { key: "list", title: "Vista elenco", icon: ListIcon },
            { key: "kanban", title: "Vista kanban", icon: KanbanIcon },
          ].map((v) => {
            const on = view === v.key;
            return (
              <button
                key={v.key}
                type="button"
                className="pill"
                title={v.title}
                aria-label={v.title}
                onClick={() => onSetView(v.key)}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 29,
                  height: 29,
                  padding: 0,
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  background: "transparent",
                  border: `1px solid ${on ? "var(--color-accent)" : "transparent"}`,
                  color: on ? "var(--color-accent-300)" : "color-mix(in srgb, var(--color-text) 62%, transparent)",
                }}
              >
                {v.icon}
              </button>
            );
          })}
        </span>
      </div>

      {activeChips.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 0 0" }}>
          <span style={{ fontSize: "var(--text-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", marginRight: 2 }}>Filtri</span>
          {activeChips.map((c) => (
            <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 25, padding: "0 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-accent)", color: "var(--color-accent-300)", fontSize: "var(--text-sm)" }}>
              {c.label}
              <button type="button" className="ghost-ico" onClick={c.onRemove} aria-label="Rimuovi filtro" style={{ display: "grid", placeItems: "center", width: 17, height: 17, padding: 0, border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "inherit" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </span>
          ))}
          <button type="button" className="pill" onClick={onClearAll} style={{ display: "inline-flex", alignItems: "center", height: 25, padding: "0 8px", borderRadius: "var(--radius-md)", border: "1px solid transparent", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
            Azzera
          </button>
        </div>
      )}
    </div>
  );
}
