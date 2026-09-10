import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAlia } from "../lib/AliaProvider.jsx";
import { PRIORITIES, dueLabel, priorityOf } from "../lib/tasks.js";
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from "../inbox/Dropdown.jsx";
/* Le icone vengono da icons.jsx, non da Lucide: il progetto le trascrive dagli
   artboard perche` i tracciati di Lucide non coincidono (vedi la nota in testa
   a icons.jsx). Close, Send e MoreDots sono state aggiunte da questo artboard. */
import { Alarm, Check, ChevronDown, Close, MailBox, MoreDots, Pencil, PriorityFlag, Send, Trash } from "./icons.jsx";

/* Il dettaglio del task — trascritto da `DEF_Task Detail` (vedi DESIGN_LOCK).

   Struttura dell'artboard, nell'ordine: una testata di chip (priorità,
   progetto / milestone, origine, menu azioni, chiudi); un corpo che scorre con
   titolo e descrizione modificabili in luogo; un pannello grigio con le date,
   la nota interna e i tag; tre schede (Allegati, Sottotask, Attività); un piede
   con il promemoria a sinistra e lo stato a destra.

   Corrispondenze fra i nomi dell'artboard e quelli del core, perché non sono
   uno a uno e a leggere il codice sembrerebbero incoerenti:

     artboard `notes`  (descrizione grande)  ->  t_task.description
     artboard `note`   (nota interna)        ->  t_task.notes
     artboard `list`   (chip dopo il "/")    ->  t_milestone
     artboard `status`                       ->  t_state, configurabile

   L'artboard fissa quattro priorità (Alta/Media/Bassa/Nessuna) e tre stati
   (Da fare/In corso/Fatto) come esempi. Non sono verità: il core ha cinque
   priorità e stati configurabili, quindi qui si leggono da lì. Il chip di stato
   si colora per **ruolo** — partenza neutra, intermedio con l'accento, chiusura
   spenta a contorno — come in TaskRow, per la stessa ragione: le etichette
   possono essere qualsiasi cosa, il ruolo no. */

const PILL =
  "inline-flex items-center gap-1.5 h-[26px] px-2 rounded-md border-0 bg-transparent cursor-pointer " +
  "hover:bg-[color-mix(in_srgb,var(--color-content)_12%,transparent)]";
const GHOST_ICO =
  "grid place-items-center w-[27px] h-[27px] p-0 rounded-md border-0 bg-transparent cursor-pointer " +
  "text-content/60 hover:bg-[color-mix(in_srgb,var(--color-content)_9%,transparent)]";
const PANEL_LABEL = "text-[10px] tracking-[0.1em] uppercase text-content/55";
const DATE_BOX =
  "flex-1 text-left rounded-md px-2.5 py-2 bg-bg cursor-pointer border " +
  "hover:bg-[color-mix(in_srgb,var(--color-content)_5%,transparent)]";
const PRESET =
  "border border-divider bg-transparent text-content text-[11px] px-2 py-1 rounded-sm cursor-pointer " +
  "hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]";
const INPUT_BASE =
  "bg-transparent border border-divider rounded-sm px-1.5 py-1 text-content outline-none " +
  "focus:border-card-line-hover";
const TAB = "text-meta cursor-pointer pb-2 border-b-2 border-x-0 border-t-0 bg-transparent";

const CHIP_RUOLO = {
  start: "bg-card-line text-content",
  mid: "bg-accent text-bg",
  end: "border border-card-line text-content/45",
};

/* Le sorgenti esterne previste. `manual` non compare: un task scritto a mano
   non ha un'origine da mostrare, e la pillola resta fuori. */
const ORIGINI = {
  mail: { label: "da Mail", Icon: MailBox },
  gmail: { label: "da Gmail", Icon: MailBox },
  /* Discord non ha un glifo negli artboard: resta la sola etichetta, invece di
     inventare un'icona che il diff con l'artboard non potrebbe verificare. */
  discord: { label: "da Discord", Icon: null },
};

/* I preset del promemoria dell'artboard sono relativi alla scadenza, quindi
   senza `dueAt` non hanno un istante a cui riferirsi: in quel caso restano
   spenti e resta la data personalizzata. */
const PRESET_PROMEMORIA = [
  { id: "due", label: "Alla scadenza", offsetMin: 0 },
  { id: "1h", label: "1 ora prima", offsetMin: -60 },
  { id: "1d", label: "Il giorno prima", offsetMin: -1440 },
  { id: "none", label: "Nessuno", offsetMin: null },
];

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const due = (n) => String(n).padStart(2, "0");

function partiIso(iso) {
  if (!iso) return { data: "", ora: "09:00" };
  const d = new Date(iso);
  return {
    data: `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`,
    ora: `${due(d.getHours())}:${due(d.getMinutes())}`,
  };
}

function componiIso(data, ora) {
  if (!data) return null;
  return new Date(`${data}T${ora || "09:00"}`).toISOString();
}

