import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/core/database.js";
import { getSetting, listSettings, removeSettings, setSetting } from "../src/core/task-core.js";

const nuovoDatabase = () => openDatabase(":memory:");

test("una preferenza si scrive e si rilegge com'era, qualunque forma abbia", () => {
  const d = nuovoDatabase();
  setSetting(d, "vista.ordinamento", "scadenza");
  setSetting(d, "lista.gruppiChiusi", ["p-1", "p-2"]);
  setSetting(d, "notifiche.reminder", { attivo: true, minutiPrima: 15 });
  setSetting(d, "inbox.larghezza", 320);
  setSetting(d, "inbox.compatta", false);

  assert.equal(getSetting(d, "vista.ordinamento"), "scadenza");
  assert.deepEqual(getSetting(d, "lista.gruppiChiusi"), ["p-1", "p-2"]);
  assert.deepEqual(getSetting(d, "notifiche.reminder"), { attivo: true, minutiPrima: 15 });
  assert.equal(getSetting(d, "inbox.larghezza"), 320);
  /* `false` deve restare `false` e non diventare il ripiego: è un valore, non
     un'assenza. È l'errore classico di chi scrive `valore || ripiego`. */
  assert.equal(getSetting(d, "inbox.compatta", true), false);
  d.close();
});

test("riscrivere una preferenza la sostituisce, non ne aggiunge una seconda", () => {
  const d = nuovoDatabase();
  setSetting(d, "vista.ordinamento", "scadenza");
  setSetting(d, "vista.ordinamento", "priorita");
  assert.equal(getSetting(d, "vista.ordinamento"), "priorita");
  assert.equal(Object.keys(listSettings(d)).length, 1);
  d.close();
});

/* Il primo avvio, e ogni avvio dopo un cambio di interfaccia: la chiave non c'è
   e non è un errore. */
test("una preferenza mai scritta restituisce il ripiego", () => {
  const d = nuovoDatabase();
  assert.equal(getSetting(d, "mai.scritta", "predefinito"), "predefinito");
  assert.equal(getSetting(d, "mai.scritta"), null, "senza ripiego, niente");
  d.close();
});

/* Il prezzo dichiarato di chiave-valore: il database non può garantire che
   dentro ci sia qualcosa di sensato. La garanzia sta nel lettore. */
test("una preferenza illeggibile vale come assente, non esplode", () => {
  const d = nuovoDatabase();
  d.prepare("INSERT INTO t_setting (chiave, valore) VALUES (?, ?)").run("rotta", "{non json");
  assert.equal(getSetting(d, "rotta", "ripiego"), "ripiego");
  /* E non fa cadere nemmeno la lettura in blocco, dove trascinerebbe con sé
     tutte le preferenze sane. */
  d.prepare("INSERT INTO t_setting (chiave, valore) VALUES (?, ?)").run("sana", '"va bene"');
  assert.deepEqual(listSettings(d), { sana: "va bene" });
  d.close();
});

/* "Non ho una preferenza" e "la mia preferenza è niente" sono la stessa cosa
   per chi legge: tenerle distinte sarebbe due modi di dire lo stesso. */
test("scrivere null o undefined cancella invece di salvare \"null\"", () => {
  const d = nuovoDatabase();
  setSetting(d, "vista.ordinamento", "scadenza");

  const esito = setSetting(d, "vista.ordinamento", null);
  assert.equal(esito.rimossa, true);
  assert.deepEqual(listSettings(d), {});
  assert.equal(getSetting(d, "vista.ordinamento", "manuale"), "manuale");

  setSetting(d, "altra", "x");
  setSetting(d, "altra", undefined);
  assert.deepEqual(listSettings(d), {});
  d.close();
});

test("le preferenze si leggono per famiglia, dal prefisso", () => {
  const d = nuovoDatabase();
  setSetting(d, "lista.gruppiChiusi", ["p-1"]);
  setSetting(d, "lista.ordinamento", "titolo");
  setSetting(d, "vista.corrente", "kanban");

  assert.deepEqual(listSettings(d, "lista."), { "lista.gruppiChiusi": ["p-1"], "lista.ordinamento": "titolo" });
  assert.equal(Object.keys(listSettings(d)).length, 3, "senza prefisso ci sono tutte");
  d.close();
});

/* Quando una schermata cambia, le sue preferenze non vogliono più dire niente:
   si buttano per nome di famiglia, senza doverle elencare una a una. */
test("un gruppo intero si cancella dal prefisso, e gli altri restano", () => {
  const d = nuovoDatabase();
  setSetting(d, "lista.gruppiChiusi", ["p-1"]);
  setSetting(d, "lista.ordinamento", "titolo");
  setSetting(d, "vista.corrente", "kanban");

  const esito = removeSettings(d, "lista.");
  assert.equal(esito.rimosse, 2);
  assert.deepEqual(listSettings(d), { "vista.corrente": "kanban" });
  d.close();
});

test("le preferenze sopravvivono alla chiusura del database", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const cartella = mkdtempSync(join(tmpdir(), "alia-set-"));
  const percorso = join(cartella, "alia.sqlite");

  try {
    const primo = openDatabase(percorso);
    setSetting(primo, "lista.gruppiChiusi", ["p-1", "p-2"]);
    primo.close();

    const secondo = openDatabase(percorso);
    assert.deepEqual(getSetting(secondo, "lista.gruppiChiusi"), ["p-1", "p-2"]);
    secondo.close();
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});
