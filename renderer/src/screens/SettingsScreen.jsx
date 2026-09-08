import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

const TABS = [
  {
    key: "notifiche",
    label: "Notifiche",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M18 8a6 6 0 10-12 0c0 3.5-1.2 5.3-2 6.5h16c-.8-1.2-2-3-2-6.5z" />
        <path d="M10.5 19a1.7 1.7 0 003 0" />
      </svg>
    ),
  },
  {
    key: "fonti",
    label: "Fonti collegate",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 4v5" />
      </svg>
    ),
  },
  {
    key: "scorciatoie",
    label: "Scorciatoie",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="8" width="16" height="8" rx="1.5" />
        <path d="M7.5 12h.01M10.5 12h.01M13.5 12h.01M16.5 12h.01" />
      </svg>
    ),
  },
  {
    key: "stati",
    label: "Stati",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8" cy="7" r="2.3" /><circle cx="8" cy="17" r="2.3" /><path d="M8 9.5v5" /><path d="M14 7h6M14 17h6" />
      </svg>
    ),
  },
];

const TOGGLE_DEFS = [
  { key: "near", label: "Promemoria attività in scadenza", hint: "Un avviso quando un'attività si avvicina alla scadenza" },
  { key: "push", label: "Notifiche push su desktop", hint: "Ricevi un avviso anche quando l'app è in background" },
  { key: "weekly", label: "Riepilogo email settimanale", hint: "Un'email ogni lunedì con quello che resta aperto" },
  { key: "quiet", label: "Orario silenzioso", hint: "Nessuna notifica tra le 22:00 e le 08:00" },
];

const DEFAULT_TOGGLES = { near: true, push: true, weekly: false, quiet: false };
const TOGGLES_STORAGE_KEY = "alia:notification-prefs";

function loadToggles() {
  try {
    const raw = localStorage.getItem(TOGGLES_STORAGE_KEY);
    if (!raw) return DEFAULT_TOGGLES;
    return { ...DEFAULT_TOGGLES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TOGGLES;
  }
}

const SHORTCUT_GROUPS = [
  {
    title: "Navigazione",
    rows: [
      { keys: ["J", "K"], label: "Vai all'attività successiva / precedente" },
      { keys: ["/"], label: "Cerca" },
      { keys: ["G"], label: "Vai a un elenco" },
    ],
  },
  {
    title: "Attività",
    rows: [
      { keys: ["N"], label: "Nuova attività" },
      { keys: ["E"], label: "Modifica l'attività selezionata" },
      { keys: ["Spazio"], label: "Segna come completata" },
      { keys: ["P"], label: "Posticipa di un giorno" },
      { keys: ["⌫"], label: "Elimina l'attività" },
    ],
  },
];

const SOURCE_ROWS = ["Email di lavoro", "Chat del team", "Note"];

const STATUS_TYPE_OPTIONS = [
  { value: "apertura", label: "Apertura" },
  { value: "in_corso", label: "-" },
  { value: "chiusura", label: "Chiusura" },
];

const TrashIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
);
const PlusIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
);
const DragIcon = (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="3" r="1" /><circle cx="7" cy="3" r="1" /><circle cx="3" cy="7" r="1" /><circle cx="7" cy="7" r="1" /><circle cx="3" cy="11" r="1" /><circle cx="7" cy="11" r="1" /></svg>
);
const CloseIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

