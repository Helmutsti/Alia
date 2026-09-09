import { useCallback, useEffect, useRef, useState } from "react";

/* Movimento Small Inbox → Full Inbox come scorrimento continuo.

   L'idea: la colonna di sinistra **è** la colonna "Da smistare" che finisce
   a destra. Non si cambia schermata, la colonna si sposta al suo posto
   definitivo e trascinandosi dietro lo spazio fa entrare da sinistra le card
   azzurre delle origini.

   Tre fasi, su un solo trascinamento:

     A   0 → 50%   la colonna si allarga seguendo il puntatore, bordo sinistro
                   fermo a zero (comportamento di sempre)
     B  50 → 70%   la colonna smette di allargarsi: il suo bordo **destro**
                   segue il puntatore e la larghezza si restringe verso i 300px
                   finali, così scorre verso destra; nello spazio liberato a
                   sinistra entrano le origini
     C   ≥ 70%     la colonna si agancia al suo posto finale (860px, 300 di
                   larghezza) con una transizione di 220ms, le origini finiscono
                   di entrare; il rilascio conferma

   La chiave del movimento è che la traslazione delle origini non è un
   parametro a sé: è **legata al bordo sinistro della colonna**
   (`originsX = noneLeft - 860`). Quando la colonna è a zero le origini sono
   esattamente fuori quadro, quando è a 860 sono al loro posto. Così sono
   davvero tirate dentro dallo spostamento, e restano in sincrono anche durante
   l'aggancio dei 220ms, che le muove insieme.

   Interpolazioni legate a `p` (avanzamento della fase B): inserimento
   verticale, cromatura della colonna, dissolvenza incrociata dell'intestazione,
   spegnimento del pannello destro, comparsa dell'intestazione di quadro. */

export const MIN_PCT = 12;
export const SLIDE_START = 50; // inizio fase B
export const DOCK_PCT = 70; // inizio fase C

/* Geometria finale, ricavata dalla dimensione reale del quadro e non da
   costanti: nell'app riempie la finestra, negli artboard stava in 1180×760.

   Le misure fisse vengono da DEF_Inbox max e restano tali a ogni larghezza:
   padding 20 orizzontale e 18 verticale, intestazione di quadro alta 31 con
   14 di distacco (quindi le colonne cominciano a 63), 4 di respiro sotto la
   board, distanza fra colonne 14, colonna "Da smistare" larga 300.

   A 1180×760 questa formula restituisce esattamente i numeri misurati
   sull'artboard: origini 20/826, colonna 860/300, colonne alte 675. */
const PAD_X = 20;
const COL_TOP = 63;
const BOARD_BOTTOM = 22; // 18 di padding + 4 sotto la board
const COL_GAP = 14;
const NONE_W = 300;
/* Sotto questa larghezza le origini diventerebbero più strette delle proprie
   card: il movimento resta, ma smette di stringere. */
const ORIGINS_MIN_W = 320;

function fullGeometry({ w, h }) {
  const noneLeft = Math.max(PAD_X + ORIGINS_MIN_W + COL_GAP, w - PAD_X - NONE_W);
  return {
    colTop: COL_TOP,
    colH: Math.max(120, h - COL_TOP - BOARD_BOTTOM),
    originsLeft: PAD_X,
    originsW: Math.max(ORIGINS_MIN_W, noneLeft - COL_GAP - PAD_X),
    noneLeft,
    noneW: NONE_W,
  };
}

/* Geometria della vista divisa, misurata su DEF_Inbox min. */
const SPLIT = {
  colTop: 0,
  headerSlot: 91, // intestazione "Inbox" + "Aggiungi task"
  listPadX: 16,
  listPadBottom: 16,
  listGap: 8,
};
const FULL_COL = {
  headerSlot: 40.9, // intestazione "Da smistare", misurata sull'artboard
  listPadX: 10,
  listPadTop: 4,
  listPadBottom: 10,
  /* 8px come tutte le altre liste di card (origini, vista Lista, Kanban), non
     i 4px dell'artboard: era l'unica lista con una spaziatura diversa.
     Conseguenza dichiarata: nello stato finale le card della sezione 2 distano
     4px in più di DEF_Inbox max. Coincide col valore della vista divisa,
     quindi durante il movimento la spaziatura non cambia più. */
  listGap: 8,
};

const EASE = "cubic-bezier(.2,.8,.2,1)";
const DOCK_MS = 220;
const EXIT_MS = 280;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, p) => a + (b - a) * p;

