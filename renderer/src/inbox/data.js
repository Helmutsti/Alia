/* Dati di esempio ripresi *alla lettera* dai due artboard canonici
   (DEF_Inbox min.dc.html e DEF_Inbox max.dc.html), titoli e scadenze compresi.
   Servono a rendere le schermate confrontabili con gli artboard: il diff pixel
   non chiude se i contenuti non sono gli stessi.

   Non sono i dati dell'app: quando le schermate verranno collegate al core
   (src/core via preload), questi restano solo per la pagina di anteprima. */

/* I colori sono i token Tailwind decisi in DESIGN_LOCK.md, non gli hex degli
   artboard: `Nessuna` nell'artboard è var(--color-neutral-700) → neutral-700. */
export const PRIORITY_COLOR = {
  Alta: "var(--color-priority-high)",
  Media: "var(--color-priority-medium)",
  Bassa: "var(--color-priority-low)",
  Nessuna: "var(--color-neutral-700)",
};

export const PROJECTS = [
  { id: "casa", label: "Casa", dot: "var(--color-project-casa)", count: 4 },
  { id: "lavoro", label: "Lavoro", dot: "var(--color-project-lavoro)", count: 3 },
  { id: "salute", label: "Salute", dot: "var(--color-project-salute)", count: 2 },
  { id: "personale", label: "Personale", dot: "var(--color-project-personale)", count: 1 },
];

export const PROJECT_NAMES = { casa: "Casa", lavoro: "Lavoro", salute: "Salute", personale: "Personale" };

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

export const SOURCE_ICONS = {
  mail: "M3 5h18v14H3zM3 7l9 6 9-6",
  discord:
    "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
  telegram: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
};
export const SOURCE_LABELS = { mail: "Mail", discord: "Discord", telegram: "Telegram" };

/* — area contenuto della schermata principale (lista / kanban / calendario /
     gantt). Resta una lista a sé: è l'ambito "Oggi", non l'inbox. — */
export const CONTENT_TASKS = [
  { id: 1, title: "Rispondere alla mail del fornitore", priority: "Media", due: "8 set", status: "done" },
  { id: 2, title: "Allenamento in palestra", priority: "Bassa", due: "7 set", status: "done" },
  { id: 3, title: "Pagare la bolletta della luce", priority: "Alta", due: "8 set", status: "doing" },
  { id: 4, title: "Preparare la presentazione trimestrale", priority: "Alta", due: "11 set", status: "doing" },
  { id: 5, title: "Inviare la fattura di agosto", priority: "Alta", due: "5 set", status: "todo" },
  { id: 6, title: "Prenotare visita dal dentista", priority: "Media", due: "9 set", status: "todo" },
  { id: 7, title: "Comprare il regalo di compleanno", priority: "Media", due: "14 set", status: "todo" },
  { id: 8, title: "Rinnovare l’abbonamento in palestra", priority: "Bassa", due: "15 set", status: "todo" },
  { id: 9, title: "Archiviare le ricevute", priority: "Nessuna", due: "30 set", status: "todo" },
];

export const GANTT_BARS = [
  { label: "Fattura agosto", left: 5, width: 20 },
  { label: "Passaporto", left: 15, width: 35 },
  { label: "Dentista", left: 40, width: 12 },
  { label: "Presentazione", left: 30, width: 45 },
  { label: "Valigia Firenze", left: 60, width: 25 },
];

export const CALENDAR_DOTS = [3, 7, 12, 18, 22];

/* — Le task dell'inbox: una lista sola. —

   Prima erano due elenchi separati, uno per la Small Inbox e uno per la board
   della Full Inbox, e non coincidevano (7 elementi contro 5). Con il movimento
   di scorrimento la colonna di sinistra *è* la colonna "Da smistare" che
   finisce a destra: se le card non fossero le stesse, a metà movimento
   cambierebbero sotto gli occhi. Quindi una lista, e le due colonne ne leggono
   lo stesso sottoinsieme. */
export const TASKS = [
  { id: 1, title: "Inviare la fattura di agosto", project: null, pending: false, priority: "Alta", due: "5 set" },
  { id: 2, title: "Pagare la bolletta della luce", project: "casa", pending: false, priority: "Alta", due: "8 set" },
  { id: 3, title: "Prenotare visita dal dentista", project: null, pending: false, priority: "Media", due: "9 set" },
  { id: 4, title: "Preparare la presentazione trimestrale", project: "lavoro", pending: false, priority: "Alta", due: "11 set" },
  { id: 5, title: "Comprare il regalo di compleanno", project: null, pending: false, priority: "Media", due: "14 set" },
  { id: 6, title: "Rinnovare l’abbonamento in palestra", project: null, pending: false, priority: "Bassa", due: "15 set" },
  { id: 7, title: "Portare l’auto in officina", project: "casa", pending: false, priority: "Bassa", due: "20 set" },
  { id: 8, title: "Archiviare le ricevute", project: null, pending: false, priority: "Nessuna", due: "30 set" },
  { id: 9, title: "Rispondere alla mail del fornitore", project: "lavoro", pending: false, priority: "Media", due: "8 set" },
  { id: 10, title: "Allenamento in palestra", project: "salute", pending: false, priority: "Bassa", due: "7 set" },
  { id: 101, title: "Rinnovo contratto fornitore", project: null, pending: true, source: "mail", priority: "", due: "" },
  { id: 102, title: "Idea proposta nel canale #progetti", project: null, pending: true, source: "discord", priority: "", due: "" },
  { id: 103, title: "Promemoria spedito dal bot", project: null, pending: true, source: "telegram", priority: "", due: "" },
];

/* Le task senza progetto e già confermate: sono il contenuto della Small Inbox
   e, a movimento finito, della colonna "Da smistare". */
export const unassignedOf = (tasks) => tasks.filter((t) => !t.pending && t.project === null);

/* Le task arrivate da una sorgente esterna e non ancora confermate. */
export const pendingOf = (tasks) => tasks.filter((t) => t.pending);
