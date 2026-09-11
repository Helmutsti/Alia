/* Il ponte verso la confluenza, gemello di `aliaClient.js`.

   Separato da quello del core per la stessa ragione per cui lo sono nel
   preload: il core è il database di Alia e risponde sempre; la confluenza è un
   servizio esterno che può non essere configurato, essere spento, o non
   rispondere. Sono due cose diverse e l'interfaccia le tratta diversamente —
   una scrittura rifiutata dal core è un errore, una finestra che non si apre è
   una condizione da mostrare con accanto il modo di riprovare.

   Per questo **nessuna di queste chiamate lancia**: restituiscono tutte un
   `esito`. Attraverso l'IPC un'eccezione perderebbe per di più il messaggio,
   che qui è l'unica cosa utile. */

const ponte = typeof window !== "undefined" ? window.confluenza : undefined;

export const haConfluenza = Boolean(ponte);

/* Fuori da Electron (la pagina di anteprima servita da Vite) non c'è nessun
   ponte. Non si finge: si restituisce l'esito che dice com'è, e la colonna
   mostra il suo messaggio invece di rompersi. */
const SENZA_PONTE = {
  esito: "non-configurata",
  errore: "La confluenza non è raggiungibile da questa pagina.",
  origini: [],
  daProcessare: 0,
};

const CONFIG_VUOTA = { url: "", token: "", modo: "manuale", ogniSecondi: 300, configurata: false };

export const confluenza = {
  leggiConfig: () => ponte?.leggiConfig() ?? Promise.resolve(CONFIG_VUOTA),
  scriviConfig: (patch) => ponte?.scriviConfig(patch) ?? Promise.resolve(CONFIG_VUOTA),
  /* Affacciarsi: non consuma, non decide. Si può rifare quante volte si vuole. */
  elenco: () => ponte?.elenco() ?? Promise.resolve(SENZA_PONTE),
  /* Le due decisioni. `accetta` accetta anche un titolo corretto a mano, che
     diventa il titolo del task: l'origine conserva comunque il testo originale. */
  accetta: (seq, patch) => ponte?.accetta(seq, patch) ?? Promise.resolve(SENZA_PONTE),
  rifiuta: (seq) => ponte?.rifiuta(seq) ?? Promise.resolve(SENZA_PONTE),
  provaCollegamento: (candidata) => ponte?.provaCollegamento(candidata) ?? Promise.resolve(SENZA_PONTE),
  stato: () => ponte?.stato() ?? Promise.resolve({ configurata: false, modo: "manuale" }),
};
