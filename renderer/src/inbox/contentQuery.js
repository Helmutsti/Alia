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

export function filterGroups(states = []) {
  const gruppi = [GRUPPO_QUANDO, GRUPPO_PRIORITA];
  const stati = gruppoStato(states);
  return stati.items.length > 0 ? [...gruppi, stati] : gruppi;
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
   nessuna sparisce. I gruppi vuoti non si disegnano. */
export const GROUP_KEYS = [
  { id: "nessuno", label: "Nessuno" },
  { id: "progetto", label: "Progetto" },
  { id: "scadenza", label: "Scadenza" },
  { id: "priorita", label: "Priorità" },
  { id: "stato", label: "Stato" },
];

const SENZA_PROGETTO = "__nessuno__";

function chiave(task, group) {
  if (group === "progetto") return task.project?.id ?? SENZA_PROGETTO;
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

export function groupTasks(tasks, group, { projects = [], states = [] } = {}) {
  if (group === "nessuno") return [{ id: "tutte", label: null, items: tasks }];

  const per = new Map();
  tasks.forEach((t) => {
    const k = chiave(t, group);
    if (!per.has(k)) per.set(k, []);
    per.get(k).push(t);
  });

  const ordine = {
    progetto: [...projects.map((p) => p.id), SENZA_PROGETTO],
    priorita: PRIORITIES.map((p) => p.id),
    stato: [...states].sort((a, b) => a.stepOrder - b.stepOrder).map((s) => String(s.id)),
    scadenza: ["ritardo", "oggi", "settimana", "dopo", "senza"],
  }[group] ?? [...per.keys()];

  return ordine
    .filter((k) => per.has(k))
    .map((k) => {
      const items = per.get(k);
      if (group === "progetto") {
        const p = projects.find((x) => x.id === k);
        return { id: k, label: p ? p.name : "Senza progetto", dot: p ? p.color : null, dashed: !p, items };
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
