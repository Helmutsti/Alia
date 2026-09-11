/* Il montaggio: coda + connettori + server, accesi insieme e spenti insieme.

   È il punto in cui la confluenza diventa una cosa sola. Ogni connettore
   consegna alla stessa coda, e il server serve quella coda senza sapere da dove
   venga niente — che è tutto il senso di avere una confluenza invece di tre
   integrazioni.

   ── Il registro ───────────────────────────────────────────────────────────

   Fino all'11/09/2026 qui c'era un `if` per Telegram, con dentro la sua
   costruzione e la sua traduzione delle informazioni di servizio. Con la
   seconda sorgente quell'`if` andava copiato, e copiare un montaggio significa
   che la terza volta le due copie saranno già diverse.

   Quindi `SORGENTI`: un nome, come si accende, e come si legge quello che la
   sorgente sa del messaggio. Aggiungere mail domani è una voce in questa mappa
   e un modulo accanto a `telegram.js` — il resto del file non la nomina mai.

   ── Perché la traduzione delle informazioni di servizio sta *qui* ─────────

   Il connettore consegna `(origine, message)`, dove `message` è il messaggio
   grezzo della sua piattaforma. Trasformarlo in `servizio` — chi ha scritto,
   dove, quando — è l'unico pezzo che è insieme specifico della sorgente **e**
   dipendente da come la coda vuole i dati. Dentro il connettore legherebbe un
   modulo puro alla forma del nostro database; dentro `coda.js` obbligherebbe la
   coda a conoscere Telegram. Sta nel montaggio perché è esattamente il posto
   dove i due mondi si incontrano. */

import { apriCoda } from "./coda.js";
import { creaServer } from "./server.js";
import { createDiscordSource } from "./sources/discord.js";
import { createTelegramSource } from "./sources/telegram.js";

/* Ogni connettore ricorda a che punto è arrivato sotto una chiave sua nella
   tabella `sorgente_stato`. Prefisso esplicito perché il giorno che ci sono due
   bot Telegram (uno personale, uno di lavoro) le due ricevute non si pestino.

   Il nome resta `offset:` anche per Discord, dove il valore è una mappa
   `{ canale: messaggio }` e non un numero: è il **ruolo** a essere lo stesso —
   "fin dove ho letto" — e rinominare la chiave vorrebbe dire migrare le righe
   già scritte per guadagnare una parola più precisa in un solo punto. */
const chiaveOffset = (nome) => `offset:${nome}`;

/* Le informazioni di servizio finiscono in `servizio` e non nei campi
   dell'origine: chi ha scritto e in che chat serve a ritrovare il messaggio,
   non a fare la task. È la separazione che § Sorgente di origine chiedeva.

   I nomi dei campi sono gli stessi fra le sorgenti dove la cosa è la stessa
   (`da`, `inviatoAt`), diversi dove è diversa (`chatId` contro `canaleId`):
   fingere che una chat di Telegram e un canale di Discord siano la stessa
   entità sarebbe indovinare uno schema comune prima di avere la terza sorgente
   che lo confermerebbe o lo smentirebbe. */
const SORGENTI = {
  telegram: {
    configurata: (c) => Boolean(c?.token),
    crea: (c, ganci) =>
      createTelegramSource({
        token: c.token,
        chatConsentite: c.chat ?? [],
        leggiOffset: () => ganci.leggiStato(0),
        scriviOffset: (v) => ganci.scriviStato(v),
        log: ganci.log,
        onOrigine: ganci.onOrigine,
      }),
    servizio: (message) => ({
      chatId: message.chat?.id,
      chatTitolo: message.chat?.title ?? message.chat?.username ?? null,
      da: message.from?.username ?? message.from?.first_name ?? null,
      messageId: message.message_id,
      inviatoAt: message.date ? new Date(message.date * 1000).toISOString() : null,
    }),
  },

  discord: {
    configurata: (c) => Boolean(c?.token),
    crea: (c, ganci) =>
      createDiscordSource({
        token: c.token,
        canali: c.canali ?? [],
        leggiCursori: () => ganci.leggiStato({}),
        scriviCursori: (v) => ganci.scriviStato(v),
        log: ganci.log,
        onOrigine: ganci.onOrigine,
      }),
    servizio: (message) => ({
      canaleId: message.channel_id,
      /* Discord manda l'autore per intero. Si tiene il nome che si legge
         (`global_name` è quello che il client mostra oggi, `username` quello
         tecnico) e l'id, che è l'unico che non cambia quando la persona si
         rinomina. */
      da: message.author?.global_name ?? message.author?.username ?? null,
      autoreId: message.author?.id ?? null,
      messageId: message.id,
      inviatoAt: message.timestamp ?? null,
    }),
  },
};

/**
 * @param {object} config  vedi config.js
 * @param {(...parti: unknown[]) => void} [log]
 */
export function avviaServizio(config, log = console.log) {
  const coda = apriCoda(config.dati);
  const connettori = [];

  for (const [nome, sorgente] of Object.entries(SORGENTI)) {
    const suaConfig = config.sorgenti?.[nome];
    if (!sorgente.configurata(suaConfig)) continue;

    const suoLog = (...parti) => log(`[${nome}]`, ...parti);
    const source = sorgente.crea(suaConfig, {
      log: suoLog,
      leggiStato: (predefinito) => coda.leggiStato(chiaveOffset(nome), predefinito),
      scriviStato: (valore) => coda.scriviStato(chiaveOffset(nome), valore),
      onOrigine: (origine, message) => {
        const seq = coda.accoda(origine, sorgente.servizio(message));
        /* `null` = c'era già. Non è un errore: succede ogni volta che un
           connettore rilegge qualcosa dopo un riavvio a metà. */
        suoLog(seq === null ? "doppione ignorato:" : `accodata #${seq}:`, origine.title);
      },
    });
    source.start();
    connettori.push({ nome, source });
  }

  if (connettori.length === 0) {
    log("nessuna sorgente configurata: il servizio serve una coda che non si riempie");
  }

  const server = creaServer({
    coda,
    token: config.token,
    log,
    statoSorgenti: () =>
      Object.fromEntries(
        connettori.map(({ nome, source }) => [
          nome,
          { attivo: source.attivo, offset: coda.leggiStato(chiaveOffset(nome), null) },
        ]),
      ),
  });

  return {
    server,
    coda,
    ascolta: (porta, host = "127.0.0.1") =>
      new Promise((risolvi) => server.listen(porta, host, () => risolvi(server.address()))),
    /* Nell'ordine: prima si smette di raccogliere, poi si chiude la porta, poi
       il database. Al contrario, un connettore potrebbe scrivere su una coda
       già chiusa. */
    async ferma() {
      for (const { source } of connettori) source.stop();
      await new Promise((risolvi) => server.close(risolvi));
      coda.close();
    },
  };
}
