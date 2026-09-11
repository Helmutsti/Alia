import { useEffect, useState } from "react";
import { SU_MAC } from "./piattaforma.js";

/* Dove **non** si può mettere niente, in cima alla finestra.

   Da quando la barra del titolo è nascosta (`titleBarStyle: "hidden"` in
   electron/main.js), la prima riga della schermata e la barra della finestra
   sono la stessa striscia: "Inbox" a sinistra, la campanella e l'ingranaggio a
   destra, e in mezzo lo spazio da cui si trascina la finestra.

   Ma i tre bottoni di Windows — riduci, ingrandisci, chiudi — **restano quelli
   di sistema**, ed è il motivo per cui li abbiamo tenuti: con loro restano gli
   Snap Layouts che compaiono passandoci sopra, il doppio clic che massimizza, il
   menu con Alt+Spazio. Sono disegnati sopra la nostra striscia, in alto a
   destra, e quello spazio va lasciato libero.

   ── Quanto spazio, e perché non è un numero scritto a mano ─────────────────

   `navigator.windowControlsOverlay` è il modo giusto di chiederlo: risponde il
   rettangolo **davvero disponibile**, cioè la striscia meno i bottoni. Un 138
   scritto qui sarebbe sbagliato appena cambia la scala di Windows, la lingua
   (su alcune build i bottoni sono più larghi) o la dimensione della barra. E
   cambia anche a finestra aperta: massimizzando i bottoni si allargano, ed è
   per questo che si ascolta `geometrychange`.

   Su macOS quell'oggetto non esiste e i tre pallini stanno **a sinistra**:
   l'ingombro si sposta dall'altra parte, ed è un numero fisso perché lì lo è
   davvero (Electron li disegna sempre nello stesso punto).

   Fuori da Electron — la pagina di anteprima nel browser — non c'è nessuna
   barra da scavalcare e i due ingombri sono zero. */

const INGOMBRO_MAC = 72;

function misura() {
  const wco = typeof navigator !== "undefined" ? navigator.windowControlsOverlay : undefined;
  if (!wco?.visible) {
    /* Niente overlay: o è macOS (i pallini a sinistra), o è una finestra con la
       sua cornice, o è il browser. */
    return { sinistra: SU_MAC ? INGOMBRO_MAC : 0, destra: 0 };
  }
  const r = wco.getTitlebarAreaRect();
  return {
    sinistra: Math.max(0, Math.round(r.x)),
    destra: Math.max(0, Math.round(window.innerWidth - (r.x + r.width))),
  };
}

export function useBarraTitolo() {
  const [ingombro, setIngombro] = useState(misura);

  useEffect(() => {
    const wco = typeof navigator !== "undefined" ? navigator.windowControlsOverlay : undefined;
    if (!wco) return undefined;
    const aggiorna = () => setIngombro(misura());
    wco.addEventListener("geometrychange", aggiorna);
    /* Anche al ridimensionamento: `geometrychange` scatta quando cambia la
       barra, non quando cambia la finestra, e `destra` si calcola sulla
       larghezza della finestra. */
    window.addEventListener("resize", aggiorna);
    return () => {
      wco.removeEventListener("geometrychange", aggiorna);
      window.removeEventListener("resize", aggiorna);
    };
  }, []);

  return ingombro;
}

/* Le due proprietà, scritte una volta sola perché compaiono in sei posti e
   sbagliarne una vuol dire un bottone che non si clicca (tutto ciò che sta
   dentro un'area di trascinamento non riceve i clic finché non dice il
   contrario). */
export const TRASCINA = { WebkitAppRegion: "drag" };
export const NON_TRASCINA = { WebkitAppRegion: "no-drag" };
