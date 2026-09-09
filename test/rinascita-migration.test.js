/* La migrazione dallo schema vecchio a quello "Rinascita".

   Il modo onesto di provarla è un aggiornamento vero: un database pieno di
   dati alla versione 6, riaperto con il codice nuovo. Qui si costruisce
   esattamente quello — si crea il database con il core vecchio, si riportano
   indietro le tabelle t_* e `user_version` come se non fossero mai esistite, e
   si riapre. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { openDatabase } from "../src/core/database.js";
import { listStates } from "../src/core/task-core.js";

/* Il database di partenza si costruisce scrivendo direttamente sulle tabelle
   vecchie, non passando da un core: quello che sapeva scriverle non esiste più.
   Le *migrazioni* 1→6 invece restano in database.js — sono la strada che un
   database installato deve percorrere — quindi aprire il file le crea comunque,
   e qui basta riempirle e riportare `user_version` indietro. */
function databaseAllaVersione6(popola) {
  const cartella = mkdtempSync(join(tmpdir(), "alia-migrazione-"));
  const percorso = join(cartella, "alia.sqlite");

  // La prima apertura costruisce tutto lo schema, vecchio e nuovo.
  openDatabase(percorso).close();

  const grezzo = new DatabaseSync(percorso);
  grezzo.exec("PRAGMA foreign_keys = ON");
  for (const tabella of [
    "t_attachment", "t_task_tag", "t_tag", "t_task_comment", "t_task_history",
    "t_task", "t_milestone", "t_project", "t_state",
  ]) {
    grezzo.exec(`DROP TABLE IF EXISTS ${tabella}`);
  }
  popola(scrittoreV6(grezzo));
  grezzo.exec("PRAGMA user_version = 6");
  grezzo.close();

  return { percorso, cartella };
}

/* Il minimo per riempire lo schema vecchio: quanto basta ai casi provati qui,
   senza reintrodurre un core che è stato rimosso apposta. */
