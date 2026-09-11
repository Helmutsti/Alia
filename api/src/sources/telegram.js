/* Il connettore Telegram: la prima sorgente esterna vera.

   Fino a ieri tutti i task del database erano `sourceType = 'manual'`, quindi
   la colonna "Origini da confermare" era costruita e vuota e il badge non aveva
   niente da contare (§ Questioni aperte, punto 9). Questo modulo è il mittente
   che mancava.

   ── Perché è un modulo puro ────────────────────────────────────────────────

   Qui dentro non entrano né Electron né il database. Il connettore riceve un
   token, una whitelist e tre funzioni (consegna l'origine, leggi l'offset,
   scrivi l'offset) e non sa che fine faccia quello che consegna. Le ragioni
   sono due: si prova senza aprire una finestra e senza toccare un file, e
   quando arriveranno mail e Discord la forma è già quella — cambia chi parla,
   non chi ascolta.

   ── Long polling, non webhook ──────────────────────────────────────────────

   `getUpdates` con `timeout` lungo: il server tiene aperta la richiesta finché
   non ha qualcosa da dire. Un webhook vorrebbe un indirizzo pubblico e un
   certificato, che un'app da scrivania non ha e non deve avere.

   ── L'idempotenza sta qui, non sul task ────────────────────────────────────

   Deciso in § Sorgente di origine: una sorgente può generare N task, quindi il
   vincolo `UNIQUE(sourceType, sourceId)` non si può riportare su `t_task`, e
   "non importare due volte lo stesso messaggio" è responsabilità del
   connettore. Telegram lo rende facile: l'`offset` di `getUpdates` è esattamente
   la ricevuta di lettura. Lo si conserva fuori (in un file, vedi
   `electron/telegram.js`) perché sopravviva alla chiusura dell'app. */

const API = "https://api.telegram.org";

/* Il server tiene aperta la richiesta fino a 25s. Non è un'attesa sprecata:
   è l'attesa che sostituisce le richieste a vuoto ogni due secondi. */
const ATTESA_POLL = 25;

/* Dopo un errore di rete non si ritenta subito: si sale da 1s a 60s
   raddoppiando, e si torna a 1s appena una chiamata riesce. Senza, una
   disconnessione del wifi diventa un ciclo stretto che scalda il portatile. */
const PAUSA_MINIMA = 1_000;
const PAUSA_MASSIMA = 60_000;

/* Il titolo di un task è una riga in una card larga ~250px: ci sta poco, e
   quello che avanza vive comunque in `originalContent`, che non taglia niente. */
const TITOLO_MASSIMO = 120;

/* ── da messaggio a origine ────────────────────────────────────────────────── */

/* Il titolo è la prima riga, perché è così che si scrive un messaggio che
   contiene una cosa da fare: l'oggetto prima, i dettagli sotto. Se la prima
   riga è lunga si taglia sull'ultimo spazio prima del limite — spezzare una
   parola a metà si legge peggio di un titolo più corto. */
export function titoloDaTesto(testo) {
  const prima = testo.split("\n").find((riga) => riga.trim() !== "")?.trim() ?? "";
  if (prima.length <= TITOLO_MASSIMO) return prima;
  const tagliato = prima.slice(0, TITOLO_MASSIMO);
  const spazio = tagliato.lastIndexOf(" ");
  return `${(spazio > TITOLO_MASSIMO / 2 ? tagliato.slice(0, spazio) : tagliato).trimEnd()}…`;
}

/* Un messaggio → un'origine (deciso l'11/09/2026). La regola "1 sorgente → N
   task" resta vera nel modello: un messaggio con tre cose dentro si spezza
   dopo, a mano, dal triage. Spezzarlo qui vorrebbe dire decidere per l'utente
   che un a-capo è un confine, e non lo è.

   `sourceId` è `chat:messaggio` e non il solo id del messaggio: gli id dei
   messaggi sono unici **per chat**, non globalmente. Con più chat autorizzate,
   il solo `message_id` collezionerebbe collisioni.

   `sourceUrl` esiste solo per i canali e i gruppi pubblici, che hanno uno
   `username`. Una chat privata con il bot non ha un indirizzo pubblico: lì il
   link è `null`, ed è giusto che sia visibilmente assente invece che finto.
   Il resto delle informazioni di servizio (chi ha scritto, da dove è stato
   inoltrato) è quello che § Sorgente di origine destina a `t_source`: finché
   quell'entità non esiste, non lo si spalma sui campi del task. */
