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

/* ── configurazione degli stati ───────────────────────────────────────────────

   Il CRUD che serve al pannello Impostazioni (DEF_Impostazioni, sezione Stati).
   Fino a ieri gli stati si leggevano soltanto: erano configurabili in teoria e
   immutabili in pratica, perché nessuna operazione li toccava.

   **La forma della fila è fissa ai due capi** (decisione del 2026-09-10):

     primo    apertura   uno solo, sempre in testa, non si cancella, non cambia
                         ruolo, non si sposta. Si può solo rinominare.
     in mezzo passaggi   quanti se ne vuole, riordinabili, cancellabili, e
                         ciascuno può contare o no come **conclusione**
                         ("chiusure secondarie": migrato, archiviato, annullato…)
     ultimo   chiusura   sempre in coda, sempre conclusiva, non si cancella e non
                         si sposta. Si può solo rinominare.

   Perché irrigidirla. Prima il ruolo era un campo libero su ogni riga, e da lì
   nascevano tre domande a cui nessuna risposta era buona: che succede se tolgo
   il ruolo all'unica apertura (il flusso resta senza ingresso), se cancello
   l'ultima chiusura (i padri chiusi per cascata non hanno dove atterrare), se
   riordino mettendo una chiusura in mezzo (l'atterraggio si sposta sotto i
   piedi senza che nessuno abbia toccato un task). Fissando i due capi le tre
   domande **non si pongono più**: non sono vietate, sono irrappresentabili.

   Il guadagno più grande è sull'atterraggio. La regola resta quella della
   specifica — "l'ultimo `isEndState` per `stepOrder`" — ma ora ha una sola
   risposta possibile in ogni configurazione: la chiusura finale, che è l'ultima
   per costruzione. "L'ordine è legge" continua a valere e smette di essere una
   trappola.

   Restano tre invarianti, che ogni scrittura difende:

     1. esiste esattamente uno stato con `isStartState = 1`, ed è il primo per
        `stepOrder`;
     2. l'ultimo per `stepOrder` ha `isEndState = 1`;
     3. gli stati in mezzo non sono mai di apertura, e la loro conclusività è
        libera. */

function ruoloDi(stato) {
  if (stato.isStartState === 1) return "start";
  if (stato.isEndState === 1) return "end";
  return "mid";
}

function etichettaValida(label) {
  const pulita = String(label ?? "").trim();
  if (!pulita) throw new Error("L'etichetta di uno stato non puo essere vuota");
  return pulita;
}

/* I due capi della fila. Sono definiti dalla posizione, non da una bandiera:
   `apertura` è il primo, `chiusura` è l'ultimo. Le bandiere li seguono, non il
   contrario — ed è per questo che i due capi non si spostano. */
function apertura(database) {
  const stati = listStates(database);
  if (stati.length === 0) throw new Error("Nessuno stato configurato");
  return stati[0];
}

function chiusuraFinale(database) {
  const stati = listStates(database);
  if (stati.length === 0) throw new Error("Nessuno stato configurato");
  return stati[stati.length - 1];
}

function eCapo(database, idState) {
  return apertura(database).idState === idState || chiusuraFinale(database).idState === idState;
}

function etichettaLibera(database, label, escluso = null) {
  const altro = database
    .prepare("SELECT idState FROM t_state WHERE label = ? AND idState IS NOT ?")
    .get(label, escluso);
  if (altro) throw new Error(`Esiste gia uno stato con questa etichetta: ${label}`);
}

/* Un passaggio nuovo nasce **prima della chiusura finale**, non in fondo: in
   fondo diventerebbe lui l'ultimo, e l'ultimo è la chiusura. Nasce non
   conclusivo, che è la cosa più probabile per un passaggio aggiunto a flusso
   avviato — e se serve una chiusura secondaria, si accende l'interruttore. */
export function createState(database, input = {}) {
  return runInTransaction(database, () => {
    const label = etichettaValida(input.label);
    etichettaLibera(database, label);

    const coda = chiusuraFinale(database);
    const ordine = coda.stepOrder;
    database
      .prepare("UPDATE t_state SET stepOrder = stepOrder + 1 WHERE stepOrder >= ?")
      .run(ordine);

    const esito = database
      .prepare(
        "INSERT INTO t_state (label, isStartState, isEndState, stepOrder) VALUES (?, 0, ?, ?)",
      )
      .run(label, input.isEnd ? 1 : 0, ordine);

    return { esito: "applicato", idState: Number(esito.lastInsertRowid), cambi: ["stati"], avvisi: [] };
  });
}

/* Due sole cose modificabili: l'etichetta, sempre, e la conclusività, solo per
   gli stati in mezzo. Il ruolo dei due capi non è un campo: è la loro
   posizione, e quella non si tocca. */