export default function SettingsScreen({ onClose }) {
  const [tab, setTab] = useState("notifiche");
  const [toggles, setToggles] = useState(loadToggles);
  const [statuses, setStatuses] = useState([]);
  const [draggingId, setDraggingId] = useState(null);
  const orderOnDragStart = useRef([]);

  useEffect(() => {
    let cancelled = false;
    api.listStatuses().then((rows) => { if (!cancelled) setStatuses(rows); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    try {
      localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify(toggles));
    } catch {
      // localStorage non disponibile: le preferenze restano solo per la sessione
    }
  }, [toggles]);

  function toggle(key) {
    setToggles((t) => ({ ...t, [key]: !t[key] }));
  }

  function dragStart(id) {
    orderOnDragStart.current = statuses.map((s) => s.id);
    setDraggingId(id);
  }

  function dragEnter(targetId) {
    if (draggingId == null || draggingId === targetId) return;
    setStatuses((list) => {
      const from = list.findIndex((s) => s.id === draggingId);
      const to = list.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0 || from === to) return list;
      const next = list.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function dragEnd() {
    const draggedId = draggingId;
    setDraggingId(null);
    const finalOrder = statuses.map((s) => s.id);
    const before = orderOnDragStart.current;
    if (draggedId == null || before.length === 0 || finalOrder.join(",") === before.join(",")) return;
    const updated = await api.reorderStatuses(finalOrder);
    setStatuses(updated);
  }

  async function renameStatus(id, label) {
    setStatuses((list) => list.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  async function commitRename(id, label) {
    if (!label.trim()) return;
    const updated = await api.updateStatus(id, { label: label.trim() });
    setStatuses(updated);
  }

  async function retypeStatus(id, type) {
    const updated = await api.updateStatus(id, { type });
    setStatuses(updated);
  }

  async function removeStatus(id) {
    const updated = await api.deleteStatus(id);
    setStatuses(updated);
  }

  async function addStatus() {
    const updated = await api.createStatus({ label: "Nuovo stato", type: "apertura" });
    setStatuses(updated);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, #0a0b0b 64%, transparent)", zIndex: 20 }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 224, display: "grid", placeItems: "center" }}>
        <div
          className="card elev-lg"
          style={{ position: "relative", width: "100%", maxWidth: 820, height: 600, maxHeight: "88vh", gap: 0, padding: 0, display: "flex", flexDirection: "row", overflow: "hidden" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="ghost-ico"
            aria-label="Chiudi"
            onClick={onClose}
            style={{ position: "absolute", top: 12, right: 12, zIndex: 1, display: "grid", placeItems: "center", width: 27, height: 27, padding: 0, border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}
          >
            {CloseIcon}
          </button>
          <div style={{ width: 220, flex: "0 0 auto", borderRight: "1px solid var(--color-divider)", padding: "20px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ padding: "4px 12px 16px" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 16 }}>Impostazioni</span>
            </div>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`setnav-item${tab === t.key ? " active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1, padding: "24px 32px", overflow: "auto" }}>
            {tab === "notifiche" && (
              <div>
                <div className="ssec-title">Notifiche</div>
                {TOGGLE_DEFS.map((t) => (
                  <div key={t.key} className="srow">
                    <div>
                      <div className="slabel">{t.label}</div>
                      <div className="shint">{t.hint}</div>
                    </div>
                    <button
                      type="button"
                      className="toggle-track"
                      style={{ background: toggles[t.key] ? "var(--color-accent)" : "var(--color-neutral-800)" }}
                      onClick={() => toggle(t.key)}
                      aria-pressed={toggles[t.key]}
                      aria-label={t.label}
                    >
                      <span className="toggle-knob" style={{ left: toggles[t.key] ? 16 : 2 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tab === "fonti" && (
              <div>
                <div className="ssec-title">Fonti collegate</div>
                <div className="shint" style={{ marginBottom: 6 }}>Collega le fonti da cui vuoi che Alia raccolga le attività. Non ancora attivo in questa versione.</div>
                {SOURCE_ROWS.map((label, i) => (
                  <div key={label} className="srow" style={i === SOURCE_ROWS.length - 1 ? { borderBottom: "none" } : undefined}>
                    <div className="slabel">{label}</div>
                    <span className="tag tag-outline">non connessa</span>
                  </div>
                ))}
              </div>
            )}

            {tab === "scorciatoie" && (
              <div>
                {SHORTCUT_GROUPS.map((group, gi) => (
                  <div key={group.title} style={gi > 0 ? { marginTop: 22 } : undefined}>
                    <div className="ssec-title">{group.title}</div>
                    {group.rows.map((row) => (
                      <div key={row.label} className="scut-row">
                        {row.keys.map((k) => <span key={k} className="kcap">{k}</span>)}
                        <span className="shint" style={{ margin: 0 }}>{row.label}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {tab === "stati" && (
              <div>
                <div className="ssec-title">Stati</div>
                <div className="shint" style={{ marginBottom: 10 }}>Ordina, rinomina o rimuovi gli stati. Il tipo determina se l'attività conta come ancora da fare, in corso o conclusa.</div>
                {statuses.map((s) => (
                  <div
                    key={s.id}
                    className={`strow${draggingId === s.id ? " dragging" : ""}`}
                    onDragEnter={(e) => { e.preventDefault(); dragEnter(s.id); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => e.preventDefault()}
                  >
                    <span
                      className="draghandle"
                      draggable
                      onDragStart={() => dragStart(s.id)}
                      onDragEnd={dragEnd}
                      aria-label="Riordina"
                    >
                      {DragIcon}
                    </span>
                    <input
                      className="input sname"
                      type="text"
                      value={s.label}
                      onChange={(e) => renameStatus(s.id, e.target.value)}
                      onBlur={(e) => commitRename(s.id, e.target.value)}
                    />
                    <select className="input stype" value={s.type} onChange={(e) => retypeStatus(s.id, e.target.value)}>
                      {STATUS_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost-ico"
                      onClick={() => removeStatus(s.id)}
                      aria-label={`Rimuovi stato ${s.label}`}
                      style={{ display: "grid", placeItems: "center", width: 28, height: 28, flex: "0 0 auto", padding: 0, border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}
                    >
                      {TrashIcon}
                    </button>
                  </div>
                ))}
                <button type="button" className="linkbtn" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }} onClick={addStatus}>
                  {PlusIcon}
                  Aggiungi stato
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