export function origineDaMessaggio(message) {
  const testo = (message.text ?? message.caption ?? "").trim();
  if (testo === "") return null;

  const chat = message.chat ?? {};
  return {
    title: titoloDaTesto(testo),
    originalContent: testo,
    sourceType: "telegram",
    sourceId: `${chat.id}:${message.message_id}`,
    sourceUrl: chat.username ? `https://t.me/${chat.username}/${message.message_id}` : null,
  };
}

/* ── il connettore ─────────────────────────────────────────────────────────── */

const dormi = (ms) => new Promise((risolvi) => setTimeout(risolvi, ms));

/**
 * @param {object} opzioni
 * @param {string} opzioni.token           il token di @BotFather
 * @param {Array<number|string>} opzioni.chatConsentite  whitelist di chat id
 * @param {(origine: object, message: object) => unknown} opzioni.onOrigine
 * @param {() => number} opzioni.leggiOffset
 * @param {(offset: number) => void} opzioni.scriviOffset
 * @param {(...parti: unknown[]) => void} [opzioni.log]
 * @param {typeof fetch} [opzioni.fetchImpl]  iniettabile per i test
 */
export function createTelegramSource({
  token,
  chatConsentite = [],
  onOrigine,
  leggiOffset = () => 0,
  scriviOffset = () => {},
  log = () => {},
  fetchImpl = globalThis.fetch,
}) {
  if (typeof token !== "string" || token.trim() === "") {
    throw new TypeError("token must be a non-empty string");
  }
  if (typeof onOrigine !== "function") {
    throw new TypeError("onOrigine must be a function");
  }

  /* Gli id arrivano da un file di configurazione scritto a mano, dove un
     numero può essere finito fra virgolette. Confrontarli come stringhe evita
     che `"123" !== 123` chiuda fuori la chat giusta. */
  const consentite = new Set(chatConsentite.map((id) => String(id)));
  const autorizzata = (idChat) => consentite.has(String(idChat));

  let attivo = false;
  let annulla = null;
  let pausa = PAUSA_MINIMA;

  /* `interrompibile` distingue l'attesa lunga dalle altre chiamate: `stop()`
     deve tagliare il `getUpdates` che dorme fino a 25 secondi, non la risposta
     al mittente che sta partendo in quel momento. */
  async function chiama(metodo, corpo, interrompibile = false) {
    const controllore = new AbortController();
    if (interrompibile) annulla = () => controllore.abort();
    const risposta = await fetchImpl(`${API}/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
      signal: controllore.signal,
    });
    const dati = await risposta.json();
    if (!dati.ok) {
      /* 409 è l'unico errore che vale la pena riconoscere per nome: vuol dire
         che un'altra copia del bot sta già leggendo gli stessi update — due
         Alia aperte, o un vecchio processo rimasto in piedi. Senza la frase
         resterebbe un "conflict" che non spiega niente. */
      const dettaglio =
        dati.error_code === 409
          ? "un'altra istanza del bot sta già leggendo gli update (due Alia aperte?)"
          : (dati.description ?? "errore sconosciuto");
      throw new Error(`Telegram ${metodo}: ${dettaglio}`);
    }
    return dati.result;
  }

  /* La risposta al mittente non è cortesia: senza, chi scrive non sa se il
     messaggio è entrato in Alia o è caduto nel vuoto. È l'unica conferma che
     può avere, visto che l'inbox è su un'altra macchina. Se fallisce non
     fallisce l'importazione: il task c'è già, e riprovare lo creerebbe due
     volte. */
  async function rispondi(idChat, testo, idMessaggio) {
    try {
      await chiama("sendMessage", {
        chat_id: idChat,
        text: testo,
        reply_to_message_id: idMessaggio,
        /* Il messaggio potrebbe essere stato cancellato mentre lo importavamo:
           in quel caso la risposta parte lo stesso, senza citazione. */
        allow_sending_without_reply: true,
      });
    } catch (err) {
      log("risposta non inviata:", err.message);
    }
  }

  async function gestisci(update) {
    const message = update.message;
    if (!message) return;
    const idChat = message.chat?.id;

    /* Whitelist vuota = configurazione a metà, non "tutti dentro". Un bot ha un
       nome pubblico: chiunque lo trovi può scrivergli, e senza filtro la tua
       inbox è aperta al mondo. Qui il bot non crea niente e restituisce l'id
       della chat, che è esattamente il dato che serve per compilare la
       whitelist — la configurazione si chiude parlando col bot, senza andare a
       cercare l'id altrove. */
    if (consentite.size === 0) {
      log("whitelist vuota: nessuna origine creata, chat", idChat);
      await rispondi(
        idChat,
        /* La frase nomina il campo, non un file: il connettore vive nel
           servizio e non sa dove quello tenga la sua configurazione — potrebbe
           essere un file, potrebbero essere variabili d'ambiente in un
           container. "chat" e' vero in tutti i casi; un percorso lo era
           finche' il bot viveva dentro Alia. */
        `Questa chat non è ancora autorizzata.\nIl suo id è: ${idChat}\nAggiungilo all’elenco "chat" della sorgente Telegram, poi riavvia il servizio.`,
        message.message_id,
      );
      return;
    }

    if (!autorizzata(idChat)) {
      log("chat non autorizzata:", idChat);
      await rispondi(idChat, "Questa chat non è autorizzata a scrivere in Alia.", message.message_id);
      return;
    }

    const origine = origineDaMessaggio(message);
    if (!origine) {
      /* Foto, sticker, vocali, documenti senza didascalia: il modello di un
         task è fatto di testo (`title`, `originalContent`), e un allegato senza
         testo non ha niente da metterci. Gli allegati arriveranno con
         `t_source` e con la tabella degli allegati già prevista nello schema. */
      await rispondi(
        idChat,
        "Per ora Alia raccoglie solo messaggi di testo (o allegati con didascalia).",
        message.message_id,
      );
      return;
    }

    await onOrigine(origine, message);
    log("origine creata:", origine.sourceId, "—", origine.title);
    await rispondi(idChat, `Aggiunto alle origini da smistare:\n« ${origine.title} »`, message.message_id);
  }

  async function giro() {
    /* `offset` è l'update successivo all'ultimo digerito: chiedendo da lì,
       Telegram considera confermati tutti quelli prima e non li rimanda più.
       Quindi si scrive **dopo** aver gestito l'update, non prima: se Alia muore
       a metà, al riavvio quell'update torna. Meglio un doppione raro che una
       cosa da fare persa — ed è il motivo per cui questo è un `offset` e non un
       "ho letto fin qui" ottimista. */
    const updates = await chiama(
      "getUpdates",
      { offset: leggiOffset(), timeout: ATTESA_POLL, allowed_updates: ["message"] },
      true,
    );

    for (const update of updates) {
      if (!attivo) return;
      try {
        await gestisci(update);
      } catch (err) {
        /* Un messaggio che esplode non può fermare la fila dietro di lui. Si
           scrive comunque l'offset: rimanderlo indietro vorrebbe dire
           ritentarlo all'infinito, e lo stesso messaggio esploderebbe uguale. */
        log("update", update.update_id, "scartato:", err.message);
      }
      scriviOffset(update.update_id + 1);
    }
  }

  async function ciclo() {
    while (attivo) {
      try {
        await giro();
        pausa = PAUSA_MINIMA;
      } catch (err) {
        if (!attivo) return;
        log("ciclo in pausa", `${pausa}ms:`, err.message);
        await dormi(pausa);
        pausa = Math.min(pausa * 2, PAUSA_MASSIMA);
      }
    }
  }

  return {
    /* Non si aspetta: il ciclo vive per conto suo finché non lo si ferma.
       Chi avvia il connettore sta aprendo una finestra, non importando dati. */
    start() {
      if (attivo) return;
      attivo = true;
      pausa = PAUSA_MINIMA;
      ciclo();
    },
    /* `abort` sulla richiesta in corso: senza, la chiusura dell'app resterebbe
       appesa fino a 25 secondi dietro a un `getUpdates` che aspetta. */
    stop() {
      attivo = false;
      annulla?.();
    },
    get attivo() {
      return attivo;
    },
  };
}
