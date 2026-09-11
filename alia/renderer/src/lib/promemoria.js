/* Il promemoria: quando suona, detto a parole.

   Sta fuori dal dettaglio del task perche' e' aritmetica di calendario, ed e'
   il genere di codice che sbaglia **in silenzio** — un giorno della settimana
   contato al contrario non lancia niente, sposta solo la sveglia di sei giorni.
   Da qui si prova senza aprire una finestra (vedi `test/promemoria.test.js`),
   che e' la stessa ragione per cui esiste `composerSyntax.js`.

   ── Due blocchi, e il secondo si sblocca ───────────────────────────────────

   L'artboard aveva disegnato le voci **tutte** relative alla scadenza — "1 ora
   prima", "il giorno prima". Su un task con una data funzionano; ma la
   maggioranza dei task una data non ce l'ha, e li' l'intero menu era spento:
   quattro righe grigie e un campo data, cioe' una tendina che non si puo'
   usare. Ed e' il contrario di quello che serve, perche' su un task senza date
   un promemoria e' *l'unica* cosa che dice quando riguardarlo.

   Quindi due blocchi, e il secondo compare solo quando ha di che parlare:

     · **sempre** — il promemoria classico, contato da adesso: fra un'ora,
       stasera, domani mattina. Non chiede niente al task, quindi non puo'
       spegnersi;
     · **con le date** — gli ancoraggi al task: all'inizio, alla scadenza, e un
       passo prima di ognuno. Sono quelli che l'artboard voleva, e adesso
       arrivano in aggiunta invece che al posto di tutto.

   ── Il nome dell'ancoraggio lo decide il task ──────────────────────────────

   `dueAt` si chiama **Fine** quando c'e' anche un inizio (la scheda mostra
   "DURATA: inizio / fine") e **Scadenza** quando l'inizio non c'e'. Le voci
   dicono la stessa parola che si legge due centimetri piu' su: "1 ora prima
   della fine" su un task con una durata, "1 ora prima della scadenza" su uno
   con una data sola. Un menu che chiama le cose con un altro nome costringe a
   tradurre, e tradurre e' il momento in cui si sbaglia bersaglio.

   ── Niente sveglie per ieri ────────────────────────────────────────────────

   Ogni voce viene scartata se il suo istante e' gia' passato. Vale per
   "stasera" alle undici di sera e vale per "il giorno prima dell'inizio" su un
   task cominciato la settimana scorsa: un promemoria nel passato o suona
   subito o non suona mai, e in nessuno dei due casi e' quello che si era
   chiesto. */

/* Le ore non sono scelte a caso: la sera e' quando si guarda cosa resta della
   giornata, la mattina quando si decide cosa farne. */
const ORA_SERA = 18;
const ORA_MATTINA = 9;

const ORA = 60 * 60 * 1000;
const GIORNO = 24 * ORA;

const due = (n) => String(n).padStart(2, "0");

const alleOre = (giorno, ore) => {
  const d = new Date(giorno);
  d.setHours(ore, 0, 0, 0);
  return d;
};

/* "Lunedì" detto di lunedì e' il lunedì **dopo**, non fra un minuto: `|| 7`
   trasforma lo zero (oggi) in una settimana intera. */
function prossimoLunedi(adesso) {
  const d = new Date(adesso);
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return alleOre(d, ORA_MATTINA);
}

/* ── il blocco che c'e' sempre ─────────────────────────────────────────────── */

function subito(adesso) {
  const voci = [{ id: "1h", label: "Tra un'ora", quando: new Date(adesso.getTime() + ORA) }];

  /* Stasera compare solo se stasera c'e' ancora: alle undici di sera un
     promemoria per le sei del pomeriggio suonerebbe all'istante. */
  const stasera = alleOre(adesso, ORA_SERA);
  if (stasera > adesso) voci.push({ id: "stasera", label: "Stasera", quando: stasera });

  const domani = new Date(adesso);
  domani.setDate(domani.getDate() + 1);
  const domaniMattina = alleOre(domani, ORA_MATTINA);
  voci.push({ id: "domani", label: "Domani mattina", quando: domaniMattina });

  /* Se domani **e'** lunedì le due voci direbbero lo stesso istante con due
     nomi: si tiene quella piu' vicina al modo in cui la si pensa, "domani". */
  const lunedi = prossimoLunedi(adesso);
  if (lunedi.getTime() !== domaniMattina.getTime()) {
    voci.push({ id: "lunedi", label: "Lunedì mattina", quando: lunedi });
  }

  return voci;
}

