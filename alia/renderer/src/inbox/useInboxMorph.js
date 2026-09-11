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

/* Larghezza di riposo della colonna nella vista divisa, in pixel e non in
   percentuale: sotto i ~270px le card cominciano a mandare a capo i titoli
   normali (non solo quelli patologici senza spazi), e la colonna si legge male.
   Resta una *base*, non un pavimento: la maniglia puo ancora stringere fino a
   MIN_PCT, perche restringerla e un gesto voluto dall'utente. Convertita in
   percentuale alla prima misura reale del quadro, cosi la base e giusta a
   qualunque larghezza di finestra invece di dipendere dagli artboard. */
export const SPLIT_BASE_W = 270;

export const MIN_PCT = 12;
export const SLIDE_START = 50; // inizio fase B
export const DOCK_PCT = 70; // inizio fase C

/* Geometria finale, ricavata dalla dimensione reale del quadro e non da
   costanti: nell'app riempie la finestra, negli artboard stava in 1180×760.

   Le misure fisse vengono da DEF_Inbox max e restano tali a ogni larghezza:
   intestazione di quadro alta 31, distanza fra colonne 14, colonna "Da
   smistare" larga 300. Il margine del quadro e il distacco dell'intestazione
   **non** vengono più dall'artboard: vedi la nota su `FRAME`.

   Conseguenza da tenere presente: con il margine a 12 i numeri non coincidono
   più con quelli misurati su DEF_Inbox max (origini 20/826, colonna 860/300,
   colonne alte 675 a 1180×760). La formula è la stessa, le costanti no. */
/* Il quadro: il margine dell'applicazione e la riga di intestazione.

   **Esportato**, perché non lo usa solo questo file: l'intestazione di quadro è
   un elemento del quadro e non delle colonne, quindi vive nel componente, e
   finora questi stessi numeri erano scritti due volte — in pixel qui, in classi
   Tailwind là (`left-5 right-5 top-[18px]`). Bastava cambiarne uno per far
   scollare la testata dalle colonne. Ora c'è un posto solo.

   **Ridotto il 2026-09-10 su richiesta: 20 → 12**, uguale su tutti i lati
   (prima era 20 ai fianchi, 18 in alto, 22 in basso). Con l'intestazione fuori
   dai contenitori il margine del quadro si sommava a quello della colonna e a
   quello del contenuto, e tre respiri in fila fanno un vuoto. Scostamento
   dichiarato da DEF_Inbox max, che li misura a 20/18.

   Il distacco fra intestazione e colonne e' lo stesso margine, 12, e la fascia
   dell'intestazione e' alta quanto il suo testo: le colonne cominciano a 36. */
const FRAME_PAD = 12;

/* La compensazione ottica, applicata una volta sola a tutta la riga
   dell'intestazione. Quello che deve distare `pad` dal bordo e' il **contorno
   visibile**, non il riquadro che lo contiene, e i due elementi della riga
   rientrano del loro dentro il riquadro all'incirca uguale: l'icona e' 15 dentro
   un bottone di 24 (4.5), le maiuscole di 11px cominciano circa 4.5 sotto il
   bordo alto della riga di testo alta 17. Stesso scarto, stesso recupero. */
const OTTICA = 5;

/* Altezza della riga di intestazione: quella del **testo**, 17.

   Era 31, e non era una misura di questa interfaccia: veniva da DEF_Inbox max,
   dove il margine di quadro era 18. Con il margine a 12 quella fascia da sola
   valeva piu' di due margini, e apriva un vuoto fra la scritta "Inbox" e tutto
   il resto — mentre in basso, a sinistra e a destra il respiro era 12. Ora la
   riga e' alta quanto il suo testo, e il ritmo verticale e' uno solo:

     12  bordo alto  →  scritta
     12  scritta     →  colonne
     12  colonne     →  bordo basso

   L'ingranaggio e' piu' alto del testo e sborda di 3.5 sopra e sotto: e'
   voluto, e' un'icona centrata sulla riga, non un secondo blocco. */
const HEADER_LINE = 17;

export const FRAME = {
  pad: FRAME_PAD,
  headerTop: FRAME_PAD - OTTICA,
  headerH: HEADER_LINE,
  colTop: FRAME_PAD - OTTICA + HEADER_LINE + FRAME_PAD,
};

const PAD_X = FRAME.pad;
const COL_TOP = FRAME.colTop;
const BOARD_BOTTOM = FRAME.pad;
/* Distanza fra le due colonne nella Full Inbox. Resta 14: è lo spazio fra due
   contenitori, non un margine del quadro, e i due valori non devono per forza
   coincidere. */
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

