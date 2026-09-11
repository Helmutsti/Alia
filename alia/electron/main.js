import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { ALIA_OPERATIONS, createAliaCore } from "../src/core/alia-core.js";
import { creaConfluenzaAlia } from "./confluenza.js";
import { creaPromemoria } from "./promemoria.js";
import { creaCattura } from "./cattura.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

/* ── Dove vivono i dati ─────────────────────────────────────────────────────

   `app.getPath("userData")`, cioe' `%APPDATA%\alia` su Windows. E' il posto che
   Electron propone, ed e' quello giusto per un programma che si installa.

   **C'e' stata una deviazione, l'11/09/2026, e vale la pena ricordarla.** Per
   mezza giornata i dati sono stati sul Desktop, in `Alia-dati`: la ragione era
   buona su una macchina sola — i dati dove si vedono, la cartella che si copia,
   nessun `%APPDATA%` da sapere cos'e'. Era sbagliata per un prodotto che si
   distribuisce: **ogni utente che installa si ritroverebbe una cartella sul
   proprio Desktop**, che e' un posto che la gente considera suo, e nessun'altra
   app lo fa.

   La lezione da tenere: "dove li vedo io" e "dove vanno per tutti" sono due
   domande diverse, e la seconda vince appena il programma esce da qui.

   `ALIA_DATA` resta per chi vuole spostarli davvero — una chiavetta, un disco
   condiviso, una prova con dati finti — e in quel caso e' una scelta fatta
   apposta, non un posto che ci si ritrova addosso. */
/* Il nome con cui Windows conosce Alia.

   Serve alle **notifiche**: senza, i toast arrivano a nome di "electron.app.
   Electron" quando ci arrivano, perche' Windows li attribuisce a un'identita'
   che non e' quella dell'applicazione. Una stringa in stile dominio rovesciato
   e' la convenzione; deve restare uguale fra una versione e l'altra, se no le
   notifiche vecchie e le nuove sembrano di due programmi diversi.

   Sulle altre piattaforme non fa niente e non da' fastidio. */
const ID_APP = "it.mepinformatica.alia";
app.setAppUserModelId(ID_APP);

const CARTELLA_DATI = process.env.ALIA_DATA ?? app.getPath("userData");
/* Sempre, non solo quando si sposta: Electron la creerebbe da se', ma solo
   quando e' pronto — e il log ci scrive dentro prima. */
mkdirSync(CARTELLA_DATI, { recursive: true });
if (process.env.ALIA_DATA) app.setPath("userData", CARTELLA_DATI);

/* ── Una sola Alia per volta ────────────────────────────────────────────────

   Electron tiene un lucchetto **per cartella dati**: il primo processo lo
   prende, chi arriva dopo si sente rispondere `false` e se ne va. Va chiesto
   qui e non in `whenReady`, cioe' prima che qualcuno apra il database: due
   processi sullo stesso file SQLite non sono una finestra in piu', sono due
   scrittori sugli stessi dati.

   Il secondo lancio non e' un errore: e' qualcuno che vuole Alia davanti. Il
   processo nuovo esce e il vecchio si fa vedere — che e' quello che l'utente
   stava chiedendo premendo l'icona una seconda volta. Senza questo, chiudere
   la finestra nell'icona e ripremere il collegamento apriva una seconda Alia
   invisibile alla prima, con la sua tray e i suoi promemoria: le sveglie
   suonavano due volte e la scorciatoia globale, che la puo' avere un processo
   solo, restava a quello che era arrivato prima.

   Il lucchetto sta nella cartella dati, quindi due installazioni diverse
   (globale e sotto nvm) si riconoscono: e' il database che devono spartirsi,
   non la cartella del programma. Con `ALIA_DATA` puntato altrove sono invece
   due Alie legittime, e nessuna disturba l'altra. */
const istanzaUnica = app.requestSingleInstanceLock();
if (!istanzaUnica) {
  /* Si esce subito e in silenzio. Nessun log: il file e' dell'altra istanza, e
     un avviso per un gesto che ha fatto la cosa giusta sarebbe rumore. */
  app.quit();
} else {
  app.on("second-instance", () => mostraFinestra());
}