export function updateState(database, idState, patch = {}) {
  return runInTransaction(database, () => {
    const stato = statoDi(database, idState);
    const cambi = [];
    const avvisi = [];

    if (patch.label !== undefined) {
      const label = etichettaValida(patch.label);
      if (label !== stato.label) {
        etichettaLibera(database, label, idState);
        database.prepare("UPDATE t_state SET label = ? WHERE idState = ?").run(label, idState);
        cambi.push("label");
      }
    }

    if (patch.isEnd !== undefined) {
      const vuole = patch.isEnd ? 1 : 0;
      if (apertura(database).idState === idState) {
        throw new Error("Lo stato di apertura non puo contare come concluso: e il punto d'ingresso");
      }
      if (chiusuraFinale(database).idState === idState && vuole === 0) {
        throw new Error("Lo stato di chiusura resta conclusivo: e il capolinea del flusso");
      }

      if (vuole !== stato.isEndState) {
        database.prepare("UPDATE t_state SET isEndState = ? WHERE idState = ?").run(vuole, idState);
        cambi.push("isEnd");

        /* `isCompleted` dei task segue la conclusività dello stato. I due
           trigger dello schema scattano sull'inserimento del task e sul cambio
           del suo `idState`: qui il task non si muove, si muove il terreno sotto
           di lui, quindi il riallineamento tocca al core. */
        const riallineati = database
          .prepare("UPDATE t_task SET isCompleted = ? WHERE idState = ? AND isCompleted <> ?")
          .run(vuole, idState, vuole);
        if (riallineati.changes > 0) {
          const n = riallineati.changes;
          avvisi.push(
            `${n} task ${n === 1 ? "e passato" : "sono passati"} a ${vuole ? "completati" : "non completati"} seguendo il nuovo tipo di stato.`,
          );
        }
      }
    }

    return { esito: "applicato", cambi, avvisi };
  });
}

/* Riordino dei soli passaggi di mezzo. `orderedIds` resta l'elenco **completo**
   — `stepOrder` è una posizione assoluta, riscriverne solo alcune lascerebbe
   buchi o pareggi il cui esito dipenderebbe dall'ordine di lettura — ma i due
   capi devono ritrovarsi dove stavano: primo l'apertura, ultima la chiusura.
   Un elenco che li sposta viene rifiutato invece di essere corretto in
   silenzio, perché correggerlo significherebbe eseguire una richiesta diversa
   da quella arrivata. */
export function reorderStates(database, orderedIds) {
  return runInTransaction(database, () => {
    const attuali = listStates(database);
    const richiesti = (orderedIds ?? []).map(Number);
    const senzaDoppioni = new Set(richiesti);
    if (
      senzaDoppioni.size !== richiesti.length ||
      richiesti.length !== attuali.length ||
      !attuali.every((s) => senzaDoppioni.has(s.idState))
    ) {
      throw new Error("Il riordino degli stati richiede l'elenco completo, senza ripetizioni");
    }
    if (richiesti[0] !== attuali[0].idState) {
      throw new Error("Lo stato di apertura resta il primo");
    }
    if (richiesti[richiesti.length - 1] !== attuali[attuali.length - 1].idState) {
      throw new Error("Lo stato di chiusura resta l'ultimo");
    }

    const stmt = database.prepare("UPDATE t_state SET stepOrder = ? WHERE idState = ?");
    richiesti.forEach((idState, i) => stmt.run(i + 1, idState));

    return { esito: "applicato", cambi: ["stepOrder"], avvisi: [] };
  });
}

/* Cancellazione dei soli passaggi di mezzo. Si ferma in due modi diversi:

     · sui due capi è un **rifiuto**: non esiste una risposta che renda
       l'operazione accettabile, perché senza apertura il flusso non ha ingresso
       e senza chiusura finale non ha capolinea;
     · sui task che usano lo stato è una **domanda**, perché una risposta esiste:
       dove spostarli. Torna `conferma` con le destinazioni possibili, e si
       richiama con `decisioni.idStateDestinazione`.

   Il vincolo di chiave esterna su `t_task.idState` farebbe fallire la DELETE
   comunque; questa funzione esiste perché fallisca **dicendo cosa fare**. */
