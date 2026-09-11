/* Il connettore Discord: la seconda sorgente, sulla forma della prima.

   Ricalca `telegram.js` di proposito — modulo puro, niente Electron, niente
   database, tre funzioni iniettate (consegna l'origine, leggi il cursore,
   scrivi il cursore) e un `fetch` sostituibile nei test. Quello che cambia è
   tutto qui sotto, e sono tre cose.

   ── 1. REST a intervalli, non Gateway ──────────────────────────────────────

   Un bot Discord di solito vive sul Gateway: una WebSocket aperta che riceve
   `MESSAGE_CREATE` in tempo reale. Qui no, e non è pigrizia.

   Il Gateway serve a **ricevere da tutto quello che il bot vede**: identify,
   heartbeat, resume, sequenze, intent privilegiati. Ma questo connettore legge
   **i canali che gli dici tu**, uno o due, e per quello
   `GET /channels/{id}/messages?after=` dice la stessa identica cosa con una
   `fetch`. Il prezzo è la latenza — fino a un giro, cioè cinque secondi — e per
   una cosa da fare che arriva in una casella da smistare cinque secondi non
   sono niente.

   Il giorno che servisse il realtime, il Gateway entra dietro questa stessa
   interfaccia (`start`/`stop`/`attivo`) e fuori non cambia una riga.

   ── 2. Il cursore è uno per canale ─────────────────────────────────────────

   Telegram ha un `offset` solo perché `getUpdates` è una fila sola per tutto il
   bot. Qui ogni canale ha la sua storia e il suo `after`, quindi il cursore è
   una mappa `{ idCanale: idUltimoMessaggio }` — che resta comunque **un valore
   solo** in `sorgente_stato`, perché `leggiStato`/`scriviStato` conservano JSON.

   Gli id di Discord sono *snowflake*: interi che crescono nel tempo. `after`
   confronta numericamente, quindi "dammi quelli dopo questo" ordina davvero, e
   il cursore si scrive **dopo** aver digerito il messaggio — come l'offset di
   Telegram, e per lo stesso motivo: meglio un doppione raro che una cosa da
   fare persa.

   ── 3. Si risponde con una reazione, non con un messaggio ──────────────────

   Su Telegram la chat col bot è una casella privata: una risposta è l'unica
   conferma che chi scrive può avere, e non disturba nessuno. Un canale Discord
   è un posto **condiviso**, e un bot che replica a ogni messaggio lo rende
   illeggibile per tutti gli altri.

   Quindi il ricevuto è una reazione sul messaggio: ✅ se è entrato nelle
   origini, 🚫 se non c'era testo da prenderci. È il modo in cui su Discord si
   dice "visto" — silenzioso, e visibile a chi ha scritto.

   ── L'altra differenza, che è una trappola ─────────────────────────────────

   I messaggi del bot tornano indietro. Su Telegram `getUpdates` non restituisce
   quello che hai mandato tu; qui `GET messages` restituisce **tutto**, comprese
   le risposte dei bot. Se il connettore non filtrasse `author.bot` e un giorno
   scrivesse in canale, leggerebbe sé stesso — e ogni messaggio ne genererebbe
   un altro, per sempre. È il motivo per cui quel filtro sta in una funzione
   esportata e provata, invece che in un `if` distratto dentro il ciclo. */

import { titoloDaTesto } from "./testo.js";

const API = "https://discord.com/api/v10";

/* Cinque secondi fra un giro e l'altro. Discord conta le richieste per rotta:
   un canale ogni cinque secondi sta lontanissimo da qualsiasi limite, e se
   dovesse comunque arrivare un 429 la risposta dice quanto aspettare e lo si
   aspetta (vedi `chiama`). */
const PAUSA_GIRO = 5_000;

/* Dopo un errore di rete non si ritenta subito: si sale da 1s a 60s
   raddoppiando, e si torna a 1s appena una chiamata riesce. */
const PAUSA_MINIMA = 1_000;
const PAUSA_MASSIMA = 60_000;

/* Il massimo che Discord dà in una volta. Se ne tornano esattamente 100 c'è
   probabilmente altro dietro, e il giro continua senza aspettare cinque
   secondi: un arretrato (il servizio spento per una notte) si smaltisce in
   qualche secondo invece che in mezz'ora. */
