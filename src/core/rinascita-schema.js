/* Schema "Rinascita" — le tabelle t_* e la migrazione dai dati attuali.
   Specifica: Rinascita.md, sezione Database (dichiarata stabile il 2026-09-09).

   Convenzioni fissate dalla specifica: tabelle con prefisso `t_`, nome inglese
   singolare; chiave primaria `id<NomeTabella>` in camelCase; tutte le altre
   colonne in inglese. Qui le colonne sono in camelCase per coerenza con le
   chiavi — la specifica lasciava la scelta all'implementazione.

   Il cuore del modello è che `t_task` è ricorsiva: sostituisce sia `items` sia
   `subtasks`, e un sotto-task è un task a tutti gli effetti. Sparisce
   `isContainer`; le "liste" diventano `t_milestone`, che è parte del progetto e
   non un task. */

export const RINASCITA_VERSION = 7;

/* Stati di partenza per un database nuovo.

   Due punti su cui la specifica si contraddiceva, risolti seguendo la sezione
   Flussi (più recente e più esplicita di quella Database, che dichiarava il
   proprio seed "da confermare in dettaglio") e confermati poi esplicitamente:

   1. Lo stato di partenza si chiama **Nuovo**, non "Da fare" — Flussi lo dice
      due volte, e serve un nome che significhi "appena arrivato" e non "da
      lavorare", perché sono cose diverse nel modello dell'inbox.
   2. Esiste **Migrato**, lo stato finale dedicato al trasferimento verso una
      piattaforma esterna, che la sezione Database non aveva ancora previsto.

   L'ordine non è cosmetico. Gli stati hanno un solo ordine, `stepOrder`, e la
   cascata figli→padre atterra sul **più grande** tra quelli finali: nessun
   flag separato per dire "qui atterra la cascata". Quindi `Fatto` è ultimo,
   dopo `Migrato` e `Archiviato` — che sono chiusure laterali, non l'esito
   normale del lavoro. Con l'ordine opposto un padre chiuso per cascata
   finirebbe "Archiviato", che non è ciò che la specifica descrive.

   Il prezzo, accettato: in un menu ordinato per `stepOrder`, "Archiviato"
   compare prima di "Fatto". */
const SEED_STATES = [
  { label: "Nuovo", isStartState: 1, isEndState: 0, stepOrder: 1 },
  { label: "In corso", isStartState: 0, isEndState: 0, stepOrder: 2 },
  { label: "Migrato", isStartState: 0, isEndState: 1, stepOrder: 3 },
  { label: "Archiviato", isStartState: 0, isEndState: 1, stepOrder: 4 },
  { label: "Fatto", isStartState: 0, isEndState: 1, stepOrder: 5 },
];

/* Come i vecchi `items.status` testuali si traducono nelle etichette nuove. */
const STATUS_TO_LABEL = {
  inbox: "Nuovo",
  active: "In corso",
  completed: "Fatto",
  archived: "Archiviato",
};

