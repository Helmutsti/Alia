/* Le ore di disponibilità — quando si lavora davvero.

   Non è un orario di apertura da esporre: è la fascia in cui ha senso
   **mettere** una task. Il calendario la disegna (vista Giorno) e ci appoggerà
   sopra i trascinamenti: lasciare una task alle tre di notte deve poter essere
   detto sbagliato, e per dirlo serve un posto dove sta scritto cos'è giusto.

   ── La forma ───────────────────────────────────────────────────────────────

   Un oggetto con una chiave per giorno della settimana, e sotto ogni chiave un
   **elenco di intervalli**:

     { "1": [{ da: "09:00", a: "13:00" }, { da: "14:00", a: "18:00" }], … }

   Le chiavi sono quelle di `Date.getDay()` — 0 domenica, 1 lunedì — e non un
   indice nostro che partirebbe da lunedì: chi legge ha in mano una data, e
   `disp[data.getDay()]` è tutto il codice che serve. L'ordine in cui i giorni
   si *mostrano* è un'altra cosa e sta in `GIORNI`, che comincia da lunedì
   perché comincia da lì anche la griglia del calendario.

   Più intervalli per giorno perché la pausa pranzo esiste, ed è proprio
   l'ora in cui non si vuole che finisca niente.

   ── Un giorno spento è un elenco vuoto ─────────────────────────────────────

   Non c'è un flag `attivo` accanto agli intervalli, e non è una scorciatoia:
   sarebbero due dati che possono contraddirsi — un giorno "attivo" con zero
   intervalli, o "spento" con dentro le sue ore — e allora bisognerebbe
   decidere ogni volta chi dei due vince. Zero intervalli vuol dire zero ore
   disponibili, che è esattamente quello che si intende spegnendo un giorno.
   L'interruttore nelle Impostazioni scrive questo: spegnendo svuota,
   riaccendendo rimette un intervallo. Le ore di prima non tornano da sole —
   il dato non le conserva — e la finestra delle Impostazioni se le ricorda
   finché resta aperta, che è quanto serve per rimediare a un clic sbagliato.

   ── Le ore come stringhe ───────────────────────────────────────────────────

   "HH:MM" e non minuti dopo mezzanotte: è la forma che `<input type="time">`
   legge e scrive senza conversioni, ed è leggibile dentro `t_setting` da chi
   ci guarda con un client SQL. I conti si fanno in minuti (`inMinuti`), che è
   una conversione di una riga.

   Il giorno finisce alle 23:59 e non alle 24:00, perché `<input type="time">`
   non sa dire 24:00. Chi lavora fino a mezzanotte tonda perde un minuto, e
   tanto vale saperlo qui che scoprirlo dopo. */

export const GIORNI = [
  { id: 1, label: "Lunedì", corto: "lun" },
  { id: 2, label: "Martedì", corto: "mar" },
  { id: 3, label: "Mercoledì", corto: "mer" },
  { id: 4, label: "Giovedì", corto: "gio" },
  { id: 5, label: "Venerdì", corto: "ven" },
  { id: 6, label: "Sabato", corto: "sab" },
  { id: 0, label: "Domenica", corto: "dom" },
];

/* L'intervallo che compare riaccendendo un giorno che non ha memoria di sé.
   Nove-diciotto e non nove-tredici: è la giornata intera, e togliere la pausa
   è un gesto in meno di aggiungere il pomeriggio. */
export const INTERVALLO_PREDEFINITO = { da: "09:00", a: "18:00" };

/* Il ripiego: lunedì-venerdì spezzati dalla pausa, fine settimana spento. È
   una convenzione, non una verità — ma un ripiego deve pur dire qualcosa, e
   dire "nessuna disponibilità" all'avvio farebbe sembrare rotta la vista
   Giorno. */
export const DISPONIBILITA_PREDEFINITA = Object.freeze({
  1: [{ da: "09:00", a: "13:00" }, { da: "14:00", a: "18:00" }],
  2: [{ da: "09:00", a: "13:00" }, { da: "14:00", a: "18:00" }],
  3: [{ da: "09:00", a: "13:00" }, { da: "14:00", a: "18:00" }],
  4: [{ da: "09:00", a: "13:00" }, { da: "14:00", a: "18:00" }],
  5: [{ da: "09:00", a: "13:00" }, { da: "14:00", a: "18:00" }],
  6: [],
  0: [],
});

