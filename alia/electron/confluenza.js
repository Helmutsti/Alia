/* L'innesto fra la finestra sulla confluenza e Alia.

   `src/confluenza/cliente.js` sa affacciarsi e sa dire "decisa". Qui si decide
   dove sta la configurazione, **cosa vuol dire accettare un'origine**, e chi
   avverte la finestra quando il numero cambia.

   ── Le due decisioni ───────────────────────────────────────────────────────

     accetta(seq)  →  nasce un task, poi l'origine è processata
     rifiuta(seq)  →  non nasce niente, l'origine è processata

   In entrambi i casi il servizio riceve lo stesso bit. La differenza non la
   tiene lui: si legge qui, guardando se esiste un task con quel `sourceId`.
   Tenerla anche di là vorrebbe dire conservare in due posti una cosa che è vera
   in uno — e le due copie prima o poi divergono.

   **L'ordine non è negoziabile: prima si scrive, poi si processa.** Al
   contrario, un errore fra i due passi cancellerebbe una cosa da fare senza
   che ne resti traccia da nessuna parte. Così invece il peggio che può
   succedere è che l'origine resti nella finestra dopo essere già diventata un
   task: la si rivede, e la si rifiuta. Visibile e rimediabile.

   ── Perché la configurazione si rilegge e il client si rifà ────────────────

   Le Impostazioni possono cambiare indirizzo, token e modo mentre l'app gira.
   Un client costruito una volta all'avvio resterebbe legato ai valori vecchi
   fino al riavvio — e "ho cambiato l'indirizzo ma continua a dare errore" è
   esattamente il tipo di bugia che un pannello di impostazioni non può
   permettersi. Quindi `configura()` butta via il client e ne fa uno nuovo. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { creaConfluenza, MODI, OGNI_MINIMO, OGNI_PREDEFINITO } from "../src/confluenza/cliente.js";

const FILE_CONFIG = "confluenza.json";

const VUOTA = { url: "", token: "", modo: "manuale", ogniSecondi: OGNI_PREDEFINITO };

function normalizza(grezza) {
  const ogni = Number(grezza.ogniSecondi);
  return {
    url: typeof grezza.url === "string" ? grezza.url.trim() : "",
    token: typeof grezza.token === "string" ? grezza.token.trim() : "",
    modo: MODI.includes(grezza.modo) ? grezza.modo : "manuale",
    ogniSecondi: Number.isFinite(ogni) ? Math.max(OGNI_MINIMO, Math.round(ogni)) : OGNI_PREDEFINITO,
  };
}

export function creaConfluenzaAlia({ core, cartella, log, avvisaFinestre }) {
  const percorso = join(cartella, FILE_CONFIG);
  let config = VUOTA;
  let cliente = null;

  function daFile() {
    let file = {};
    if (existsSync(percorso)) {
      try {
        file = JSON.parse(readFileSync(percorso, "utf8"));
      } catch (err) {
        log("confluenza.json illeggibile:", err.message);
      }
    }
    /* Le variabili d'ambiente vincono, come ovunque in Alia: servono a provare
       un'altra confluenza senza toccare quella configurata. */
    return normalizza({
      ...file,
      url: process.env.ALIA_CONFLUENZA_URL ?? file.url,
      token: process.env.ALIA_CONFLUENZA_TOKEN ?? file.token,
    });
  }

  function configura() {
    cliente?.stop();
    cliente = null;
    config = daFile();

    if (!config.url || !config.token) {
      log(`confluenza: non configurata (atteso in ${percorso})`);
      return;
    }

    cliente = creaConfluenza({
      url: config.url,
      token: config.token,
      modo: config.modo,
      ogniSecondi: config.ogniSecondi,
      log: (...parti) => log("confluenza:", ...parti),
      /* Il colpetto: il numero è cambiato, la finestra si riaffacci. Non porta
         i dati — li va a prendere chi li mostra. */
      onCambio: avvisaFinestre,
    });
    cliente.avviaPeriodico();
    log(`confluenza: pronta su ${config.url}, modo ${config.modo}`);
  }

  configura();

  /* Un esito invece di un'eccezione, sempre. Queste chiamate attraversano l'IPC
     e possono fallire per ragioni che il core non conosce — rete, token,
     servizio spento — e sono tutte condizioni da mostrare in interfaccia, non
     guasti da rincorrere. Attraverso l'IPC un'eccezione perderebbe per di più
     il messaggio, che qui è l'unica cosa utile. */
  async function prova(azione, quando) {
    if (!cliente) {
      return { esito: "non-configurata", errore: "La confluenza non è configurata." };
    }
    try {
      return { esito: "riuscito", errore: null, ...(await azione()) };
    } catch (err) {
      log(`confluenza: ${quando} fallito:`, err.message);
      return { esito: "fallito", errore: err.message };
    }
  }

  return {
    leggiConfig: () => ({ ...config, percorso, configurata: Boolean(config.url && config.token) }),

    scriviConfig(patch) {
      const nuova = normalizza({ ...config, ...patch });
      writeFileSync(percorso, `${JSON.stringify(nuova, null, 2)}\n`, "utf8");
      configura();
      return this.leggiConfig();
    },

    /* Affacciarsi alla finestra. È l'unica lettura, e non cambia niente. */
    elenco: () => prova(() => cliente.elenco(), "elenco"),

    /* Accettare: l'origine entra nel sistema.

       Il task nasce **come qualunque altro task scritto a mano** — in inbox, da
       smistare. Non è un'origine: è una cosa da fare che qualcuno ha deciso di
       avere. Conserva però da dove viene (`sourceType`, `sourceId`, `sourceUrl`,
       `originalContent`), che è ciò che permette di dire, guardando un task, che
       quell'origine è stata accettata e non buttata.
 */
    accetta: (seq, patch = {}) =>
      prova(async () => {
        const { origini } = await cliente.elenco();
        const origine = origini.find((o) => o.seq === seq);
        if (!origine) {
          /* Sparita fra l'elenco e il click: qualcuno l'ha già decisa da
             un'altra finestra. Non è un errore da mostrare in rosso — è la
             lista che era vecchia. */
          return { esito: "gia-decisa", errore: null };
        }

        const titolo = String(patch.title ?? origine.title).trim() || origine.title;
        const creato = core.createTask({
          title: titolo,
          originalContent: origine.originalContent,
          sourceType: origine.sourceType,
          sourceId: origine.sourceId,
          sourceUrl: origine.sourceUrl,
        });
        if (creato.esito !== "applicato") {
          throw new Error(`il core ha rifiutato l'origine ${seq}: ${creato.esito}`);
        }

        await cliente.processa(seq);
        avvisaFinestre();
        return { idTask: creato.idTask };
      }, "accettazione"),

    /* Rifiutare: non nasce niente. L'origine resta nel servizio con il suo
       testo — non viene cancellata, smette solo di comparire. */
    rifiuta: (seq) =>
      prova(async () => {
        await cliente.processa(seq);
        return {};
      }, "rifiuto"),

    /* La prova delle Impostazioni: chiede `/salute` e non decide niente. */
    async provaCollegamento(candidata) {
      const c = normalizza({ ...config, ...candidata });
      if (!c.url || !c.token) return { esito: "non-configurata", errore: "Servono indirizzo e token." };
      try {
        const finto = creaConfluenza({ url: c.url, token: c.token });
        return { esito: "riuscito", salute: await finto.salute(), errore: null };
      } catch (err) {
        return { esito: "fallito", errore: err.message };
      }
    },

    stato: () => ({
      ...(cliente?.stato() ?? { modo: config.modo, ogniSecondi: config.ogniSecondi, periodicoAcceso: false }),
      configurata: Boolean(cliente),
    }),

    stop: () => cliente?.stop(),
  };
}