const DDL = `
  CREATE TABLE t_state (
    idState INTEGER PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    isStartState INTEGER NOT NULL DEFAULT 0 CHECK (isStartState IN (0, 1)),
    isEndState INTEGER NOT NULL DEFAULT 0 CHECK (isEndState IN (0, 1)),
    stepOrder INTEGER NOT NULL,
    -- Uno stato è o di partenza, o di chiusura, o nessuno dei due: mai entrambi.
    CHECK (NOT (isStartState = 1 AND isEndState = 1))
  );
  -- Uno solo stato di partenza in tutto il sistema, imposto dallo schema e non
  -- solo dal core: un indice parziale univoco è il modo dichiarativo di dirlo.
  CREATE UNIQUE INDEX t_state_single_start ON t_state(isStartState) WHERE isStartState = 1;
  CREATE INDEX t_state_step_order ON t_state(stepOrder);

  CREATE TABLE t_project (
    idProject TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    position INTEGER NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX t_project_position ON t_project(position);

  CREATE TABLE t_milestone (
    idMilestone TEXT PRIMARY KEY,
    -- Una milestone non ha senso senza il suo progetto.
    idProject TEXT NOT NULL REFERENCES t_project(idProject) ON DELETE CASCADE,
    label TEXT NOT NULL,
    position INTEGER NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX t_milestone_project_position ON t_milestone(idProject, position);

  CREATE TABLE t_task (
    idTask TEXT PRIMARY KEY,
    -- Auto-relazione: NULL = task di primo livello. Cancellare un padre
    -- cancella l'intero sotto-albero.
    idParentTask TEXT REFERENCES t_task(idTask) ON DELETE CASCADE,
    -- Opzionali entrambi: un task può non essere categorizzato (principio
    -- dell'inbox). SET NULL copre il caso "lascia orfani" alla cancellazione
    -- del progetto; il caso "migra" è un UPDATE applicativo preventivo.
    idProject TEXT REFERENCES t_project(idProject) ON DELETE SET NULL,
    idMilestone TEXT REFERENCES t_milestone(idMilestone) ON DELETE SET NULL,
    idState INTEGER NOT NULL REFERENCES t_state(idState),
    -- Riflesso automatico di t_state.isEndState, mantenuto dai trigger sotto:
    -- non va mai impostato a mano.
    isCompleted INTEGER NOT NULL DEFAULT 0 CHECK (isCompleted IN (0, 1)),
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent')),
    startAt TEXT,
    dueAt TEXT,
    reminderAt TEXT,
    sourceType TEXT NOT NULL,
    sourceId TEXT,
    sourceUrl TEXT,
    originalContent TEXT NOT NULL,
    contentGeneratedByAi INTEGER NOT NULL DEFAULT 0 CHECK (contentGeneratedByAi IN (0, 1)),
    notes TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    completedAt TEXT,
    archivedAt TEXT,
    deletedAt TEXT
  );
  CREATE INDEX t_task_parent_position ON t_task(idParentTask, position);
  CREATE INDEX t_task_project ON t_task(idProject);
  CREATE INDEX t_task_milestone ON t_task(idMilestone);
  CREATE INDEX t_task_state ON t_task(idState);
  -- Nessun UNIQUE(sourceType, sourceId): una sola sorgente esterna può
  -- generare più task (una mail con tre azioni diventa tre task).

  CREATE TABLE t_task_history (
    idTaskHistory TEXT PRIMARY KEY,
    idTask TEXT NOT NULL REFERENCES t_task(idTask) ON DELETE CASCADE,
    field TEXT NOT NULL,
    oldValue TEXT,
    newValue TEXT,
    changedAt TEXT NOT NULL
  );
  CREATE INDEX t_task_history_task ON t_task_history(idTask, changedAt);

  CREATE TABLE t_task_comment (
    idTaskComment TEXT PRIMARY KEY,
    idTask TEXT NOT NULL REFERENCES t_task(idTask) ON DELETE CASCADE,
    body TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX t_task_comment_task ON t_task_comment(idTask, createdAt);

  CREATE TABLE t_tag (
    idTag TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE t_task_tag (
    idTask TEXT NOT NULL REFERENCES t_task(idTask) ON DELETE CASCADE,
    idTag TEXT NOT NULL REFERENCES t_tag(idTag) ON DELETE CASCADE,
    PRIMARY KEY (idTask, idTag)
  );
  CREATE INDEX t_task_tag_tag ON t_task_tag(idTag);

  CREATE TABLE t_attachment (
    idAttachment TEXT PRIMARY KEY,
    idTask TEXT NOT NULL REFERENCES t_task(idTask) ON DELETE CASCADE,
    fileName TEXT NOT NULL,
    filePath TEXT NOT NULL,
    mimeType TEXT,
    sizeBytes INTEGER,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX t_attachment_task ON t_attachment(idTask);
`;

/* `isCompleted` non è mai scritto a mano: due trigger lo tengono allineato allo
   stato corrente, così non può disallinearsi nemmeno se qualcuno scrive
   direttamente sul database.

   Il `WHEN` non è un dettaglio: senza, l'UPDATE del trigger riscriverebbe una
   riga già corretta e — con `recursive_triggers` acceso, che serve altrove —
   si ri-scatenerebbe all'infinito. */
const TRIGGERS = `
  CREATE TRIGGER t_task_completed_on_insert
  AFTER INSERT ON t_task
  WHEN NEW.isCompleted <> (SELECT isEndState FROM t_state WHERE idState = NEW.idState)
  BEGIN
    UPDATE t_task
       SET isCompleted = (SELECT isEndState FROM t_state WHERE idState = NEW.idState)
     WHERE idTask = NEW.idTask;
  END;

  CREATE TRIGGER t_task_completed_on_state_change
  AFTER UPDATE OF idState ON t_task
  WHEN NEW.isCompleted <> (SELECT isEndState FROM t_state WHERE idState = NEW.idState)
  BEGIN
    UPDATE t_task
       SET isCompleted = (SELECT isEndState FROM t_state WHERE idState = NEW.idState)
     WHERE idTask = NEW.idTask;
  END;
`;

