import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/core/database.js";
import {
  createMilestone,
  createProject,
  createState,
  createTask,
  deleteMilestone,
  deleteProject,
  deleteState,
  deleteTask,
  getTask,
  listMilestones,
  listProjects,
  listStates,
  listTasks,
  migrateTaskExternally,
  reorderRootTasks,
  reorderStates,
  reorderTasks,
  reparentTask,
  restoreTaskTechnical,
  setTaskInbox,
  setTaskProject,
  setTaskState,
  updateMilestone,
  updateProject,
  updateState,
  updateTask,
  addTaskComment,
  addTaskTag,
  listTaskComments,
  listTaskTags,
  listNotifiche,
  listTags,
  svuotaNotifiche,
  creaNotifica,
  segnaNotificheLette,
  removeTaskComment,
  removeTaskTag,
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

test("il tag e un vocabolario condiviso: due task che scrivono la stessa etichetta puntano alla stessa riga", () => {
  const database = nuovoDatabase();
  const primo = crea(database, "Primo");
  const secondo = crea(database, "Secondo");

  const a = addTaskTag(database, primo, "urgente");
  /* Con spazi intorno: l'etichetta va ripulita, altrimenti nascerebbe un
     secondo tag identico a vedersi e diverso a database. */
  const b = addTaskTag(database, secondo, "  urgente  ");

  assert.equal(a.idTag, b.idTag);
  assert.equal(listTags(database).length, 1);
  assert.equal(listTaskTags(database, primo)[0].label, "urgente");
  assert.equal(listTaskTags(database, secondo)[0].label, "urgente");
});

test("aggiungere due volte lo stesso tag allo stesso task non lo duplica", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task");
  addTaskTag(database, id, "q3");
  addTaskTag(database, id, "q3");
  assert.equal(listTaskTags(database, id).length, 1);
});

test("togliere un tag da un task lascia l'etichetta nel vocabolario", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task");
  const { idTag } = addTaskTag(database, id, "casa");
  removeTaskTag(database, id, idTag);

  assert.equal(listTaskTags(database, id).length, 0);
  assert.equal(listTags(database).length, 1, "il tag resta disponibile per essere riusato");
});

test("un tag vuoto e rifiutato", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task");
  assert.throws(() => addTaskTag(database, id, "   "), /vuoto/);
});

test("i tag e i commenti seguono il task cancellato", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task");
  addTaskTag(database, id, "temporaneo");
  addTaskComment(database, id, "una nota");

  /* Cancellazione tecnica vera, non il deletedAt logico: qui si verifica la
     cascata dichiarata a schema (ON DELETE CASCADE). */
  database.prepare("DELETE FROM t_task WHERE idTask = ?").run(id);

  assert.equal(listTaskTags(database, id).length, 0);
  assert.equal(listTaskComments(database, id).length, 0);
});

test("i commenti si leggono in ordine di scrittura e restano fuori dallo storico", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const id = crea(database, "Task");

  addTaskComment(database, id, "prima nota");
  addTaskComment(database, id, "seconda nota");
  setTaskState(database, id, s.inCorso);

  const commenti = listTaskComments(database, id);
  assert.equal(commenti.length, 2);
  assert.equal(commenti[0].body, "prima nota");
  assert.equal(commenti[1].body, "seconda nota");

  /* Lo storico registra il cambio di stato e nient'altro: i commenti sono una
     sorgente separata, e il dettaglio li unisce solo a schermo. */
  const storico = database
    .prepare("SELECT field FROM t_task_history WHERE idTask = ?")
    .all(id);
  assert.equal(storico.length, 1);
  assert.equal(storico[0].field, "idState");
});

test("un commento si puo togliere, e uno vuoto e rifiutato", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task");
  const { idTaskComment } = addTaskComment(database, id, "da rimuovere");
  removeTaskComment(database, idTaskComment);
  assert.equal(listTaskComments(database, id).length, 0);

  assert.throws(() => addTaskComment(database, id, ""), /vuoto/);
});

test("tag e commenti su un task inesistente sono rifiutati", () => {
  const database = nuovoDatabase();
  assert.throws(() => addTaskTag(database, "non-esiste", "x"), /inesistente/);
  assert.throws(() => addTaskComment(database, "non-esiste", "x"), /inesistente/);
});

