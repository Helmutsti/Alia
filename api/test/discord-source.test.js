import assert from "node:assert/strict";
import test from "node:test";

import { createDiscordSource, daAdesso, daGuardare, origineDaMessaggio } from "../src/sources/discord.js";

/* Come per Telegram: un `fetch` finto a cui si mette in bocca cosa rispondere,
   e nessuna rete di mezzo. `chiamate` conserva quello che il bot ha chiesto,
   perché metà di ciò che conta qui è *cosa non* chiede — non rileggere quello
   che ha già letto, non reagire due volte, non rispondere a sé stesso.

   Le rotte si riconoscono dal percorso e non dal solo ultimo pezzo (come faceva
   il finto di Telegram): qui l'ultimo pezzo di `.../reactions/✅/@me` è `@me`,
   che non dice niente. */
function fetchFinto(risposte) {
  const chiamate = [];
  const fetchImpl = async (url, opzioni = {}) => {
    /* Una vera chiamata di rete è un macrotask: cede il turno ai timer. Un
       finto che risolve solo in microtask non lo cede mai, e affamerebbe il
       `setTimeout` con cui il test guarda se è ora di fermarsi. */
    await new Promise((r) => setTimeout(r, 0));
    const percorso = url.replace("https://discord.com/api/v10/", "");
    const metodo = opzioni.method ?? "GET";
    chiamate.push({ percorso, metodo, autorizzazione: opzioni.headers?.authorization });

    if (percorso.includes("/reactions/")) return { ok: true, status: 204, json: async () => null };
    if (/^channels\/[^/]+$/.test(percorso)) {
      return { ok: true, status: 200, json: async () => ({ id: "1", name: "progetti", guild_id: "900" }) };
    }

    const risposta = typeof risposte.messaggi === "function" ? risposte.messaggi(percorso, chiamate) : risposte.messaggi;
    if (risposta?.stato) {
      return { ok: false, status: risposta.stato, json: async () => risposta.corpo ?? {} };
    }
    return { ok: true, status: 200, json: async () => risposta ?? [] };
  };
  return { fetchImpl, chiamate };
}

/* Discord consegna dal più recente: il finto rispetta il verso vero, perché
   rovesciare il lotto è proprio una delle cose da provare. */
const lotto = (...messaggi) => [...messaggi].reverse();

function messaggio(contenuto, { id = "200", canale = "100", autore = "anna", bot = false, tipo = 0 } = {}) {
  return {
    id,
    channel_id: canale,
    type: tipo,
    content: contenuto,
    author: { id: "7", username: autore, global_name: autore, bot },
    timestamp: "2026-09-11T10:00:00.000000+00:00",
  };
}

/* Il magazzino dei cursori: nei test una variabile, nel servizio una riga di
   `sorgente_stato`. Quello che conta è che ci sia — senza, ogni giro
   ripartirebbe da capo e riporterebbe gli stessi messaggi. */
function magazzino(iniziale = {}) {
  let cursori = iniziale;
  return {
    leggiCursori: () => cursori,
    scriviCursori: (v) => {
      cursori = v;
    },
    get valore() {
      return cursori;
    },
  };
}

/* Il ciclo non finisce mai da solo: si avvia, si aspetta che le chiamate siano
   arrivate al punto voluto, e si ferma. Aspettare un numero di chiamate invece
   di un tempo fisso tiene il test veloce e non traballante. */
async function giraFinoA(source, chiamate, quante) {
  source.start();
  const scadenza = Date.now() + 2000;
  while (chiamate.length < quante && Date.now() < scadenza) {
    await new Promise((r) => setTimeout(r, 5));
  }
  source.stop();
  await new Promise((r) => setTimeout(r, 10));
}

const conCursore = (canale = "100") => magazzino({ [canale]: "1" });

/* ── la forma dell'origine ─────────────────────────────────────────────────── */

test("il titolo è la prima riga, il resto resta nel contenuto", () => {
  const origine = origineDaMessaggio(messaggio("\nChiamare il commercialista\ncodice 4471\nentro venerdì"));
  assert.equal(origine.title, "Chiamare il commercialista");
  assert.equal(origine.originalContent, "Chiamare il commercialista\ncodice 4471\nentro venerdì");
});

