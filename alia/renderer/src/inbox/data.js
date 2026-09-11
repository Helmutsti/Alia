/* Due cose diverse vivono in questo file, e conviene tenerle distinte.

   1. Le costanti grafiche prese dagli artboard — icone delle viste e delle
      sorgenti. Sono disegno, non dati: restano qui per sempre.

   2. Il dataset di anteprima (`demoDataset`), usato **solo** da preview.jsx.
      Serve perché quella pagina gira in Vite, fuori da Electron, dove il core
      non è raggiungibile, e senza card non si può confrontare la geometria con
      gli artboard. Nell'app non viene mai importato: là i dati arrivano dal
      core via AliaProvider. Titoli e scadenze sono quelli degli artboard alla
      lettera, perché il confronto non chiude se i contenuti differiscono. */

/* Percorsi SVG delle icone vista, presi dall'artboard: non sono di Lucide
   (sono varianti ridisegnate), quindi restano path letterali. */
export const VIEW_ICONS = {
  lista: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  kanban: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v12h-4z",
  calendario: "M3 5h18v16H3zM8 3v4M16 3v4M3 11h18",
  gantt: "M4 6h9M4 12h14M4 18h6",
};
export const VIEW_LABELS = { lista: "Lista", kanban: "Kanban", calendario: "Calendario", gantt: "Gantt" };
export const VIEW_ORDER = ["lista", "kanban", "calendario", "gantt"];

/* Viste bloccate: restano nel selettore, spente, invece di sparire.

   Il motivo per non togliere le voci: il selettore dice quali viste il prodotto
   avra, e una voce spenta lo dice meglio di un elenco corto — chi apre il menu
   vede che Kanban esiste e non e ancora pronta, invece di chiedersi se sia mai
   stata prevista. Il codice di quelle tre viste resta al suo posto in
   ContentPane: sbloccarne una vuol dire togliere una stringa da questo elenco,
   non riscriverla.

   Perche sono bloccate, oggi: Kanban ha il padding delle card da correggere e
   le colonne larghe 220px fisse che con molti progetti fanno un tabellone da
   migliaia di pixel (vedi Rinascita.md, § ToDo); Calendario e Gantt sono impianti presi
   dagli artboard e non ancora verificati sui dati reali. */
/* Kanban aperto l'11/09/2026: le colonne sono il raggruppamento scelto e si
   trascina da una all'altra. Calendario aperto lo stesso giorno, con la sua
   griglia vera a mese/settimana/giorno (vedi VistaCalendario) — i
   trascinamenti li' non ci sono ancora, e non sono una condizione per
   guardarlo. Il Gantt resta l'impianto preso dall'artboard e mai verificato
   sui dati veri. */
export const VIEW_BLOCKED = new Set(["gantt"]);

export const SOURCE_ICONS = {
  mail: "M3 5h18v14H3zM3 7l9 6 9-6",
  discord:
    "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
  telegram: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
};
export const SOURCE_LABELS = { mail: "Mail", discord: "Discord", telegram: "Telegram" };

/* ═══ dataset di anteprima ═══════════════════════════════════════════════════
   Nella forma già normalizzata (vedi lib/tasks.js), perché è la forma che i
   componenti consumano: passare da righe grezze e rinormalizzarle qui
   aggiungerebbe un giro senza guadagno. */

const STATI = [
  { id: 1, label: "Nuovo", role: "start", stepOrder: 1 },
  { id: 2, label: "In corso", role: "mid", stepOrder: 2 },
  { id: 3, label: "Migrato", role: "end", stepOrder: 3 },
  { id: 4, label: "Archiviato", role: "end", stepOrder: 4 },
  { id: 5, label: "Fatto", role: "end", stepOrder: 5 },
];

const PROGETTI = [
  { id: "casa", name: "Casa", color: "var(--color-project-casa)" },
  { id: "lavoro", name: "Lavoro", color: "var(--color-project-lavoro)" },
  { id: "salute", name: "Salute", color: "var(--color-project-salute)" },
  { id: "personale", name: "Personale", color: "var(--color-project-personale)" },
];

const PRIORITA = {
  high: { label: "Alta", color: "var(--color-priority-high)" },
  medium: { label: "Media", color: "var(--color-priority-medium)" },
  low: { label: "Bassa", color: "var(--color-priority-low)" },
  none: { label: "Nessuna", color: "var(--color-priority-none)" },
};

/* Gli artboard datano al settembre 2026 con "oggi" all'8. Le scadenze sono
   scritte come scarto in giorni da oggi, così l'anteprima resta coerente
   qualunque sia la data in cui la si apre. */
function fraGiorni(scarto) {
  if (scarto == null) return null;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + scarto);
  return d.toISOString();
}

