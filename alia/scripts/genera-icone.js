/* Genera le immagini dell'icona da `build/icon.svg`.
 *
 *     npm run icone
 *
 *   · build/Alia.icon/Assets/glifo.png  1024²  — il disegno dentro il documento
 *                                di Icon Composer, da cui viene l'icona macOS;
 *   · build/icon.png    1024²  — la sorgente da cui electron-builder ricava il
 *                                `.ico` di Windows;
 *   · assets/icon.png     256²  — l'icona della finestra, che serve solo in
 *                                sviluppo: nel pacchetto la mette il bundle;
 *   · assets/tray.png      32²  — l'icona nella barra di Windows, a runtime;
 *   · assets/tray@2x.png   64²  — la stessa a densità doppia, che Electron
 *                                sceglie da sé sugli schermi che la meritano;
 *   · assets/trayTemplate.png    16²  — la barra dei menu di macOS, che vuole
 *   · assets/trayTemplate@2x.png 32²    un'immagine monocroma: sorgente sua,
 *                                       `build/tray-template.svg`.
 *
 * ── Perché passa da Electron ────────────────────────────────────────────────
 *
 * Perché la sorgente resti **una sola**. La strada facile — ridisegnare le
 * stesse forme con una libreria di grafica — mette gli stessi numeri in due
 * posti, e due posti prima o poi divergono: si ritocca l'SVG, l'icona resta
 * quella di prima, e non se ne accorge nessuno finché non si guardano vicine.
 * Electron c'è già, e dentro ha un motore che l'SVG lo sa disegnare davvero.
 *
 * ── Un canvas, e non più una cattura di schermo ─────────────────────────────
 *
 * Prima si rendeva l'SVG in una pagina e si **fotografava** la finestra con
 * `capturePage`. Funzionava, ma solo su Windows e per caso: `capturePage`
 * restituisce l'immagine alla densità del monitor, non a quella chiesta.
 * Su un Mac Retina la resa a 16px usciva 32x32 e lo script si fermava — difetto
 * che non si era mai visto perché l'icona si era sempre generata su Windows, a
 * densità singola.
 *
 * Il canvas non ha quel problema e nemmeno gli altri che la cattura si portava
 * dietro: niente misura minima della finestra su Windows, niente ritaglio
 * dell'angolo, niente attesa a tempo perché il disegno sia stato dipinto.
 * `drawImage` rasterizza il vettore **alla misura chiesta**, che è la cosa che
 * si voleva fin dall'inizio: a 32px un tratto disegnato a quella misura resta
 * un tratto, mentre lo stesso tratto rimpicciolito da 1024 diventa una scia.
 */

import { app, BrowserWindow } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RADICE = join(__dirname, "..");

const DA_FARE = [
  ["icon.svg", "build", "icon.png", 1024], // sorgente di .icns e .ico, per il pacchetto
  ["icon.svg", "assets", "icon.png", 256], // la finestra in sviluppo
  ["icon.svg", "assets", "tray.png", 32], // l'icona nella barra di Windows
  ["icon.svg", "assets", "tray@2x.png", 64], // la stessa a densita' doppia
  /* La barra dei menu di macOS vuole tutt'altro: nero su trasparente, che il
     sistema ricolora da se'. Sorgente sua, e il suffisso `Template` nel nome
     non e' decorativo — e' da quello che AppKit capisce di doverla trattare
     cosi'. Perche' non basti ridurre l'icona a colori sta in tray-template.svg. */
  ["tray-template.svg", "assets", "trayTemplate.png", 16],
  ["tray-template.svg", "assets", "trayTemplate@2x.png", 32],
  /* Il livello del disegno dentro `Alia.icon`, il documento di Icon Composer da
     cui macOS ricava l'icona dell'app. Si scrive **direttamente li' dentro** e
     non in una copia accanto: il .icon e' un pacchetto che si porta dietro i
     suoi asset, e tenerne due copie vuol dire che prima o poi si ritocca quella
     sbagliata. Il fondo azzurro non e' qui — lo dichiara `icon.json`, ed e'
     proprio quella separazione che permette a macOS di scurirlo in tema scuro
     senza toccare la freccia. */
  ["icon-glifo.svg", "build/Alia.icon/Assets", "glifo.png", 1024],
];