test("sourceType e sourceId identificano il messaggio nel suo canale", () => {
  const origine = origineDaMessaggio(messaggio("ciao", { canale: "555", id: "777" }));
  assert.equal(origine.sourceType, "discord");
  assert.equal(origine.sourceId, "555:777");
});

/* Al contrario di Telegram, qui l'indirizzo c'è sempre: ogni messaggio ne ha
   uno, e per i messaggi diretti il posto del server lo prende `@me`. */
test("l'indirizzo del messaggio esiste sempre, con o senza server", () => {
  assert.equal(
    origineDaMessaggio(messaggio("x", { canale: "100", id: "200" }), "900").sourceUrl,
    "https://discord.com/channels/900/100/200",
  );
  assert.equal(
    origineDaMessaggio(messaggio("x", { canale: "100", id: "200" })).sourceUrl,
    "https://discord.com/channels/@me/100/200",
  );
});

test("un messaggio senza testo non è un'origine", () => {
  assert.equal(origineDaMessaggio(messaggio("")), null);
  assert.equal(origineDaMessaggio(messaggio("   \n  ")), null);
});

/* La guardia contro l'anello. Se cadesse, un bot che scrive in canale si
   rileggerebbe da solo a ogni giro — per sempre. */
test("i messaggi dei bot e dei webhook non si guardano", () => {
  assert.equal(daGuardare(messaggio("ciao")), true);
  assert.equal(daGuardare(messaggio("ciao", { bot: true })), false);
  assert.equal(daGuardare({ ...messaggio("ciao"), webhook_id: "42" }), false);
});

test("una risposta è un messaggio, un avviso di sistema no", () => {
  assert.equal(daGuardare(messaggio("ti rispondo", { tipo: 19 })), true);
  assert.equal(daGuardare(messaggio("Tizio è entrato nel server", { tipo: 7 })), false);
});

/* Lo snowflake fabbricato: non serve che sia l'id di un messaggio vero, serve
   che ordini nel punto giusto della storia del canale. */
test("il cursore di partenza è adesso: prima sì, dopo no", () => {
  const adesso = Date.UTC(2026, 8, 11, 12, 0, 0);
  const prima = BigInt(daAdesso(adesso - 60_000));
  const dopo = BigInt(daAdesso(adesso + 60_000));
  assert.ok(prima < BigInt(daAdesso(adesso)));
  assert.ok(BigInt(daAdesso(adesso)) < dopo);
  /* Un id vero di oggi ha 19 cifre: se il fabbricato ne avesse molte meno
     starebbe all'inizio della storia e rileggerebbe tutto il canale. */
  assert.ok(daAdesso(adesso).length >= 18, daAdesso(adesso));
});

/* ── il ciclo ──────────────────────────────────────────────────────────────── */

test("un messaggio del canale diventa un'origine, e chi ha scritto lo vede", async () => {
  const origini = [];
  const { fetchImpl, chiamate } = fetchFinto({
    messaggi: (percorso) => (percorso.includes("after=1&") ? lotto(messaggio("Pagare la SIAE")) : []),
  });

  const source = createDiscordSource({
    token: "t", canali: ["100"], fetchImpl, pausaGiro: 5, ...conCursore(),
    onOrigine: (o) => origini.push(o),
  });
  await giraFinoA(source, chiamate, 3);

  assert.equal(origini.length, 1);
  assert.equal(origini[0].title, "Pagare la SIAE");
  assert.equal(origini[0].sourceUrl, "https://discord.com/channels/900/100/200");

  const reazione = chiamate.find((c) => c.percorso.includes("/reactions/"));
  assert.ok(reazione, "nessun ricevuto a chi ha scritto");
  assert.equal(reazione.metodo, "PUT");
  assert.match(reazione.percorso, /channels\/100\/messages\/200\/reactions\/%E2%9C%85\/@me/);
});

test("il token del bot viaggia come `Bot`, non come Bearer", async () => {
  const { fetchImpl, chiamate } = fetchFinto({ messaggi: [] });
  const source = createDiscordSource({
    token: "segreto", canali: ["100"], fetchImpl, pausaGiro: 5, ...conCursore(),
    onOrigine: () => {},
  });
  await giraFinoA(source, chiamate, 1);
  assert.equal(chiamate[0].autorizzazione, "Bot segreto");
});

