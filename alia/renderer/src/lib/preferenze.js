import { useCallback, useEffect, useRef, useState } from "react";

import { core, hasCore } from "./aliaClient.js";

/* Una preferenza, legata a `t_setting`.

   Si usa come `useState`, e la differenza è tutta in due punti: il valore
   iniziale arriva dal database invece che dall'argomento, e ogni scrittura ci
   torna. In mezzo, chi la usa non deve saperne niente.

   ── Il ripiego vince finché non si sa ──────────────────────────────────────

   La lettura è asincrona: fra il primo render e la risposta passa un istante in
   cui la preferenza salvata non è ancora nota. In quell'istante vale il
   ripiego, cioè quello che l'applicazione farebbe comunque. Non si blocca il
   render aspettando — un pannello che compare vuoto per mezzo battito è peggio
   di uno che compare con l'ordinamento di fabbrica e poi si aggiusta.

   ── `valida` non è una cortesia ────────────────────────────────────────────

   `t_setting` è chiave-valore: il database non può garantire che dentro ci sia
   qualcosa che ha ancora senso. Una preferenza può contenere una vista che nel
   frattempo è stata bloccata, un ordinamento tolto dal menu, l'id di un
   progetto cancellato. Chi legge **deve** dire cosa accetta; quello che non
   passa il controllo vale come assente, e si torna al ripiego.

   È la stessa regola che `getSetting` applica al JSON illeggibile, un gradino
   più in alto: là si garantisce che torni qualcosa, qui che quel qualcosa sia
   una di quelle previste.

   ── Fuori da Electron ──────────────────────────────────────────────────────

   La pagina di anteprima non ha il core. Lì la preferenza resta uno `useState`
   normale e nessuno se ne accorge: non si finge un salvataggio che non
   avviene. */
export function usePreferenza(chiave, ripiego, valida = () => true) {
  const [valore, setValore] = useState(ripiego);

  /* `valida` è quasi sempre una funzione scritta in linea, quindi nuova ad ogni
     render: metterla nelle dipendenze farebbe rileggere la preferenza per
     sempre. Serve solo l'ultima versione al momento della lettura. */
  const controlla = useRef(valida);
  controlla.current = valida;

  useEffect(() => {
    if (!hasCore) return undefined;
    let vivo = true;
    core
      .getSetting(chiave, null)
      .then((salvato) => {
        if (!vivo || salvato === null) return;
        if (controlla.current(salvato)) setValore(salvato);
      })
      /* Una preferenza che non si riesce a leggere non è un guasto da mostrare:
         è il primo avvio, o una versione precedente. Si resta sul ripiego. */
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [chiave]);

  const imposta = useCallback(
    (prossimo) => {
      setValore(prossimo);
      /* Si scrive senza aspettare: il gesto dell'utente ha già avuto il suo
         effetto a schermo, e il salvataggio è una conseguenza. Se fallisce, al
         massimo la prossima volta si riparte dal ripiego — che è esattamente
         quello che succedeva prima che questa tabella esistesse. */
      if (hasCore) core.setSetting(chiave, prossimo).catch(() => {});
    },
    [chiave],
  );

  return [valore, imposta];
}