/* Nota sulle scrollbar in overlay (`--enable-features=OverlayScrollbar`): le fa
   galleggiare sopra il contenuto invece di occupare spazio nel layout. Senza,
   la scrollbar verticale della colonna Inbox si prende 10px di larghezza, che
   stringono le card e le spostano appena la lista supera l'altezza della
   colonna — e siccome il tema le disegna trasparenti fino all'hover (vedi
   theme.css) quei 10px sembrano vuoto inspiegabile. Misurato: con l'overlay lo
   spazio rubato passa da 10px a 0.

   Il flag NON funziona da qui: provati sia `appendSwitch("enable-features",
   ...)` sia `appendArgument`, in entrambi i casi la misura resta 10px, mentre
   passato all'avvio del processo funziona. Sta quindi negli argomenti di lancio
   (`bin/alia.js` e gli script npm), non in questo file. */

/* Il log sta con i dati, **non nella cartella dell'app**.

   Stava in `electron/debug.log`, cioe' dentro il programma installato — che su
   un'installazione globale vuol dire dentro `node_modules`. Tre cose sbagliate
   insieme: si scrive in una cartella che dovrebbe essere di sola lettura, il
   file sparisce al primo aggiornamento (proprio quando serve per capire cosa si
   e' rotto), e dove l'utente non e' amministratore la scrittura fallisce e
   basta — in silenzio, perche' il log non puo' certo farlo sapere.

   Un tetto alla dimensione, perche' un log che cresce per sempre e' un modo
   lento di riempire un disco: oltre il mezzo mega si riparte da capo. Gli
   ultimi avvenimenti sono gli unici che servono a capire un guasto appena
   successo. */
const DEBUG_LOG_PATH = join(CARTELLA_DATI, "debug.log");
const LOG_MASSIMO = 512 * 1024;