const FORMA_ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const eOra = (v) => typeof v === "string" && FORMA_ORA.test(v);

export function inMinuti(ora) {
  const [h, m] = ora.split(":");
  return Number(h) * 60 + Number(m);
}

export function daMinuti(minuti) {
  const m = Math.max(0, Math.min(1439, Math.round(minuti)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const eIntervallo = (v) =>
  !!v && typeof v === "object" && eOra(v.da) && eOra(v.a) && inMinuti(v.da) < inMinuti(v.a);

/* Cosa si accetta di leggere da `t_setting`. Stessa severità delle altre
   preferenze e per lo stesso motivo (vedi `usePreferenza`): la tabella è
   chiave-valore, e quello che non passa vale come assente.

   Le chiavi mancanti **non** invalidano: un oggetto con i soli giorni
   lavorativi è una disponibilità legittima, e i giorni assenti valgono spenti
   — che è come si scrive "non lavoro mai di domenica" senza doverlo dire. */
export const eDisponibilita = (v) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.entries(v).every(
    ([giorno, intervalli]) =>
      GIORNI.some((g) => String(g.id) === String(giorno)) &&
      Array.isArray(intervalli) &&
      intervalli.every(eIntervallo),
  );

/* Ordina e **fonde** gli intervalli che si toccano o si sovrappongono.

   Fondere e non rifiutare: "09:00–13:00" più "12:00–14:00" non è un errore da
   contestare, è un modo goffo di dire "09:00–14:00". Contarli separati
   significherebbe contare due volte l'ora fra le 12 e le 13 in ogni totale, e
   disegnare due bande sovrapposte nel calendario. */
export function normalizzaGiorno(intervalli) {
  const validi = (intervalli ?? []).filter(eIntervallo).sort((x, y) => inMinuti(x.da) - inMinuti(y.da));
  const fusi = [];
  for (const iv of validi) {
    const ultimo = fusi.at(-1);
    if (ultimo && inMinuti(iv.da) <= inMinuti(ultimo.a)) {
      if (inMinuti(iv.a) > inMinuti(ultimo.a)) ultimo.a = iv.a;
      continue;
    }
    fusi.push({ da: iv.da, a: iv.a });
  }
  return fusi;
}

/* Sempre tutte e sette le chiavi, sempre normalizzate: chi legge non deve
   chiedersi se un giorno c'è. */
export function normalizzaDisponibilita(disp) {
  const base = eDisponibilita(disp) ? disp : DISPONIBILITA_PREDEFINITA;
  return Object.fromEntries(GIORNI.map((g) => [g.id, normalizzaGiorno(base[g.id])]));
}

/* Gli intervalli di una data. È l'unica funzione che il calendario chiama:
   `getDay()` non esce da qui. */
export function intervalliDelGiorno(disp, data) {
  return normalizzaGiorno(disp?.[data.getDay()]);
}

export const minutiDisponibili = (intervalli) =>
  (intervalli ?? []).reduce((n, iv) => n + inMinuti(iv.a) - inMinuti(iv.da), 0);

export const oreDisponibili = (intervalli) => minutiDisponibili(intervalli) / 60;

export const oreSettimanali = (disp) =>
  GIORNI.reduce((n, g) => n + oreDisponibili(disp?.[g.id]), 0);

/* Un numero di ore come lo direbbe una persona: 7, 7,5, 6,25. */
export function oreScritte(ore) {
  const arrotondate = Math.round(ore * 100) / 100;
  return `${String(arrotondate).replace(".", ",")} ${arrotondate === 1 ? "ora" : "ore"}`;
}

/* Se un istante cade dentro la disponibilità del suo giorno. Non serve ancora
   a nessuno a schermo — servirà al rilascio — ma sta qui perché è la domanda
   per cui esiste tutto questo file, e il posto in cui si risponde non deve
   essere il componente che disegna. */
export function eDisponibile(disp, data) {
  const minuti = data.getHours() * 60 + data.getMinutes();
  return intervalliDelGiorno(disp, data).some(
    (iv) => minuti >= inMinuti(iv.da) && minuti < inMinuti(iv.a),
  );
}

/* Se un intervallo sta **tutto dentro** le fasce disponibili di quel giorno.

   Serve al Calendario per dire "questa e' fuori dalle tue ore" (deciso
   l'11/09/2026: si accetta, ma si vede). La domanda e' *tutto dentro*, non
   *un po' dentro*: una task che comincia alle 17 e finisce alle 20, con la
   giornata che chiude alle 18, e' per due terzi fuori — dire che va bene
   perche' comincia in orario sarebbe una risposta comoda e falsa.

   Un giorno senza fasce risponde `false` a tutto, ed e' giusto: li' non c'e'
   nessuna ora di lavoro, quindi qualunque ora e' fuori. */
export function intervalloDisponibile(disp, data, daMinuti_, aMinuti_) {
  const fasce = intervalliDelGiorno(disp, data);
  if (fasce.length === 0) return false;
  return fasce.some((iv) => daMinuti_ >= inMinuti(iv.da) && aMinuti_ <= inMinuti(iv.a));
}

/* ── I modi della settimana ─────────────────────────────────────────────────

   Quasi nessuno ha sette orari diversi. Chi lavora dal lunedi' al venerdi' ha
   *un* orario, e scriverlo cinque volte e' cinque volte lo stesso gesto piu'
   quattro occasioni di sbagliarne uno. Quindi si sceglie prima **quali giorni**
   si lavora, e l'orario si scrive una volta sola.

   "Personalizzata" e' l'uscita per chi ha davvero giornate diverse fra loro, e
   non e' una modalita' a parte: e' il nome che prende la disponibilita' quando
   non e' descritta da nessuno dei modi. Come le preselezioni delle card (vedi
   `densitaDeiCampi` in tasks.js), il modo si **riconosce** dal dato invece di
   essere salvato accanto: due dati che dicono la stessa cosa possono
   contraddirsi, e allora bisognerebbe decidere ogni volta chi vince. */
export const MODI_SETTIMANA = [
  { id: "lun-ven", label: "Lunedì – Venerdì", giorni: [1, 2, 3, 4, 5] },
  { id: "lun-sab", label: "Lunedì – Sabato", giorni: [1, 2, 3, 4, 5, 6] },
  { id: "personalizzata", label: "Personalizzata", giorni: null },
];

const stessiIntervalli = (a, b) =>
  a.length === b.length && a.every((iv, i) => iv.da === b[i].da && iv.a === b[i].a);

/* Le ore che valgono per tutti i giorni lavorativi: quelle del primo giorno
   che ne ha. Serve nel passaggio da un modo all'altro — accendendo il sabato
   si vuole il sabato con **le stesse ore degli altri**, non un giorno di
   fabbrica — e come valore dell'unico editor quando il modo non e'
   personalizzato. */
export function intervalliComuni(disp) {
  for (const g of GIORNI) {
    const iv = normalizzaGiorno(disp?.[g.id]);
    if (iv.length > 0) return iv;
  }
  return [{ ...INTERVALLO_PREDEFINITO }];
}

export function modoDellaSettimana(disp) {
  const norm = normalizzaDisponibilita(disp);
  const comuni = intervalliComuni(norm);
  for (const modo of MODI_SETTIMANA) {
    if (!modo.giorni) continue;
    const combacia = GIORNI.every((g) => {
      const attesi = modo.giorni.includes(g.id) ? comuni : [];
      return stessiIntervalli(norm[g.id], attesi);
    });
    if (combacia) return modo.id;
  }
  return "personalizzata";
}

/* Un modo piu' un orario fanno una disponibilita' intera. "Personalizzata" non
   scrive niente: non e' una configurazione, e' l'assenza delle altre due, e
   sceglierla deve lasciare le ore dove sono perche' e' esattamente il momento
   in cui si sta per metterci le mani. */
export function applicaModo(modoId, intervalli, disp) {
  const modo = MODI_SETTIMANA.find((m) => m.id === modoId);
  if (!modo?.giorni) return normalizzaDisponibilita(disp);
  const ore = normalizzaGiorno(intervalli);
  return Object.fromEntries(
    GIORNI.map((g) => [g.id, modo.giorni.includes(g.id) ? ore.map((iv) => ({ ...iv })) : []]),
  );
}
