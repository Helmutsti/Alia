// Crea un collegamento sul Desktop che avvia Alia come un'app Windows
// normale: nessun terminale (punta a un electron.exe rinominato e
// ribrandizzato, non a node), icona e nome processo propri invece di
// quelli generici di Electron. Fallisce in silenzio (solo un avviso)
// se qualcosa non va: non deve mai far fallire "npm install -g".
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");

async function main() {
  if (process.platform !== "win32") return;
  if (process.env.CI) return;

  let electronPath;
  try {
    electronPath = (await import("electron")).default;
  } catch {
    console.warn("Alia: electron non disponibile, salto la creazione del collegamento sul Desktop.");
    return;
  }
  if (!electronPath || !existsSync(electronPath)) {
    console.warn("Alia: binario di Electron non trovato, salto la creazione del collegamento sul Desktop.");
    return;
  }

  // electron.exe da solo non basta: gli servono accanto risorse/locali/
  // icudtl.dat ecc, quindi si copia l'intera cartella dist di Electron e
  // si rinomina solo l'eseguibile al suo interno.
  const electronDir = dirname(electronPath);
  const distDir = join(pkgRoot, "dist-app");
  const exePath = join(distDir, "Alia.exe");
  const iconPath = join(pkgRoot, "build", "icon.ico");

  try {
    if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
    cpSync(electronDir, distDir, { recursive: true });
    renameSync(join(distDir, "electron.exe"), exePath);
  } catch (err) {
    console.warn("Alia: impossibile preparare Alia.exe:", err.message);
    return;
  }

  if (existsSync(iconPath)) {
    try {
      const { rcedit } = await import("rcedit");
      const version = (process.env.npm_package_version || "0.0.0").replace(/[^0-9.]/g, "") || "0.0.0";
      await rcedit(exePath, {
        icon: iconPath,
        "file-version": version,
        "product-version": version,
        "version-string": {
          ProductName: "Alia",
          FileDescription: "Alia - task manager",
          CompanyName: "Alia",
          OriginalFilename: "Alia.exe",
          InternalName: "Alia",
        },
      });
    } catch (err) {
      console.warn("Alia: impossibile personalizzare l'icona dell'eseguibile:", err.message);
    }
  }

  try {
    const desktop = join(process.env.USERPROFILE || "", "Desktop");
    if (!existsSync(desktop)) throw new Error(`cartella Desktop non trovata (${desktop})`);
    const shortcutPath = join(desktop, "Alia.lnk");
    const esc = (s) => s.replace(/'/g, "''");
    const psScript = [
      "$WshShell = New-Object -ComObject WScript.Shell",
      `$Shortcut = $WshShell.CreateShortcut('${esc(shortcutPath)}')`,
      `$Shortcut.TargetPath = '${esc(exePath)}'`,
      `$Shortcut.Arguments = '"${esc(pkgRoot)}"'`,
      `$Shortcut.IconLocation = '${esc(iconPath)}'`,
      `$Shortcut.WorkingDirectory = '${esc(pkgRoot)}'`,
      "$Shortcut.Description = 'Alia'",
      "$Shortcut.Save()",
    ].join("; ");
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psScript], { stdio: "ignore" });
    console.log(`Alia: collegamento creato in ${shortcutPath}`);
  } catch (err) {
    console.warn("Alia: impossibile creare il collegamento sul Desktop:", err.message);
  }
}

main().catch((err) => {
  console.warn("Alia: postinstall non completato:", err.message);
});
