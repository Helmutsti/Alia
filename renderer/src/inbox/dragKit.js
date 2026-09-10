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
   frame dopo il commit il layout può non essere ancora assestato. */
export function useFlip(containerRef, attr = "data-card") {
  const pending = useRef(null);

  const capture = useCallback(() => {
    const host = containerRef.current;
    if (!host) return;
    const map = {};
    host.querySelectorAll(`[${attr}]`).forEach((el) => {
      const r = el.getBoundingClientRect();
      map[el.getAttribute(attr)] = { x: r.left, y: r.top };
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
        const was = snapshot[el.getAttribute(attr)];
        if (!was) return;
        const r = el.getBoundingClientRect();
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
  /* Dove il FLIP ha diritto di animare. Volutamente piu' piccolo della board:
     vedi la nota sotto. */
  flipRef,
}) {
  /* Il FLIP e' ristretto alla colonna del triage, non a tutta la board.

     Non e' un'ottimizzazione, e' una correzione: da quando anche le righe della
     vista Lista portano `data-task` — serve al trascinamento — un FLIP sulla
     board intera le includeva tutte. Ogni anteprima rimescolava l'array dei
     task, il pannello si ri-impaginava, e il FLIP animava quaranta righe verso
     le loro posizioni precedenti: appena si iniziava a trascinare, tutto si
     muoveva in ogni direzione. Nella colonna il riordino c'e' per davvero ed e'
     la' che l'animazione serve; nel pannello no. */
  const capture = useFlip(flipRef ?? boardRef, "data-task");
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
        document.querySelectorAll("[data-drop-col]").forEach((el) => {
          el.classList.toggle("hit", !!info && el.getAttribute("data-drop-col") === info.colId);
        });
        document.querySelectorAll("[data-drop-group]").forEach((el) => {
          el.classList.toggle("hit", !!info && el.getAttribute("data-drop-group") === info.groupId);
        });

        /* Card a sinistra, row a destra: il clone prende la larghezza del
           bersaglio passando da una parte all'altra. È il segnale che il
           rilascio è valido, oltre a essere la forma giusta — una card è un
           oggetto autonomo, una row un elemento di un elenco (DESIGN_LOCK).
           Cambia la larghezza, non l'impaginazione interna: il clone resta una
           copia del DOM di partenza. */
        const larghezza = info?.el ? info.el.clientWidth - MARGINE_BERSAGLIO : rect.width;
        if (Math.abs(larghezza - lastWidth) > 1) {
          lastWidth = larghezza;
          clone.style.width = `${larghezza}px`;
        }

        if (
          info &&
          (info.colId !== lastColId || info.groupId !== lastGroupId || info.beforeId !== lastBeforeId)
        ) {
          lastColId = info.colId;
          lastGroupId = info.groupId;
          lastBeforeId = info.beforeId;

          /* `null` = nessuna anteprima. Serve per i bersagli dove spostare il
             task nella lista non aiuta a capire dove finira' — un elenco
             ordinato per scadenza lo rimetterebbe subito altrove — e dove
             l'anteprima costerebbe una ri-impaginazione a ogni pixel. Li' il
             bersaglio lo dicono il contorno acceso e la larghezza del clone. */
          const patch = patchPerBersaglio(info);
          if (patch) reorder(id, patch, info.beforeId);
        }
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document
          .querySelectorAll("[data-drop-col], [data-drop-group]")
          .forEach((el) => el.classList.remove("hit"));
        clone?.remove();
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
          tasks: tasksRef.current,
        });
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      e.preventDefault();
    },
    [reorder, onDragChange, onOpen, onEditTitle, onDrop, patchPerBersaglio],
  );

  return { start, reorder };
}
