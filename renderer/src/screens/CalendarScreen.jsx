import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { PRIORITY_COLORS } from "../lib/format.js";

const MONTH_LABELS_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const WEEKDAY_LABELS_IT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export default function CalendarScreen({ reloadKey, onOpen }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const load = useCallback(async () => {
    const rows = await api.listItems({ limit: 200 });
    setItems(rows.filter((i) => i.dueAt && i.status !== "archived"));
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const today = new Date();

  const days = useMemo(() => {
    const firstOfMonth = cursor;
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // lunedì = 0
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      cells.push({
        date,
        num: d,
        isToday: isSameDay(date, today),
        items: items.filter((i) => isSameDay(i.dueAt, date)),
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor, items, today]);

  function shiftMonth(delta) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: "var(--text-sm)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", marginBottom: 8 }}>{cursor.getFullYear()}</div>
          <h2 style={{ margin: 0 }}>{MONTH_LABELS_IT[cursor.getMonth()]}</h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="Mese precedente" onClick={() => shiftMonth(-1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button type="button" className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="Mese successivo" onClick={() => shiftMonth(1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: "1px 0", marginBottom: 8 }}>
        {WEEKDAY_LABELS_IT.map((w) => (
          <div key={w} style={{ fontSize: "var(--text-xs)", letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 56%, transparent)", paddingBottom: 6 }}>{w}</div>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", borderTop: "1px solid var(--color-divider)" }}>
        {days.map((cell, idx) => (
          <div
            key={idx}
            style={{
              minHeight: 96,
              padding: 8,
              borderBottom: "1px solid var(--color-divider)",
              borderRight: "1px solid var(--color-divider)",
              background: cell?.isToday ? "color-mix(in srgb, var(--color-accent) 9%, transparent)" : "transparent",
            }}
          >
            {cell && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: "var(--text-sm)", color: cell.isToday ? "var(--color-accent-200)" : "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>{cell.num}</span>
                  {cell.isToday && <span style={{ fontSize: "var(--text-2xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent)" }}>oggi</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {cell.items.slice(0, 3).map((item) => {
                    const done = item.status === "completed";
                    return (
                      <div
                        key={item.id}
                        onClick={() => onOpen(item)}
                        title={item.title}
                        style={{
                          fontSize: "var(--text-xs)",
                          lineHeight: 1.35,
                          padding: "3px 8px",
                          borderRadius: "var(--radius-sm)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          cursor: "pointer",
                          background: "color-mix(in srgb, var(--color-text) 6%, transparent)",
                          color: done ? "color-mix(in srgb, var(--color-text) 55%, transparent)" : "color-mix(in srgb, var(--color-text) 82%, transparent)",
                          textDecoration: done ? "line-through" : "none",
                          borderLeft: `2px solid ${done ? "var(--color-neutral-700)" : PRIORITY_COLORS[item.priority]}`,
                        }}
                      >
                        {item.title}
                      </div>
                    );
                  })}
                  {cell.items.length > 3 && (
                    <div style={{ fontSize: "var(--text-xs)", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>+{cell.items.length - 3} altri</div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
