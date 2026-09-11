import { PRIORITIES, giorniDiScarto, priorityRank } from "../lib/tasks.js";

/* Interrogazione della lista contenuto: filtra, ordina, raggruppa.
   Sta fuori dal componente perché è logica, non disposizione — e perché così
   si può ragionare (e provare) senza montare la schermata.

   Il vocabolario è quello deciso in DEF_Content:
     · il FILTRO restringe l'insieme         → può far sparire task
     · l'ORDINAMENTO dispone                 → non ne fa sparire nessuna
     · il RAGGRUPPAMENTO divide in gruppi    → non ne fa sparire nessuna
   È la distinzione che tiene in piedi la testata: solo il filtro ha un
   contatore, perché è l'unico che nasconde.

   Con l'innesto sul core queste funzioni non possono più contenere gli elenchi
   di stati e progetti: sono dati, configurabili dall'utente, e vanno passati.
   Restano costanti solo le cose che il modello garantisce — le cinque priorità
   e le fasce temporali. */

/* — filtri — Le voci sono raccolte in gruppi. Dentro un gruppo valgono in OR
   (o oggi o questa settimana), fra gruppi in AND (oggi E priorità alta).
   Nessun filtro attivo in un gruppo = quel gruppo non restringe niente. */
const GRUPPO_QUANDO = {
  id: "quando",
  label: "Quando",
  items: [
    { id: "oggi", label: "Oggi", test: (t) => giorniDiScarto(t.dueAt) === 0 },
    {
      id: "settimana",
      label: "Questa settimana",
      test: (t) => {
        const d = giorniDiScarto(t.dueAt);
        return d !== null && d >= 0 && d <= 6;
      },
    },
    { id: "ritardo", label: "In ritardo", test: (t) => (giorniDiScarto(t.dueAt) ?? 0) < 0 },
    { id: "senza-scadenza", label: "Senza scadenza", test: (t) => t.dueAt == null },
  ],
};

const GRUPPO_PRIORITA = {
  id: "priorita",
  label: "Priorità",
  items: PRIORITIES.filter((p) => p.id !== "none").map((p) => ({
    id: `pr-${p.id}`,
    label: p.label,
    test: (t) => t.priority === p.id,
  })),
};

/* Il gruppo "Stato" si costruisce dagli stati configurati, e contiene solo
   quelli aperti: le chiusure sono coperte da "Mostra completate", che si
   comporta al contrario e per questo sta a parte. */
function gruppoStato(states) {
  return {
    id: "stato",
    label: "Stato",
    items: states
      .filter((s) => s.role !== "end")
      .map((s) => ({ id: `st-${s.id}`, label: s.label, test: (t) => t.state.id === s.id })),
  };
}

/* Il gruppo "Tag" e' l'unico che non si puo' costruire dai dati: gli altri
   elencano quello che c'e' (le priorita' del modello, gli stati configurati), i
   tag no. Elencarli tutti sarebbe un menu che cresce senza limite e che diventa
   inutile proprio quando i tag servono davvero, cioe' quando sono tanti — quindi
   **si scrivono**, e il gruppo si costruisce da quelli scritti.

   Conseguenza: un tag filtrato non deve esistere. Si puo' scriverne uno che
   nessuna task ha, e il risultato e' un elenco vuoto — che e' la risposta giusta
   alla domanda fatta, non un errore da impedire.

   Il confronto e' minuscolo contro minuscolo: chi filtra scrive "Urgente" o
   "urgente" senza pensarci, e sono la stessa cosa. Il core, dal canto suo,
   conserva l'etichetta come e' stata scritta la prima volta. */
export const TAG_PREFISSO = "tag:";

export const filtroDaTag = (etichetta) => `${TAG_PREFISSO}${etichetta.trim().toLowerCase()}`;
export const tagDaFiltro = (id) => id.slice(TAG_PREFISSO.length);
export const eFiltroTag = (id) => id.startsWith(TAG_PREFISSO);

function gruppoTag(active) {
  return {
    id: "tag",
    label: "Tag",
    items: [...active].filter(eFiltroTag).map((id) => {
      const cercato = tagDaFiltro(id);
      return {
        id,
        label: cercato,
        test: (t) => (t.tags ?? []).some((l) => l.toLowerCase() === cercato),
      };
    }),
  };
}

