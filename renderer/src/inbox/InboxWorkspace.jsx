import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowLeft, MailBox, Plus } from "../components/icons.jsx";
import { ContentPane } from "./ContentPane.jsx";
import { InboxCard } from "./InboxCard.jsx";
import { OriginCard } from "./OriginCard.jsx";
import { useBoardDrag } from "./dragKit.js";
import { useInboxMorph } from "./useInboxMorph.js";
import { PRIORITY_COLOR, PROJECT_NAMES, TASKS, pendingOf, unassignedOf } from "./data.js";
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

  const [tasks, setTasks] = useState(() => [...TASKS]);
  const [draggingTask, setDraggingTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [detailTask, setDetailTask] = useState(null);

  const commitTitle = useCallback((id, value) => {
    if (value != null) {
      const next = String(value).trim();
      if (next) setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, title: next } : t)));
    }
    setEditingTask(null);
  }, []);

  const { start, reorder } = useBoardDrag({
    boardRef,
    tasks,
    setTasks,
    onDragChange: setDraggingTask,
    onOpen: setDetailTask,
    onEditTitle: setEditingTask,
  });

  const pending = useMemo(() => pendingOf(tasks), [tasks]);
  const unassigned = useMemo(() => unassignedOf(tasks), [tasks]);
  const detail = tasks.find((t) => t.id === detailTask);

  return (
    <div
      ref={(el) => {
        m.rootRef.current = el;
        boardRef.current = el;
      }}
      data-board
      className={
        "relative w-[1180px] h-[760px] overflow-hidden rounded-[14px] bg-bg text-content " +
        `font-sans shadow-elev-md ${m.dragging ? "cursor-col-resize select-none" : ""}`
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
        <ContentPane />
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
              onConfirm={() => reorder(task.id, null, null)}
              onDelete={() => setTasks((ts) => ts.filter((t) => t.id !== task.id))}
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
            <span className="ml-auto text-mini text-content/55">{unassigned.length}</span>
          </div>
        </div>

        {/* Le card: sono le stesse dall'inizio alla fine del movimento. */}
        <div
          className="relative flex-1 min-h-0 overflow-y-auto flex flex-col"
          style={{
            paddingLeft: m.none.listPadX,
            paddingRight: m.none.listPadX,
            paddingTop: m.none.listPadTop,
            paddingBottom: m.none.listPadBottom,
            gap: m.none.listGap,
          }}
        >
          {unassigned.map((task) => (
            <InboxCard
              key={task.id}
              id={task.id}
              idAttr="data-task"
              title={task.title}
              priorityColor={PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.Nessuna}
              editing={editingTask === task.id}
              dragging={draggingTask === task.id}
              onTitleClick={() => setEditingTask(task.id)}
              onCommit={(v) => commitTitle(task.id, v)}
              onPointerDown={(e) => start(task.id, e)}
            />
          ))}
          <button
            type="button"
            className={ADD_BTN}
            style={{ opacity: m.fullHeaderOpacity, transition: m.fadeTransition }}
          >
            <Plus size={12} />
            Aggiungi
          </button>
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

      {/* ═══ dettaglio task ═══ */}
      {detail ? (
        <div
          onClick={() => setDetailTask(null)}
          className={
            "absolute inset-0 z-[90] box-border flex items-center justify-center p-7 " +
            "bg-[color-mix(in_srgb,#000_52%,transparent)] backdrop-blur-[7px]"
          }
        >
          <div onClick={(e) => e.stopPropagation()} className="w-[640px] max-w-full max-h-full flex">
            {/* Il corpo del dettaglio è DEF_Task Detail, non ancora ricostruito:
                qui c'è solo il contenitore, con la geometria dell'artboard. */}
            <div className="w-full rounded-[14px] bg-surface shadow-elev-lg p-5 max-h-[690px] overflow-auto">
              <p className="text-mini tracking-[0.14em] uppercase text-accent m-0">Task Detail</p>
              <h4 className="mt-2 mb-1 text-lg">{detail.title}</h4>
              <p className="text-meta text-content/55 m-0">
                Progetto: {PROJECT_NAMES[detail.project] ?? "Nessuno"} · Priorità:{" "}
                {detail.priority || "Nessuna"}
              </p>
              <p className="text-meta text-content/40 mt-4 mb-0">
                Segnaposto: da ricostruire da DEF_Task Detail.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
