/* Il montaggio: coda + connettori + server, accesi insieme e spenti insieme.

   È il punto in cui la confluenza diventa una cosa sola. Ogni connettore
   consegna alla stessa coda, e il server serve quella coda senza sapere da dove
   venga niente — che è tutto il senso di avere una confluenza invece di tre
   integrazioni. Aggiungere mail o Discord domani vuol dire aggiungere una voce
   in `sorgenti` e un modulo accanto a `telegram.js`: qui cambia una riga. */

import { apriCoda } from "./coda.js";
import { creaServer } from "./server.js";
import { createTelegramSource } from "./sources/telegram.js";

/* Ogni connettore ricorda a che punto è arrivato sotto una chiave sua nella
   tabella `sorgente_stato`. Prefisso esplicito perché il giorno che ci sono due
   bot Telegram (uno personale, uno di lavoro) le due ricevute non si pestino. */
const chiaveOffset = (nome) => `offset:${nome}`;

/**
 * @param {object} config  vedi config.js
 * @param {(...parti: unknown[]) => void} [log]
 */
export function avviaServizio(config, log = console.log) {
  const coda = apriCoda(config.dati);
  const connettori = [];

  const telegram = config.sorgenti?.telegram;
  if (telegram?.token) {
    const nome = "telegram";
    const source = createTelegramSource({
      token: telegram.token,
      chatConsentite: telegram.chat ?? [],
      leggiOffset: () => coda.leggiStato(chiaveOffset(nome), 0),
      scriviOffset: (v) => coda.scriviStato(chiaveOffset(nome), v),
      log: (...parti) => log(`[${nome}]`, ...parti),
      onOrigine: (origine, message) => {
        /* Le informazioni di servizio finiscono in `servizio` e non nei campi
           dell'origine: chi ha scritto e in che chat serve a ritrovare il
           messaggio, non a fare la task. È la separazione che § Sorgente di
           origine chiedeva, e qui c'è il posto per tenerla. */
        const seq = coda.accoda(origine, {
          chatId: message.chat?.id,
          chatTitolo: message.chat?.title ?? message.chat?.username ?? null,
          da: message.from?.username ?? message.from?.first_name ?? null,
          messageId: message.message_id,
          inviatoAt: message.date ? new Date(message.date * 1000).toISOString() : null,
        });
        /* `null` = c'era già. Non è un errore: succede ogni volta che un
           connettore rilegge qualcosa dopo un riavvio a metà. */
        log(`[${nome}]`, seq === null ? "doppione ignorato:" : `accodata #${seq}:`, origine.title);
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
          { attivo: source.attivo, offset: coda.leggiStato(chiaveOffset(nome), 0) },
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