export function filterGroups(states = [], active = new Set()) {
  const gruppi = [GRUPPO_QUANDO, GRUPPO_PRIORITA];
  const stati = gruppoStato(states);
  if (stati.items.length > 0) gruppi.push(stati);
  const tag = gruppoTag(active);
  if (tag.items.length > 0) gruppi.push(tag);
  return gruppi;
}

/* Voce a sé: non restringe, allarga. Le completate sono nascoste finché non la
   si accende, ed è il motivo per cui non sta nel gruppo "Stato" insieme alle
   altre — lì si comporterebbe al contrario delle sue vicine. */
export const SHOW_DONE = { id: "mostra-completate", label: "Mostra completate" };

export function filterTasks(tasks, active, gruppi) {
  const mostraChiuse = active.has(SHOW_DONE.id);
  return tasks.filter((t) => {
    if (t.done && !mostraChiuse) return false;
    return gruppi.every((g) => {
      const accesi = g.items.filter((i) => active.has(i.id));
      return accesi.length === 0 || accesi.some((i) => i.test(t));
    });
  });
}

/* Quante voci sono accese: è il numero sul bottone. "Mostra completate" conta,
   perché anch'essa cambia cosa vedi. */
export const activeFilterCount = (active) => active.size;

/* — ordinamento — `manuale` è l'ordine in cui stanno nella lista, cioè quello
   in cui sono state trascinate: non tocca niente. */
export const SORT_KEYS = [
  { id: "scadenza", label: "Scadenza" },
  { id: "priorita", label: "Priorità" },
  { id: "titolo", label: "Titolo" },
  { id: "creazione", label: "Data di creazione" },
  { id: "manuale", label: "Manuale" },
];

export function sortTasks(tasks, key, dir) {
  if (key === "manuale") return tasks;
  const segno = dir === "desc" ? -1 : 1;

  if (key === "titolo") {
    return [...tasks].sort((a, b) => segno * a.title.localeCompare(b.title, "it"));
  }

  const valore = {
    /* Senza scadenza va in fondo in entrambe le direzioni: è assenza di data,
       non una data lontanissima. */
    scadenza: (t) => (t.dueAt == null ? Number.POSITIVE_INFINITY : new Date(t.dueAt).getTime()),
    priorita: (t) => priorityRank(t.priority),
    creazione: (t) => new Date(t.createdAt).getTime(),
  };

  const v = valore[key] ?? valore.scadenza;
  return [...tasks].sort((a, b) => {
    const av = v(a);
    const bv = v(b);
    if (av === bv) return a.title.localeCompare(b.title, "it");
    if (av === Number.POSITIVE_INFINITY) return 1;
    if (bv === Number.POSITIVE_INFINITY) return -1;
    return segno * (av - bv);
  });
}

/* — raggruppamento — Solo chiavi: ogni task finisce in uno e un solo gruppo, e
   nessuna sparisce.

   I gruppi vuoti non si disegnano — **tranne quando sono luoghi**, e la
   distinzione e' tutta qui (trovata l'11/09/2026, con un bug in mano).

   Raggruppando per scadenza, priorita' o stato il gruppo e' un **risultato**:
   "In ritardo" senza task in ritardo e' una riga che dice il nulla, e disegnarla
   sarebbe rumore. Raggruppando per progetto no: li' il gruppo e' un **posto** —
   ci si rilascia dentro trascinando, e ci si scrive dentro dal campo in fondo.
   Un posto vuoto resta un posto, e farlo sparire vuol dire togliere l'unico
   modo di rimetterci qualcosa: svuoti un progetto e non puoi piu' trascinarci
   niente, perche' il bersaglio e' sparito insieme all'ultima task. */
/* Il catalogo completo: e' l'elenco da cui la preferenza salvata viene
   validata. Quali voci siano **offerte** lo decide l'ambito, e non sta qui —
   "Fase" ha senso dentro un progetto e "Progetto" fuori, esattamente come nel
   Kanban (vedi `vociLista` in ContentPane). */
export const GROUP_KEYS = [
  { id: "nessuno", label: "Nessuno" },
  { id: "progetto", label: "Progetto" },
  { id: "milestone", label: "Fase" },
  { id: "scadenza", label: "Scadenza" },
  { id: "priorita", label: "Priorità" },
  { id: "stato", label: "Stato" },
];