const LOTTO = 100;

/* L'epoca degli snowflake di Discord: 1º gennaio 2015. Serve a fabbricare un
   cursore "da adesso in poi" senza chiedere niente al server — vedi `daAdesso`. */
const EPOCA = 1_420_070_400_000n;

const SPUNTA = encodeURIComponent("✅");
const VIETATO = encodeURIComponent("🚫");

/* ── da messaggio a origine ────────────────────────────────────────────────── */

/* I soli tipi che sono davvero un messaggio scritto da qualcuno: 0 è quello
   normale, 19 è una risposta. Tutto il resto (qualcuno è entrato nel server,
   l'avviso che un messaggio è stato fissato, il boost) è cronaca del canale,
   non una cosa da fare — e trasformarlo in un'origine vorrebbe dire mettere in
   coda "Tizio è entrato nel server". */
const TIPI_SCRITTI = new Set([0, 19]);

/* Cosa vale la pena guardare. Sta fuori dal ciclo perché è la guardia contro
   l'anello: un bot che si rilegge da solo. Vedi il commento in testa. */
export function daGuardare(message) {
  if (!TIPI_SCRITTI.has(message.type ?? 0)) return false;
  if (message.author?.bot === true) return false;
  if (message.webhook_id) return false;
  return true;
}

/* Un messaggio → un'origine, come su Telegram e per le stesse ragioni: un
   messaggio con tre cose dentro si spezza dopo, a mano, dal triage.

   `sourceId` è `canale:messaggio` anche se lo snowflake sarebbe già unico da
   solo in tutto Discord: costa niente e si legge da dove viene senza aprire
   l'indirizzo. Restare sulla stessa forma di Telegram vale più dei quattro
   caratteri risparmiati.

   `sourceUrl` qui esiste **sempre**, al contrario di Telegram: ogni messaggio
   ha un indirizzo, e per i messaggi diretti il posto del server lo prende
   `@me`. Il `guildId` non viene dal messaggio — le risposte REST non sempre lo
   portano — ma dal canale, chiesto una volta sola e tenuto da parte. */
export function origineDaMessaggio(message, guildId = null) {
  const testo = (message.content ?? "").trim();
  if (testo === "") return null;

  return {
    title: titoloDaTesto(testo),
    originalContent: testo,
    sourceType: "discord",
    sourceId: `${message.channel_id}:${message.id}`,
    sourceUrl: `https://discord.com/channels/${guildId ?? "@me"}/${message.channel_id}/${message.id}`,
  };
}

/* Il cursore di partenza, la prima volta che si guarda un canale.

   La storia **non** si importa: un canale con tremila messaggi vecchi non è un
   arretrato da smistare, è rumore che seppellirebbe la colonna delle origini al
   primo avvio. Si parte da adesso, e da adesso in poi non si perde più niente.

   Uno snowflake è `(millisecondi - epoca) << 22`; i 22 bit bassi identificano
   la macchina e la sequenza, e a zero danno "il primo istante possibile di quel
   millisecondo". Fabbricarlo invece di chiedere qual è l'ultimo messaggio vero
   evita una chiamata e soprattutto il caso che la romperebbe: un canale ancora
   vuoto, dove non c'è nessun ultimo messaggio a cui agganciarsi. */
export function daAdesso(adesso = Date.now()) {
  return String((BigInt(adesso) - EPOCA) << 22n);
}

/* ── il connettore ─────────────────────────────────────────────────────────── */

/* Le tre risposte che vale la pena tradurre, perché sono quelle che capitano
   davvero e la frase di Discord non dice cosa farci. */
function spiega(stato, dati) {
  if (stato === 401) return "token del bot rifiutato: è sbagliato o è stato rigenerato";
  if (stato === 403) {
    return "il bot non può leggere questo canale: invitalo nel server e dagli «Visualizza canale» e «Leggi cronologia messaggi»";
  }
  if (stato === 404) return "canale inesistente: controlla l'id";
  return dati?.message ?? `risposta ${stato}`;
}

