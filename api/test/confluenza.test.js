import assert from "node:assert/strict";
import test from "node:test";

import { apriCoda } from "../src/coda.js";
import { avviaServizio } from "../src/servizio.js";

const TOKEN = "t".repeat(32);

function origine(id, titolo) {
  return {
    sourceType: "telegram",
    sourceId: id,
    sourceUrl: null,
    title: titolo,
    originalContent: titolo,
  };
}

/* ── la coda ───────────────────────────────────────────────────────────────── */

test("seq cresce, e la finestra mostra prima le piu' recenti", () => {
  const coda = apriCoda(":memory:");
  const a = coda.accoda(origine("1:1", "la prima arrivata"));
  const b = coda.accoda(origine("1:2", "l'ultima arrivata"));
  assert.ok(b > a, "il seq non cresce");
  /* Dalla piu' recente: il caso d'uso e' "ho appena mandato una nota dal
     telefono e la voglio vedere", non "svuoto la coda dal fondo". */
  assert.deepEqual(coda.daProcessare().map((o) => o.title), ["l'ultima arrivata", "la prima arrivata"]);
  coda.close();
});

/* Con il limite, "le piu' recenti" significa che a restare fuori e' il piu'
   vecchio — e il conteggio continua a dire l'arretrato per intero. */
test("il limite taglia le piu' vecchie, non le piu' nuove", () => {
  const coda = apriCoda(":memory:");
  for (let i = 1; i <= 5; i += 1) coda.accoda(origine(`1:${i}`, `numero ${i}`));
  assert.deepEqual(coda.daProcessare({ limite: 2 }).map((o) => o.title), ["numero 5", "numero 4"]);
  assert.equal(coda.quanteDaProcessare(), 5);
  coda.close();
});

/* La guardia del confine sorgente → coda. Su `t_task` in Alia questo vincolo
   non c'è e non deve esserci: un'origine può generare N task. Qui invece una
   riga *è* un messaggio. */
test("lo stesso messaggio non entra due volte", () => {
  const coda = apriCoda(":memory:");
  assert.ok(coda.accoda(origine("1:1", "una volta")) > 0);
  assert.equal(coda.accoda(origine("1:1", "una volta")), null, "il doppione è entrato");
  assert.equal(coda.daProcessare().length, 1);
  coda.close();
});

/* La proprietà che definisce il modello: l'area origini è una **finestra**, non
   un magazzino. Riaffacciarsi non consuma, non sposta, non decide. */
test("leggere non cambia niente, quante volte lo si faccia", () => {
  const coda = apriCoda(":memory:");
  coda.accoda(origine("1:1", "resta"));
  assert.equal(coda.daProcessare().length, 1);
  assert.equal(coda.daProcessare().length, 1);
  assert.equal(coda.daProcessare().length, 1);
  assert.equal(coda.quanteDaProcessare(), 1);
  coda.close();
});

/* Non esiste uno stallo intermedio: o entra nel sistema o viene rifiutata, e
   da qui le due cose sono lo stesso bit. */
test("processare toglie dalla finestra, e vale per entrambe le decisioni", () => {
  const coda = apriCoda(":memory:");
  const accettata = coda.accoda(origine("1:1", "diventa un task"));
  const rifiutata = coda.accoda(origine("1:2", "buttata"));
  coda.accoda(origine("1:3", "ancora da decidere"));

  assert.equal(coda.processa(accettata), true);
  assert.equal(coda.processa(rifiutata), true);
  assert.deepEqual(coda.daProcessare().map((o) => o.title), ["ancora da decidere"]);
  assert.equal(coda.quanteDaProcessare(), 1);
  coda.close();
});

/* Due finestre aperte sulla stessa coda, o una risposta persa e il gesto
   ripetuto: processare due volte non è un errore. */
test("processare è idempotente, e lo dice", () => {
  const coda = apriCoda(":memory:");
  const seq = coda.accoda(origine("1:1", "x"));
  assert.equal(coda.processa(seq), true, "la prima volta cambia");
  assert.equal(coda.processa(seq), false, "la seconda no, ma non esplode");
  assert.equal(coda.quanteDaProcessare(), 0);
  coda.close();
});

/* Processata non vuol dire cancellata: il testo e le informazioni di servizio
   restano, per poter risalire al messaggio originale. */
test("un'origine processata resta nel database, solo fuori dalla finestra", () => {
  const coda = apriCoda(":memory:");
  const seq = coda.accoda(origine("1:1", "x"), { da: "io" });
  coda.processa(seq);
  assert.equal(coda.esiste(seq), true);
  /* E il doppione resta impossibile anche dopo: il messaggio è già passato di
     qui una volta, e riprocessarlo non lo rimette in gioco. */
  assert.equal(coda.accoda(origine("1:1", "x")), null);
  coda.close();
});

test("lo stato dei connettori vive nello stesso database delle origini", () => {
  const coda = apriCoda(":memory:");
  assert.equal(coda.leggiStato("offset:telegram", 0), 0);
  coda.scriviStato("offset:telegram", 41);
  coda.scriviStato("offset:telegram", 42);
  assert.equal(coda.leggiStato("offset:telegram", 0), 42);
  coda.close();
});

/* ── l'API ─────────────────────────────────────────────────────────────────── */

async function conServizio(prova) {
  const servizio = avviaServizio({ dati: ":memory:", token: TOKEN, sorgenti: {} }, () => {});
  const { port } = await servizio.ascolta(0);
  const base = `http://127.0.0.1:${port}`;
  const chiedi = (percorso, opzioni = {}) =>
    fetch(base + percorso, {
      ...opzioni,
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...opzioni.headers },
    });
  try {
    await prova({ servizio, base, chiedi });
  } finally {
    await servizio.ferma();
  }
}