export function useInboxMorph(initialPct = 20, startCommitted = false) {
  const rootRef = useRef(null);
  const exitTimer = useRef(null);
  const wasDocked = useRef(false);

  const [state, setState] = useState({
    pct: initialPct,
    lastSplitPct: initialPct,
    committed: startCommitted, // true = Full Inbox confermata
    dragging: false,
    transMs: 0,
  });

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  /* La dimensione del quadro è misurata, non assunta: nell'app riempie la
     finestra e cambia quando la si ridimensiona. I valori iniziali sono quelli
     degli artboard, così il primo fotogramma è già giusto nell'anteprima. */
  const [size, setSize] = useState({ w: 1180, h: 760 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) =>
        Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const FULL = fullGeometry(size);

  const onHandleDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const root = rootRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    wasDocked.current = false;

    const move = (ev) => {
      const raw = clamp(((ev.clientX - rect.left) / rect.width) * 100, MIN_PCT, 100);
      const docked = raw >= DOCK_PCT;
      /* La transizione di 220ms serve solo nell'istante in cui si entra o si
         esce dall'aggancio: nel resto del trascinamento la colonna deve stare
         incollata al puntatore, quindi transMs 0. */
      const transMs = docked !== wasDocked.current ? DOCK_MS : 0;
      wasDocked.current = docked;
      setState((s) => ({ ...s, pct: raw, dragging: true, transMs }));
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setState((s) => {
        if (s.pct >= DOCK_PCT) {
          return { ...s, committed: true, dragging: false, transMs: 0 };
        }
        /* Rilascio a metà fase B: non è uno stato di riposo, quindi il
           movimento si riavvolge fino alla fine della fase A (50%), che è la
           larghezza più vicina in cui la vista divisa è intera. */
        const back = Math.min(s.pct, SLIDE_START);
        return { ...s, pct: back, lastSplitPct: back, dragging: false, transMs: DOCK_MS };
      });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  }, []);

  const exitFull = useCallback(() => {
    setState((s) => ({
      ...s,
      committed: false,
      pct: s.lastSplitPct || 20,
      transMs: EXIT_MS,
    }));
    exitTimer.current = setTimeout(() => setState((s) => ({ ...s, transMs: 0 })), EXIT_MS + 20);
  }, []);

  const { pct, committed, dragging, transMs } = state;

  const docked = committed || pct >= DOCK_PCT;
  const p = docked ? 1 : clamp((pct - SLIDE_START) / (DOCK_PCT - SLIDE_START), 0, 1);

  /* — posizione orizzontale della colonna — */
  let noneLeft;
  let noneW;
  if (docked) {
    noneLeft = FULL.noneLeft;
    noneW = FULL.noneW;
  } else if (pct < SLIDE_START) {
    noneW = (pct / 100) * size.w;
    noneLeft = 0;
  } else {
    const pointerX = (pct / 100) * size.w;
    noneW = lerp((SLIDE_START / 100) * size.w, FULL.noneW, p);
    noneLeft = pointerX - noneW;
  }

  const transition = (props) => props.map((prop) => `${prop} ${transMs}ms ${EASE}`).join(", ");

  return {
    rootRef,
    onHandleDown,
    exitFull,
    committed,
    dragging,
    /* `p` a 1 significa "layout della Full Inbox"; a 0, vista divisa. */
    p,
    /* Colonna "Da smistare" (in vista divisa: la Small Inbox). */
    none: {
      left: noneLeft,
      width: noneW,
      top: lerp(SPLIT.colTop, FULL.colTop, p),
      height: lerp(size.h, FULL.colH, p),
      radius: lerp(0, 14, p),
      headerSlot: lerp(SPLIT.headerSlot, FULL_COL.headerSlot, p),
      listPadX: lerp(SPLIT.listPadX, FULL_COL.listPadX, p),
      listPadTop: lerp(0, FULL_COL.listPadTop, p),
      listPadBottom: lerp(SPLIT.listPadBottom, FULL_COL.listPadBottom, p),
      listGap: lerp(SPLIT.listGap, FULL_COL.listGap, p),
      /* Fondo e bordo della colonna finale, portati da trasparente al loro
         valore. Stanno sulla colonna e non su uno strato sovrapposto, che
         `overflow-hidden` ritaglierebbe sul bordo. */
      background: `color-mix(in srgb, var(--color-surface) ${(p * 100).toFixed(1)}%, transparent)`,
      borderColor: `color-mix(in srgb, var(--color-divider) ${(p * 100).toFixed(1)}%, transparent)`,
      transition: transition([
        "left",
        "width",
        "top",
        "height",
        "background-color",
        "border-color",
        "border-radius",
      ]),
    },
    /* Colonna origini: geometria finale, traslata fuori quadro e tirata dentro
       dal bordo sinistro della colonna. */
    origins: {
      left: FULL.originsLeft,
      width: FULL.originsW,
      top: lerp(SPLIT.colTop, FULL.colTop, p),
      height: lerp(size.h, FULL.colH, p),
      x: noneLeft - FULL.noneLeft,
      transition: transition(["transform", "top", "height"]),
    },
    /* Pannello destro della vista divisa: parte dal bordo della colonna e si
       spegne mentre le origini entrano. */
    content: {
      left: noneLeft + noneW,
      opacity: 1 - p,
      transition: transition(["left", "opacity"]),
    },
    handle: {
      left: noneLeft + noneW,
      opacity: 1 - p,
      transition: transition(["left", "opacity"]),
    },
    splitHeaderOpacity: 1 - p,
    fullHeaderOpacity: p,
    fadeTransition: transition(["opacity"]),
  };
}
