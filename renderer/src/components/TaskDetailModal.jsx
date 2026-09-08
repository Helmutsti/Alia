import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import {
  PRIORITY_COLORS,
  formatDateTimeShort,
  formatRelativeDateTime,
  listsForProject,
  projectColor,
  todayIso,
  tomorrowIso,
  endOfWeekIso,
} from "../lib/format.js";
import { useProjects } from "../lib/projectsStore.js";

const PRIORITY_OPTIONS = [
  { value: "high", label: "Alta", desc: "Richiede attenzione immediata" },
  { value: "medium", label: "Media", desc: "Da fare presto" },
  { value: "low", label: "Bassa", desc: "Può aspettare" },
  { value: "none", label: "Nessuna", desc: "Nessuna priorità assegnata" },
];

const STATUS_OPTIONS = [
  { key: "inbox", label: "Da fare", action: (id) => api.moveToInbox(id) },
  { key: "active", label: "In corso", action: (id) => api.activateItem(id) },
  { key: "completed", label: "Fatto", action: (id) => api.completeItem(id) },
];

const REMINDER_PRESETS = [
  { label: "Alla scadenza", offsetMs: 0 },
  { label: "1 ora prima", offsetMs: -60 * 60 * 1000 },
  { label: "Il giorno prima", offsetMs: -24 * 60 * 60 * 1000 },
  { label: "Nessuno", offsetMs: null },
];

const DUE_PRESETS = [
  { label: "Oggi", toIso: () => todayIso() },
  { label: "Domani", toIso: () => tomorrowIso() },
  { label: "Sett.", toIso: () => endOfWeekIso() },
  { label: "Nessuna", toIso: () => null },
];

const TABS = ["Allegati", "Sottotask", "Attività"];

const FlagIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 21V4h9l-1 3 1 3H5" />
  </svg>
);
const MailIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);
const KebabIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
  </svg>
);
const CloseIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const PencilIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const CalendarIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" />
  </svg>
);
const BellIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
  </svg>
);
const ChevronDownIcon = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const PlusIcon = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
);
const TrashIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
);
const ArchiveIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 13h4" />
  </svg>
);
const OutputIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3h7v7" /><path d="M21 3l-9 9" /><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
  </svg>
);
const CheckIcon = (
  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const SendIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.5 2.5L2.8 9.6c-.7.3-.7 1.2 0 1.5l7.1 2.7c.2.1.4.3.5.5l2.7 7.1c.3.7 1.2.7 1.5 0z" />
    <path d="M10.4 13.6l5.6-5.6" />
  </svg>
);
const PaperclipIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48" />
  </svg>
);

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return [open, setOpen, ref];
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TaskDetailModal({ item, onClose, onChanged, onDeleted }) {
  const dbProjects = useProjects();
  const [tab, setTab] = useState("Sottotask");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(item.description ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const [tagDraft, setTagDraft] = useState("");
  const [newSub, setNewSub] = useState("");
  const [comment, setComment] = useState("");
  const [attachments, setAttachments] = useState([]);
  const titleRef = useRef(null);
  const descRef = useRef(null);
  const fileInputRef = useRef(null);

  const [priorityOpen, setPriorityOpen, priorityRef] = useDropdown();
  const [projectOpen, setProjectOpen, projectRef] = useDropdown();
  const [kebabOpen, setKebabOpen, kebabRef] = useDropdown();
  const [dueOpen, setDueOpen, dueRef] = useDropdown();
  const [startOpen, setStartOpen, startRef] = useDropdown();
  const [reminderOpen, setReminderOpen, reminderRef] = useDropdown();
  const [statusOpen, setStatusOpen, statusRef] = useDropdown();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = item.status === "completed";

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!editingDesc) return;
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [descDraft, editingDesc]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  async function apply(changes) {
    onChanged(await api.updateItem(item.id, changes));
  }

  async function saveTitle() {
    const value = titleDraft.trim();
    setEditingTitle(false);
    if (!value || value === item.title) {
      setTitleDraft(item.title);
      return;
    }
    await apply({ title: value });
  }

  async function saveDesc() {
    setEditingDesc(false);
    await apply({ description: descDraft.trim() || null });
  }

  function cancelDesc() {
    setDescDraft(item.description ?? "");
    setEditingDesc(false);
  }

  async function saveNotes() {
    setEditingNotes(false);
    if ((item.notes ?? "") === notesDraft.trim()) return;
    await apply({ notes: notesDraft.trim() || null });
  }

  async function addTag() {
    const value = tagDraft.trim();
    setTagDraft("");
    if (!value || (item.tags ?? []).includes(value)) return;
    await apply({ tags: [...(item.tags ?? []), value] });
  }

  async function removeTag(tag) {
    await apply({ tags: (item.tags ?? []).filter((t) => t !== tag) });
  }

  async function setPriority(value) {
    setPriorityOpen(false);
    await apply({ priority: value });
  }

  async function setProject(value) {
    await apply({ project: value, list: value ? listsForProject(value)[0] : null });
  }

  async function setList(value) {
    setProjectOpen(false);
    await apply({ list: value });
  }

  async function setDueField(field, iso) {
    await apply(field === "start" ? { startAt: iso } : { dueAt: iso });
  }

  async function addStartDate() {
    setDueOpen(false);
    await apply({ startAt: item.dueAt || todayIso() });
  }

  async function removeStartDate() {
    setDueOpen(false);
    setStartOpen(false);
    await apply({ startAt: null });
  }

  async function setReminder(iso) {
    setReminderOpen(false);
    await apply({ reminderAt: iso });
  }

  async function setStatus(option) {
    setStatusOpen(false);
    onChanged(await option.action(item.id));
  }

  async function archive() {
    setKebabOpen(false);
    onChanged(await api.archiveItem(item.id));
    onClose();
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await api.deleteItem(item.id);
    onDeleted(item.id);
  }

  async function addSubtask() {
    const title = newSub.trim();
    if (!title) return;
    onChanged(await api.addSubtask(item.id, title));
    setNewSub("");
  }

  async function toggleSubtask(subtaskId) {
    onChanged(await api.toggleSubtask(subtaskId));
  }

  async function removeSubtask(subtaskId) {
    onChanged(await api.removeSubtask(subtaskId));
  }

  async function sendComment() {
    const text = comment.trim();
    if (!text) return;
    onChanged(await api.addComment(item.id, text));
    setComment("");
  }

  function pickAttachments(e) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) {
      setAttachments((list) => [
        ...list,
        ...files.map((f) => ({ id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`, name: f.name, size: f.size })),
      ]);
    }
    e.target.value = "";
  }

  function removeAttachment(id) {
    setAttachments((list) => list.filter((a) => a.id !== id));
  }

  const priorityColor = item.priority === "none" || item.priority == null ? "color-mix(in srgb, var(--color-text) 55%, transparent)" : PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.high;
  const subtasks = item.subtasks ?? [];
  const subDone = subtasks.filter((s) => s.done).length;
  const comments = item.comments ?? [];
  const activity = [
    { id: "created", who: "AI", text: `Task creato · sorgente ${item.sourceType === "manual" ? "manuale" : item.sourceType}.`, when: formatDateTimeShort(item.createdAt) },
    ...comments.map((c) => ({ id: c.id, who: "Tu", text: c.body, when: formatDateTimeShort(c.createdAt) })),
  ];
  const statusOption = STATUS_OPTIONS.find((o) => o.key === item.status);
  const statusLabel = statusOption ? statusOption.label : "Archiviato";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, #0a0b0b 64%, transparent)", zIndex: 20 }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 224, display: "grid", placeItems: "start center", paddingTop: 56 }}>
        <div
          className="card elev-lg"
          style={{ width: 660, maxWidth: "92vw", maxHeight: "calc(100vh - 96px)", gap: 0, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ---- header ---- */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 12px 16px", flexWrap: "wrap" }}>
            <span ref={priorityRef} style={{ position: "relative", display: "inline-flex" }}>
              <button
                type="button"
                className="dpill"
                title="Priorità"
                aria-label="Priorità"
                onClick={() => setPriorityOpen((v) => !v)}
                style={{ display: "grid", placeItems: "center", width: 27, height: 27, padding: 0, borderRadius: "var(--radius-md)", cursor: "pointer", background: "transparent", border: `1px solid ${priorityOpen ? "var(--color-accent)" : "transparent"}`, color: priorityColor }}
              >
                {FlagIcon}
              </button>
              {priorityOpen && (
                <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 8, minWidth: 224, padding: 6, borderRadius: "var(--radius-md)", background: "var(--color-surface)", boxShadow: "var(--shadow-md)" }}>
                  {PRIORITY_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className="menu-item"
                      onClick={() => setPriority(o.value)}
                      style={{ display: "flex", alignItems: "flex-start", gap: 9, width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)", padding: "7px 9px", borderRadius: "var(--radius-sm)", color: item.priority === o.value ? "var(--color-accent-300)" : "var(--color-text)" }}
                    >
                      <span style={{ marginTop: 3, color: o.value === "none" ? "color-mix(in srgb, var(--color-text) 55%, transparent)" : PRIORITY_COLORS[o.value] }}>{FlagIcon}</span>
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5 }}>{o.label}</div>
                        <div style={{ fontSize: 11, marginTop: 1, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{o.desc}</div>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </span>

            <span ref={projectRef} style={{ position: "relative", display: "inline-flex" }}>
              <button
                type="button"
                className="dpill"
                onClick={() => setProjectOpen((v) => !v)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 27, padding: "0 10px", borderRadius: "var(--radius-md)", cursor: "pointer", background: "transparent", fontFamily: "var(--font-body)", fontSize: 12, border: `1px solid ${projectOpen ? "var(--color-accent)" : "transparent"}`, color: item.project ? "color-mix(in srgb, var(--color-text) 82%, transparent)" : "color-mix(in srgb, var(--color-text) 60%, transparent)" }}
              >
                {item.project ? (
                  <>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: projectColor(item.project) }} />
                    <span>{item.project}</span>
                    {item.list && (
                      <>
                        <span style={{ opacity: 0.5 }}>/</span>
                        <span>{item.list}</span>
                      </>
                    )}
                  </>
                ) : (
                  "Nessuno"
                )}
              </button>
              {projectOpen && (
                <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 8, minWidth: 190, padding: 6, borderRadius: "var(--radius-md)", background: "var(--color-surface)", boxShadow: "var(--shadow-md)" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", padding: "4px 8px 6px" }}>Progetto</div>
                  {dbProjects.map((p) => (
                    <DetailMenuItem key={p.id} label={p.name} dot={p.color} active={item.project === p.name} onClick={() => setProject(p.name)} />
                  ))}
                  <DetailMenuItem label="Nessuno" active={!item.project} onClick={() => setProject(null)} />
                  {item.project && (
                    <>
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", padding: "8px 8px 6px", borderTop: "1px solid var(--color-divider)", marginTop: 4 }}>Lista</div>
                      {listsForProject(item.project).map((l) => (
                        <DetailMenuItem key={l} label={l} active={item.list === l} onClick={() => setList(l)} />
                      ))}
                    </>
                  )}
                </div>
              )}
            </span>

            {item.sourceType !== "manual" && (
              <button
                type="button"
                className="dpill"
                onClick={() => {}}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 27, padding: "0 10px", borderRadius: "var(--radius-md)", cursor: "pointer", background: "transparent", border: "1px solid transparent", fontFamily: "var(--font-body)", fontSize: 12, color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}
              >
                {MailIcon}
                <span>da {item.sourceType.charAt(0).toUpperCase() + item.sourceType.slice(1)} · email</span>
              </button>
            )}

            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
              <span ref={kebabRef} style={{ position: "relative", display: "inline-flex" }}>
                <button
                  type="button"
                  className="ghost-ico"
                  aria-label="Altre azioni"
                  onClick={() => { setKebabOpen((v) => !v); setConfirmDelete(false); }}
                  style={{ display: "grid", placeItems: "center", width: 27, height: 27, padding: 0, border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}
                >
                  {KebabIcon}
                </button>
                {kebabOpen && (
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 8, minWidth: 190, padding: 6, borderRadius: "var(--radius-md)", background: "var(--color-surface)", boxShadow: "var(--shadow-md)" }}>
                    <DetailMenuItem icon={ArchiveIcon} label="Archivia" onClick={archive} />
                    <DetailMenuItem icon={OutputIcon} label="Sposta in Output" onClick={() => setKebabOpen(false)} />
                    <DetailMenuItem icon={TrashIcon} label={confirmDelete ? "Conferma eliminazione" : "Elimina"} danger onClick={remove} />
                  </div>
                )}
              </span>
              <button
                type="button"
                className="ghost-ico"
                aria-label="Chiudi"
                onClick={onClose}
                style={{ marginRight: -6, display: "grid", placeItems: "center", width: 27, height: 27, padding: 0, border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}
              >
                {CloseIcon}
              </button>
            </span>
          </div>

          {/* ---- body ---- */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 16px 16px" }}>
            {editingTitle ? (
              <input
                ref={titleRef}
                className="input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveTitle(); }
                  else if (e.key === "Escape") { e.stopPropagation(); setTitleDraft(item.title); setEditingTitle(false); }
                }}
                style={{ width: "100%", border: "1px solid var(--color-accent)", background: "transparent", padding: "4px 8px", marginBottom: 12, fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 22, letterSpacing: "-0.015em" }}
              />
            ) : (
              <h4
                onClick={() => { setTitleDraft(item.title); setEditingTitle(true); }}
                style={{ margin: "4px 0 12px", padding: "4px 8px", marginLeft: -8, borderRadius: "var(--radius-sm)", cursor: "text", fontSize: 22, letterSpacing: "-0.015em", textDecoration: done ? "line-through" : "none" }}
              >
                {item.title}
              </h4>
            )}

            <div style={{ marginBottom: 16 }}>
              {editingDesc ? (
                <div>
                  <textarea
                    ref={descRef}
                    className="dtextarea"
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    autoFocus
                    style={{ width: "100%", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", background: "transparent", padding: "8px 10px", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.45, color: "var(--color-text)", resize: "none", maxHeight: 112, overflowY: "auto", minHeight: 40 }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn btn-primary" onClick={saveDesc}>Salva</button>
                    <button type="button" className="btn btn-secondary" onClick={cancelDesc}>Annulla</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.5, color: item.description ? "color-mix(in srgb, var(--color-text) 78%, transparent)" : "color-mix(in srgb, var(--color-text) 50%, transparent)", whiteSpace: "pre-wrap" }}>
                    {item.description || "Nessuna descrizione"}
                  </div>
                  <button
                    type="button"
                    className="ghost-ico"
                    aria-label="Modifica descrizione"
                    onClick={() => { setDescDraft(item.description ?? ""); setEditingDesc(true); }}
                    style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 22, height: 22, padding: 0, border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}
                  >
                    {PencilIcon}
                  </button>
                </div>
              )}
            </div>

            {/* ---- properties panel ---- */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 14, borderRadius: "var(--radius-lg)", background: "color-mix(in srgb, var(--color-text) 4%, transparent)", marginBottom: 16 }}>
              <div>
                <PropLabel>{item.startAt ? "Durata" : "Scadenza"}</PropLabel>
                {!item.startAt ? (
                  <span ref={dueRef} style={{ position: "relative", display: "inline-flex" }}>
                    <button type="button" className="dpill" onClick={() => setDueOpen((v) => !v)} style={dueBoxStyle(dueOpen, !!item.dueAt)}>
                      {CalendarIcon}
                      {formatRelativeDateTime(item.dueAt) ?? "Nessuna scadenza"}
                    </button>
                    {dueOpen && (
                      <DueMenu
                        value={item.dueAt}
                        onPreset={(iso) => { setDueField("due", iso); setDueOpen(false); }}
                        onPrecise={(iso) => setDueField("due", iso)}
                        hasStart={false}
                        onAddStart={addStartDate}
                      />
                    )}
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <span ref={startRef} style={{ position: "relative", display: "flex", flex: 1, flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 10.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Inizio</span>
                      <button type="button" className="dpill" onClick={() => setStartOpen((v) => !v)} style={dueBoxStyle(startOpen, true)}>
                        {CalendarIcon}
                        {formatRelativeDateTime(item.startAt)}
                      </button>
                      {startOpen && (
                        <DueMenu
                          value={item.startAt}
                          onPreset={(iso) => { setDueField("start", iso); setStartOpen(false); }}
                          onPrecise={(iso) => setDueField("start", iso)}
                          hasStart
                          onRemoveStart={removeStartDate}
                        />
                      )}
                    </span>
                    <span ref={dueRef} style={{ position: "relative", display: "flex", flex: 1, flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 10.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Fine</span>
                      <button type="button" className="dpill" onClick={() => setDueOpen((v) => !v)} style={dueBoxStyle(dueOpen, true)}>
                        {CalendarIcon}
                        {formatRelativeDateTime(item.dueAt) ?? "Nessuna"}
                      </button>
                      {dueOpen && (
                        <DueMenu
                          value={item.dueAt}
                          onPreset={(iso) => { setDueField("due", iso); setDueOpen(false); }}
                          onPrecise={(iso) => setDueField("due", iso)}
                          hasStart
                          onRemoveStart={removeStartDate}
                        />
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <PropLabel noMargin>Note</PropLabel>
                  {!editingNotes && (
                    <button
                      type="button"
                      className="ghost-ico"
                      aria-label="Modifica note"
                      onClick={() => { setNotesDraft(item.notes ?? ""); setEditingNotes(true); }}
                      style={{ display: "grid", placeItems: "center", width: 18, height: 18, padding: 0, border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}
                    >
                      {PencilIcon}
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <textarea
                    className="dtextarea"
                    autoFocus
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    onBlur={saveNotes}
                    placeholder="Aggiungi una nota interna…"
                    style={{ width: "100%", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", background: "transparent", padding: "7px 9px", fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.45, color: "var(--color-text)", resize: "none", minHeight: 40, maxHeight: 112, overflowY: "auto" }}
                  />
                ) : (
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: item.notes ? "color-mix(in srgb, var(--color-text) 74%, transparent)" : "color-mix(in srgb, var(--color-text) 48%, transparent)", whiteSpace: "pre-wrap" }}>
                    {item.notes || "Aggiungi una nota interna…"}
                  </div>
                )}
              </div>

              <div>
                <PropLabel>Tag</PropLabel>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  {(item.tags ?? []).map((t) => (
                    <span key={t} className="tag tag-neutral" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      #{t}
                      <button type="button" onClick={() => removeTag(t)} aria-label={`Rimuovi tag ${t}`} style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1, opacity: 0.7 }}>✕</button>
                    </span>
                  ))}
                  <input
                    className="dnote"
                    placeholder="+ aggiungi tag"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    style={{ flex: "1 1 100px", minWidth: 90, border: "none", background: "transparent", outline: "none", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-text)" }}
                  />
                </div>
              </div>
            </div>

            {/* ---- tabs ---- */}
            <div style={{ display: "flex", gap: 18, borderBottom: "1px solid var(--color-divider)", marginBottom: 14 }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="dtab"
                  onClick={() => setTab(t)}
                  style={{ border: "none", borderBottom: `2px solid ${tab === t ? "var(--color-accent)" : "transparent"}`, background: "transparent", cursor: "pointer", padding: "0 0 9px", marginBottom: -1, fontFamily: "var(--font-body)", fontSize: 12.5, color: tab === t ? "var(--color-accent-300)" : "color-mix(in srgb, var(--color-text) 60%, transparent)" }}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "Sottotask" && (
              <div>
                {subtasks.length > 0 && (
                  <div style={{ fontSize: 11, marginBottom: 6, color: "var(--color-accent-300)" }}>{subDone} di {subtasks.length}</div>
                )}
                {subtasks.map((st) => (
                  <div key={st.id} className="row" style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 0" }}>
                    <button
                      type="button"
                      className="tcheck"
                      onClick={() => toggleSubtask(st.id)}
                      aria-label={st.done ? "Segna da fare" : "Segna come completato"}
                      style={{ width: 12, height: 12, padding: 0, borderRadius: 999, border: `2.2px solid ${st.done ? "var(--color-neutral-700)" : "var(--color-accent-700)"}`, background: st.done ? "var(--color-neutral-700)" : "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}
                    >
                      {st.done && CheckIcon}
                    </button>
                    <span style={{ fontSize: 13, textDecoration: st.done ? "line-through" : "none", color: st.done ? "color-mix(in srgb, var(--color-text) 50%, transparent)" : "var(--color-text)" }}>{st.title}</span>
                    <button
                      type="button"
                      className="ghost-ico"
                      onClick={() => removeSubtask(st.id)}
                      aria-label="Rimuovi sottotask"
                      style={{ marginLeft: "auto", display: "grid", placeItems: "center", width: 20, height: 20, padding: 0, border: "none", borderRadius: "var(--radius-sm)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}
                    >
                      {CloseIcon}
                    </button>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "6px 0" }}>
                  <span style={{ width: 12, height: 12, flex: "0 0 auto", borderRadius: 999, border: "2.2px dashed color-mix(in srgb, var(--color-text) 35%, transparent)" }} />
                  <input
                    className="dnote"
                    placeholder="Aggiungi un sottotask"
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                    style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontFamily: "var(--font-body)", fontSize: 13, color: "var(--color-text)" }}
                  />
                </div>
              </div>
            )}

            {tab === "Attività" && (
              <div>
                {activity.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <span style={{ flex: "0 0 auto", width: 22, height: 22, borderRadius: 999, background: a.who === "AI" ? "var(--color-neutral-800)" : "var(--color-accent-800)", color: a.who === "AI" ? "var(--color-neutral-200)" : "var(--color-accent-100)", display: "grid", placeItems: "center", fontSize: 9 }}>{a.who}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "color-mix(in srgb, var(--color-text) 80%, transparent)" }}>{a.text}</div>
                      <div style={{ fontSize: 10.5, marginTop: 2, color: "color-mix(in srgb, var(--color-text) 56%, transparent)" }}>{a.when}</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <span style={{ flex: "0 0 auto", width: 22, height: 22, borderRadius: 999, background: "var(--color-accent-800)", color: "var(--color-accent-100)", display: "grid", placeItems: "center", fontSize: 9 }}>Tu</span>
                  <input
                    className="dnote"
                    placeholder="Scrivi una nota…"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendComment(); } }}
                    style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--color-text)" }}
                  />
                  <button
                    type="button"
                    className="ghost-send"
                    onClick={sendComment}
                    aria-label="Invia nota"
                    style={{ display: "grid", placeItems: "center", width: 27, height: 27, padding: 0, border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", color: "var(--color-accent)" }}
                  >
                    {SendIcon}
                  </button>
                </div>
              </div>
            )}

            {tab === "Allegati" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
                {attachments.map((a) => (
                  <div key={a.id} className="attach-tile" style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4, padding: 8, borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", background: "var(--color-surface)" }}>
                    <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", background: "color-mix(in srgb, var(--color-text) 8%, transparent)", display: "grid", placeItems: "center", color: "color-mix(in srgb, var(--color-text) 40%, transparent)" }}>
                      {PaperclipIcon}
                    </div>
                    <span style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                    <span style={{ fontSize: 10, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{formatSize(a.size)}</span>
                    <button
                      type="button"
                      className="ghost-ico attach-remove"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={`Rimuovi ${a.name}`}
                      style={{ position: "absolute", top: 4, right: 4, display: "grid", placeItems: "center", width: 20, height: 20, padding: 0, border: "none", borderRadius: "var(--radius-sm)", background: "color-mix(in srgb, var(--color-bg) 70%, transparent)", cursor: "pointer", color: "var(--color-text)" }}
                    >
                      {CloseIcon}
                    </button>
                  </div>
                ))}
                <input ref={fileInputRef} type="file" multiple onChange={pickAttachments} style={{ display: "none" }} />
                <button
                  type="button"
                  className="attach-add"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, aspectRatio: "1 / 1", borderRadius: "var(--radius-md)", border: "1px dashed var(--color-divider)", background: "transparent", cursor: "pointer", color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}
                >
                  {PlusIcon}
                  <span style={{ fontSize: 11 }}>Aggiungi</span>
                </button>
              </div>
            )}
          </div>

          {/* ---- footer ---- */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px 12px 12px", borderTop: "1px solid var(--color-divider)" }}>
            <span ref={reminderRef} style={{ position: "relative", display: "inline-flex" }}>
              <button
                type="button"
                className="bell-btn"
                aria-label="Promemoria"
                title="Promemoria"
                onClick={() => setReminderOpen((v) => !v)}
                style={{ marginLeft: -6, display: "grid", placeItems: "center", width: 27, height: 27, padding: 0, border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", color: item.reminderAt ? "#ffb454" : "color-mix(in srgb, var(--color-text) 55%, transparent)" }}
              >
                {BellIcon}
              </button>
              {reminderOpen && (
                <div style={{ position: "absolute", left: 0, bottom: "calc(100% + 4px)", zIndex: 8, minWidth: 190, padding: 6, borderRadius: "var(--radius-md)", background: "var(--color-surface)", boxShadow: "var(--shadow-md)" }}>
                  {REMINDER_PRESETS.map((p) => (
                    <DetailMenuItem
                      key={p.label}
                      label={p.label}
                      onClick={() => {
                        if (p.offsetMs == null) { setReminder(null); return; }
                        const base = item.dueAt ? new Date(item.dueAt).getTime() : Date.now();
                        setReminder(new Date(base + p.offsetMs).toISOString());
                      }}
                    />
                  ))}
                  <div style={{ borderTop: "1px solid var(--color-divider)", marginTop: 4, padding: "6px 8px 2px" }}>
                    <input
                      type="datetime-local"
                      className="input"
                      onChange={(e) => e.target.value && setReminder(new Date(e.target.value).toISOString())}
                      style={{ fontSize: 12.5, height: 30, minHeight: 30, padding: "2px 8px" }}
                    />
                  </div>
                </div>
              )}
            </span>

            <span style={{ marginLeft: "auto", fontSize: 11, color: "color-mix(in srgb, var(--color-text) 56%, transparent)" }}>Esc per chiudere</span>

            <span ref={statusRef} style={{ position: "relative", display: "inline-flex" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStatusOpen((v) => !v)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {statusLabel}
                {ChevronDownIcon}
              </button>
              {statusOpen && (
                <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 4px)", zIndex: 8, minWidth: 150, padding: 6, borderRadius: "var(--radius-md)", background: "var(--color-surface)", boxShadow: "var(--shadow-md)" }}>
                  {STATUS_OPTIONS.map((o) => (
                    <DetailMenuItem key={o.key} label={o.label} active={item.status === o.key} onClick={() => setStatus(o)} />
                  ))}
                </div>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function dueBoxStyle(open, on) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    width: "100%",
    height: 32,
    padding: "0 10px",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    background: "var(--color-surface)",
    border: `1px solid ${open ? "var(--color-accent)" : "var(--color-divider)"}`,
    fontFamily: "var(--font-body)",
    fontSize: 12.5,
    color: on ? "var(--color-text)" : "color-mix(in srgb, var(--color-text) 55%, transparent)",
  };
}

function DueMenu({ value, onPreset, onPrecise, hasStart, onAddStart, onRemoveStart }) {
  return (
    <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 9, minWidth: 210, padding: 6, borderRadius: "var(--radius-md)", background: "var(--color-surface)", boxShadow: "var(--shadow-md)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "2px 3px 6px" }}>
        {DUE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="pill"
            onClick={() => onPreset(p.toIso())}
            style={{ height: 24, padding: "0 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-divider)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 11.5, color: "color-mix(in srgb, var(--color-text) 74%, transparent)" }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ padding: "2px 3px 6px" }}>
        <input
          type="datetime-local"
          className="input"
          defaultValue={toDatetimeLocalValue(value)}
          onChange={(e) => e.target.value && onPrecise(new Date(e.target.value).toISOString())}
          style={{ fontSize: 12.5, height: 30, minHeight: 30, padding: "2px 8px" }}
        />
      </div>
      <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 4 }}>
        {!hasStart ? (
          <DetailMenuItem label="+ Aggiungi data di inizio" accent onClick={onAddStart} />
        ) : (
          <DetailMenuItem label="Rimuovi data di inizio" accent onClick={onRemoveStart} />
        )}
      </div>
    </div>
  );
}

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function PropLabel({ children, noMargin }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", marginBottom: noMargin ? 0 : 6 }}>
      {children}
    </div>
  );
}

function DetailMenuItem({ label, icon, dot, active, danger, accent, onClick }) {
  return (
    <button
      type="button"
      className="menu-item"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        justifyContent: "space-between",
        width: "100%",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-body)",
        fontSize: 12.5,
        padding: "6px 8px",
        borderRadius: "var(--radius-sm)",
        color: danger ? "#ff6b6b" : accent ? "var(--color-accent-300)" : active ? "var(--color-accent-300)" : "var(--color-text)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />}
        {label}
      </span>
      {active && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      )}
    </button>
  );
}
