import { InboxWorkspace } from "./inbox/InboxWorkspace.jsx";
import { AliaDialogs } from "./lib/AliaDialogs.jsx";
import { AliaProvider, useAlia } from "./lib/AliaProvider.jsx";

/* L'app è la schermata a tre sezioni, a tutta finestra, sui dati veri del core.

   La UI precedente è stata rimossa per intero — sidebar, schermate Oggi, Lista,
   Kanban, Calendario, Sorgenti e Impostazioni, composer, dettaglio, filter bar,
   la vecchia card e il ponte `lib/api.js`. Era costruita sul design vecchio e
   sul vecchio schema del core, quindi non c'era niente da riportare: sta nella
   storia del repo se serve rileggerla.

   Il ponte verso il core nuovo è `lib/aliaClient.js` (preload → IPC →
   src/core/alia-core.js). Fuori da Electron quel ponte non esiste, e la
   schermata lo dice invece di fingere: un finto database coprirebbe proprio gli
   errori che questo innesto deve fare emergere. */

const CENTRATO = "h-full w-full grid place-items-center bg-bg text-content font-sans p-8";

function Schermata() {
  const { stato, errore, ricarica } = useAlia();

  if (stato === "senza-core") {
    return (
      <div className={CENTRATO}>
        <div className="max-w-md text-center flex flex-col gap-2">
          <p className="m-0 text-mini tracking-[0.14em] uppercase text-accent">Alia</p>
          <p className="m-0 text-meta text-content/70">
            Questa pagina gira fuori da Electron, dove il core non è raggiungibile. Avvia l’app con{" "}
            <code className="text-content">npm run dev</code> per vedere i dati veri.
          </p>
        </div>
      </div>
    );
  }

  if (stato === "caricamento") {
    return (
      <div className={CENTRATO}>
        <p className="m-0 text-meta text-content/50">Caricamento…</p>
      </div>
    );
  }

  if (stato === "errore") {
    return (
      <div className={CENTRATO}>
        <div className="max-w-lg text-center flex flex-col gap-3">
          <p className="m-0 text-mini tracking-[0.14em] uppercase text-priority-high">
            Il core non ha risposto
          </p>
          <p className="m-0 text-meta text-content/70 break-words">{errore}</p>
          <button
            type="button"
            onClick={ricarica}
            className="h-8 px-3 self-center rounded-lg border border-divider bg-transparent cursor-pointer text-[12.5px] text-content hover:border-accent"
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <InboxWorkspace />
      <AliaDialogs />
    </>
  );
}

export default function App() {
  return (
    <AliaProvider>
      <div className="relative h-screen w-screen overflow-hidden">
        <Schermata />
      </div>
    </AliaProvider>
  );
}
