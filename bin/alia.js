#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = join(__dirname, "..");

const child = spawn(electronPath, [appPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: false,
});

child.on("close", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("Impossibile avviare Alia:", err.message);
  process.exit(1);
});