/* Geometria della vista divisa.

   **Scostamento deliberato da DEF_Inbox min (2026-09-10).** L'artboard ha la
   colonna Inbox a filo di finestra, senza fondo né bordo, con dentro la scritta
   "Inbox" e il bottone "Aggiungi task", e il contenuto dentro una card di
   superficie. Qui è il contrario, in tre mosse decise nello stesso giro:

     1. **i contenitori sono invertiti** — la colonna è la card, il contenuto è
        appoggiato sul fondo;
     2. **la scritta "Inbox" è uscita dalla colonna** ed è diventata
        l'intestazione di quadro, insieme al badge delle origini nuove e
        all'ingranaggio delle impostazioni;
     3. **"Aggiungi task" non c'è più** nella vista divisa: va ripensato dove
        mettere il gesto di creazione (resta il bottone in fondo alla colonna
        della Full Inbox, che viene da DEF_Inbox max).

   La ragione della prima è di senso: nella Full Inbox la colonna "Da smistare"
   **è** una card di superficie, quindi l'artboard chiedeva che il contenitore
   nascesse dal nulla a metà trascinamento. Invertendo, la colonna è la stessa
   cosa dall'inizio alla fine — che è la premessa di tutto questo componente.

   Le conseguenze sul movimento sono la parte interessante, perché tolgono roba:

     · fondo, bordo e raggio della colonna diventano **costanti** (spariscono
       due `color-mix` per fotogramma);
     · l'intestazione di quadro non si dissolve più: vale per entrambe le
       geometrie, quindi è un elemento solo, sempre acceso;
     · siccome quell'intestazione c'è sempre, le colonne cominciano sotto di lei
       **anche a p=0**: `top` e `height` diventano costanti pure loro.

   Di interpolato restano `left`, `width` e le imbottiture interne. Il resto sta
   fermo, che è il modo migliore per non tremare. */
