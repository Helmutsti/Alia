import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { PRIORITY_COLORS, projectColor } from "../lib/format.js";

const MONTH_LABELS_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dayDiff(a, b) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

export default function GanttScreen({ reloadKey, onOpen }) {
  const [items, setItems] = useState([]);
  const [zoom, setZoom] = useState("mese");
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    const rows = await api.listItems({ limit: 200 });
    setItems(rows.filter((i) => i.dueAt && i.status !== "archived"));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const today = startOfDay(new Date());
  const rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = zoom === "mese" ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() : 92;
  const dayW = zoom === "mese" ? 34 : 12;
  const todayOffset = dayDiff(today, rangeStart);

  const visible = items.filter((i) => {
    const offset = dayDiff(i.dueAt, rangeStart);
    return offset >= 0 && offset < days;
  });

  const groups = useMemo(() => {
    const byProject = new Map();
    for (const item of visible) {
      const key = item.project || "Senza progetto";
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key).push(item);
    }
    return [...byProject.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, rows]) => ({
        label,
        color: label === "Senza progetto" ? "var(--color-neutral-500)" : projectColor(label),
        rows: rows.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)),
      }));
  }, [visible]);

  function toggleGroup(label) {
    setCollapsed((c) => ({ ...c, [label]: !c[label] }));
  }

  const monthBands = [];
  {
    let acc = 0;
    let cursor = new Date(rangeStart);
    while (acc < days) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      const remainingInMonth = monthEnd - cursor.getDate() + 1;
      const len = Math.min(remainingInMonth, days - acc);
      monthBands.push({ width: len * dayW, label: MONTH_LABELS_IT[cursor.getMonth()] });
      acc += len;
      cursor = addDays(cursor, len);
    }
  }

  const ticks = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(rangeStart, i);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const show = zoom === "mese" ? date.getDate() % 2 === 1 : date.getDate() === 1;
    ticks.push({ width: dayW, label: show ? String(date.getDate()) : "", isToday: i === todayOffset, isWeekend });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--text-sm)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", marginBottom: 8 }}>Pianificazione</div>
          <h2 style={{ margin: 0 }}>Gantt</h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right", lineHeight: 1.3 }}>
            <div style={{ fontSize: "var(--text-md)", fontFamily: "var(--font-heading)", fontWeight: 500 }}>{visible.length}<span style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)", fontWeight: 400, color: "color-mix(in srgb, var(--color-text) 56%, transparent)" }}> attività</span></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["mese", "trimestre"].map((z) => (
              <span
                key={z}
                role="button"
                tabIndex={0}
                onClick={() => setZoom(z)}
                onKeyDown={(e) => e.key === "Enter" && setZoom(z)}
                style={{ display: "inline-flex", alignItems: "center", height: 32, padding: "0 12px", fontSize: "var(--text-base-sm)", borderRadius: "var(--radius-md)", cursor: "pointer", border: `1px solid ${zoom === z ? "var(--color-accent)" : "var(--color-divider)"}`, color: zoom === z ? "var(--color-accent-300)" : "color-mix(in srgb, var(--color-text) 62%, transparent)" }}
              >
                {z === "mese" ? "Mese" : "Trimestre"}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderTop: "1px solid var(--color-divider)" }}>
        <div style={{ display: "grid", gridTemplateColumns: `260px ${days * dayW}px`, alignItems: "start", width: "max-content", minWidth: "100%" }}>
          <div style={{ position: "sticky", left: 0, zIndex: 5, display: "flex", flexDirection: "column", background: "var(--color-bg)", borderRight: "1px solid var(--color-divider)" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 6, height: 52, flex: "0 0 52px", display: "flex", alignItems: "flex-end", padding: "0 12px 8px", fontSize: "var(--text-xs)", letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", background: "var(--color-bg)", borderBottom: "1px solid var(--color-divider)" }}>Attività</div>
            {groups.map((g) => (
              <GroupHeadRows key={g.label} group={g} collapsed={!!collapsed[g.label]} onToggle={() => toggleGroup(g.label)} onOpen={onOpen} />
            ))}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ position: "relative" }}>
              <div style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--color-bg)" }}>
                <div style={{ display: "flex", height: 26 }}>
                  {monthBands.map((m, i) => (
                    <div key={i} style={{ width: m.width, flex: "0 0 auto", display: "flex", alignItems: "center", paddingLeft: 10, fontSize: "var(--text-sm)", letterSpacing: "0.1em", textTransform: "uppercase", color: i === 0 ? "var(--color-text)" : "color-mix(in srgb, var(--color-text) 57%, transparent)", borderLeft: "1px solid var(--color-divider)" }}>{m.label}</div>
                  ))}
                </div>
                <div style={{ display: "flex", height: 26, borderBottom: "1px solid var(--color-divider)" }}>
                  {ticks.map((t, i) => (
                    <div key={i} style={{ width: t.width, flex: "0 0 auto", display: "flex", alignItems: "flex-start", justifyContent: "center", fontSize: "var(--text-2xs)", color: t.isToday ? "var(--color-accent-200)" : t.isWeekend ? "color-mix(in srgb, var(--color-text) 45%, transparent)" : "color-mix(in srgb, var(--color-text) 58%, transparent)" }}>{t.label}</div>
                  ))}
                </div>
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, top: 52, bottom: 0, pointerEvents: "none" }}>
                {ticks.map((t, i) => t.isWeekend && (
                  <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: i * dayW, width: dayW, background: "color-mix(in srgb, var(--color-text) 3%, transparent)" }} />
                ))}
                <div style={{ position: "absolute", top: 0, bottom: 0, left: todayOffset * dayW + dayW / 2, width: 1, background: "var(--color-accent)" }} />
              </div>
              <div style={{ position: "relative", zIndex: 2 }}>
                {groups.map((g) => (
                  <GroupBars key={g.label} group={g} collapsed={!!collapsed[g.label]} dayW={dayW} rangeStart={rangeStart} onOpen={onOpen} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20, paddingTop: 14, fontSize: "var(--text-xs)", color: "color-mix(in srgb, var(--color-text) 58%, transparent)", flexWrap: "wrap" }}>
        <Legend color="var(--priority-high)" label="Priorità alta" />
        <Legend color="var(--priority-medium)" label="Priorità media" />
        <Legend color="var(--priority-low)" label="Priorità bassa" />
        <Legend color="var(--priority-none)" label="Nessuna priorità" />
        <Legend color="var(--color-accent)" label="Oggi" style={{ marginLeft: "auto" }} />
      </div>
    </div>
  );
}

