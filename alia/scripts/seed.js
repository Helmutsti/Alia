/* Riempie un database con dati d'esempio, sul core nuovo.

   Uso: npm run seed [percorso]
   Senza argomenti scrive in ./data/scheduler.sqlite; per riempire il database
   dell'app vera va passato il suo percorso
   (%APPDATA%\alia\scheduler.sqlite su Windows).

   Non azzera niente: aggiunge. Su un database già pieno i dati si sommano. */

import { createAliaCore } from "../src/core/alia-core.js";

const databasePath = process.argv[2] || process.env.SCHEDULER_DB_PATH || "./data/scheduler.sqlite";

function isoAt(offsetDays, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/* `stato` è l'etichetta dello stato voluto: gli stati sono configurabili, e un
   id numerico scritto qui a mano sarebbe giusto solo per un database. Se
   l'etichetta non esiste, la task nasce nello stato di partenza. */
const SEMI = [
  { title: "Inviare la fattura di agosto", priority: "high", dueAt: isoAt(-3), project: "Lavoro", tags: ["fatturazione"] },
  { title: "Pagare la bolletta della luce", description: "84,20 € con scadenza domani.", priority: "high", dueAt: isoAt(1), project: "Casa", stato: "In corso" },
  { title: "Prenotare visita dal dentista", priority: "medium", dueAt: isoAt(2), project: "Salute" },
  {
    title: "Preparare la presentazione trimestrale",
    description: "Riassumere i numeri del trimestre per la riunione di lunedì.",
    priority: "high",
    startAt: isoAt(-2),
    dueAt: isoAt(0),
    project: "Lavoro",
    stato: "In corso",
    figli: [
      { title: "Esportare i numeri dal foglio vendite", chiuso: true },
      { title: "Aggiornare i grafici del trimestre" },
      { title: "Scrivere la slide di confronto" },
    ],
  },
  { title: "Comprare il regalo di compleanno", priority: "medium", dueAt: isoAt(6), project: "Personale" },
  { title: "Rinnovare l'abbonamento in palestra", priority: "medium", dueAt: isoAt(8), project: "Salute" },
  {
    title: "Preparare la valigia per Firenze",
    description: "Weekend lungo, controllare il meteo prima di fare i bagagli.",
    priority: "high",
    startAt: isoAt(8),
    dueAt: isoAt(10),
    project: "Personale",
    stato: "In corso",
    figli: [{ title: "Prenotare il parcheggio in stazione", chiuso: true }, { title: "Fare i bagagli" }],
  },
  { title: "Portare l'auto in officina", description: "Chiedere anche il tagliando dei freni.", priority: "low", dueAt: isoAt(12), project: "Casa" },
  { title: "Rispondere alla mail del fornitore", priority: "medium", dueAt: isoAt(-1), project: "Lavoro", stato: "Fatto" },
  { title: "Allenamento in palestra", priority: "low", dueAt: isoAt(0), project: "Salute", stato: "Fatto" },
  { title: "Archiviare le ricevute", priority: "none", dueAt: isoAt(20), project: "Casa" },
  { title: "Pane, latte e caffè", priority: "none", dueAt: isoAt(3), project: "Casa", tags: ["spesa"] },
  { title: "Rinnovare il passaporto", priority: "high", dueAt: isoAt(-1), project: "Casa", stato: "In corso" },
  { title: "Firmare e rispedire il preventivo", priority: "high", dueAt: isoAt(2), project: "Lavoro" },
  { title: "Chiamata di follow-up col cliente", priority: "urgent", dueAt: isoAt(0), project: "Lavoro", stato: "In corso" },
  { title: "Vecchio progetto concluso", priority: "low", project: "Personale", stato: "Archiviato" },
  { title: "Idea senza scadenza né progetto", description: "Da valutare più avanti, ancora senza contesto.", priority: "none" },
  /* Due origini esterne, per avere qualcosa nella colonna "Origini da
     confermare": nascono nello stato di partenza e non sono manuali. */
  { title: "Rinnovo contratto fornitore", sourceType: "mail", priority: "none" },
  { title: "Idea proposta nel canale #progetti", sourceType: "discord", priority: "none" },
];

const core = createAliaCore({ databasePath });

const statoPerEtichetta = new Map(core.listStates().map((s) => [s.label, s.idState]));
const progettoPerNome = new Map(core.listProjects().map((p) => [p.name, p.idProject]));

function statoDi(etichetta) {
  if (!etichetta) return undefined;
  const id = statoPerEtichetta.get(etichetta);
  if (id === undefined) {
    console.warn(`  stato "${etichetta}" non configurato in questo database: uso quello di partenza`);
  }
  return id;
}

let creati = 0;
for (const { figli, project, tags, stato, ...input } of SEMI) {
  const esito = core.createTask(input);
  if (esito.esito !== "applicato") {
    console.warn(`Saltata "${input.title}": ${JSON.stringify(esito)}`);
    continue;
  }
  creati++;

  /* Il progetto si assegna dopo la creazione, perché `createTask` accetta un
     `idProject` e qui si ragiona per nome. */
  if (project && progettoPerNome.has(project)) {
    core.setTaskProject(esito.idTask, progettoPerNome.get(project));
  }

  for (const figlio of figli ?? []) {
    const nato = core.createTask({ title: figlio.title, idParentTask: esito.idTask });
    if (nato.esito === "applicato" && figlio.chiuso) {
      core.setTaskState(nato.idTask, statoPerEtichetta.get("Fatto") ?? statoDi("Archiviato"));
      creati++;
    } else if (nato.esito === "applicato") {
      creati++;
    }
  }

  /* Lo stato si mette per ultimo: prima devono esistere i figli, altrimenti
     chiudere il padre non ha nessuna cascata da applicare — e aggiungere un
     figlio a un padre già chiuso lo riaprirebbe, chiedendo una conferma che
     uno script non può dare. */
  const idState = statoDi(stato);
  if (idState !== undefined) {
    const esitoStato = core.setTaskState(esito.idTask, idState, { sovrascriviFigliChiusi: false });
    if (esitoStato.esito !== "applicato") {
      console.warn(`  stato non applicato a "${input.title}": ${esitoStato.esito}`);
    }
  }
}

console.log(`Seed completato: ${creati} task create in "${databasePath}".`);
core.close();