test("senza token, o col token sbagliato, non si entra", async () => {
  await conServizio(async ({ base }) => {
    assert.equal((await fetch(`${base}/salute`)).status, 401);
    assert.equal(
      (await fetch(`${base}/salute`, { headers: { authorization: `Bearer ${"x".repeat(32)}` } })).status,
      401,
    );
    /* Anche la lunghezza sbagliata dà 401 e non un errore interno:
       `timingSafeEqual` lancia sui buffer di lunghezza diversa. */
    assert.equal((await fetch(`${base}/salute`, { headers: { authorization: "Bearer corto" } })).status, 401);
  });
});

test("il giro completo: si affaccia, decide, e quella riga non torna", async () => {
  await conServizio(async ({ servizio, chiedi }) => {
    servizio.coda.accoda(origine("1:1", "Pagare la SIAE"), { da: "io" });
    servizio.coda.accoda(origine("1:2", "Chiamare Anna"));

    const prima = await (await chiedi("/origini")).json();
    assert.deepEqual(prima.origini.map((o) => o.title), ["Chiamare Anna", "Pagare la SIAE"]);
    assert.equal(prima.daProcessare, 2);
    assert.deepEqual(prima.origini[1].servizio, { da: "io" }, "le info di servizio non sono tornate");

    /* Riaffacciarsi prima di decidere non cambia niente. */
    const ancora = await (await chiedi("/origini")).json();
    assert.equal(ancora.origini.length, 2);

    const esito = await (await chiedi(`/origini/${prima.origini[1].seq}/processata`, { method: "POST" })).json();
    assert.equal(esito.cambiata, true);
    assert.equal(esito.daProcessare, 1);

    const dopo = await (await chiedi("/origini")).json();
    assert.deepEqual(dopo.origini.map((o) => o.title), ["Chiamare Anna"]);
  });
});

test("processare due volte risponde ok e lo dichiara", async () => {
  await conServizio(async ({ servizio, chiedi }) => {
    const seq = servizio.coda.accoda(origine("1:1", "x"));
    assert.equal((await (await chiedi(`/origini/${seq}/processata`, { method: "POST" })).json()).cambiata, true);
    const bis = await chiedi(`/origini/${seq}/processata`, { method: "POST" });
    assert.equal(bis.status, 200);
    assert.equal((await bis.json()).cambiata, false);
  });
});

test("processare un'origine che non esiste è un 404", async () => {
  await conServizio(async ({ chiedi }) => {
    assert.equal((await chiedi("/origini/999/processata", { method: "POST" })).status, 404);
  });
});

test("/salute dice quante ne aspettano una decisione", async () => {
  await conServizio(async ({ servizio, chiedi }) => {
    servizio.coda.accoda(origine("1:1", "a"));
    const s = await (await chiedi("/salute")).json();
    assert.equal(s.ok, true);
    assert.equal(s.daProcessare, 1);
  });
});

test("una rotta che non esiste è un 404, non un 500", async () => {
  await conServizio(async ({ chiedi }) => {
    assert.equal((await chiedi("/origini/tutto")).status, 404);
    assert.equal((await chiedi("/origini", { method: "DELETE" })).status, 404);
    /* Il vecchio contratto non deve rispondere per sbaglio. */
    assert.equal((await chiedi("/origini/conferma", { method: "POST" })).status, 404);
  });
});

test("il servizio si rifiuta di partire con un token debole", () => {
  assert.throws(() => avviaServizio({ dati: ":memory:", token: "corto", sorgenti: {} }, () => {}), TypeError);
});

/* ── la migrazione ─────────────────────────────────────────────────────────── */

/* Il cursore diceva "fin qui Alia ha preso", e quello che aveva preso lo aveva
   già trasformato in task: quelle righe nascono processate. Quello che stava
   oltre non era mai stato consegnato, e resta da decidere. */
test("dalla versione 1: quello che il cursore aveva superato nasce processato", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const percorso = join(mkdtempSync(join(tmpdir(), "alia-mig-")), "coda.sqlite");

  const vecchio = new DatabaseSync(percorso);
  vecchio.exec(`
    CREATE TABLE origine (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, sourceType TEXT NOT NULL, sourceId TEXT NOT NULL,
      sourceUrl TEXT, title TEXT NOT NULL, originalContent TEXT NOT NULL,
      servizio TEXT NOT NULL DEFAULT '{}', ricevutaAt TEXT NOT NULL);
    CREATE UNIQUE INDEX origine_identita ON origine(sourceType, sourceId);
    CREATE TABLE lettore (id INTEGER PRIMARY KEY CHECK (id = 1), cursore INTEGER NOT NULL DEFAULT 0, ultimoScaricoAt TEXT);
    INSERT INTO lettore (id, cursore) VALUES (1, 2);
    CREATE TABLE sorgente_stato (chiave TEXT PRIMARY KEY, valore TEXT NOT NULL);
    INSERT INTO origine (sourceType, sourceId, title, originalContent, ricevutaAt) VALUES
      ('telegram','1:1','gia presa','x','2026-09-11T00:00:00.000Z'),
      ('telegram','1:2','gia presa anche questa','x','2026-09-11T00:00:00.000Z'),
      ('telegram','1:3','mai consegnata','x','2026-09-11T00:00:00.000Z');
    PRAGMA user_version = 1;
  `);
  vecchio.close();

  const coda = apriCoda(percorso);
  assert.deepEqual(coda.daProcessare().map((o) => o.title), ["mai consegnata"]);
  assert.equal(coda.quanteDaProcessare(), 1);
  coda.close();
});
