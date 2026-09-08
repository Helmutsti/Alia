import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  endOfWeekIso,
  formatDateTimeShort,
  todayIso,
  tomorrowIso,
} from "../lib/format.js";
import { formatReminderOffset, parseComposerTitle } from "../lib/composerSyntax.js";

const DUE_PRESETS = [
  { label: "Oggi", toIso: () => todayIso() },
  { label: "Domani", toIso: () => tomorrowIso() },
  { label: "Questa settimana", toIso: () => endOfWeekIso() },
  { label: "Nessuna", toIso: () => null },
];

const REMINDER_PRESETS = [
  { label: "Tra 30 minuti", ms: 30 * 60 * 1000 },
  { label: "Tra 1 ora", ms: 60 * 60 * 1000 },
  { label: "Tra 3 ore", ms: 3 * 60 * 60 * 1000 },
  { label: "Domani", ms: 24 * 60 * 60 * 1000 },
  { label: "Nessuno", ms: null },
];

const DEFAULT_DUE = { label: "Nessuna", custom: false, iso: null };
const DEFAULT_REMINDER = { label: "Nessuno", custom: false, ms: null, iso: null };

const PRIORITY_OPTIONS = [...PRIORITY_ORDER].reverse().map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));

const PROJECT_OPTIONS = ["Casa", "Lavoro", "Salute", "Personale"];
const TAG_OPTIONS = ["spesa", "urgente", "telefonata", "famiglia"];

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const CalendarIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 11h18" />
  </svg>
);

const FlagIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 21V4h9l-1 3 1 3H5" />
  </svg>
);

const AlarmIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 10v3.5l2.5 1.5" />
    <path d="M5.6 3.2L3.2 5.6M18.4 3.2L20.8 5.6" />
  </svg>
);

const FolderIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7h6l2 3h10v9H3z" />
  </svg>
);

const TagIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />
  </svg>
);

const PaperclipIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48" />
  </svg>
);

