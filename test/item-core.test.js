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

test("manages subtasks and comments alongside an item", () => {
  const core = createMemoryCore();

  try {
    const item = core.createItem({ title: "Preparare la presentazione" });
    assert.deepEqual(core.getItem(item.id).subtasks, []);
    assert.deepEqual(core.getItem(item.id).comments, []);

    const withSub = core.addSubtask(item.id, "  Esportare i numeri  ");
    assert.equal(withSub.subtasks.length, 1);
    assert.equal(withSub.subtasks[0].title, "Esportare i numeri");
    assert.equal(withSub.subtasks[0].done, false);

    const withSecondSub = core.addSubtask(item.id, "Scrivere la slide");
    assert.equal(withSecondSub.subtasks.length, 2);
    assert.deepEqual(withSecondSub.subtasks.map((s) => s.title), ["Esportare i numeri", "Scrivere la slide"]);

    const toggled = core.toggleSubtask(withSecondSub.subtasks[0].id);
    assert.equal(toggled.subtasks[0].done, true);

    const untoggled = core.toggleSubtask(toggled.subtasks[0].id);
    assert.equal(untoggled.subtasks[0].done, false);

    const removed = core.removeSubtask(untoggled.subtasks[1].id);
    assert.equal(removed.subtasks.length, 1);

    assert.throws(() => core.addSubtask(item.id, "   "), ItemValidationError);
    assert.throws(() => core.toggleSubtask("missing-id"), ItemValidationError);

    const withComment = core.addComment(item.id, "Nota di avanzamento");
    assert.equal(withComment.comments.length, 1);
    assert.equal(withComment.comments[0].author, "user");
    assert.equal(withComment.comments[0].body, "Nota di avanzamento");

    const listed = core.listItems({ limit: 10 }).find((i) => i.id === item.id);
    assert.equal(listed.subtaskTotal, 1);
    assert.equal(listed.subtaskDone, 0);
  } finally {
    core.close();
  }
});

test("manages configurable statuses, reassigning items when one is deleted", () => {
  const core = createMemoryCore();

  try {
    const defaults = core.listStatuses();
    assert.deepEqual(defaults.map((s) => s.key), ["inbox", "active", "completed", "archived"]);

    const withNew = core.createStatus({ label: "In revisione", type: "in_corso" });
    const created = withNew.find((s) => s.label === "In revisione");
    assert.equal(created.type, "in_corso");
    assert.equal(created.key, "in-revisione");
    assert.equal(created.position, 4);

    const renamed = core.updateStatus(created.id, { label: "In review" });
    assert.equal(renamed.find((s) => s.id === created.id).label, "In review");

    const reordered = core.reorderStatuses([created.id, ...defaults.map((s) => s.id)]);
    assert.equal(reordered[0].id, created.id);
    assert.throws(() => core.reorderStatuses(["missing-id"]), ItemValidationError);

    const item = core.createItem({ title: "Verifica bozza" });
    const active = defaults.find((s) => s.key === "active");
    core.updateStatus(active.id, {}); // no-op update keeps fields
    const afterActivate = core.activateItem(item.id);
    assert.equal(afterActivate.status, "active");

    const afterDelete = core.deleteStatus(active.id);
    assert.equal(afterDelete.find((s) => s.key === "active"), undefined);
    const reassigned = core.getItem(item.id);
    assert.notEqual(reassigned.status, "active");

    const remaining = core.listStatuses();
    while (core.listStatuses().length > 1) {
      core.deleteStatus(core.listStatuses()[0].id);
    }
    assert.throws(() => core.deleteStatus(core.listStatuses()[0].id), ItemValidationError);
    assert.equal(remaining.length > 0, true);
  } finally {
    core.close();
  }
});
