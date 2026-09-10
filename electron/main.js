import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appendFileSync } from "node:fs";
import { ALIA_OPERATIONS, createAliaCore } from "../src/core/alia-core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

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
  debugLog("app ready, userData =", app.getPath("userData"));
  core = createAliaCore({
    databasePath: join(app.getPath("userData"), "scheduler.sqlite"),
  });

  registerCoreHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (core) core.close();
  if (process.platform !== "darwin") app.quit();
});
