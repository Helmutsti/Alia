import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/core/database.js";
import {
  createTask,
  deleteTask,
  getTask,
  listStates,
  listTasks,
  migrateTaskExternally,
  reorderRootTasks,
  reorderTasks,
  reparentTask,
  restoreTaskTechnical,
  setTaskProject,
  setTaskState,
  updateTask,
} from "../src/core/task-core.js";

function nuovoDatabase() {
  return openDatabase(":memory:");
}

function stati(database) {
  const perEtichetta = new Map(listStates(database).map((s) => [s.label, s.idState]));
  return {
    nuovo: perEtichetta.get("Nuovo"),
    inCorso: perEtichetta.get("In corso"),
    migrato: perEtichetta.get("Migrato"),
    archiviato: perEtichetta.get("Archiviato"),
    fatto: perEtichetta.get("Fatto"),
  };
}

function crea(database, titolo, idParentTask = null) {
  const esito = createTask(database, { title: titolo, idParentTask });
  assert.equal(esito.esito, "applicato", `creazione fallita: ${JSON.stringify(esito)}`);
  return esito.idTask;
}

test("gli stati di seed rispettano gli invarianti della specifica", () => {
  const database = nuovoDatabase();
  const elenco = listStates(database);

  assert.equal(elenco.filter((s) => s.isStartState === 1).length, 1);
  assert.equal(elenco.find((s) => s.isStartState === 1).label, "Nuovo");
  assert.ok(elenco.filter((s) => s.isEndState === 1).length > 1);
  // Nessuno stato è insieme di partenza e finale.
  assert.equal(elenco.filter((s) => s.isStartState === 1 && s.isEndState === 1).length, 0);
  // L'ultimo stato finale per stepOrder è quello su cui atterrano le cascate.
  const ultimoFinale = elenco.filter((s) => s.isEndState === 1).at(-1);
  assert.equal(ultimoFinale.label, "Fatto");
});

test("un task nasce nello stato di partenza, non completato", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const id = crea(database, "Scrivere la relazione");

  const task = getTask(database, id);
  assert.equal(task.idState, s.nuovo);
  assert.equal(task.isCompleted, 0);
  assert.equal(task.idParentTask, null);
  assert.equal(task.idProject, null);
});

test("isCompleted segue lo stato senza essere mai scritto a mano", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const id = crea(database, "Pagare la bolletta");

  setTaskState(database, id, s.fatto);
  assert.equal(getTask(database, id).isCompleted, 1);

  setTaskState(database, id, s.inCorso);
  assert.equal(getTask(database, id).isCompleted, 0);
});

test("un task senza figli non si chiude da solo per vacuità", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Trasloco");
  const figlio = crea(database, "Imballare i libri", padre);

  // Il padre resta aperto finché il figlio è aperto...
  assert.equal(getTask(database, padre).isCompleted, 0);
  // ...e il figlio, che di figli non ne ha, non si chiude per conto suo.
  assert.equal(getTask(database, figlio).isCompleted, 0);
});

test("quando tutti i figli chiudono, il padre chiude per cascata sull'ultimo stato finale", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Trasloco");
  const a = crea(database, "Imballare", padre);
  const b = crea(database, "Prenotare il furgone", padre);

  setTaskState(database, a, s.fatto);
  assert.equal(getTask(database, padre).isCompleted, 0, "un figlio solo non basta");

  const esito = setTaskState(database, b, s.fatto);
  assert.equal(esito.esito, "applicato");
  assert.equal(getTask(database, padre).idState, s.fatto);
  assert.equal(getTask(database, padre).isCompleted, 1);
});

test("la cascata verso l'alto è ricorsiva", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const nonno = crea(database, "Progetto");
  const padre = crea(database, "Fase", nonno);
  const figlio = crea(database, "Compito", padre);

  setTaskState(database, figlio, s.fatto);
  assert.equal(getTask(database, padre).isCompleted, 1);
  assert.equal(getTask(database, nonno).isCompleted, 1);
});

test("un padre chiuso per cascata su stati diversi produce un avviso di scarto", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Iniziativa");
  const a = crea(database, "Parte A", padre);
  const b = crea(database, "Parte B", padre);

  setTaskState(database, a, s.migrato);
  const esito = setTaskState(database, b, s.migrato);

  // Il padre atterra su "Fatto" per la regola dello stepOrder, anche se
  // nessuno dei figli è stato davvero completato: va segnalato.
  assert.equal(getTask(database, padre).idState, s.fatto);
  const avviso = esito.avvisi.find((a) => a.tipo === "chiusura-per-cascata-con-scarto");
  assert.ok(avviso, "manca l'avviso di scarto");
  assert.equal(avviso.idTask, padre);
  assert.deepEqual(avviso.idStateFigli, [s.migrato]);
});

