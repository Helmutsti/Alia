import { useCallback, useLayoutEffect, useRef } from "react";

/* Trascinamento e riordino, trascritti da DEF_Inbox min / DEF_Inbox max.
   Le costanti (durate, easing, scale e rotazione del clone, soglia dei 4px)
   vengono dagli artboard: cambiarle cambia il design. */

export const FLIP_DURATION = 200;

/* Quanto il clone resta piu' stretto del contenitore che lo ospitera': i due
   pixel del bordo piu' un filo d'aria, cosi' non sembra incastrato nei lati. */
const MARGINE_BERSAGLIO = 4;
export const FLIP_EASING = "cubic-bezier(.2,.8,.2,1)";

/* FLIP: si fotografano le posizioni prima del riordino, si rimette ogni
   elemento dove stava e lo si lascia tornare al suo posto. Negli artboard il
   retry con requestAnimationFrame arriva fino a 20 tentativi, perché al primo
   frame dopo il commit il layout può non essere ancora assestato.

   La fotografia e' indicizzata **per elemento** (una WeakMap), non per valore
   dell'attributo. Non e' un dettaglio di stile: lo stesso task puo' comparire
   due volte nel DOM — come card nella colonna del triage e come riga nella
   vista Lista, se e' in triage — e con un indice per id sopravviveva una sola
   posizione delle due. Entrambi gli elementi venivano poi animati da
   quell'unica origine: la card spinta verso il posto della riga e viceversa,
   con elementi che volavano da una parte all'altra della schermata. Era il
   difetto per cui, trascinando, "si muoveva tutto in tutte le direzioni".

   Con l'indice per elemento ognuno parte da dove stava lui. Un elemento nato
   fra la fotografia e l'animazione non ha voce nella mappa e non viene
   animato, che e' il comportamento giusto: non aveva una posizione da cui
   venire. */
/* Misura un elemento **fermo**.

   `getBoundingClientRect` su un elemento che sta animando restituisce il
   fotogramma corrente, non la posizione a cui l'elemento appartiene. Misurare
   cosi' e' il difetto per cui, trascinando fra le righe, tutto si muoveva in
   ogni direzione: ogni fotografia registrava posizioni a mezz'aria, e il FLIP
   successivo animava da origini sbagliate, ogni volta diverse. Portare a
   termine le animazioni in corso prima di misurare rende la fotografia vera.

   Si vede solo quando i cambi sono frequenti e gli elementi molti: nella
   colonna, dove il riordino scatta attraversando il centro di una card, il
   difetto restava sotto la soglia della percezione. */
function misuraFerma(el) {
  el.getAnimations?.().forEach((a) => {
    try {
      a.finish();
    } catch {
      /* Un'animazione senza fine non si puo' concludere: non ne abbiamo, ma
         `finish()` lancia in quel caso e non deve fermare la misura. */
    }
  });
  return el.getBoundingClientRect();
}

export function useFlip(containerRef, attr = "data-card") {
  const pending = useRef(null);

  const capture = useCallback(() => {
    const host = containerRef.current;
    if (!host) return;
    const map = new WeakMap();
    host.querySelectorAll(`[${attr}]`).forEach((el) => {
      const r = misuraFerma(el);
      map.set(el, { x: r.left, y: r.top });
    });
    pending.current = map;
  }, [containerRef, attr]);

  useLayoutEffect(() => {
    const snapshot = pending.current;
    if (!snapshot) return;
    pending.current = null;

    let attempts = 0;
    const run = () => {
      const host = containerRef.current;
      if (!host) return;
      const jobs = [];
      host.querySelectorAll(`[${attr}]`).forEach((el) => {
        const was = snapshot.get(el);
        if (!was) return;
        const r = misuraFerma(el);
        const dx = was.x - r.left;
        const dy = was.y - r.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        jobs.push({ el, dx, dy });
      });
      if (!jobs.length) {
        if (attempts < 20) {
          attempts++;
          requestAnimationFrame(run);
        }
        return;
      }
      jobs.forEach(({ el, dx, dy }) => {
        if (typeof el.animate !== "function") return;
        el.animate(
          [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "translate(0,0)" }],
          { duration: FLIP_DURATION, easing: FLIP_EASING },
        );
      });
    };
    requestAnimationFrame(run);
  });

  return capture;
}

/* Clone che segue il puntatore. `transformSuffix` e `shadow` sono le due cose
   che cambiano fra i due artboard:
     Inbox min → scale(1.02),                 --shadow-drag,    opacity .96
     Inbox max → rotate(1.2deg) scale(1.03),  --shadow-drag-lg, opacity .97 */