test("un task di primo livello nasce da smistare, un sotto-task no", () => {
  const database = nuovoDatabase();
  const padre = crea(database, "Padre");
  const figlio = crea(database, "Figlio", padre);

  assert.equal(getTask(database, padre).isInbox, 1);
  assert.equal(
    getTask(database, figlio).isInbox,
    0,
    "un sotto-task si scrive dentro lavoro gia organizzato: non va in triage",
  );
});

test("isInbox si puo imporre alla creazione, scavalcando le regole di default", () => {
  const database = nuovoDatabase();
  const esito = createTask(database, { title: "Gia smistata", isInbox: false });
  assert.equal(getTask(database, esito.idTask).isInbox, 0);
});

test("smistare non tocca progetto, date ne stato: e il punto della decisione", () => {
  const database = nuovoDatabase();
  const s = stati(database);
  const id = crea(database, "Task");
  const progetto = database.prepare("SELECT idProject FROM t_project LIMIT 1").get().idProject;

  setTaskProject(database, id, progetto);
  updateTask(database, id, { dueAt: "2026-10-01T09:00:00.000Z" });
  setTaskState(database, id, s.inCorso);

  /* Con un progetto, una data e uno stato avanzato, il task e ancora in
     triage: e cio che la condizione derivata "senza progetto" non permetteva. */
  assert.equal(getTask(database, id).isInbox, 1);

  setTaskInbox(database, id, false);
  const dopo = getTask(database, id);
  assert.equal(dopo.isInbox, 0);
  assert.equal(dopo.idProject, progetto, "il progetto resta");
  assert.equal(dopo.dueAt, "2026-10-01T09:00:00.000Z", "la data resta");
  assert.equal(dopo.idState, s.inCorso, "lo stato resta");
});

test("smistare due volte nello stesso senso non scrive niente", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task");
  setTaskInbox(database, id, false);
  const esito = setTaskInbox(database, id, false);
  assert.deepEqual(esito, { esito: "applicato", cambi: [] });

  const righe = database
    .prepare("SELECT field FROM t_task_history WHERE idTask = ? AND field = 'isInbox'")
    .all(id);
  assert.equal(righe.length, 1, "una sola traccia, non due");
});

test("l'uscita dal triage lascia una traccia nello storico", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task");
  setTaskInbox(database, id, false);

  const riga = database
    .prepare("SELECT oldValue, newValue FROM t_task_history WHERE idTask = ? AND field = 'isInbox'")
    .get(id);
  assert.equal(riga.oldValue, "1");
  assert.equal(riga.newValue, "0");
});

test("isInbox accetta solo 0 e 1, imposto dallo schema", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task");
  assert.throws(
    () => database.prepare("UPDATE t_task SET isInbox = 7 WHERE idTask = ?").run(id),
    /CHECK/,
  );
});

test("listTasks porta con se il flag di triage", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task");
  setTaskInbox(database, id, false);
  assert.equal(listTasks(database).find((t) => t.idTask === id).isInbox, 0);
});

/* ───────────────── origini: non sono task ─────────────────

   Qui stava la sezione di `isNew`, la campanella delle origini, insieme a
   `markOriginsSeen` che la spegneva. Tolte entrambe con lo schema 10.

   Il motivo non e' una semplificazione: e' che le origini hanno smesso di
   essere task. Vivono nel servizio (`api/`), Alia ci si affaccia, e il badge
   conta l'arretrato — quante ne restano da processare — invece degli arrivi
   recenti. "Arrivata ma non ancora guardata" era un gradino fra l'arrivo e la
   decisione, cioe' proprio lo stallo che il modello esiste per impedire: o
   entra nel sistema o viene rifiutata (vedi § Flussi, "Vita di un'origine"). */

test("la sorgente non cambia come nasce un task: e' un task come gli altri", () => {
  const database = nuovoDatabase();
  const manuale = crea(database, "Scritta da me");
  const daOrigine = createTask(database, { title: "Accettata da Telegram", sourceType: "telegram" }).idTask;

  /* Tutti e due in triage, tutti e due di primo livello: l'unica differenza e'
     la provenienza, che si conserva per poter risalire al messaggio — non per
     cambiare il comportamento. */
  assert.equal(getTask(database, manuale).isInbox, 1);
  assert.equal(getTask(database, daOrigine).isInbox, 1);
  assert.equal(getTask(database, daOrigine).sourceType, "telegram");
});

