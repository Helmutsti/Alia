#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = join(__dirname, "..");

/* Scrollbar in overlay: vedi la nota in electron/main.js. Va passato qui,
   all'avvio del processo, perche da dentro il main non ha effetto. Prima degli
   argomenti dell'utente, cosi resta sovrascrivibile da riga di comando. */
const ARGOMENTI_CHROMIUM = ["--enable-features=OverlayScrollbar"];

const child = spawn(electronPath, [appPath, ...ARGOMENTI_CHROMIUM, ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: false,
});

child.on("close", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("Impossibile avviare Alia:", err.message);
  process.exit(1);
});