export default function TaskComposer({ mode = "inline", onCreated, onClose, autoFocus = false }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("none");
  const [prioritySource, setPrioritySource] = useState("default"); // default | text | manual
  const [dueChoice, setDueChoice] = useState(DEFAULT_DUE);
  const [reminderChoice, setReminderChoice] = useState(DEFAULT_REMINDER);
  const [reminderSource, setReminderSource] = useState("default"); // default | text | manual
  const [project, setProject] = useState(null);
  const [projectSource, setProjectSource] = useState("default"); // default | text | manual
  const [manualTags, setManualTags] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [menu, setMenu] = useState(null);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const flashTimer = useRef(null);
  const titleRef = useRef(null);
  const descRef = useRef(null);
  const fileInputRef = useRef(null);

  const parsed = parseComposerTitle(title);

  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [desc]);

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // La priorità e il promemoria digitati nel titolo restano legati al testo:
  // se il simbolo viene cancellato, l'attributo torna com'era prima — a meno
  // che non sia stato impostato a mano dal menu (quello resta finché non lo si cambia).
  useEffect(() => {
    if (parsed.priority) {
      setPriority(parsed.priority);
      setPrioritySource("text");
    } else if (prioritySource === "text") {
      setPriority("none");
      setPrioritySource("default");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.priority]);

  useEffect(() => {
    if (parsed.reminderMs != null) {
      setReminderChoice({ label: formatReminderOffset(parsed.reminderMs), custom: false, ms: parsed.reminderMs, iso: null });
      setReminderSource("text");
    } else if (reminderSource === "text") {
      setReminderChoice(DEFAULT_REMINDER);
      setReminderSource("default");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.reminderMs]);

  useEffect(() => {
    if (parsed.project) {
      setProject(parsed.project);
      setProjectSource("text");
    } else if (projectSource === "text") {
      setProject(null);
      setProjectSource("default");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.project]);

  const isFloating = mode === "floating";
  const priorityLabel = priority === "none" ? "Priorità" : PRIORITY_LABELS[priority];
  const effectiveTags = [...new Set([...parsed.tags, ...manualTags])];

  const dueOn = dueChoice.custom || dueChoice.label !== "Nessuna";
  const dueLabel = dueChoice.custom ? formatDateTimeShort(dueChoice.iso) : dueChoice.label;

  const reminderOn = reminderChoice.custom || reminderChoice.label !== "Nessuno";
  const reminderLabel = reminderChoice.custom ? formatDateTimeShort(reminderChoice.iso) : reminderChoice.label;

  function dueIso() {
    if (dueChoice.custom) return dueChoice.iso;
    return (DUE_PRESETS.find((p) => p.label === dueChoice.label) ?? DUE_PRESETS[DUE_PRESETS.length - 1]).toIso();
  }

  function reminderIso() {
    if (reminderChoice.custom) return reminderChoice.iso;
    if (reminderChoice.ms == null) return null;
    return new Date(Date.now() + reminderChoice.ms).toISOString();
  }

  function pickAttachments(e) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setAttachments((list) => [...list, ...files]);
    e.target.value = "";
  }

  function removeAttachment(index) {
    setAttachments((list) => list.filter((_, i) => i !== index));
  }

  async function send() {
    const trimmedTitle = parsed.cleanTitle;
    if (!trimmedTitle || sending) return;

    setSending(true);
    setError("");
    try {
      const created = await api.createItem({
        title: trimmedTitle,
        description: desc.trim() || undefined,
        priority,
        dueAt: dueIso() ?? undefined,
        tags: effectiveTags.length ? effectiveTags : undefined,
        project: project ?? undefined,
        reminderAt: reminderIso() ?? undefined,
        sourceType: "manual",
      });

      setTitle("");
      setDesc("");
      setPriority("none");
      setPrioritySource("default");
      setDueChoice(DEFAULT_DUE);
      setReminderChoice(DEFAULT_REMINDER);
      setReminderSource("default");
      setProject(null);
      setProjectSource("default");
      setManualTags([]);
      setAttachments([]);
      setMenu(null);
      setFlash(`Aggiunto · ${dueOn ? dueLabel : "Prima o poi"}`);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(""), 2200);

      onCreated?.(created);
      if (isFloating) onClose?.();
    } catch (err) {
      console.error("Errore creando il task:", err);
      setError(err?.message || "Errore sconosciuto durante il salvataggio");
    } finally {
      setSending(false);
    }
  }

  function onTitleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      descRef.current?.focus();
    } else if (e.key === "Escape" && isFloating) {
      onClose?.();
    }
  }

  function onDescKeyDown(e) {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape" && isFloating) {
      onClose?.();
    }
  }

  const sendDisabled = parsed.cleanTitle === "";

  return (
    <div
      className={`card ${isFloating ? "elev-lg" : "elev-sm"}`}
      style={{ position: "relative", width: "100%", gap: 0, padding: 0, overflow: "visible" }}
    >
      <div style={{ padding: "var(--space-4) var(--space-4) var(--space-2)" }}>
        <input
          ref={titleRef}
          className="input composer-title"
          placeholder="Cosa c'è da fare?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onTitleKeyDown}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            minHeight: 0,
            fontFamily: "var(--font-heading)",
            fontWeight: 500,
            fontSize: 19,
            letterSpacing: "-0.015em",
          }}
        />
        <textarea
          ref={descRef}
          className="input composer-desc"
          placeholder="Aggiungi una nota"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={onDescKeyDown}
          rows={2}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            minHeight: 0,
            marginTop: 6,
            fontSize: 13.5,
            lineHeight: 1.45,
            fontFamily: "inherit",
            resize: "none",
            overflowY: "auto",
            maxHeight: 240,
            color: "color-mix(in srgb, var(--color-text) 72%, transparent)",
          }}
        />
        {error && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: "#ff6b6b" }}>{error}</div>
        )}
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          padding: "var(--space-3) var(--space-4)",
          borderTop: "1px solid var(--color-divider)",
        }}
      >
        <Chip icon={CalendarIcon} label={dueLabel} on={dueOn} onClick={() => setMenu(menu === "due" ? null : "due")} />
        <Chip
          icon={FlagIcon}
          label={priorityLabel}
          on={priority !== "none"}
          onClick={() => setMenu(menu === "priority" ? null : "priority")}
        />
        <Chip
          icon={AlarmIcon}
          label={reminderLabel}
          on={reminderOn}
          onClick={() => setMenu(menu === "reminder" ? null : "reminder")}
        />
        <Chip
          icon={FolderIcon}
          label={project || "Progetto"}
          on={!!project}
          onClick={() => setMenu(menu === "project" ? null : "project")}
        />
        <Chip
          icon={TagIcon}
          label={effectiveTags.length ? `${effectiveTags.length} tag` : "Tag"}
          on={effectiveTags.length > 0}
          onClick={() => setMenu(menu === "tags" ? null : "tags")}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={pickAttachments}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="chip"
          onClick={() => fileInputRef.current?.click()}
          title="Allega file"
          aria-label="Allega file"
          style={{
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            width: 27,
            height: 27,
            padding: 0,
            borderRadius: "var(--radius-md)",
            background: "transparent",
            border: `1px solid ${attachments.length ? "var(--color-accent)" : "transparent"}`,
            color: attachments.length ? "var(--color-accent-300)" : "color-mix(in srgb, var(--color-text) 62%, transparent)",
          }}
        >
          {PaperclipIcon}
        </button>
        {effectiveTags.map((t) => (
          <span key={t} className="tag tag-neutral">
            #{t}
          </span>
        ))}
        {attachments.map((file, i) => (
          <span key={`${file.name}-${i}`} className="tag tag-neutral" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {file.name}
            <button
              type="button"
              onClick={() => removeAttachment(i)}
              aria-label="Rimuovi allegato"
              style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1, opacity: 0.7 }}
            >
              ✕
            </button>
          </span>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          {flash && <span style={{ fontSize: 12, color: "var(--color-accent-300)" }}>{flash}</span>}
          <button
            type="button"
            className="ghost-send"
            disabled={sendDisabled || sending}
            onClick={send}
            title="Aggiungi task (Maiusc+Invio)"
            aria-label="Aggiungi task"
            style={{
              display: "grid",
              placeItems: "center",
              width: 27,
              height: 27,
              padding: 0,
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--color-accent)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2.5L2.8 9.6c-.7.3-.7 1.2 0 1.5l7.1 2.7c.2.1.4.3.5.5l2.7 7.1c.3.7 1.2.7 1.5 0z" />
              <path d="M10.4 13.6l5.6-5.6" />
            </svg>
          </button>
        </div>

        {menu === "due" && (
          <Menu title="Scadenza">
            {DUE_PRESETS.map((o) => (
              <MenuItem
                key={o.label}
                label={o.label}
                active={!dueChoice.custom && dueChoice.label === o.label}
                onClick={() => {
                  setDueChoice({ label: o.label, custom: false, iso: null });
                  setMenu(null);
                }}
              />
            ))}
            <CustomDateTimeField
              value={dueChoice.custom ? dueChoice.iso : null}
              onChange={(iso) => {
                setDueChoice({ label: "Personalizzata", custom: true, iso });
                setMenu(null);
              }}
            />
          </Menu>
        )}
        {menu === "priority" && (
          <Menu title="Priorità">
            {PRIORITY_OPTIONS.map((o) => (
              <MenuItem
                key={o.value}
                label={o.label}
                active={priority === o.value}
                onClick={() => {
                  setPriority(o.value);
                  setPrioritySource("manual");
                  setMenu(null);
                }}
              />
            ))}
          </Menu>
        )}
        {menu === "reminder" && (
          <Menu title="Promemoria">
            {REMINDER_PRESETS.map((o) => (
              <MenuItem
                key={o.label}
                label={o.label}
                active={!reminderChoice.custom && reminderChoice.label === o.label}
                onClick={() => {
                  setReminderChoice({ label: o.label, custom: false, ms: o.ms, iso: null });
                  setReminderSource("manual");
                  setMenu(null);
                }}
              />
            ))}
            <CustomDateTimeField
              value={reminderChoice.custom ? reminderChoice.iso : null}
              onChange={(iso) => {
                setReminderChoice({ label: "Personalizzato", custom: true, ms: null, iso });
                setReminderSource("manual");
                setMenu(null);
              }}
            />
          </Menu>
        )}
        {menu === "project" && (
          <Menu title="Progetto">
            {PROJECT_OPTIONS.map((p) => (
              <MenuItem
                key={p}
                label={p}
                active={project === p}
                onClick={() => {
                  setProject(p);
                  setProjectSource("manual");
                  setMenu(null);
                }}
              />
            ))}
            <MenuItem
              label="Nessuno"
              active={!project}
              onClick={() => {
                setProject(null);
                setProjectSource("manual");
                setMenu(null);
              }}
            />
          </Menu>
        )}
        {menu === "tags" && (
          <Menu title="Tag">
            {TAG_OPTIONS.map((t) => (
              <MenuItem
                key={t}
                label={t}
                active={manualTags.includes(t)}
                onClick={() => {
                  setManualTags((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
                }}
              />
            ))}
          </Menu>
        )}
      </div>
      {isFloating && (
        <div
          style={{
            display: "flex",
            gap: "var(--space-4)",
            padding: "var(--space-2) var(--space-4) var(--space-3)",
            fontSize: 11,
            color: "color-mix(in srgb, var(--color-text) 58%, transparent)",
          }}
        >
          <span>Invio per passare alla nota, Maiusc+Invio per aggiungere</span>
          <span>Esc per chiudere</span>
          <span style={{ marginLeft: "auto" }}>⌘K da ogni schermata</span>
        </div>
      )}
    </div>
  );
}

function Chip({ label, on, onClick, icon }) {
  return (
    <button
      type="button"
      className="chip"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        fontSize: 12,
        height: 27,
        padding: "0 10px",
        borderRadius: "var(--radius-md)",
        background: "transparent",
        border: `1px solid ${on ? "var(--color-accent)" : "transparent"}`,
        color: on ? "var(--color-accent-300)" : "color-mix(in srgb, var(--color-text) 62%, transparent)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}


function Menu({ title, children }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "var(--space-4)",
        top: "calc(100% + 6px)",
        zIndex: 5,
        minWidth: 210,
        padding: "var(--space-2)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-surface)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--color-text) 60%, transparent)",
          padding: "4px 8px 6px",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function MenuItem({ label, active, onClick }) {
  return (
    <button
      type="button"
      className="menu-item"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        width: "100%",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-body)",
        fontSize: 13,
        padding: "6px 8px",
        borderRadius: "var(--radius-sm)",
        color: active ? "var(--color-accent-300)" : "var(--color-text)",
      }}
    >
      <span>{label}</span>
      {active && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

function CustomDateTimeField({ value, onChange }) {
  return (
    <div style={{ borderTop: "1px solid var(--color-divider)", marginTop: 4, paddingTop: 6, padding: "6px 8px 2px" }}>
      <input
        type="datetime-local"
        className="input"
        defaultValue={toDatetimeLocalValue(value)}
        onChange={(e) => {
          if (!e.target.value) return;
          const iso = new Date(e.target.value).toISOString();
          onChange(iso);
        }}
        style={{ fontSize: 12.5, height: 30, minHeight: 30, padding: "2px 8px" }}
      />
    </div>
  );
}
