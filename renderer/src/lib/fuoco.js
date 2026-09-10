import { useEffect } from "react";

/* La trappola del fuoco per le finestre in sovraimpressione.

   Il difetto che chiude: con il Tab si esce dalla finestra e si finisce **dietro
   il velo**, su comandi che si vedono a malapena e che rispondono lo stesso. Da
   lì, premendo invio, si fa una cosa in una schermata che si credeva coperta.

   Non è una gentilezza per chi usa la tastiera: una finestra modale che lascia
   uscire il fuoco non è modale, è solo disegnata come se lo fosse.

   Il giro si chiude su sé stesso in tutti e due i versi — dall'ultimo comando in
   avanti si torna al primo, dal primo indietro si va all'ultimo. L'ascolto è in
   **cattura** (`true`), così arriva prima dei gestori dentro la finestra e non
   dipende da chi lascia o non lascia propagare l'evento. */

const SELEZIONABILI = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useTrappolaFuoco(rif, attiva = true) {
  useEffect(() => {
    if (!attiva) return undefined;
    const contenitore = rif.current;
    if (!contenitore) return undefined;

    const onKey = (e) => {
      if (e.key !== "Tab") return;

      /* Si misura a ogni Tab e non una volta all'apertura: dentro queste
         finestre i comandi vanno e vengono — un menu che si apre, una chip che
         compare — e un elenco fotografato all'inizio manderebbe il fuoco su
         cose che nel frattempo non ci sono più. */
      const fuoco = [...contenitore.querySelectorAll(SELEZIONABILI)].filter(
        (n) => n.offsetWidth > 0 || n.offsetHeight > 0 || n === document.activeElement,
      );
      if (fuoco.length === 0) {
        e.preventDefault();
        return;
      }

      const primo = fuoco[0];
      const ultimo = fuoco[fuoco.length - 1];
      const attivo = document.activeElement;

      if (!contenitore.contains(attivo)) {
        e.preventDefault();
        primo.focus();
        return;
      }
      if (e.shiftKey && attivo === primo) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && attivo === ultimo) {
        e.preventDefault();
        primo.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [rif, attiva]);
}
