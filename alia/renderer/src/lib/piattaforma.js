/* Il tasto modificatore, e come si chiama qui.

   Alia gira su Windows, ma non solo: il pacchetto si installa da npm e Electron
   ci mette la piattaforma su cui sta. Il modificatore delle scorciatoie cambia
   con il sistema — `Cmd` su macOS, `Ctrl` altrove — e cambia anche **il segno
   con cui si scrive**, perché scrivere `⌘K` a chi ha una tastiera Windows non è
   un dettaglio grafico: è un'istruzione sbagliata.

   Il riconoscimento guarda `userAgentData.platform` per primo, che è il campo
   ancora supportato, e ripiega su `navigator.platform`, che è deprecato ma
   presente ovunque. Fuori da un browser (test, rendering sul server) niente di
   tutto questo esiste, e il valore prudente è "non è un Mac": è il caso più
   comune, e `Ctrl` scritto a un utente Mac si legge lo stesso, mentre `⌘` a un
   utente Windows non vuol dire niente. */

const piattaforma =
  (typeof navigator !== "undefined" &&
    (navigator.userAgentData?.platform || navigator.platform || "")) ||
  "";

export const SU_MAC = /mac/i.test(piattaforma);

/* Il segno da mostrare. Su Mac il glifo del tasto, altrove la parola: `⌘` è
   universale su quelle tastiere, mentre un simbolo per Ctrl non esiste. */
export const TASTO_COMANDO = SU_MAC ? "⌘" : "Ctrl";

/* Come si **scrive** una scorciatoia, che non e' solo quale tasto e'.

   Su Mac i modificatori si accostano senza segni: `⌘K`. Ovunque altro si legano
   con il piu': `Ctrl+K`. Attaccare il nome del tasto alla lettera darebbe
   `CtrlK`, che non e' come si scrive una scorciatoia in nessun sistema — ed e'
   la prima cosa che ho sbagliato scrivendo questo file. */
export const scorciatoia = (tasto, { maiusc = false } = {}) =>
  SU_MAC
    ? `${maiusc ? "⇧" : ""}${TASTO_COMANDO}${tasto}`
    : `${TASTO_COMANDO}+${maiusc ? "Maiusc+" : ""}${tasto}`;

/* Le due scorciatoie della creazione, e la loro parentela e' voluta: la stessa
   lettera, con Maiusc per "la versione grande". E' la convenzione che usano
   quasi tutti (`⌘N` / `⇧⌘N`), quindi chi ne conosce una indovina l'altra. */
export const SCORCIATOIA_NUOVA_TASK = scorciatoia("K");
export const SCORCIATOIA_COMPOSER = scorciatoia("K", { maiusc: true });

/* Il modificatore giusto per l'evento: su Mac è `Cmd` (`metaKey`), altrove
   `Ctrl`. Guardarli entrambi sarebbe più permissivo e più sbagliato — su
   Windows `Meta` è il tasto Windows, e intercettarlo ruberebbe scorciatoie al
   sistema. */
export const conModificatore = (e) => (SU_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);

/* Le scorciatoie. Stanno qui e non nel componente perché sono definizioni, non
   comportamenti: quando ci saranno le altre sei disegnate nelle Impostazioni,
   staranno accanto a queste e si leggeranno insieme.

   `eNuovaTask` **esclude** Maiusc, e non è un dettaglio: senza quel controllo
   `Ctrl+Maiusc+K` soddisferebbe tutte e due le condizioni, e premendolo si
   aprirebbe il composer *e* si metterebbe il fuoco nel campo rapido dietro di
   lui. Due comandi con un tasto solo. */
const eK = (e) => conModificatore(e) && !e.altKey && e.key.toLowerCase() === "k";

export const eNuovaTask = (e) => eK(e) && !e.shiftKey;
export const eComposer = (e) => eK(e) && e.shiftKey;