/* ──────────────── configurazione degli stati (DEF_Impostazioni) ────────────────

   La fila ha i due capi fissi: primo l'apertura, ultima la chiusura. In mezzo
   passaggi liberi, ognuno conclusivo o no. I test qui sotto sono soprattutto
   sui capi, perché è lì che stanno le regole. */

function fila(database) {
  return listStates(database).map((s) => ({
    label: s.label,
    ruolo: s.isStartState ? "apertura" : s.isEndState ? "conclusivo" : "passaggio",
    ordine: s.stepOrder,
  }));
}

function statoPerId(database, idState) {
  return listStates(database).find((s) => s.idState === idState);
}

function capi(database) {
  const stati = listStates(database);
  return { apertura: stati[0], chiusura: stati[stati.length - 1], mezzo: stati.slice(1, -1) };
}

test("un passaggio nuovo nasce prima della chiusura, non in fondo", () => {
  const database = nuovoDatabase();
  const codaPrima = capi(database).chiusura.label;

  const esito = createState(database, { label: "In revisione" });
  assert.equal(esito.esito, "applicato");

  const dopo = fila(database);
  assert.equal(dopo[dopo.length - 1].label, codaPrima, "la chiusura resta l'ultima");
  assert.equal(dopo[dopo.length - 2].label, "In revisione", "il nuovo si infila prima di lei");
  assert.equal(dopo[dopo.length - 2].ruolo, "passaggio", "e nasce non conclusivo");
  assert.deepEqual(dopo.map((s) => s.ordine), dopo.map((_, i) => i + 1), "le posizioni restano una fila");
});

test("l'etichetta non puo essere vuota ne ripetuta", () => {
  const database = nuovoDatabase();
  assert.throws(() => createState(database, { label: "   " }), /vuota/);
  assert.throws(() => createState(database, { label: listStates(database)[0].label }), /Esiste gia/);
});

test("i due capi si possono rinominare, e restano quello che sono", () => {
  const database = nuovoDatabase();
  const { apertura, chiusura } = capi(database);

  updateState(database, apertura.idState, { label: "Arrivata" });
  updateState(database, chiusura.idState, { label: "Chiusa per sempre" });

  const dopo = capi(database);
  assert.equal(dopo.apertura.label, "Arrivata");
  assert.equal(dopo.apertura.isStartState, 1);
  assert.equal(dopo.chiusura.label, "Chiusa per sempre");
  assert.equal(dopo.chiusura.isEndState, 1);
});

test("l'apertura non conta come conclusa, e la chiusura non smette di esserlo", () => {
  const database = nuovoDatabase();
  const { apertura, chiusura } = capi(database);
  assert.throws(() => updateState(database, apertura.idState, { isEnd: true }), /apertura/);
  assert.throws(() => updateState(database, chiusura.idState, { isEnd: false }), /chiusura/);
});

test("un passaggio di mezzo puo diventare una chiusura secondaria, e tornare indietro", () => {
  const database = nuovoDatabase();
  const passaggio = createState(database, { label: "Sospeso" });

  updateState(database, passaggio.idState, { isEnd: true });
  assert.equal(statoPerId(database, passaggio.idState).isEndState, 1);

  updateState(database, passaggio.idState, { isEnd: false });
  assert.equal(statoPerId(database, passaggio.idState).isEndState, 0);
});

test("accendere la conclusivita riallinea isCompleted dei task su quello stato", () => {
  const database = nuovoDatabase();
  const passaggio = createState(database, { label: "Consegnato" });
  const id = crea(database, "Task");
  setTaskState(database, id, passaggio.idState, { sovrascriviFigliChiusi: true });
  assert.equal(getTask(database, id).isCompleted, 0);

  /* Il task non si muove: si muove il terreno sotto di lui. I trigger dello
     schema non scattano, quindi deve pensarci il core. */
  const esito = updateState(database, passaggio.idState, { isEnd: true });
  assert.equal(getTask(database, id).isCompleted, 1);
  assert.ok(esito.avvisi.some((a) => a.includes("1 task")));

  updateState(database, passaggio.idState, { isEnd: false });
  assert.equal(getTask(database, id).isCompleted, 0, "e torna indietro insieme a lui");
});

