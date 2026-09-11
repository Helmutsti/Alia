/* Genera `build/icon.ico` da `build/icon.svg`.
 *
 *     npm run icona
 *
 * ── Perché passa da Electron ────────────────────────────────────────────────
 *
 * Serviva un modo di disegnare l'SVG senza riscriverne la geometria da qualche
 * altra parte. La strada facile — ridisegnare le stesse forme con una libreria
 * di grafica — mette gli stessi numeri in due posti, e due posti prima o poi
 * divergono: si ritocca l'SVG, l'icona resta quella di prima, e non se ne
 * accorge nessuno finché non si guardano vicine.
 *
 * Electron c'è già come dipendenza, e dentro ha un motore che l'SVG lo sa
 * disegnare davvero. Quindi la sorgente resta **una sola**: si cambia l'SVG e
 * l'icona lo segue.
 *
 * ── Le quattro misure si disegnano, non si rimpiccioliscono ─────────────────
 *
 * Ogni dimensione viene resa alla sua misura invece di ridurre la più grande.
 * A 16px la differenza si vede: un tratto di 21.7px ridotto di sedici volte
 * diventa una scia grigia, mentre disegnato a quella misura resta un tratto.
 */

import { app, BrowserWindow } from "electron";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RADICE = join(__dirname, "..");

/* Le misure che Windows usa davvero: 16 nella barra e negli elenchi, 32 sul
   Desktop a icone medie, 48 a icone grandi, 256 per le anteprime e il riquadro
   delle proprietà. */
const MISURE = [16, 32, 48, 256];

const CARTELLA_TEMP = mkdtempSync(join(tmpdir(), "alia-icona-"));

/* La pagina si scrive su un file invece di viaggiare in un `data:` URL.
   L'URL lo reggeva finche' l'SVG era piccolo; con il commento che spiega da
   dove viene la geometria supera il limite e il caricamento fallisce con un
   `ERR_FAILED` che non dice niente. Un file non ha lunghezza massima. */
function paginaPerMisura(svg, misura) {
  /* `image-rendering` non si tocca: l'antialiasing del motore è esattamente
     quello che serve ai bordi tondi. Il fondo resta trasparente, perché
     un'icona con un rettangolo bianco dietro si vede solo sul tema scuro —
     cioè dopo, e da qualcun altro. */
  const html = `<!doctype html><meta charset="utf-8">
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      svg { display: block; width: ${misura}px; height: ${misura}px; }
    </style>
    ${svg}`;
  const percorso = join(CARTELLA_TEMP, `icona-${misura}.html`);
  writeFileSync(percorso, html, "utf8");
  return percorso;
}

/* **Una finestra sola, ridimensionata.**
 *
 * Prima ne apriva e distruggeva una per misura, ed e' il motivo per cui la
 * prima immagine usciva e la seconda no: distrutta la finestra offscreen, la
 * successiva non carica piu' — `ERR_FAILED`, senza altra spiegazione. Riusarla
 * evita il problema e in piu' e' piu' svelta.
 */
function creaFinestra() {
  return new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: "#00000000",
    /* `deviceScaleFactor: 1` esplicito: su uno schermo a densità doppia la
       cattura verrebbe grande il doppio, e le misure non sarebbero più quelle
       chieste. */
    webPreferences: { offscreen: true, deviceScaleFactor: 1 },
  });
}

async function rendi(finestra, svg, misura) {
  finestra.setContentSize(misura, misura);
  await finestra.loadFile(paginaPerMisura(svg, misura));
  /* Un giro di disegno prima di catturare: `loadFile` torna quando il documento
     è pronto, non quando è stato dipinto. */
  await new Promise((r) => setTimeout(r, 150));

  const immagine = await finestra.webContents.capturePage();
  return immagine.toPNG();
}

/* Un `.ico` è una direttoria seguita dalle immagini. Dal Vista in poi le
   immagini possono essere PNG così come sono, il che evita di dover scrivere
   BMP con la maschera di trasparenza — formato che nel 2026 non merita il
   codice che costa. */
function costruisciIco(immagini) {
  const TESTA = 6;
  const VOCE = 16;
  const inizio = TESTA + VOCE * immagini.length;

  const testa = Buffer.alloc(TESTA);
  testa.writeUInt16LE(0, 0); // riservato
  testa.writeUInt16LE(1, 2); // 1 = icona
  testa.writeUInt16LE(immagini.length, 4);

  const voci = [];
  let scorrimento = inizio;
  for (const { misura, png } of immagini) {
    const v = Buffer.alloc(VOCE);
    /* 256 si scrive 0: il campo è di un byte solo, e questa è la convenzione
       del formato. */
    v.writeUInt8(misura === 256 ? 0 : misura, 0);
    v.writeUInt8(misura === 256 ? 0 : misura, 1);
    v.writeUInt8(0, 2); // colori nella tavolozza: nessuna
    v.writeUInt8(0, 3); // riservato
    v.writeUInt16LE(1, 4); // piani
    v.writeUInt16LE(32, 6); // bit per pixel
    v.writeUInt32LE(png.length, 8);
    v.writeUInt32LE(scorrimento, 12);
    voci.push(v);
    scorrimento += png.length;
  }

  return Buffer.concat([testa, ...voci, ...immagini.map((i) => i.png)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const svg = readFileSync(join(RADICE, "build", "icon.svg"), "utf8");
    const finestra = creaFinestra();
    const immagini = [];
    for (const misura of MISURE) {
      immagini.push({ misura, png: await rendi(finestra, svg, misura) });
      console.log(`  reso ${misura}x${misura}`);
    }
    finestra.destroy();

    const percorso = join(RADICE, "build", "icon.ico");
    const ico = costruisciIco(immagini);
    writeFileSync(percorso, ico);
    console.log(`icona scritta: ${percorso} (${(ico.length / 1024).toFixed(1)} KB)`);
    rmSync(CARTELLA_TEMP, { recursive: true, force: true });
    app.exit(0);
  } catch (err) {
    console.error("generazione fallita:", err.message);
    app.exit(1);
  }
});
