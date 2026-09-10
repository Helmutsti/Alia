import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { core, hasCore } from "./aliaClient.js";
import { normalizeProject, normalizeState, normalizeTask } from "./tasks.js";

/* Lo stato dei dati, condiviso da tutta la schermata.

   Un provider e non un hook per componente: la colonna "Da smistare" e l'area
   contenuto mostrano *le stesse* task viste da due angoli diversi. Con due
   caricamenti separati potrebbero divergere — spostare una task in un progetto
   la fa sparire da sinistra e comparire a destra, e le due metà devono
   cambiare nello stesso istante.

   Le mutazioni passano tutte da `esegui`, perché tre di esse possono tornare
   indietro chiedendo una conferma invece di applicare (vedi task-core.js). Il
   provider tiene da parte la chiamata, la ripropone quando arriva la risposta,
   e ricarica solo quando qualcosa è stato scritto davvero. */

const AliaContext = createContext(null);

export function useAlia() {
  const valore = useContext(AliaContext);
  if (!valore) throw new Error("useAlia fuori da <AliaProvider>");
  return valore;
}

/* `dataset` esiste per una sola cosa: la pagina di anteprima, che gira in Vite
   fuori da Electron e ha bisogno di card in scena per il confronto con gli
   artboard. Passandolo, il provider non parla con il core e le mutazioni non
   scrivono niente — è dichiaratamente finto, e solo preview.jsx lo usa. */
export function AliaProvider({ children, dataset = null }) {
  const [stato, setStato] = useState(dataset ? "pronto" : hasCore ? "caricamento" : "senza-core");
  const [errore, setErrore] = useState(null);
  const [dati, setDati] = useState(dataset ?? { tasks: [], states: [], projects: [] });

  /* Ciò che l'ultima mutazione ha lasciato sul tavolo: una conferma da
     chiedere, un blocco da spiegare, degli avvisi da mostrare. */
  const [richiesta, setRichiesta] = useState(null);
  const [bloccato, setBloccato] = useState(null);
  const [avvisi, setAvvisi] = useState([]);
  const chiamataSospesa = useRef(null);

  const carica = useCallback(async () => {
    if (dataset || !hasCore) return;
    try {
      const [tasks, states, projects] = await Promise.all([
        core.listTasks(),
        core.listStates(),
        core.listProjects(),
      ]);
      setDati({
        tasks: tasks.map(normalizeTask),
        states: states.map(normalizeState),
        projects: projects.map(normalizeProject),
      });
      setStato("pronto");
      setErrore(null);
    } catch (err) {
      setErrore(err?.message ?? String(err));
      setStato("errore");
    }
  }, [dataset]);

  useEffect(() => {
    carica();
  }, [carica]);

  /* `chiamata` è una funzione che riceve le decisioni e restituisce l'esito:
     conservarla come chiusura è ciò che permette di rigiocarla identica dopo
     la risposta dell'utente, senza dover ricostruire gli argomenti. */
  const esegui = useCallback(
    async (chiamata) => {
      /* Con un dataset di anteprima non c'è niente da scrivere: meglio non
         fare nulla che far esplodere il ponte assente. */
      if (dataset) return null;
      setBloccato(null);
      try {
        const esito = await chiamata({});
        return await gestisci(esito, chiamata);
      } catch (err) {
        setErrore(err?.message ?? String(err));
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carica, dataset],
  );

  async function gestisci(esito, chiamata) {
    /* Le operazioni di sola lettura e quelle senza esito strutturato (per
       esempio `updateTask`, che non ha cascate) non hanno niente da negoziare. */
    if (!esito || typeof esito !== "object" || !esito.esito) {
      await carica();
      return esito;
    }
    if (esito.esito === "conferma") {
      chiamataSospesa.current = chiamata;
      setRichiesta(esito.richiesta);
      return esito;
    }
    if (esito.esito === "bloccato") {
      chiamataSospesa.current = null;
      setBloccato(esito);
      return esito;
    }
    chiamataSospesa.current = null;
    setRichiesta(null);
    if (esito.avvisi?.length) setAvvisi((prev) => [...prev, ...esito.avvisi]);
    await carica();
    return esito;
  }

  /* La risposta dell'utente: si rigioca la stessa chiamata con le decisioni
     dentro. Se il core ne chiede un'altra (può capitare: prima i figli già
     chiusi, poi lo stato di riapertura), il ciclo si ripete da sé. */
  const rispondi = useCallback(
    async (decisioni) => {
      const chiamata = chiamataSospesa.current;
      if (!chiamata) return null;
      setRichiesta(null);
      try {
        const esito = await chiamata(decisioni);
        return await gestisci(esito, chiamata);
      } catch (err) {
        setErrore(err?.message ?? String(err));
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carica],
  );

  const annulla = useCallback(() => {
    chiamataSospesa.current = null;
    setRichiesta(null);
    setBloccato(null);
  }, []);

  const scartaAvviso = useCallback((indice) => {
    setAvvisi((prev) => prev.filter((_, i) => i !== indice));
  }, []);

  /* Comodità ricorrenti, calcolate una volta qui invece che in ogni vista. */
  const derivati = useMemo(() => {
    const statoIniziale = dati.states.find((s) => s.role === "start") ?? null;
    const statiAperti = dati.states.filter((s) => s.role !== "end");
    const statiChiusura = dati.states.filter((s) => s.role === "end");
    return { statoIniziale, statiAperti, statiChiusura };
  }, [dati.states]);

  const valore = useMemo(
    () => ({
      stato,
      errore,
      ...dati,
      ...derivati,
      ricarica: carica,
      esegui,
      rispondi,
      annulla,
      richiesta,
      bloccato,
      avvisi,
      scartaAvviso,
      /* Le mutazioni, già avvolte: chi le usa non deve sapere come si negozia
         una conferma. */
      creaTask: (input) => esegui((decisioni) => core.createTask(input, decisioni)),
      aggiornaTask: (id, patch) => esegui(() => core.updateTask(id, patch)),
      cambiaStato: (id, idState) => esegui((decisioni) => core.setTaskState(id, idState, decisioni)),
      assegnaProgetto: (id, idProject, idMilestone) =>
        esegui(() => core.setTaskProject(id, idProject, idMilestone)),
      riordina: (idParent, orderedIds) => esegui(() => core.reorderTasks(idParent, orderedIds)),
      cancellaTask: (id) => esegui(() => core.deleteTask(id)),
      migraTask: (id, idState) => esegui(() => core.migrateTask(id, idState)),
      /* Tag e commenti: letture diritte (non passano da `esegui`, che serve a
         negoziare le conferme delle mutazioni con cascata) e scritture avvolte
         come le altre. Il dettaglio del task le chiama a finestra aperta, per
         non tenere in memoria dati che servono a un task per volta. */
      leggiTag: (id) => core.listTaskTags(id),
      leggiCommenti: (id) => core.listTaskComments(id),
      leggiStorico: (id) => core.getTaskHistory(id),
      aggiungiTag: (id, label) => esegui(() => core.addTaskTag(id, label)),
      togliTag: (id, idTag) => esegui(() => core.removeTaskTag(id, idTag)),
      aggiungiCommento: (id, body) => esegui(() => core.addTaskComment(id, body)),
      togliCommento: (idCommento) => esegui(() => core.removeTaskComment(idCommento)),
    }),
    [stato, errore, dati, derivati, carica, esegui, rispondi, annulla, richiesta, bloccato, avvisi, scartaAvviso],
  );

  return <AliaContext.Provider value={valore}>{children}</AliaContext.Provider>;
}
