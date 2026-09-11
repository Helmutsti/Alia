import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";
import { ALIA_OPERATIONS, createAliaCore } from "../src/core/alia-core.js";
import { creaConfluenzaAlia } from "./confluenza.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

/* ── Dove vivono i dati: accanto all'app, non in AppData ────────────────────

   Electron propone `app.getPath("userData")`, che su Windows è
   `%APPDATA%\alia` — un posto che funziona ma che non si trova. Alia tiene
   invece database, configurazione e profilo di Chromium in **`Alia-dati` sul
   Desktop**: dove li vedi, dove li copi, dove ci scrivi un token senza dover
   sapere cos'è `%APPDATA%`.

   `setPath` e non solo un percorso diverso per il database: spostare il solo
   `.sqlite` lascerebbe in AppData tutto il resto (cache di Chromium, Local
   Storage, preferenze della finestra). Cambiando `userData` alla radice, ci si
   sposta tutto insieme.

   **Va chiamata prima di `whenReady`**: dopo, Chromium ha già aperto il profilo
   nel posto vecchio e non lo sposta più. È il motivo per cui questa riga sta qui
   in alto e non dentro `app.whenReady()`.

   **Fuori dal repo, non dentro.** La cartella dei dati sta sul Desktop e non
   dentro quella dell'applicazione, che è un repository git: là dentro il
   database sarebbe un file non tracciato in mezzo a file tracciati — da
   ignorare a mano, e da perdere il giorno che il progetto si ricancella o si
   riclona. I dati sopravvivono al codice, quindi non stanno dentro al codice.

   `app.getPath("desktop")` e non un percorso scritto a mano: il Desktop può
   essere reindirizzato (OneDrive lo fa di suo), e l'unico che sa dov'è davvero
   è il sistema. `mkdirSync` prima di `setPath` perché Electron vuole una
   cartella che esista già.

   `ALIA_DATA` scavalca tutto, per chi vuole i dati altrove senza toccare il
   codice. */
const CARTELLA_DATI = process.env.ALIA_DATA ?? join(app.getPath("desktop"), "Alia-dati");
mkdirSync(CARTELLA_DATI, { recursive: true });
app.setPath("userData", CARTELLA_DATI);

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

const DEBUG_LOG_PATH = join(__dirname, "debug.log");

function debugLog(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(" ")}\n`;
  try {
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  /* Prima lo scarico, poi il database: fermarlo dopo vorrebbe dire lasciargli
     la possibilità di scrivere su un core appena chiuso. */
  if (confluenza) confluenza.stop();
  if (core) core.close();
  if (process.platform !== "darwin") app.quit();
});