function Legend({ color, label, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, ...style }}>
      <span style={{ width: 16, height: 8, borderRadius: "var(--radius-sm)", background: color }} />
      {label}
    </span>
  );
}

function GroupHeadRows({ group, collapsed, onToggle, onOpen }) {
  return (
    <div>
      <div className="g-row" style={{ height: 34, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderBottom: "1px solid var(--color-divider)" }}>
        <button type="button" onClick={onToggle} aria-label="Apri o chiudi progetto" style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", cursor: "pointer", padding: 0, color: "inherit", fontFamily: "var(--font-body)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ transform: collapsed ? "rotate(0deg)" : "rotate(90deg)", color: "color-mix(in srgb, var(--color-text) 58%, transparent)" }}><path d="M9 5l7 7-7 7" /></svg>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: group.color }} />
          <span style={{ fontSize: "var(--text-sm)", letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>{group.label}</span>
        </button>
        <span style={{ marginLeft: "auto", fontSize: "var(--text-sm)", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{group.rows.length}</span>
      </div>
      {!collapsed && group.rows.map((item) => (
        <div key={item.id} className="g-row" style={{ height: 38, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderBottom: "1px solid var(--color-divider)" }}>
          <div onClick={() => onOpen(item)} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, cursor: "pointer" }}>
            <span style={{ flex: "0 0 auto", width: 13, height: 13, marginLeft: 19, borderRadius: 999, border: `1.5px solid ${item.status === "completed" ? "var(--color-neutral-700)" : PRIORITY_COLORS[item.priority]}`, background: item.status === "completed" ? "var(--color-neutral-700)" : "transparent" }} />
            <span style={{ fontSize: "var(--text-base-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: item.status === "completed" ? "line-through" : "none", color: item.status === "completed" ? "color-mix(in srgb, var(--color-text) 55%, transparent)" : "var(--color-text)" }}>{item.title}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupBars({ group, collapsed, dayW, rangeStart, onOpen }) {
  return (
    <div>
      <div style={{ height: 34, borderBottom: "1px solid var(--color-divider)" }} />
      {!collapsed && group.rows.map((item) => {
        const offset = dayDiff(item.dueAt, rangeStart);
        const done = item.status === "completed";
        return (
          <div key={item.id} className="g-row" style={{ position: "relative", height: 38, borderBottom: "1px solid var(--color-divider)" }}>
            <div
              className="g-bar"
              onClick={() => onOpen(item)}
              style={{
                position: "absolute",
                top: "50%",
                transform: "translateY(-50%)",
                left: offset * dayW,
                width: Math.max(dayW - 4, 12),
                height: 22,
                display: "flex",
                alignItems: "center",
                padding: "0 8px",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                overflow: "hidden",
                background: done ? "transparent" : "color-mix(in srgb, " + PRIORITY_COLORS[item.priority] + " 28%, var(--color-surface))",
                border: done ? "1px dashed var(--color-neutral-600)" : "1px solid transparent",
                borderLeft: `2px solid ${done ? "var(--color-neutral-600)" : PRIORITY_COLORS[item.priority]}`,
              }}
              title={item.title}
            />
          </div>
        );
      })}
    </div>
  );
}
