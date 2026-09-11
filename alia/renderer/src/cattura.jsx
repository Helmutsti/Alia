import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { TaskComposer } from "./components/TaskComposer.jsx";
import { AliaProvider } from "./lib/AliaProvider.jsx";
import "./styles/theme.css";

/* La cattura veloce — la pagina della finestrella che compare con la
   scorciatoia globale (Ctrl+Alt+K).

   E' **il composer e nient'altro**: la stessa `TaskComposer` della finestra
   grande, non una sua versione ridotta. Una seconda forma di creazione che
   sappia fare meno sarebbe una seconda cosa da imparare e da tenere allineata,
   e il giorno in cui il composer guadagna un campo la cattura resterebbe
   indietro senza che nessuno se ne accorga.

   Quello che cambia e' cosa c'e' **intorno**: niente, e uno sfondo trasparente.
   La finestra non ha cornice (vedi electron/cattura.js), quindi la card e' la
   finestra — e siccome la finestra e' una card, bisogna poterla spostare:
   l'intestazione fa da maniglia (`-webkit-app-region: drag`), e tutto quello
   che ci sta dentro deve dire il contrario, se no i bottoni non si cliccano.

   Chiudere e' un gesto solo — Esc, o il clic fuori (la finestra si nasconde da
   sola quando perde il fuoco) — e in tutti i casi si passa da `cattura.fatto`,
   che nasconde la finestrella e, se e' nata una task, dice alla finestra
   grande di rileggere. */

const eCattura = typeof window !== "undefined" && !!window.cattura;

function Cattura() {
  /* Il composer non si smonta mai davvero: la finestra resta viva e nascosta
     fra una scorciatoia e l'altra (vedi electron/cattura.js). Questo numero,
     che cresce a ogni apertura, e' la `key` del composer: lo fa rinascere
     pulito senza ricaricare la pagina — campi vuoti, nessun residuo della
     volta prima, ma nessuna attesa. */
  const [giro, setGiro] = useState(0);

  useEffect(() => {
    if (!eCattura) return undefined;
    return window.cattura.suApri(() => setGiro((n) => n + 1));
  }, []);

  const chiudi = useCallback((creata) => {
    if (eCattura) window.cattura.fatto(!!creata);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") chiudi(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chiudi]);

  return (
    /* Il bordo del riquadro fa da maniglia: una finestra senza cornice non si
       sposta, e comparendo sempre nello stesso punto finirebbe prima o poi
       sopra la cosa che si sta guardando. La card dice `no-drag`, se no dentro
       non si cliccherebbe niente. */
    <div
      className="h-screen w-screen p-3 font-sans text-content"
      style={{ WebkitAppRegion: "drag" }}
    >
      <div style={{ WebkitAppRegion: "no-drag" }}>
        {/* `inbox` vero: una task scritta di fretta da un'altra applicazione e'
            esattamente cio' per cui l'inbox esiste — arriva e aspetta di essere
            decisa. Il composer permette comunque di darle un progetto li' per
            li', e allora smette di essere in triage: e' la stessa regola del
            campo in fondo alla colonna. */}
        <TaskComposer
          key={giro}
          nudo
          inbox
          segnaposto="Aggiungi un task in Alia"
          aiutoScorciatoia="Ctrl+Alt+K da qualunque programma"
          onChiudi={(creata) => chiudi(creata)}
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Nessun `dataset`: qui il core c'e', e' lo stesso della finestra grande —
        il preload e' quello, e il processo principale uno solo. */}
    <AliaProvider>
      <Cattura />
    </AliaProvider>
  </React.StrictMode>,
);
