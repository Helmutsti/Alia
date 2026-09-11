/* Il lato Alia della confluenza: **una finestra, non un magazzino.**

   È la differenza che regge tutto il resto. Alia non conserva le origini: le
   guarda dove stanno, nel servizio. Quindi non c'è niente da scaricare, niente
   da tenere allineato, e nessuna ricevuta di lettura — rifare la stessa
   richiesta rilegge le stesse righe e non produce nessun effetto.

   Il primo disegno, la mattina stessa, faceva l'opposto: il servizio consegnava
   a blocchi, Alia scriveva subito un task per ogni origine e confermava fin
   dove era arrivata. Non reggeva, e il motivo sta in una frase: **un'origine
   non è un task.** Consegnarla significava averla già decisa, e la decisione
   spetta a chi guarda. Con la finestra, il servizio conserva e Alia decide —
   ed è per questo che `isProcessed` ha potuto sostituire il cursore.

   ── Le due decisioni, e non ce n'è una terza ───────────────────────────────

   Un'origine o entra nel sistema — diventa un task — o viene rifiutata. Non
   esiste uno stallo intermedio, e non esiste un "vista ma non decisa": sarebbe
   proprio l'arretrato invisibile che il badge esiste per rendere visibile.

   Da qui le due sono lo stesso gesto: `processa(seq)`. La differenza fra
   "accettata" e "rifiutata" non è un bit da tenere — si legge da fuori,
   guardando se in Alia è nato un task che cita quell'origine.

   ── Perché è un modulo puro ────────────────────────────────────────────────

   Niente Electron, niente database: un indirizzo, un token, e `fetch`
   iniettabile. Si prova senza aprire una finestra. */

export const MODI = ["manuale", "periodico"];

/* Cinque minuti, non trenta secondi: le origini sono cose da fare, non
   notifiche.

   `OGNI_MINIMO` è un **limite di prodotto, non di questo modulo**: sotto un
   minuto il periodico smette di essere comodo e diventa un modo di non
   accorgersi che il servizio è spento. Chi lo fa rispettare è
   `electron/confluenza.js`, dove si valida quello che l'utente ha scritto nelle
   Impostazioni.

   Qui invece il valore si prende per quello che è. Un componente che riscrive
   di nascosto i propri parametri mente a chi lo chiama, e lo rende impossibile
   da provare: la prima versione di questo file faceva `Math.max(OGNI_MINIMO,
   ...)` qui dentro, e il test che doveva verificare il periodico aspettava un
   secondo mentre il ciclo ne aspettava sessanta. Passava — perché verificava
   che *non* bussasse a vuoto, cosa che fa anche un ciclo che non gira. */
export const OGNI_PREDEFINITO = 300;
export const OGNI_MINIMO = 60;

const dormi = (ms) => new Promise((risolvi) => setTimeout(risolvi, ms));

/**
 * @param {object} opzioni
 * @param {string} opzioni.url     la radice del servizio, es. http://127.0.0.1:8787
 * @param {string} opzioni.token   il segreto dell'API
 * @param {"manuale"|"periodico"} [opzioni.modo]
 * @param {number} [opzioni.ogniSecondi]  solo per il modo periodico
 * @param {() => unknown} [opzioni.onCambio]
 *        chiamata quando il numero di origini da processare cambia: è il
 *        colpetto che dice alla finestra di riaffacciarsi.
 * @param {(...parti: unknown[]) => void} [opzioni.log]
 * @param {typeof fetch} [opzioni.fetchImpl]
 */
export function creaConfluenza({
  url,
  token,
  modo = "manuale",
  ogniSecondi = OGNI_PREDEFINITO,
  onCambio = () => {},
  log = () => {},
  fetchImpl = globalThis.fetch,
}) {
  if (typeof url !== "string" || url.trim() === "") throw new TypeError("url must be a non-empty string");
  if (typeof token !== "string" || token.trim() === "") throw new TypeError("token must be a non-empty string");
  if (!MODI.includes(modo)) throw new TypeError(`modo must be one of: ${MODI.join(", ")}`);

  const radice = url.replace(/\/+$/, "");
  const attesa = (Number(ogniSecondi) || OGNI_PREDEFINITO) * 1000;

  let acceso = false;
  let annulla = null;
  /* L'ultimo conteggio visto, per accorgersi che è cambiato senza rileggere
     l'elenco intero: `/salute` costa una riga, `/origini` costa tutte. */
  let ultimoConteggio = null;

  async function chiedi(percorso, opzioni = {}) {
    const controllore = new AbortController();
    annulla = () => controllore.abort();
    const risposta = await fetchImpl(radice + percorso, {
      ...opzioni,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...opzioni.headers },
      signal: controllore.signal,
    });
    if (!risposta.ok) {
      /* Il 401 si dice per nome: è l'unico errore che non passerà da solo, e
         sapere che è il token sbagliato risparmia mezz'ora di log. */
      throw new Error(
        risposta.status === 401
          ? "token rifiutato dalla confluenza: controlla le impostazioni"
          : `la confluenza ha risposto ${risposta.status} su ${percorso}`,
      );
    }
    return risposta.json();
  }

  async function elenco() {
    const dati = await chiedi("/origini");
    ultimoConteggio = dati.daProcessare;
    return dati;
  }

  async function ciclo() {
    while (acceso) {
      for (let passati = 0; passati < attesa && acceso; passati += 1000) {
        /* L'attesa si spezza in secondi per poter essere interrotta: con un
           `dormi(5 minuti)` unico, chiudere Alia resterebbe appeso fino a
           cinque minuti. */
        await dormi(1000);
      }
      if (!acceso) return;
      try {
        const { daProcessare } = await chiedi("/salute");
        /* Si avvisa **solo se il numero è cambiato**. Un colpetto a ogni giro
           farebbe ricaricare la finestra ogni cinque minuti anche quando non è
           successo niente, che per una lista su cui si sta lavorando è
           rumore. */
        if (daProcessare !== ultimoConteggio) {
          ultimoConteggio = daProcessare;
          log(`${daProcessare} origini da processare`);
          onCambio();
        }
      } catch (err) {
        /* Nel periodico un errore si annota e basta: il servizio può essere
           spento, ed è un caso previsto. Chi guarda lo scopre quando si
           affaccia, con la frase per esteso. */
        log("giro periodico fallito:", err.message);
      }
    }
  }

  return {
    /* Affacciarsi. Non consuma, non sposta, non decide: si può rifare quante
       volte si vuole. */
    elenco,

    /* La decisione è presa — entrata nel sistema o rifiutata, da qui è lo
       stesso bit. Chi chiama ha già fatto la sua parte (creato il task, o
       niente) prima di arrivare qui: **si processa dopo**, mai prima. Se si
       processasse per primo e la creazione fallisse, quella cosa da fare non
       esisterebbe più da nessuna parte. */
    processa: (seq) => chiedi(`/origini/${seq}/processata`, { method: "POST" }),

    salute: () => chiedi("/salute"),

    avviaPeriodico() {
      if (modo !== "periodico" || acceso) return false;
      acceso = true;
      ciclo();
      log(`controllo periodico acceso, ogni ${attesa / 1000}s`);
      return true;
    },

    stop() {
      acceso = false;
      annulla?.();
    },

    stato: () => ({ modo, ogniSecondi: attesa / 1000, periodicoAcceso: acceso, daProcessare: ultimoConteggio }),
  };
}