/**
 * @param {object} opzioni
 * @param {string} opzioni.token                 il token del bot (Developer Portal → Bot)
 * @param {Array<number|string>} opzioni.canali  gli id dei canali da leggere
 * @param {(origine: object, message: object) => unknown} opzioni.onOrigine
 * @param {() => Record<string, string>} opzioni.leggiCursori
 * @param {(cursori: Record<string, string>) => void} opzioni.scriviCursori
 * @param {(...parti: unknown[]) => void} [opzioni.log]
 * @param {typeof fetch} [opzioni.fetchImpl]     iniettabile per i test
 * @param {number} [opzioni.pausaGiro]           iniettabile per i test
 */
export function createDiscordSource({
  token,
  canali = [],
  onOrigine,
  leggiCursori = () => ({}),
  scriviCursori = () => {},
  log = () => {},
  fetchImpl = globalThis.fetch,
  pausaGiro = PAUSA_GIRO,
}) {
  if (typeof token !== "string" || token.trim() === "") {
    throw new TypeError("token must be a non-empty string");
  }
  if (typeof onOrigine !== "function") {
    throw new TypeError("onOrigine must be a function");
  }

  /* Come su Telegram: gli id arrivano da un file scritto a mano, dove un numero
     può essere finito fra virgolette. Qui in più è una necessità e non una
     cortesia — uno snowflake ha 19 cifre e in un `Number` non ci sta senza
     perdere le ultime, quindi vive come stringa dall'inizio alla fine. */
  const elenco = canali.map((id) => String(id));

  /* Il server di un canale, chiesto una volta e ricordato: serve solo a
     comporre `sourceUrl`, non cambia mai, e richiederlo a ogni giro sarebbe una
     chiamata ogni cinque secondi per un dato immobile. */
  const server = new Map();

  let attivo = false;
  let annulla = null;
  let svegliati = null;
  let pausa = PAUSA_MINIMA;

  /* Due modi di essere interrotti, e servono entrambi: `annulla` taglia la
     richiesta in volo, `svegliati` taglia l'attesa fra un giro e l'altro.
     Senza il secondo, chiudere il servizio resterebbe appeso fino a cinque
     secondi dietro a un `setTimeout` che non interessa più a nessuno. */
  const dormi = (ms) =>
    new Promise((risolvi) => {
      const orologio = setTimeout(risolvi, ms);
      svegliati = () => {
        clearTimeout(orologio);
        risolvi();
      };
    });

  async function chiama(percorso, opzioni = {}) {
    const controllore = new AbortController();
    annulla = () => controllore.abort();
    const risposta = await fetchImpl(`${API}/${percorso}`, {
      method: "GET",
      ...opzioni,
      headers: { authorization: `Bot ${token}`, ...opzioni.headers },
      signal: controllore.signal,
    });

    /* 429 non è un guasto: è il server che dice "fra quanto". Si porta il tempo
       dentro l'errore e il ciclo aspetta quello invece della sua pausa
       inventata — che è l'unico modo di non peggiorare le cose ritentando
       troppo presto. */
    if (risposta.status === 429) {
      const dati = await risposta.json().catch(() => ({}));
      const attesa = Math.ceil((Number(dati.retry_after) || 1) * 1000);
      throw Object.assign(new Error(`troppe richieste, aspetto ${attesa}ms`), { attesa });
    }
    if (risposta.status === 204) return null;
    if (!risposta.ok) {
      const dati = await risposta.json().catch(() => ({}));
      throw new Error(`Discord ${percorso.split("?")[0]}: ${spiega(risposta.status, dati)}`);
    }
    return risposta.json();
  }

  async function idServer(idCanale) {
    if (!server.has(idCanale)) {
      const canale = await chiama(`channels/${idCanale}`);
      server.set(idCanale, canale?.guild_id ?? null);
      log("canale", idCanale, canale?.name ? `= #${canale.name}` : "(messaggi diretti)");
    }
    return server.get(idCanale);
  }

  /* Il ricevuto. Se fallisce non fallisce l'importazione: l'origine è già in
     coda, e riprovare la creerebbe due volte. Una reazione mancata è un
     fastidio; un doppione è un errore. */
  async function reagisci(message, emoji) {
    try {
      await chiama(`channels/${message.channel_id}/messages/${message.id}/reactions/${emoji}/@me`, {
        method: "PUT",
      });
    } catch (err) {
      log("reazione non messa:", err.message);
    }
  }

  /* Il cursore si scrive uno alla volta e **rileggendo** la mappa: i canali si
     leggono in fila, e sovrascriverla con una copia presa prima perderebbe
     l'avanzamento di quello di prima. */
  function segna(idCanale, idMessaggio) {
    scriviCursori({ ...(leggiCursori() ?? {}), [idCanale]: String(idMessaggio) });
  }

  async function gestisci(message, guildId) {
    const origine = origineDaMessaggio(message, guildId);
    if (!origine) {
      /* Immagini, file, vocali senza una riga di testo: il modello di un task è
         fatto di testo (`title`, `originalContent`), e un allegato muto non ha
         niente da metterci. Il 🚫 lo dice a chi ha scritto senza spiegarlo a
         tutto il canale. */
      await reagisci(message, VIETATO);
      return;
    }

    await onOrigine(origine, message);
    log("origine creata:", origine.sourceId, "—", origine.title);
    await reagisci(message, SPUNTA);
  }

  async function giroCanale(idCanale) {
    const guildId = await idServer(idCanale);

    /* Il `while` è la pagina successiva, non un'attesa: si esce appena il lotto
       torna incompleto, cioè quando si è raggiunto il presente. */
    while (attivo) {
      let dopo = (leggiCursori() ?? {})[idCanale];
      if (!dopo) {
        dopo = daAdesso();
        segna(idCanale, dopo);
        log("canale", idCanale, "letto per la prima volta: si parte da adesso, la storia resta dov'è");
      }

      const lotto = await chiama(`channels/${idCanale}/messages?after=${dopo}&limit=${LOTTO}`);
      /* Discord consegna dal più recente. Si rovescia per digerirli nell'ordine
         in cui sono stati scritti: il cursore deve avanzare in avanti, e deve
         valere anche se ci si ferma a metà lotto. */
      const messaggi = [...(lotto ?? [])].reverse();

      for (const message of messaggi) {
        if (!attivo) return;
        if (daGuardare(message)) {
          try {
            await gestisci(message, guildId);
          } catch (err) {
            /* Un messaggio che esplode non può fermare la fila dietro di lui, e
               il cursore avanza lo stesso: rimandarlo indietro vorrebbe dire
               ritentarlo all'infinito, e lo stesso messaggio esploderebbe
               uguale. */
            log("messaggio", message.id, "scartato:", err.message);
          }
        }
        segna(idCanale, message.id);
      }

      if (messaggi.length < LOTTO) return;
    }
  }

  async function giro() {
    for (const idCanale of elenco) {
      if (!attivo) return;
      await giroCanale(idCanale);
    }
  }

  async function ciclo() {
    while (attivo) {
      try {
        await giro();
        pausa = PAUSA_MINIMA;
        await dormi(pausaGiro);
      } catch (err) {
        if (!attivo) return;
        /* Se il server ha detto quanto aspettare si aspetta quello, e la pausa
           progressiva non avanza: non è un guasto da cui ritirarsi, è un turno
           da rispettare. */
        const attesa = err.attesa ?? pausa;
        log("ciclo in pausa", `${attesa}ms:`, err.message);
        await dormi(attesa);
        if (!err.attesa) pausa = Math.min(pausa * 2, PAUSA_MASSIMA);
      }
    }
  }

  return {
    /* Non si aspetta: il ciclo vive per conto suo finché non lo si ferma. */
    start() {
      if (attivo) return;
      if (elenco.length === 0) {
        /* Elenco vuoto = configurazione a metà, e qui — al contrario di
           Telegram — il bot non può nemmeno dirti l'id che gli manca: nessuno
           gli sta scrivendo, non c'è niente da cui ricavarlo. L'id si copia dal
           canale con la Modalità sviluppatore accesa: tasto destro sul canale,
           «Copia ID canale». */
        log("nessun canale configurato: attiva la Modalità sviluppatore, tasto destro sul canale, «Copia ID canale»");
        return;
      }
      attivo = true;
      pausa = PAUSA_MINIMA;
      ciclo();
    },
    stop() {
      attivo = false;
      annulla?.();
      svegliati?.();
    },
    get attivo() {
      return attivo;
    },
  };
}