function tableExists(database, name) {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

/* Le quattro righe che la versione 5 inserisce in `statuses` appena crea la
   tabella. Trovarle intatte significa che l'utente non ha mai toccato gli
   stati: non c'è nessuna configurazione da preservare. */
const STATUSES_DI_DEFAULT = ["inbox", "active", "completed", "archived"].join("|");

/* Gli stati: se l'utente ne aveva configurati, si portano avanti quelli —
   buttarli via perderebbe una configurazione sua. Il seed nuovo vale quando
   `statuses` non esiste, oppure contiene ancora esattamente i suoi quattro
   valori di fabbrica: in quel caso non c'è niente da conservare, e usare il
   seed nuovo è l'unico modo di ottenere "Nuovo" e "Migrato" su un database
   appena creato (che passa comunque da tutte le migrazioni vecchie).

   In tutti i casi si esce con gli invarianti garantiti: esattamente uno stato
   di partenza, almeno uno di chiusura. */
function migrateStates(database, now) {
  const insert = database.prepare(
    "INSERT INTO t_state (label, isStartState, isEndState, stepOrder) VALUES (?, ?, ?, ?)",
  );

  let righe = [];
  if (tableExists(database, "statuses")) {
    righe = database.prepare("SELECT key, label, type, position FROM statuses ORDER BY position").all();
    if (righe.map((r) => r.key).join("|") === STATUSES_DI_DEFAULT) {
      righe = [];
    }
  }

  if (righe.length === 0) {
    SEED_STATES.forEach((s) => insert.run(s.label, s.isStartState, s.isEndState, s.stepOrder));
    return;
  }

  /* Più stati di "apertura" nella vecchia tabella sono possibili; nel nuovo
     modello ne è ammesso uno solo, quindi il primo per posizione resta di
     partenza e gli altri diventano intermedi. */
  let startAssegnato = false;
  let almenoUnoFinale = false;
  righe.forEach((r, i) => {
    let isStart = 0;
    let isEnd = 0;
    if (r.type === "apertura" && !startAssegnato) {
      isStart = 1;
      startAssegnato = true;
    } else if (r.type === "chiusura") {
      isEnd = 1;
      almenoUnoFinale = true;
    }
    insert.run(r.label ?? r.key, isStart, isEnd, i + 1);
  });

  if (!startAssegnato) {
    insert.run("Da fare", 1, 0, 0);
  }
  if (!almenoUnoFinale) {
    insert.run("Fatto", 0, 1, righe.length + 1);
  }
}

function statesByLabel(database) {
  const mappa = new Map();
  for (const s of database.prepare("SELECT idState, label FROM t_state").all()) {
    mappa.set(s.label.toLowerCase(), s.idState);
  }
  return mappa;
}

function startStateId(database) {
  return database.prepare("SELECT idState FROM t_state WHERE isStartState = 1").get().idState;
}

function lastEndStateId(database) {
  return database
    .prepare("SELECT idState FROM t_state WHERE isEndState = 1 ORDER BY stepOrder DESC LIMIT 1")
    .get().idState;
}

/* Migrazione dei dati esistenti. Tutto ciò che non trova corrispondenza viene
   scartato con criterio, mai inventato: `items.list` senza una `lists` con quel
   nome non crea una milestone improvvisata, il task resta senza. */
function migrateData(database, now) {
  if (!tableExists(database, "items")) return;

  const perEtichetta = statesByLabel(database);
  const idStart = startStateId(database);
  const idFatto = perEtichetta.get("fatto") ?? lastEndStateId(database);

  /* `items.status` contiene la *chiave* di `statuses`, non l'etichetta. Il
     ponte passa quindi per l'etichetta: la chiave dice quale riga di
     `statuses`, la sua etichetta dice quale `t_state`. Per le quattro chiavi
     di fabbrica, che sono state rinominate nel modello nuovo (`inbox` →
     "Nuovo"), vale invece la tabella di traduzione. */
  const statoPerChiave = new Map();
  if (tableExists(database, "statuses")) {
    for (const r of database.prepare("SELECT key, label FROM statuses").all()) {
      const id = perEtichetta.get(String(r.label).toLowerCase());
      if (id !== undefined) statoPerChiave.set(r.key, id);
    }
  }
  for (const [chiave, etichetta] of Object.entries(STATUS_TO_LABEL)) {
    if (!statoPerChiave.has(chiave)) {
      const id = perEtichetta.get(etichetta.toLowerCase());
      if (id !== undefined) statoPerChiave.set(chiave, id);
    }
  }

  /* progetti → t_project, conservando gli id esistenti */
  if (tableExists(database, "projects")) {
    const ins = database.prepare(
      "INSERT OR IGNORE INTO t_project (idProject, name, color, position, createdAt) VALUES (?, ?, ?, ?, ?)",
    );
    for (const p of database.prepare("SELECT * FROM projects ORDER BY position").all()) {
      ins.run(p.id, p.name, p.color, p.position, p.created_at ?? now);
    }
  }

  /* liste → t_milestone: non sono più task, sono parte del progetto */
  if (tableExists(database, "lists")) {
    const ins = database.prepare(
      "INSERT OR IGNORE INTO t_milestone (idMilestone, idProject, label, position, createdAt) VALUES (?, ?, ?, ?, ?)",
    );
    for (const l of database.prepare("SELECT * FROM lists ORDER BY project_id, position").all()) {
      ins.run(l.id, l.project_id, l.name, l.position, l.created_at ?? now);
    }
  }

  const progettoPerNome = new Map(
    database.prepare("SELECT idProject, name FROM t_project").all().map((p) => [p.name, p.idProject]),
  );
  const milestonePerChiave = new Map(
    database
      .prepare("SELECT idMilestone, idProject, label FROM t_milestone")
      .all()
      .map((m) => [`${m.idProject} ${m.label}`, m.idMilestone]),
  );

  const insTask = database.prepare(`
    INSERT INTO t_task (
      idTask, idParentTask, idProject, idMilestone, idState, isCompleted,
      title, description, priority, startAt, dueAt, reminderAt,
      sourceType, sourceId, sourceUrl, originalContent, contentGeneratedByAi,
      notes, position, createdAt, updatedAt, completedAt, archivedAt, deletedAt
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const items = database.prepare("SELECT * FROM items ORDER BY created_at").all();
  const progettoDelTask = new Map();
  const milestoneDelTask = new Map();

  items.forEach((it, i) => {
    const idProject = it.project ? (progettoPerNome.get(it.project) ?? null) : null;
    /* `items.list` è testo libero senza vincolo: si aggancia solo se esiste
       davvero una milestone con quel nome in quel progetto. */
    const idMilestone =
      idProject && it.list ? (milestonePerChiave.get(`${idProject} ${it.list}`) ?? null) : null;
    const idState = statoPerChiave.get(it.status) ?? idStart;

    insTask.run(
      it.id, null, idProject, idMilestone, idState,
      it.title, it.description ?? null, it.priority, it.start_at ?? null, it.due_at ?? null,
      it.reminder_at ?? null, it.source_type, it.source_id ?? null, it.source_url ?? null,
      it.original_content, it.content_generated_by_ai ?? 0, it.notes ?? null, i,
      it.created_at, it.updated_at, it.completed_at ?? null, it.archived_at ?? null, it.deleted_at ?? null,
    );
    progettoDelTask.set(it.id, idProject);
    milestoneDelTask.set(it.id, idMilestone);
  });

  /* sotto-task → task veri, che ereditano progetto e milestone dal padre per
     rispettare l'invariante di coerenza */
  if (tableExists(database, "subtasks")) {
    for (const s of database.prepare("SELECT * FROM subtasks ORDER BY item_id, position").all()) {
      if (!progettoDelTask.has(s.item_id)) continue;
      insTask.run(
        s.id, s.item_id, progettoDelTask.get(s.item_id) ?? null, milestoneDelTask.get(s.item_id) ?? null,
        s.done === 1 ? idFatto : idStart,
        s.title, null, "none", null, null, null,
        "manual", null, null, s.title, 0, null, s.position,
        s.created_at ?? now, s.created_at ?? now, s.done === 1 ? (s.created_at ?? now) : null, null, null,
      );
    }
  }

  if (tableExists(database, "item_history")) {
    const ins = database.prepare(
      "INSERT INTO t_task_history (idTaskHistory, idTask, field, oldValue, newValue, changedAt) VALUES (?, ?, ?, ?, ?, ?)",
    );
    /* Lo storico vecchio è un diario di eventi (`event_type` + `details`), non
       un registro di campi cambiati come quello nuovo. Non c'è modo di
       ricostruire il valore precedente da lì, quindi l'evento entra come tipo
       nel campo `field` e il suo dettaglio come nuovo valore: si conserva la
       cronologia leggibile senza inventare un `oldValue` che non è mai stato
       registrato. */
    for (const h of database.prepare("SELECT * FROM item_history").all()) {
      if (!progettoDelTask.has(h.item_id)) continue;
      ins.run(h.id, h.item_id, h.event_type, null, h.details ?? null, h.occurred_at);
    }
  }

  if (tableExists(database, "item_comments")) {
    const ins = database.prepare(
      "INSERT INTO t_task_comment (idTaskComment, idTask, body, createdAt) VALUES (?, ?, ?, ?)",
    );
    for (const c of database.prepare("SELECT * FROM item_comments").all()) {
      if (!progettoDelTask.has(c.item_id)) continue;
      ins.run(c.id, c.item_id, c.body, c.created_at);
    }
  }

  /* I tag erano una stringa JSON su `items`: diventano righe, che è la forma
     prevista dalla specifica. */
  const insTag = database.prepare(
    "INSERT OR IGNORE INTO t_tag (idTag, label, createdAt) VALUES (?, ?, ?)",
  );
  const insLegame = database.prepare(
    "INSERT OR IGNORE INTO t_task_tag (idTask, idTag) VALUES (?, ?)",
  );
  for (const it of items) {
    let etichette = [];
    try {
      etichette = JSON.parse(it.tags ?? "[]");
    } catch {
      etichette = [];
    }
    for (const etichetta of etichette) {
      const idTag = `tag-${String(etichetta).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      insTag.run(idTag, String(etichetta), now);
      insLegame.run(it.id, idTag);
    }
  }
}

/* Su un database nuovo non c'è niente da migrare: si semina la stessa struttura
   di progetti che la vecchia versione 6 creava, tradotta nel modello nuovo
   (le "liste" diventano milestone). Serve a non far partire l'applicazione su
   un database completamente vuoto. */
const SEED_PROJECTS = [
  { id: "pr-casa", name: "Casa", color: "#45aeee", milestones: ["Generale", "Manutenzione", "Bollette"] },
  { id: "pr-lavoro", name: "Lavoro", color: "#c78bff", milestones: ["Generale", "Clienti", "Amministrazione"] },
  { id: "pr-salute", name: "Salute", color: "#3ddc97", milestones: ["Generale", "Visite", "Allenamento"] },
  { id: "pr-personale", name: "Personale", color: "#ffb454", milestones: ["Generale", "Obiettivi", "Tempo libero"] },
];

function seedProjects(database, now) {
  if (database.prepare("SELECT COUNT(*) AS c FROM t_project").get().c > 0) return;

  const insProgetto = database.prepare(
    "INSERT INTO t_project (idProject, name, color, position, createdAt) VALUES (?, ?, ?, ?, ?)",
  );
  const insMilestone = database.prepare(
    "INSERT INTO t_milestone (idMilestone, idProject, label, position, createdAt) VALUES (?, ?, ?, ?, ?)",
  );
  SEED_PROJECTS.forEach((p, i) => {
    insProgetto.run(p.id, p.name, p.color, i, now);
    p.milestones.forEach((label, j) => {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "");
      insMilestone.run(`ms-${p.id.slice(3)}-${slug}`, p.id, label, j, now);
    });
  });
}

export function migrateRinascita(database) {
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(DDL);
    migrateStates(database, now);
    migrateData(database, now);
    seedProjects(database, now);
    /* I trigger si creano dopo la migrazione: durante il travaso `isCompleted`
       viene ricalcolato in blocco qui sotto, senza farlo scattare riga per riga. */
    database.exec(TRIGGERS);
    database.exec(`
      UPDATE t_task
         SET isCompleted = (SELECT isEndState FROM t_state WHERE idState = t_task.idState)
    `);
    database.exec(`PRAGMA user_version = ${RINASCITA_VERSION}`);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
