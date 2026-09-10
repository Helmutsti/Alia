import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Espandi, Gear, MailBox, Plus } from "../components/icons.jsx";
import { ContentPane } from "./ContentPane.jsx";
import { SettingsModal } from "../components/SettingsModal.jsx";
import { TaskComposer } from "../components/TaskComposer.jsx";
import { TaskDetailModal } from "../components/TaskDetailModal.jsx";
import { InboxCard } from "./InboxCard.jsx";
import { OriginCard } from "./OriginCard.jsx";
import { useBoardDrag } from "./dragKit.js";
import { FRAME, useInboxMorph } from "./useInboxMorph.js";
import { useAlia } from "../lib/AliaProvider.jsx";
import { SCORCIATOIA_COMPOSER, SCORCIATOIA_NUOVA_TASK, eComposer, eNuovaTask } from "../lib/piattaforma.js";
import "./inbox.css";

/* Inbox — vista divisa e Full Inbox nello stesso componente.

   Prima erano due schermate che si scambiavano al superamento della soglia.
   Non lo sono più: il passaggio è uno scorrimento continuo, quindi la
   transizione deve essere posseduta da un solo componente che tiene entrambe
   le colonne e le muove. La colonna di sinistra della vista divisa **è** la
   colonna "Da smistare" della Full Inbox — stesse card, stesso elemento —
   e scorrendo verso destra tira dentro da sinistra le origini.

   Le due geometrie di riposo restano quelle misurate sugli artboard: a `p = 0`
   il layout è quello di DEF_Inbox min, a `p = 1` quello di DEF_Inbox max. Non
   c'è nessuno scambio di componente, quindi non c'è nessun salto nel momento
   della conferma. Tutte le posizioni sono assolute, perché in fase B la
   colonna si stacca dal flusso e segue il puntatore: vedi useInboxMorph.js.

   Le card della colonna restano a 13.5px per tutto il movimento: sono lo
   stesso elemento dall'inizio alla fine, e cambiare corpo a metà strada si
   vedrebbe. Verificato che è anche la misura giusta: a 13.5px l'altezza è
   44.2px e il bottone "Aggiungi" cade a y=350, cioè i valori dell'artboard.
   La versione precedente le passava a 13px nello stato finale, e sbagliava di
   0.7px per card. */

/* Bottone del chrome di finestra (oggi: l'ingranaggio).

   La posizione è **ottica su tutti e due gli assi**: quello che deve stare a 12
   dal bordo è il contorno dell'icona, non quello del bottone. L'icona è 15
   dentro un bottone di 24, quindi rientra di 4.5 per conto suo, e il bottone va
   portato a 7 perché l'icona finisca a ~12. Da qui `top: 7` e `right: 7`.

   Vale la pena dire perché non sta nella riga dell'intestazione insieme alla
   scritta "Inbox", dove era finito per un giro. Quella riga è alta 31 (misura
   di DEF_Inbox max) e centra i suoi figli: un bottone di 24 centrato in 31 cade
   a 15.5, e l'icona dentro di lui a 20 — otto pixel più in basso di quanto
   disti dal bordo destro, e si vedeva. Un'etichetta di testo e un'icona vogliono
   regole di allineamento diverse: la prima si allinea per riquadro, la seconda
   per contorno visibile. Tenerle nello stesso flex costringeva a sbagliarne
   una. */
const CHROME_BTN =
  "grid place-items-center w-6 h-6 shrink-0 rounded-md border-0 bg-transparent " +
  "cursor-pointer text-content/55 hover:text-content " +
  "hover:bg-[color-mix(in_srgb,var(--color-content)_10%,transparent)]";
/* Il badge delle origini nuove, accanto alla scritta "Inbox": è il conteggio di
   quella colonna, quindi sta attaccato al suo nome e non insieme ai comandi di
   finestra. Stesso disegno del contatore filtri in ContentPane — pieno
   d'accento (l'azzurro del tema) con il testo nel colore del fondo. */
const BADGE =
  "inline-flex items-center justify-center min-w-4 h-4 px-1 shrink-0 rounded-full " +
  "bg-accent text-bg text-micro font-medium tabular-nums";