export function deleteState(database, idState, decisioni = {}) {
  return runInTransaction(database, () => {
    const stato = statoDi(database, idState);
    if (apertura(database).idState === idState) {
      throw new Error("Lo stato di apertura non si cancella: e il punto d'ingresso del flusso");
    }
    if (chiusuraFinale(database).idState === idState) {
      throw new Error("Lo stato di chiusura non si cancella: e il capolinea del flusso");
    }

    const inUso = database.prepare("SELECT COUNT(*) AS c FROM t_task WHERE idState = ?").get(idState).c;

    if (inUso > 0) {
      const destinazione = decisioni.idStateDestinazione;
      if (destinazione === undefined || destinazione === null) {
        return {
          esito: "conferma",
          richiesta: {
            tipo: "stato-in-uso",
            idState,
            label: stato.label,
            tasks: inUso,
            destinazioni: listStates(database)
              .filter((s) => s.idState !== idState)
              .map((s) => ({ idState: s.idState, label: s.label, role: ruoloDi(s) })),
          },
        };
      }
      const arrivo = statoDi(database, Number(destinazione));
      if (arrivo.idState === idState) throw new Error("La destinazione deve essere un altro stato");

      const istante = adesso();
      const tasks = database.prepare("SELECT idTask FROM t_task WHERE idState = ?").all(idState);
      const sposta = database.prepare("UPDATE t_task SET idState = ?, updatedAt = ? WHERE idTask = ?");
      for (const { idTask } of tasks) {
        sposta.run(arrivo.idState, istante, idTask);
        /* Passa dallo storico come qualunque altro cambio di stato: da fuori e
           successo davvero, il task non e piu dove era. */
        registraStorico(database, idTask, "idState", String(idState), String(arrivo.idState));
      }
      /* `isCompleted` segue lo stato di arrivo, come su ogni altro spostamento:
         il trigger `t_task_completed_on_state_change` ci pensa da se. */
    }

    database.prepare("DELETE FROM t_state WHERE idState = ?").run(idState);
    /* Le posizioni si richiudono sul buco: senza, `stepOrder` resterebbe con un
       salto, e le posizioni tornerebbero a essere numeri qualsiasi invece di una
       fila. */
    listStates(database).forEach((s, i) => {
      if (s.stepOrder !== i + 1) {
        database.prepare("UPDATE t_state SET stepOrder = ? WHERE idState = ?").run(i + 1, s.idState);
      }
    });

    return {
      esito: "applicato",
      cambi: ["stati"],
      avvisi:
        inUso > 0
          ? [`${inUso} task ${inUso === 1 ? "spostato" : "spostati"} su "${statoDi(database, Number(decisioni.idStateDestinazione)).label}".`]
          : [],
    };
  });
}

/* ── configurazione dei progetti e delle milestone ────────────────────────────

   L'altra meta della configurazione, insieme agli stati. Anche qui i progetti si
   leggevano soltanto: erano nel modello dal primo giorno e non c'era modo di
   crearne uno dall'applicazione.

   Le due entita' non hanno lo stesso peso, e le operazioni lo rispecchiano:

     · un **progetto** e' una casa. Cancellarlo lascia dei task senza casa,
       quindi la cancellazione si ferma e chiede dove mandarli;
     · una **milestone** e' una suddivisione dentro quella casa. Cancellarla non
       lascia nessuno senza casa: i task restano nel progetto e perdono solo la
       fase. Si fa e si dice, senza domande.

   Le milestone spariscono da se' con il progetto (`ON DELETE CASCADE` sullo
   schema), ma i task che le usavano no: `t_task.idMilestone` e' una chiave
   esterna senza cascata, quindi vanno ripuliti **prima**, o la cancellazione del
   progetto fallisce sul vincolo. Lo fa lo spostamento dei task, che azzera la
   milestone insieme al progetto — una fase del progetto vecchio non ha senso in
   quello nuovo. */

function progettoEsistente(database, idProject) {
  const progetto = database
    .prepare("SELECT idProject, name, color, position FROM t_project WHERE idProject = ?")
    .get(idProject);
  if (!progetto) throw new Error(`Progetto inesistente: ${idProject}`);
  return progetto;
}

function nomeProgettoValido(database, name, escluso = null) {
  const pulito = String(name ?? "").trim();
  if (!pulito) throw new Error("Il nome di un progetto non puo essere vuoto");
  const altro = database
    .prepare("SELECT idProject FROM t_project WHERE name = ? AND idProject IS NOT ?")
    .get(pulito, escluso);
  if (altro) throw new Error(`Esiste gia un progetto con questo nome: ${pulito}`);
  return pulito;
}

function coloreValido(color) {
  const pulito = String(color ?? "").trim();
  if (!pulito) throw new Error("Un progetto deve avere un colore");
  return pulito;
}

export function createProject(database, input = {}) {
  return runInTransaction(database, () => {
    const name = nomeProgettoValido(database, input.name);
    const color = coloreValido(input.color);
    const idProject = input.idProject ?? randomUUID();
    const position =
      input.position ??
      database.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM t_project").get().p;

    database
      .prepare(
        "INSERT INTO t_project (idProject, name, color, position, createdAt) VALUES (?, ?, ?, ?, ?)",
      )
      .run(idProject, name, color, position, adesso());

    return { esito: "applicato", idProject, cambi: ["progetti"], avvisi: [] };
  });
}

