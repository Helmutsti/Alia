import assert from "node:assert/strict";
import test from "node:test";

import { oraDelPreset, presetPromemoria } from "../renderer/src/lib/promemoria.js";

/* Questi test esistono perché i preset del promemoria sono aritmetica di
   calendario, e quella sbaglia in silenzio: un giorno della settimana contato
   al contrario non lancia niente, sposta solo la sveglia di sei giorni — e non
   lo scopri finché non suona quando non doveva.

   `adesso` si passa sempre a mano: un test che chiama `new Date()` passa di
   giorno e fallisce di notte, e quello che si sarebbe dovuto provare (il
   confine) è proprio l'ora a cui il test si rifiuta di girare. */

const id = (voci) => voci.map((v) => v.id);
const trova = (voci, quale) => voci.find((v) => v.id === quale);
const gruppo = (voci, quale) => voci.filter((v) => v.gruppo === quale);

/* Venerdì 11 settembre 2026, ore 10:00. */
const MATTINA = new Date(2026, 8, 11, 10, 0, 0);
const iso = (...p) => new Date(...p).toISOString();

/* ── il blocco che c'è sempre ──────────────────────────────────────────────── */

/* È la ragione della riscrittura: su un task senza date il menu deve restare
   pieno, perché è lì che un promemoria è l'unica cosa che dice quando
   riguardare la task. */
test("senza date restano quattro momenti scegliibili, contati da adesso", () => {
  const voci = presetPromemoria(MATTINA, {});
  assert.deepEqual(id(voci), ["1h", "stasera", "domani", "lunedi", "none"]);
  assert.equal(gruppo(voci, "task").length, 0, "nessun ancoraggio senza date a cui ancorarsi");
});

test("«tra un'ora» è un'ora esatta da adesso", () => {
  const quando = trova(presetPromemoria(MATTINA, {}), "1h").quando;
  assert.equal(quando.getTime() - MATTINA.getTime(), 3600_000);
});

test("stasera è oggi alle 18, domani è domani alle 9", () => {
  const voci = presetPromemoria(MATTINA, {});
  assert.equal(trova(voci, "stasera").quando.getDate(), 11);
  assert.equal(trova(voci, "stasera").quando.getHours(), 18);
  assert.equal(trova(voci, "domani").quando.getDate(), 12);
  assert.equal(trova(voci, "domani").quando.getHours(), 9);
});

/* La voce che c'è solo finché ha senso: alle 23 un promemoria per le 18 di
   oggi suonerebbe all'istante, cioè non sarebbe un promemoria. */
test("stasera sparisce quando stasera è passata", () => {
  const voci = presetPromemoria(new Date(2026, 8, 11, 23, 0, 0), {});
  assert.ok(!id(voci).includes("stasera"));
  assert.ok(id(voci).includes("domani"));
});

/* Il confine che si sbaglia sempre: "lunedì" detto di lunedì è il lunedì dopo,
   non fra un minuto. */
test("di lunedì, «lunedì mattina» è la settimana prossima", () => {
  const lunedi = new Date(2026, 8, 14, 10, 0, 0);
  assert.equal(lunedi.getDay(), 1, "il 14/09/2026 deve essere un lunedì");
  const quando = trova(presetPromemoria(lunedi, {}), "lunedi").quando;
  assert.equal(quando.getDate(), 21);
  assert.equal(quando.getDay(), 1);
});

/* Due voci che dicono lo stesso istante con due nomi sono una voce di troppo:
   di domenica, "domani mattina" e "lunedì mattina" sono la stessa cosa. */
test("di domenica lunedì non si ripete: è già domani", () => {
  const domenica = new Date(2026, 8, 13, 10, 0, 0);
  assert.equal(domenica.getDay(), 0);
  const voci = presetPromemoria(domenica, {});
  assert.ok(!id(voci).includes("lunedi"));
  assert.equal(trova(voci, "domani").quando.getDate(), 14);
});

/* ── il blocco che si sblocca con le date ──────────────────────────────────── */

/* Una data sola si chiama Scadenza nella scheda, e le voci devono chiamarla
   con la stessa parola: tradurre è il momento in cui si sbaglia bersaglio. */