test("il riordino vuole l'elenco completo e senza ripetizioni", () => {
  const database = nuovoDatabase();
  const ids = listStates(database).map((s) => s.idState);
  assert.throws(() => reorderStates(database, ids.slice(1)), /completo/);
  assert.throws(() => reorderStates(database, [ids[0], ids[0], ...ids.slice(1)]), /completo/);
});

test("il riordino non sposta i due capi", () => {
  const database = nuovoDatabase();
  createState(database, { label: "Passaggio" });
  const ids = listStates(database).map((s) => s.idState);

  assert.throws(() => reorderStates(database, [...ids].reverse()), /apertura/);
  /* Apertura al suo posto ma chiusura spostata di un gradino indietro. */
  const chiusuraInMezzo = [ids[0], ids[ids.length - 1], ...ids.slice(1, -1)];
  assert.throws(() => reorderStates(database, chiusuraInMezzo), /chiusura/);
});

test("i passaggi in mezzo si riordinano fra loro", () => {
  const database = nuovoDatabase();
  const a = createState(database, { label: "Primo passaggio" });
  const b = createState(database, { label: "Secondo passaggio" });
  const ids = listStates(database).map((s) => s.idState);

  const scambiati = [...ids];
  const i = scambiati.indexOf(a.idState);
  const j = scambiati.indexOf(b.idState);
  [scambiati[i], scambiati[j]] = [scambiati[j], scambiati[i]];

  const esito = reorderStates(database, scambiati);
  assert.equal(esito.esito, "applicato");
  assert.deepEqual(listStates(database).map((s) => s.idState), scambiati);
  assert.deepEqual(listStates(database).map((s) => s.stepOrder), scambiati.map((_, k) => k + 1));
});

test("l'atterraggio dei padri chiusi per cascata e sempre la chiusura finale", () => {
  const database = nuovoDatabase();
  const secondaria = createState(database, { label: "Congelato" });
  updateState(database, secondaria.idState, { isEnd: true });

  /* Con i capi fissi c'e una sola risposta possibile: l'ultimo isEndState per
     stepOrder e per costruzione la chiusura finale, anche con delle chiusure
     secondarie in mezzo. */
  const conclusivi = listStates(database).filter((s) => s.isEndState === 1);
  assert.ok(conclusivi.length > 1, "ci sono chiusure secondarie in scena");
  assert.equal(conclusivi[conclusivi.length - 1].idState, capi(database).chiusura.idState);
});

test("i due capi non si cancellano", () => {
  const database = nuovoDatabase();
  const { apertura, chiusura } = capi(database);
  assert.throws(() => deleteState(database, apertura.idState), /apertura/);
  assert.throws(() => deleteState(database, chiusura.idState), /chiusura/);
});

test("cancellare un passaggio non in uso non chiede niente e richiude la fila", () => {
  const database = nuovoDatabase();
  const passaggio = createState(database, { label: "Mai usato" });

  const esito = deleteState(database, passaggio.idState);
  assert.equal(esito.esito, "applicato");
  assert.ok(!listStates(database).some((s) => s.idState === passaggio.idState));
  const dopo = fila(database);
  assert.deepEqual(dopo.map((s) => s.ordine), dopo.map((_, i) => i + 1), "niente buchi in stepOrder");
});

test("cancellare uno stato in uso chiede dove spostare i task", () => {
  const database = nuovoDatabase();
  const passaggio = createState(database, { label: "In pausa" });
  const id = crea(database, "Task");
  setTaskState(database, id, passaggio.idState, { sovrascriviFigliChiusi: true });

  const domanda = deleteState(database, passaggio.idState);
  assert.equal(domanda.esito, "conferma");
  assert.equal(domanda.richiesta.tipo, "stato-in-uso");
  assert.equal(domanda.richiesta.tasks, 1);
  assert.ok(
    !domanda.richiesta.destinazioni.some((d) => d.idState === passaggio.idState),
    "non propone di spostarli su se stesso",
  );
  assert.ok(listStates(database).some((s) => s.idState === passaggio.idState), "non ha cancellato niente");

  const destinazione = domanda.richiesta.destinazioni[0].idState;
  const esito = deleteState(database, passaggio.idState, { idStateDestinazione: destinazione });
  assert.equal(esito.esito, "applicato");
  assert.equal(getTask(database, id).idState, destinazione);
  assert.ok(!listStates(database).some((s) => s.idState === passaggio.idState));
});