export function updateProject(database, idProject, patch = {}) {
  return runInTransaction(database, () => {
    const progetto = progettoEsistente(database, idProject);
    const cambi = [];

    if (patch.name !== undefined) {
      const name = nomeProgettoValido(database, patch.name, idProject);
      if (name !== progetto.name) {
        database.prepare("UPDATE t_project SET name = ? WHERE idProject = ?").run(name, idProject);
        cambi.push("name");
      }
    }
    if (patch.color !== undefined) {
      const color = coloreValido(patch.color);
      if (color !== progetto.color) {
        database.prepare("UPDATE t_project SET color = ? WHERE idProject = ?").run(color, idProject);
        cambi.push("color");
      }
    }

    return { esito: "applicato", cambi, avvisi: [] };
  });
}

/* Cancellare un progetto che ha dei task dentro non e' una cosa che si fa di
   nascosto: la funzione si ferma e restituisce `conferma` con le destinazioni
   possibili — un altro progetto, oppure nessuno, che e' una risposta legittima e
   non un annullamento. Si richiama con `decisioni.destinazione`: l'id di un
   progetto, o la stringa `"nessuno"`. */
export function deleteProject(database, idProject, decisioni = {}) {
  return runInTransaction(database, () => {
    const progetto = progettoEsistente(database, idProject);
    const inUso = database
      .prepare("SELECT COUNT(*) AS c FROM t_task WHERE idProject = ?")
      .get(idProject).c;

    let destinazione = null;
    if (inUso > 0) {
      const scelta = decisioni.destinazione;
      if (scelta === undefined || scelta === null) {
        return {
          esito: "conferma",
          richiesta: {
            tipo: "progetto-in-uso",
            idProject,
            name: progetto.name,
            tasks: inUso,
            destinazioni: listProjects(database)
              .filter((x) => x.idProject !== idProject)
              .map((x) => ({ idProject: x.idProject, name: x.name, color: x.color })),
          },
        };
      }
      destinazione = scelta === "nessuno" ? null : progettoEsistente(database, scelta).idProject;

      /* Si passa dai task **radice**, perche' progetto e milestone si propagano
         a tutto il sotto-albero: spostare un figlio per conto suo lo staccherebbe
         dal padre, che il modello non ammette. */
      const radici = database
        .prepare("SELECT idTask FROM t_task WHERE idProject = ? AND idParentTask IS NULL")
        .all(idProject);
      for (const { idTask } of radici) applicaProgetto(database, idTask, destinazione, null);

      /* Rete: `applicaProgetto` segue i discendenti **vivi**, quindi un
         sotto-task cancellato in precedenza resterebbe agganciato al progetto e
         farebbe fallire la DELETE sul vincolo. Qui si prende quello che e'
         rimasto indietro, cancellati compresi. */
      database
        .prepare(
          "UPDATE t_task SET idProject = ?, idMilestone = NULL, updatedAt = ? WHERE idProject = ?",
        )
        .run(destinazione, adesso(), idProject);
    }

    /* Le milestone se ne vanno da sole: `ON DELETE CASCADE`. A questo punto
       nessun task le referenzia piu', perche' lo spostamento ha azzerato anche
       `idMilestone`. */
    database.prepare("DELETE FROM t_project WHERE idProject = ?").run(idProject);

    const avvisi = [];
    if (inUso > 0) {
      const dove = destinazione ? `su "${progettoEsistente(database, destinazione).name}"` : "senza progetto";
      avvisi.push(`${inUso} task ${inUso === 1 ? "spostato" : "spostati"} ${dove}.`);
    }
    return { esito: "applicato", cambi: ["progetti"], avvisi };
  });
}

/* ── milestone ─────────────────────────────────────────────────────────────── */

function milestoneEsistente(database, idMilestone) {
  const milestone = database
    .prepare("SELECT idMilestone, idProject, label, position FROM t_milestone WHERE idMilestone = ?")
    .get(idMilestone);
  if (!milestone) throw new Error(`Milestone inesistente: ${idMilestone}`);
  return milestone;
}

/* Le etichette sono uniche **dentro il progetto**, non nel database: due
   progetti diversi possono avere entrambi una fase "Analisi", ed e' normale.
   Lo schema non lo dice (nessun UNIQUE su questa coppia), quindi lo dice qui. */
function etichettaMilestoneLibera(database, idProject, label, escluso = null) {
  const pulita = String(label ?? "").trim();
  if (!pulita) throw new Error("L'etichetta di una milestone non puo essere vuota");
  const altra = database
    .prepare("SELECT idMilestone FROM t_milestone WHERE idProject = ? AND label = ? AND idMilestone IS NOT ?")
    .get(idProject, pulita, escluso);
  if (altra) throw new Error(`Questo progetto ha gia una fase "${pulita}"`);
  return pulita;
}

export function createMilestone(database, input = {}) {
  return runInTransaction(database, () => {
    const progetto = progettoEsistente(database, input.idProject);
    const label = etichettaMilestoneLibera(database, progetto.idProject, input.label);
    const idMilestone = input.idMilestone ?? randomUUID();
    const position =
      input.position ??
      database
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM t_milestone WHERE idProject = ?")
        .get(progetto.idProject).p;

    database
      .prepare(
        "INSERT INTO t_milestone (idMilestone, idProject, label, position, createdAt) VALUES (?, ?, ?, ?, ?)",
      )
      .run(idMilestone, progetto.idProject, label, position, adesso());

    return { esito: "applicato", idMilestone, cambi: ["milestone"], avvisi: [] };
  });
}

