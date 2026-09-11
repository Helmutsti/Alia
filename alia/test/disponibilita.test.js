import assert from "node:assert/strict";
import test from "node:test";

import {
  DISPONIBILITA_PREDEFINITA,
  GIORNI,
  applicaModo,
  eDisponibile,
  eDisponibilita,
  intervalliComuni,
  intervalloDisponibile,
  modoDellaSettimana,
  normalizzaDisponibilita,
  normalizzaGiorno,
  oreScritte,
  oreSettimanali,
} from "../renderer/src/lib/disponibilita.js";

/* Questi test esistono per la stessa ragione di quelli del promemoria: sono
   conti sulle ore, e i conti sbagliano in silenzio. Un intervallo contato due
   volte non lancia niente — dice solo che la settimana ha quarantaquattro ore
   invece di quaranta, e nessuno se ne accorge finché non ci si programma
   sopra il lavoro. */

test("gli intervalli si ordinano e si fondono quando si toccano", () => {
  const g = normalizzaGiorno([
    { da: "14:00", a: "18:00" },
    { da: "09:00", a: "13:00" },
    { da: "18:00", a: "20:00" },
  ]);
  assert.deepEqual(g, [
    { da: "09:00", a: "13:00" },
    { da: "14:00", a: "20:00" },
  ]);
});

test("un intervallo che finisce prima di cominciare non è un intervallo", () => {
  assert.deepEqual(normalizzaGiorno([{ da: "18:00", a: "09:00" }]), []);
  assert.deepEqual(normalizzaGiorno([{ da: "09:00", a: "09:00" }]), []);
});

/* La sovrapposizione è il caso per cui la fusione esiste: contarli separati
   direbbe sette ore dove ce ne sono cinque. */
test("due intervalli sovrapposti valgono le ore che coprono, non la loro somma", () => {
  const g = normalizzaGiorno([
    { da: "09:00", a: "13:00" },
    { da: "12:00", a: "14:00" },
  ]);
  assert.deepEqual(g, [{ da: "09:00", a: "14:00" }]);
});

test("normalizzare dà sempre tutti e sette i giorni", () => {
  const norm = normalizzaDisponibilita({ 1: [{ da: "09:00", a: "10:00" }] });
  assert.equal(Object.keys(norm).length, 7);
  for (const g of GIORNI) assert.ok(Array.isArray(norm[g.id]));
  assert.deepEqual(norm[0], []);
});

/* Quello che arriva da `t_setting` può essere qualunque cosa: quello che non
   passa vale come assente, e si torna al ripiego. */
test("la validazione rifiuta le forme che non sono una disponibilità", () => {
  assert.equal(eDisponibilita(DISPONIBILITA_PREDEFINITA), true);
  assert.equal(eDisponibilita({ 1: [{ da: "09:00", a: "18:00" }] }), true);
  assert.equal(eDisponibilita({ 9: [] }), false, "giorno inesistente");
  assert.equal(eDisponibilita({ 1: [{ da: "25:00", a: "26:00" }] }), false, "ora inesistente");
  assert.equal(eDisponibilita({ 1: [{ da: "18:00", a: "09:00" }] }), false, "fine prima dell'inizio");
  assert.equal(eDisponibilita({ 1: {} }), false);
  assert.equal(eDisponibilita([]), false);
  assert.equal(eDisponibilita(null), false);
});

test("il ripiego è lunedì-venerdì, otto ore al giorno", () => {
  assert.equal(modoDellaSettimana(DISPONIBILITA_PREDEFINITA), "lun-ven");
  assert.equal(oreSettimanali(DISPONIBILITA_PREDEFINITA), 40);
});

test("un modo più un orario fanno la settimana, e il modo si rilegge dal dato", () => {
  const sab = applicaModo("lun-sab", [{ da: "08:30", a: "12:30" }], {});
  assert.equal(modoDellaSettimana(sab), "lun-sab");
  assert.equal(oreSettimanali(sab), 24);
  assert.deepEqual(sab[0], [], "la domenica resta spenta");
  assert.deepEqual(intervalliComuni(sab), [{ da: "08:30", a: "12:30" }]);
});

/* È il passaggio che rende "Personalizzata" una cosa riconosciuta e non una
   modalità salvata da qualche parte: basta che un giorno esca dal coro. */
test("una settimana che non combacia con nessun modo è personalizzata", () => {
  const disp = normalizzaDisponibilita({
    ...DISPONIBILITA_PREDEFINITA,
    3: [{ da: "09:00", a: "12:00" }],
  });
  assert.equal(modoDellaSettimana(disp), "personalizzata");
});

test("un giorno senza intervalli è un giorno non lavorativo", () => {
  const disp = applicaModo("lun-ven", [{ da: "09:00", a: "18:00" }], {});
  const sabato = new Date(2026, 8, 12, 10, 0);
  const lunedi = new Date(2026, 8, 14, 10, 0);
  assert.equal(eDisponibile(disp, sabato), false);
  assert.equal(eDisponibile(disp, lunedi), true);
});

test("la disponibilità di un istante guarda l'ora, non solo il giorno", () => {
  const disp = applicaModo("lun-ven", [{ da: "09:00", a: "13:00" }], {});
  const lunedi = (h, m = 0) => new Date(2026, 8, 14, h, m);
  assert.equal(eDisponibile(disp, lunedi(8, 59)), false);
  assert.equal(eDisponibile(disp, lunedi(9)), true);
  assert.equal(eDisponibile(disp, lunedi(12, 59)), true);
  /* L'estremo alto è escluso: alle 13:00 la fascia è finita, e una task che
     comincia lì comincia fuori. */
  assert.equal(eDisponibile(disp, lunedi(13)), false);
});

test("le ore si scrivono come le direbbe una persona", () => {
  assert.equal(oreScritte(1), "1 ora");
  assert.equal(oreScritte(8), "8 ore");
  assert.equal(oreScritte(7.5), "7,5 ore");
  assert.equal(oreScritte(0), "0 ore");
});

/* La domanda che il Calendario fa per decidere se tratteggiare un blocco. */
test("un intervallo è disponibile solo se ci sta tutto dentro una fascia", () => {
  const disp = applicaModo("lun-ven", [{ da: "09:00", a: "13:00" }, { da: "14:00", a: "18:00" }], {});
  const lunedi = new Date(2026, 8, 14);
  const sabato = new Date(2026, 8, 12);

  assert.equal(intervalloDisponibile(disp, lunedi, 9 * 60, 11 * 60), true);
  assert.equal(intervalloDisponibile(disp, lunedi, 17 * 60, 18 * 60), true, "fino al minuto di chiusura");
  assert.equal(intervalloDisponibile(disp, lunedi, 17 * 60, 20 * 60), false, "sfora la sera");
  /* A cavallo della pausa: le due fasce insieme non fanno una fascia sola, e
     un blocco che le attraversa e' per un'ora fuori. */
  assert.equal(intervalloDisponibile(disp, lunedi, 12 * 60, 15 * 60), false, "attraversa la pausa");
  assert.equal(intervalloDisponibile(disp, sabato, 9 * 60, 11 * 60), false, "giorno non lavorativo");
});