const SPLIT = {
  /* Nessuna intestazione dentro la colonna a riposo: la scritta è uscita e il
     bottone non c'è più. La testata cresce da 0 a 40.9 mentre compare
     "Da smistare". */
  headerSlot: 0,
  /* 12 e non 16 (ridotto il 2026-09-10): la colonna è una card dentro un quadro
     che ha già il suo margine, e 16 dentro 20 erano due respiri sovrapposti.
     Con il quadro a 12 anche questo scende, così il rapporto fra i due resta
     quello di prima invece di stringersi solo di fuori.
     `listPadTop` esiste perché a riposo la colonna non ha intestazione: prima lo
     spazio sopra la prima card lo faceva lei. */
  listPadX: 12,
  listPadTop: 12,
  listPadBottom: 12,
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
  /* La colonna Inbox chiusa, nella sola vista divisa.

     Non e' un terzo punto del morph: il morph interpola fra vista divisa e Full
     Inbox, e il collasso e' un'altra cosa — "adesso non mi serve, dammi tutto
     lo spazio". Quindi vive accanto a `pct`, non dentro.

     Nella Full Inbox non ha senso e viene ignorato: li' la colonna **e'** la
     schermata, e chiuderla vorrebbe dire chiudere la vista. */
  const [collassata, setCollassata] = useState(false);
  const alternaCollasso = useCallback(() => setCollassata((c) => !c), []);

  const [size, setSize] = useState({ w: 1180, h: 760 });
  const baseApplicata = useRef(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) =>
        Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height },
      );

      /* Solo alla prima misura: `initialPct` e una percentuale, quindi da sola
         darebbe una colonna piu stretta o piu larga a seconda della finestra.
         Qui la si riscrive una volta perche il riposo valga SPLIT_BASE_W. Dopo
         non si tocca piu: i ridimensionamenti successivi mantengono la
         percentuale, come prima. */
      if (!baseApplicata.current && width > 0) {
        baseApplicata.current = true;
        const pctBase = clamp((SPLIT_BASE_W / width) * 100, MIN_PCT, SLIDE_START);
        setState((s) =>
          s.dragging || s.committed || s.pct !== initialPct
            ? s
            : { ...s, pct: pctBase, lastSplitPct: pctBase },
        );
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [initialPct]);

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

  /* Tirare la maniglia mentre la colonna e' chiusa vorrebbe dire trascinare il
     bordo di qualcosa che non si vede: il gesto la riapre e poi la muove. */
  const onHandleDownConRiapertura = useCallback(
    (e) => {
      setCollassata(false);
      onHandleDown(e);
    },
    [onHandleDown],
  );

  const docked = committed || pct >= DOCK_PCT;
  const p = docked ? 1 : clamp((pct - SLIDE_START) / (DOCK_PCT - SLIDE_START), 0, 1);

  /* — posizione orizzontale della colonna — */
  let noneLeft;
  let noneW;
  /* Chiusa: larghezza zero, e il pannello destro parte dal margine di quadro.
     Le transizioni su `left` e `width` ci sono gia', quindi l'apertura e la
     chiusura si animano senza aggiungere niente. */
  const chiusa = collassata && !docked;
  if (chiusa) {
    noneLeft = PAD_X;
    noneW = 0;
  } else if (docked) {
    noneLeft = FULL.noneLeft;
    noneW = FULL.noneW;
  } else if (pct < SLIDE_START) {
    /* Fase A: il bordo **destro** della colonna sta sotto il puntatore, e il
       sinistro è rientrato del margine di quadro perché la colonna adesso è una
       card e non può stare a filo di finestra. Quindi la larghezza è quella di
       prima meno il margine, non quella di prima. */
    noneW = (pct / 100) * size.w - PAD_X;
    noneLeft = PAD_X;
  } else {
    const pointerX = (pct / 100) * size.w;
    /* Stesso sottrarre alla larghezza di partenza della fase B: senza, al
       passaggio fra le due fasi la colonna salterebbe di 16px. */
    noneW = lerp((SLIDE_START / 100) * size.w - PAD_X, FULL.noneW, p);
    noneLeft = pointerX - noneW;
  }

  const transition = (props) => props.map((prop) => `${prop} ${transMs}ms ${EASE}`).join(", ");

  return {
    rootRef,
    onHandleDown: onHandleDownConRiapertura,
    exitFull,
    committed,
    /* Il collasso, per il tasto "Inbox" che lo comanda. `puoCollassare` e'
       falso nella Full Inbox: li' il tasto resta in scena ma spento, perche'
       sparire e ricomparire direbbe che il comando non esiste — e invece
       esiste, solo non qui. */
    chiusa,
    puoCollassare: !docked,
    alternaCollasso,
    dragging,
    /* `p` a 1 significa "layout della Full Inbox"; a 0, vista divisa. */
    p,
    /* Colonna "Da smistare" (in vista divisa: la Small Inbox). */
    none: {
      left: noneLeft,
      width: noneW,
      top: FULL.colTop,
      height: FULL.colH,
      radius: 14,
      headerSlot: lerp(SPLIT.headerSlot, FULL_COL.headerSlot, p),
      listPadX: lerp(SPLIT.listPadX, FULL_COL.listPadX, p),
      listPadTop: lerp(SPLIT.listPadTop, FULL_COL.listPadTop, p),
      listPadBottom: lerp(SPLIT.listPadBottom, FULL_COL.listPadBottom, p),
      listGap: lerp(SPLIT.listGap, FULL_COL.listGap, p),
      /* Costanti, non più interpolate: la colonna è una card di superficie in
         entrambe le geometrie. Restano qui, e non nelle classi del componente,
         perché è questo il posto che descrive la colonna. */
      background: "var(--color-surface)",
      borderColor: "var(--color-divider)",
      /* Chiusa vuol dire **sparita**, non larga zero: una card di larghezza
         nulla lascia comunque i suoi due bordi da 1px, cioe' un filo verticale
         sul margine sinistro. Due pixel che non si sa cosa siano sono peggio di
         niente. */
      opacity: chiusa ? 0 : 1,
      transition: transition(["left", "width", "opacity"]),
    },
    /* Colonna origini: geometria finale, traslata fuori quadro e tirata dentro
       dal bordo sinistro della colonna. */
    origins: {
      left: FULL.originsLeft,
      width: FULL.originsW,
      top: FULL.colTop,
      height: FULL.colH,
      /* Il termine in `PAD_X` esiste da quando la colonna è rientrata di
         20px dal bordo: la traslazione tiene il bordo **destro** delle origini
         a `COL_GAP` dal bordo sinistro della colonna, quindi rientrando la
         colonna le origini si portavano dietro, e a riposo ne restavano 2px
         visibili sul bordo sinistro del quadro — una scheggia azzurra. Escono
         di altrettanto, e il recupero si chiude a p=1 dove il termine si
         annulla e la distanza torna esattamente quella dell'artboard. */
      x: noneLeft - FULL.noneLeft - PAD_X * (1 - p),
      transition: transition(["transform"]),
    },
    /* Pannello destro della vista divisa: parte dal bordo della colonna e si
       spegne mentre le origini entrano. */
    content: {
      left: chiusa ? PAD_X : noneLeft + noneW,
      /* Il rientro di 18px e' lo **stacco dalla colonna**, non un margine del
         pannello: a colonna chiusa non ha piu' niente da cui staccarsi e
         resterebbe un vuoto che non separa niente — il margine di quadro,
         quello si', ce l'ha gia' `left`. */
      padSinistra: chiusa ? 0 : 18,
      opacity: 1 - p,
      transition: transition(["left", "opacity"]),
    },
    handle: {
      left: chiusa ? PAD_X : noneLeft + noneW,
      /* Sparisce con la colonna, ed e' una scelta dichiarata: la maniglia e'
         l'unico modo di arrivare alla Full Inbox, quindi a colonna chiusa
         quella vista non e' raggiungibile. Va bene — chi chiude la colonna sta
         dicendo che adesso vuole solo il contenuto, e lasciare in scena il
         bordo di una colonna che non c'e' sarebbe un comando che afferra il
         vuoto. Si riapre dalla scritta "Inbox", che e' sempre li'. */
      opacity: chiusa ? 0 : 1 - p,
      attiva: !chiusa && p !== 1,
      transition: transition(["left", "opacity"]),
    },
    fullHeaderOpacity: p,
    fadeTransition: transition(["opacity"]),
  };
}