const ORIGIN_HEAD = "flex items-center gap-2 pt-3 pb-2 shrink-0 cursor-grab touch-none";
/* Il campo che crea: tratteggiato, sempre in fondo alla colonna.

   Ha sostituito il bottone "Aggiungi" di DEF_Inbox max, ed e' un cambio di
   gesto e non di aspetto. Il bottone creava una task intitolata "Nuova task" e
   apriva la sua riga in modifica: due passaggi e un titolo finto da cancellare.
   Qui si scrive e si preme Invio; il campo si svuota da se' e resta pronto,
   perche' le task si scrivono a raffica — la stessa cosa che nelle Impostazioni
   fa il campo delle fasi.

   Sta in fondo, sotto l'ultima card, e non in cima: e' il posto in cui la task
   comparira'. Un campo in cima farebbe scrivere in un punto e comparire in un
   altro. */
const NUOVA_TASK =
  "flex items-center gap-2 w-full h-8 px-2.5 rounded-lg shrink-0 " +
  "border border-dashed border-[color-mix(in_srgb,var(--color-content)_18%,transparent)] " +
  "focus-within:border-accent";

/* Ritorno alla vista divisa: tondo, senza testo, nell'angolo in basso a destra
   della colonna origini — quindi appena a sinistra della colonna "Da smistare".
   Fondo `surface` e non trasparente perché galleggia sullo spazio vuoto della
   board, dove un bordo solo non basterebbe a farlo leggere. */
const BACK_BTN =
  "absolute right-0 bottom-0 grid place-items-center w-9 h-9 rounded-full cursor-pointer " +
  "border border-divider bg-surface text-content " +
  "hover:bg-[color-mix(in_srgb,var(--color-content)_12%,transparent)]";

