/* Il vocabolario condiviso fra il core e le viste.

   Il core parla di `t_task` con `idState` numerico, `priority` in inglese e
   date ISO; le viste hanno bisogno di etichette, colori e ruoli. La traduzione
   sta qui e in un posto solo, così nessun componente inventa la propria. */

/* — priorità — l'enumerazione è del core (`TASK_PRIORITIES`), non
   dell'interfaccia: cinque valori, non i quattro che il design aveva in mente.
   `urgent` è quello in più; prende il rosso più saturo, così resta distinguibile
   da `high` senza rifare la rampa. */
export const PRIORITIES = [
  { id: "urgent", label: "Urgente", color: "var(--color-priority-urgent)" },
  { id: "high", label: "Alta", color: "var(--color-priority-high)" },
  { id: "medium", label: "Media", color: "var(--color-priority-medium)" },
  { id: "low", label: "Bassa", color: "var(--color-priority-low)" },
  { id: "none", label: "Nessuna", color: "var(--color-priority-none)" },
];

/* — cosa raccontano le card —
   Ogni campo che una card **puo'** mostrare oltre al titolo, uno per uno.

   Il titolo non e' nell'elenco ed e' apposta: e' la card. Tutto il resto si
   puo' spegnere, lui no.

   L'ordine e' quello con cui i campi si disegnano, dal piu' al meno
   identificante — chi e', dove vive, com'e' etichettato, a che punto sta — e
   tenerlo uguale qui e nel componente vuol dire che l'elenco delle
   Impostazioni si legge nello stesso ordine della card che descrive.

   Sta qui e non dentro un componente perche' lo leggono in tre: chi lo imposta
   (le Impostazioni) e i due punti che disegnano card (la colonna Inbox e il
   Kanban). */
export const CAMPI_CARD = [
  /* La priorita' non e' qui, e non e' una dimenticanza: il pallino si apre al
     passaggio del mouse e **in nessun caso resta acceso** (direttiva
     dell'11/09/2026). Per un giro e' stato un campo come gli altri; toglierlo
     dall'elenco e' il modo di dire che la scelta non c'e', invece di lasciare
     un interruttore che promette qualcosa che non deve succedere. */
  { id: "progetto", label: "Progetto e fase", nota: "Dove vive la task." },
  { id: "tag", label: "Tag", nota: "Le etichette scritte a mano. Le più care in larghezza." },
  { id: "sottotask", label: "Sotto-task", nota: "Quanti ne sono chiusi sul totale." },
  { id: "scadenza", label: "Scadenza", nota: "In rosso quando è passata." },
  { id: "promemoria", label: "Promemoria", nota: "L'ora della sveglia, quando ce n'è una." },
  { id: "note", label: "Note", nota: "Un segno che dice che c'è scritto qualcosa dentro." },
  { id: "sorgente", label: "Sorgente", nota: "Da dove è arrivata, se non l'hai scritta tu." },
  { id: "stato", label: "Stato", nota: "Il chip colorato per ruolo." },
];

const SPENTI = Object.fromEntries(CAMPI_CARD.map((c) => [c.id, false]));
const ACCESI = Object.fromEntries(CAMPI_CARD.map((c) => [c.id, true]));

/* Le due preselezioni sono **scorciatoie**, non modi diversi di funzionare:
   scrivono lo stesso insieme di interruttori che si possono toccare a mano.
   Da qui discende che "personalizzata" non e' una terza configurazione ma il
   nome che prende l'insieme appena si discosta dalle due note — e infatti non
   c'e' niente da scegliere prima di poter toccare un interruttore. */
export const PRESET_CARD = {
  essenziale: { ...SPENTI, scadenza: true },
  completa: { ...ACCESI },
};

export const DENSITA_CARD = [
  { id: "essenziale", label: "Essenziale", nota: "Titolo e scadenza, come è sempre stata." },
  { id: "completa", label: "Completa", nota: "Tutto quello che la task sa dire di sé." },
  { id: "personalizzata", label: "Personalizzata", nota: "Scegli campo per campo, qui sotto." },
];

/* Un insieme di campi vale se e' un oggetto di booleani. **Le chiavi che non
   riconosciamo non lo invalidano**: un campo tolto da una versione successiva
   — com'e' appena successo alla priorita' — vive ancora nelle preferenze
   salvate di chi aveva configurato le card, e buttare via tutto l'insieme per
   una chiave di troppo vorrebbe dire azzerare la configurazione di qualcuno
   per una nostra decisione. Le chiavi sconosciute si scartano dopo, in
   `risolviCampiCard`, dove non fanno danno. */