test("chiudere il padre chiude i figli aperti sullo stesso stato, senza conferme", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Riordinare l'ufficio");
  const a = crea(database, "Buttare le scatole", padre);
  const b = crea(database, "Archiviare i faldoni", a);

  const esito = setTaskState(database, padre, s.archiviato);
  assert.equal(esito.esito, "applicato");
  assert.equal(getTask(database, a).idState, s.archiviato);
  assert.equal(getTask(database, b).idState, s.archiviato, "la cascata scende su tutto l'albero");
});

test("i figli già chiusi non vengono sovrascritti senza conferma esplicita", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Iniziativa");
  const migrato = crea(database, "Parte migrata", padre);
  const aperto = crea(database, "Parte aperta", padre);

  setTaskState(database, migrato, s.migrato);

  const richiesta = setTaskState(database, padre, s.fatto);
  assert.equal(richiesta.esito, "conferma");
  assert.equal(richiesta.richiesta.tipo, "figli-gia-chiusi");
  assert.deepEqual(
    richiesta.richiesta.tasks.map((t) => t.idTask),
    [migrato],
  );
  // Niente è stato scritto mentre si aspetta la risposta.
  assert.equal(getTask(database, padre).isCompleted, 0);
  assert.equal(getTask(database, aperto).isCompleted, 0);

  // Rispondendo "no", il figlio già chiuso resta dov'è.
  const conservando = setTaskState(database, padre, s.fatto, { sovrascriviFigliChiusi: false });
  assert.equal(conservando.esito, "applicato");
  assert.equal(getTask(database, migrato).idState, s.migrato);
  assert.equal(getTask(database, aperto).idState, s.fatto);
  assert.equal(getTask(database, padre).idState, s.fatto);
});

test("rispondendo sì, i figli già chiusi passano allo stato del padre", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Iniziativa");
  const migrato = crea(database, "Parte migrata", padre);
  setTaskState(database, migrato, s.migrato);

  setTaskState(database, padre, s.fatto, { sovrascriviFigliChiusi: true });
  assert.equal(getTask(database, migrato).idState, s.fatto);
});

test("riaprire un figlio chiede su quale stato riaprire il padre", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Trasloco");
  const figlio = crea(database, "Imballare", padre);

  setTaskState(database, figlio, s.fatto);
  assert.equal(getTask(database, padre).isCompleted, 1);

  const richiesta = setTaskState(database, figlio, s.inCorso);
  assert.equal(richiesta.esito, "conferma");
  assert.equal(richiesta.richiesta.tipo, "scegli-stato-riapertura");
  assert.deepEqual(
    richiesta.richiesta.tasks.map((t) => t.idTask),
    [padre],
  );
  // Gli stati proposti sono solo quelli non finali.
  assert.ok(richiesta.richiesta.statiAmmessi.every((s) => s.isEndState === 0));
  // La transazione è stata annullata: nemmeno il figlio è cambiato.
  assert.equal(getTask(database, figlio).idState, s.fatto);

  const esito = setTaskState(database, figlio, s.inCorso, {
    statiRiapertura: { [padre]: s.inCorso },
  });
  assert.equal(esito.esito, "applicato");
  assert.equal(getTask(database, figlio).idState, s.inCorso);
  assert.equal(getTask(database, padre).idState, s.inCorso);
  assert.equal(getTask(database, padre).isCompleted, 0);
});

test("la riapertura risale ricorsivamente lungo tutti gli antenati chiusi", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const nonno = crea(database, "Progetto");
  const padre = crea(database, "Fase", nonno);
  const figlio = crea(database, "Compito", padre);
  setTaskState(database, figlio, s.fatto);

  const richiesta = setTaskState(database, figlio, s.nuovo);
  assert.deepEqual(new Set(richiesta.richiesta.tasks.map((t) => t.idTask)), new Set([padre, nonno]));

  setTaskState(database, figlio, s.nuovo, {
    statiRiapertura: { [padre]: s.inCorso, [nonno]: s.inCorso },
  });
  assert.equal(getTask(database, nonno).isCompleted, 0);
});

