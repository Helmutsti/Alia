/* Core dei task — la macchina a stati di Rinascita.md, sezione Flussi.

   Perché quasi nulla di questo è un trigger SQL: le due regole centrali si
   fermano a metà per chiedere qualcosa all'utente (sovrascrivere i figli già
   chiusi? su quale stato riaprire il padre?), e un trigger non può aspettare
   una risposta. Quindi la cascata vive qui, e a SQLite resta solo
   `isCompleted`, che è un automatismo puro (vedi rinascita-schema.js).

   Forma delle API di transizione: non lanciano eccezioni per chiedere, ma
   **restituiscono un esito**. Tre esiti possibili:

     { esito: "applicato",  cambi: [...], avvisi: [...] }
     { esito: "conferma",   richiesta: {...} }   → richiama passando `decisioni`
     { esito: "bloccato",   motivo: "...", tasks: [...] }

   Così l'interfaccia chiama, riceve "serve una conferma", mostra il dialogo, e
   richiama la stessa funzione con la decisione dentro `decisioni`. Nessuno
   stato sospeso da qualche parte tra una chiamata e l'altra. */

import { randomUUID } from "node:crypto";
import { runInTransaction } from "./database.js";

export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"];

function adesso() {
  return new Date().toISOString();
}

/* ── lettura degli stati ──────────────────────────────────────────────────── */

export function listStates(database) {
  return database
    .prepare("SELECT idState, label, isStartState, isEndState, stepOrder FROM t_state ORDER BY stepOrder")
    .all();
}

function statoDi(database, idState) {
  const stato = database
    .prepare("SELECT idState, label, isStartState, isEndState, stepOrder FROM t_state WHERE idState = ?")
    .get(idState);
  if (!stato) throw new Error(`Stato inesistente: ${idState}`);
  return stato;
}

function statoIniziale(database) {
  const stato = database.prepare("SELECT * FROM t_state WHERE isStartState = 1").get();
  if (!stato) throw new Error("Nessuno stato di partenza configurato");
  return stato;
}

/* Lo stato su cui atterra un padre chiuso per cascata: l'ultimo `isEndState`
   per `stepOrder`. È la regola della specifica, ed è il motivo per cui
   `stepOrder` non è solo ordine di presentazione. */
function statoDiAtterraggio(database) {
  const stato = database
    .prepare("SELECT * FROM t_state WHERE isEndState = 1 ORDER BY stepOrder DESC LIMIT 1")
    .get();
  if (!stato) throw new Error("Nessuno stato finale configurato");
  return stato;
}

function eFinale(database, idState) {
  return statoDi(database, idState).isEndState === 1;
}

/* ── lettura dei task ─────────────────────────────────────────────────────── */

const COLONNE_TASK = `
  idTask, idParentTask, idProject, idMilestone, idState, isCompleted,
  title, description, priority, startAt, dueAt, reminderAt,
  sourceType, sourceId, sourceUrl, originalContent, contentGeneratedByAi,
  notes, position, createdAt, updatedAt, completedAt, archivedAt, deletedAt
`;

export function getTask(database, idTask) {
  return database.prepare(`SELECT ${COLONNE_TASK} FROM t_task WHERE idTask = ?`).get(idTask) ?? null;
}

/* La lettura per l'interfaccia: il task con accanto già risolti stato,
   progetto e milestone. Sono tre join che il renderer altrimenti rifarebbe a
   mano su tre elenchi separati, ricostruendo lato client un lavoro che SQLite
   fa meglio. `isStartState`/`isEndState`/`stepOrder` viaggiano insieme perché
   la grafica dipende dal *ruolo* dello stato, non dalla sua etichetta: gli
   stati sono configurabili, e nessuna vista può assumerne un elenco fisso. */