test("spostare i task per cancellare uno stato passa dallo storico", () => {
  const database = nuovoDatabase();
  const passaggio = createState(database, { label: "In pausa" });
  const id = crea(database, "Task");
  setTaskState(database, id, passaggio.idState, { sovrascriviFigliChiusi: true });

  const destinazione = listStates(database).find((s) => s.idState !== passaggio.idState).idState;
  deleteState(database, passaggio.idState, { idStateDestinazione: destinazione });

  /* Si cerca la riga, non l'ultima riga: `idTaskHistory` e un UUID casuale,
     quindi ordinarci sopra darebbe un ordine arbitrario, e `changedAt` puo
     pareggiare fra due scritture nello stesso millisecondo. */
  const riga = database
    .prepare(
      "SELECT oldValue, newValue FROM t_task_history WHERE idTask = ? AND field = 'idState' AND oldValue = ? AND newValue = ?",
    )
    .get(id, String(passaggio.idState), String(destinazione));
  assert.ok(riga, "lo spostamento forzato dalla cancellazione e tracciato come gli altri");
});

/* ──────────────────── progetti e milestone (Impostazioni) ──────────────────── */

const BLU = "var(--color-sky-400)";

function progettoPerId(database, idProject) {
  return listProjects(database).find((p) => p.idProject === idProject);
}

test("un progetto nasce con nome, colore e posizione in fondo", () => {
  const database = nuovoDatabase();
  const quanti = listProjects(database).length;
  const esito = createProject(database, { name: "Casa nuova", color: BLU });

  assert.equal(esito.esito, "applicato");
  const creato = progettoPerId(database, esito.idProject);
  assert.equal(creato.name, "Casa nuova");
  assert.equal(creato.color, BLU);
  assert.equal(creato.position, quanti);
});

test("il nome di un progetto non puo essere vuoto ne ripetuto, e il colore serve", () => {
  const database = nuovoDatabase();
  createProject(database, { name: "Unico", color: BLU });
  assert.throws(() => createProject(database, { name: "  ", color: BLU }), /vuoto/);
  assert.throws(() => createProject(database, { name: "Unico", color: BLU }), /Esiste gia/);
  assert.throws(() => createProject(database, { name: "Senza colore" }), /colore/);
});

test("nome e colore si cambiano, uno per volta o insieme", () => {
  const database = nuovoDatabase();
  const { idProject } = createProject(database, { name: "Prima", color: BLU });

  const solo = updateProject(database, idProject, { color: "var(--color-rose-400)" });
  assert.deepEqual(solo.cambi, ["color"]);

  updateProject(database, idProject, { name: "Dopo" });
  const dopo = progettoPerId(database, idProject);
  assert.equal(dopo.name, "Dopo");
  assert.equal(dopo.color, "var(--color-rose-400)");
});

test("cancellare un progetto vuoto non chiede niente", () => {
  const database = nuovoDatabase();
  const { idProject } = createProject(database, { name: "Mai usato", color: BLU });
  const esito = deleteProject(database, idProject);

  assert.equal(esito.esito, "applicato");
  assert.ok(!progettoPerId(database, idProject));
});

test("cancellare un progetto con task chiede dove mandarle", () => {
  const database = nuovoDatabase();
  const { idProject } = createProject(database, { name: "Con roba dentro", color: BLU });
  const id = crea(database, "Task");
  setTaskProject(database, id, idProject);

  const domanda = deleteProject(database, idProject);
  assert.equal(domanda.esito, "conferma");
  assert.equal(domanda.richiesta.tipo, "progetto-in-uso");
  assert.equal(domanda.richiesta.tasks, 1);
  assert.ok(
    !domanda.richiesta.destinazioni.some((d) => d.idProject === idProject),
    "non propone di spostarle su se stesso",
  );
  assert.ok(progettoPerId(database, idProject), "non ha cancellato niente");

  const esito = deleteProject(database, idProject, { destinazione: "nessuno" });
  assert.equal(esito.esito, "applicato");
  assert.equal(getTask(database, id).idProject, null);
  assert.ok(!progettoPerId(database, idProject));
});