/* L'SVG viaggia come data URL in base64 e non come testo interpolato: dentro
   c'è un commento lungo, con apici e accenti, e infilarlo in una stringa di
   JavaScript da mandare all'altro capo sarebbe un problema di virgolette che
   si ripresenta al primo ritocco del commento. */
async function rendi(finestra, svgBase64, misura) {
  const dataUrl = await finestra.webContents.executeJavaScript(`
    (async () => {
      const img = new Image();
      img.src = "data:image/svg+xml;base64,${svgBase64}";
      await img.decode();
      const c = document.createElement("canvas");
      c.width = ${misura};
      c.height = ${misura};
      /* Nessun fondo: l'icona è trasparente, e un rettangolo bianco dietro si
         vedrebbe solo sul tema scuro — cioè dopo, e da qualcun altro. */
      c.getContext("2d").drawImage(img, 0, 0, ${misura}, ${misura});
      return c.toDataURL("image/png");
    })()
  `);

  const png = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");

  /* Si controlla che sia davvero quadrata e della misura giusta, e si spacca se
     non lo è. È il controllo che ha scoperto il difetto della cattura, e resta:
     un'immagine sbagliata scritta senza protestare si nota giorni dopo,
     guardando la barra delle applicazioni. Le dimensioni vere stanno
     nell'header IHDR del PNG, dal byte 16. */
  const largo = png.readUInt32BE(16);
  const alto = png.readUInt32BE(20);
  if (largo !== misura || alto !== misura) {
    throw new Error(`la resa a ${misura}px e' uscita ${largo}x${alto}`);
  }
  return png;
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    /* Le sorgenti si leggono una volta sola anche se servono a piu' immagini:
       `icon.svg` ne fa quattro. */
    const sorgenti = new Map();
    const base64Di = (nome) => {
      if (!sorgenti.has(nome)) {
        /* **I commenti si tolgono prima di spedirlo.** L'SVG viaggia dentro una
           stringa di JavaScript che finisce in `executeJavaScript`, e in questi
           file i commenti sono lunghi — spiegano da dove viene la geometria e
           quali colori vanno tenuti allineati altrove. Superata una certa
           misura il giro si inceppa, e l'errore che torna non dice niente
           ("generazione fallita: undefined"): e' successo aggiungendo quindici
           righe di nota a `icon.svg`.
           Al motore non servono, e toglierli qui — invece di tenerli corti la' —
           vuol dire che la prosa nei file sorgente puo' crescere quanto serve. */
        const svg = readFileSync(join(RADICE, "build", nome), "utf8").replace(/<!--[\s\S]*?-->/g, "");
        sorgenti.set(nome, Buffer.from(svg, "utf8").toString("base64"));
      }
      return sorgenti.get(nome);
    };

    /* Una finestra sola, mai mostrata, e la misura non conta: qui dentro non si
       disegna niente a schermo, si esegue del JavaScript che ha un DOM sotto.
       (Una lezione che resta dal giro precedente: distrutta una finestra, la
       successiva non carica più — `ERR_FAILED`, senza spiegazione. Quindi una.) */
    const finestra = new BrowserWindow({ show: false, width: 100, height: 100 });
    await finestra.loadURL("data:text/html,<!doctype html><meta charset=utf-8>");

    /* Ogni misura si rende **una volta**: le liste si sovrappongono — 256 e 32
       servono a piu' di un file — e rendere due volte la stessa cosa costa e
       basta. */
    const reso = new Map();
    const resa = async (sorgente, misura) => {
      const chiave = `${sorgente}@${misura}`;
      if (!reso.has(chiave)) reso.set(chiave, await rendi(finestra, base64Di(sorgente), misura));
      return reso.get(chiave);
    };

    for (const [sorgente, cartella, nome, misura] of DA_FARE) {
      const png = await resa(sorgente, misura);
      mkdirSync(join(RADICE, cartella), { recursive: true });
      const percorso = join(RADICE, cartella, nome);
      writeFileSync(percorso, png);
      console.log(`  ${cartella}/${nome}  ${misura}x${misura}  ${(png.length / 1024).toFixed(1)} KB`);
    }

    finestra.destroy();
    app.exit(0);
  } catch (err) {
    /* `err.message` da solo non basta: quello che arriva da
       `executeJavaScript` puo' non essere un Error, e allora si stampava
       "undefined" — un messaggio che non aiuta nessuno. */
    console.error("generazione fallita:", err?.stack ?? err?.message ?? JSON.stringify(err) ?? err);
    app.exit(1);
  }
});
