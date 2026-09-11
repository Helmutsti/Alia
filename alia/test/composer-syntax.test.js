import assert from "node:assert/strict";
import test from "node:test";

import {
  analizzaTitolo,
  completaToken,
  formattaPromemoria,
  risolviMilestone,
  risolviProgetto,
  tokenInCorso,
  UNITA_MS,
} from "../renderer/src/lib/composerSyntax.js";

/* Questi test non c'erano, ed è il motivo per cui esistono adesso: la sintassi
   era documentata nel dettaglio e il parser era scoperto. Regole come
   l'ambiguità di `/` si rompono in silenzio, e nessuno se ne accorge finché non
   scrive un titolo sbagliato. */

/* ── i simboli, uno per uno ────────────────────────────────────────────────── */

test("!1..!4 accende la priorità, con la mappatura di sempre", () => {
  const attese = { "!1": "urgent", "!2": "high", "!3": "medium", "!4": "low" };
  for (const [simbolo, atteso] of Object.entries(attese)) {
    const esito = analizzaTitolo(`Chiamare il commercialista ${simbolo}`);
    assert.equal(esito.priorita, atteso, simbolo);
    assert.equal(esito.titoloPulito, "Chiamare il commercialista");
  }
});

test("un numero fuori scala non è una priorità e resta nel titolo", () => {
  const esito = analizzaTitolo("Comprare 5 mele !5");
  assert.equal(esito.priorita, null);
  assert.equal(esito.titoloPulito, "Comprare 5 mele !5");
});

test("#tag si ripete, e lo stesso non entra due volte", () => {
  const esito = analizzaTitolo("Comprare il latte #casa #spesa #Casa");
  assert.deepEqual(esito.tag, ["casa", "spesa"]);
  assert.equal(esito.titoloPulito, "Comprare il latte");
});

test("@progetto da solo, e @progetto/fase insieme", () => {
  const solo = analizzaTitolo("Follow-up cliente @lavoro");
  assert.equal(solo.progetto, "lavoro");
  assert.equal(solo.milestone, null);

  const con = analizzaTitolo("Follow-up cliente @lavoro/gennaio");
  assert.equal(con.progetto, "lavoro");
  assert.equal(con.milestone, "gennaio");
  assert.equal(con.titoloPulito, "Follow-up cliente");
});

test("/2h è un promemoria relativo ad adesso, non una scadenza", () => {
  assert.equal(analizzaTitolo("Richiamare /2h").promemoriaMs, 2 * UNITA_MS.h);
  assert.equal(analizzaTitolo("Richiamare /30m").promemoriaMs, 30 * UNITA_MS.m);
  assert.equal(analizzaTitolo("Richiamare /3g").promemoriaMs, 3 * UNITA_MS.g);
});

/* La regola più sottile della specifica, e la prima che si romperebbe senza
   accorgersene: lo slash dentro `@…` è un separatore, isolato è un promemoria.
   Il progetto si consuma per primo apposta. */
test("lo slash dentro @progetto/fase non viene letto come promemoria", () => {
  const esito = analizzaTitolo("Riunione @lavoro/2h");
  assert.equal(esito.progetto, "lavoro");
  assert.equal(esito.milestone, "2h", "la fase si chiama davvero 2h, ed è legittimo");
  assert.equal(esito.promemoriaMs, null, "ha riletto uno slash già consumato");
});

test("i due slash convivono: uno dentro il progetto, uno isolato", () => {
  const esito = analizzaTitolo("Riunione @lavoro/gennaio /2h");
  assert.equal(esito.progetto, "lavoro");
  assert.equal(esito.milestone, "gennaio");
  assert.equal(esito.promemoriaMs, 2 * UNITA_MS.h);
  assert.equal(esito.titoloPulito, "Riunione");
});

test("tutti i simboli insieme, e il titolo esce pulito", () => {
  const esito = analizzaTitolo("Preparare il preventivo @lavoro/gennaio #urgente #cliente !1 /3h");
  assert.equal(esito.titoloPulito, "Preparare il preventivo");
  assert.equal(esito.priorita, "urgent");
  assert.equal(esito.progetto, "lavoro");
  assert.equal(esito.milestone, "gennaio");
  assert.deepEqual(esito.tag, ["urgente", "cliente"]);
  assert.equal(esito.promemoriaMs, 3 * UNITA_MS.h);
});

test("un titolo senza simboli esce com'era", () => {
  const esito = analizzaTitolo("Comprare il pane");
  assert.equal(esito.titoloPulito, "Comprare il pane");
  assert.equal(esito.priorita, null);
  assert.deepEqual(esito.tag, []);
});

/* ── il token in corso, per i suggerimenti ─────────────────────────────────── */