function debugLog(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(" ")}\n`;
  try {
    if (statSync(DEBUG_LOG_PATH, { throwIfNoEntry: false })?.size > LOG_MASSIMO) {
      writeFileSync(DEBUG_LOG_PATH, "--- log ripartito da capo ---\n");
    }
    appendFileSync(DEBUG_LOG_PATH, line);
  } catch {
    // ignore logging failures
  }
}

let core;
let confluenza = null;

/* L'unico messaggio che viaggia da main al renderer invece che al contrario.

   Tutto il resto è `invoke`: il renderer chiede, il main risponde. Lo scarico
   dalla confluenza rovescia il verso — le origini arrivano mentre nessuno le
   stava chiedendo, a ogni giro del client — e senza questo avviso resterebbero
   nel database fino al successivo giro di `carica()`, cioè fino alla prossima
   mutazione. Che per un'inbox significa: non compaiono mai finché non tocchi
   qualcosa. */
function avvisaFinestre() {
  for (const finestra of BrowserWindow.getAllWindows()) {
    finestra.webContents.send("alia:origini");
  }
}

function registerCoreHandlers() {
  for (const operation of ALIA_OPERATIONS) {
    ipcMain.handle(`alia:${operation}`, async (_event, ...args) => {
      try {
        return await core[operation](...args);
      } catch (err) {
        debugLog(`IPC ERROR [${operation}]:`, err.message, err.stack ?? "");
        throw err;
      }
    });
  }
}

/* Le rotte della confluenza non passano da `ALIA_OPERATIONS`: non sono
   operazioni del core, sono comandi dati a un servizio esterno. Tenerle
   separate evita di far credere al renderer che scaricare le origini sia una
   scrittura sul database come le altre — puo' fallire per ragioni che il core
   non conosce (rete, token, servizio spento), e infatti restituisce un esito
   invece di lanciare. */
const OPERAZIONI_CONFLUENZA = ["leggiConfig", "scriviConfig", "elenco", "accetta", "rifiuta", "provaCollegamento", "stato"];

function registraHandlerConfluenza() {
  for (const operazione of OPERAZIONI_CONFLUENZA) {
    ipcMain.handle(`confluenza:${operazione}`, async (_event, ...args) => {
      try {
        return await confluenza[operazione](...args);
      } catch (err) {
        debugLog(`IPC ERROR [confluenza:${operazione}]:`, err.message, err.stack ?? "");
        throw err;
      }
    });
  }
}

/* La scorciatoia globale di cattura — **configurabile** (11/09/2026).

   Questa e' solo quella di fabbrica: la vera vive in `t_setting`
   (`scorciatoie.cattura`) e si cambia dalle Impostazioni.

   `CommandOrControl+Alt+K` e non qualcosa di piu' corto perche' una scorciatoia
   globale la sente **tutto il sistema**, e ruba il tasto a qualunque programma
   sia in primo piano: due modificatori sono la cortesia minima verso gli altri
   programmi. La K e' la stessa del composer dentro l'app (Ctrl+Maiusc+K), cosi'
   e' una cosa sola da ricordare.

   Se un altro programma se l'e' gia' presa, `register` risponde `false`. Prima
   finiva solo nel log; adesso lo stato e' una domanda che le Impostazioni
   possono fare (`scorciatoie:stato`), e chi ne sceglie una occupata lo scopre
   mentre la sceglie invece che il giorno in cui gli serve. */
const SCORCIATOIA_PREDEFINITA = "CommandOrControl+Alt+K";

let scorciatoiaCattura = SCORCIATOIA_PREDEFINITA;
let scorciatoiaAttiva = false;

/* Registra, e dice se ce l'ha fatta. Toglie sempre la precedente: `register`
   sulla stessa combinazione due volte non fallisce, ma lascerebbe in piedi
   quella vecchia quando si cambia. */
function registraScorciatoia(combinazione) {
  globalShortcut.unregisterAll();
  scorciatoiaAttiva = false;
  if (!combinazione) return false;
  try {
    scorciatoiaAttiva = globalShortcut.register(combinazione, () => cattura?.mostra());
  } catch (err) {
    /* Una combinazione malformata lancia invece di rispondere `false`: per chi
       chiama sono la stessa cosa — non e' registrata. */
    debugLog("scorciatoia: combinazione rifiutata:", combinazione, err.message);
    scorciatoiaAttiva = false;
  }
  if (scorciatoiaAttiva) scorciatoiaCattura = combinazione;
  return scorciatoiaAttiva;
}

let finestraPrincipale = null;
let tray = null;
let promemoria = null;
let cattura = null;
/* `true` solo quando si sta uscendo davvero (dal menu dell'icona): serve a
   distinguere "chiudi la finestra" da "chiudi Alia", che da quando c'e'
   l'icona vicino all'orologio sono due cose diverse. */
let inUscita = false;

/* ── Cosa fa la X ───────────────────────────────────────────────────────────

   Era murato: la X nasconde, si esce dal menu dell'icona. Buono per chi vuole
   le sveglie sempre accese, sbagliato per chi chiude un programma e si aspetta
   che sia chiuso — e scoprire un processo ancora vivo nel Gestore attivita'
   dopo aver premuto la X e' il genere di sorpresa che fa perdere fiducia.
   Adesso si sceglie in Impostazioni -> Generale, e il ripiego resta quello di
   prima perche' e' l'unico che non fa mancare una sveglia a chi non ha scelto
   niente.

   **Si legge al momento della chiusura, non all'avvio.** La preferenza vive in
   `t_setting`, la scrive il renderer, e qui il core e' sincrono: una lettura
   costa niente e vale sempre quella di adesso. Tenerne una copia in una
   variabile vorrebbe dire un messaggio IPC in piu' da mandare a ogni cambio, e
   un modo in piu' di restare indietro. */
const CHIUSURA_PREDEFINITA = "riduci";

function chiusuraRiduce() {
  try {
    return core?.getSetting("generale.chiusura", CHIUSURA_PREDEFINITA) !== "esci";
  } catch (err) {
    /* Database non ancora aperto o gia' chiuso: vale il ripiego. Non e' il
       momento di decidere niente di diverso da quello che Alia farebbe
       comunque. */
    debugLog("chiusura: preferenza illeggibile:", err.message);
    return true;
  }
}

function mostraFinestra() {
  if (!finestraPrincipale || finestraPrincipale.isDestroyed()) {
    createWindow();
    return;
  }
  if (finestraPrincipale.isMinimized()) finestraPrincipale.restore();
  finestraPrincipale.show();
  finestraPrincipale.focus();
}

/* Cliccando una notifica si va **su quella task**: la finestra torna davanti e
   il renderer riceve l'id. Se la finestra non c'e' piu' (chiusa nell'icona), si
   ricrea e il messaggio parte a caricamento finito — altrimenti si parlerebbe a
   una pagina che non e' ancora nata. */
function apriTask(idTask) {
  mostraFinestra();
  const manda = () => finestraPrincipale?.webContents.send("alia:apri-task", idTask);
  if (finestraPrincipale?.webContents.isLoading()) {
    finestraPrincipale.webContents.once("did-finish-load", manda);
  } else {
    manda();
  }
}

function creaTray() {
  if (tray) return;
  try {
    tray = new Tray(join(__dirname, "..", "build", "icon.ico"));
    tray.setToolTip("Alia");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Apri Alia", click: mostraFinestra },
        {
          label: `Nuova task  (${scorciatoiaCattura.replace("CommandOrControl", "Ctrl")})`,
          click: () => cattura?.mostra(),
        },
        { type: "separator" },
        {
          label: "Esci",
          click: () => {
            inUscita = true;
            app.quit();
          },
        },
      ]),
    );
    /* Il clic singolo apre: e' quello che fa ogni icona vicino all'orologio, e
       il menu resta sul destro. */
    tray.on("click", mostraFinestra);
  } catch (err) {
    /* Senza icona si resta senza icona, non senza applicazione. Ma allora
       chiudere la finestra deve tornare a chiudere l'app, se no Alia
       resterebbe viva e irraggiungibile — un processo fantasma. */
    debugLog("tray: creazione fallita:", err.message);
    tray = null;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#17191a",
    autoHideMenuBar: true,
    /* La barra del titolo sparisce, **i suoi bottoni no** (11/09/2026).

       `hidden` toglie la striscia di Windows e lascia la finestra cominciare a
       zero: la prima riga della schermata — "Inbox", la campanella,
       l'ingranaggio — diventa la barra, e si guadagnano i 31px che prima erano
       una cornice vuota sopra di lei.

       `titleBarOverlay` e' la ragione per cui non si e' scelto `frame: false`:
       riduci, ingrandisci e chiudi restano **quelli di sistema**, disegnati
       sopra la nostra striscia. Con loro restano gli Snap Layouts che compaiono
       passandoci sopra, il doppio clic che massimizza e il menu con Alt+Spazio
       — comportamenti che un utente Windows si aspetta senza pensarci e che
       rifatti a mano sarebbero, nel migliore dei casi, quasi uguali.

       I due colori sono i token del tema (`--color-bg` e `--color-content`)
       scritti a mano: qui non c'e' CSS, e questo e' l'unico posto in cui un
       valore del tema va ricopiato. Se cambiano la' vanno cambiati anche qui —
       non c'e' modo di dedurli, e un fondo che non combacia si vede come una
       striscia piu' chiara in cima alla finestra.

       Su macOS `titleBarOverlay` viene ignorato e `hidden` mette i tre pallini
       in alto a sinistra, sopra il contenuto: lo spazio glielo lascia il
       renderer (vedi lib/barraTitolo.js). */
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0a0a0a",
      symbolColor: "#e5e5e5",
      height: 40,
    },
    icon: join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on("console-message", (event) => {
    debugLog(`[renderer]`, event.message, `(${event.sourceId}:${event.lineNumber})`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    debugLog("[renderer] gone:", JSON.stringify(details));
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    debugLog("[renderer] did-fail-load:", String(errorCode), errorDescription, validatedURL);
  });

  finestraPrincipale = window;

  /* **Chiudere la finestra non chiude Alia**, se e' cosi' che si e' scelto
     (vedi `chiusuraRiduce`): le sveglie devono poter suonare a finestra
     chiusa, e la scorciatoia di cattura rispondere sempre. La X nasconde; si
     esce dal menu dell'icona vicino all'orologio.

     Chi ha scelto "esci" esce **da qui**, con un `app.quit()` esplicito, e non
     lasciando che la finestra si chiuda aspettando `window-all-closed`: quello
     scatta quando non c'e' piu' **nessuna** finestra, e la finestrella di
     cattura, una volta nata, resta viva nascosta per tutta la sessione (vedi
     cattura.js — e' nascosta, non chiusa, perche' ricrearla a ogni scorciatoia
     costerebbe mezzo secondo di finestra bianca). Chi avesse premuto la
     scorciatoia anche una sola volta si troverebbe la X che chiude la finestra
     e Alia che resta su, cioe' esattamente quello che ha chiesto di non fare.

     Senza icona (creazione fallita) la X chiude davvero comunque, qualunque sia
     la preferenza: un programma vivo senza nessun modo di raggiungerlo e'
     peggio di un programma chiuso. */
  window.on("close", (e) => {
    if (inUscita || !tray) return;
    if (chiusuraRiduce()) {
      e.preventDefault();
      window.hide();
      return;
    }
    /* La finestra si chiude e si porta dietro tutto il resto. `inUscita` prima
       di `quit` perche' `quit` richiude questa stessa finestra: senza, si
       rientrerebbe qui a rileggere una preferenza gia' decisa. */
    inUscita = true;
    debugLog("chiusura: la X chiude Alia (generale.chiusura = esci)");
    app.quit();
  });
  window.on("closed", () => {
    if (finestraPrincipale === window) finestraPrincipale = null;
  });

  debugLog("createWindow called, DEV_SERVER_URL =", DEV_SERVER_URL ?? "(none)");

  if (DEV_SERVER_URL) {
    window.webContents.session.clearCache().then(() => window.loadURL(DEV_SERVER_URL));
  } else {
    window.loadFile(join(__dirname, "..", "renderer", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  /* La seconda istanza ha gia' chiamato `app.quit()` la' sopra e non deve
     arrivare qui: se il `ready` la precede, apre il database dell'altra. Una
     riga di guardia, perche' il prezzo di sbagliarsi si paga sui dati. */
  if (!istanzaUnica) return;
  debugLog("app ready, dati in", CARTELLA_DATI);
  core = createAliaCore({
    databasePath: join(CARTELLA_DATI, "scheduler.sqlite"),
  });

  registerCoreHandlers();
  createWindow();

  /* La confluenza non blocca l'apertura della finestra: se non e' configurata o
     non risponde, Alia si apre lo stesso e la colonna delle origini resta
     quella di prima. E' una cosa in piu', non un pezzo dell'app. */
  try {
    confluenza = creaConfluenzaAlia({
      core,
      cartella: CARTELLA_DATI,
      log: debugLog,
      avvisaFinestre,
    });
    registraHandlerConfluenza();
  } catch (err) {
    debugLog("confluenza: avvio fallito:", err.message, err.stack ?? "");
  }

  creaTray();

  cattura = creaCattura({
    preload: join(__dirname, "preload.cjs"),
    devServerUrl: DEV_SERVER_URL,
    indiceDist: join(__dirname, "..", "renderer", "dist", "cattura.html"),
    log: debugLog,
  });

  /* La cattura chiude la sua finestrella e avvisa quella grande: una task
     appena scritta deve comparire senza che nessuno ricarichi niente. */
  ipcMain.handle("cattura:fatto", (_event, { creata = false } = {}) => {
    cattura?.nascondi();
    if (creata) finestraPrincipale?.webContents.send("alia:ricarica");
    return true;
  });

  /* La prova delle notifiche, dalle Impostazioni. Un'operazione sola e non un
     elenco: non e' il core, e' un bottone. */
  ipcMain.handle("notifiche:prova", async () => {
    const esito = (await promemoria?.prova()) ?? { esito: "non-pronte" };
    debugLog("notifiche: prova ->", JSON.stringify(esito));
    return esito;
  });

  /* La scorciatoia salvata, o quella di fabbrica. Se quella salvata e' occupata
     **non si ripiega** su un'altra: si resta senza, e le Impostazioni lo
     dicono. Cambiare sotto il naso la combinazione che qualcuno ha scelto
     sarebbe peggio che non averla. */
  /* `core` qui e' **il core vero**, non il ponte: le sue chiamate sono
     sincrone. Nel renderer sembrano asincrone perche' attraversano l'IPC, ed e'
     l'inganno in cui sono cascato — un `.then` su un valore che non e' una
     promessa non fallisce dove lo scrivi, fa saltare tutto quello che viene
     dopo (qui: la registrazione degli handler, che infatti non rispondevano). */
  try {
    const salvata = core.getSetting("scorciatoie.cattura", SCORCIATOIA_PREDEFINITA);
    scorciatoiaCattura =
      typeof salvata === "string" && salvata ? salvata : SCORCIATOIA_PREDEFINITA;
    const ok = registraScorciatoia(scorciatoiaCattura);
    debugLog(
      ok
        ? `scorciatoia ${scorciatoiaCattura} registrata`
        : `scorciatoia ${scorciatoiaCattura} NON registrata: se l'e' presa un altro programma`,
    );
    /* Il menu dell'icona porta scritta la combinazione: se e' cambiata, va
       ricostruito. */
    if (tray) {
      tray.destroy();
      tray = null;
      creaTray();
    }
  } catch (err) {
    debugLog("scorciatoia: avvio fallito:", err.message);
  }

  ipcMain.handle("scorciatoie:stato", () => ({
    combinazione: scorciatoiaCattura,
    attiva: scorciatoiaAttiva,
    predefinita: SCORCIATOIA_PREDEFINITA,
  }));

  /* Cambiare la scorciatoia e' una prova, non una dichiarazione: si tenta, e
     se il sistema la rifiuta si rimette quella di prima e si risponde cosa e'
     successo. Si salva **solo** quella che ha funzionato davvero — una
     preferenza che contiene una combinazione occupata sarebbe una promessa che
     non si puo' mantenere a ogni avvio. */
  ipcMain.handle("scorciatoie:imposta", (_event, combinazione) => {
    const precedente = scorciatoiaCattura;
    const eraAttiva = scorciatoiaAttiva;
    if (registraScorciatoia(combinazione)) {
      core.setSetting("scorciatoie.cattura", combinazione);
      if (tray) {
        tray.destroy();
        tray = null;
        creaTray();
      }
      debugLog("scorciatoia: adesso e'", combinazione);
      return { esito: "registrata", combinazione };
    }
    /* Fallita: si torna com'era, se era qualcosa. */
    if (eraAttiva) registraScorciatoia(precedente);
    else scorciatoiaCattura = precedente;
    debugLog("scorciatoia: rifiutata", combinazione);
    return { esito: "occupata", combinazione: precedente };
  });

  promemoria = creaPromemoria({ core, log: debugLog, onApriTask: apriTask });
  promemoria.avvia();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mostraFinestra();
  });
});

/* Nessuna finestra aperta puo' voler dire due cose diverse, e adesso lo decide
   chi usa Alia (Impostazioni -> Generale): con la chiusura che riduce vuol dire
   "sto lavorando ad altro" — si resta vivi nell'icona, le sveglie continuano,
   la scorciatoia risponde.

   Chi ha scelto "esci" non passa piu' di qui: l'uscita la decide la X (vedi
   `close` in `createWindow`), e a questo punto `inUscita` e' gia' vero. Qui
   restano i due casi che la preferenza non copre — nessuna icona, e macOS. */
app.on("window-all-closed", () => {
  /* L'uscita e' gia' in corso: non c'e' niente da decidere e la preferenza non
     va nemmeno riletta, perche' `before-quit` ha gia' chiuso il database. */
  if (inUscita) return;
  /* Senza icona si esce, se no resterebbe un processo vivo e irraggiungibile.
     Su macOS, dove un'applicazione senza finestre resta nel Dock, si resta —
     ma solo se la X deve ridurre: la scelta esplicita di uscire vale su tutte
     le piattaforme, se no sarebbe una preferenza che non si puo' spiegare. */
  const riduce = chiusuraRiduce();
  if (tray && riduce) return;
  if (process.platform === "darwin" && riduce) return;
  app.quit();
});

/* Lo smontaggio sta qui e non piu' in `window-all-closed`: quello adesso puo'
   scattare mentre l'applicazione e' ancora viva, e fermare il database perche'
   qualcuno ha chiuso una finestra sarebbe il modo piu' rapido di rompere tutto
   quello che viene dopo.

   Prima lo scarico, poi il database: fermarlo dopo vorrebbe dire lasciargli la
   possibilità di scrivere su un core appena chiuso. */
app.on("before-quit", () => {
  inUscita = true;
  /* L'icona va via per prima, ed e' l'unica cosa che si vede di tutto questo
     smontaggio: su Windows un'icona non distrutta resta disegnata accanto
     all'orologio finche' non ci passi sopra col mouse — un fantasma che invita
     a cliccare un programma che non c'e' piu'. */
  if (tray) {
    tray.destroy();
    tray = null;
  }
  globalShortcut.unregisterAll();
  if (promemoria) promemoria.ferma();
  if (cattura) cattura.chiudi();
  if (confluenza) confluenza.stop();
  if (core) core.close();
});