export function listTasks(database, { includeDeleted = false } = {}) {
  return database
    .prepare(`
      SELECT
        t.idTask, t.idParentTask, t.idProject, t.idMilestone, t.idState, t.isCompleted,
        t.title, t.description, t.priority, t.startAt, t.dueAt, t.reminderAt,
        t.notes, t.position, t.createdAt, t.updatedAt, t.completedAt, t.deletedAt,
        t.sourceType, t.sourceUrl,
        s.label AS stateLabel, s.isStartState, s.isEndState, s.stepOrder,
        p.name AS projectName, p.color AS projectColor,
        m.label AS milestoneLabel,
        (SELECT COUNT(*) FROM t_task f WHERE f.idParentTask = t.idTask AND f.deletedAt IS NULL) AS childCount,
        (SELECT COUNT(*) FROM t_task f WHERE f.idParentTask = t.idTask AND f.deletedAt IS NULL AND f.isCompleted = 1) AS childDoneCount
      FROM t_task t
      JOIN t_state s ON s.idState = t.idState
      LEFT JOIN t_project p ON p.idProject = t.idProject
      LEFT JOIN t_milestone m ON m.idMilestone = t.idMilestone
      WHERE ${includeDeleted ? "1 = 1" : "t.deletedAt IS NULL"}
      ORDER BY t.position, t.createdAt
    `)
    .all();
}

export function listProjects(database) {
  return database
    .prepare(`
      SELECT p.idProject, p.name, p.color, p.position,
             (SELECT COUNT(*) FROM t_task t
               WHERE t.idProject = p.idProject AND t.deletedAt IS NULL) AS taskCount
        FROM t_project p
       ORDER BY p.position
    `)
    .all();
}

export function listMilestones(database, idProject = null) {
  const sql = `
    SELECT idMilestone, idProject, label, position FROM t_milestone
     ${idProject ? "WHERE idProject = ?" : ""}
     ORDER BY idProject, position
  `;
  const stmt = database.prepare(sql);
  return idProject ? stmt.all(idProject) : stmt.all();
}

export function getTaskHistory(database, idTask) {
  return database
    .prepare("SELECT idTaskHistory, field, oldValue, newValue, changedAt FROM t_task_history WHERE idTask = ? ORDER BY changedAt")
    .all(idTask);
}

function taskEsistente(database, idTask) {
  const task = getTask(database, idTask);
  if (!task) throw new Error(`Task inesistente: ${idTask}`);
  return task;
}

/* I figli "che contano": i cancellati sono esclusi ovunque, perché la
   specifica li tratta come se non esistessero più — né chiusi né aperti. */
function figliVivi(database, idTask) {
  return database
    .prepare(`SELECT ${COLONNE_TASK} FROM t_task WHERE idParentTask = ? AND deletedAt IS NULL ORDER BY position`)
    .all(idTask);
}

/* Tutto il sotto-albero vivo, in ordine dall'alto verso il basso. */
function discendentiVivi(database, idTask) {
  return database
    .prepare(`
      WITH RECURSIVE albero(idTask, livello) AS (
        SELECT idTask, 0 FROM t_task WHERE idParentTask = ? AND deletedAt IS NULL
        UNION ALL
        SELECT t.idTask, albero.livello + 1
          FROM t_task t JOIN albero ON t.idParentTask = albero.idTask
         WHERE t.deletedAt IS NULL
      )
      SELECT ${COLONNE_TASK} FROM t_task
       WHERE idTask IN (SELECT idTask FROM albero)
       ORDER BY (SELECT livello FROM albero WHERE albero.idTask = t_task.idTask), position
    `)
    .all(idTask);
}

/* La catena dei padri, dal più vicino alla radice. */
function antenati(database, idTask) {
  const catena = [];
  let corrente = taskEsistente(database, idTask).idParentTask;
  while (corrente) {
    const padre = getTask(database, corrente);
    if (!padre) break;
    catena.push(padre);
    corrente = padre.idParentTask;
  }
  return catena;
}

/* ── scrittura di base ────────────────────────────────────────────────────── */