/* L'idempotenza vive qui: il cursore avanza oltre il messaggio digerito, e la
   chiamata dopo riparte da lì. È ciò che sostituisce il vincolo di unicità che
   § Sorgente di origine ha deciso di non mettere su `t_task`. */
test("il cursore avanza dopo il messaggio, così lo stesso non torna", async () => {
  const cursori = conCursore();
  const { fetchImpl, chiamate } = fetchFinto({
    messaggi: (percorso) => (percorso.includes("after=1&") ? lotto(messaggio("una volta sola", { id: "500" })) : []),
  });

  const origini = [];
  const source = createDiscordSource({
    token: "t", canali: ["100"], fetchImpl, pausaGiro: 5, ...cursori,
    onOrigine: (o) => origini.push(o),
  });
  await giraFinoA(source, chiamate, 5);

  assert.equal(cursori.valore["100"], "500");
  assert.equal(origini.length, 1, "lo stesso messaggio è stato importato due volte");
});

/* Discord consegna dal più recente. Se il connettore non rovesciasse il lotto,
   il cursore finirebbe sul più vecchio e i due prima di lui tornerebbero al
   giro dopo. */
test("il lotto si digerisce nell'ordine in cui è stato scritto", async () => {
  const cursori = conCursore();
  const { fetchImpl, chiamate } = fetchFinto({
    messaggi: (percorso) =>
      percorso.includes("after=1&")
        ? lotto(messaggio("primo", { id: "10" }), messaggio("secondo", { id: "20" }), messaggio("terzo", { id: "30" }))
        : [],
  });

  const arrivate = [];
  const source = createDiscordSource({
    token: "t", canali: ["100"], fetchImpl, pausaGiro: 5, ...cursori,
    onOrigine: (o) => arrivate.push(o.title),
  });
  await giraFinoA(source, chiamate, 4);

  assert.deepEqual(arrivate, ["primo", "secondo", "terzo"]);
  assert.equal(cursori.valore["100"], "30");
});

test("un allegato muto non diventa un'origine, e lo dice con un 🚫", async () => {
  const origini = [];
  const { fetchImpl, chiamate } = fetchFinto({
    messaggi: (percorso) => (percorso.includes("after=1&") ? lotto(messaggio("")) : []),
  });

  const source = createDiscordSource({
    token: "t", canali: ["100"], fetchImpl, pausaGiro: 5, ...conCursore(),
    onOrigine: (o) => origini.push(o),
  });
  await giraFinoA(source, chiamate, 3);

  assert.equal(origini.length, 0);
  const reazione = chiamate.find((c) => c.percorso.includes("/reactions/"));
  assert.match(reazione.percorso, /%F0%9F%9A%AB/);
});

/* La trappola di Discord, provata dal vivo: il lotto contiene anche le risposte
   dei bot, e il cursore deve passarci sopra senza fermarsi. */
test("un bot nel canale non entra in coda ma il cursore lo supera", async () => {
  const cursori = conCursore();
  const origini = [];
  const { fetchImpl, chiamate } = fetchFinto({
    messaggi: (percorso) =>
      percorso.includes("after=1&")
        ? lotto(messaggio("io sono un bot", { id: "10", bot: true }), messaggio("io no", { id: "20" }))
        : [],
  });

  const source = createDiscordSource({
    token: "t", canali: ["100"], fetchImpl, pausaGiro: 5, ...cursori,
    onOrigine: (o) => origini.push(o.title),
  });
  await giraFinoA(source, chiamate, 4);

  assert.deepEqual(origini, ["io no"]);
  assert.equal(cursori.valore["100"], "20", "il messaggio del bot tornerebbe a ogni giro");
});

