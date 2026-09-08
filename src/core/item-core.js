import { randomUUID } from "node:crypto";
import { openDatabase, runInTransaction } from "./database.js";

export const ITEM_STATUSES = Object.freeze([
  "inbox",
  "active",
  "completed",
  "archived",
]);

export const ITEM_PRIORITIES = Object.freeze([
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);

export const STATUS_TYPES = Object.freeze(["apertura", "in_corso", "chiusura"]);

const STATUS_UPDATE_FIELDS = new Set(["label", "type"]);

const CREATE_FIELDS = new Set([
  "title",
  "description",
  "status",
  "priority",
  "dueAt",
  "startAt",
  "reminderAt",
  "sourceType",
  "sourceId",
  "sourceUrl",
  "originalContent",
  "contentGeneratedByAi",
  "tags",
  "project",
  "list",
  "notes",
]);

const UPDATE_FIELDS = new Set([
  "title",
  "description",
  "priority",
  "dueAt",
  "startAt",
  "reminderAt",
  "contentGeneratedByAi",
  "tags",
  "project",
  "list",
  "notes",
]);

export class ItemValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ItemValidationError";
  }
}

export class ItemNotFoundError extends Error {
  constructor(id) {
    super(`Item not found: ${id}`);
    this.name = "ItemNotFoundError";
    this.itemId = id;
  }
}

export function createItemCore({ databasePath, clock = () => new Date() } = {}) {
  return new ItemCore(openDatabase(databasePath), clock);
}

class ItemCore {
  #database;
  #clock;

  constructor(database, clock) {
    if (typeof clock !== "function") {
      throw new TypeError("clock must be a function");
    }

    this.#database = database;
    this.#clock = clock;
  }

  createItem(input) {
    assertPlainObject(input, "item");
    assertKnownFields(input, CREATE_FIELDS);

    const now = this.#now();
    const item = {
      id: randomUUID(),
      title: normalizeTitle(input.title),
      description: normalizeNullableText(input.description, "description"),
      status: normalizeChoice(input.status ?? "inbox", ITEM_STATUSES, "status"),
      priority: normalizeChoice(input.priority ?? "none", ITEM_PRIORITIES, "priority"),
      dueAt: normalizeDate(input.dueAt, "dueAt"),
      startAt: normalizeDate(input.startAt, "startAt"),
      reminderAt: normalizeDate(input.reminderAt, "reminderAt"),
      sourceType: normalizeSourceType(input.sourceType ?? "manual"),
      sourceId: normalizeNullableText(input.sourceId, "sourceId"),
      sourceUrl: normalizeNullableText(input.sourceUrl, "sourceUrl"),
      originalContent: normalizeOriginalContent(input),
      contentGeneratedByAi: normalizeBoolean(
        input.contentGeneratedByAi ?? false,
        "contentGeneratedByAi",
      ),
      tags: normalizeTags(input.tags),
      project: normalizeNullableText(input.project, "project"),
      list: normalizeNullableText(input.list, "list"),
      notes: normalizeNullableText(input.notes, "notes"),
      createdAt: now,
      updatedAt: now,
      completedAt: input.status === "completed" ? now : null,
      archivedAt: input.status === "archived" ? now : null,
      deletedAt: null,
    };

    runInTransaction(this.#database, () => {
      this.#database.prepare(`
        INSERT INTO items (
          id, title, description, status, priority, due_at, start_at, reminder_at,
          source_type, source_id, source_url, original_content,
          content_generated_by_ai, tags, project, list, notes, created_at, updated_at,
          completed_at, archived_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.id,
        item.title,
        item.description,
        item.status,
        item.priority,
        item.dueAt,
        item.startAt,
        item.reminderAt,
        item.sourceType,
        item.sourceId,
        item.sourceUrl,
        item.originalContent,
        item.contentGeneratedByAi ? 1 : 0,
        JSON.stringify(item.tags),
        item.project,
        item.list,
        item.notes,
        item.createdAt,
        item.updatedAt,
        item.completedAt,
        item.archivedAt,
        item.deletedAt,
      );
      this.#recordHistory(item.id, "item.created", { item }, now);
    });