test("le task si possono spostare su un altro progetto invece che toglierle", () => {
  const database = nuovoDatabase();
  const a = createProject(database, { name: "Da chiudere", color: BLU });
  const b = createProject(database, { name: "Dove finiscono", color: BLU + "x" });
  const id = crea(database, "Task");
  setTaskProject(database, id, a.idProject);

  deleteProject(database, a.idProject, { destinazione: b.idProject });
  assert.equal(getTask(database, id).idProject, b.idProject);
});

test("cancellando un progetto i sotto-task seguono il padre", () => {
  const database = nuovoDatabase();
  const { idProject } = createProject(database, { name: "Con figli", color: BLU });
  const padre = crea(database, "Padre");
  const figlio = crea(database, "Figlio", padre);
  setTaskProject(database, padre, idProject);
  assert.equal(getTask(database, figlio).idProject, idProject, "il figlio eredita");

  deleteProject(database, idProject, { destinazione: "nessuno" });
  assert.equal(getTask(database, figlio).idProject, null, "e segue anche all'uscita");
});

test("una milestone vive dentro il suo progetto, e due progetti possono avere la stessa fase", () => {
  const database = nuovoDatabase();
  const a = createProject(database, { name: "Progetto A", color: BLU });
  const b = createProject(database, { name: "Progetto B", color: BLU });

  createMilestone(database, { idProject: a.idProject, label: "Analisi" });
  const gemella = createMilestone(database, { idProject: b.idProject, label: "Analisi" });
  assert.equal(gemella.esito, "applicato", "l'etichetta e unica dentro il progetto, non nel database");

  assert.throws(
    () => createMilestone(database, { idProject: a.idProject, label: "Analisi" }),
    /gia una fase/,
  );
  assert.throws(() => createMilestone(database, { idProject: a.idProject, label: " " }), /vuota/);
});

test("le fasi si rinominano e si contano per progetto", () => {
  const database = nuovoDatabase();
  const { idProject } = createProject(database, { name: "Progetto", color: BLU });
  const uno = createMilestone(database, { idProject, label: "Analisi" });
  createMilestone(database, { idProject, label: "Sviluppo" });

  updateMilestone(database, uno.idMilestone, { label: "Studio" });
  const fasi = listMilestones(database, idProject);
  assert.deepEqual(fasi.map((m) => m.label), ["Studio", "Sviluppo"]);
  assert.deepEqual(fasi.map((m) => m.position), [0, 1]);
});

test("cancellare una fase non chiede niente: le task restano nel progetto", () => {
  const database = nuovoDatabase();
  const { idProject } = createProject(database, { name: "Progetto", color: BLU });
  const fase = createMilestone(database, { idProject, label: "Analisi" });
  const id = crea(database, "Task");
  setTaskProject(database, id, idProject, fase.idMilestone);
  assert.equal(getTask(database, id).idMilestone, fase.idMilestone);

  const esito = deleteMilestone(database, fase.idMilestone);
  assert.equal(esito.esito, "applicato");
  assert.ok(esito.avvisi.some((a) => a.includes("1 task")));

  const dopo = getTask(database, id);
  assert.equal(dopo.idMilestone, null, "perde la fase");
  assert.equal(dopo.idProject, idProject, "resta nel progetto");
});

