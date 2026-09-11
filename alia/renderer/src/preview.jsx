import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { InboxWorkspace } from "./inbox/InboxWorkspace.jsx";
import { GalleriaCard } from "./GalleriaCard.jsx";
import { demoDataset } from "./inbox/data.js";
import { AliaProvider } from "./lib/AliaProvider.jsx";
import "./styles/theme.css";

/* Pagina di anteprima delle schermate ricostruite dagli artboard.

   Esiste perché il core non è raggiungibile fuori da Electron: `window.alia`
   lo espone il preload, che nel browser non c'è. Qui il provider riceve quindi
   un dataset dichiaratamente finto (`demoDataset`, gli stessi contenuti degli
   artboard) e non parla con nessun core: le schermate si aprono in Vite e si
   confrontano con gli artboard. Nell'app quel dataset non viene mai caricato.

   Uso: `npm run dev:renderer` → http://localhost:5173/preview.html
     ?screen=min   schermata principale a due colonne (DEF_Inbox min)
     ?screen=max   Full Inbox (DEF_Inbox max), senza passare dalla maniglia
     ?screen=carte la galleria delle card: la card di oggi e la proposta con
                   tutti i dati, alle due larghezze vere (vedi GalleriaCard)

   Il riquadro è a 1180×760, la dimensione di anteprima dichiarata negli
   artboard: per il diff pixel va fotografato l'elemento [data-frame], non la
   pagina, così i controlli qui sotto non entrano nello scatto. */

/* Le due schermate non sono più due componenti: sono i due stati di riposo di
   `InboxWorkspace`, agli estremi dello stesso movimento. Qui si scelgono solo
   per poterle fotografare separatamente senza passare dalla maniglia. */
const SCREENS = {
  min: { label: "Vista divisa (riposo a p=0)", startFull: false },
  max: { label: "Full Inbox (riposo a p=1)", startFull: true },
  /* La galleria non e' una schermata dell'app: e' un banco di prova per le
     card. Non ha la cornice 1180x760 — non si confronta con nessun artboard,
     si scorre. */
  carte: { label: "Galleria delle card", galleria: true },
};

function Preview() {
  const initial = new URLSearchParams(window.location.search).get("screen");
  const [screen, setScreen] = useState(SCREENS[initial] ? initial : "min");
  const dataset = useMemo(() => demoDataset(), []);

  const scelta = (
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
  );

  if (SCREENS[screen].galleria) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center gap-4 p-6">
        {scelta}
        <GalleriaCard />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-6">
      {/* La cornice sta qui e non nel componente: nell'app la schermata riempie
          la finestra, qui è bloccata a 1180×760 perché è la dimensione con cui
          si confronta con gli artboard. */}
      <div
        data-frame
        className="w-[1180px] h-[760px] rounded-[14px] overflow-hidden shadow-elev-md"
      >
        {/* `key` per rimontare: lo stato di partenza è un valore iniziale. */}
        <AliaProvider dataset={dataset}>
          <InboxWorkspace key={screen} startFull={SCREENS[screen].startFull} />
        </AliaProvider>
      </div>

      {scelta}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
