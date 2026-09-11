import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { bridge, core, hasCore } from "./aliaClient.js";
import { normalizeMilestone,
  normalizeProject, normalizeState, normalizeTask } from "./tasks.js";

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
  const [dati, setDati] = useState(
    dataset ?? { tasks: [], states: [], projects: [], milestones: [] },
  );

  /* Ciò che l'ultima mutazione ha lasciato sul tavolo: una conferma da
     chiedere, un blocco da spiegare, degli avvisi da mostrare. */
  const [richiesta, setRichiesta] = useState(null);
  const [bloccato, setBloccato] = useState(null);
  const [avvisi, setAvvisi] = useState([]);
  const chiamataSospesa = useRef(null);

  const carica = useCallback(async () => {
    if (dataset || !hasCore) return;
    try {
      /* Le milestone si caricano insieme al resto da quando esiste la sezione
         Progetti. Prima non le caricava nessuno: il dettaglio del task le
         chiedeva al provider (`const { milestones = [] } = alia`) e riceveva
         sempre l'elenco vuoto, quindi la tendina delle fasi era vuota per
         costruzione, non perche' non ce ne fossero. */
      const [tasks, states, projects, milestones] = await Promise.all([
        core.listTasks(),
        core.listStates(),
        core.listProjects(),
        core.listMilestones(),
      ]);
      setDati({
        tasks: tasks.map(normalizeTask),
        states: states.map(normalizeState),
        projects: projects.map(normalizeProject),
        milestones: milestones.map(normalizeMilestone),
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

  /* Le sorgenti esterne scrivono senza che nessuno abbia chiesto niente: il bot
     Telegram crea un'origine mentre la finestra sta ferma. `carica` da sola non
     basta — gira al montaggio e dopo ogni mutazione, e una mutazione qui non
     c'è. Il processo main manda un colpetto sul canale `alia:origini` e la
     ricarica parte da lì.

     Si ricarica tutto e non si aggiunge la sola riga nuova: la colonna delle
     origini, il badge e la vista contenuto leggono tutti `dati`, e ricostruirlo
     a mano da un evento vorrebbe dire tenere due strade per lo stesso stato.
     Un'origine ogni tanto non è un carico. */
  useEffect(() => {
    if (dataset || !hasCore || typeof bridge?.onOrigini !== "function") return undefined;
    return bridge.onOrigini(() => carica());
  }, [carica, dataset]);

  /* Lo stesso colpetto sulla spalla, da un'altra parte: una task nata nella
     **finestrella di cattura** e' stata scritta da un altro renderer, quindi
     questo non ne sa niente finche' non glielo si dice. Senza, la task
     comparirebbe solo alla prossima cosa che fa ricaricare — cioe' sembrerebbe
     non essere stata creata. */
  useEffect(() => {
    if (dataset || !hasCore || typeof bridge?.onRicarica !== "function") return undefined;
    return bridge.onRicarica(() => carica());
  }, [carica, dataset]);

  /* `chiamata` è una funzione che riceve le decisioni e restituisce l'esito:
     conservarla come chiusura è ciò che permette di rigiocarla identica dopo
     la risposta dell'utente, senza dover ricostruire gli argomenti. */
  const esegui = useCallback(
    async (chiamata) => {
      /* Con un dataset di anteprima non c'è niente da scrivere: meglio non
         fare nulla che far esplodere il ponte assente. */
      if (dataset) return null;
      setBloccato(null);
      /* L'errore precedente si spegne all'inizio di ogni mutazione: senza,
         resterebbe appeso dopo che l'operazione seguente è andata bene, e chi
         lo mostra (il pannello Impostazioni) direbbe una cosa vecchia. */
      setErrore(null);
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

  /* Applicare la stessa mutazione a molti task, senza far comparire un dialogo
     per ciascuno.

     ── Perché non basta chiamare `esegui` in un ciclo ───────────────────────

     Tre mutazioni del core possono tornare indietro **chiedendo** invece di
     applicare (riapertura degli antenati, cancellazione di uno stato: vedi
     task-core.js). `esegui` gestisce quella richiesta mostrando un dialogo e
     aspettando. Venti task vorrebbero dire fino a venti dialoghi in fila, e la
     domanda è ogni volta diversa — non si può rispondere una volta per tutte
     senza rispondere a domande che non sono state fatte.

     ── La regola: applica quello che si applica, e dì il resto ──────────────

     Chi non chiede niente viene applicato. Chi chiede viene **lasciato stare** e
     riportato, perché lo si decida uno per uno con il gesto singolo, che il
     dialogo ce l'ha già. Chi fallisce viene riportato con il suo errore.

     È la stessa scelta fatta altrove oggi: *meglio salvarne diciannove che
     zero*, e **visibile e rimediabile** batte *pulito e silenzioso*. Un blocco
     che si annulla tutto perché il dodicesimo elemento aveva un dubbio è la
     forma peggiore di correttezza.

     Si ricarica **una volta sola** alla fine: venti ricariche sarebbero venti
     ridisegni della lista sotto le mani di chi guarda. */
  /* Mettere un avviso in scena senza passare da una mutazione.

     Il canale esiste gia' — l'angolo in alto a destra, `Messaggi` in
     AliaDialogs — ma finora ci arrivava solo quello che il core restituiva
     dentro un esito. Un resoconto di un'azione in blocco ("17 applicate, 3 da
     guardare") non viene dal core: viene da qui, che e' l'unico posto a sapere
     quante erano.

     Accetta una frase compiuta, che e' una delle due forme che `Messaggi` gia'
     sa mostrare. */
  const avvisa = useCallback((testo) => {
    if (!testo) return;
    setAvvisi((prec) => [...prec, testo]);
  }, []);

  const applicaInBlocco = useCallback(
    async (ids, chiamata) => {
      if (dataset) return { applicati: [], daDecidere: [], falliti: [] };
      setBloccato(null);
      setErrore(null);

      const applicati = [];
      const daDecidere = [];
      const falliti = [];

      for (const id of ids) {
        try {
          const esito = await chiamata(id);
          /* Le operazioni senza esito strutturato (`updateTask` e simili) non
             hanno niente da negoziare: se non lanciano, hanno applicato. */
          if (!esito || typeof esito !== "object" || !esito.esito || esito.esito === "applicato") {
            applicati.push(id);
          } else if (esito.esito === "conferma") {
            daDecidere.push({ id, richiesta: esito.richiesta });
          } else {
            falliti.push({ id, motivo: esito.motivo ?? esito.esito });
          }
        } catch (err) {
          falliti.push({ id, motivo: err?.message ?? String(err) });
        }
      }

      await carica();
      return { applicati, daDecidere, falliti };
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

  /* L'errore si scarta come un avviso, perche' ora sta nello stesso posto.
     Non e' solo cosmesi: finche' `errore` resta pieno il messaggio resta in
     scena, e senza un gesto per toglierlo l'unico modo di farlo sparire era
     una ricarica. */
  const scartaErrore = useCallback(() => setErrore(null), []);

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
      applicaInBlocco,
      avvisa,
      esegui,
      rispondi,
      annulla,
      richiesta,
      bloccato,
      avvisi,
      scartaAvviso,
      scartaErrore,
      /* Le mutazioni, già avvolte: chi le usa non deve sapere come si negozia
         una conferma. */
      creaTask: (input) => esegui((decisioni) => core.createTask(input, decisioni)),
      aggiornaTask: (id, patch) => esegui(() => core.updateTask(id, patch)),
      cambiaStato: (id, idState) => esegui((decisioni) => core.setTaskState(id, idState, decisioni)),
      assegnaProgetto: (id, idProject, idMilestone) =>
        esegui(() => core.setTaskProject(id, idProject, idMilestone)),
      /* Smistare: mette o toglie un task dal triage, senza toccare progetto,
         date o stato. */
      smista: (id, inInbox = false) => esegui(() => core.setTaskInbox(id, inInbox)),
      /* Spegne la campanella su tutte le origini. Passa da `esegui` come le
         altre mutazioni, quindi ricarica: il badge sparisce da solo. */
      /* Configurazione degli stati (pannello Impostazioni). `eliminaStato`
         passa da `esegui` come le altre: può tornare indietro chiedendo su
         quale stato spostare i task che usavano quello cancellato. */
      /* Progetti e milestone. `eliminaProgetto` passa da `esegui` come le altre
         negoziabili: puo' tornare indietro chiedendo dove mandare i task. */
      creaProgetto: (input) => esegui(() => core.createProject(input)),
      aggiornaProgetto: (id, patch) => esegui(() => core.updateProject(id, patch)),
      eliminaProgetto: (id) => esegui((decisioni) => core.deleteProject(id, decisioni)),
      creaMilestone: (input) => esegui(() => core.createMilestone(input)),
      aggiornaMilestone: (id, patch) => esegui(() => core.updateMilestone(id, patch)),
      eliminaMilestone: (id) => esegui(() => core.deleteMilestone(id)),
      creaStato: (input) => esegui(() => core.createState(input)),
      aggiornaStato: (id, patch) => esegui(() => core.updateState(id, patch)),
      riordinaStati: (orderedIds) => esegui(() => core.reorderStates(orderedIds)),
      eliminaStato: (id) => esegui((decisioni) => core.deleteState(id, decisioni)),
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
    [stato, errore, dati, derivati, carica, esegui, rispondi, annulla, richiesta, bloccato, avvisi, scartaAvviso, scartaErrore],
  );

  return <AliaContext.Provider value={valore}>{children}</AliaContext.Provider>;
}
