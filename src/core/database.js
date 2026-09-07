import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

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