/* Esportata perche' la usa anche ContentPane: il doppio clic dentro un gruppo
   deve poter distinguere "questo progetto" da "nessun progetto", e la chiave e'
   questa. Meglio condividerla che riscriverla da due parti. */
export const SENZA_PROGETTO = "__nessuno__";

/* La stessa cosa per le fasi, e **la stessa parola del Kanban**: la' la colonna
   "Senza fase" ha chiave `milestone:nessuna`, e qui il gruppo si chiama
   `nessuna` perche' la chiave di rilascio della Lista e' `${group}:${id}` —
   cioe' `milestone:nessuna`, la stessa stringa. Due viste, un solo nome per lo
   stesso posto: chi legge il rilascio non deve sapere da quale delle due
   arriva. */
export const SENZA_FASE = "nessuna";

function chiave(task, group) {
  if (group === "progetto") return task.project?.id ?? SENZA_PROGETTO;
  if (group === "milestone") return task.milestone?.id ?? SENZA_FASE;
  if (group === "priorita") return task.priority;
  if (group === "stato") return String(task.state.id);
  if (group === "scadenza") {
    const d = giorniDiScarto(task.dueAt);
    if (d === null) return "senza";
    if (d < 0) return "ritardo";
    if (d === 0) return "oggi";
    if (d <= 6) return "settimana";
    return "dopo";
  }
  return "";
}

/* L'ordine dei gruppi non segue i dati: segue il significato. In ritardo prima
   di oggi, Urgente prima di Alta, e "Senza progetto" in fondo. Per gli stati
   l'ordine è `stepOrder`, che è esattamente ciò per cui esiste. */
const ETICHETTA_SCADENZA = {
  ritardo: "In ritardo",
  oggi: "Oggi",
  settimana: "Questa settimana",
  dopo: "Più avanti",
  senza: "Senza scadenza",
};

/* I raggruppamenti in cui il gruppo e' un **posto**: identifica un valore
   assegnabile, quindi ci si rilascia dentro e ci si scrive. Sono anche i soli
   che si disegnano da vuoti — vedi la nota sopra. */
export const GRUPPI_LUOGO = new Set(["progetto", "milestone"]);

/**
 * @param {object} [opzioni]
 * @param {boolean} [opzioni.luoghi]  tieni anche i gruppi vuoti che sono un
 *   posto dove rilasciare e dove scrivere (vedi `GRUPPI_LUOGO`).
 */
export function groupTasks(
  tasks,
  group,
  { projects = [], states = [], milestones = [], luoghi = false } = {},
) {
  if (group === "nessuno") return [{ id: "tutte", label: null, items: tasks }];

  const per = new Map();
  tasks.forEach((t) => {
    const k = chiave(t, group);
    if (!per.has(k)) per.set(k, []);
    per.get(k).push(t);
  });

  const ordine = {
    progetto: [...projects.map((p) => p.id), SENZA_PROGETTO],
    milestone: [...milestones.map((m) => m.id), SENZA_FASE],
    priorita: PRIORITIES.map((p) => p.id),
    stato: [...states].sort((a, b) => a.stepOrder - b.stepOrder).map((s) => String(s.id)),
    scadenza: ["ritardo", "oggi", "settimana", "dopo", "senza"],
  }[group] ?? [...per.keys()];

  /* I due raggruppamenti in cui un gruppo vuoto va tenuto: vedi la nota sopra.
     Sugli altri `per.has` fa il suo lavoro di sempre. */
  const tieni = luoghi && GRUPPI_LUOGO.has(group) ? () => true : (k) => per.has(k);

  return ordine
    .filter(tieni)
    .map((k) => {
      const items = per.get(k) ?? [];
      if (group === "progetto") {
        const p = projects.find((x) => x.id === k);
        return { id: k, label: p ? p.name : "Senza progetto", dot: p ? p.color : null, dashed: !p, items };
      }
      if (group === "milestone") {
        const m = milestones.find((x) => x.id === k);
        return { id: k, label: m ? m.label : "Senza fase", dashed: !m, items };
      }
      if (group === "priorita") {
        const p = PRIORITIES.find((x) => x.id === k);
        return { id: k, label: p.label, dot: p.color, items };
      }
      if (group === "stato") {
        const s = states.find((x) => String(x.id) === k);
        return { id: k, label: s?.label ?? "Stato", items };
      }
      return { id: k, label: ETICHETTA_SCADENZA[k], items };
    });
}
