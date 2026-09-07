import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appendFileSync } from "node:fs";
import { createItemCore } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

const DEBUG_LOG_PATH = join(__dirname, "debug.log");

function debugLog(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(" ")}\n`;
  try {
    appendFileSync(DEBUG_LOG_PATH, line);
  } catch {
    // ignore logging failures
  }
}

const CORE_OPERATIONS = [
  "createItem",
  "getItem",
  "listItems",
  "updateItem",
  "completeItem",
  "activateItem",
  "moveToInbox",
  "archiveItem",
  "deleteItem",
  "restoreItem",
  "getItemHistory",
];

let core;

function registerCoreHandlers() {
  for (const operation of CORE_OPERATIONS) {
    ipcMain.handle(`scheduler:${operation}`, async (_event, ...args) => {
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
  core = createItemCore({
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