    return item;
  }

  getItem(id, { includeDeleted = false } = {}) {
    assertId(id);
    const sql = includeDeleted
      ? "SELECT * FROM items WHERE id = ?"
      : "SELECT * FROM items WHERE id = ? AND deleted_at IS NULL";
    const row = this.#database.prepare(sql).get(id);

    if (!row) {
      throw new ItemNotFoundError(id);
    }

    const item = mapItem(row);
    item.subtasks = this.#database.prepare(`
      SELECT id, title, done, position FROM subtasks WHERE item_id = ? ORDER BY position ASC
    `).all(id).map((r) => ({ id: r.id, title: r.title, done: r.done === 1 }));
    item.comments = this.#database.prepare(`
      SELECT id, author, body, created_at FROM item_comments WHERE item_id = ? ORDER BY created_at ASC
    `).all(id).map((r) => ({ id: r.id, author: r.author, body: r.body, createdAt: r.created_at }));
    return item;
  }

  listItems(filters = {}) {
    assertPlainObject(filters, "filters");
    const allowedFilters = new Set([
      "status",
      "priority",
      "sourceType",
      "search",
      "dueBefore",
      "dueAfter",
      "includeDeleted",
      "limit",
      "offset",
      "orderBy",
      "orderDirection",
    ]);
    assertKnownFields(filters, allowedFilters);

    const where = [];
    const parameters = [];

    if (!filters.includeDeleted) {
      where.push("deleted_at IS NULL");
    }
    if (filters.status !== undefined) {
      where.push("status = ?");
      parameters.push(normalizeChoice(filters.status, ITEM_STATUSES, "status"));
    }
    if (filters.priority !== undefined) {
      where.push("priority = ?");
      parameters.push(normalizeChoice(filters.priority, ITEM_PRIORITIES, "priority"));
    }
    if (filters.sourceType !== undefined) {
      where.push("source_type = ?");
      parameters.push(normalizeSourceType(filters.sourceType));
    }
    if (filters.search !== undefined) {
      const search = normalizeRequiredText(filters.search, "search");
      where.push("(instr(lower(title), lower(?)) > 0 OR instr(lower(coalesce(description, '')), lower(?)) > 0)");
      parameters.push(search, search);
    }
    if (filters.dueBefore !== undefined) {
      where.push("due_at <= ?");
      parameters.push(normalizeDate(filters.dueBefore, "dueBefore"));
    }
    if (filters.dueAfter !== undefined) {
      where.push("due_at >= ?");
      parameters.push(normalizeDate(filters.dueAfter, "dueAfter"));
    }

    const orderColumns = {
      createdAt: "created_at",
      updatedAt: "updated_at",
      dueAt: "due_at",
      priority: "CASE priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END",
    };
    const orderBy = filters.orderBy ?? "createdAt";
    if (!(orderBy in orderColumns)) {
      throw new ItemValidationError(`Invalid orderBy: ${orderBy}`);
    }

    const direction = String(filters.orderDirection ?? "desc").toLowerCase();
    if (direction !== "asc" && direction !== "desc") {
      throw new ItemValidationError("orderDirection must be asc or desc");
    }

    const limit = normalizeInteger(filters.limit ?? 100, "limit", 1, 200);
    const offset = normalizeInteger(filters.offset ?? 0, "offset", 0, Number.MAX_SAFE_INTEGER);
    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const rows = this.#database.prepare(`
      SELECT * FROM items
      ${whereClause}
      ORDER BY ${orderColumns[orderBy]} ${direction}, id ASC
      LIMIT ? OFFSET ?
    `).all(...parameters, limit, offset);

    const items = rows.map(mapItem);
    if (items.length > 0) {
      const placeholders = items.map(() => "?").join(",");
      const counts = this.#database.prepare(`
        SELECT item_id, COUNT(*) as total, SUM(done) as done
        FROM subtasks WHERE item_id IN (${placeholders})
        GROUP BY item_id
      `).all(...items.map((i) => i.id));
      const byId = Object.fromEntries(counts.map((c) => [c.item_id, c]));
      for (const item of items) {
        const c = byId[item.id];
        item.subtaskTotal = c ? c.total : 0;
        item.subtaskDone = c ? c.done : 0;
      }
    }

    return items;
  }

  updateItem(id, changes) {
    assertId(id);
    assertPlainObject(changes, "changes");
    assertKnownFields(changes, UPDATE_FIELDS);
    const current = this.getItem(id);
    const assignments = [];
    const parameters = [];
    const appliedChanges = {};

    const fields = {
      title: ["title", normalizeTitle],
      description: ["description", (value) => normalizeNullableText(value, "description")],
      priority: ["priority", (value) => normalizeChoice(value, ITEM_PRIORITIES, "priority")],
      dueAt: ["due_at", (value) => normalizeDate(value, "dueAt")],
      startAt: ["start_at", (value) => normalizeDate(value, "startAt")],
      reminderAt: ["reminder_at", (value) => normalizeDate(value, "reminderAt")],
      contentGeneratedByAi: [
        "content_generated_by_ai",
        (value) => normalizeBoolean(value, "contentGeneratedByAi"),
      ],
      tags: ["tags", normalizeTags],
      project: ["project", (value) => normalizeNullableText(value, "project")],
      list: ["list", (value) => normalizeNullableText(value, "list")],
      notes: ["notes", (value) => normalizeNullableText(value, "notes")],
    };

    for (const [field, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      const [column, normalize] = fields[field];
      const normalized = normalize(value);
      assignments.push(`${column} = ?`);
      parameters.push(
        typeof normalized === "boolean"
          ? Number(normalized)
          : field === "tags"
            ? JSON.stringify(normalized)
            : normalized,
      );
      appliedChanges[field] = { from: current[field], to: normalized };
    }

    if (assignments.length === 0) {
      return current;
    }

    const now = this.#now();
    assignments.push("updated_at = ?");
    parameters.push(now, id);

    runInTransaction(this.#database, () => {
      this.#database.prepare(`
        UPDATE items SET ${assignments.join(", ")} WHERE id = ? AND deleted_at IS NULL
      `).run(...parameters);
      this.#recordHistory(id, "item.updated", { changes: appliedChanges }, now);
    });

    return this.getItem(id);
  }

  completeItem(id) {
    return this.#changeStatus(id, "completed", "item.completed");
  }

  activateItem(id) {
    return this.#changeStatus(id, "active", "item.activated");
  }

  moveToInbox(id) {
    return this.#changeStatus(id, "inbox", "item.moved_to_inbox");
  }

  archiveItem(id) {
    return this.#changeStatus(id, "archived", "item.archived");
  }

  deleteItem(id) {
    const current = this.getItem(id);
    const now = this.#now();

    runInTransaction(this.#database, () => {
      this.#database.prepare(`
        UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL
      `).run(now, now, id);
      this.#recordHistory(id, "item.deleted", { previousStatus: current.status }, now);
    });

    return this.getItem(id, { includeDeleted: true });
  }

  restoreItem(id) {
    const current = this.getItem(id, { includeDeleted: true });
    if (current.deletedAt === null) {
      return current;
    }

    const now = this.#now();
    runInTransaction(this.#database, () => {
      this.#database.prepare(`
        UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?
      `).run(now, id);
      this.#recordHistory(id, "item.restored", {}, now);
    });

    return this.getItem(id);
  }

  addSubtask(itemId, title) {
    this.getItem(itemId);
    const cleanTitle = normalizeRequiredText(title, "title");
    const now = this.#now();
    const id = randomUUID();
    const { pos } = this.#database.prepare(`
      SELECT COALESCE(MAX(position), -1) + 1 as pos FROM subtasks WHERE item_id = ?
    `).get(itemId);

    runInTransaction(this.#database, () => {
      this.#database.prepare(`
        INSERT INTO subtasks (id, item_id, title, done, position, created_at)
        VALUES (?, ?, ?, 0, ?, ?)
      `).run(id, itemId, cleanTitle, pos, now);
      this.#database.prepare("UPDATE items SET updated_at = ? WHERE id = ?").run(now, itemId);
    });

    return this.getItem(itemId);
  }

  toggleSubtask(subtaskId) {
    assertId(subtaskId);
    const row = this.#database.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId);
    if (!row) {
      throw new ItemValidationError(`Subtask not found: ${subtaskId}`);
    }

    const now = this.#now();
    runInTransaction(this.#database, () => {
      this.#database.prepare("UPDATE subtasks SET done = ? WHERE id = ?").run(row.done ? 0 : 1, subtaskId);
      this.#database.prepare("UPDATE items SET updated_at = ? WHERE id = ?").run(now, row.item_id);
    });

    return this.getItem(row.item_id);
  }

  removeSubtask(subtaskId) {
    assertId(subtaskId);
    const row = this.#database.prepare("SELECT * FROM subtasks WHERE id = ?").get(subtaskId);
    if (!row) {
      throw new ItemValidationError(`Subtask not found: ${subtaskId}`);
    }

    const now = this.#now();
    runInTransaction(this.#database, () => {
      this.#database.prepare("DELETE FROM subtasks WHERE id = ?").run(subtaskId);
      this.#database.prepare("UPDATE items SET updated_at = ? WHERE id = ?").run(now, row.item_id);
    });

    return this.getItem(row.item_id);
  }

  addComment(itemId, body) {
    this.getItem(itemId);
    const text = normalizeRequiredText(body, "body");
    const now = this.#now();
    const id = randomUUID();

    runInTransaction(this.#database, () => {
      this.#database.prepare(`
        INSERT INTO item_comments (id, item_id, author, body, created_at)
        VALUES (?, ?, 'user', ?, ?)
      `).run(id, itemId, text, now);
      this.#database.prepare("UPDATE items SET updated_at = ? WHERE id = ?").run(now, itemId);
    });

    return this.getItem(itemId);
  }

  getItemHistory(id) {
    this.getItem(id, { includeDeleted: true });
    return this.#database.prepare(`
      SELECT id, item_id, event_type, details, occurred_at
      FROM item_history
      WHERE item_id = ?
      ORDER BY occurred_at ASC, rowid ASC
    `).all(id).map((row) => ({
      id: row.id,
      itemId: row.item_id,
      eventType: row.event_type,
      details: JSON.parse(row.details),
      occurredAt: row.occurred_at,
    }));
  }

  listStatuses() {
    return this.#database.prepare(`
      SELECT id, key, label, type, position FROM statuses ORDER BY position ASC
    `).all();
  }

  createStatus({ label, type }) {
    const cleanLabel = normalizeRequiredText(label, "label");
    const cleanType = normalizeChoice(type, STATUS_TYPES, "type");
    const now = this.#now();
    const id = randomUUID();
    const key = this.#uniqueStatusKey(cleanLabel);
    const { pos } = this.#database.prepare(`
      SELECT COALESCE(MAX(position), -1) + 1 as pos FROM statuses
    `).get();

    runInTransaction(this.#database, () => {
      this.#database.prepare(`
        INSERT INTO statuses (id, key, label, type, position, created_at) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, key, cleanLabel, cleanType, pos, now);
    });

    return this.listStatuses();
  }

  updateStatus(id, changes) {
    assertPlainObject(changes, "changes");
    assertKnownFields(changes, STATUS_UPDATE_FIELDS);
    const current = this.#getStatus(id);
    const label = changes.label !== undefined ? normalizeRequiredText(changes.label, "label") : current.label;
    const type = changes.type !== undefined ? normalizeChoice(changes.type, STATUS_TYPES, "type") : current.type;

    runInTransaction(this.#database, () => {
      this.#database.prepare("UPDATE statuses SET label = ?, type = ? WHERE id = ?").run(label, type, id);
    });

    return this.listStatuses();
  }

  reorderStatuses(orderedIds) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw new ItemValidationError("orderedIds must be a non-empty array");
    }
    const known = new Set(this.listStatuses().map((s) => s.id));
    for (const id of orderedIds) {
      if (!known.has(id)) {
        throw new ItemValidationError(`Unknown status id: ${id}`);
      }
    }

    runInTransaction(this.#database, () => {
      orderedIds.forEach((id, index) => {
        this.#database.prepare("UPDATE statuses SET position = ? WHERE id = ?").run(index, id);
      });
    });

    return this.listStatuses();
  }

  deleteStatus(id) {
    const current = this.#getStatus(id);
    const all = this.listStatuses();
    if (all.length <= 1) {
      throw new ItemValidationError("Cannot delete the last remaining status");
    }
    const fallback = all.find((s) => s.id !== id && s.type === current.type) ?? all.find((s) => s.id !== id);
    const now = this.#now();

    runInTransaction(this.#database, () => {
      this.#database.prepare(`
        UPDATE items SET status = ?, updated_at = ? WHERE status = ? AND deleted_at IS NULL
      `).run(fallback.key, now, current.key);
      this.#database.prepare("DELETE FROM statuses WHERE id = ?").run(id);
    });

    return this.listStatuses();
  }

  close() {
    this.#database.close();
  }

  #changeStatus(id, status, eventType) {
    const current = this.getItem(id);
    if (current.status === status) {
      return current;
    }

    const now = this.#now();
    const completedAt = status === "completed" ? now : null;
    const archivedAt = status === "archived" ? now : null;

    runInTransaction(this.#database, () => {
      this.#database.prepare(`
        UPDATE items
        SET status = ?, completed_at = ?, archived_at = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL
      `).run(status, completedAt, archivedAt, now, id);
      this.#recordHistory(id, eventType, { from: current.status, to: status }, now);
    });

    return this.getItem(id);
  }

  #recordHistory(itemId, eventType, details, occurredAt) {
    this.#database.prepare(`
      INSERT INTO item_history (id, item_id, event_type, details, occurred_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), itemId, eventType, JSON.stringify(details), occurredAt);
  }

  #now() {
    const value = this.#clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new TypeError("clock returned an invalid date");
    }
    return date.toISOString();
  }

  #getStatus(id) {
    assertId(id);
    const row = this.#database.prepare(`
      SELECT id, key, label, type, position FROM statuses WHERE id = ?
    `).get(id);
    if (!row) {
      throw new ItemValidationError(`Status not found: ${id}`);
    }
    return row;
  }

  #uniqueStatusKey(label) {
    const base = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "stato";
    let key = base;
    let suffix = 2;
    while (this.#database.prepare("SELECT 1 FROM statuses WHERE key = ?").get(key)) {
      key = `${base}-${suffix++}`;
    }
    return key;
  }
}

function mapItem(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    startAt: row.start_at,
    reminderAt: row.reminder_at,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    originalContent: row.original_content,
    contentGeneratedByAi: row.content_generated_by_ai === 1,
    tags: JSON.parse(row.tags),
    project: row.project,
    list: row.list,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  };
}

function normalizeTitle(value) {
  const title = normalizeRequiredText(value, "title");
  if (title.length > 500) {
    throw new ItemValidationError("title cannot exceed 500 characters");
  }
  return title;
}

function normalizeOriginalContent(input) {
  const fallback = input.description ?? input.title;
  return normalizeRequiredText(input.originalContent ?? fallback, "originalContent");
}

function normalizeSourceType(value) {
  const sourceType = normalizeRequiredText(value, "sourceType");
  if (sourceType.length > 100) {
    throw new ItemValidationError("sourceType cannot exceed 100 characters");
  }
  return sourceType;
}

function normalizeTags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ItemValidationError("tags must be an array of strings");
  }
  const tags = [];
  for (const raw of value) {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new ItemValidationError("tags must be non-empty strings");
    }
    const tag = raw.trim();
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function normalizeRequiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ItemValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeNullableText(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ItemValidationError(`${field} must be a string or null`);
  }
  return value.trim() || null;
}

function normalizeDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ItemValidationError(`${field} must be a valid date`);
  }
  return date.toISOString();
}

function normalizeChoice(value, choices, field) {
  if (!choices.includes(value)) {
    throw new ItemValidationError(`${field} must be one of: ${choices.join(", ")}`);
  }
  return value;
}

function normalizeBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new ItemValidationError(`${field} must be a boolean`);
  }
  return value;
}

function normalizeInteger(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ItemValidationError(
      `${field} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ItemValidationError(`${label} must be an object`);
  }
}

function assertKnownFields(value, allowedFields) {
  const unknownFields = Object.keys(value).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw new ItemValidationError(`Unknown fields: ${unknownFields.join(", ")}`);
  }
}

function assertId(id) {
  if (typeof id !== "string" || id.trim() === "") {
    throw new ItemValidationError("id must be a non-empty string");
  }
}