export const eCampiCard = (v) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.values(v).every((on) => typeof on === "boolean");

/* Da quale preselezione si sta guardando + cosa si e' scelto a mano → gli
   interruttori veri. Un campo assente vale spento: e' cosi' che un campo
   aggiunto in futuro non compare da solo su card che nessuno ha mai
   configurato per mostrarlo.

   **"Personalizzata" senza niente di salvato vale "Essenziale"**, e non
   "tutto spento". Sono due cose diverse: tutto spento e' una card con il solo
   titolo — una configurazione legittima, ma solo se qualcuno l'ha chiesta.
   Trovarcisi per un'incoerenza fra le due preferenze (la modalita' scritta e
   i campi no: due righe di `t_setting`, e niente garantisce che siano
   d'accordo) vorrebbe dire aprire l'app con le card svuotate senza aver
   toccato niente. Il ripiego e' quello che l'applicazione farebbe comunque —
   la stessa regola di `usePreferenza`, un gradino piu' su. */
export function risolviCampiCard(densita, personalizzati) {
  if (densita !== "personalizzata") return PRESET_CARD[densita] ?? PRESET_CARD.essenziale;
  if (!personalizzati) return { ...PRESET_CARD.essenziale };
  /* Solo i campi che esistono ancora: vedi la nota su `eCampiCard`. */
  const noti = Object.fromEntries(
    Object.entries(personalizzati).filter(([k]) => CAMPI_CARD.some((c) => c.id === k)),
  );
  return { ...SPENTI, ...noti };
}

/* Quale preselezione descrive questo insieme, se ce n'e' una. Serve alle
   Impostazioni per riaccendere "Essenziale" o "Completa" quando si torna con
   gli interruttori esattamente su una delle due, invece di lasciare acceso
   "Personalizzata" su una configurazione che ha gia' un nome. */
export function densitaDeiCampi(campi) {
  const uguale = (preset) => CAMPI_CARD.every((c) => !!campi[c.id] === !!preset[c.id]);
  if (uguale(PRESET_CARD.essenziale)) return "essenziale";
  if (uguale(PRESET_CARD.completa)) return "completa";
  return "personalizzata";
}

/* I dati della card a partire dal task, filtrati dagli interruttori.

   `escludi` e' la regola del Kanban, e arriva da fuori: la colonna dice gia'
   una dimensione del task, e ripeterla su ogni card dentro quella colonna e'
   rumore. Chi chiama passa quali togliere, perche' e' l'unico a sapere come
   sono fatte le colonne.

   Torna `null` quando non resta niente: cosi' la card torna ad essere quella
   essenziale senza che nessuno debba dirglielo. */
export function metaCard(task, campi, escludi = {}) {
  const attivo = (id) => !!campi[id] && !escludi[id];
  const meta = {
    progetto: attivo("progetto") ? task.project : null,
    fase: attivo("progetto") && !escludi.fase ? (task.milestone?.label ?? null) : null,
    tag: attivo("tag") ? task.tags : [],
    sottotask:
      attivo("sottotask") && task.childCount > 0
        ? { fatti: task.childDoneCount, totali: task.childCount }
        : null,
    promemoria: attivo("promemoria") ? task.reminderAt : null,
    note: attivo("note") && !!(task.notes || task.description),
    sorgente: attivo("sorgente") && task.sourceType !== "manual" ? task.sourceType : null,
    stato: attivo("stato") ? task.state : null,
  };
  const vuota =
    !meta.progetto &&
    !meta.fase &&
    meta.tag.length === 0 &&
    !meta.sottotask &&
    !meta.promemoria &&
    !meta.note &&
    !meta.sorgente &&
    !meta.stato;
  return vuota ? null : meta;
}

const PER_PRIORITA = new Map(PRIORITIES.map((p) => [p.id, p]));
export const priorityOf = (id) => PER_PRIORITA.get(id) ?? PER_PRIORITA.get("none");
export const priorityRank = (id) => {
  const i = PRIORITIES.findIndex((p) => p.id === id);
  return i === -1 ? PRIORITIES.length : i;
};

/* — stati — Sono configurabili dall'utente: nessuna vista può assumerne un
   elenco fisso, e nemmeno i loro nomi. Quello su cui la grafica può contare è
   il *ruolo*, che è strutturale e garantito dallo schema: esattamente uno di
   partenza, uno o più di chiusura, gli altri in mezzo. */