test("aggiungere un figlio a un padre chiuso lo riapre, con lo stato scelto", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Manutenzione");
  const primo = crea(database, "Cambiare il filtro", padre);
  setTaskState(database, primo, s.fatto);
  assert.equal(getTask(database, padre).isCompleted, 1);

  const richiesta = createTask(database, { title: "Controllare l'olio", idParentTask: padre });
  assert.equal(richiesta.esito, "conferma");
  assert.equal(richiesta.richiesta.tipo, "scegli-stato-riapertura");
  // Il figlio non è stato creato: la transazione è stata annullata.
  assert.equal(database.prepare("SELECT COUNT(*) c FROM t_task WHERE idParentTask = ?").get(padre).c, 1);

  const esito = createTask(
    database,
    { title: "Controllare l'olio", idParentTask: padre },
    { statiRiapertura: { [padre]: s.inCorso } },
  );
  assert.equal(esito.esito, "applicato");
  assert.equal(getTask(database, padre).idState, s.inCorso);
});

test("un figlio cancellato è escluso dal conteggio della cascata", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Sprint");
  const a = crea(database, "Task A", padre);
  const b = crea(database, "Task B", padre);

  setTaskState(database, a, s.fatto);
  assert.equal(getTask(database, padre).isCompleted, 0);

  // Cancellando l'unico figlio ancora aperto, "tutti i figli chiusi" diventa
  // vero sui figli rimasti: il padre chiude.
  deleteTask(database, b);
  assert.equal(getTask(database, padre).isCompleted, 1);
});

test("cancellare tutti i figli non chiude il padre: senza figli la regola non si applica", () => {
  const database = nuovoDatabase();
  const padre = crea(database, "Sprint");
  const solo = crea(database, "Unico task", padre);

  deleteTask(database, solo);
  assert.equal(getTask(database, padre).isCompleted, 0);
});

test("la cancellazione porta con sé tutto il sotto-albero", () => {
  const database = nuovoDatabase();
  const padre = crea(database, "Radice");
  const figlio = crea(database, "Ramo", padre);
  const nipote = crea(database, "Foglia", figlio);

  const esito = deleteTask(database, padre);
  assert.deepEqual(new Set(esito.cancellati), new Set([padre, figlio, nipote]));
  assert.ok(getTask(database, nipote).deletedAt);
});

test("il ripristino tecnico di un figlio aperto riapre il padre chiuso", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Sprint");
  const a = crea(database, "Task A", padre);
  const b = crea(database, "Task B", padre);
  setTaskState(database, a, s.fatto);
  deleteTask(database, b);
  assert.equal(getTask(database, padre).isCompleted, 1);

  const esito = restoreTaskTechnical(database, b, { statiRiapertura: { [padre]: s.inCorso } });
  assert.equal(esito.esito, "applicato");
  assert.equal(getTask(database, padre).isCompleted, 0);
});

test("la migrazione è bloccata se restano sotto-task aperti", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const padre = crea(database, "Progetto da spostare su Todoist");
  const figlio = crea(database, "Sotto-task aperto", padre);

  const bloccato = migrateTaskExternally(database, padre, s.migrato);
  assert.equal(bloccato.esito, "bloccato");
  assert.equal(bloccato.motivo, "sotto-task-aperti");
  assert.deepEqual(
    bloccato.tasks.map((t) => t.idTask),
    [figlio],
  );
  assert.equal(getTask(database, padre).isCompleted, 0);

  // Chiuso il figlio, la migrazione passa — e non tocca lo stato del figlio.
  setTaskState(database, figlio, s.fatto);
  const esito = migrateTaskExternally(database, padre, s.migrato);
  assert.equal(esito.esito, "applicato");
  assert.equal(getTask(database, padre).idState, s.migrato);
  assert.equal(getTask(database, figlio).idState, s.fatto);
});

test("progetto e milestone si ereditano e si propagano al sotto-albero", () => {
  const database = nuovoDatabase();
  const idProject = database.prepare("SELECT idProject FROM t_project ORDER BY position LIMIT 1").get().idProject;
  const idMilestone = database
    .prepare("SELECT idMilestone FROM t_milestone WHERE idProject = ? ORDER BY position LIMIT 1")
    .get(idProject).idMilestone;

  const padre = crea(database, "Radice");
  const figlio = crea(database, "Ramo", padre);
  const nipote = crea(database, "Foglia", figlio);

  setTaskProject(database, padre, idProject, idMilestone);
  for (const id of [padre, figlio, nipote]) {
    assert.equal(getTask(database, id).idProject, idProject);
    assert.equal(getTask(database, id).idMilestone, idMilestone);
  }

  // Un figlio non può avere un progetto proprio.
  assert.throws(() => setTaskProject(database, figlio, idProject), /task radice/);
});

test("una milestone di un altro progetto viene rifiutata", () => {
  const database = nuovoDatabase();
  const progetti = database.prepare("SELECT idProject FROM t_project ORDER BY position").all();
  const altraMilestone = database
    .prepare("SELECT idMilestone FROM t_milestone WHERE idProject = ? LIMIT 1")
    .get(progetti[1].idProject).idMilestone;

  const id = crea(database, "Task");
  assert.throws(
    () => setTaskProject(database, id, progetti[0].idProject, altraMilestone),
    /un altro progetto/,
  );
});