test("un'origine che esplode non blocca la fila né si ripresenta", async () => {
  const cursori = conCursore();
  const { fetchImpl, chiamate } = fetchFinto({
    messaggi: (percorso) =>
      percorso.includes("after=1&")
        ? lotto(messaggio("questa esplode", { id: "10" }), messaggio("questa passa", { id: "20" }))
        : [],
  });

  const arrivate = [];
  const source = createDiscordSource({
    token: "t", canali: ["100"], fetchImpl, pausaGiro: 5, ...cursori,
    onOrigine: (o) => {
      if (o.title === "questa esplode") throw new Error("database pieno");
      arrivate.push(o.title);
    },
  });
  await giraFinoA(source, chiamate, 4);

  assert.deepEqual(arrivate, ["questa passa"]);
  assert.equal(cursori.valore["100"], "20", "il messaggio esploso tornerebbe a esplodere per sempre");
});

/* Il primo sguardo su un canale non importa la storia: si pianta un cursore
   ad adesso e si aspetta il primo messaggio nuovo. Senza, aggiungere un canale
   vivo da anni riempirebbe la colonna delle origini di roba del 2019. */
test("al primo giro su un canale nuovo la storia resta dov'è", async () => {
  const cursori = magazzino();
  const origini = [];
  const { fetchImpl, chiamate } = fetchFinto({ messaggi: [] });

  const source = createDiscordSource({
    token: "t", canali: ["100"], fetchImpl, pausaGiro: 5, ...cursori,
    onOrigine: (o) => origini.push(o),
  });
  await giraFinoA(source, chiamate, 2);

  assert.equal(origini.length, 0);
  assert.ok(cursori.valore["100"], "nessun cursore piantato: al riavvio rileggerebbe tutto");
  const lettura = chiamate.find((c) => c.percorso.includes("/messages?"));
  assert.match(lettura.percorso, new RegExp(`after=${cursori.valore["100"]}&`));
});

test("un canale che il bot non può leggere lo dice, e non gira a vuoto", async () => {
  const { fetchImpl, chiamate } = fetchFinto({
    messaggi: { stato: 403, corpo: { message: "Missing Access" } },
  });

  const righe = [];
  const source = createDiscordSource({
    token: "t", canali: ["100"], fetchImpl, pausaGiro: 5, ...conCursore(),
    onOrigine: () => {}, log: (...p) => righe.push(p.join(" ")),
  });
  await giraFinoA(source, chiamate, 2);

  assert.ok(righe.some((r) => r.includes("Leggi cronologia messaggi")), righe.join(" | "));
  assert.ok(chiamate.length <= 3, `ha girato a vuoto ${chiamate.length} volte`);
});

/* Un 429 non è un guasto: è un turno da rispettare, e il tempo lo dice il
   server. Aspettare la propria pausa inventata invece della sua è il modo di
   peggiorare le cose. */
test("con un 429 si aspetta il tempo che dice Discord", async () => {
  const { fetchImpl, chiamate } = fetchFinto({
    messaggi: { stato: 429, corpo: { retry_after: 0.05 } },
  });

  const righe = [];
  const source = createDiscordSource({
    token: "t", canali: ["100"], fetchImpl, pausaGiro: 5, ...conCursore(),
    onOrigine: () => {}, log: (...p) => righe.push(p.join(" ")),
  });
  await giraFinoA(source, chiamate, 2);

  assert.ok(righe.some((r) => r.includes("50ms")), righe.join(" | "));
});

/* Senza canali il bot non può nemmeno dirti l'id che gli manca: nessuno gli sta
   scrivendo. Quindi non parte, e lo spiega. */
test("senza canali non parte e dice dove si copia l'id", async () => {
  const { fetchImpl, chiamate } = fetchFinto({ messaggi: [] });
  const righe = [];
  const source = createDiscordSource({
    token: "t", canali: [], fetchImpl, ...magazzino(),
    onOrigine: () => {}, log: (...p) => righe.push(p.join(" ")),
  });

  source.start();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(source.attivo, false);
  assert.equal(chiamate.length, 0, "ha chiesto qualcosa senza sapere a chi");
  assert.match(righe.join(" "), /Copia ID canale/);
});

test("senza token il connettore si rifiuta di nascere", () => {
  assert.throws(() => createDiscordSource({ token: "", onOrigine: () => {} }), TypeError);
  assert.throws(() => createDiscordSource({ token: "t" }), TypeError);
});
