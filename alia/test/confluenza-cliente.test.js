import assert from "node:assert/strict";
import test from "node:test";

import { creaConfluenza } from "../src/confluenza/cliente.js";

/* Una confluenza finta. Si comporta come il servizio vero nell'unica cosa che
   definisce il modello: **è una finestra.** Leggere non consuma, non sposta e
   non decide — l'unica cosa che toglie una riga dall'elenco è `processata`. */
function confluenzaFinta({ origini = [], fallisci = null } = {}) {
  const stato = { processate: new Set(), chiamate: [] };
  const restanti = () => origini.filter((o) => !stato.processate.has(o.seq));

  const fetchImpl = async (url, opzioni = {}) => {
    await new Promise((r) => setTimeout(r, 0));
    const percorso = url.replace(/^https?:\/\/[^/]+/, "");
    stato.chiamate.push(percorso);

    if (fallisci?.(percorso, stato)) return { ok: false, status: 500, json: async () => ({}) };
    if (opzioni.headers?.authorization !== "Bearer segreto") {
      return { ok: false, status: 401, json: async () => ({}) };
    }
    if (percorso === "/origini") {
      return { ok: true, status: 200, json: async () => ({ origini: restanti(), daProcessare: restanti().length }) };
    }
    if (percorso === "/salute") {
      return { ok: true, status: 200, json: async () => ({ ok: true, daProcessare: restanti().length }) };
    }
    const m = percorso.match(/^\/origini\/(\d+)\/processata$/);
    if (m) {
      const seq = Number(m[1]);
      const cambiata = !stato.processate.has(seq);
      stato.processate.add(seq);
      return { ok: true, status: 200, json: async () => ({ seq, cambiata, daProcessare: restanti().length }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, stato };
}

const origine = (seq, titolo) => ({
  seq,
  title: titolo,
  originalContent: titolo,
  sourceType: "telegram",
  sourceId: `1:${seq}`,
  sourceUrl: null,
  servizio: {},
});

const cliente = (finta, opzioni = {}) =>
  creaConfluenza({ url: "http://confluenza.test", token: "segreto", fetchImpl: finta.fetchImpl, ...opzioni });

/* ── la finestra ───────────────────────────────────────────────────────────── */

/* La proprietà che regge tutto il modello: affacciarsi non è un'operazione, è
   uno sguardo. Rifarlo non produce nessun effetto. */
test("affacciarsi non consuma: cento letture, stesse righe", async () => {
  const finta = confluenzaFinta({ origini: [origine(1, "prima"), origine(2, "seconda")] });
  const c = cliente(finta);

  for (let i = 0; i < 3; i += 1) {
    const { origini, daProcessare } = await c.elenco();
    assert.deepEqual(origini.map((o) => o.title), ["prima", "seconda"]);
    assert.equal(daProcessare, 2);
  }
  assert.equal(finta.stato.processate.size, 0, "una lettura ha deciso qualcosa");
});

test("processare toglie dalla finestra, e solo quella riga", async () => {
  const finta = confluenzaFinta({ origini: [origine(1, "decisa"), origine(2, "resta")] });
  const c = cliente(finta);

  await c.processa(1);
  const { origini, daProcessare } = await c.elenco();
  assert.deepEqual(origini.map((o) => o.title), ["resta"]);
  assert.equal(daProcessare, 1);
});

/* Due finestre aperte, o una risposta persa e il gesto ripetuto. */
test("processare due volte non è un errore, e lo dichiara", async () => {
  const finta = confluenzaFinta({ origini: [origine(1, "x")] });
  const c = cliente(finta);

  assert.equal((await c.processa(1)).cambiata, true);
  assert.equal((await c.processa(1)).cambiata, false);
});

test("il token rifiutato si dice per nome", async () => {
  const finta = confluenzaFinta({ origini: [origine(1, "x")] });
  const c = cliente(finta, { token: "sbagliato" });
  await assert.rejects(() => c.elenco(), /token rifiutato/);
});

test("un servizio che risponde male non inventa una lista vuota", async () => {
  const finta = confluenzaFinta({ origini: [origine(1, "x")], fallisci: (p) => p === "/origini" });
  const c = cliente(finta);
  await assert.rejects(() => c.elenco(), /ha risposto 500/);
});

/* ── il periodico ──────────────────────────────────────────────────────────── */

/* Il periodico non scarica: guarda il numero, e se è cambiato dà un colpetto.
   Il colpetto non porta i dati — dice solo di riaffacciarsi. */
test("il periodico avvisa solo quando il numero cambia", async () => {
  const origini = [origine(1, "una")];
  const finta = confluenzaFinta({ origini });
  let colpetti = 0;
  const c = cliente(finta, { modo: "periodico", ogniSecondi: 1, onCambio: () => { colpetti += 1; } });

  /* Il primo elenco fissa il conteggio noto: senza, il primo giro lo troverebbe
     "cambiato" rispetto a niente. */
  await c.elenco();
  c.avviaPeriodico();
  await new Promise((r) => setTimeout(r, 2600));
  const dopoDueGiri = colpetti;
  c.stop();

  assert.equal(dopoDueGiri, 0, "ha bussato senza che fosse cambiato niente");
});

/* E quando il numero cambia bussa davvero. Il test qui sopra prova solo che non
   bussi a vuoto: da solo lo passerebbe anche un periodico che non bussa mai. */
test("il periodico bussa quando il numero cambia", async () => {
  const origini = [origine(1, "una")];
  const finta = confluenzaFinta({ origini });
  let colpetti = 0;
  const c = cliente(finta, { modo: "periodico", ogniSecondi: 1, onCambio: () => { colpetti += 1; } });

  await c.elenco();
  c.avviaPeriodico();
  /* Ne arriva un'altra mentre il periodico gira. */
  origini.push(origine(2, "due"));
  await new Promise((r) => setTimeout(r, 2600));
  c.stop();

  assert.ok(colpetti >= 1, "non ha bussato quando il numero e' cambiato");
  /* E non ribussa nei giri seguenti, in cui il numero e' di nuovo fermo. */
  assert.ok(colpetti <= 2, `ha bussato ${colpetti} volte per un cambio solo`);
});

test("il periodico si accende solo nel modo periodico", () => {
  const finta = confluenzaFinta();
  assert.equal(cliente(finta).avviaPeriodico(), false);

  const p = cliente(finta, { modo: "periodico", ogniSecondi: 60 });
  assert.equal(p.avviaPeriodico(), true);
  assert.equal(p.avviaPeriodico(), false, "si è acceso due volte");
  assert.equal(p.stato().periodicoAcceso, true);
  p.stop();
  assert.equal(p.stato().periodicoAcceso, false);
});

/* ── la nascita ────────────────────────────────────────────────────────────── */

test("senza indirizzo o token il client si rifiuta di nascere", () => {
  assert.throws(() => creaConfluenza({ url: "", token: "t" }), TypeError);
  assert.throws(() => creaConfluenza({ url: "http://x", token: "" }), TypeError);
});

/* `push` è progettato ma non implementato (questione aperta 15): finché non
   c'è, chiederlo deve essere un errore e non un silenzioso "manuale". */
test("un modo che non esiste viene rifiutato alla nascita", () => {
  assert.throws(() => creaConfluenza({ url: "http://x", token: "t", modo: "push" }), TypeError);
});
