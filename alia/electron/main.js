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

/* La scorciatoia globale di cattura.

   `CommandOrControl+Alt+K` e non qualcosa di piu' corto: una scorciatoia
   globale la sente **tutto il sistema**, quindi ruba il tasto a qualunque
   programma sia in primo piano. Tre modificatori sono la cortesia minima verso
   gli altri programmi, e la K e' la stessa del composer dentro l'app
   (Ctrl+Maiusc+K), cosi' e' una cosa sola da ricordare.

   Se un altro programma se l'e' gia' presa, `register` risponde `false` e non
   succede niente: si scrive nel log invece di lasciar credere che funzioni. Il
   giorno in cui sara' configurabile, questa costante diventera' una
   preferenza. */
const SCORCIATOIA_CATTURA = "CommandOrControl+Alt+K";

let finestraPrincipale = null;
let tray = null;
let promemoria = null;
let cattura = null;
/* `true` solo quando si sta uscendo davvero (dal menu dell'icona): serve a
   distinguere "chiudi la finestra" da "chiudi Alia", che da quando c'e'
   l'icona vicino all'orologio sono due cose diverse. */
let inUscita = false;

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
        { label: `Nuova task  (${SCORCIATOIA_CATTURA.replace("CommandOrControl", "Ctrl")})`, click: () => cattura?.mostra() },
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

  /* **Chiudere la finestra non chiude Alia** (11/09/2026): le sveglie devono
     suonare anche a finestra chiusa, e la scorciatoia di cattura deve
     rispondere sempre. La X nasconde; si esce dal menu dell'icona vicino
     all'orologio.

     Senza icona (creazione fallita) si torna al comportamento di prima e la X
     chiude davvero: un programma vivo senza nessun modo di raggiungerlo e'
     peggio di un programma chiuso. */
  window.on("close", (e) => {
    if (inUscita || !tray) return;
    e.preventDefault();
    window.hide();
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

  const registrata = globalShortcut.register(SCORCIATOIA_CATTURA, () => cattura?.mostra());
  debugLog(
    registrata
      ? `scorciatoia ${SCORCIATOIA_CATTURA} registrata`
      : `scorciatoia ${SCORCIATOIA_CATTURA} NON registrata: se l'e' presa un altro programma`,
  );

  promemoria = creaPromemoria({ core, log: debugLog, onApriTask: apriTask });
  promemoria.avvia();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mostraFinestra();
  });
});

/* **Non si esce piu' quando si chiude l'ultima finestra.** Da quando c'e'
   l'icona vicino all'orologio, nessuna finestra aperta vuol dire "sto lavorando
   ad altro", non "ho finito": le sveglie continuano e la scorciatoia risponde.

   Senza icona (creazione fallita) vale la regola di prima, se no resterebbe un
   processo vivo e irraggiungibile. */
app.on("window-all-closed", () => {
  if (tray && !inUscita) return;
  if (process.platform !== "darwin") app.quit();
});

/* Lo smontaggio sta qui e non piu' in `window-all-closed`: quello adesso puo'
   scattare mentre l'applicazione e' ancora viva, e fermare il database perche'
   qualcuno ha chiuso una finestra sarebbe il modo piu' rapido di rompere tutto
   quello che viene dopo.

   Prima lo scarico, poi il database: fermarlo dopo vorrebbe dire lasciargli la
   possibilità di scrivere su un core appena chiuso. */
app.on("before-quit", () => {
  inUscita = true;
  globalShortcut.unregisterAll();
  if (promemoria) promemoria.ferma();
  if (cattura) cattura.chiudi();
  if (confluenza) confluenza.stop();
  if (core) core.close();
});