export function InboxWorkspace({ startFull = false }) {
  const m = useInboxMorph(20, startFull);
  const boardRef = useRef(null);
  const alia = useAlia();

  /* Copia locale delle task, riallineata a ogni caricamento del core.
     Serve al trascinamento: durante il movimento la lista si riordina a ogni
     spostamento del puntatore per far vedere dove finirà la card, e non si può
     scrivere sul database sessanta volte al secondo. La scrittura avviene al
     rilascio, e il ricaricamento che segue rimette le due liste d'accordo. */
  const [tasks, setTasks] = useState(alia.tasks);
  useEffect(() => setTasks(alia.tasks), [alia.tasks]);

  /* Con che ordinamento il pannello contenuto sta mostrando l'elenco. Lo
     riferisce ContentPane; serve al rilascio del trascinamento (vedi onDrop). */
  const [ordinamento, setOrdinamento] = useState("scadenza");

  /* Il bersaglio sotto il puntatore durante il trascinamento, per l anteprima
     che il pannello si disegna da solo (vedi ContentPane). */
  const [anteprima, setAnteprima] = useState(null);

  /* Le origini nuove, e il gesto che le spegne.

     Regola: la campanella si spegne **entrando** nella Full Inbox. È lì che le
     origini sono davanti agli occhi, ed è quello che "viste" vuol dire; nella
     vista divisa la colonna non esiste, quindi finché si sta di qua il badge
     deve restare acceso anche a fissarlo.

     `nuoveViste` è l'istantanea di quali erano nuove nell'istante in cui si è
     entrati. Serve perché la scrittura ricarica subito i dati, e senza questa
     copia i pallini sulle card si spegnerebbero sotto gli occhi nel momento
     esatto in cui l'utente arriva a guardarli — cioè il flag direbbe il vero e
     l'interfaccia non servirebbe a niente. L'istantanea vive quanto la
     permanenza nella board e si svuota all'uscita.

     `segnate` evita di riscrivere a ogni render: `pending` è un array nuovo
     ogni volta, e senza guardia l'effetto si rincorrerebbe con il ricaricamento
     che lui stesso provoca. */
  const [nuoveViste, setNuoveViste] = useState(() => new Set());
  const segnate = useRef(false);

  const [draggingTask, setDraggingTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [detailTask, setDetailTask] = useState(null);

  /* Impostazioni: il pannello di `DEF_Impostazioni`. Sta qui e non dentro una
     delle due metà perché copre tutta la finestra, come il dettaglio del task. */
  const [impostazioniAperte, setImpostazioniAperte] = useState(false);
  const apriImpostazioni = useCallback(() => setImpostazioniAperte(true), []);

  const commitTitle = useCallback(
    (id, value) => {
      setEditingTask(null);
      const next = String(value ?? "").trim();
      const task = tasks.find((t) => t.id === id);
      if (!next || !task || next === task.title) return;
      alia.aggiornaTask(id, { title: next });
    },
    [alia, tasks],
  );

  /* Il contenuto della Small Inbox e, a movimento finito, della colonna "Da
     smistare": i task di primo livello ancora in triage.

     Legge `isInbox`, non piu l'assenza di progetto. Cambio di sostanza, non di
     forma: prima un task usciva dalla colonna nel momento in cui gli si dava
     un progetto, adesso ci resta finche non lo si smista davvero — che e
     esattamente cosa doveva significare questa colonna. */
  const daSmistare = useMemo(
    () => tasks.filter((t) => t.parentId === null && t.inbox && !t.done),
    [tasks],
  );

  /* Le origini da confermare: nate da una sorgente esterna e ancora in triage.

     Prima questa colonna si arrangiava con "sorgente esterna **e** ancora
     nello stato di partenza", perche il dato non c'era. Ora c'e: e `isInbox`.
     Due conseguenze buone: un'origine confermata resta fuori dalla colonna
     anche se il suo stato non e cambiato, e confermare non ha piu bisogno di
     un posto dove mandare il task. */
  const pending = useMemo(
    () => tasks.filter((t) => t.sourceType && t.sourceType !== "manual" && t.inbox),
    [tasks],
  );

  const nuoveOrigini = useMemo(() => pending.filter((t) => t.isNew).length, [pending]);

  useEffect(() => {
    if (!m.committed) {
      segnate.current = false;
      setNuoveViste((prec) => (prec.size === 0 ? prec : new Set()));
      return;
    }
    if (segnate.current) return;
    segnate.current = true;
    const nuove = pending.filter((t) => t.isNew).map((t) => t.id);
    if (nuove.length === 0) return;
    setNuoveViste(new Set(nuove));
    alia.segnaOriginiViste();
  }, [m.committed, pending, alia]);

  /* Che aspetto prende il task nell'anteprima, mentre sta sopra un bersaglio.
     Deve dire la stessa cosa che `onDrop` scrivera' davvero, altrimenti si vede
     una cosa e ne succede un'altra al rilascio. */
  const patchPerBersaglio = useCallback(
    ({ colId, groupId }) => {
      /* Sui gruppi: nessun riordino dell'array. L'anteprima la disegna la
         vista, spostando la riga solo a schermo (vedi ContentPane) — l'ordine
         dell'elenco a destra e calcolato, quindi rimescolare l'array non
         direbbe il vero, e farlo a ogni pixel e' il difetto per cui
         trascinando una riga si muoveva tutto. */
      if (groupId) return null;
      if (colId === "none") return { inbox: true };
      return {};
    },
    [],
  );

  /* L'ordine da scrivere: la posizione vive fra i fratelli di primo livello,
     quindi si rinumera tutto l'insieme delle radici nell'ordine in cui
     l'anteprima le ha lasciate. Vale sia per la colonna sia per i gruppi. */
  const ordineDelleRadici = (locali) => locali.filter((t) => t.parentId === null).map((t) => t.id);

  const onDrop = useCallback(
    async ({ id, colId, groupId, tasks: locali }) => {
      /* Due liste, e vanno tenute distinte con cura.

         `locali` e la lista ottimistica: durante il trascinamento l'anteprima
         ci ha gia scritto dentro il risultato del rilascio (progetto nuovo,
         fuori dal triage) per farlo vedere. Serve solo a ricavare l'ordine.

         Le decisioni su cosa scrivere si prendono su `alia.tasks`, che e lo
         stato vero. Leggerle da `locali` e il difetto che questo codice ha
         avuto per un giro: i controlli "il progetto e diverso?" e "e in
         triage?" trovavano l'anteprima che aveva gia finto il risultato,
         rispondevano no, e non scrivevano niente. */
      const task = alia.tasks.find((t) => t.id === id);
      if (!task) return;

      /* ── verso destra: rilascio su un gruppo della vista Lista ──
         Assegna il progetto del gruppo e toglie dal triage: il trascinamento
         *e'* lo smistamento, perche' e' un gesto mirato e deliberato — chi lo
         fa ha deciso dove va quel task. Il gruppo "Senza progetto" e' un
         bersaglio valido: significa "deciso che non ha progetto", che non e' la
         stessa cosa di "non ancora guardato". */
      if (groupId) {
        const idProject = groupId === "__nessuno__" ? null : groupId;
        if (task.project?.id !== idProject) {
          await alia.assegnaProgetto(id, idProject, null);
        }
        if (task.inbox) await alia.smista(id, false);

        /* La posizione si scrive solo se l'elenco a destra e ordinato a mano.
           Con Scadenza, Priorita o Titolo l'ordine e calcolato: scrivere la
           posizione non si vedrebbe — il task salterebbe subito dove lo mette
           l'ordinamento — e il rilascio sembrerebbe non aver posizionato
           niente. Meglio non promettere un posizionamento che l'ordinamento in
           uso non puo mostrare. */
        if (ordinamento === "manuale") {
          await alia.riordina(null, ordineDelleRadici(locali));
        }
        return;
      }

      if (colId !== "none") return;

      /* ── verso sinistra: rilascio sulla colonna del triage ──
         Rimette in triage e non tocca nient'altro: progetto e date restano.
         E' il senso del flag — "da rivedere", non "da azzerare". */
      if (!task.inbox) {
        await alia.smista(id, true);
        /* Qui la posizione si scrive sempre: la colonna del triage e ordinata a
           mano per costruzione, non ha un ordinamento calcolato da rispettare. */
        await alia.riordina(null, ordineDelleRadici(locali));
        return;
      }

      /* Trascinare fuori dalle origini vale come conferma; l'ordine della
         colonna si scrive comunque, perché il rilascio può essere solo un
         riordino. */
      if (pending.some((p) => p.id === id)) {
        await alia.smista(id, false);
        return;
      }
      await alia.riordina(null, ordineDelleRadici(locali));
    },
    [alia, pending, ordinamento],
  );

  /* Creazione: la task nasce senza progetto (è un'inbox) e con il titolo già
     in modifica, così si scrive subito invece di crearla e poi cercarla. */
  /* La creazione ha tre porte e due stanze.

     Le prime due portano nella stessa: il campo in fondo alla colonna Inbox. La
     scorciatoia da tastiera non apre niente di suo — mette il cursore li'. Cosi'
     non ci sono due modi di creare che possono divergere.

     La terza e' il campo in fondo a ogni gruppo della vista Lista, che crea
     *dentro un progetto*: vive in ContentPane, che e' l'unico posto a sapere di
     quale gruppo si tratta.

     Sulla riga "Inbox" c'e' stato per un giro un `+` che portava al campo della
     colonna. Tolto: quella riga ha gia' la scritta con il suo badge e, all'altro
     capo, l'ingranaggio — e il campo che il `+` andava ad aprire e' visibile lo
     stesso, tre centimetri piu' sotto. Era un comando per arrivare a un comando
     che si vedeva gia'. */
  const rifNuova = useRef(null);
  const [composerAperto, setComposerAperto] = useState(null);
  const [titoloNuova, setTitoloNuova] = useState("");

  const apriNuova = useCallback(() => {
    rifNuova.current?.focus();
    rifNuova.current?.scrollIntoView({ block: "nearest" });
  }, []);

  /* Due modi di inserire, e la differenza non e' quanto si scrive: e' **dove si
     finisce**.

       rapido    Invio. La task nasce e il campo resta li', vuoto e a fuoco, per
                 la prossima. Non si va da nessuna parte, e questo e' il punto:
                 di cose da buttare dentro se ne butta una dopo l'altra.
       completo  Si apre la scheda della task, quella vera, e si compila.

     Nessuna scorciatoia con Maiusc. C'era la tentazione di dare a `Maiusc+Invio`
     il modo completo, ed e' stata scartata: `Maiusc+Invio` in un campo di testo
     vuol dire "vai a capo" in mezzo mondo, e girarlo a "apri un'altra finestra"
     sorprende invece di aiutare. Il modo completo ha un comando che si vede.

     Il completo **crea prima e apre dopo**, non il contrario. La scheda e'
     l'editor di una task che esiste — e' cosi' che funziona per tutte le altre,
     e un secondo editor per le task non ancora nate sarebbe lo stesso disegno
     due volte, con due possibilita' di divergere. La conseguenza da conoscere:
     chiudendo la scheda senza toccare niente, la task resta. Con un titolo
     scritto da chi l'ha aperta, pero': non e' un fantasma, e' una task scarna. */
  const creaRapido = useCallback(async () => {
    const titolo = titoloNuova.trim();
    if (!titolo) return;
    setTitoloNuova("");
    await alia.creaTask({ title: titolo });
  }, [alia, titoloNuova]);

  /* Il modo completo apre `DEF_Task Composer`, non la scheda del task: il
     composer e' fatto per **creare** — titolo, nota e cinque chip, e finche' non
     si preme invio non esiste niente — mentre la scheda e' l'editor di una task
     che gia' c'e'. La differenza si sente sull'annullamento: da qui Esc non
     lascia dietro niente.

     Il titolo scritto nel campo rapido entra nel composer gia' dentro: e' la
     prop `seedTitle` dell'artboard, che quel passaggio lo prevede. */

  const creaCompleto = useCallback(() => {
    setComposerAperto({ titolo: titoloNuova, inbox: true, idProgetto: null });
    setTitoloNuova("");
  }, [titoloNuova]);

  /* La scorciatoia sta sulla finestra e non sul campo, perche' deve funzionare
     ovunque si trovi il fuoco. Non scatta mentre si sta gia' scrivendo da
     qualche parte: rubare il tasto a chi ha il cursore in un campo di testo e'
     il modo piu' rapido di rendere odiosa una scorciatoia. */
  useEffect(() => {
    const onKey = (e) => {
      const rapida = eNuovaTask(e);
      const grande = eComposer(e);
      if (!rapida && !grande) return;

      const dove = e.target;
      const scrivendo =
        dove instanceof HTMLElement &&
        (dove.tagName === "INPUT" || dove.tagName === "TEXTAREA" || dove.isContentEditable);
      /* La rapida non ruba il tasto a chi sta scrivendo altrove; la grande sì,
         perché apre una finestra sopra tutto e non sposta il cursore di
         nascosto — l'unico posto in cui non deve scattare è dentro il composer
         stesso, che a quel punto è già aperto. */
      if (rapida && scrivendo && dove !== rifNuova.current) return;
      e.preventDefault();

      if (grande) {
        /* Quello che era scritto nel campo rapido viene portato dentro: se si
           sta scrivendo lì e ci si accorge che serve di più, non si ricomincia. */
        setComposerAperto((aperto) =>
          aperto ?? { titolo: titoloNuova, inbox: true, idProgetto: null },
        );
        setTitoloNuova("");
        return;
      }
      apriNuova();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apriNuova, titoloNuova]);

  const { start } = useBoardDrag({
    boardRef,
    tasks,
    setTasks,
    onDragChange: setDraggingTask,
    onOpen: setDetailTask,
    onEditTitle: setEditingTask,
    onDrop,
    patchPerBersaglio,
    onAnteprima: setAnteprima,
  });

  const detail = tasks.find((t) => t.id === detailTask);

  return (
    <div
      ref={(el) => {
        m.rootRef.current = el;
        boardRef.current = el;
      }}
      data-board
      /* Riempie il contenitore: nell'app è la finestra, nella pagina di
         anteprima è una cornice di 1180×760 che serve al confronto con gli
         artboard. La geometria del movimento si adatta da sé — vedi
         useInboxMorph, che misura il quadro invece di assumerlo. */
      className={
        "relative w-full h-full overflow-hidden bg-bg text-content " +
        `font-sans ${m.dragging ? "cursor-col-resize select-none" : ""}`
      }
    >
      {/* ═══ intestazione di quadro — vale per **entrambe** le geometrie ═══

          Non si dissolve più e non ha una seconda copia dentro la colonna: è un
          elemento solo, sempre acceso, sempre nello stesso punto. Tiene le tre
          cose che non appartengono né alla colonna né al contenuto — il nome
          della schermata, il conto delle origini nuove, le impostazioni — e per
          questo sta fuori da entrambi i contenitori. Un ingranaggio *dentro* la
          card dell'Inbox leggerebbe come "impostazioni dell'inbox".

          Da qui viene la semplificazione del movimento: siccome questa riga c'è
          sempre, le colonne cominciano sotto di lei anche a p=0, e `top` e
          `height` smettono di essere interpolati (vedi useInboxMorph).

          Il badge sta attaccato alla scritta perché è il conto di *questa*
          schermata; l'ingranaggio va all'altro capo, ed è lì che andranno le
          notifiche quando ci saranno. */}
      {/* La riga sta a `pad − 5`, non a `pad`, ed è la **stessa compensazione
          ottica dell'ingranaggio**: quello che deve distare 12 dal bordo è il
          contorno visibile, non il riquadro che lo contiene. Un'etichetta di 11px
          maiuscoli sta in una riga di testo alta 17, e le maiuscole cominciano
          circa 4.5 più in basso del riquadro — esattamente come l'icona da 15
          dentro un bottone da 24. Stesso scarto, stesso recupero, e i due tornano
          allineati anche fra loro.
          Non ha più un'altezza fissa: prende quella del testo. I 31px di
          `FRAME.headerH` restano la **fascia riservata** da cui si ricava
          `colTop`, non la misura di questa riga — centrare un'icona in quella
          fascia era ciò che la spingeva otto pixel troppo in basso. */}
      <div
        className="absolute flex items-center gap-2.5 z-[7]"
        style={{ left: FRAME.pad, right: FRAME.pad, top: FRAME.headerTop }}
      >
        <span className="text-mini tracking-[0.14em] uppercase text-accent">Inbox</span>
        {nuoveOrigini > 0 ? (
          <span
            className={BADGE}
            title={`${nuoveOrigini} ${nuoveOrigini === 1 ? "nuova origine" : "nuove origini"}`}
          >
            {nuoveOrigini}
          </span>
        ) : null}
      </div>

      {/* L'ingranaggio: elemento a sé, posizionato per contorno dell'icona e non
          per riquadro del bottone (vedi CHROME_BTN). Resta il vicino di casa
          delle notifiche, quando ci saranno. */}
      <div
        className="absolute flex items-center gap-1 z-[7]"
        style={{ top: FRAME.headerTop, right: FRAME.pad - 5 }}
      >
        <button
          type="button"
          onClick={apriImpostazioni}
          title="Impostazioni"
          aria-label="Impostazioni"
          className={CHROME_BTN}
        >
          <Gear size={15} />
        </button>
      </div>

      {/* ═══ area contenuto della vista divisa ═══

          Non è più una card: niente fondo, niente bordo, niente raggio, niente
          ombra. Il contenitore è passato alla colonna (vedi la nota in
          useInboxMorph): qui resta una regione appoggiata sul fondo, e le due
          metà della vista divisa si distinguono per elevazione — la colonna sta
          sopra, il contenuto sta sul tavolo — invece che per un bordo ciascuna.

          Margini: gli stessi delle colonne, presi da `FRAME`. Comincia alla
          quota `colTop`, come loro, e finisce sul margine del quadro a destra e
          in basso. Prima erano 16 su tre lati, che era il margine di una card;
          senza card non c'è più niente che li giustifichi, e allineare il
          contenuto alle colonne è ciò che tiene insieme le due geometrie. */}
      <div
        className="absolute flex overflow-hidden z-[1]"
        style={{
          left: m.content.left,
          top: FRAME.colTop,
          /* Fino al bordo, non a `FRAME.pad`: il margine destro è passato ai
             figli dentro ContentPane. Il motivo è la barra di scorrimento —
             quando non è in sovrimpressione si prende ~10px **dentro** il
             contenitore che scorre, e le righe finivano a 22 dal bordo mentre la
             colonna a sinistra stava a 12. Lasciando che il contenitore arrivi
             al bordo, la barra cade nel margine e le righe tornano a 12. */
          right: 0,
          bottom: FRAME.pad,
          opacity: m.content.opacity,
          transition: m.content.transition,
          pointerEvents: m.p === 0 ? "auto" : "none",
        }}
      >
        {/* `onOpenTask` porta l'apertura del dettaglio fin dentro le righe della
            vista Lista: lo stato di quale task e aperto vive qui, perche il
            modale copre tutta la schermata e non solo il pannello. */}
        <ContentPane
          onOpenTask={setDetailTask}
          onApriComposer={setComposerAperto}
          onRowPointerDown={start}
          onOrdinamento={setOrdinamento}
          anteprima={anteprima}
        />
      </div>

      {/* ═══ colonna origini — geometria finale, tirata dentro da sinistra ═══ */}
      <div
        data-drop-col="origin"
        /* Il bordo trasparente di 1px non è decorativo: negli artboard le
           colonne hanno un bordo che rientra il contenuto di 1px, e senza di
           esso testata e card starebbero 1px più a sinistra e 2px più larghe. */
        className="absolute flex flex-col border border-transparent z-[2]"
        style={{
          left: m.origins.left,
          width: m.origins.width,
          top: m.origins.top,
          height: m.origins.height,
          transform: `translateX(${m.origins.x}px)`,
          transition: m.origins.transition,
          pointerEvents: m.p === 1 ? "auto" : "none",
        }}
      >
        <div className={ORIGIN_HEAD}>
          <MailBox size={13} className="text-accent" />
          <span className="font-medium text-card text-accent">Origini da confermare</span>
          <span className="ml-auto text-mini text-content/55">{pending.length}</span>
        </div>
        {/* Il fondo lascia spazio al tasto rotondo, che galleggia sull'angolo:
            senza questo, con la lista lunga l'ultima card gli finirebbe sotto.
            Non sposta nulla quando la lista è corta. */}
        <div className="flex-1 min-h-0 overflow-y-auto pt-1 pb-[54px] flex flex-col gap-2">
          {pending.map((task) => (
            <OriginCard
              key={task.id}
              task={task}
              /* Nuova secondo il flag, oppure secondo l'istantanea presa
                 entrando: il flag si spegne appena si mette piede qui dentro,
                 l'istantanea è ciò che lo tiene visibile finché si guarda. */
              nuova={task.isNew || nuoveViste.has(task.id)}
              editing={editingTask === task.id}
              dragging={draggingTask === task.id}
              onPointerDown={(e) => start(task.id, e)}
              onCommit={(v) => commitTitle(task.id, v)}
              onEdit={() => setEditingTask(task.id)}
              /* Confermare = uscire dal triage. Non serve piu uno stato
                 intermedio configurato, quindi il gesto non e piu spento sui
                 database che non ce l'hanno. */
              onConfirm={() => alia.smista(task.id, false)}
              onDelete={() => alia.cancellaTask(task.id)}
            />
          ))}
        </div>

        {/* Sta dentro la colonna origini, così entra ed esce dal quadro con lo
            stesso scorrimento delle origini invece di comparire a parte. */}
        <button
          type="button"
          onClick={m.exitFull}
          title="Torna alla vista divisa"
          aria-label="Torna alla vista divisa"
          className={BACK_BTN}
          style={{
            opacity: m.fullHeaderOpacity,
            transition: m.fadeTransition,
            pointerEvents: m.committed ? "auto" : "none",
          }}
        >
          <ArrowLeft size={16} />
        </button>
      </div>

      {/* ═══ la colonna che si sposta: Small Inbox → "Da smistare" ═══ */}
      <div
        data-drop-col="none"
        /* La cromatura (fondo, bordo, raggio) sta sulla colonna stessa, non su
           uno strato sovrapposto: un tempo era un div a `-inset-px`, cioè 1px
           fuori dal padding box, e `overflow-hidden` lo ritagliava — il bordo
           risultava tagliato. Ora quei tre valori non si muovono nemmeno più: la
           colonna è una card di superficie in entrambe le geometrie, quindi il
           bordo di 1px c'è sempre e sempre dello stesso colore. */
        className="absolute flex flex-col overflow-hidden border z-[4]"
        style={{
          left: m.none.left,
          width: m.none.width,
          top: m.none.top,
          height: m.none.height,
          borderRadius: m.none.radius,
          backgroundColor: m.none.background,
          borderColor: m.none.borderColor,
          transition: m.none.transition,
        }}
      >
        {/* Intestazione della colonna: ne è rimasta una sola, quella della Full
            Inbox. Nella vista divisa la colonna non ha testata — la scritta
            "Inbox" è uscita nell'intestazione di quadro e "Aggiungi task" è da
            ridecidere — quindi il riquadro parte da altezza 0 e cresce fino ai
            40.9px di "Da smistare" mentre si trascina. Le card scendono insieme
            al movimento, invece di saltare alla conferma. */}
        <div className="relative shrink-0 overflow-hidden" style={{ height: m.none.headerSlot }}>
          <div
            className="absolute inset-x-0 top-0 pt-3 px-3 pb-2 flex items-center gap-2"
            style={{ opacity: m.fullHeaderOpacity, transition: m.fadeTransition }}
          >
            <span className="w-2 h-2 rounded-full border-[1.4px] border-dashed border-content/55" />
            <span className="font-medium text-card text-content">Da smistare</span>
            <span className="ml-auto text-mini text-content/55">{daSmistare.length}</span>
          </div>
        </div>

        {/* Le card: sono le stesse dall'inizio alla fine del movimento.

            `overflow-x-hidden` è esplicito e non ridondante: per specifica CSS
            un asse lasciato `visible` accanto a un asse `auto` diventa esso
            stesso `auto`, quindi `overflow-y-auto` da solo dava una colonna che
            scrollava anche in orizzontale — misurato, `overflow-x` calcolato
            era `auto`. Bastava un pixel di sforamento per far comparire una
            scrollbar orizzontale che si mangiava ~10px di altezza. Qui lo
            sforamento non deve scrollare: deve essere tagliato. */}
        <div
          className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col"
          style={{
            paddingLeft: m.none.listPadX,
            paddingRight: m.none.listPadX,
            paddingTop: m.none.listPadTop,
            paddingBottom: m.none.listPadBottom,
            gap: m.none.listGap,
          }}
        >
          {daSmistare.map((task) => (
            <InboxCard
              key={task.id}
              id={task.id}
              idAttr="data-task"
              title={task.title}
              priorityColor={task.priorityColor}
              editing={editingTask === task.id}
              dragging={draggingTask === task.id}
              onTitleClick={() => setEditingTask(task.id)}
              onCommit={(v) => commitTitle(task.id, v)}
              onPointerDown={(e) => start(task.id, e)}
            />
          ))}
          {/* Il campo della nuova task. Non e' piu' legato alla Full Inbox come
              il bottone che ha sostituito: c'e' in tutte e due le geometrie,
              perche' la colonna e' la stessa e il gesto anche. */}
          <div className={NUOVA_TASK}>
            <Plus size={12} className="text-content/40 shrink-0" />
            <input
              ref={rifNuova}
              type="text"
              value={titoloNuova}
              placeholder="Nuova task…"
              aria-label="Titolo della nuova task"
              onChange={(e) => setTitoloNuova(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setTitoloNuova("");
                  e.currentTarget.blur();
                }
                if (e.key === "Enter") creaRapido();
              }}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12.5px] text-content placeholder:text-content/45"
            />
            {/* La scorciatoia si mostra solo a campo vuoto: a cursore dentro e
                parola scritta, ripeterla e' rumore. Il segno cambia col sistema
                — vedi lib/piattaforma.js. */}
            {/* La scorciatoia si mostra solo a campo vuoto: a parola scritta,
                ripeterla e' rumore. Il comando del modo completo invece resta,
                perche' e' l'unica cosa che lo annuncia. */}
            {titoloNuova === "" ? (
              <span className="text-[10.5px] text-content/38 shrink-0">{SCORCIATOIA_NUOVA_TASK}</span>
            ) : null}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={creaCompleto}
              title={`Apri il composer (${SCORCIATOIA_COMPOSER})`}
              aria-label="Apri il composer"
              className="grid place-items-center w-5 h-5 shrink-0 rounded-md border-0 bg-transparent cursor-pointer text-content/38 hover:text-accent hover:bg-[color-mix(in_srgb,var(--color-content)_10%,transparent)]"
            >
              <Espandi size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ maniglia — resta sul bordo destro della colonna ═══ */}
      <div
        onPointerDown={m.onHandleDown}
        className="group/handle absolute top-0 bottom-0 w-[22px] flex items-center justify-center cursor-col-resize touch-none z-[5]"
        style={{
          left: m.handle.left - 11,
          opacity: m.handle.opacity,
          transition: m.handle.transition,
          pointerEvents: m.p === 1 ? "none" : "auto",
        }}
      >
        {/* Un filo più evidente dell'artboard, che lo teneva a `divider` con
            opacità 0.70: alfa effettiva 0.112, un composito a L 0.26 quasi
            invisibile per un comando che si deve trovare. A 0.20 arriva a
            L 0.35, appena sotto il bordo delle card (neutral-700, L 0.371):
            si vede come il contorno di una card, non di più. Geometria
            invariata, 2×44px, che è quella dell'artboard. */}
        <div
          className={
            "w-0.5 h-11 rounded-[2px] bg-content/20 " +
            "transition-colors duration-[120ms] group-hover/handle:bg-accent"
          }
        />
      </div>

      {/* ═══ composer — DEF_Task Composer ═══ */}
      {composerAperto ? (
        <TaskComposer
          titoloIniziale={composerAperto.titolo}
          idProgetto={composerAperto.idProgetto}
          inbox={composerAperto.inbox}
          onChiudi={() => setComposerAperto(null)}
        />
      ) : null}

      {/* ═══ impostazioni — DEF_Impostazioni ═══ */}
      {impostazioniAperte ? <SettingsModal onClose={() => setImpostazioniAperte(false)} /> : null}

      {/* ═══ dettaglio task — DEF_Task Detail ═══ */}
      {detail ? <TaskDetailModal task={detail} onClose={() => setDetailTask(null)} /> : null}
    </div>
  );
}
