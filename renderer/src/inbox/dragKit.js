import { useCallback, useLayoutEffect, useRef } from "react";

/* Trascinamento e riordino, trascritti da DEF_Inbox min / DEF_Inbox max.
   Le costanti (durate, easing, scale e rotazione del clone, soglia dei 4px)
   vengono dagli artboard: cambiarle cambia il design. */

export const FLIP_DURATION = 200;
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
      `box-shadow:var(${shadowVar});opacity:${opacity}`,
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
export function useBoardDrag({ boardRef, tasks, setTasks, onDragChange, onOpen, onEditTitle }) {
  const capture = useFlip(boardRef, "data-task");
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const reorder = useCallback(
    (id, projectId, beforeId) => {
      const current = tasksRef.current;
      const idx = current.findIndex((t) => t.id === id);
      if (idx === -1) return;

      capture();
      const next = current.slice();
      const [task] = next.splice(idx, 1);
      /* Spostare una card fuori dalla colonna origini la conferma: perde il
         flag `pending` e prende il progetto della colonna di arrivo. */
      const moved = { ...task, project: projectId, pending: false };
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
      let lastBeforeId = "none-yet";

      const targetInfo = (ev) => {
        const cols = [
          ...document.querySelectorAll('[data-drop-col]:not([data-drop-col="origin"])'),
        ].map((el) => ({ id: el.getAttribute("data-drop-col"), el, r: el.getBoundingClientRect() }));
        const col = cols.find(
          ({ r }) =>
            ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom,
        );
        if (!col) return null;
        const cardsInCol = [...col.el.querySelectorAll("[data-task]")].filter(
          (el) => el.getAttribute("data-task") !== String(id),
        );
        let beforeId = null;
        for (const el of cardsInCol) {
          const cr = el.getBoundingClientRect();
          if (ev.clientY < cr.top + cr.height / 2) {
            beforeId = el.getAttribute("data-task");
            break;
          }
        }
        return { colId: col.id, beforeId };
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
        if (info && (info.colId !== lastColId || info.beforeId !== lastBeforeId)) {
          lastColId = info.colId;
          lastBeforeId = info.beforeId;
          reorder(id, info.colId === "none" ? null : info.colId, info.beforeId);
        }
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.querySelectorAll("[data-drop-col]").forEach((el) => el.classList.remove("hit"));
        clone?.remove();
        if (!moved) {
          if (onTitle) onEditTitle(id);
          else onOpen(id);
          return;
        }
        onDragChange(null);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      e.preventDefault();
    },
    [reorder, onDragChange, onOpen, onEditTitle],
  );

  return { start, reorder };
}