function etichettaBreve(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${MESI[d.getMonth()]}, ${due(d.getHours())}:${due(d.getMinutes())}`;
}

function quando(iso) {
  if (!iso) return "";
  const minuti = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minuti < 1) return "adesso";
  if (minuti < 60) return `${minuti} min fa`;
  if (minuti < 1440) return `${Math.floor(minuti / 60)} h fa`;
  const giorni = Math.floor(minuti / 1440);
  if (giorni === 1) return "ieri";
  if (giorni < 30) return `${giorni} giorni fa`;
  return etichettaBreve(iso);
}

const NOMI_CAMPO = {
  idState: "stato",
  title: "titolo",
  description: "descrizione",
  notes: "nota",
  priority: "priorità",
  dueAt: "scadenza",
  startAt: "inizio",
  reminderAt: "promemoria",
  idProject: "progetto",
  idMilestone: "milestone",
  position: "posizione",
  deletedAt: "cancellazione",
};

/* Lo storico è una riga per campo cambiato: `field`, `oldValue`, `newValue`.
   Tradurlo in una frase leggibile è compito della vista, non del core — il core
   registra il fatto, non come si racconta. */
function fraseStorico(riga, statiPerId) {
  const nome = NOMI_CAMPO[riga.field] ?? riga.field;

  if (riga.field === "idState") {
    const da = statiPerId.get(Number(riga.oldValue))?.label ?? riga.oldValue ?? "—";
    const a = statiPerId.get(Number(riga.newValue))?.label ?? riga.newValue ?? "—";
    return `Stato: da ${da} a ${a}`;
  }
  if (riga.field === "priority") {
    return `Priorità: da ${priorityOf(riga.oldValue).label} a ${priorityOf(riga.newValue).label}`;
  }
  if (!riga.oldValue && riga.newValue) return `Impostato ${nome}`;
  if (riga.oldValue && !riga.newValue) return `Rimosso ${nome}`;
  return `Cambiato ${nome}`;
}

export function TaskDetailModal({ task, onClose }) {
  const alia = useAlia();
  const { states = [], projects = [], milestones = [], tasks = [] } = alia;

  const [menu, setMenu] = useState(null);
  const [scheda, setScheda] = useState("sub");
  const [modificaTitolo, setModificaTitolo] = useState(false);
  const [modificaDescrizione, setModificaDescrizione] = useState(false);
  const [modificaNota, setModificaNota] = useState(false);
  const [bozzaDescrizione, setBozzaDescrizione] = useState("");
  const [nuovoSub, setNuovoSub] = useState("");
  const [nuovoTag, setNuovoTag] = useState("");
  const [nuovoCommento, setNuovoCommento] = useState("");

  const [tag, setTag] = useState([]);
  const [commenti, setCommenti] = useState([]);
  const [storico, setStorico] = useState([]);

  const rifTitolo = useRef(null);

  const chiudiMenu = useCallback(() => setMenu(null), []);
  const apriMenu = (id) => setMenu((m) => (m === id ? null : id));

  const idTask = task?.id;

  /* Tag, commenti e storico si leggono a finestra aperta e per un task solo:
     tenerli nel carico iniziale vorrebbe dire leggere tre tabelle per ogni
     task dell'elenco per poi mostrarne uno. */
  const ricaricaAccessori = useCallback(async () => {
    if (!idTask) return;
    const [t, c, s] = await Promise.all([
      alia.leggiTag(idTask),
      alia.leggiCommenti(idTask),
      alia.leggiStorico(idTask),
    ]);
    setTag(t ?? []);
    setCommenti(c ?? []);
    setStorico(s ?? []);
  }, [alia, idTask]);

  useEffect(() => {
    ricaricaAccessori().catch(() => {
      /* Un errore qui non deve chiudere il dettaglio: le sezioni restano vuote
         e il resto della scheda resta usabile. */
    });
  }, [ricaricaAccessori]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu, onClose]);

  useEffect(() => {
    if (modificaTitolo) rifTitolo.current?.select();
  }, [modificaTitolo]);

  const statiPerId = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);
  const figli = useMemo(
    () => tasks.filter((t) => t.parentId === idTask).sort((a, b) => a.position - b.position),
    [tasks, idTask],
  );
  const idProgetto = task?.project?.id;
  const milestoneDelProgetto = useMemo(
    () => milestones.filter((m) => m.projectId === idProgetto || m.idProject === idProgetto),
    [milestones, idProgetto],
  );

  /* Attività = storico della macchina a stati + note scritte a mano, uniti solo
     a schermo e ordinati nel tempo, dal più recente. A schema restano due
     tabelle, perché "il campo dueAt è passato da X a Y" e "ho scritto una nota"
     non sono la stessa cosa (vedi il commento in task-core.js). */
  const attivita = useMemo(() => {
    const daStorico = storico.map((r) => ({
      id: `h-${r.idTaskHistory}`,
      tipo: "sistema",
      testo: fraseStorico(r, statiPerId),
      quando: r.changedAt,
    }));
    const daCommenti = commenti.map((c) => ({
      id: `c-${c.idTaskComment}`,
      tipo: "nota",
      testo: c.body,
      quando: c.createdAt,
      idCommento: c.idTaskComment,
    }));
    return [...daStorico, ...daCommenti].sort((a, b) => (a.quando < b.quando ? 1 : -1));
  }, [storico, commenti, statiPerId]);

  if (!task) return null;

  const prio = priorityOf(task.priority);
  const origine = ORIGINI[task.sourceType];
  const statiChiusura = states.filter((s) => s.role === "end");
  const statoArchivio = states.find((s) => s.label === "Archiviato") ?? null;
  const statoIniziale = states.find((s) => s.role === "start");
  const inizioParti = partiIso(task.startAt);
  const scadenzaParti = partiIso(task.dueAt);
  const haInizio = Boolean(task.startAt);
  const fatti = figli.filter((f) => f.done).length;

  const aggiorna = (patch) => alia.aggiornaTask(task.id, patch);

  const salvaTitolo = (valore) => {
    setModificaTitolo(false);
    const pulito = (valore ?? "").trim();
    if (pulito && pulito !== task.title) aggiorna({ title: pulito });
  };

  const salvaDescrizione = () => {
    setModificaDescrizione(false);
    if (bozzaDescrizione !== (task.description ?? "")) {
      aggiorna({ description: bozzaDescrizione || null });
    }
  };

  const impostaScadenza = (giorni) => {
    const d = new Date();
    d.setDate(d.getDate() + giorni);
    d.setHours(9, 0, 0, 0);
    aggiorna({ dueAt: d.toISOString() });
    chiudiMenu();
  };

  const impostaPromemoria = (preset) => {
    chiudiMenu();
    if (preset.offsetMin === null) return aggiorna({ reminderAt: null });
    if (!task.dueAt) return undefined;
    const base = new Date(task.dueAt);
    base.setMinutes(base.getMinutes() + preset.offsetMin);
    return aggiorna({ reminderAt: base.toISOString() });
  };

  const aggiungiSub = async (e) => {
    if (e.key !== "Enter") return;
    const titolo = nuovoSub.trim();
    if (!titolo) return;
    setNuovoSub("");
    await alia.creaTask({ title: titolo, idParentTask: task.id });
  };

  /* "Completato" per un sotto-task non è un booleano: è lo stato di chiusura in
     ordine di `stepOrder`, cioè l'ultimo. Riaprire riporta allo stato di
     partenza. Vedi Rinascita.md, § cascata di chiusura. */
  const commutaSub = (figlio) => {
    const bersaglio = figlio.done ? statoIniziale : statiChiusura[statiChiusura.length - 1];
    if (bersaglio) alia.cambiaStato(figlio.id, bersaglio.id);
  };

  const aggiungiTag = async (e) => {
    if (e.key !== "Enter") return;
    const etichetta = nuovoTag.trim();
    if (!etichetta) return;
    setNuovoTag("");
    await alia.aggiungiTag(task.id, etichetta);
    await ricaricaAccessori();
  };

  const togliTag = async (idTag) => {
    await alia.togliTag(task.id, idTag);
    await ricaricaAccessori();
  };

  const inviaCommento = async () => {
    const testo = nuovoCommento.trim();
    if (!testo) return;
    setNuovoCommento("");
    await alia.aggiungiCommento(task.id, testo);
    await ricaricaAccessori();
  };

  return (
    <div
      onClick={onClose}
      className={
        "absolute inset-0 z-[90] box-border flex items-center justify-center p-7 " +
        "bg-[color-mix(in_srgb,#000_52%,transparent)] backdrop-blur-[7px]"
      }
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          "w-[640px] max-w-full max-h-full flex flex-col rounded-[14px] " +
          "bg-surface shadow-elev-lg overflow-hidden"
        }
      >
        {/* ═══ testata: i chip che dicono cos'è questo task ═══ */}
        <div className="flex items-center gap-3 px-[11px] py-3 border-b border-divider">
          <div className="relative inline-flex">
            <button
              type="button"
              onClick={() => apriMenu("priority")}
              className={PILL}
              aria-label={`Priorità: ${prio.label}`}
            >
              <PriorityFlag size={14} color={prio.color} />
            </button>
            <Dropdown open={menu === "priority"} onClose={chiudiMenu} width={210}>
              {PRIORITIES.map((p) => (
                <DropdownItem
                  key={p.id}
                  selected={p.id === task.priority}
                  onClick={() => {
                    chiudiMenu();
                    aggiorna({ priority: p.id });
                  }}
                >
                  <span className="flex-1" style={{ color: p.color }}>
                    {p.label}
                  </span>
                </DropdownItem>
              ))}
            </Dropdown>
          </div>

          <div className="inline-flex items-center gap-1 min-w-0">
            <div className="relative inline-flex">
              <button type="button" onClick={() => apriMenu("project")} className={PILL}>
                {task.project ? (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: task.project.color }}
                  />
                ) : null}
                <span
                  className="text-xs leading-none truncate max-w-[150px]"
                  style={{
                    color: task.project
                      ? task.project.color
                      : "color-mix(in srgb, var(--color-content) 50%, transparent)",
                  }}
                >
                  {task.project?.name ?? "Nessuno"}
                </span>
              </button>
              <Dropdown open={menu === "project"} onClose={chiudiMenu} width={190}>
                <DropdownItem
                  selected={!task.project}
                  onClick={() => {
                    chiudiMenu();
                    alia.assegnaProgetto(task.id, null, null);
                  }}
                >
                  <span className="flex-1 text-content/55">Nessuno</span>
                </DropdownItem>
                {projects.length > 0 ? <DropdownSeparator /> : null}
                {projects.map((p) => (
                  <DropdownItem
                    key={p.id}
                    selected={p.id === task.project?.id}
                    onClick={() => {
                      chiudiMenu();
                      alia.assegnaProgetto(task.id, p.id, null);
                    }}
                  >
                    <span className="flex-1 truncate" style={{ color: p.color }}>
                      {p.name}
                    </span>
                  </DropdownItem>
                ))}
              </Dropdown>
            </div>

            {/* La milestone sta dentro un progetto: senza progetto il "/" e il
                secondo chip non hanno un insieme da cui scegliere. */}
            {task.project ? (
              <>
                <span className="text-xs leading-none text-content/40">/</span>
                <div className="relative inline-flex">
                  <button type="button" onClick={() => apriMenu("milestone")} className={PILL}>
                    <span className="text-xs leading-none text-content/60">
                      {task.milestone?.label ?? "Nessuna fase"}
                    </span>
                  </button>
                  <Dropdown open={menu === "milestone"} onClose={chiudiMenu} width={170}>
                    <DropdownItem
                      selected={!task.milestone}
                      onClick={() => {
                        chiudiMenu();
                        alia.assegnaProgetto(task.id, task.project.id, null);
                      }}
                    >
                      <span className="flex-1 text-content/55">Nessuna fase</span>
                    </DropdownItem>
                    {milestoneDelProgetto.length > 0 ? <DropdownSeparator /> : null}
                    {milestoneDelProgetto.map((m) => (
                      <DropdownItem
                        key={m.id}
                        selected={m.id === task.milestone?.id}
                        onClick={() => {
                          chiudiMenu();
                          alia.assegnaProgetto(task.id, task.project.id, m.id);
                        }}
                      >
                        <span className="flex-1">{m.label}</span>
                      </DropdownItem>
                    ))}
                  </Dropdown>
                </div>
              </>
            ) : null}
          </div>

          {origine ? (
            <span
              className={
                "inline-flex items-center gap-1.5 px-2 h-[26px] rounded-md " +
                "text-[11px] leading-none text-content/57 shrink-0"
              }
              title="Dato di origine — l'apertura del messaggio originale non è ancora disponibile"
            >
              {origine.Icon ? <origine.Icon size={12} /> : null}
              {origine.label}
            </span>
          ) : null}

          <span className="flex items-center gap-1 ml-auto shrink-0">
            <div className="relative inline-flex">
              <button
                type="button"
                onClick={() => apriMenu("header")}
                className={GHOST_ICO}
                aria-label="Altre azioni"
              >
                <MoreDots size={15} />
              </button>
              <Dropdown open={menu === "header"} onClose={chiudiMenu} align="right" width={190}>
                {/* "Archivia" e "Sposta in Output" sono due stati di chiusura
                    configurati, non campi a parte. Le voci ci sono sempre, anche
                    quando il database non ha lo stato corrispondente: prima
                    erano condizionali e su un database migrato dal vecchio
                    schema — che ha solo `Da fare` e `Fatto` — il menu restava
                    con la sola "Elimina", e sembrava che mancassero.

                    "Archivia" resta spento se non c'e uno stato `Archiviato` su
                    cui portare il task: la voce dice che l'azione esiste, il
                    disabilitato dice che a questo database manca il posto dove
                    andare. "Sposta in Output" e spento per decisione: la
                    migrazione verso le destinazioni esterne non e ancora
                    implementata (vedi SPECIFICA_PRODOTTO, punto 4: solo
                    collegamento, nessuna sincronizzazione). */}
                <DropdownItem
                  disabled={!statoArchivio}
                  onClick={() => {
                    chiudiMenu();
                    if (statoArchivio) alia.cambiaStato(task.id, statoArchivio.id);
                  }}
                >
                  <span className="flex-1">Archivia</span>
                  {!statoArchivio ? (
                    <span className="text-[10px] text-content/40">nessuno stato</span>
                  ) : null}
                </DropdownItem>
                <DropdownItem disabled onClick={() => {}}>
                  <span className="flex-1">Sposta in Output</span>
                  <span className="text-[10px] text-content/40">non attivo</span>
                </DropdownItem>
                <DropdownSeparator />
                {/* Entrata e uscita dal triage. E l'unico posto, oltre alla
                    conferma sulle card origine, da cui si governa `isInbox`:
                    serve anche il ritorno, altrimenti un task smistato per
                    sbaglio non potrebbe piu rientrare nella colonna. */}
                <DropdownItem
                  onClick={() => {
                    chiudiMenu();
                    alia.smista(task.id, !task.inbox);
                  }}
                >
                  <span className="flex-1">
                    {task.inbox ? "Togli dal triage" : "Rimetti da smistare"}
                  </span>
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem
                  onClick={() => {
                    chiudiMenu();
                    onClose();
                    alia.cancellaTask(task.id);
                  }}
                >
                  <span className="flex-1" style={{ color: "var(--color-danger)" }}>
                    Elimina
                  </span>
                </DropdownItem>
              </Dropdown>
            </div>
            <button type="button" onClick={onClose} className={GHOST_ICO} aria-label="Chiudi">
              <Close size={14} />
            </button>
          </span>
        </div>

        {/* ═══ corpo ═══ */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-[18px] py-4">
          {modificaTitolo ? (
            <input
              ref={rifTitolo}
              autoFocus
              defaultValue={task.title}
              onBlur={(e) => salvaTitolo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") salvaTitolo(e.target.value);
                if (e.key === "Escape") setModificaTitolo(false);
              }}
              className={
                "block w-full mb-3 px-[9px] py-px bg-transparent outline-none " +
                "border border-accent rounded-sm text-[21px] font-medium tracking-[-0.015em] text-content"
              }
            />
          ) : (
            <div
              onClick={() => setModificaTitolo(true)}
              className={
                "cursor-text w-full mb-3.5 text-[21px] font-medium tracking-[-0.015em] " +
                "[overflow-wrap:anywhere] " +
                (task.done ? "line-through text-content/55" : "text-content")
              }
            >
              {task.title}
            </div>
          )}

          {modificaDescrizione ? (
            <>
              <textarea
                autoFocus
                value={bozzaDescrizione}
                onChange={(e) => setBozzaDescrizione(e.target.value)}
                className={
                  "block w-full max-h-28 overflow-y-auto resize-none px-[9px] py-1.5 " +
                  "bg-transparent border border-accent rounded-sm outline-none " +
                  "text-card leading-[1.55] text-content/80"
                }
              />
              <div className="flex gap-2 mt-2 mb-[18px]">
                <button
                  type="button"
                  onMouseDown={salvaDescrizione}
                  className={
                    "h-[27px] px-3 text-xs rounded-md border border-card-line " +
                    "bg-elevated text-content cursor-pointer hover:border-card-line-hover"
                  }
                >
                  Salva
                </button>
                <button
                  type="button"
                  onMouseDown={() => setModificaDescrizione(false)}
                  className="h-[27px] px-3 text-xs rounded-md border-0 bg-transparent text-content/60 cursor-pointer"
                >
                  Annulla
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-1.5 mb-[18px]">
              <div
                className={
                  "flex-1 min-w-0 max-h-28 overflow-y-auto whitespace-pre-wrap " +
                  "text-card leading-[1.55] [overflow-wrap:anywhere] " +
                  (task.description ? "text-content/80" : "text-content/45")
                }
              >
                {task.description || "Aggiungi una descrizione…"}
              </div>
              <button
                type="button"
                aria-label="Modifica descrizione"
                onClick={() => {
                  setBozzaDescrizione(task.description ?? "");
                  setModificaDescrizione(true);
                }}
                className={
                  "shrink-0 grid place-items-center w-6 h-6 rounded-sm border-0 " +
                  "bg-transparent text-content/55 cursor-pointer hover:text-content"
                }
              >
                <Pencil size={13} />
              </button>
            </div>
          )}

          {/* ═══ pannello: date, nota interna, tag ═══ */}
          <div
            className={
              "mt-[22px] rounded-md p-3.5 flex flex-col gap-3.5 " +
              "bg-[color-mix(in_srgb,var(--color-content)_4%,transparent)]"
            }
          >
            <div className="relative">
              <div className={`${PANEL_LABEL} mb-1.5`}>{haInizio ? "Durata" : "Scadenza"}</div>
              {haInizio ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => apriMenu("due")}
                    className={DATE_BOX}
                    style={{ borderColor: menu === "due" ? "var(--color-accent)" : "var(--color-divider)" }}
                  >
                    <div className="text-[9.5px] tracking-[0.08em] uppercase text-content/55">Inizio</div>
                    <div className="text-sm mt-0.5 text-content/78">{etichettaBreve(task.startAt)}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => apriMenu("due")}
                    className={DATE_BOX}
                    style={{ borderColor: menu === "due" ? "var(--color-accent)" : "var(--color-divider)" }}
                  >
                    <div className="text-[9.5px] tracking-[0.08em] uppercase text-content/55">Fine</div>
                    <div className="text-sm mt-0.5 text-content/78">{etichettaBreve(task.dueAt)}</div>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => apriMenu("due")}
                  className={`${DATE_BOX} w-full`}
                  style={{ borderColor: menu === "due" ? "var(--color-accent)" : "var(--color-divider)" }}
                >
                  <div className="text-sm text-content/78">
                    {task.dueAt ? `${dueLabel(task.dueAt)}, ${scadenzaParti.ora}` : "Nessuna"}
                  </div>
                </button>
              )}

              <Dropdown open={menu === "due"} onClose={chiudiMenu} width={264}>
                <div className="flex flex-wrap gap-1 px-1.5 pt-1.5">
                  <button type="button" className={PRESET} onClick={() => impostaScadenza(0)}>
                    Oggi
                  </button>
                  <button type="button" className={PRESET} onClick={() => impostaScadenza(1)}>
                    Domani
                  </button>
                  <button type="button" className={PRESET} onClick={() => impostaScadenza(7)}>
                    Sett.
                  </button>
                  <button
                    type="button"
                    className={`${PRESET} text-content/60`}
                    onClick={() => {
                      aggiorna({ dueAt: null });
                      chiudiMenu();
                    }}
                  >
                    Nessuna
                  </button>
                </div>
                <div className="px-1.5 pb-2 pt-2 flex flex-col gap-2">
                  {haInizio ? (
                    <div>
                      <div className="text-[10px] text-content/55 mb-0.5">Inizio</div>
                      <div className="flex gap-1.5">
                        <input
                          type="date"
                          value={inizioParti.data}
                          onChange={(e) => aggiorna({ startAt: componiIso(e.target.value, inizioParti.ora) })}
                          className={`${INPUT_BASE} flex-1 text-xs`}
                        />
                        <input
                          type="time"
                          value={inizioParti.ora}
                          onChange={(e) => aggiorna({ startAt: componiIso(inizioParti.data, e.target.value) })}
                          className={`${INPUT_BASE} w-[82px] text-xs`}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <div className="text-[10px] text-content/55 mb-0.5">
                      {haInizio ? "Fine" : "Data precisa"}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="date"
                        value={scadenzaParti.data}
                        onChange={(e) => aggiorna({ dueAt: componiIso(e.target.value, scadenzaParti.ora) })}
                        className={`${INPUT_BASE} flex-1 text-xs`}
                      />
                      <input
                        type="time"
                        value={scadenzaParti.ora}
                        onChange={(e) => aggiorna({ dueAt: componiIso(scadenzaParti.data, e.target.value) })}
                        className={`${INPUT_BASE} w-[82px] text-xs`}
                      />
                    </div>
                  </div>
                  {haInizio ? (
                    <button
                      type="button"
                      onClick={() => aggiorna({ startAt: null })}
                      className={
                        "self-start border-0 bg-transparent text-content/60 text-[11px] " +
                        "cursor-pointer p-0 hover:text-content"
                      }
                    >
                      Rimuovi data di inizio
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const base = task.dueAt ? new Date(task.dueAt) : new Date();
                        base.setHours(9, 0, 0, 0);
                        aggiorna({ startAt: base.toISOString() });
                      }}
                      className="self-start border-0 bg-transparent text-accent text-[11px] cursor-pointer p-0"
                    >
                      + Aggiungi data di inizio
                    </button>
                  )}
                </div>
              </Dropdown>
            </div>

            <div>
              <div className={`${PANEL_LABEL} mb-1`}>Note</div>
              {modificaNota ? (
                <textarea
                  autoFocus
                  defaultValue={task.notes ?? ""}
                  onBlur={(e) => {
                    setModificaNota(false);
                    if (e.target.value !== (task.notes ?? "")) {
                      aggiorna({ notes: e.target.value || null });
                    }
                  }}
                  className={
                    "w-full min-h-[52px] resize-none border-0 bg-transparent outline-none " +
                    "text-card leading-[1.55] text-content/80"
                  }
                />
              ) : (
                <div
                  onClick={() => setModificaNota(true)}
                  className={
                    "cursor-text w-full min-h-[52px] whitespace-pre-wrap text-card leading-[1.55] " +
                    "[overflow-wrap:anywhere] " +
                    (task.notes ? "text-content/80" : "text-content/45")
                  }
                >
                  {task.notes || "Aggiungi una nota interna…"}
                </div>
              )}
            </div>

            <div className="flex items-start gap-[7px]">
              <span className="shrink-0 w-[62px] text-[11.5px] leading-none text-content/58 mt-[5px]">
                Tag
              </span>
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
                {tag.map((t) => (
                  <span
                    key={t.idTag}
                    className={
                      "inline-flex items-center gap-1.5 h-5 px-2 rounded-md " +
                      "bg-card-line text-[10.5px] text-content"
                    }
                  >
                    {t.label}
                    <button
                      type="button"
                      aria-label={`Rimuovi tag ${t.label}`}
                      onClick={() => togliTag(t.idTag)}
                      className={
                        "grid place-items-center border-0 bg-transparent cursor-pointer p-0 " +
                        "text-inherit opacity-65 hover:opacity-100"
                      }
                    >
                      <Close size={9} sw={2.6} />
                    </button>
                  </span>
                ))}
                <input
                  placeholder="Aggiungi tag…"
                  value={nuovoTag}
                  onChange={(e) => setNuovoTag(e.target.value)}
                  onKeyDown={aggiungiTag}
                  className={
                    "min-w-[90px] flex-[0_1_120px] h-6 border-0 bg-transparent outline-none " +
                    "text-[12.5px] text-content placeholder:text-content/45"
                  }
                />
              </div>
            </div>
          </div>

          {/* ═══ schede ═══ */}
          <div className="mt-[26px]">
            <div className="flex items-center gap-[18px] mb-3.5 border-b border-divider">
              {[
                { id: "attach", label: "Allegati" },
                { id: "sub", label: `Sottotask (${fatti}/${figli.length})` },
                { id: "activity", label: "Attività" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScheda(s.id)}
                  className={TAB}
                  style={{
                    borderBottomColor: scheda === s.id ? "var(--color-accent)" : "transparent",
                    color:
                      scheda === s.id
                        ? "var(--color-accent)"
                        : "color-mix(in srgb, var(--color-content) 55%, transparent)",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {scheda === "sub" ? (
              <div>
                {figli.map((f) => (
                  <div key={f.id} className="flex items-center gap-[11px] py-1.5">
                    <button
                      type="button"
                      onClick={() => commutaSub(f)}
                      aria-label={f.done ? "Segna da fare" : "Segna come completato"}
                      className="w-3 h-3 shrink-0 p-0 rounded-full grid place-items-center cursor-pointer"
                      style={{
                        border: `2.2px solid ${f.done ? "var(--color-card-line)" : "var(--color-accent)"}`,
                        background: f.done ? "var(--color-card-line)" : "transparent",
                      }}
                    >
                      {f.done ? <Check size={8} sw={4} className="text-bg" /> : null}
                    </button>
                    <span
                      className={
                        "text-[13px] flex-1 min-w-0 [overflow-wrap:anywhere] " +
                        (f.done ? "line-through text-content/50" : "text-content")
                      }
                    >
                      {f.title}
                    </span>
                    <button
                      type="button"
                      aria-label="Rimuovi sottotask"
                      onClick={() => alia.cancellaTask(f.id)}
                      className={
                        "shrink-0 grid place-items-center w-5 h-5 rounded-sm border-0 " +
                        "bg-transparent text-content/55 cursor-pointer hover:text-content"
                      }
                    >
                      <Close size={12} sw={2} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-[11px] py-1.5">
                  <span className="w-3 h-3 shrink-0 rounded-full border-[2.2px] border-dashed border-content/35" />
                  <input
                    placeholder="Aggiungi un sottotask"
                    value={nuovoSub}
                    onChange={(e) => setNuovoSub(e.target.value)}
                    onKeyDown={aggiungiSub}
                    className={
                      "flex-1 min-w-0 border-0 bg-transparent outline-none text-[13px] " +
                      "text-content placeholder:text-content/45"
                    }
                  />
                </div>
              </div>
            ) : null}

            {scheda === "activity" ? (
              <div>
                {attivita.length === 0 ? (
                  <p className="text-meta text-content/45 m-0">Ancora nessuna attività.</p>
                ) : null}
                {attivita.map((a) => (
                  <div key={a.id} className="flex gap-2.5 mb-2.5">
                    <span
                      className="shrink-0 w-[22px] h-[22px] rounded-full grid place-items-center text-[9px]"
                      style={{
                        background: a.tipo === "nota" ? "var(--color-accent)" : "var(--color-elevated)",
                        color: a.tipo === "nota" ? "var(--color-bg)" : "var(--color-content)",
                      }}
                    >
                      {a.tipo === "nota" ? "IO" : "•"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] leading-[1.5] text-content/80 [overflow-wrap:anywhere]">
                        {a.testo}
                      </div>
                      <div className="text-[10.5px] mt-0.5 text-content/56">{quando(a.quando)}</div>
                    </div>
                    {a.idCommento ? (
                      <button
                        type="button"
                        aria-label="Rimuovi nota"
                        onClick={async () => {
                          await alia.togliCommento(a.idCommento);
                          await ricaricaAccessori();
                        }}
                        className={
                          "shrink-0 grid place-items-center w-5 h-5 rounded-sm border-0 " +
                          "bg-transparent text-content/45 cursor-pointer hover:text-content"
                        }
                      >
                        <Trash size={11} />
                      </button>
                    ) : null}
                  </div>
                ))}
                <div className="flex items-center gap-2.5 mt-3">
                  <span
                    className={
                      "shrink-0 w-[22px] h-[22px] rounded-full grid place-items-center " +
                      "text-[9px] bg-accent text-bg"
                    }
                  >
                    IO
                  </span>
                  <input
                    placeholder="Scrivi una nota…"
                    value={nuovoCommento}
                    onChange={(e) => setNuovoCommento(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") inviaCommento();
                    }}
                    className={
                      "flex-1 min-w-0 border-0 bg-transparent outline-none text-[12.5px] " +
                      "text-content placeholder:text-content/45"
                    }
                  />
                  <button
                    type="button"
                    onClick={inviaCommento}
                    aria-label="Invia nota"
                    className={`${GHOST_ICO} text-accent`}
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            ) : null}

            {/* Gli allegati sono l'unica sezione dell'artboard senza un dato
                dietro: `t_attachment` esiste a schema (fileName, filePath,
                mimeType, sizeBytes) ma il core non la espone, e prima di
                esporla va deciso dove vivono i file — copiati in userData o
                referenziati dove stanno. Finché non è deciso la scheda lo
                dichiara, invece di offrire un "Aggiungi" che non aggiunge. */}
            {scheda === "attach" ? (
              <p className="text-meta text-content/45 m-0">
                Gli allegati non sono ancora attivi: la tabella esiste, ma prima va deciso dove vengono
                conservati i file.
              </p>
            ) : null}
          </div>
        </div>

        {/* ═══ piede ═══

            Disposizione rivista rispetto all'artboard, che teneva il
            promemoria a sinistra e lo stato all'estremita destra: ora
            promemoria e stato stanno insieme a sinistra — sono le due cose che
            dicono "quando" e "dove" sta il task, e da vicino si leggono come un
            gruppo — e la destra e libera per le azioni di chiusura della
            scheda. Registrato in DESIGN_LOCK come scostamento voluto. */}
        <div className="flex items-center justify-between gap-3 px-[11px] py-2.5 border-t border-divider">
          <div className="flex items-center gap-2">
            <div className="relative inline-flex">
              <button
                type="button"
                onClick={() => apriMenu("reminder")}
                aria-label={task.reminderAt ? "Modifica promemoria" : "Imposta promemoria"}
                title={task.reminderAt ? `Promemoria: ${etichettaBreve(task.reminderAt)}` : "Nessun promemoria"}
                className={`${GHOST_ICO} w-[31px] h-[31px]`}
                style={{ color: task.reminderAt ? "var(--color-priority-medium)" : undefined }}
              >
                <Alarm size={17} />
              </button>
              <Dropdown open={menu === "reminder"} onClose={chiudiMenu} width={230} placement="top">
                <DropdownLabel>Promemoria</DropdownLabel>
                {PRESET_PROMEMORIA.map((p) => (
                  <DropdownItem
                    key={p.id}
                    disabled={p.offsetMin !== null && !task.dueAt}
                    onClick={() => impostaPromemoria(p)}
                  >
                    <span className="flex-1">{p.label}</span>
                  </DropdownItem>
                ))}
                {!task.dueAt ? (
                  <div className="px-2 pb-1 text-[10.5px] leading-[1.4] text-content/45">
                    I preset sono relativi alla scadenza: senza scadenza resta la data personalizzata.
                  </div>
                ) : null}
                <DropdownSeparator />
                <div className="px-2 pb-2">
                  <div className="text-[10px] text-content/55 mb-1">Data e ora personalizzata</div>
                  <input
                    type="datetime-local"
                    value={
                      task.reminderAt
                        ? `${partiIso(task.reminderAt).data}T${partiIso(task.reminderAt).ora}`
                        : ""
                    }
                    onChange={(e) =>
                      aggiorna({ reminderAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                    }
                    className={`${INPUT_BASE} w-full text-xs`}
                  />
                </div>
              </Dropdown>
            </div>

            <div className="relative inline-flex">
              <button
                type="button"
                onClick={() => apriMenu("status")}
                className={
                  "inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-meta cursor-pointer " +
                  CHIP_RUOLO[task.state.role]
                }
              >
                {task.state.label}
                <ChevronDown size={13} />
              </button>
              {/* Il menu si apre in alto e allineato a sinistra: il chip non e
                  piu all'estremita destra, quindi un allineamento a destra lo
                  farebbe uscire verso il centro della scheda. */}
              <Dropdown open={menu === "status"} onClose={chiudiMenu} width={170} placement="top">
                {states.map((s, i) => (
                  <div key={s.id}>
                    {/* Le chiusure stanno dopo una riga, come in TaskRow:
                        portare un task su uno stato finale trascina i
                        sotto-task. */}
                    {s.role === "end" && states[i - 1]?.role !== "end" ? <DropdownSeparator /> : null}
                    <DropdownItem
                      selected={s.id === task.state.id}
                      onClick={() => {
                        chiudiMenu();
                        alia.cambiaStato(task.id, s.id);
                      }}
                    >
                      <span className="flex-1">{s.label}</span>
                    </DropdownItem>
                  </div>
                ))}
              </Dropdown>
            </div>
          </div>

          {/* Un solo pulsante, e si chiama "Chiudi" (deciso il 2026-09-10).
              Prima erano "Annulla" e "Salva", ma questa scheda scrive subito,
              campo per campo — come nell'artboard, dove titolo, descrizione e
              nota hanno ciascuno la propria conferma e i chip scrivono
              all'istante. Senza una bozza da scartare, "Annulla" prometteva un
              ritorno indietro che non c'era e "Salva" un salvataggio gia
              avvenuto: due pulsanti che facevano la stessa cosa con due nomi
              sbagliati. "Chiudi" dice quello che fa. */}
          <button
            type="button"
            onClick={onClose}
            className={
              "shrink-0 h-[30px] px-3.5 text-meta rounded-md border border-card-line " +
              "bg-elevated text-content cursor-pointer hover:border-card-line-hover"
            }
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
