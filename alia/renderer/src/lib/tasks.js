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