test("con la sola scadenza si sbloccano i suoi tre ancoraggi", () => {
  const voci = presetPromemoria(MATTINA, { dueAt: iso(2026, 8, 20, 15, 30) });
  assert.deepEqual(id(gruppo(voci, "task")), ["scadenza", "scadenza-1h", "scadenza-1g"]);
  assert.deepEqual(
    gruppo(voci, "task").map((v) => v.label),
    ["Alla scadenza", "Un'ora prima della scadenza", "Il giorno prima della scadenza"],
  );
});

test("gli ancoraggi cadono davvero un'ora e un giorno prima", () => {
  const scadenza = new Date(2026, 8, 20, 15, 30);
  const voci = presetPromemoria(MATTINA, { dueAt: scadenza.toISOString() });
  assert.equal(trova(voci, "scadenza").quando.getTime(), scadenza.getTime());
  assert.equal(scadenza - trova(voci, "scadenza-1h").quando, 3600_000);
  assert.equal(scadenza - trova(voci, "scadenza-1g").quando, 86_400_000);
});

/* Con un inizio la stessa data si chiama Fine, perché è così che la scheda la
   mostra ("DURATA: inizio / fine"). */
test("con una durata gli ancoraggi diventano inizio e fine", () => {
  const voci = presetPromemoria(MATTINA, {
    startAt: iso(2026, 8, 18, 9, 0),
    dueAt: iso(2026, 8, 25, 18, 0),
  });
  assert.deepEqual(
    gruppo(voci, "task").map((v) => v.label),
    [
      "All'inizio",
      "Un'ora prima dell'inizio",
      "Il giorno prima dell'inizio",
      "Alla fine",
      "Un'ora prima della fine",
      "Il giorno prima della fine",
    ],
  );
});

/* Una sveglia per ieri o suona subito o non suona mai: in nessuno dei due casi
   è quello che si era chiesto. */
test("gli ancoraggi già passati non compaiono", () => {
  const voci = presetPromemoria(MATTINA, { dueAt: iso(2026, 8, 1, 15, 30) });
  assert.equal(gruppo(voci, "task").length, 0, "sveglia per la settimana scorsa");
});

/* Il caso a metà, quello che si sbaglia: la scadenza è futura ma il giorno
   prima è già alle spalle. Le due voci vicine restano, quella no. */
test("di una scadenza domani resta solo quello che è ancora davanti", () => {
  const voci = presetPromemoria(MATTINA, { dueAt: iso(2026, 8, 12, 9, 0) });
  assert.deepEqual(id(gruppo(voci, "task")), ["scadenza", "scadenza-1h"]);
});

test("«nessuno» è l'ultima voce e non ha un istante", () => {
  const voci = presetPromemoria(MATTINA, { dueAt: iso(2026, 8, 20, 15, 30) });
  assert.equal(voci[voci.length - 1].id, "none");
  assert.equal(voci[voci.length - 1].quando, null);
});

/* Il blocco di adesso non si tocca quando arrivano le date: si aggiunge il
   secondo, non si sostituisce il primo. */
test("le date aggiungono voci, non ne tolgono", () => {
  const senza = gruppo(presetPromemoria(MATTINA, {}), "subito");
  const con = gruppo(presetPromemoria(MATTINA, { dueAt: iso(2026, 8, 20, 15, 30) }), "subito");
  assert.deepEqual(id(con), id(senza));
});

/* ── l'ora scritta accanto ─────────────────────────────────────────────────── */

/* Tre precisioni: oggi basta l'ora, entro la settimana serve il giorno, oltre
   serve la data — "mer 08:00" fra tre settimane non dice quale mercoledì. */
test("l'ora si allunga man mano che l'istante si allontana", () => {
  assert.equal(oraDelPreset(new Date(2026, 8, 11, 18, 0), MATTINA), "18:00");
  assert.equal(oraDelPreset(new Date(2026, 8, 14, 9, 0), MATTINA), "lun 09:00");
  assert.equal(oraDelPreset(new Date(2026, 9, 2, 9, 0), MATTINA), "2 ott 09:00");
  assert.equal(oraDelPreset(null, MATTINA), null);
});
