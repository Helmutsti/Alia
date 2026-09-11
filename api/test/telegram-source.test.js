import assert from "node:assert/strict";
import test from "node:test";

import { createTelegramSource, origineDaMessaggio, titoloDaTesto } from "../src/sources/telegram.js";

/* Il connettore è puro per poter essere provato così: un `fetch` finto che
   restituisce gli update che gli si mette in bocca, e nessuna rete di mezzo.
   `chiamate` conserva quello che il bot ha chiesto, perché metà di ciò che
   conta qui è *cosa non* chiede — non ricreare un'origine già vista, non
   rispondere a una chat non autorizzata. */
function fetchFinto(risposte) {
  const chiamate = [];
  const fetchImpl = async (url, opzioni) => {
    /* Una vera chiamata di rete è un macrotask: cede il turno ai timer. Un
       finto che risolve solo in microtask non lo cede mai, e il ciclo del
       connettore — che fra un giro e l'altro non ha niente da aspettare —
       affamerebbe il `setTimeout` con cui il test guarda se è ora di fermarsi.
       Il test si bloccherebbe, e non per colpa del codice provato. */
    await new Promise((r) => setTimeout(r, 0));
    const metodo = url.split("/").pop();
    const corpo = JSON.parse(opzioni.body);
    chiamate.push({ metodo, corpo });
    const risposta = risposte[metodo];
    const result = typeof risposta === "function" ? risposta(corpo, chiamate) : (risposta ?? []);
    return { json: async () => (result?.errore ? result.errore : { ok: true, result }) };
  };
  return { fetchImpl, chiamate };
}

function messaggio(testo, { idChat = 10, idMessaggio = 1, username } = {}) {
  return {
    message_id: idMessaggio,
    chat: { id: idChat, ...(username ? { username } : {}) },
    text: testo,
  };
}

/* Nei test il magazzino dell'offset è una variabile, in Electron è un file:
   quello che conta è che ci sia. Senza, `getUpdates` ripartirebbe sempre da
   zero e ogni giro riporterebbe gli stessi update — cioè proprio il doppione
   che l'offset esiste per evitare. */
function magazzino(iniziale = 0) {
  let offset = iniziale;
  return { leggiOffset: () => offset, scriviOffset: (v) => { offset = v; }, get valore() { return offset; } };
}

/* Il ciclo del connettore non finisce mai da solo: si avvia, si aspetta che il
   `getUpdates` sia arrivato al punto voluto, e si ferma. Aspettare un numero di
   chiamate invece di un tempo fisso tiene il test veloce e non traballante. */
async function giraFinoA(source, chiamate, quante) {
  source.start();
  const scadenza = Date.now() + 2000;
  while (chiamate.length < quante && Date.now() < scadenza) {
    await new Promise((r) => setTimeout(r, 5));
  }
  source.stop();
  await new Promise((r) => setTimeout(r, 5));
}

/* ── la forma dell'origine ─────────────────────────────────────────────────── */

test("il titolo è la prima riga non vuota, il resto resta nel contenuto", () => {
  const origine = origineDaMessaggio(messaggio("\nChiamare il commercialista\ncodice 4471\nentro venerdì"));
  assert.equal(origine.title, "Chiamare il commercialista");
  assert.equal(origine.originalContent, "Chiamare il commercialista\ncodice 4471\nentro venerdì");
});

test("un titolo lungo si taglia sullo spazio, non a metà parola", () => {
  const titolo = titoloDaTesto(`${"parola ".repeat(30)}fine`);
  assert.ok(titolo.length <= 121, `troppo lungo: ${titolo.length}`);
  assert.ok(titolo.endsWith("…"));
  assert.ok(!titolo.includes("par…"), "ha spezzato una parola");
});

test("sourceType e sourceId identificano il messaggio nella sua chat", () => {
  const origine = origineDaMessaggio(messaggio("ciao", { idChat: -100, idMessaggio: 77 }));
  assert.equal(origine.sourceType, "telegram");
  assert.equal(origine.sourceId, "-100:77");
});

test("il link esiste solo dove esiste davvero: username sì, chat privata no", () => {
  assert.equal(
    origineDaMessaggio(messaggio("x", { idMessaggio: 5, username: "canale" })).sourceUrl,
    "https://t.me/canale/5",
  );
  assert.equal(origineDaMessaggio(messaggio("x")).sourceUrl, null);
});

test("la didascalia di un allegato vale come testo, un allegato muto no", () => {
  assert.equal(origineDaMessaggio({ message_id: 1, chat: { id: 1 }, caption: "fattura" }).title, "fattura");
  assert.equal(origineDaMessaggio({ message_id: 1, chat: { id: 1 } }), null);
  assert.equal(origineDaMessaggio(messaggio("   \n  ")), null);
});

/* ── il ciclo ──────────────────────────────────────────────────────────────── */