export function stateRole(state) {
  if (state.isStartState === 1) return "start";
  if (state.isEndState === 1) return "end";
  return "mid";
}

/* — date — Il core salva istanti ISO. Il confronto però è per giorno: una
   scadenza "oggi alle 9" è in ritardo alle 10, ma resta oggi. */
function aMezzanotte(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function giorniDiScarto(iso, adesso = new Date()) {
  if (!iso) return null;
  const giorno = aMezzanotte(iso);
  const oggi = aMezzanotte(adesso);
  return Math.round((giorno - oggi) / 86_400_000);
}

/* Stessa logica di DEF_Card: le date vicine si dicono a parole, le altre come
   giorno e mese. */
/* In ritardo: scaduta e non ancora chiusa. Una task chiusa in ritardo non e'
   piu' in ritardo — e' finita, e accenderla di rosso chiederebbe di fare una
   cosa che e' gia' stata fatta. */
export function eInRitardo(task, adesso = new Date()) {
  if (task.done) return false;
  const scarto = giorniDiScarto(task.dueAt, adesso);
  return scarto !== null && scarto < 0;
}

export function dueLabel(iso, adesso = new Date()) {
  const scarto = giorniDiScarto(iso, adesso);
  if (scarto === null) return "";
  if (scarto < 0) return "in ritardo";
  if (scarto === 0) return "oggi";
  if (scarto === 1) return "domani";
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

/* — la forma che le viste consumano —
   Una riga di `listTasks` ha già stato, progetto e milestone risolti dai join;
   qui diventa un oggetto con le parti raggruppate, perché un componente che
   deve disegnare il progetto vuole `task.project.color`, non tre campi
   appiattiti da ricomporre ogni volta. */
export function normalizeTask(row) {
  return {
    id: row.idTask,
    parentId: row.idParentTask,
    title: row.title,
    description: row.description,
    notes: row.notes,
    priority: row.priority,
    priorityLabel: priorityOf(row.priority).label,
    priorityColor: priorityOf(row.priority).color,
    dueAt: row.dueAt,
    startAt: row.startAt,
    reminderAt: row.reminderAt,
    createdAt: row.createdAt,
    position: row.position,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    done: row.isCompleted === 1,
    /* `inbox`: ancora da smistare. Campo proprio, non derivato da progetto o
       date — vedi Rinascita.md, § Stati speciali del task. */
    inbox: row.isInbox === 1,
    /* I tag arrivano concatenati da `listTasks` (vedi la nota li'). Qui tornano
       un elenco, che e' la forma in cui li usa il filtro. */
    tags: row.tagLabels ? row.tagLabels.split("\u001f") : [],
    state: {
      id: row.idState,
      label: row.stateLabel,
      role: stateRole(row),
      stepOrder: row.stepOrder,
    },
    project: row.idProject ? { id: row.idProject, name: row.projectName, color: row.projectColor } : null,
    milestone: row.idMilestone ? { id: row.idMilestone, label: row.milestoneLabel } : null,
    childCount: row.childCount ?? 0,
    childDoneCount: row.childDoneCount ?? 0,
  };
}

export function normalizeState(row) {
  return { id: row.idState, label: row.label, role: stateRole(row), stepOrder: row.stepOrder };
}

export function normalizeProject(row) {
  return { id: row.idProject, name: row.name, color: row.color, taskCount: row.taskCount ?? 0 };
}

/* Le fasi erano l'unica lista che arrivava al renderer **grezza** (2026-09-11).

   Tasks, stati e progetti passavano tutti di qui e uscivano con `id`; le fasi
   no, e restavano con `idMilestone`/`idProject` addosso. Cosi' meta' del codice
   leggeva un nome e meta' l'altro, e dove sbagliava non si vedeva niente di
   rotto: leggeva `undefined`.

   Il danno peggiore era nella tendina delle fasi del dettaglio, dove il
   confronto `m.id === task.milestone?.id` diventava `undefined === undefined` —
   **vero** — e con un task senza fase risultavano selezionate insieme "Nessuna
   fase" e tutte le fasi del progetto. Non un difetto di disegno: una domanda
   fatta a un campo che non esisteva.

   `label` e non `name` perche' e' quello che la colonna si chiama nel database,
   ed e' gia' il nome che porta `task.milestone`. Una fase e una fase, comunque
   la si guardi. */
export function normalizeMilestone(row) {
  return {
    id: row.idMilestone,
    label: row.label,
    projectId: row.idProject,
    position: row.position ?? 0,
  };
}
