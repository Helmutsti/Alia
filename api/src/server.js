/* L'API della confluenza: tre rotte e nessuna dipendenza.

   Il contratto **non e' quello di una casella di posta**, ed e' cambiato: il
   servizio non consegna, **mostra**. L'area origini di Alia e' una finestra su
   questa coda, non una copia — quindi rileggere non consuma, non sposta niente,
   e ripetere la stessa GET e' esattamente come non averla mai fatta.

     GET  /salute                     come sta, e quante origini aspettano
     GET  /origini?limite=            quelle ancora da decidere
     POST /origini/<seq>/processata   la decisione e' presa: toglila dalla vista

   L'unico verbo che cambia lo stato e' il terzo, e cambia **un bit solo**.
   Perche' l'origine entri nel sistema o venga rifiutata, da qui, non fa
   differenza: quella distinzione si legge in Alia, guardando se esiste un task
   che cita l'origine. Tenerla anche qui vorrebbe dire conservare in due posti
   una cosa vera in uno.

   ── Cos'e' sparito, e perche' ──────────────────────────────────────────────

   `POST /origini/conferma` con il cursore. Serviva quando il servizio
   consegnava e Alia conservava: una ricevuta di lettura che diceva "fin qui ho
   preso". Ma consegnare un'origine significava gia' averla decisa, e
   un'origine non e' un task — e' qualcosa che aspetta una decisione. Con
   `isProcessed` la domanda giusta ("quali restano da decidere") e' gia' una
   query, e la ricevuta non serve piu'.

   ── Niente dipendenze ──────────────────────────────────────────────────────

   `node:http` basta: tre rotte, un token da confrontare, del JSON. Un framework
   qui aggiungerebbe un albero di pacchetti da aggiornare a un servizio che deve
   solo restare acceso. */

import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

/* Confronto a tempo costante: `===` su una stringa segreta esce al primo
   carattere diverso, e la differenza di tempo racconta quanti caratteri erano
   giusti. Su un token indovinabile un carattere alla volta non è un dettaglio
   teorico. Le lunghezze diverse si scartano prima — `timingSafeEqual` lancia se
   i buffer non sono lunghi uguali, e la lunghezza di un token non è un segreto. */
function tokenValido(ricevuto, atteso) {
  if (typeof ricevuto !== "string" || ricevuto.length !== atteso.length) return false;
  return timingSafeEqual(Buffer.from(ricevuto), Buffer.from(atteso));
}

function rispondi(res, codice, corpo) {
  const testo = JSON.stringify(corpo);
  res.writeHead(codice, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(testo),
    /* Le origini sono la tua inbox: nessuna cache, da nessuna parte. */
    "cache-control": "no-store",
  });
  res.end(testo);
}

/**
 * @param {object} opzioni
 * @param {ReturnType<import("./coda.js").apriCoda>} opzioni.coda
 * @param {string} opzioni.token         il segreto che il client deve presentare
 * @param {() => object} [opzioni.statoSorgenti]  diagnostica per /salute
 * @param {(...parti: unknown[]) => void} [opzioni.log]
 */
export function creaServer({ coda, token, statoSorgenti = () => ({}), log = () => {} }) {
  if (typeof token !== "string" || token.length < 16) {
    /* Un token corto è peggio di nessun token: dà l'impressione di una porta
       chiusa. Meglio rifiutarsi di partire che partire indifesi. */
    throw new TypeError("token must be a string of at least 16 characters");
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://confluenza.local");

    try {
      const intestazione = req.headers.authorization ?? "";
      const presentato = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
      if (!tokenValido(presentato, token)) {
        log(req.method, url.pathname, "→ 401");
        return rispondi(res, 401, { errore: "token mancante o sbagliato" });
      }

      if (req.method === "GET" && url.pathname === "/salute") {
        return rispondi(res, 200, {
          ok: true,
          daProcessare: coda.quanteDaProcessare(),
          sorgenti: statoSorgenti(),
        });
      }

      if (req.method === "GET" && url.pathname === "/origini") {
        const limite = Number(url.searchParams.get("limite") ?? 200);
        if (Number.isNaN(limite)) return rispondi(res, 400, { errore: "limite non numerico" });
        const origini = coda.daProcessare({ limite });
        return rispondi(res, 200, { origini, daProcessare: coda.quanteDaProcessare() });
      }

      /* `POST /origini/<seq>/processata`.

         Il `seq` sta nel percorso e non nel corpo perche' identifica la risorsa
         su cui si agisce: e' una riga precisa, non un parametro dell'azione.
         E POST e non DELETE: l'origine non viene cancellata — resta li', con il
         suo testo e le sue informazioni di servizio, e smette solo di comparire
         nella finestra. */
      const processata = req.method === "POST" && url.pathname.match(/^\/origini\/(\d+)\/processata$/);
      if (processata) {
        const seq = Number(processata[1]);
        if (!coda.esiste(seq)) return rispondi(res, 404, { errore: `nessuna origine ${seq}` });
        /* `cambiata: false` non e' un errore: e' gia' stata decisa. Succede con
           due finestre aperte sulla stessa coda, o quando una risposta si perde
           e il gesto si ripete. Chi chiama ottiene comunque quello che voleva —
           che quella riga non compaia piu'. */
        const cambiata = coda.processa(seq);
        log("POST /origini/" + seq + "/processata →", cambiata ? "processata" : "era gia' processata");
        return rispondi(res, 200, { seq, cambiata, daProcessare: coda.quanteDaProcessare() });
      }

      return rispondi(res, 404, { errore: `niente a ${req.method} ${url.pathname}` });
    } catch (err) {
      /* Il messaggio dell'errore non esce: un 500 che racconta cosa è andato
         storto dentro racconta anche com'è fatto dentro. Nel log sì, per
         intero. */
      log("ERRORE", req.method, url.pathname, err.message, err.stack ?? "");
      return rispondi(res, 500, { errore: "errore interno" });
    }
  });
}
