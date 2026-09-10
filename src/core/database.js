import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { RINASCITA_VERSION, migrateRinascita } from "./rinascita-schema.js";

/* Versione corrente dello schema, cioe il capolinea della catena di migrazioni
   qui sotto. `RINASCITA_VERSION` (7) resta il gradino in cui e arrivato lo
   schema nuovo: i passi successivi lo estendono e non lo rifanno, quindi da 7
   in avanti la versione buona da confrontare e questa. */
export const SCHEMA_VERSION = 9;

export function openDatabase(databasePath) {
  if (typeof databasePath !== "string" || databasePath.trim() === "") {
    throw new TypeError("databasePath must be a non-empty string");
  }

  if (databasePath !== ":memory:") {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");

  if (databasePath !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL");
    // Il binding node:sqlite del processo main di Electron non sembra
    // agganciarsi in modo affidabile al file -wal scritto da altre
    // connessioni (osservato concretamente: una connessione separata vede
    // dati che quella di Electron non vede, e viceversa). Il checkpoint
    // esplicito ad ogni apertura forza la sincronizzazione con il file
    // principale, così qualunque connessione riparte sempre dallo stato
    // realmente più recente indipendentemente da questo comportamento.
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  migrate(database);
  return database;
}

function migrate(database) {
  const version = database.prepare("PRAGMA user_version").get().user_version;

  if (version < 1) {
    database.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL CHECK (status IN ('inbox', 'active', 'completed', 'archived')),
        priority TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent')),
        due_at TEXT,
        reminder_at TEXT,
        source_type TEXT NOT NULL,
        source_id TEXT,
        source_url TEXT,
        original_content TEXT NOT NULL,
        content_generated_by_ai INTEGER NOT NULL DEFAULT 0 CHECK (content_generated_by_ai IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        archived_at TEXT,
        deleted_at TEXT
      );

      CREATE TABLE item_history (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        details TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX items_source_identity
        ON items(source_type, source_id)
        WHERE source_id IS NOT NULL;
      CREATE INDEX items_status_created_at ON items(status, created_at DESC);
      CREATE INDEX items_due_at ON items(due_at) WHERE due_at IS NOT NULL;
      CREATE INDEX items_reminder_at ON items(reminder_at) WHERE reminder_at IS NOT NULL;
      CREATE INDEX items_deleted_at ON items(deleted_at) WHERE deleted_at IS NOT NULL;
      CREATE INDEX item_history_item_id ON item_history(item_id, occurred_at);

      PRAGMA user_version = 1;
      COMMIT;
    `);
  }

  if (version < 2) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE items ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE items ADD COLUMN project TEXT;
      PRAGMA user_version = 2;
      COMMIT;
    `);
  }

  if (version < 3) {
    database.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE subtasks (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE TABLE item_comments (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE INDEX subtasks_item_id ON subtasks(item_id, position);
      CREATE INDEX item_comments_item_id ON item_comments(item_id, created_at);

      PRAGMA user_version = 3;
      COMMIT;
    `);
  }

  if (version < 4) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE items ADD COLUMN list TEXT;
      ALTER TABLE items ADD COLUMN start_at TEXT;
      ALTER TABLE items ADD COLUMN notes TEXT;
      PRAGMA user_version = 4;
      COMMIT;
    `);
  }

  if (version < 5) {
    // Gli stati diventano configurabili: la tabella items non può più vincolare
    // la colonna status a un CHECK statico, quindi va ricostruita senza.
    database.exec("PRAGMA foreign_keys = OFF");
    database.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE statuses (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('apertura', 'in_corso', 'chiusura')),
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      INSERT INTO statuses (id, key, label, type, position, created_at) VALUES
        ('st-inbox', 'inbox', 'Da fare', 'apertura', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('st-active', 'active', 'In corso', 'in_corso', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('st-completed', 'completed', 'Fatto', 'chiusura', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('st-archived', 'archived', 'Archiviato', 'chiusura', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

      CREATE INDEX statuses_position ON statuses(position);

      CREATE TABLE items_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        priority TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent')),
        due_at TEXT,
        start_at TEXT,
        reminder_at TEXT,
        source_type TEXT NOT NULL,
        source_id TEXT,
        source_url TEXT,
        original_content TEXT NOT NULL,
        content_generated_by_ai INTEGER NOT NULL DEFAULT 0 CHECK (content_generated_by_ai IN (0, 1)),
        tags TEXT NOT NULL DEFAULT '[]',
        project TEXT,
        list TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        archived_at TEXT,
        deleted_at TEXT
      );

      INSERT INTO items_new (
        id, title, description, status, priority, due_at, start_at, reminder_at,
        source_type, source_id, source_url, original_content, content_generated_by_ai,
        tags, project, list, notes, created_at, updated_at, completed_at, archived_at, deleted_at
      )
      SELECT
        id, title, description, status, priority, due_at, start_at, reminder_at,
        source_type, source_id, source_url, original_content, content_generated_by_ai,
        tags, project, list, notes, created_at, updated_at, completed_at, archived_at, deleted_at
      FROM items;

      DROP TABLE items;
      ALTER TABLE items_new RENAME TO items;

      CREATE UNIQUE INDEX items_source_identity
        ON items(source_type, source_id)
        WHERE source_id IS NOT NULL;
      CREATE INDEX items_status_created_at ON items(status, created_at DESC);
      CREATE INDEX items_due_at ON items(due_at) WHERE due_at IS NOT NULL;
      CREATE INDEX items_reminder_at ON items(reminder_at) WHERE reminder_at IS NOT NULL;
      CREATE INDEX items_deleted_at ON items(deleted_at) WHERE deleted_at IS NOT NULL;

      PRAGMA user_version = 5;
      COMMIT;
    `);
    database.exec("PRAGMA foreign_keys = ON");
  }

  if (version < 6) {
    database.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE lists (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE (project_id, name)
      );

      CREATE INDEX projects_position ON projects(position);
      CREATE INDEX lists_project_id ON lists(project_id, position);

      INSERT INTO projects (id, name, color, position, created_at) VALUES
        ('pr-casa', 'Casa', '#45aeee', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('pr-lavoro', 'Lavoro', '#c78bff', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('pr-salute', 'Salute', '#3ddc97', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('pr-personale', 'Personale', '#ffb454', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

      INSERT INTO lists (id, project_id, name, position, created_at) VALUES
        ('ls-casa-generale', 'pr-casa', 'Generale', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-casa-manutenzione', 'pr-casa', 'Manutenzione', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-casa-bollette', 'pr-casa', 'Bollette', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-lavoro-generale', 'pr-lavoro', 'Generale', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-lavoro-clienti', 'pr-lavoro', 'Clienti', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-lavoro-amministrazione', 'pr-lavoro', 'Amministrazione', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-salute-generale', 'pr-salute', 'Generale', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-salute-visite', 'pr-salute', 'Visite', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-salute-allenamento', 'pr-salute', 'Allenamento', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-personale-generale', 'pr-personale', 'Generale', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-personale-obiettivi', 'pr-personale', 'Obiettivi', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('ls-personale-tempolibero', 'pr-personale', 'Tempo libero', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

      PRAGMA user_version = 6;
      COMMIT;
    `);
  }

  if (version < RINASCITA_VERSION) {
    // Lo schema "Rinascita": t_task ricorsiva al posto di items+subtasks,
    // t_milestone al posto di lists, t_state al posto di statuses. Le vecchie
    // tabelle restano in piedi finché il resto dell'applicazione non è passato
    // al nuovo core — la migrazione le legge, non le tocca.
    migrateRinascita(database);
  }

  if (version < 8) {
    /* `isInbox`: il flag che dice "questo task è ancora da smistare".
       Deciso il 2026-09-10 (vedi Rinascita.md, § Stati speciali del task).

       È un campo dedicato e non una condizione derivata — non "senza progetto",
       non "senza date" — perché un task in triage deve poter essere messo in
       agenda o assegnato a un progetto **restando** da smistare. Derivarlo
       legherebbe fra loro due cose che devono restare indipendenti.

       Il travaso dei task esistenti traduce quello che il modello sapeva dire
       finora: la colonna Inbox mostrava i task di primo livello senza progetto,
       e quelli diventano gli unici `isInbox = 1`. Non è una ricostruzione dello
       storico — quel dato non c'era — è la fotografia di ciò che l'interfaccia
       stava già chiamando "da smistare".

       Aggiunto qui e non nel DDL della Rinascita di proposito: un database
       nuovo passa da `migrateRinascita` (che si ferma a `user_version` 7) e poi
       da questo passo, quindi la colonna nasce in un solo punto invece di
       essere descritta due volte e poter divergere. */
    database.exec(`
      BEGIN IMMEDIATE;

      ALTER TABLE t_task
        ADD COLUMN isInbox INTEGER NOT NULL DEFAULT 1 CHECK (isInbox IN (0, 1));

      UPDATE t_task
         SET isInbox = CASE
               WHEN idParentTask IS NULL AND idProject IS NULL THEN 1
               ELSE 0
             END;

      CREATE INDEX t_task_inbox ON t_task(isInbox) WHERE isInbox = 1;

      PRAGMA user_version = 8;
      COMMIT;
    `);
  }

  if (version < 9) {
    /* `isNew`: il flag della notifica, non dello stato di lavoro.

       Dice una cosa sola — "questa origine e arrivata e nessuno l'ha ancora
       guardata" — e serve al pallino azzurro sulla linea "Inbox", che nella
       vista divisa e l'unico posto da cui si puo sapere che nella Full Inbox e
       arrivato qualcosa.

       Perche non derivarlo. Le due cose che sembrano gia dirlo non lo dicono:
       `isInbox` e la posizione nel flusso (un'origine resta da smistare per
       giorni dopo che l'hai vista), e `createdAt` misura l'eta, non lo sguardo
       — con una soglia a tempo il pallino tornerebbe a spegnersi da solo.
       "Visto" e un fatto dell'utente, e i fatti dell'utente si scrivono.

       Nasce a 0. Lo accende `createTask` per le sole origini esterne di primo
       livello: un task scritto a mano non ha bisogno di annunciarsi a chi lo
       ha appena scritto (vedi la nota li).

       Il travaso: le origini esterne ancora in triage diventano nuove. Non e
       una ricostruzione dello storico — quel dato non c'era — ma la lettura
       piu vicina al vero, perche fino a oggi nessuno ha potuto guardarle nel
       senso che questo campo intende. Stessa scelta fatta per `isInbox`.

       Nessun indice: il flag si legge sempre insieme al resto della lista, mai
       da solo, e le origini in triage sono decine, non milioni. */
    database.exec(`
      BEGIN IMMEDIATE;

      ALTER TABLE t_task
        ADD COLUMN isNew INTEGER NOT NULL DEFAULT 0 CHECK (isNew IN (0, 1));

      UPDATE t_task
         SET isNew = 1
       WHERE idParentTask IS NULL
         AND isInbox = 1
         AND deletedAt IS NULL
         AND sourceType IS NOT NULL
         AND sourceType <> 'manual';

      PRAGMA user_version = ${SCHEMA_VERSION};
      COMMIT;
    `);
  }
}

export function runInTransaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");

  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
