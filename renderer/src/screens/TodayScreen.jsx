import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import TaskRow from "../components/TaskRow.jsx";
import { formatWeekdayLong, isPast, isSameDay } from "../lib/format.js";

export default function TodayScreen({ reloadKey, onOpen }) {
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    const rows = await api.listItems({
      status: "active",
      orderBy: "dueAt",
      orderDirection: "asc",
    });
    setItems(rows);
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const overdue = items.filter((i) => i.dueAt && isPast(i.dueAt));
  const today = items.filter((i) => i.dueAt && !isPast(i.dueAt) && isSameDay(i.dueAt, new Date()));
  const noDue = items.filter((i) => !i.dueAt);

  const groups = [
    { label: "Scaduti", color: "#ff6b6b", rows: overdue },
    { label: "Oggi", color: "var(--color-accent-300)", rows: today },
    { label: "Senza scadenza", color: "color-mix(in srgb, var(--color-text) 60%, transparent)", rows: noDue },
  ].filter((g) => g.rows.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", marginBottom: 8 }}>
          {formatWeekdayLong()}
        </div>
        <h2 style={{ margin: 0, fontSize: 38 }}>Oggi</h2>
      </div>

      {items.length === 0 && (
        <p style={{ fontSize: 13, color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
          Nessun task attivo. Attiva un elemento dall'Inbox per vederlo qui.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 26, overflowY: "auto", minHeight: 0 }}>
        {groups.map((g) => (
          <div key={g.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, padding: "0 12px" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: g.color }}>
                {g.label}
              </span>
              <span style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                {g.rows.length}
              </span>
              <span style={{ height: 1, flex: 1, background: "linear-gradient(to right, var(--color-divider), transparent)" }} />
            </div>
            {g.rows.map((item) => (
              <TaskRow key={item.id} item={item} onOpen={onOpen} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