const RIGHE = [
  { id: 1, title: "Inviare la fattura di agosto", project: null, priority: "high", due: -3, state: 1 },
  { id: 2, title: "Pagare la bolletta della luce", project: "casa", priority: "high", due: 0, state: 2, tags: ["urgente", "casa"] },
  { id: 3, title: "Prenotare visita dal dentista", project: null, priority: "medium", due: 1, state: 1 },
  { id: 4, title: "Preparare la presentazione trimestrale", project: "lavoro", priority: "high", due: 3, state: 2, tags: ["urgente"] },
  { id: 5, title: "Comprare il regalo di compleanno", project: null, priority: "medium", due: 6, state: 1 },
  { id: 6, title: "Rinnovare l’abbonamento in palestra", project: null, priority: "low", due: 7, state: 1 },
  { id: 7, title: "Portare l’auto in officina", project: "casa", priority: "low", due: 12, state: 1 },
  { id: 8, title: "Archiviare le ricevute", project: null, priority: "none", due: 22, state: 1 },
  { id: 9, title: "Rispondere alla mail del fornitore", project: "lavoro", priority: "medium", due: 0, state: 5 },
  { id: 10, title: "Allenamento in palestra", project: "salute", priority: "low", due: -1, state: 5 },
  { id: 11, title: "Rivedere il preventivo del fornitore", project: "lavoro", priority: "medium", due: null, state: 1, tags: ["fornitori"] },
  { id: 101, title: "Rinnovo contratto fornitore", project: null, priority: "none", due: null, state: 1, source: "mail", nuovo: true },
  { id: 102, title: "Idea proposta nel canale #progetti", project: null, priority: "none", due: null, state: 1, source: "discord" },
  { id: 103, title: "Promemoria spedito dal bot", project: null, priority: "none", due: null, state: 1, source: "telegram", nuovo: true },
];

/* Le fasi dei progetti, per l'anteprima. Servono da quando esiste la sezione
   Progetti delle Impostazioni: senza, quella schermata si vedrebbe sempre vuota
   sotto ogni progetto, e non si potrebbe giudicare il rientro delle fasi. */
/* Gia' nella forma normalizzata (`normalizeMilestone`), come il resto di questo
   file: il dataset di anteprima **sostituisce** il provider, non lo precede, e
   consegnare righe grezze qui vorrebbe dire farle arrivare ai componenti senza
   il giro che le sistema. */
const FASI = [
  { id: "ms-casa-1", projectId: "casa", label: "Manutenzione", position: 0 },
  { id: "ms-casa-2", projectId: "casa", label: "Bollette", position: 1 },
  { id: "ms-lavoro-1", projectId: "lavoro", label: "Analisi", position: 0 },
  { id: "ms-lavoro-2", projectId: "lavoro", label: "Consegna", position: 1 },
  { id: "ms-salute-1", projectId: "salute", label: "Visite", position: 0 },
];

export function demoDataset() {
  const stato = (id) => STATI.find((s) => s.id === id);
  return {
    states: STATI,
    milestones: FASI,
    projects: PROGETTI.map((p) => ({
      ...p,
      taskCount: RIGHE.filter((r) => r.project === p.id).length,
    })),
    tasks: RIGHE.map((r, i) => ({
      id: r.id,
      parentId: null,
      title: r.title,
      description: null,
      notes: null,
      priority: r.priority,
      priorityLabel: PRIORITA[r.priority].label,
      priorityColor: PRIORITA[r.priority].color,
      dueAt: fraGiorni(r.due),
      startAt: null,
      reminderAt: null,
      createdAt: fraGiorni(-30 + i),
      position: i,
      sourceType: r.source ?? "manual",
      sourceUrl: null,
      /* `inbox` era assente, e da quando la colonna "Da smistare" legge il
         flag invece di dedurlo dall'assenza di progetto (schema 8) l'anteprima
         usciva vuota: nessuna riga era `inbox`, quindi nessuna card in scena e
         niente da confrontare con gli artboard.

         Il valore riproduce la vecchia deduzione — di primo livello e senza
         progetto — perché è esattamente ciò che gli artboard disegnano.

         `isNew` stava qui accanto e non c'è più: era la campanella delle
         origini, e le origini non sono task (vedi § Flussi, "Vita di
         un'origine"). L'anteprima non le mostra affatto — vivono nel servizio,
         e questa pagina gira fuori da Electron. */
      tags: r.tags ?? [],
      inbox: r.project == null,
      done: stato(r.state).role === "end",
      state: stato(r.state),
      project: PROGETTI.find((p) => p.id === r.project) ?? null,
      milestone: null,
      childCount: 0,
      childDoneCount: 0,
    })),
  };
}
