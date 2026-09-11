import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

/* La finestrella di cattura — quella che compare con la scorciatoia.

   E' una finestra sua e non la finestra grande, ed e' tutta qui la ragione
   della scorciatoia: **si scrive senza cambiare quello che si stava facendo**.
   Portare Alia davanti vorrebbe dire uscire da dove si era, e chi ha appena
   avuto un'idea mentre scriveva una mail non vuole andare da nessuna parte:
   vuole dirla e tornare indietro. Sparisce da se' appena ha finito.

   Da qui le sue proprieta', che non sono estetiche:

     · **senza cornice e sopra tutto** (`frame: false`, `alwaysOnTop`), perche'
       compare sopra il programma in uso e non deve chiedere di essere trovata;
     · **non nella barra delle applicazioni** (`skipTaskbar`), perche' non e'
       un posto in cui si sta: e' un gesto;
     · **si nasconde quando perde il fuoco**, che e' il modo in cui si annulla
       senza dover cercare un tasto. Esc fa lo stesso, e il tasto c'e' lo stesso.

   Non si distrugge mai: si nasconde. Ricrearla a ogni scorciatoia vorrebbe dire
   ricaricare tutto il renderer e aspettarlo — mezzo secondo di finestra bianca
   ogni volta, su un gesto che deve essere immediato. Nasce al primo uso e
   resta, spenta, per il resto della sessione. */

const LARGHEZZA = 600;
const ALTEZZA = 330;

export function creaCattura({ preload, devServerUrl, indiceDist, log = () => {} }) {
  let finestra = null;

  const nasconde = () => {
    if (finestra && !finestra.isDestroyed() && finestra.isVisible()) finestra.hide();
  };

  function costruisci() {
    finestra = new BrowserWindow({
      width: LARGHEZZA,
      height: ALTEZZA,
      show: false,
      frame: false,
      resizable: false,
      movable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      /* Trasparente e senza sfondo: la finestrella disegna una card che non
         riempie tutto il riquadro, e un fondo opaco le farebbe un alone
         rettangolare intorno agli angoli tondi. */
      transparent: true,
      backgroundColor: "#00000000",
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    finestra.on("blur", nasconde);
    finestra.on("close", (e) => {
      /* Chiuderla vuol dire nasconderla: la finestra resta viva per la
         prossima scorciatoia. Si distrugge solo quando si chiude l'app, e
         allora questo gestore e' gia' stato tolto. */
      e.preventDefault();
      nasconde();
    });

    finestra.webContents.on("console-message", (event) => {
      log("[cattura]", event.message, `(${event.sourceId}:${event.lineNumber})`);
    });

    if (devServerUrl) finestra.loadURL(`${devServerUrl}cattura.html`);
    else finestra.loadFile(indiceDist);
  }

  return {
    /* Mostra la finestrella **dove sta il puntatore**, cioe' sullo schermo che
       si sta guardando: su due monitor, comparire sempre sul principale vuol
       dire comparire dietro le spalle una volta su due. In alto e non al
       centro esatto — un riquadro centrato copre proprio quello che si stava
       leggendo, e la memoria di quello che si voleva scrivere sta li'. */
    mostra() {
      if (!finestra || finestra.isDestroyed()) costruisci();
      const cursore = screen.getCursorScreenPoint();
      const area = screen.getDisplayNearestPoint(cursore).workArea;
      finestra.setBounds({
        x: Math.round(area.x + (area.width - LARGHEZZA) / 2),
        y: Math.round(area.y + area.height * 0.18),
        width: LARGHEZZA,
        height: ALTEZZA,
      });
      finestra.show();
      finestra.focus();
      finestra.webContents.send("cattura:apri");
    },
    nascondi: nasconde,
    chiudi() {
      if (finestra && !finestra.isDestroyed()) {
        finestra.removeAllListeners("close");
        finestra.destroy();
      }
      finestra = null;
    },
    /* Per sapere se la finestrella e' quella che ha mandato un messaggio. */
    eLei: (webContents) => !!finestra && !finestra.isDestroyed() && finestra.webContents === webContents,
  };
}
