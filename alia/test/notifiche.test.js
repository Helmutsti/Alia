import assert from "node:assert/strict";
import test from "node:test";

import { testoPromemoria } from "../electron/promemoria.js";

/* Il testo di una sveglia si prova senza aprire una finestra, come i preset del
   promemoria: è la stessa aritmetica di calendario, e sbaglia nello stesso modo
   silenzioso — una notifica che arriva alle 14 per un promemoria delle 9 senza
   dirlo fa credere che siano le 9. */

const alle = (h, m = 0, giorno = 11) =>
  new Date(2026, 8, giorno, h, m, 0, 0).toISOString();

test("una sveglia puntuale dice quando scade la task", () => {
  const t = { title: "Chiamare l'idraulico", reminderAt: alle(9), dueAt: alle(18) };
  const { titolo, corpo } = testoPromemoria(t, new Date(alle(9)));
  assert.equal(titolo, "Chiamare l'idraulico");
  assert.equal(corpo, "Scade alle 18:00");
});

test("una sveglia puntuale su una task senza scadenza non inventa niente", () => {
  const t = { title: "Pensarci", reminderAt: alle(9), dueAt: null };
  assert.equal(testoPromemoria(t, new Date(alle(9))).corpo, "Promemoria");
});

test("una sveglia in ritardo dice per quando era", () => {
  const t = { title: "Inviare la fattura", reminderAt: alle(9), dueAt: alle(18) };
  assert.equal(testoPromemoria(t, new Date(alle(14))).corpo, "Era per le 09:00");
});

/* Il giorno si aggiunge solo quando serve: "era per le 9:00" detto il giorno
   dopo sarebbe vero e inutile. */
test("una sveglia in ritardo di giorni dice anche il giorno", () => {
  const t = { title: "Inviare la fattura", reminderAt: alle(9, 0, 9), dueAt: null };
  const corpo = testoPromemoria(t, new Date(alle(14))).corpo;
  assert.match(corpo, /^Era per le 09:00 di /);
  assert.match(corpo, /9 settembre/);
});

/* Un minuto e mezzo di scarto è il giro del controllo, non un ritardo. */
test("il giro del controllo non conta come ritardo", () => {
  const t = { title: "Pausa", reminderAt: alle(9), dueAt: null };
  assert.equal(testoPromemoria(t, new Date(alle(9, 1))).corpo, "Promemoria");
});