test("cancellare un progetto porta via le sue fasi, e le task non si rompono", () => {
  const database = nuovoDatabase();
  const { idProject } = createProject(database, { name: "Progetto", color: BLU });
  const fase = createMilestone(database, { idProject, label: "Analisi" });
  const id = crea(database, "Task");
  setTaskProject(database, id, idProject, fase.idMilestone);

  /* Il caso che romperebbe il vincolo se lo spostamento non azzerasse anche
     `idMilestone`: t_milestone se ne va per cascata, ma t_task.idMilestone non
     ha cascata e resterebbe appeso al vuoto. */
  const esito = deleteProject(database, idProject, { destinazione: "nessuno" });
  assert.equal(esito.esito, "applicato");
  assert.equal(listMilestones(database).filter((m) => m.idProject === idProject).length, 0);

  const dopo = getTask(database, id);
  assert.equal(dopo.idProject, null);
  assert.equal(dopo.idMilestone, null);
});

test("listTasks porta con se le etichette dei tag, concatenate", () => {
  const database = nuovoDatabase();
  const id = crea(database, "Task con tag");
  const senza = crea(database, "Task senza tag");
  addTaskTag(database, id, "urgente");
  addTaskTag(database, id, "da rivedere, forse");

  const righe = listTasks(database);
  const conTag = righe.find((t) => t.idTask === id);
  /* Il separatore e il carattere 31: le etichette sono testo scritto da una
     persona e possono contenere virgole — questa ce l'ha apposta. */
  assert.deepEqual(conTag.tagLabels.split("\u001f").sort(), ["da rivedere, forse", "urgente"]);
  assert.equal(righe.find((t) => t.idTask === senza).tagLabels, null);
});

/* ── Le notifiche: il registro di quello che Alia ha detto ────────────────── */

test("una notifica si registra, si conta e si segna letta", () => {
  const database = nuovoDatabase();

  assert.deepEqual(listNotifiche(database), { notifiche: [], nonLette: 0 });

  const prima = creaNotifica(database, { tipo: "promemoria", titolo: "Chiamare l'idraulico", corpo: "Era per le 09:00" });
  assert.equal(prima.esito, "applicato");
  creaNotifica(database, { tipo: "origine", titolo: "Idea dal canale #progetti", corpo: "Arrivata da discord" });

  const elenco = listNotifiche(database);
  assert.equal(elenco.nonLette, 2);
  /* La piu' recente per prima: la campanella si legge dall'alto. */
  assert.equal(elenco.notifiche[0].titolo, "Idea dal canale #progetti");
  assert.equal(elenco.notifiche[0].tipo, "origine");

  assert.equal(segnaNotificheLette(database).quante, 2);
  assert.equal(listNotifiche(database).nonLette, 0);
  /* Segnarle due volte non le conta due volte. */
  assert.equal(segnaNotificheLette(database).quante, 0);
});

test("una notifica senza titolo non si registra", () => {
  const database = nuovoDatabase();
  assert.equal(creaNotifica(database, { tipo: "promemoria", titolo: "   " }).esito, "titolo-mancante");
  assert.equal(listNotifiche(database).nonLette, 0);
});

/* Il titolo e' copiato al momento in cui suona: una notifica e' un fatto
   accaduto, e se la task cambia nome il registro non si riscrive da solo. */
test("il registro non segue i cambi di nome della task", () => {
  const database = nuovoDatabase();
  const idTask = crea(database, "Pagare la bolletta");
  creaNotifica(database, { tipo: "promemoria", titolo: "Pagare la bolletta", idTask });
  updateTask(database, idTask, { title: "Pagare la bolletta del gas" });

  const [n] = listNotifiche(database).notifiche;
  assert.equal(n.titolo, "Pagare la bolletta", "il registro dice quello che aveva detto");
  assert.equal(n.titoloTask, "Pagare la bolletta del gas", "e sa anche come si chiama adesso");
});

test("svuotare il registro lo svuota davvero, lette e non lette", () => {
  const database = nuovoDatabase();
  creaNotifica(database, { tipo: "promemoria", titolo: "Una" });
  creaNotifica(database, { tipo: "origine", titolo: "Due" });
  segnaNotificheLette(database, null);
  creaNotifica(database, { tipo: "promemoria", titolo: "Tre, non letta" });

  assert.equal(svuotaNotifiche(database).quante, 3, "anche la non letta");
  assert.deepEqual(listNotifiche(database), { notifiche: [], nonLette: 0 });
  /* Svuotare un registro gia' vuoto non e' un errore: e' zero righe tolte. */
  assert.equal(svuotaNotifiche(database).quante, 0);
});