function makeClone(el, transformSuffix, shadowVar, opacity) {
  const rect = el.getBoundingClientRect();
  const clone = el.cloneNode(true);
  clone.setAttribute(
    "style",
    `${el.getAttribute("style") || ""};position:fixed;left:0;top:0;width:${rect.width}px;` +
      `margin:0;pointer-events:none;z-index:9999;` +
      `transform:translate(${rect.left}px,${rect.top}px) ${transformSuffix};` +
      `box-shadow:var(${shadowVar});opacity:${opacity};transition:width 140ms ${FLIP_EASING}`,
  );
  document.body.appendChild(clone);
  return { clone, rect };
}

/* Trascinamento delle card — DEF_Inbox max, e ora anche la colonna della vista
   divisa, che è la stessa colonna.
   Differenze rispetto alla lista: il clone nasce solo dopo 4px di movimento
   (così un click resta un click), la colonna "origin" non è un bersaglio, la
   colonna sotto il puntatore prende la classe `hit`, e al rilascio senza
   movimento si apre il dettaglio — o la rinomina, se il puntatore era sul
   titolo. */
export function useBoardDrag({
  boardRef,
  tasks,
  setTasks,
  onDragChange,
  onOpen,
  onEditTitle,
  onDrop,
  /* Come deve *apparire* il task mentre sta sopra un bersaglio, oppure `null`
     per dire "non fare nessuna anteprima". Il motore non sa cosa significhi
     rilasciare da qualche parte — sono regole di prodotto — quindi lo chiede a
     chi lo usa. */
  patchPerBersaglio = () => ({}),
  /* Chi ha bisogno di sapere su quale bersaglio sta il puntatore, per farsi
     l'anteprima da solo: la vista Lista apre il varco fra le righe cosi', senza
     passare dal riordino dell'array (vedi la nota in ContentPane). `null`
     quando il puntatore esce da ogni bersaglio. */
  onAnteprima,
}) {
  /* Il FLIP copre tutta la board: le card della colonna e le righe della lista,
     che hanno entrambe `data-task`. Cosi' anche le righe scorrono con
     un'animazione per fare spazio, invece di saltare.

     Questo e' possibile solo perche' l'anteprima nel pannello non passa piu'
     dal riordino dell'array globale: quando lo faceva, ogni pixel di movimento
     ri-impaginava tutti i gruppi e il FLIP animava quaranta righe verso le loro
     posizioni precedenti — appena si iniziava a trascinare, tutto si muoveva in
     ogni direzione. Ora l'unico spostamento e' quello del varco. */
  const capture = useFlip(boardRef, "data-task");
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const reorder = useCallback(
    (id, patch, beforeId) => {
      const current = tasksRef.current;
      const idx = current.findIndex((t) => t.id === id);
      if (idx === -1) return;

      capture();
      const next = current.slice();
      const [task] = next.splice(idx, 1);
      /* Anteprima ottimistica: il task si sposta e prende l'aspetto che avrà
         dopo il rilascio (progetto, triage), così lo si vede entrare nel
         gruppo mentre lo si trascina. Vive nello stato locale; la scrittura
         vera avviene una volta sola in `onDrop`. */
      const moved = { ...task, ...patch };
      let insertAt = next.length;
      if (beforeId != null) {
        const bIdx = next.findIndex((t) => String(t.id) === String(beforeId));
        if (bIdx !== -1) insertAt = bIdx;
      }
      next.splice(insertAt, 0, moved);
      setTasks(next);
    },
    [capture, setTasks],
  );

  const start = useCallback(
    (id, e) => {
      if (e.button !== 0) return;
      if (e.target.closest?.("input,textarea,button")) return;
      const wrapper = e.currentTarget.closest("[data-task]");
      if (!wrapper) return;

      const onTitle = !!e.target.closest?.("[data-title]");
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = wrapper.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      const TRANSFORM = "rotate(1.2deg) scale(1.03)";

      let clone = null;
      let moved = false;
      let lastColId = null;
      let lastGroupId = null;
      let lastBeforeId = "none-yet";
      let lastMinuti = null;
      let lastWidth = rect.width;

      /* Dentro un contenitore, prima di quale elemento cadrebbe il task: si
         confronta col centro di ognuno. `null` = in fondo. */
      const primaDi = (host, ev) => {
        const altri = [...host.querySelectorAll("[data-task]")].filter(
          (el) => el.getAttribute("data-task") !== String(id),
        );
        for (const el of altri) {
          const cr = el.getBoundingClientRect();
          if (ev.clientY < cr.top + cr.height / 2) return el.getAttribute("data-task");
        }
        return null;
      };

      /* Due famiglie di bersagli: le colonne della board (`data-drop-col`) e i
         gruppi della vista Lista (`data-drop-group`).

         I gruppi hanno la precedenza perché stanno *dentro* il pannello
         contenuto, che a sua volta sta dentro la board: cercando le colonne per
         prime, un rilascio su un gruppo verrebbe letto come rilascio sulla
         colonna che lo contiene.

         Quali gruppi siano bersagli non lo decide il motore: lo dichiara il
         DOM, mettendo `data-drop-group` solo dove il rilascio ha un significato
         (oggi il raggruppamento per progetto e nient'altro). Così un
         raggruppamento non assegnabile non produce bersagli, e il rilascio
         viene rifiutato senza che qui ci sia un elenco da tenere aggiornato. */
      const targetInfo = (ev) => {
        const dentro = (r) =>
          ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;

        /* Terza famiglia: la **linea temporale** del Calendario, e sta per
           prima perche' e' la piu' interna di tutte.

           Qui il rilascio non chiede "prima di quale altro elemento" ma "a che
           minuto", quindi al posto di `beforeId` torna `minuti`. Il motore non
           sa cosa sia un calendario e non deve saperlo: legge due numeri che la
           pista dichiara (`data-fascia-da`/`-a`, i minuti al bordo alto e al
           bordo basso) e fa una proporzione. E' geometria, non semantica —
           la stessa cosa che fa gia' con i centri delle righe.

           Il cambio di forma del clone lo decide comunque il calendario: qui il
           clone si nasconde e basta (vedi `move`), perche' un clone e' una
           copia del DOM di partenza e una card non puo' diventare un blocco
           orario allungandosi. Quello che si vede al suo posto e' il fantasma
           che la vista disegna sulla pista. */
        const pista = [...document.querySelectorAll("[data-drop-ora]")]
          .map((el) => ({ id: el.getAttribute("data-drop-ora"), el, r: el.getBoundingClientRect() }))
          .find(({ r }) => dentro(r));
        if (pista) {
          const da = Number(pista.el.getAttribute("data-fascia-da"));
          const a = Number(pista.el.getAttribute("data-fascia-a"));
          const minuti = da + ((ev.clientY - pista.r.top) / pista.r.height) * (a - da);
          return {
            colId: null,
            groupId: `ora:${pista.id}`,
            el: pista.el,
            beforeId: null,
            minuti,
          };
        }

        const gruppo = [...document.querySelectorAll("[data-drop-group]")]
          .map((el) => ({ id: el.getAttribute("data-drop-group"), el, r: el.getBoundingClientRect() }))
          .find(({ r }) => dentro(r));
        if (gruppo) {
          return { colId: null, groupId: gruppo.id, el: gruppo.el, beforeId: primaDi(gruppo.el, ev) };
        }

        const col = [...document.querySelectorAll('[data-drop-col]:not([data-drop-col="origin"])')]
          .map((el) => ({ id: el.getAttribute("data-drop-col"), el, r: el.getBoundingClientRect() }))
          .find(({ r }) => dentro(r));
        if (!col) return null;
        return { colId: col.id, groupId: null, el: col.el, beforeId: primaDi(col.el, ev) };
      };

      const move = (ev) => {
        if (!moved) {
          if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
          moved = true;
          clone = makeClone(wrapper, TRANSFORM, "--shadow-drag-lg", 0.97).clone;
          onDragChange(id);
        }
        clone.style.transform = `translate(${ev.clientX - offX}px,${ev.clientY - offY}px) ${TRANSFORM}`;

        const info = targetInfo(ev);
        if (!info && lastGroupId !== null) {
          lastGroupId = null;
          capture();
          onAnteprima?.(null);
        }
        /* **Nessun bersaglio si illumina piu'** (2026-09-10). Restava solo la
           colonna, con il contorno azzurro di `.fi-col.hit` da DEF_Inbox max;
           adesso non ce l'ha nemmeno lei.

           Il motivo e' lo stesso per cui i gruppi della lista lo avevano perso
           un giro prima: la destinazione la dicono gia' il varco che si apre e
           il clone che cambia larghezza passando da card a riga. Il contorno
           era una terza voce che diceva la stessa cosa, e da quando la colonna
           e' diventata una card di superficie era anche la piu' rumorosa —
           un rettangolo azzurro acceso sul bordo di un contenitore, in una
           schermata che ha un solo accento e lo spende altrove.

           La classe `hit` viene comunque tolta a ogni giro: se ne fosse rimasta
           una appiccicata da una versione precedente, questo la spegne. Un
           disegno migliore per sottolineare la destinazione resta da studiare
           (vedi Rinascita.md, § Interfaccia). */
        document.querySelectorAll("[data-drop-col].hit").forEach((el) => {
          el.classList.remove("hit");
        });

        /* Card a sinistra, row a destra: il clone prende la larghezza del
           bersaglio passando da una parte all'altra. È il segnale che il
           rilascio è valido, oltre a essere la forma giusta — una card è un
           oggetto autonomo, una row un elemento di un elenco (Rinascita.md).
           Cambia la larghezza, non l'impaginazione interna: il clone resta una
           copia del DOM di partenza. */
        /* Sopra la linea temporale il clone sparisce: li' la card diventa un
           blocco orario, e il blocco lo disegna la vista al minuto giusto.
           Due copie della stessa task che si inseguono sarebbero una di
           troppo. */
        clone.style.opacity = info?.minuti != null ? "0" : "0.97";

        const larghezza =
          info?.el && info.minuti == null ? info.el.clientWidth - MARGINE_BERSAGLIO : rect.width;
        if (Math.abs(larghezza - lastWidth) > 1) {
          lastWidth = larghezza;
          clone.style.width = `${larghezza}px`;
        }

        /* Sulla linea il bersaglio non cambia mai — e' sempre la stessa pista
           — ma il *minuto* si muove di continuo: senza questo, il fantasma
           resterebbe inchiodato all'ora d'ingresso. Cinque minuti di soglia
           perche' il rilascio arrotonda comunque al quarto d'ora, e aggiornare
           a ogni pixel sarebbe lavoro speso per un'anteprima che non cambia. */
        const tempoMosso =
          info?.minuti != null && (lastMinuti === null || Math.abs(info.minuti - lastMinuti) >= 5);

        if (
          info &&
          (info.colId !== lastColId ||
            info.groupId !== lastGroupId ||
            info.beforeId !== lastBeforeId ||
            tempoMosso)
        ) {
          lastColId = info.colId;
          lastGroupId = info.groupId;
          lastBeforeId = info.beforeId;
          lastMinuti = info.minuti ?? null;

          /* Due modi di fare l'anteprima, secondo il bersaglio.

             Nella colonna: riordino ottimistico dell'array, che e' anche il
             dato che verra' scritto — la' l'ordine e' manuale per costruzione.

             Nel pannello: `patchPerBersaglio` risponde `null` e l'anteprima la
             costruisce la vista, spostando la riga solo a schermo. L'array non
             si tocca, perche' nella lista l'ordine e' calcolato e rimescolarlo
             non direbbe il vero. `capture()` prima, perche' il FLIP deve avere
             la fotografia delle posizioni di partenza. */
          const patch = patchPerBersaglio(info);
          if (patch) {
            reorder(id, patch, info.beforeId);
          } else {
            capture();
            /* `altezza` e' quella della card presa in mano, misurata alla
               partenza. Serve a chi disegna il varco: nella Lista le righe sono
               tutte alte uguale e una costante basta, ma le card del Kanban no
               — una con la scadenza e' piu' alta di una senza, e un varco di
               altezza inventata farebbe scattare le card sotto al rilascio
               invece di lasciarle dove il varco le aveva messe. */
            onAnteprima?.({
              id,
              groupId: info.groupId,
              beforeId: info.beforeId,
              minuti: info.minuti ?? null,
              altezza: rect.height,
            });
          }
        }
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.querySelectorAll("[data-drop-col]").forEach((el) => el.classList.remove("hit"));
        clone?.remove();
        onAnteprima?.(null);
        if (!moved) {
          if (onTitle) onEditTitle(id);
          else onOpen(id);
          return;
        }
        onDragChange(null);
        /* Il riordino durante il trascinamento è ottimistico: serve alla
           anteprima e vive nello stato locale. La scrittura avviene qui, una
           volta sola, quando il puntatore si stacca — non a ogni pixel. */
        onDrop?.({
          id,
          colId: lastColId,
          groupId: lastGroupId,
          beforeId: lastBeforeId === "none-yet" ? null : lastBeforeId,
          minuti: lastMinuti,
          tasks: tasksRef.current,
        });
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      e.preventDefault();
    },
    [reorder, onDragChange, onOpen, onEditTitle, onDrop, patchPerBersaglio, onAnteprima, capture],
  );

  return { start, reorder };
}