test("un messaggio autorizzato diventa un'origine, e il mittente lo sa", async () => {
  const origini = [];
  const { fetchImpl, chiamate } = fetchFinto({
    getUpdates: (corpo) => (corpo.offset === 0 ? [{ update_id: 40, message: messaggio("Pagare la SIAE") }] : []),
  });

  const source = createTelegramSource({
    token: "t", chatConsentite: [10], fetchImpl, ...magazzino(),
    onOrigine: (o) => origini.push(o),
  });
  await giraFinoA(source, chiamate, 2);

  assert.equal(origini.length, 1);
  assert.equal(origini[0].title, "Pagare la SIAE");
  const risposta = chiamate.find((c) => c.metodo === "sendMessage");
  assert.ok(risposta.corpo.text.includes("Pagare la SIAE"));
  assert.equal(risposta.corpo.chat_id, 10);
});

test("una chat fuori dalla whitelist non entra, e riceve un no", async () => {
  const origini = [];
  const { fetchImpl, chiamate } = fetchFinto({
    getUpdates: (corpo) =>
      corpo.offset === 0 ? [{ update_id: 1, message: messaggio("entro lo stesso?", { idChat: 999 }) }] : [],
  });

  const source = createTelegramSource({
    token: "t", chatConsentite: [10], fetchImpl, ...magazzino(),
    onOrigine: (o) => origini.push(o),
  });
  await giraFinoA(source, chiamate, 2);

  assert.equal(origini.length, 0, "una chat non autorizzata ha scritto in Alia");
  assert.match(chiamate.find((c) => c.metodo === "sendMessage").corpo.text, /non è autorizzata/);
});

/* La whitelist vuota è configurazione a metà, non porta aperta: il bot non crea
   niente e restituisce l'id, che è il dato che manca per finire la
   configurazione. */
test("con la whitelist vuota non nasce niente e il bot dice l'id della chat", async () => {
  const origini = [];
  const { fetchImpl, chiamate } = fetchFinto({
    getUpdates: (corpo) => (corpo.offset === 0 ? [{ update_id: 1, message: messaggio("ciao", { idChat: 4242 }) }] : []),
  });

  const source = createTelegramSource({
    token: "t", chatConsentite: [], fetchImpl, ...magazzino(),
    onOrigine: (o) => origini.push(o),
  });
  await giraFinoA(source, chiamate, 2);

  assert.equal(origini.length, 0);
  const testo = chiamate.find((c) => c.metodo === "sendMessage").corpo.text;
  assert.match(testo, /4242/);
  /* La frase non deve nominare un file: il connettore vive nel servizio e non
     sa dove quello tenga la sua configurazione. */
  assert.doesNotMatch(testo, /\.json/);
});

/* L'idempotenza vive qui: l'offset avanza oltre l'update digerito, e la
   chiamata dopo riparte da lì. È ciò che sostituisce il vincolo di unicità che
   § Sorgente di origine ha deciso di non mettere su `t_task`. */
test("l'offset avanza dopo l'update, così lo stesso messaggio non torna", async () => {
  const offset = magazzino();
  const { fetchImpl, chiamate } = fetchFinto({
    getUpdates: (corpo) => (corpo.offset === 0 ? [{ update_id: 40, message: messaggio("una volta sola") }] : []),
  });

  const origini = [];
  const source = createTelegramSource({
    token: "t", chatConsentite: [10], fetchImpl, ...offset,
    onOrigine: (o) => origini.push(o),
  });
  await giraFinoA(source, chiamate, 3);

  assert.equal(offset.valore, 41);
  assert.equal(origini.length, 1, "lo stesso messaggio è stato importato due volte");
});

test("un'origine che esplode non blocca la fila né si ripresenta", async () => {
  const offset = magazzino();
  const { fetchImpl, chiamate } = fetchFinto({
    getUpdates: (corpo) =>
      corpo.offset === 0
        ? [
            { update_id: 1, message: messaggio("questa esplode", { idMessaggio: 1 }) },
            { update_id: 2, message: messaggio("questa passa", { idMessaggio: 2 }) },
          ]
        : [],
  });

  const arrivate = [];
  const source = createTelegramSource({
    token: "t", chatConsentite: [10], fetchImpl, ...offset,
    onOrigine: (o) => {
      if (o.title === "questa esplode") throw new Error("database pieno");
      arrivate.push(o);
    },
  });
  await giraFinoA(source, chiamate, 2);

  assert.deepEqual(arrivate.map((o) => o.title), ["questa passa"]);
  assert.equal(offset.valore, 3, "l'update esploso tornerebbe a esplodere per sempre");
});

test("un errore di Telegram mette in pausa invece di girare a vuoto", async () => {
  const { fetchImpl, chiamate } = fetchFinto({
    getUpdates: () => ({ errore: { ok: false, error_code: 409, description: "Conflict" } }),
  });

  const righe = [];
  const source = createTelegramSource({
    token: "t", chatConsentite: [10], fetchImpl, ...magazzino(),
    onOrigine: () => {}, log: (...p) => righe.push(p.join(" ")),
  });
  await giraFinoA(source, chiamate, 1);

  assert.ok(righe.some((r) => r.includes("un'altra istanza")), righe.join(" | "));
  assert.ok(chiamate.length <= 2, `ha girato a vuoto ${chiamate.length} volte`);
});

test("senza token il connettore si rifiuta di nascere", () => {
  assert.throws(() => createTelegramSource({ token: "", onOrigine: () => {} }), TypeError);
  assert.throws(() => createTelegramSource({ token: "t" }), TypeError);
});