export function updateMilestone(database, idMilestone, patch = {}) {
  return runInTransaction(database, () => {
    const milestone = milestoneEsistente(database, idMilestone);
    const cambi = [];

    if (patch.label !== undefined) {
      const label = etichettaMilestoneLibera(database, milestone.idProject, patch.label, idMilestone);
      if (label !== milestone.label) {
        database.prepare("UPDATE t_milestone SET label = ? WHERE idMilestone = ?").run(label, idMilestone);
        cambi.push("label");
      }
    }

    return { esito: "applicato", cambi, avvisi: [] };
  });
}

/* Cancellare una fase non chiede niente, a differenza del progetto: i task
   restano dove sono e perdono solo la suddivisione. Si dice quanti erano, perche'
   e' comunque un dato che sparisce. */
export function deleteMilestone(database, idMilestone) {
  return runInTransaction(database, () => {
    milestoneEsistente(database, idMilestone);
    const inUso = database
      .prepare("SELECT COUNT(*) AS c FROM t_task WHERE idMilestone = ?")
      .get(idMilestone).c;

    if (inUso > 0) {
      database
        .prepare("UPDATE t_task SET idMilestone = NULL, updatedAt = ? WHERE idMilestone = ?")
        .run(adesso(), idMilestone);
    }
    database.prepare("DELETE FROM t_milestone WHERE idMilestone = ?").run(idMilestone);

    return {
      esito: "applicato",
      cambi: ["milestone"],
      avvisi:
        inUso > 0
          ? [`${inUso} task ${inUso === 1 ? "e rimasto" : "sono rimasti"} nel progetto, senza fase.`]
          : [],
    };
  });
}

/* ── lettura dei task ─────────────────────────────────────────────────────── */

