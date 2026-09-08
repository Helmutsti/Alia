import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS, dueColor, dueStatusLabel, projectColor } from "../lib/format.js";

const CheckIcon = (
  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const PostponeIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12a8 8 0 1 0 8-8" />
    <path d="M12 4L9 7M12 4l3 3" />
    <path d="M12 9v3.5l2.5 1.5" />
  </svg>
);

const RemoveIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </svg>
);

const SubsIcon = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h16M4 12h10M4 17h7" />
  </svg>
);

/**
 * Task Row/Card unico, riusato in liste, kanban e Gantt.
 * variant "row": griglia fissa check/titolo/progetto/scadenza/stato.
 * variant "card": titolo su riga piena + riga meta "data · progetto · stato".
 */
export default function TaskRow({
  item,
  variant = "row",
  hideProject = false,
  hideStatus = false,
  onOpen,
  onToggle,
  onPostpone,
  onRemove,
}) {
  const card = variant === "card";
  const done = item.status === "completed";
  const dueLabel = dueStatusLabel(item.dueAt, item.status);
  const priorityLabel = done || card ? "" : PRIORITY_LABELS[item.priority] && item.priority !== "none" ? PRIORITY_LABELS[item.priority] : "";
  const dotColor = done ? "var(--color-neutral-700)" : PRIORITY_COLORS[item.priority];
  const titleColor = done ? "color-mix(in srgb, var(--color-text) 50%, transparent)" : "var(--color-text)";
  const checkLabel = done ? "Segna da fare" : "Segna come completato";

  function check(label, onClick) {
    return (
      <button
        type="button"
        className="tcheck"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{
          flex: "0 0 auto",
          width: 12,
          height: 12,
          padding: 0,
          borderRadius: 999,
          border: `2.2px solid ${dotColor}`,
          background: done ? "var(--color-neutral-700)" : "transparent",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
        }}
      >
        {done && CheckIcon}
      </button>
    );
  }

  function titleBlock(extraStyle) {
    return (
      <div
        onClick={() => onOpen?.(item)}
        style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer", ...extraStyle }}
      >
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 500,
            fontSize: 13.5,
            letterSpacing: "-0.01em",
            lineHeight: 1.35,
            whiteSpace: card ? "normal" : "nowrap",
            overflow: card ? "visible" : "hidden",
            textOverflow: card ? "clip" : "ellipsis",
            textDecoration: done ? "line-through" : "none",
            color: titleColor,
            flex: card ? "1 1 100%" : "0 1 auto",
          }}
        >
          {item.title}
        </span>
        {priorityLabel && (
          <span style={{ fontSize: 11, whiteSpace: "nowrap", color: dotColor }}>{priorityLabel.toLowerCase()}</span>
        )}
        {item.subtaskTotal > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, whiteSpace: "nowrap", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
            {SubsIcon}
            {item.subtaskDone ?? 0}/{item.subtaskTotal}
          </span>
        )}
      </div>
    );
  }

  const metaSize = card ? 10.5 : 12;
  const projectPill = item.project && (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: metaSize, color: done ? "color-mix(in srgb, var(--color-text) 45%, transparent)" : projectColor(item.project) }}>
      <span style={{ width: 5, height: 5, flex: "0 0 auto", borderRadius: 999, background: done ? `color-mix(in srgb, ${projectColor(item.project)} 45%, transparent)` : projectColor(item.project) }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.project}</span>
    </span>
  );

  const statusPill = (
    <span
      className={card ? "" : item.status === "active" ? "tag tag-outline" : "tag tag-neutral"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: card ? "auto" : 72,
        boxSizing: "border-box",
        padding: card ? 0 : "0 8px",
        height: card ? "auto" : 22,
        fontSize: card ? 10.5 : 11,
        color: card ? "color-mix(in srgb, var(--color-text) 55%, transparent)" : "inherit",
        opacity: done ? 0.7 : 1,
      }}
    >
      {STATUS_LABELS[item.status]}
    </span>
  );

  if (card) {
    return (
      <div
        className="card"
        style={{
          gap: "5px 8px",
          padding: "12px 13px",
          borderRadius: "var(--radius-md)",
          border: "1px solid color-mix(in srgb, var(--color-text) 13%, transparent)",
          background: "var(--color-surface)",
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "baseline",
        }}
      >
        {check(checkLabel, () => onToggle?.(item))}
        {titleBlock({ flex: "1 0 calc(100% - 22px)" })}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginLeft: 22, fontSize: 10.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
          {dueLabel && <span style={{ color: dueColor(item.dueAt, item.status) }}>{dueLabel}</span>}
          {!hideProject && projectPill && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              {projectPill}
            </>
          )}
          {!hideStatus && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              {statusPill}
            </>
          )}
        </div>
      </div>
    );
  }

  const cols = ["14px", "minmax(0,1fr)"];
  if (!hideProject) cols.push("110px");
  cols.push("90px");
  if (!hideStatus) cols.push("72px");

  return (
    <div
      className="trow"
      style={{
        display: "grid",
        gridTemplateColumns: cols.join(" "),
        gap: 11,
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {check(checkLabel, () => onToggle?.(item))}
      {titleBlock({})}
      {!hideProject && <span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>{projectPill}</span>}
      <span style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: metaSize, whiteSpace: "nowrap", color: dueColor(item.dueAt, item.status) }}>{dueLabel ?? "—"}</span>
        <span className="tactions" style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
          {onPostpone && (
            <button
              type="button"
              className="ghost-ico"
              title="Rimanda di un giorno"
              aria-label="Rimanda di un giorno"
              onClick={(e) => {
                e.stopPropagation();
                onPostpone(item);
              }}
              style={{ display: "grid", placeItems: "center", width: 20, height: 20, padding: 0, border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}
            >
              {PostponeIcon}
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className="ghost-ico"
              title="Elimina"
              aria-label="Elimina"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item);
              }}
              style={{ display: "grid", placeItems: "center", width: 20, height: 20, padding: 0, border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}
            >
              {RemoveIcon}
            </button>
          )}
        </span>
      </span>
      {!hideStatus && <span style={{ display: "flex", justifyContent: "center" }}>{statusPill}</span>}
    </div>
  );
}
