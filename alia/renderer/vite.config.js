import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* La versione del pacchetto, murata nel bundle al momento della compilazione.

   Il renderer non puo leggere `package.json` da se: gira nel browser, e in
   Electron gira pure in un contesto isolato. Le due strade erano questa e un
   `app.getVersion()` passato dal preload; vince questa perche funziona anche
   nella pagina di anteprima, che il preload non ce l'ha. In un'app Electron le
   due risposte coincidono comunque: il bundle e la app sono lo stesso
   artefatto, compilato nello stesso momento. */
const { version } = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf8"),
);

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  base: "./",
  define: { __ALIA_VERSION__: JSON.stringify(version) },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        /* index.html è l'app dentro Electron; preview.html è la pagina di
           anteprima delle schermate ricostruite dagli artboard, apribile nel
           browser perché non tocca il core (vedi src/preview.jsx). */
        main: resolve(__dirname, "index.html"),
        preview: resolve(__dirname, "preview.html"),
        /* cattura.html e' la finestrella della scorciatoia globale: una
           finestra sua, quindi una pagina sua. Non e' una schermata dell'app —
           e' un gesto che compare sopra qualunque programma e sparisce. */
        cattura: resolve(__dirname, "cattura.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