test("riparentare non può creare un ciclo", () => {
  const database = nuovoDatabase();
  const padre = crea(database, "Radice");
  const figlio = crea(database, "Ramo", padre);

  assert.throws(() => reparentTask(database, padre, figlio), /ciclico/);
  assert.throws(() => reparentTask(database, padre, padre), /sé stesso/);
});

test("riparentare allinea il progetto del sotto-albero al nuovo padre", () => {
  const database = nuovoDatabase();
  const idProject = database.prepare("SELECT idProject FROM t_project ORDER BY position LIMIT 1").get().idProject;

  const destinazione = crea(database, "Nuovo padre");
  setTaskProject(database, destinazione, idProject);

  const orfano = crea(database, "Task senza progetto");
  const suoFiglio = crea(database, "Sotto-task", orfano);
  assert.equal(getTask(database, orfano).idProject, null);

  reparentTask(database, orfano, destinazione);
  assert.equal(getTask(database, orfano).idProject, idProject);
  assert.equal(getTask(database, suoFiglio).idProject, idProject, "si propaga in profondità");
});

test("updateTask cambia i campi ordinari e rifiuta quelli con regole proprie", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Titolo iniziale");

  updateTask(database, id, { title: "Titolo nuovo", priority: "high", dueAt: "2026-09-30T10:00:00.000Z" });
  const task = getTask(database, id);
  assert.equal(task.title, "Titolo nuovo");
  assert.equal(task.priority, "high");
  assert.equal(task.dueAt, "2026-09-30T10:00:00.000Z");

  // Stato, progetto e padre hanno cascate: non passano di qui.
  assert.throws(() => updateTask(database, id, { idState: 2 }), /non modificabili/);
  assert.throws(() => updateTask(database, id, { idProject: "pr-casa" }), /non modificabili/);
  assert.throws(() => updateTask(database, id, { priority: "altissima" }), /Priorità non valida/);
});

test("il riordino rinumera le posizioni in un colpo solo", () => {
  const database = nuovoDatabase();
  const padre = crea(database, "Radice");
  const a = crea(database, "A", padre);
  const b = crea(database, "B", padre);
  const c = crea(database, "C", padre);

  reorderTasks(database, padre, [c, a, b]);
  const posizioni = listTasks(database)
    .filter((t) => t.idParentTask === padre)
    .sort((x, y) => x.position - y.position)
    .map((t) => t.title);
  assert.deepEqual(posizioni, ["C", "A", "B"]);
});

test("il riordino rifiuta task che non appartengono a quella lista", () => {
  const database = nuovoDatabase();
  const padre = crea(database, "Radice");
  const figlio = crea(database, "Figlio", padre);
  const estraneo = crea(database, "Estraneo");

  assert.throws(() => reorderTasks(database, padre, [figlio, estraneo]), /non sono figli/);
  assert.throws(() => reorderRootTasks(database, [estraneo, figlio]), /non sono di primo livello/);
});

test("listTasks porta con sé stato, progetto e conteggio dei figli", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const idProject = database.prepare("SELECT idProject FROM t_project ORDER BY position LIMIT 1").get().idProject;

  const padre = crea(database, "Radice");
  setTaskProject(database, padre, idProject);
  const a = crea(database, "Figlio chiuso", padre);
  crea(database, "Figlio aperto", padre);
  setTaskState(database, a, s.fatto);

  const riga = listTasks(database).find((t) => t.idTask === padre);
  assert.equal(riga.stateLabel, "Nuovo");
  assert.equal(riga.isStartState, 1);
  assert.ok(riga.projectName);
  assert.equal(riga.childCount, 2);
  assert.equal(riga.childDoneCount, 1);

  // I cancellati non compaiono, salvo chiederlo.
  deleteTask(database, a);
  assert.equal(listTasks(database).some((t) => t.idTask === a), false);
  assert.equal(listTasks(database, { includeDeleted: true }).some((t) => t.idTask === a), true);
});

test("ogni cambio di stato lascia una traccia nello storico", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const id = crea(database, "Task");
  setTaskState(database, id, s.inCorso);
  setTaskState(database, id, s.fatto);

  const righe = database
    .prepare("SELECT field, oldValue, newValue FROM t_task_history WHERE idTask = ? ORDER BY changedAt")
    .all(id);
  assert.equal(righe.length, 2);
  assert.equal(righe[0].field, "idState");
  assert.equal(righe[1].newValue, String(s.fatto));
});
