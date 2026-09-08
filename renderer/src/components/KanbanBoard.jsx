import { useCallback, useRef, useState } from "react";
import TaskRow from "./TaskRow.jsx";

const AddIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flex: "0 0 auto" }}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const SendIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.5 2.5L2.8 9.6c-.7.3-.7 1.2 0 1.5l7.1 2.7c.2.1.4.3.5.5l2.7 7.1c.3.7 1.2.7 1.5 0z" />
    <path d="M10.4 13.6l5.6-5.6" />
  </svg>
);

function snapshotCards(host) {
  if (!host) return null;
  const map = {};
  host.querySelectorAll("[data-card]").forEach((el) => {
    const r = el.getBoundingClientRect();
    map[el.getAttribute("data-card")] = { x: r.left, y: r.top };
  });
  return map;
}

function playFlip(host, before) {
  if (!before) return;
  let attempts = 0;
  const run = () => {
    if (!host) return;
    const jobs = [];
    host.querySelectorAll("[data-card]").forEach((el) => {
      const was = before[el.getAttribute("data-card")];
      if (!was) return;
      const r = el.getBoundingClientRect();
      const dx = was.x - r.left;
      const dy = was.y - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      jobs.push({ el, dx, dy });
    });
    if (!jobs.length) {
      if (attempts < 30) {
        attempts++;
        requestAnimationFrame(run);
      }
      return;
    }
    jobs.forEach(({ el, dx, dy }) => {
      if (typeof el.animate !== "function") return;
      const anim = el.animate(
        [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "translate(0px,0px)" }],
        { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)", fill: "none" },
      );
      try {
        anim.startTime = document.timeline.currentTime;
      } catch {
        anim.play();
      }
    });
  };
  setTimeout(run, 0);
}

/**
 * groups: [{ key, label, color, rows: Item[] }] — key è l'ID di colonna.
 * groupingField: "status" | "project" | "priority" — campo scritto al drop.
 */
export default function KanbanBoard({ groups, groupingField, onOpen, onToggle, onDrop, onAddInColumn }) {
  const trackRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [draft, setDraft] = useState(null); // { key, title }

  const runMutation = useCallback(async (mutate) => {
    const before = snapshotCards(trackRef.current);
    await mutate();
    playFlip(trackRef.current, before);
  }, []);

  const handleToggle = useCallback((item) => runMutation(() => onToggle(item)), [onToggle, runMutation]);

  function startDraft(key) {
    setDraft({ key, title: "" });
  }

  function cancelDraft() {
    setDraft(null);
  }

  function commitDraft(columnValue) {
    const title = draft?.title.trim();
    if (!title) return;
    runMutation(() => onAddInColumn(groupingField, columnValue, title));
    setDraft(null);
  }

  function dragStart(item, e) {
    if (e.button !== 0) return;
    if (e.target.closest("button")) return;
    const wrapper = e.currentTarget;
    const rect = wrapper.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;

    const clone = wrapper.cloneNode(true);
    clone.style.cssText =
      `position:fixed;left:0;top:0;width:${rect.width}px;margin:0;opacity:1;pointer-events:none;z-index:9999;` +
      `transform:translate(${rect.left}px,${rect.top}px) rotate(1.4deg) scale(1.02);` +
      `filter:drop-shadow(0 14px 26px rgba(0,0,0,.5));cursor:grabbing`;
    document.body.appendChild(clone);

    const cols = trackRef.current
      ? [...trackRef.current.querySelectorAll("[data-col]")].map((el) => ({ key: el.getAttribute("data-col"), el, r: el.getBoundingClientRect() }))
      : [];
    let current = null;
    const paint = (hit) => {
      cols.forEach((c) => {
        const on = hit && c.key === hit.key;
        c.el.style.borderColor = on ? "var(--color-accent)" : "transparent";
        c.el.style.background = on
          ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
          : "color-mix(in srgb, var(--color-text) 3.5%, transparent)";
      });
    };

    const move = (ev) => {
      clone.style.transform = `translate(${ev.clientX - offX}px,${ev.clientY - offY}px) rotate(1.4deg) scale(1.02)`;
      let hit = null;
      for (const c of cols) {
        if (ev.clientX >= c.r.left && ev.clientX <= c.r.right) {
          hit = c;
          break;
        }
      }
      if ((hit && hit.key) !== (current && current.key)) {
        current = hit;
        paint(hit);
      }
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      paint(null);
      clone.remove();
      setDraggingId(null);
      if (current && current.key !== columnKeyOf(item)) {
        const targetGroup = groups.find((g) => g.key === current.key);
        if (targetGroup) runMutation(() => onDrop(item, groupingField, targetGroup.value));
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    setDraggingId(item.id);
    e.preventDefault();
  }

  function columnKeyOf(item) {
    return groups.find((g) => g.rows.some((r) => r.id === item.id))?.key;
  }

  return (
    <div ref={trackRef} className="ktrack" style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 16, overflowX: "auto", overflowY: "visible", paddingBottom: 10 }}>
      {groups.map((g) => (
        <div
          key={g.key}
          data-col={g.key}
          style={{ display: "flex", flexDirection: "column", flex: "0 0 288px", width: 288, padding: "12px", borderRadius: "var(--radius-md)", background: "color-mix(in srgb, var(--color-text) 3.5%, transparent)", border: "1px solid transparent" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px", marginBottom: 16 }}>
            <span style={{ fontSize: "var(--text-sm)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-heading)", fontWeight: 500, color: g.color }}>{g.label}</span>
            <span style={{ marginLeft: "auto", fontSize: "var(--text-sm)", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{g.rows.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.rows.map((item) => (
              <div key={item.id} data-card={item.id} onPointerDown={(e) => dragStart(item, e)} style={{ cursor: "grab", touchAction: "none", opacity: draggingId === item.id ? 0.35 : 1 }}>
                <TaskRow
                  item={item}
                  variant="card"
                  hideStatus={groupingField === "status"}
                  hideProject={groupingField === "project"}
                  onOpen={onOpen}
                  onToggle={handleToggle}
                />
              </div>
            ))}
            {g.rows.length === 0 && !(draft && draft.key === g.key) && (
              <div style={{ padding: "8px 2px", fontSize: "var(--text-sm)", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>Nessun task</div>
            )}
            {draft && draft.key === g.key ? (
              <div
                className="card"
                style={{ padding: 8, borderRadius: "var(--radius-md)", border: "1px solid var(--color-accent)", background: "var(--color-surface)", display: "flex", alignItems: "center", gap: 8 }}
              >
                <input
                  autoFocus
                  className="input"
                  placeholder="Titolo del task"
                  value={draft.title}
                  onChange={(e) => setDraft({ key: g.key, title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelDraft();
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      commitDraft(g.value);
                    }
                  }}
                  style={{ flex: 1, minWidth: 0, height: 30, minHeight: 30, padding: "0 8px", fontSize: "var(--text-base-sm)", border: "none", background: "transparent" }}
                />
                <button
                  type="button"
                  className="ghost-send"
                  disabled={!draft.title.trim()}
                  onClick={() => commitDraft(g.value)}
                  aria-label="Crea task"
                  title="Crea task (Invio)"
                  style={{ display: "grid", placeItems: "center", width: 27, height: 27, padding: 0, border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", color: "var(--color-accent)", flex: "0 0 auto" }}
                >
                  {SendIcon}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="kadd"
                onClick={() => startDraft(g.key)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 2, padding: "8px 12px", border: "1px dashed color-mix(in srgb, var(--color-text) 15%, transparent)", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "var(--text-base-sm)", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}
              >
                {AddIcon}
                <span>Aggiungi una nota</span>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