test("mentre si scrive @lav si suggeriscono i progetti", () => {
  const testo = "Chiamare @lav";
  const t = tokenInCorso(testo, testo.length);
  assert.equal(t.tipo, "progetto");
  assert.equal(t.parte, "lav");
});

/* Il caso segnalato: la tendina deve aprirsi **appena si preme il simbolo**,
   con la parte ancora vuota. Se qui tornasse `null`, l'elenco comparirebbe solo
   dopo la prima lettera — e con un database senza progetti non comparirebbe
   mai, che e' come sembrava rotto. */
test("il simbolo da solo apre gia' i suggerimenti", () => {
  for (const testo of ["@", "Preparare @", "Comprare il latte #"]) {
    const t = tokenInCorso(testo, testo.length);
    assert.ok(t, `${testo} non ha aperto niente`);
    assert.equal(t.parte, "");
  }
  assert.equal(tokenInCorso("@", 1).tipo, "progetto");
  assert.equal(tokenInCorso("#", 1).tipo, "tag");
});

test("dopo lo slash si passa a suggerire le fasi di quel progetto", () => {
  const testo = "Chiamare @lavoro/gen";
  const t = tokenInCorso(testo, testo.length);
  assert.equal(t.tipo, "milestone");
  assert.equal(t.progetto, "lavoro");
  assert.equal(t.parte, "gen");
});

test("il token si chiude con lo spazio, e i suggerimenti spariscono", () => {
  const testo = "Chiamare @lavoro ";
  assert.equal(tokenInCorso(testo, testo.length), null);
});

/* Un indirizzo email non deve aprire l'elenco dei progetti: il simbolo vale
   solo a inizio parola. */
test("una chiocciola in mezzo a una parola non è un simbolo", () => {
  const testo = "Scrivere a mario@azienda";
  assert.equal(tokenInCorso(testo, testo.length), null);
});

test("il token si legge dal cursore, non dalla fine del testo", () => {
  const testo = "Chiamare @lav domani";
  const t = tokenInCorso(testo, "Chiamare @lav".length);
  assert.equal(t.parte, "lav");
});

/* ── completare dai suggerimenti ───────────────────────────────────────────── */

test("scegliere un suggerimento sostituisce il token e lascia il cursore in coda", () => {
  const testo = "Chiamare @lav";
  const t = tokenInCorso(testo, testo.length);
  const esito = completaToken(testo, t, "lavoro");
  assert.equal(esito.testo, "Chiamare @lavoro ");
  assert.equal(esito.cursore, esito.testo.length);
});

test("completare una fase tiene il progetto già scritto", () => {
  const testo = "Chiamare @lavoro/gen";
  const t = tokenInCorso(testo, testo.length);
  assert.equal(completaToken(testo, t, "gennaio").testo, "Chiamare @lavoro/gennaio ");
});

/* Uno spazio chiuderebbe il simbolo, quindi i nomi composti si attaccano — e il
   confronto che li risolve fa la stessa cosa, altrimenti non si ritroverebbero. */
test("un nome con lo spazio si attacca, di qua e di là", () => {
  const testo = "Chiamare @ca";
  const t = tokenInCorso(testo, testo.length);
  assert.equal(completaToken(testo, t, "Casa Nuova").testo, "Chiamare @CasaNuova ");

  const progetti = [{ id: 7, name: "Casa Nuova" }];
  assert.equal(risolviProgetto("CasaNuova", progetti)?.id, 7);
});

/* ── risolvere contro l'elenco vero ────────────────────────────────────────── */

test("il progetto si accetta solo se esiste", () => {
  const progetti = [{ id: 1, name: "Lavoro" }, { id: 2, name: "Casa" }];
  assert.equal(risolviProgetto("lavoro", progetti)?.id, 1, "il confronto ignora le maiuscole");
  assert.equal(risolviProgetto("inventato", progetti), null, "ha accettato un progetto che non c'è");
  assert.equal(risolviProgetto(null, progetti), null);
});

test("la milestone si risolve dentro l'elenco che le viene dato", () => {
  const fasi = [{ id: 10, name: "Gennaio" }, { id: 11, name: "Febbraio" }];
  assert.equal(risolviMilestone("gennaio", fasi)?.id, 10);
  assert.equal(risolviMilestone("marzo", fasi), null);
});

/* ── l'etichetta del promemoria ────────────────────────────────────────────── */

test("il promemoria si legge con l'unità più grossa che divide esatto", () => {
  assert.equal(formattaPromemoria(2 * UNITA_MS.h), "tra 2h");
  assert.equal(formattaPromemoria(120 * UNITA_MS.m), "tra 2h", "120 minuti sono 2 ore");
  assert.equal(formattaPromemoria(90 * UNITA_MS.m), "tra 90m");
  assert.equal(formattaPromemoria(3 * UNITA_MS.g), "tra 3g");
  assert.equal(formattaPromemoria(null), null);
});