/* ── il blocco che si sblocca con le date ──────────────────────────────────── */

/* Le tre distanze da un ancoraggio, nell'ordine in cui le si pensa: il momento
   stesso, un'ora prima, il giorno prima. */
const DISTANZE = [
  { suffisso: "", prefisso: "A", scarto: 0 },
  { suffisso: "-1h", prefisso: "Un'ora prima d", scarto: -ORA },
  { suffisso: "-1g", prefisso: "Il giorno prima d", scarto: -GIORNO },
];

/* L'articolo cambia con la parola, e in italiano non si puo' cavarsela con un
   "di" buono per tutte: si scrive per esteso una volta sola, qui. */
const ANCORAGGI = {
  inizio: { a: "All'inizio", da: "ell'inizio" },
  fine: { a: "Alla fine", da: "ella fine" },
  scadenza: { a: "Alla scadenza", da: "ella scadenza" },
};

function attornoA(nome, istante, adesso) {
  const parole = ANCORAGGI[nome];
  return DISTANZE.map(({ suffisso, prefisso, scarto }) => ({
    id: `${nome}${suffisso}`,
    label: scarto === 0 ? parole.a : `${prefisso}${parole.da}`,
    quando: new Date(istante.getTime() + scarto),
  })).filter((v) => v.quando > adesso);
}

/**
 * Le voci della tendina del promemoria.
 *
 * @param {Date} adesso
 * @param {{ startAt?: string|null, dueAt?: string|null }} [task]
 * @returns {Array<{ id: string, label: string, quando: Date|null, gruppo: string }>}
 */
export function presetPromemoria(adesso = new Date(), task = {}) {
  const voci = subito(adesso).map((v) => ({ ...v, gruppo: "subito" }));

  const inizio = task.startAt ? new Date(task.startAt) : null;
  const fine = task.dueAt ? new Date(task.dueAt) : null;

  if (inizio) voci.push(...attornoA("inizio", inizio, adesso).map((v) => ({ ...v, gruppo: "task" })));
  if (fine) {
    /* Il nome che il task si da' da solo: con un inizio quella data e' la
       "fine" di una durata, senza e' una "scadenza" e basta. */
    const nome = inizio ? "fine" : "scadenza";
    voci.push(...attornoA(nome, fine, adesso).map((v) => ({ ...v, gruppo: "task" })));
  }

  voci.push({ id: "none", label: "Nessuno", quando: null, gruppo: "fine" });
  return voci;
}

const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/* L'ora accanto alla voce: il preset dice *quando* a parole, questa dice
   l'istante. Senza, "Un'ora prima della fine" costringerebbe ad andare a
   cercare da un'altra parte quando sia questa fine.

   Tre precisioni, secondo quanto e' lontano: oggi basta l'ora; entro la
   settimana serve il giorno, perche' due orari nudi non si distinguono; oltre
   serve la data, perche' "mer 08:00" fra tre settimane non dice quale
   mercoledi. */
export function oraDelPreset(quandoData, adesso) {
  if (!quandoData) return null;
  const ora = `${due(quandoData.getHours())}:${due(quandoData.getMinutes())}`;
  if (quandoData.toDateString() === adesso.toDateString()) return ora;
  if (quandoData - adesso < 6 * GIORNO) return `${GIORNI[quandoData.getDay()]} ${ora}`;
  return `${quandoData.getDate()} ${MESI[quandoData.getMonth()]} ${ora}`;
}
