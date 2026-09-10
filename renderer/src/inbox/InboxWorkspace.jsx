import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MailBox, Plus } from "../components/icons.jsx";
import { ContentPane } from "./ContentPane.jsx";
import { TaskDetailModal } from "../components/TaskDetailModal.jsx";
import { InboxCard } from "./InboxCard.jsx";
import { OriginCard } from "./OriginCard.jsx";
import { useBoardDrag } from "./dragKit.js";
import { useInboxMorph } from "./useInboxMorph.js";
import { useAlia } from "../lib/AliaProvider.jsx";
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

const ORIGIN_HEAD = "flex items-center gap-2 pt-3 pb-2 shrink-0 cursor-grab touch-none";
const ADD_BTN =
  "flex items-center gap-1.5 px-[9px] py-2 rounded-lg bg-transparent cursor-pointer shrink-0 " +
  "border border-dashed border-[color-mix(in_srgb,var(--color-content)_18%,transparent)] " +
  "text-[11.5px] text-content/50 hover:text-content " +
  "hover:border-[color-mix(in_srgb,var(--color-content)_30%,transparent)]";
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
  /* La colonna del triage: e' l'ambito in cui il FLIP puo' animare (vedi la
     nota in dragKit). */
  const colonnaRef = useRef(null);
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

  const [draggingTask, setDraggingTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [detailTask, setDetailTask] = useState(null);

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

  /* Che aspetto prende il task nell'anteprima, mentre sta sopra un bersaglio.
     Deve dire la stessa cosa che `onDrop` scrivera' davvero, altrimenti si vede
     una cosa e ne succede un'altra al rilascio. */
  const patchPerBersaglio = useCallback(
    ({ colId, groupId }) => {
      if (groupId) {
        /* Nessuna anteprima sui gruppi quando l'ordine e' calcolato: spostare
           la riga nell'elenco non dice dove finira', perche' l'ordinamento la
           rimette dove vuole lui, e la ri-impaginazione a ogni pixel e' il
           difetto per cui trascinando si muoveva tutto. Con l'ordine manuale
           invece la posizione conta, e vederla in anteprima serve. */
        if (ordinamento !== "manuale") return null;
        const progetto = alia.projects.find((p) => p.id === groupId) ?? null;
        return { project: progetto, milestone: null, inbox: false };
      }
      if (colId === "none") return { inbox: true };
      return {};
    },
    [alia.projects, ordinamento],
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
  const aggiungi = useCallback(async () => {
    const esito = await alia.creaTask({ title: "Nuova task" });
    if (esito?.esito === "applicato" && esito.idTask) setEditingTask(esito.idTask);
  }, [alia]);

  const { start } = useBoardDrag({
    boardRef,
    tasks,
    setTasks,
    onDragChange: setDraggingTask,
    onOpen: setDetailTask,
    onEditTitle: setEditingTask,
    onDrop,
    patchPerBersaglio,
    flipRef: colonnaRef,
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
      {/* ═══ intestazione di quadro — appare col layout della Full Inbox ═══ */}
      <div
        className="absolute left-5 right-5 top-[18px] h-[31px] flex items-center gap-3 z-[6]"
        style={{
          opacity: m.fullHeaderOpacity,
          transition: m.fadeTransition,
          pointerEvents: m.committed ? "auto" : "none",
        }}
      >
        <span className="text-mini tracking-[0.14em] uppercase text-accent">Inbox</span>
      </div>

      {/* ═══ pannello contenuto della vista divisa ═══ */}
      <div
        className="absolute flex overflow-hidden bg-surface rounded-[14px] shadow-elev-md z-[1]"
        style={{
          left: m.content.left,
          top: 16,
          right: 16,
          bottom: 16,
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
          onRowPointerDown={start}
          onOrdinamento={setOrdinamento}
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
        ref={colonnaRef}
        data-drop-col="none"
        /* La cromatura (fondo, bordo, raggio) sta sulla colonna stessa, non su
           uno strato sovrapposto: un tempo era un div a `-inset-px`, cioè 1px
           fuori dal padding box, e `overflow-hidden` lo ritagliava — il bordo
           risultava tagliato. Il bordo di 1px è sempre presente e cambia solo
           colore, così rientra il contenuto come negli artboard anche a p=0. */
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
        {/* Intestazione: le due varianti sono sovrapposte nello stesso spazio,
            che si stringe da 91px a 41px, così le card scorrono verso l'alto
            insieme al resto del movimento invece di saltare alla conferma. */}
        <div className="relative shrink-0 overflow-hidden" style={{ height: m.none.headerSlot }}>
          <div
            className="absolute inset-x-0 top-0 px-5 pt-5 pb-3 flex flex-col gap-2.5"
            style={{ opacity: m.splitHeaderOpacity, transition: m.fadeTransition }}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-mini tracking-[0.14em] uppercase text-accent">Inbox</span>
            </div>
            <button
              type="button"
              onClick={aggiungi}
              className={
                "flex items-center w-full h-8 px-2.5 gap-2 rounded-lg bg-transparent cursor-pointer " +
                "border border-dashed border-divider text-content/65 text-[12.5px] " +
                "hover:border-accent hover:text-accent"
              }
            >
              <Plus size={13} />
              Aggiungi task
              <span className="ml-auto text-[10.5px] opacity-75">⌘K</span>
            </button>
          </div>

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
          {/* Il pulsante appartiene alla Full Inbox: nella vista divisa non c'e.
              Sfumarlo con la sola opacita non bastava — restava in flusso, alto
              32px, e sotto l'ultima card si vedevano 32+8 di gap+16 di padding
              = 56px di vuoto inspiegabile in fondo alla colonna. Ora la sua
              altezza segue il movimento (0 -> 32) e a riposo, a p=0, non viene
              montato affatto: cosi non lascia nemmeno il gap del flex. */}
          {m.fullHeaderOpacity > 0 ? (
            <div
              className="shrink-0 overflow-hidden flex"
              style={{ height: 32 * m.fullHeaderOpacity }}
            >
              <button
                type="button"
                onClick={aggiungi}
                className={ADD_BTN}
                style={{ opacity: m.fullHeaderOpacity, transition: m.fadeTransition }}
              >
                <Plus size={12} />
                Aggiungi
              </button>
            </div>
          ) : null}
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

      {/* ═══ dettaglio task — DEF_Task Detail ═══ */}
      {detail ? <TaskDetailModal task={detail} onClose={() => setDetailTask(null)} /> : null}
    </div>
  );
}