const COLONNE_TASK = `
  idTask, idParentTask, idProject, idMilestone, idState, isCompleted,
  title, description, priority, startAt, dueAt, reminderAt,
  sourceType, sourceId, sourceUrl, originalContent, contentGeneratedByAi,
  notes, position, isInbox, createdAt, updatedAt, completedAt, archivedAt, deletedAt
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
        t.notes, t.position, t.isInbox, t.createdAt, t.updatedAt, t.completedAt, t.deletedAt,
        t.sourceType, t.sourceUrl,
        s.label AS stateLabel, s.isStartState, s.isEndState, s.stepOrder,
        p.name AS projectName, p.color AS projectColor,
        m.label AS milestoneLabel,
        (SELECT COUNT(*) FROM t_task f WHERE f.idParentTask = t.idTask AND f.deletedAt IS NULL) AS childCount,
        (SELECT COUNT(*) FROM t_task f WHERE f.idParentTask = t.idTask AND f.deletedAt IS NULL AND f.isCompleted = 1) AS childDoneCount,
        /* Le etichette dei tag, in una stringa sola separata da char(31).

           Niente apici inversi in questo commento: sta dentro un template
           literal, e uno solo lo chiuderebbe a meta' — successo, e il file non
           compilava piu'.

           I tag vengono con la lista perche' il filtro della vista Lista deve
           poter decidere task per task senza una chiamata a testa: listTaskTags
           esiste ed e' giusta per il dettaglio, che ne apre una per volta, ma qui
           sarebbero decine di andate e ritorni sull'IPC per disegnare un elenco.

           Il separatore e' l'unita' di controllo 31 e non una virgola: le
           etichette sono testo scritto da una persona, e una persona la virgola
           la usa. Il 31 no — e' il carattere che esiste apposta per separare
           campi, e non si scrive con la tastiera. */
        (SELECT GROUP_CONCAT(g.label, char(31))
           FROM t_task_tag tt JOIN t_tag g ON g.idTag = tt.idTag
          WHERE tt.idTask = t.idTask) AS tagLabels
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

      /* `isInbox` alla nascita:

           · un task di primo livello nasce **da smistare**, sempre — e non
             perché manchi qualcosa (progetto, data), ma perché l'inbox è il
             posto dove le cose arrivano prima di essere decise. Vale per la
             creazione manuale come per le sorgenti esterne: la differenza fra
             le due la dice già `sourceType`, non serve dirla due volte;
           · un **sotto-task nasce fuori dall'inbox**: lo si scrive dentro un
             task che esiste già, quindi è lavoro organizzato per costruzione,
             e mandarlo in triage riempirebbe la colonna dei figli di qualcosa
             che nessuno ha bisogno di smistare.

         `input.isInbox` scavalca entrambe le regole, per chi crea task
         sapendo già dove vanno (la migrazione esterna, un seed). */
      const inInbox = input.isInbox !== undefined ? (input.isInbox ? 1 : 0) : idParentTask ? 0 : 1;

      const sorgente = input.sourceType ?? "manual";

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
            notes, position, isInbox, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          idTask, idParentTask, ereditato.idProject, idMilestone, idState,
          input.title, input.description ?? null, input.priority ?? "none",
          input.startAt ?? null, input.dueAt ?? null, input.reminderAt ?? null,
          sorgente, input.sourceId ?? null, input.sourceUrl ?? null,
          input.originalContent ?? input.title, input.contentGeneratedByAi ? 1 : 0,
          input.notes ?? null, posizione, inInbox, istante, istante,
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

/* Entrata e uscita dal triage.

   Una funzione a parte e non un campo di `updateTask`, per due motivi. Il
   primo e che `isInbox` non e un attributo del task come il titolo o la
   priorita: e una posizione nel flusso di lavoro, allo stesso titolo di
   `idState`, e le posizioni nel flusso hanno funzioni proprie (`setTaskState`,
   `setTaskProject`) perche possono avere regole. Il secondo e piu concreto:
   passando da `updateTask` finirebbe fra i "campi ordinari" e potrebbe essere
   scritto insieme ad altri in una patch, mentre qui l'uscita dal triage resta
   un gesto singolo e riconoscibile nello storico.

   Non tocca ne progetto, ne date, ne stato: e esattamente il punto della
   decisione del 2026-09-10 — smistare e una cosa, catalogare un'altra. Un task
   puo uscire dal triage senza progetto (si e deciso che non ne ha bisogno) e
   puo restare in triage pur avendone uno (assegnato, ma non ancora deciso). */
export function setTaskInbox(database, idTask, inInbox) {
  return runInTransaction(database, () => {
    const task = taskEsistente(database, idTask);
    const valore = inInbox ? 1 : 0;
    if (task.isInbox === valore) return { esito: "applicato", cambi: [] };

    database
      .prepare("UPDATE t_task SET isInbox = ?, updatedAt = ? WHERE idTask = ?")
      .run(valore, adesso(), idTask);
    registraStorico(database, idTask, "isInbox", String(task.isInbox), String(valore));
    return { esito: "applicato", cambi: ["isInbox"] };
  });
}


/* ─────────────────────────── Tag e commenti ───────────────────────────

   Due tabelle che lo schema aveva già (`t_tag`/`t_task_tag`,
   `t_task_comment`) e che nessuna funzione esponeva: il dettaglio del task le
   chiede entrambe, e senza queste sarebbero due sezioni finte.

   I tag sono un vocabolario condiviso, non una stringa per task: `t_tag` tiene
   l'etichetta una volta sola (UNIQUE) e `t_task_tag` fa l'aggancio. Quindi
   aggiungere un tag a un task significa "trova o crea l'etichetta, poi lega":
   due task che scrivono "urgente" puntano alla stessa riga, ed è ciò che rende
   possibile filtrare per tag. Il confronto è sull'etichetta ripulita dagli
   spazi, non sul testo grezzo, perché "urgente " e "urgente" sono lo stesso
   tag per chi lo scrive.

   I commenti non entrano nello storico (`t_task_history`): quello registra
   cambi di campo fatti dalla macchina a stati, questi sono testo scritto da
   una persona. Il dettaglio li mostra insieme nella scheda "Attività", ma
   restano due sorgenti separate — mescolarle a schema vorrebbe dire perdere la
   differenza fra "il campo dueAt è passato da X a Y" e "ho scritto una nota". */

export function listTaskTags(database, idTask) {
  return database
    .prepare(`
      SELECT t.idTag, t.label
      FROM t_task_tag tt
      JOIN t_tag t ON t.idTag = tt.idTag
      WHERE tt.idTask = ?
      ORDER BY t.label
    `)
    .all(idTask);
}

export function listTags(database) {
  return database.prepare("SELECT idTag, label FROM t_tag ORDER BY label").all();
}

export function addTaskTag(database, idTask, label) {
  return runInTransaction(database, () => {
    taskEsistente(database, idTask);
    const etichetta = String(label ?? "").trim();
    if (etichetta === "") throw new Error("Il tag non può essere vuoto");

    let tag = database.prepare("SELECT idTag FROM t_tag WHERE label = ?").get(etichetta);
    if (!tag) {
      const idTag = randomUUID();
      database
        .prepare("INSERT INTO t_tag (idTag, label, createdAt) VALUES (?, ?, ?)")
        .run(idTag, etichetta, adesso());
      tag = { idTag };
    }

    /* OR IGNORE e non un controllo prima: la chiave primaria della tabella di
       aggancio è (idTask, idTag), quindi riaggiungere lo stesso tag è già
       idempotente a schema. */
    database
      .prepare("INSERT OR IGNORE INTO t_task_tag (idTask, idTag) VALUES (?, ?)")
      .run(idTask, tag.idTag);
    return { esito: "applicato", idTag: tag.idTag, label: etichetta };
  });
}

export function removeTaskTag(database, idTask, idTag) {
  return runInTransaction(database, () => {
    database.prepare("DELETE FROM t_task_tag WHERE idTask = ? AND idTag = ?").run(idTask, idTag);

    /* L'etichetta resta nel vocabolario anche se nessuno la usa più: cancellarla
       qui vorrebbe dire perdere un tag scritto un attimo prima per errore, e
       ripulire `t_tag` è una manutenzione, non l'effetto di un click. */
    return { esito: "applicato" };
  });
}

export function listTaskComments(database, idTask) {
  return database
    .prepare("SELECT idTaskComment, body, createdAt FROM t_task_comment WHERE idTask = ? ORDER BY createdAt")
    .all(idTask);
}

export function addTaskComment(database, idTask, body) {
  return runInTransaction(database, () => {
    taskEsistente(database, idTask);
    const testo = String(body ?? "").trim();
    if (testo === "") throw new Error("Il commento non può essere vuoto");

    const idTaskComment = randomUUID();
    database
      .prepare("INSERT INTO t_task_comment (idTaskComment, idTask, body, createdAt) VALUES (?, ?, ?, ?)")
      .run(idTaskComment, idTask, testo, adesso());
    return { esito: "applicato", idTaskComment };
  });
}

export function removeTaskComment(database, idTaskComment) {
  return runInTransaction(database, () => {
    database.prepare("DELETE FROM t_task_comment WHERE idTaskComment = ?").run(idTaskComment);
    return { esito: "applicato" };
  });
}


/* ── preferenze ─────────────────────────────────────────────────────────────

   `t_setting` e' chiave-valore con il valore in JSON, quindi il database non
   puo' garantire che quello che c'e' dentro abbia ancora senso: una chiave puo'
   contenere l'id di un progetto cancellato, o un ordinamento che l'interfaccia
   non offre piu'. La garanzia si sposta qui. */

/* Il valore di ripiego non e' una comodita': e' la regola.

   Una preferenza illeggibile — JSON rotto, chiave mai scritta, valore di una
   versione precedente — **non e' un errore**: e' il caso normale al primo
   avvio, ed e' il caso normale dopo ogni cambio di interfaccia. Quindi non si
   lancia e non si registra un guasto: si restituisce il ripiego, cioe' quello
   che l'applicazione farebbe comunque se la preferenza non esistesse.

   Chi legge resta responsabile di **validare la forma**: qui si garantisce che
   torni qualcosa, non che quel qualcosa sia sensato. Un ordinamento salvato va
   confrontato con quelli che esistono ora, prima di usarlo. */
/* ── Le notifiche: quello che Alia ti ha detto ─────────────────────────────

   Quattro operazioni. Tre sono ovvie — scrivere, leggere, segnare come letto —
   la quarta e' **svuotare**, e vale la pena dire perche' c'e'.

   Una riga non si cancella mai da sola: un registro di cose accadute non si
   corregge, e cresce di qualche decina di byte al giorno. Ma il registro e' di
   chi lo legge, non nostro: dopo una settimana di sveglie smaltite quelle
   trenta righe non dicono piu' niente a nessuno, e non poterle buttare
   vorrebbe dire trasformare una comodita' in un archivio da sfogliare.
   Svuotare e' un gesto dichiarato e completo — non "cancella le lette", che
   lascerebbe un elenco a meta' e la domanda su cosa sia sparito. */

export function creaNotifica(database, input = {}) {
  const tipo = input.tipo === "origine" ? "origine" : "promemoria";
  const titolo = String(input.titolo ?? "").trim();
  if (!titolo) return { esito: "titolo-mancante" };

  const idNotifica = randomUUID();
  database
    .prepare(`
      INSERT INTO t_notifica (idNotifica, tipo, titolo, corpo, idTask, creataAt, lettaAt)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `)
    .run(
      idNotifica,
      tipo,
      titolo,
      input.corpo ?? null,
      input.idTask ?? null,
      input.creataAt ?? new Date().toISOString(),
    );
  return { esito: "applicato", idNotifica };
}

/* Le ultime, le piu' recenti per prime, con il conto di quelle non lette.

   Il conto arriva **con** l'elenco e non da un'operazione a parte: chi disegna
   la campanella vuole il pallino e la tendina, e due domande separate
   possono rispondere numeri diversi se in mezzo suona qualcosa. */
/* A parita' di istante decide l'ordine di inserimento (`rowid`): due sveglie
   che suonano nello stesso giro hanno lo **stesso** `creataAt` al millisecondo,
   e senza un secondo criterio l'ordine fra loro sarebbe quello che capita —
   cioe' diverso a ogni apertura della campanella.

   (Nota per chi scrivera' qui dentro: i commenti con i backtick **non** vanno
   dentro la stringa SQL, che e' un template literal. Un backtick li' chiude la
   stringa, e l'errore che si ottiene — "missing ) after argument list" — non
   somiglia per niente alla sua causa.) */
export function listNotifiche(database, { limite = 50 } = {}) {
  const righe = database
    .prepare(`
      SELECT n.idNotifica, n.tipo, n.titolo, n.corpo, n.idTask, n.creataAt, n.lettaAt,
             t.title AS titoloTask, t.deletedAt AS taskCancellata
        FROM t_notifica n
        LEFT JOIN t_task t ON t.idTask = n.idTask
       ORDER BY n.creataAt DESC, n.rowid DESC
       LIMIT ?
    `)
    .all(Math.max(1, Math.min(200, Number(limite) || 50)));

  const { nonLette } = database
    .prepare("SELECT COUNT(*) AS nonLette FROM t_notifica WHERE lettaAt IS NULL")
    .get();

  return { notifiche: righe, nonLette };
}

/* Segnare come lette: tutte, o quelle che si passano. Aprire la campanella le
   legge tutte — e' il gesto con cui si dice "visto" — mentre l'elenco degli id
   serve a chi un giorno vorra' segnarne una sola. */
export function segnaNotificheLette(database, idNotifiche = null) {
  const adesso = new Date().toISOString();
  return runInTransaction(database, () => {
    if (Array.isArray(idNotifiche) && idNotifiche.length > 0) {
      const segna = database.prepare(
        "UPDATE t_notifica SET lettaAt = ? WHERE idNotifica = ? AND lettaAt IS NULL",
      );
      let quante = 0;
      for (const id of idNotifiche) quante += segna.run(adesso, id).changes;
      return { esito: "applicato", quante };
    }
    const { changes } = database
      .prepare("UPDATE t_notifica SET lettaAt = ? WHERE lettaAt IS NULL")
      .run(adesso);
    return { esito: "applicato", quante: changes };
  });
}

/* Via tutto. Nessun filtro sulle lette: chi svuota sta dicendo "non mi serve
   piu' niente di questo", e lasciargli dentro le non lette vorrebbe dire non
   aver svuotato. Torna quante ne sono sparite, che e' l'unica cosa che chi ha
   premuto puo' voler sapere. */
export function svuotaNotifiche(database) {
  return runInTransaction(database, () => {
    const { changes } = database.prepare("DELETE FROM t_notifica").run();
    return { esito: "applicato", quante: changes };
  });
}

export function getSetting(database, chiave, ripiego = null) {
  const riga = database.prepare("SELECT valore FROM t_setting WHERE chiave = ?").get(chiave);
  if (!riga) return ripiego;
  try {
    return JSON.parse(riga.valore);
  } catch {
    return ripiego;
  }
}

/* Scrivere `undefined` o `null` **cancella** invece di salvare la stringa
   "null": "non ho una preferenza" e "la mia preferenza e' niente" sono la
   stessa cosa per chi legge, e tenerle distinte vorrebbe dire due modi di
   dire lo stesso, che prima o poi divergono. */
export function setSetting(database, chiave, valore) {
  return runInTransaction(database, () => {
    if (valore === undefined || valore === null) {
      database.prepare("DELETE FROM t_setting WHERE chiave = ?").run(chiave);
      return { esito: "applicato", chiave, rimossa: true };
    }
    database
      .prepare(`
        INSERT INTO t_setting (chiave, valore) VALUES (?, ?)
        ON CONFLICT (chiave) DO UPDATE SET valore = excluded.valore
      `)
      .run(chiave, JSON.stringify(valore));
    return { esito: "applicato", chiave, rimossa: false };
  });
}

/* Tutte, o quelle di un gruppo (`lista.`, `vista.`, `notifiche.`). Torna un
   oggetto e non un elenco di righe: chi le usa le cerca per nome, non le
   scorre. Le chiavi illeggibili si saltano, per la stessa ragione di sopra. */
export function listSettings(database, prefisso = null) {
  const righe = prefisso
    ? database.prepare("SELECT chiave, valore FROM t_setting WHERE chiave LIKE ? ORDER BY chiave").all(`${prefisso}%`)
    : database.prepare("SELECT chiave, valore FROM t_setting ORDER BY chiave").all();

  const fuori = {};
  for (const riga of righe) {
    try {
      fuori[riga.chiave] = JSON.parse(riga.valore);
    } catch {
      // una preferenza illeggibile non e' un guasto: semplicemente non c'e'
    }
  }
  return fuori;
}

/* Cancellare un gruppo intero serve quando una schermata cambia e le sue
   preferenze non vogliono piu' dire niente: si buttano per nome di famiglia,
   senza doverle elencare. */
export function removeSettings(database, prefisso) {
  return runInTransaction(database, () => {
    const esito = database.prepare("DELETE FROM t_setting WHERE chiave LIKE ?").run(`${prefisso}%`);
    return { esito: "applicato", rimosse: Number(esito.changes) };
  });
}
