import { useEffect, useRef } from "react";
import { Check } from "../components/icons.jsx";

/* Menu a discesa della testata contenuto — da DEF_Content.

   Cinque comandi si comportano allo stesso modo (progetto, vista, ordinamento,
   filtro, raggruppamento), quindi il comportamento sta qui una volta sola:
   si chiude cliccando fuori o con Esc, e la voce scelta è in accento con la
   spunta a destra.

   Il filtro è l'unico a scelta multipla: resta aperto dopo il click, perché
   accendere due filtri di fila non deve costare due aperture. */

const PANEL = "absolute z-20 p-1.5 rounded-lg border border-divider bg-surface shadow-elev-lg";
const ITEM =
  "flex items-center gap-[9px] px-[9px] py-2 w-full text-left rounded-sm border-none bg-transparent " +
  "cursor-pointer text-[12.5px] hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]";

/* `placement`: i menu della testata contenuto si aprono in basso, quelli del
   piede del dettaglio task in alto — lì sotto non c'è spazio, e l'artboard li
   disegna sopra il pulsante (`bottom: calc(100% + 6px)`). */
export function Dropdown({ open, onClose, align = "left", placement = "bottom", width, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const fuori = (e) => {
      if (!ref.current?.parentElement?.contains(e.target)) onClose();
    };
    const esc = (e) => {
      if (e.key === "Escape") onClose();
    };
    /* `pointerdown` e non `click`: chiude prima che il click raggiunga
       qualcos'altro, come fa un menu di sistema. */
    document.addEventListener("pointerdown", fuori);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuori);
      document.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className={
        `${PANEL} ${align === "right" ? "right-0" : "left-0"} ` +
        (placement === "top" ? "bottom-[38px]" : "top-[38px]")
      }
      style={{ width }}
    >
      {children}
    </div>
  );
}

export function DropdownItem({ selected = false, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={ITEM + (disabled ? " opacity-40 cursor-not-allowed hover:bg-transparent" : "")}
      style={{ color: selected ? "var(--color-accent)" : "var(--color-content)" }}
    >
      {children}
      {selected ? <Check size={13} className="ml-auto shrink-0" /> : null}
    </button>
  );
}

export function DropdownLabel({ children }) {
  return (
    <p className="text-micro tracking-[0.08em] uppercase px-[9px] pt-1.5 pb-1 m-0 text-content/38">
      {children}
    </p>
  );
}

export function DropdownSeparator() {
  return <div className="h-px my-1 mx-0.5 bg-divider" />;
}
