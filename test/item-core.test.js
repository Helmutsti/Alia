import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ItemNotFoundError,
  ItemValidationError,
  createItemCore,
} from "../src/index.js";

function createMemoryCore() {
  let tick = 0;
  return createItemCore({
    databasePath: ":memory:",
    clock: () => new Date(Date.UTC(2026, 8, 7, 10, 0, tick++)),
  });
}

test("creates an item with safe defaults and preserves the original", () => {
  const core = createMemoryCore();

  try {
    const item = core.createItem({
      title: "  Chiamare il cliente  ",
      description: "Confermare la consegna",
    });

    assert.equal(item.title, "Chiamare il cliente");
    assert.equal(item.status, "inbox");
    assert.equal(item.priority, "none");
    assert.equal(item.sourceType, "manual");
    assert.equal(item.originalContent, "Confermare la consegna");
    assert.equal(item.contentGeneratedByAi, false);
    assert.deepEqual(item.tags, []);
    assert.equal(item.project, null);
    assert.equal(core.getItem(item.id).id, item.id);
  } finally {
    core.close();
  }
});

test("stores and updates tags and project", () => {
  const core = createMemoryCore();

  try {
    const item = core.createItem({
      title: "Fare la spesa",
      tags: ["casa", "casa", "urgente"],
      project: "personale",
    });

    assert.deepEqual(item.tags, ["casa", "urgente"]);
    assert.equal(item.project, "personale");
    assert.deepEqual(core.getItem(item.id).tags, ["casa", "urgente"]);

    const updated = core.updateItem(item.id, { tags: ["lavoro"], project: null });
    assert.deepEqual(updated.tags, ["lavoro"]);
    assert.equal(updated.project, null);
  } finally {
    core.close();
  }
});

test("updates editable fields but rejects changes to provenance", () => {
  const core = createMemoryCore();

  try {
    const item = core.createItem({ title: "Titolo originale" });
    const updated = core.updateItem(item.id, {
      title: "Titolo operativo",
      priority: "high",
      reminderAt: "2026-09-08T09:00:00+02:00",
      contentGeneratedByAi: true,
    });

    assert.equal(updated.title, "Titolo operativo");
    assert.equal(updated.originalContent, "Titolo originale");
    assert.equal(updated.priority, "high");
    assert.equal(updated.reminderAt, "2026-09-08T07:00:00.000Z");
    assert.equal(updated.contentGeneratedByAi, true);
    assert.throws(
      () => core.updateItem(item.id, { originalContent: "Sostituito" }),
      ItemValidationError,
    );
  } finally {
    core.close();
  }
});

test("supports the item lifecycle and records its history", () => {
  const core = createMemoryCore();

  try {
    const item = core.createItem({ title: "Preparare preventivo" });
    assert.equal(core.activateItem(item.id).status, "active");

    const completed = core.completeItem(item.id);
    assert.equal(completed.status, "completed");
    assert.ok(completed.completedAt);

    const reopened = core.activateItem(item.id);
    assert.equal(reopened.status, "active");
    assert.equal(reopened.completedAt, null);

    const archived = core.archiveItem(item.id);
    assert.equal(archived.status, "archived");
    assert.ok(archived.archivedAt);

    assert.deepEqual(
      core.getItemHistory(item.id).map((event) => event.eventType),
      ["item.created", "item.activated", "item.completed", "item.activated", "item.archived"],
    );
  } finally {
    core.close();
  }
});

test("soft-deletes and restores an item", () => {
  const core = createMemoryCore();

  try {
    const item = core.createItem({ title: "Voce recuperabile" });
    const deleted = core.deleteItem(item.id);

    assert.ok(deleted.deletedAt);
    assert.throws(() => core.getItem(item.id), ItemNotFoundError);
    assert.equal(core.listItems().length, 0);
    assert.equal(core.listItems({ includeDeleted: true }).length, 1);

    const restored = core.restoreItem(item.id);
    assert.equal(restored.deletedAt, null);
    assert.equal(core.listItems().length, 1);
  } finally {
    core.close();
  }
});

test("filters and orders items", () => {
  const core = createMemoryCore();

  try {
    core.createItem({ title: "Comprare carta", priority: "low" });
    core.createItem({
      title: "Inviare contratto",
      description: "Contratto cliente Rossi",
      priority: "urgent",
      dueAt: "2026-09-09T12:00:00Z",
    });

    const urgent = core.listItems({ priority: "urgent" });
    assert.equal(urgent.length, 1);
    assert.equal(urgent[0].title, "Inviare contratto");

    const searched = core.listItems({ search: "rossi" });
    assert.equal(searched.length, 1);

    const ordered = core.listItems({ orderBy: "priority", orderDirection: "desc" });
    assert.deepEqual(ordered.map((item) => item.priority), ["urgent", "low"]);
  } finally {
    core.close();
  }
});

test("persists items in a file database", () => {
  const directory = mkdtempSync(join(tmpdir(), "scheduler-core-"));
  const databasePath = join(directory, "scheduler.sqlite");

  try {
    const firstCore = createItemCore({ databasePath });
    const item = firstCore.createItem({ title: "Persistente" });
    firstCore.close();

    const secondCore = createItemCore({ databasePath });
    assert.equal(secondCore.getItem(item.id).title, "Persistente");
    secondCore.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
