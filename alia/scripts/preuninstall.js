// Toglie dal Desktop il collegamento che `postinstall` ci aveva messo.
//
// Simmetrico all'installazione, e per la stessa ragione per cui quella esiste:
// un programma che si mette un'icona sul Desktop deve sapersela riprendere.
// Senza, disinstallando resta un collegamento che punta al vuoto — l'unica
// traccia visibile di un programma che non c'e' piu', ed e' pure quella che
// l'utente ritrova per prima.
//
// **Cosa NON tocca: i dati.** `%APPDATA%\alia` resta dov'e', con dentro il
// database. Nessun disinstallatore serio cancella i documenti di chi lo usa, e
// qui "documenti" vuol dire tutte le cose da fare che hai scritto. Chi vuole
// buttare anche quelli lo fa a mano, sapendo cosa sta facendo.
//
// Fallisce in silenzio (solo un avviso), come `postinstall`: una disinstallazione
// non deve rompersi per un collegamento.
//
// Nota sui tempi: gli hook di disinstallazione di npm non girano in tutti i casi
// — `--ignore-scripts` li salta, e alcune versioni li hanno trattati in modo
// diverso. Per questo lo stesso script si puo' lanciare a mano:
//
//     node scripts/preuninstall.js
//
// Cosi' la pulizia e' possibile anche quando il gancio non scatta.

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const desktop = join(process.env.USERPROFILE || "", "Desktop");
const collegamento = join(desktop, "Alia.lnk");

try {
  if (existsSync(collegamento)) {
    rmSync(collegamento, { force: true });
    console.log(`Alia: collegamento rimosso da ${collegamento}`);
  }
  /* Il silenzio quando non c'e' e' voluto: disinstallare due volte, o
     disinstallare dopo aver tolto l'icona a mano, non e' un problema da
     raccontare. */
} catch (err) {
  console.warn("Alia: impossibile rimuovere il collegamento dal Desktop:", err.message);
}
