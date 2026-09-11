import { useCallback, useEffect, useRef, useState } from "react";

import { bridge } from "../lib/aliaClient.js";
import { confluenza } from "../lib/confluenza.js";

/* Lo stato della finestra sulle origini, in un posto solo.

   Sta qui e non dentro la colonna perché due pezzi lontani guardano lo stesso
   dato: la colonna, che mostra le card, e il badge in cima alla schermata, che
   conta l'arretrato. Con due letture separate direbbero numeri diversi nel
   momento peggiore — subito dopo una decisione.

   ── Non è una cache ────────────────────────────────────────────────────────

   `origini` non è una copia da tenere allineata: è **l'ultima occhiata**. Il
   servizio resta l'unico posto dove le origini esistono; qui c'è solo quello
   che si è visto l'ultima volta che ci si è affacciati. Per questo dopo ogni
   decisione si riaffaccia invece di togliere la riga dall'array a mano: la
   finestra è la verità, l'array è un riflesso.

   ── Tre stati, e l'errore non è un guasto ──────────────────────────────────

   La confluenza è facoltativa: può non essere configurata, essere spenta, stare
   su una macchina che oggi non risponde. Quando succede la colonna è vuota — ma
   **non è uno zero che mente**, è una finestra chiusa, e va detto come tale. */

export function useOrigini() {
  const [origini, setOrigini] = useState([]);
  const [stato, setStato] = useState("iniziale");
  const [esito, setEsito] = useState(null);
  /* Evita di scrivere su un componente smontato: la Full Inbox esce di scena
     tornando alla vista divisa, e una risposta lenta arriverebbe dopo. */
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const ricarica = useCallback(async () => {
    setStato("in-corso");
    const risposta = await confluenza.elenco();
    if (!vivo.current) return risposta;
    setEsito(risposta);
    if (risposta.esito === "riuscito") {
      setOrigini(risposta.origini ?? []);
      setStato("pronto");
    } else {
      /* La lista precedente si svuota: mostrare righe vecchie accanto a un
         errore farebbe credere che siano ancora vere, e su una di quelle si
         potrebbe cliccare "accetta" verso un servizio che non c'è. */
      setOrigini([]);
      setStato("fallito");
    }
    return risposta;
  }, []);

  useEffect(() => {
    ricarica();
  }, [ricarica]);

  /* Il colpetto dal processo main: il numero è cambiato (modo periodico), o è
     appena nato un task. Non porta dati — dice solo di riaffacciarsi. */
  useEffect(() => {
    if (typeof bridge?.onOrigini !== "function") return undefined;
    return bridge.onOrigini(() => ricarica());
  }, [ricarica]);

  /* Le due decisioni. Entrambe riaffacciano, ed entrambe restituiscono l'esito
     a chi le ha chiamate, che deve poterlo mostrare: una decisione che fallisce
     in silenzio è una cosa da fare persa. */
  const decidi = useCallback(
    async (azione) => {
      const risposta = await azione();
      if (!vivo.current) return risposta;
      if (risposta.esito === "riuscito" || risposta.esito === "gia-decisa") {
        await ricarica();
      } else {
        setEsito(risposta);
        setStato("fallito");
      }
      return risposta;
    },
    [ricarica],
  );

  const accetta = useCallback(
    (seq, patch) => decidi(() => confluenza.accetta(seq, patch)),
    [decidi],
  );
  const rifiuta = useCallback((seq) => decidi(() => confluenza.rifiuta(seq)), [decidi]);

  return {
    origini,
    /* Il conteggio viene dal servizio e non da `origini.length`: l'elenco è
       tagliato a un limite, l'arretrato no. Con duecento origini il badge deve
       dire duecento anche se la colonna ne mostra meno. */
    quante: esito?.esito === "riuscito" ? (esito.daProcessare ?? origini.length) : 0,
    stato,
    errore: stato === "fallito" ? (esito?.errore ?? "La confluenza non risponde.") : null,
    ricarica,
    accetta,
    rifiuta,
  };
}