function registraStorico(database, idTask, field, oldValue, newValue) {
  database
    .prepare(
      "INSERT INTO t_task_history (idTaskHistory, idTask, field, oldValue, newValue, changedAt) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(randomUUID(), idTask, field, oldValue === null ? null : String(oldValue), newValue === null ? null : String(newValue), adesso());
}

/* Applica un cambio di stato a una singola riga, senza nessuna cascata:
   la cascata è responsabilità di chi chiama. `completedAt` e `archivedAt`
   seguono lo stato, `isCompleted` no — quello lo mette il trigger. */
function scriviStato(database, task, statoNuovo, cambi) {
  if (task.idState === statoNuovo.idState) return;

  const istante = adesso();
  const chiude = statoNuovo.isEndState === 1;
  database
    .prepare(`
      UPDATE t_task
         SET idState = ?, updatedAt = ?,
             completedAt = CASE WHEN ? = 1 THEN COALESCE(completedAt, ?) ELSE NULL END
       WHERE idTask = ?
    `)
    .run(statoNuovo.idState, istante, chiude ? 1 : 0, istante, task.idTask);

  registraStorico(database, task.idTask, "idState", task.idState, statoNuovo.idState);
  cambi.push({ idTask: task.idTask, da: task.idState, a: statoNuovo.idState });
}

/* ── cascata verso l'alto: tutti i figli chiusi → chiudi il padre ─────────── */

/* Un task senza figli non è mai soggetto a questa regola: "tutti i figli
   chiusi" pretende che ce ne sia almeno uno, altrimenti ogni task nuovo si
   chiuderebbe da solo per vacuità. */
function propagaChiusuraVersoAlto(database, idTaskPartenza, cambi, avvisi) {
  const atterraggio = statoDiAtterraggio(database);
  let idCorrente = getTask(database, idTaskPartenza)?.idParentTask ?? null;

  while (idCorrente) {
    const padre = getTask(database, idCorrente);
    if (!padre || padre.deletedAt) break;

    const figli = figliVivi(database, padre.idTask);
    if (figli.length === 0 || figli.some((f) => f.isCompleted === 0)) break;
    if (padre.isCompleted === 1) break; // già chiuso: niente da fare, e niente da risalire

    scriviStato(database, padre, atterraggio, cambi);

    /* Lo scarto che la specifica chiede di segnalare: il padre atterra
       sull'ultimo stato finale anche quando i figli sono finiti altrove (tutti
       "Migrato", per dire). Il dato è corretto per la regola, ma non racconta
       cosa è successo davvero, quindi l'interfaccia deve poterlo dire. */
    const statiFigli = [...new Set(figli.map((f) => f.idState))];
    if (statiFigli.length !== 1 || statiFigli[0] !== atterraggio.idState) {
      avvisi.push({
        tipo: "chiusura-per-cascata-con-scarto",
        idTask: padre.idTask,
        idStateAssegnato: atterraggio.idState,
        idStateFigli: statiFigli,
      });
    }

    idCorrente = padre.idParentTask;
  }
}

/* ── cascata verso il basso e riapertura ──────────────────────────────────── */

/* Gli antenati chiusi che una riapertura deve riaprire: si sale finché i padri
   sono chiusi, e ci si ferma al primo aperto. */
function antenatiDaRiaprire(database, idTask) {
  const daRiaprire = [];
  for (const padre of antenati(database, idTask)) {
    if (padre.isCompleted === 0 || padre.deletedAt) break;
    daRiaprire.push(padre);
  }
  return daRiaprire;
}

/* La riapertura non ha uno stato "giusto" da sola: la specifica dice
   esplicitamente che lo sceglie l'utente. Quindi o arrivano già decisi in
   `statiRiapertura` (idTask → idState non finale), o si torna indietro a
   chiedere. */
function riapriAntenati(database, idTask, statiRiapertura, cambi) {
  const daRiaprire = antenatiDaRiaprire(database, idTask);
  if (daRiaprire.length === 0) return null;

  const mancanti = daRiaprire.filter((p) => statiRiapertura[p.idTask] === undefined);
  if (mancanti.length > 0) {
    return {
      esito: "conferma",
      richiesta: {
        tipo: "scegli-stato-riapertura",
        tasks: mancanti.map((p) => ({ idTask: p.idTask, title: p.title, idState: p.idState })),
        statiAmmessi: listStates(database).filter((s) => s.isEndState === 0),
      },
    };
  }

  for (const padre of daRiaprire) {
    const stato = statoDi(database, statiRiapertura[padre.idTask]);
    if (stato.isEndState === 1) {
      throw new Error(`Riapertura su uno stato finale: ${stato.label}`);
    }
    scriviStato(database, padre, stato, cambi);
  }
  return null;
}

/* ── transizione di stato, il cuore ───────────────────────────────────────── */

/**
 * Porta un task su uno stato, applicando tutte le cascate.
 *
 * `decisioni`:
 *   - `sovrascriviFigliChiusi`: true/false — risposta alla conferma sui figli
 *     che erano già chiusi su uno stato diverso.
 *   - `statiRiapertura`: { [idTask]: idState } — stato scelto dall'utente per
 *     ogni antenato che la riapertura deve riaprire.
 */
export function setTaskState(database, idTask, idState, decisioni = {}) {
  try {
    return applicaStato(database, idTask, idState, decisioni);
  } catch (error) {
    if (error instanceof RichiestaConferma) return error.payload;
    throw error;
  }
}

function applicaStato(database, idTask, idState, decisioni) {
  return runInTransaction(database, () => {
    const task = taskEsistente(database, idTask);
    if (task.deletedAt) throw new Error(`Task cancellato: ${idTask}`);
    const statoNuovo = statoDi(database, idState);

    const cambi = [];
    const avvisi = [];

    if (statoNuovo.isEndState === 1) {
      /* Chiusura. Il sotto-albero segue il padre sullo stesso stato — ma i
         figli già chiusi non si sovrascrivono di nascosto. */
      const discendenti = discendentiVivi(database, idTask);
      const giaChiusi = discendenti.filter((d) => d.isCompleted === 1 && d.idState !== idState);

      if (giaChiusi.length > 0 && decisioni.sovrascriviFigliChiusi === undefined) {
        return {
          esito: "conferma",
          richiesta: {
            tipo: "figli-gia-chiusi",
            idTask,
            idStatePadre: idState,
            tasks: giaChiusi.map((d) => ({ idTask: d.idTask, title: d.title, idState: d.idState })),
          },
        };
      }

      scriviStato(database, task, statoNuovo, cambi);
      for (const figlio of discendenti) {
        if (figlio.isCompleted === 1 && !decisioni.sovrascriviFigliChiusi) continue;
        scriviStato(database, figlio, statoNuovo, cambi);
      }

      /* Chiudere questo task può aver completato l'ultimo figlio aperto di suo
         padre: la cascata continua verso l'alto. */
      propagaChiusuraVersoAlto(database, idTask, cambi, avvisi);
    } else {
      /* Riapertura o semplice spostamento tra stati aperti. Il sotto-albero non
         viene toccato: la specifica prevede la cascata verso il basso solo in
         chiusura. */
      const eraChiuso = task.isCompleted === 1;
      scriviStato(database, task, statoNuovo, cambi);

      if (eraChiuso) {
        const conferma = riapriAntenati(database, idTask, decisioni.statiRiapertura ?? {}, cambi);
        if (conferma) throw new RichiestaConferma(conferma);
      }
    }

    return { esito: "applicato", cambi, avvisi };
  });
}

/* Una conferma richiesta a metà transazione deve annullare quello che era già
   stato scritto: la si fa viaggiare come eccezione fino al rollback di
   `runInTransaction`, e la si riconverte in esito appena fuori. */
class RichiestaConferma extends Error {
  constructor(payload) {
    super("conferma richiesta");
    this.payload = payload;
  }
}

/* ── migrazione verso una piattaforma esterna ─────────────────────────────── */

/* Diversa dalla chiusura normale, e apposta: non trascina i figli. Se ci sono
   sotto-task ancora aperti la migrazione è bloccata, perché portare il lavoro
   fuori dal sistema insieme a cose non finite le farebbe sparire senza che
   nessuno se ne accorga. */
export function migrateTaskExternally(database, idTask, idState) {
  const stato = statoDi(database, idState);
  if (stato.isEndState !== 1) {
    throw new Error(`La migrazione richiede uno stato finale, ricevuto: ${stato.label}`);
  }

  const aperti = discendentiVivi(database, idTask).filter((d) => d.isCompleted === 0);
  if (aperti.length > 0) {
    return {
      esito: "bloccato",
      motivo: "sotto-task-aperti",
      tasks: aperti.map((d) => ({ idTask: d.idTask, title: d.title, idState: d.idState })),
    };
  }

  return setTaskState(database, idTask, idState, { sovrascriviFigliChiusi: false });
}

/* ── creazione ────────────────────────────────────────────────────────────── */

/* Un figlio non può stare in un progetto diverso da quello del padre: progetto
   e milestone si ereditano, non si scelgono, quando c'è un padre. */
function coerenzaConPadre(database, idParentTask, input) {
  if (!idParentTask) return { idProject: input.idProject ?? null, idMilestone: input.idMilestone ?? null };
  const padre = taskEsistente(database, idParentTask);
  return { idProject: padre.idProject, idMilestone: padre.idMilestone };
}

function verificaMilestone(database, idProject, idMilestone) {
  if (!idMilestone) return null;
  const milestone = database
    .prepare("SELECT idProject FROM t_milestone WHERE idMilestone = ?")
    .get(idMilestone);
  if (!milestone) throw new Error(`Milestone inesistente: ${idMilestone}`);
  if (milestone.idProject !== idProject) {
    throw new Error("La milestone appartiene a un altro progetto");
  }
  return idMilestone;
}

/**
 * Crea un task. Se il padre era chiuso si riapre, e per farlo serve lo stato
 * scelto dall'utente — quindi anche questa può restituire una conferma.
 */
export function createTask(database, input, decisioni = {}) {
  try {
    return runInTransaction(database, () => {
      const istante = adesso();
      const idTask = input.idTask ?? randomUUID();
      const idParentTask = input.idParentTask ?? null;
      const ereditato = coerenzaConPadre(database, idParentTask, input);
      const idMilestone = verificaMilestone(database, ereditato.idProject, ereditato.idMilestone);
      const idState = input.idState ?? statoIniziale(database).idState;

      const posizione =
        input.position ??
        (database
          .prepare(
            "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM t_task WHERE idParentTask IS ?",
          )
          .get(idParentTask).p);

      database
        .prepare(`
          INSERT INTO t_task (
            idTask, idParentTask, idProject, idMilestone, idState, isCompleted,
            title, description, priority, startAt, dueAt, reminderAt,
            sourceType, sourceId, sourceUrl, originalContent, contentGeneratedByAi,
            notes, position, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          idTask, idParentTask, ereditato.idProject, idMilestone, idState,
          input.title, input.description ?? null, input.priority ?? "none",
          input.startAt ?? null, input.dueAt ?? null, input.reminderAt ?? null,
          input.sourceType ?? "manual", input.sourceId ?? null, input.sourceUrl ?? null,
          input.originalContent ?? input.title, input.contentGeneratedByAi ? 1 : 0,
          input.notes ?? null, posizione, istante, istante,
        );

      const cambi = [];
      /* Un padre chiuso non può restare chiuso ora che ha un figlio aperto:
         "tutti i figli chiusi" ha appena smesso di essere vero. */
      if (idParentTask && !eFinale(database, idState)) {
        const conferma = riapriAntenati(database, idTask, decisioni.statiRiapertura ?? {}, cambi);
        if (conferma) throw new RichiestaConferma(conferma);
      }

      return { esito: "applicato", idTask, cambi, avvisi: [] };
    });
  } catch (error) {
    if (error instanceof RichiestaConferma) return error.payload;
    throw error;
  }
}

/* ── cancellazione ────────────────────────────────────────────────────────── */

/* Soft-delete di tutto il sotto-albero. Dopo, il padre può ritrovarsi con soli
   figli chiusi (i cancellati non contano) e chiudersi per cascata — ma solo se
   gliene resta almeno uno: se sono spariti tutti, non ha più figli e la regola
   non lo riguarda. */
export function deleteTask(database, idTask) {
  return runInTransaction(database, () => {
    const task = taskEsistente(database, idTask);
    const istante = adesso();
    const ids = [task.idTask, ...discendentiVivi(database, idTask).map((d) => d.idTask)];
    const aggiorna = database.prepare("UPDATE t_task SET deletedAt = ?, updatedAt = ? WHERE idTask = ?");
    for (const id of ids) {
      aggiorna.run(istante, istante, id);
      registraStorico(database, id, "deletedAt", null, istante);
    }

    const cambi = [];
    const avvisi = [];
    if (task.idParentTask) {
      propagaChiusuraVersoAlto(database, ids[0], cambi, avvisi);
    }
    return { esito: "applicato", cancellati: ids, cambi, avvisi };
  });
}

/* Ripristino: per la specifica non è un'azione di prodotto ma un intervento
   tecnico, quindi esiste nel core e non va esposta in interfaccia. Se il task
   torna aperto sotto un padre chiuso vale la regola del "nuovo figlio". */
export function restoreTaskTechnical(database, idTask, decisioni = {}) {
  try {
    return runInTransaction(database, () => {
      const task = taskEsistente(database, idTask);
      const istante = adesso();
      database
        .prepare("UPDATE t_task SET deletedAt = NULL, updatedAt = ? WHERE idTask = ?")
        .run(istante, idTask);
      registraStorico(database, idTask, "deletedAt", task.deletedAt, null);

      const cambi = [];
      if (task.idParentTask && task.isCompleted === 0) {
        const conferma = riapriAntenati(database, idTask, decisioni.statiRiapertura ?? {}, cambi);
        if (conferma) throw new RichiestaConferma(conferma);
      }
      return { esito: "applicato", cambi, avvisi: [] };
    });
  } catch (error) {
    if (error instanceof RichiestaConferma) return error.payload;
    throw error;
  }
}

/* ── spostamenti nell'albero e coerenza di progetto ───────────────────────── */

function eDiscendente(database, idTask, idPossibileAntenato) {
  return discendentiVivi(database, idPossibileAntenato).some((d) => d.idTask === idTask);
}

/* Riparenta un task. Due invarianti da tenere: niente cicli, e progetto e
   milestone del sotto-albero allineati al nuovo padre. */
export function reparentTask(database, idTask, idParentTask) {
  return runInTransaction(database, () => {
    const task = taskEsistente(database, idTask);
    if (idParentTask === idTask) throw new Error("Un task non può essere padre di sé stesso");
    if (idParentTask && eDiscendente(database, idParentTask, idTask)) {
      throw new Error("Spostamento ciclico: il nuovo padre è un discendente del task");
    }

    const ereditato = coerenzaConPadre(database, idParentTask, task);
    database
      .prepare("UPDATE t_task SET idParentTask = ?, updatedAt = ? WHERE idTask = ?")
      .run(idParentTask, adesso(), idTask);
    registraStorico(database, idTask, "idParentTask", task.idParentTask, idParentTask);

    applicaProgetto(database, idTask, ereditato.idProject, ereditato.idMilestone);
    return { esito: "applicato" };
  });
}

/* Progetto e milestone si propagano a tutto il sotto-albero: un sotto-task in
   un progetto diverso dal padre non è uno stato ammesso dal modello. */
function applicaProgetto(database, idTask, idProject, idMilestone) {
  const istante = adesso();
  const aggiorna = database.prepare(
    "UPDATE t_task SET idProject = ?, idMilestone = ?, updatedAt = ? WHERE idTask = ?",
  );
  const ids = [idTask, ...discendentiVivi(database, idTask).map((d) => d.idTask)];
  for (const id of ids) aggiorna.run(idProject, idMilestone, istante, id);
  registraStorico(database, idTask, "idProject", null, idProject);
}

/* I campi ordinari, quelli senza cascate: titolo, priorità, date, note. Lo
   stato non è tra questi — passa da `setTaskState`, che è l'unico punto in cui
   le regole della macchina a stati vengono applicate. Lo stesso vale per
   progetto e padre, che hanno le loro funzioni. */
const CAMPI_MODIFICABILI = [
  "title", "description", "priority", "startAt", "dueAt", "reminderAt", "notes", "position",
];

export function updateTask(database, idTask, patch) {
  return runInTransaction(database, () => {
    const task = taskEsistente(database, idTask);
    const campi = Object.keys(patch).filter((c) => CAMPI_MODIFICABILI.includes(c));

    const ignorati = Object.keys(patch).filter((c) => !CAMPI_MODIFICABILI.includes(c));
    if (ignorati.length > 0) {
      throw new Error(`Campi non modificabili da updateTask: ${ignorati.join(", ")}`);
    }
    if (campi.length === 0) return { esito: "applicato", cambi: [] };

    if (patch.priority !== undefined && !TASK_PRIORITIES.includes(patch.priority)) {
      throw new Error(`Priorità non valida: ${patch.priority}`);
    }

    const istante = adesso();
    database
      .prepare(`UPDATE t_task SET ${campi.map((c) => `${c} = ?`).join(", ")}, updatedAt = ? WHERE idTask = ?`)
      .run(...campi.map((c) => patch[c]), istante, idTask);

    for (const campo of campi) {
      if (task[campo] !== patch[campo]) registraStorico(database, idTask, campo, task[campo], patch[campo]);
    }
    return { esito: "applicato", cambi: campi };
  });
}

/* Il riordino manuale di una lista. Una sola transazione che rinumera, invece
   di N chiamate a `updateTask`: con posizioni scritte una per volta due
   fratelli possono finire sullo stesso numero a metà strada, e l'ordine
   dipenderebbe dal tie-break. Qui o si rinumera tutto o niente.

   `orderedIds` è la lista completa dei figli di quel padre, nell'ordine
   voluto; gli id che non appartengono a quel padre vengono rifiutati, perché
   sarebbero uno spostamento nell'albero travestito da riordino. */
export function reorderTasks(database, idParentTask, orderedIds) {
  return runInTransaction(database, () => {
    const attuali = new Set(figliVivi(database, idParentTask).map((t) => t.idTask));
    const estranei = orderedIds.filter((id) => !attuali.has(id));
    if (estranei.length > 0) {
      throw new Error(`Riordino con task che non sono figli di ${idParentTask}: ${estranei.join(", ")}`);
    }

    const istante = adesso();
    const aggiorna = database.prepare("UPDATE t_task SET position = ?, updatedAt = ? WHERE idTask = ?");
    orderedIds.forEach((id, i) => aggiorna.run(i, istante, id));
    return { esito: "applicato", ordinati: orderedIds.length };
  });
}

/* La variante per le task di primo livello, che non hanno un padre: `IS NULL`
   non si può esprimere con il parametro di `figliVivi`. */
export function reorderRootTasks(database, orderedIds) {
  return runInTransaction(database, () => {
    const attuali = new Set(
      database
        .prepare("SELECT idTask FROM t_task WHERE idParentTask IS NULL AND deletedAt IS NULL")
        .all()
        .map((t) => t.idTask),
    );
    const estranei = orderedIds.filter((id) => !attuali.has(id));
    if (estranei.length > 0) {
      throw new Error(`Riordino con task che non sono di primo livello: ${estranei.join(", ")}`);
    }

    const istante = adesso();
    const aggiorna = database.prepare("UPDATE t_task SET position = ?, updatedAt = ? WHERE idTask = ?");
    orderedIds.forEach((id, i) => aggiorna.run(i, istante, id));
    return { esito: "applicato", ordinati: orderedIds.length };
  });
}

export function setTaskProject(database, idTask, idProject, idMilestone = null) {
  return runInTransaction(database, () => {
    const task = taskEsistente(database, idTask);
    if (task.idParentTask) {
      throw new Error("Il progetto si cambia sul task radice: i sotto-task lo ereditano");
    }
    const milestone = verificaMilestone(database, idProject, idMilestone);
    applicaProgetto(database, idTask, idProject, milestone);
    return { esito: "applicato" };
  });
}
