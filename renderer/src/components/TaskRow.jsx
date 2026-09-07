import { PRIORITY_COLORS, dueColor, formatDueLabel } from "../lib/format.js";

export default function TaskRow({ item, onOpen, dense = false }) {
  const done = item.status === "completed";
  const dotColor = done ? "var(--color-neutral-700)" : PRIORITY_COLORS[item.priority];
  const dueLabel = formatDueLabel(item.dueAt);

  return (
    <div
      className="row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(item);
      }}
      style={{
        display: "grid",
        gridTemplateColumns: "18px 1fr auto",
        alignItems: "center",
        gap: 16,
        padding: dense ? "10px 12px" : "12px",
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
          border: `1.5px solid ${dotColor}`,
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
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.title}
        </div>
        {item.description && (
          <div
            style={{
              fontSize: 11.5,
              marginTop: 2,
              color: "color-mix(in srgb, var(--color-text) 57%, transparent)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.description}
          </div>
        )}
      </div>
      {dueLabel && (
        <span style={{ fontSize: 11.5, whiteSpace: "nowrap", color: dueColor(item.dueAt, item.status) }}>
          {dueLabel}
        </span>
      )}
    </div>
  );
}