function scrittoreV6(db) {
  const now = new Date().toISOString();
  let n = 0;
  const prossimoId = (prefisso) => `${prefisso}-${++n}`;

  return {
    creaItem({ title, status = "inbox", priority = "none", project = null, list = null, tags = [] }) {
      const id = prossimoId("it");
      db.prepare(`
        INSERT INTO items (
          id, title, description, status, priority, original_content,
          content_generated_by_ai, source_type, tags, project, list, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, 0, 'manual', ?, ?, ?, ?, ?)
      `).run(id, title, status, priority, title, JSON.stringify(tags), project, list, now, now);
      return id;
    },
    creaSubtask(itemId, title, done = 0) {
      const id = prossimoId("st");
      const position = db
        .prepare("SELECT COUNT(*) AS c FROM subtasks WHERE item_id = ?")
        .get(itemId).c;
      db.prepare(
        "INSERT INTO subtasks (id, item_id, title, done, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(id, itemId, title, done, position, now);
      return id;
    },
    creaStato(key, label, type) {
      const position = db.prepare("SELECT COUNT(*) AS c FROM statuses").get().c;
      db.prepare(
        "INSERT INTO statuses (id, key, label, type, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(prossimoId("sta"), key, label, type, position, now);
    },
  };
}

/* Su Windows la cartella resta bloccata per un momento dopo la chiusura del
   database, e non è quello che questi test devono verificare: se la pulizia
   non riesce, il temporaneo resta al sistema operativo e il test va avanti. */
function pulisci(cartella) {
  try {
    rmSync(cartella, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    /* temporaneo ancora bloccato: irrilevante per l'esito del test */
  }
}

test("un database alla versione 6 migra al modello nuovo conservando i dati", () => {
  const { percorso, cartella } = databaseAllaVersione6((v6) => {
    const item = v6.creaItem({
      title: "Chiamare il commercialista",
      priority: "high",
      project: "Lavoro",
      list: "Amministrazione",
      tags: ["fisco", "urgente"],
    });
    v6.creaSubtask(item, "Raccogliere le fatture");
    v6.creaSubtask(item, "Inviare la mail");

    v6.creaItem({ title: "Task chiuso", status: "completed" });
  });

  try {
    const database = openDatabase(percorso);

    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 7);

    // Gli stati: il database aveva quelli di fabbrica, quindi vale il seed nuovo.
    const etichette = listStates(database).map((s) => s.label);
    assert.deepEqual(etichette, ["Nuovo", "In corso", "Migrato", "Archiviato", "Fatto"]);

    const task = database
      .prepare("SELECT * FROM t_task WHERE title = ?")
      .get("Chiamare il commercialista");
    assert.ok(task, "il task non e' stato migrato");
    assert.equal(task.priority, "high");
    assert.equal(task.idParentTask, null);
    assert.equal(task.isCompleted, 0);

    // Il progetto e' diventato una riga di t_project, la lista una milestone.
    const progetto = database.prepare("SELECT * FROM t_project WHERE idProject = ?").get(task.idProject);
    assert.equal(progetto.name, "Lavoro");
    const milestone = database
      .prepare("SELECT * FROM t_milestone WHERE idMilestone = ?")
      .get(task.idMilestone);
    assert.equal(milestone.label, "Amministrazione");
    assert.equal(milestone.idProject, progetto.idProject);

    // I sotto-task sono diventati task veri, figli, con progetto e milestone
    // ereditati dal padre.
    const figli = database
      .prepare("SELECT * FROM t_task WHERE idParentTask = ? ORDER BY position")
      .all(task.idTask);
    assert.deepEqual(
      figli.map((f) => f.title),
      ["Raccogliere le fatture", "Inviare la mail"],
    );
    for (const figlio of figli) {
      assert.equal(figlio.idProject, task.idProject);
      assert.equal(figlio.idMilestone, task.idMilestone);
      assert.equal(figlio.isCompleted, 0);
    }

    // I tag, che erano una stringa JSON su items, sono diventati righe.
    const tag = database
      .prepare(`
        SELECT g.label FROM t_task_tag tt JOIN t_tag g ON g.idTag = tt.idTag
         WHERE tt.idTask = ? ORDER BY g.label
      `)
      .all(task.idTask)
      .map((r) => r.label);
    assert.deepEqual(tag, ["fisco", "urgente"]);

    // Lo stato "completed" del vecchio schema arriva su "Fatto", e isCompleted
    // viene ricalcolato, non copiato.
    const completato = database.prepare("SELECT * FROM t_task WHERE title = ?").get("Task chiuso");
    const idFatto = listStates(database).find((s) => s.label === "Fatto").idState;
    assert.equal(completato.idState, idFatto);
    assert.equal(completato.isCompleted, 1);

    database.close();
  } finally {
    pulisci(cartella);
  }
});

test("la migrazione e' idempotente: riaprire il database non la ripete", () => {
  const { percorso, cartella } = databaseAllaVersione6((v6) => {
    v6.creaItem({ title: "Unico task" });
  });

  try {
    const prima = openDatabase(percorso);
    const conteggio = prima.prepare("SELECT COUNT(*) AS c FROM t_task").get().c;
    prima.close();

    const dopo = openDatabase(percorso);
    assert.equal(dopo.prepare("SELECT COUNT(*) AS c FROM t_task").get().c, conteggio);
    dopo.close();
  } finally {
    pulisci(cartella);
  }
});

test("gli stati configurati dall'utente sopravvivono alla migrazione", () => {
  const { percorso, cartella } = databaseAllaVersione6((v6) => {
    v6.creaStato("bloccato", "Bloccato", "in_corso");
    v6.creaItem({ title: "Task fermo" });
  });

  try {
    const database = openDatabase(percorso);
    const etichette = listStates(database).map((s) => s.label);

    // La configurazione dell'utente vince sul seed: il core non gli riscrive
    // gli stati sotto i piedi.
    assert.ok(etichette.includes("Bloccato"), `stati migrati: ${etichette.join(", ")}`);
    assert.ok(etichette.includes("Da fare"));

    // Gli invarianti reggono comunque.
    const elenco = listStates(database);
    assert.equal(elenco.filter((s) => s.isStartState === 1).length, 1);
    assert.ok(elenco.some((s) => s.isEndState === 1));

    database.close();
  } finally {
    pulisci(cartella);
  }
});
