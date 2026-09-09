import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { InboxWorkspace } from "./inbox/InboxWorkspace.jsx";
import "./styles/theme.css";

/* Pagina di anteprima delle schermate ricostruite dagli artboard.

   Esiste perché il renderer dell'app non gira nel browser: src/lib/api.js
   lancia un'eccezione se `window.schedulerCore` non è presente, cioè fuori da
   Electron. Queste schermate invece non toccano il core (dati da inbox/data.js,
   gli stessi degli artboard), quindi si possono aprire in Vite e confrontare
   con gli artboard.

   Uso: `npm run dev:renderer` → http://localhost:5173/preview.html
     ?screen=min   schermata principale a due colonne (DEF_Inbox min)
     ?screen=max   Full Inbox (DEF_Inbox max), senza passare dalla maniglia

   Il riquadro è a 1180×760, la dimensione di anteprima dichiarata negli
   artboard: per il diff pixel va fotografato l'elemento [data-frame], non la
   pagina, così i controlli qui sotto non entrano nello scatto. */

/* Le due schermate non sono più due componenti: sono i due stati di riposo di
   `InboxWorkspace`, agli estremi dello stesso movimento. Qui si scelgono solo
   per poterle fotografare separatamente senza passare dalla maniglia. */
const SCREENS = {
  min: { label: "Vista divisa (riposo a p=0)", startFull: false },
  max: { label: "Full Inbox (riposo a p=1)", startFull: true },
};

function Preview() {
  const initial = new URLSearchParams(window.location.search).get("screen");
  const [screen, setScreen] = useState(SCREENS[initial] ? initial : "min");

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-6">
      <div data-frame>
        {/* `key` per rimontare: lo stato di partenza è un valore iniziale. */}
        <InboxWorkspace key={screen} startFull={SCREENS[screen].startFull} />
      </div>

      <div className="flex gap-2">
        {Object.entries(SCREENS).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScreen(key)}
            className={
              "px-3 py-1.5 rounded-lg border text-[12.5px] cursor-pointer bg-transparent " +
              (screen === key
                ? "border-accent text-accent"
                : "border-divider text-content/60 hover:text-content")
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
