import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "../components/icons.jsx";

/* Menu a discesa della testata contenuto — da DEF_Content.

   Cinque comandi si comportano allo stesso modo (progetto, vista, ordinamento,
   filtro, raggruppamento), quindi il comportamento sta qui una volta sola:
   si chiude cliccando fuori o con Esc, e la voce scelta è in accento con la
   spunta a destra.

   Il filtro è l'unico a scelta multipla: resta aperto dopo il click, perché
   accendere due filtri di fila non deve costare due aperture.

   ── Il pannello vive attaccato al `body` (11/09/2026) ──────────────────────

   Prima era un figlio del comando che lo apre, posizionato in assoluto dentro
   di lui. Semplice, e sbagliato per una ragione che si è vista solo con i dati
   veri: **il pannello contenuto ritaglia** (`overflow-hidden`, e deve farlo —
   contiene elenchi che scorrono), quindi un menu più alto dello spazio rimasto
   veniva tagliato invece di scorrere. Con ventisei progetti il menu misurava
   860px in una finestra da 800: gli ultimi dieci progetti non erano
   raggiungibili in nessun modo.

   Lo stesso ritaglio si mangiava l'ombra sul lato sinistro quando il pannello
   comincia al bordo della finestra — cioè nel Gantt, dove la colonna Inbox è
   chiusa — e il menu sembrava incollato al bordo.

   Adesso il pannello è un figlio di `body` (portale) posizionato in `fixed`
   sulle coordinate del comando, e da lì:

     · non lo ritaglia più nessuno;
     · si tiene dentro la finestra da solo, e se non ci sta **scorre** invece
       di sparire;
     · l'ombra si vede su tutti e quattro i lati.

   Resta un segnaposto invisibile nell'albero vero: serve a misurare il comando
   (è suo fratello) e a sapere se un clic è caduto "dentro" il menu o fuori —
   che con il pannello su `body` non si può più dedurre dalla parentela. */

/* ── Lo z del pannello, e perché è così alto (12/09/2026) ───────────────────

   Era `z-[80]`, e con il pannello appeso al `body` voleva dire **sotto i veli**.
   Nessun antenato fa da stacking context — `relative` senza z-index e
   `overflow-hidden` non lo creano — quindi il pannello si confronta con i veli
   dei pannelli sovrapposti nello stesso contesto, quello della radice, e 80
   perdeva contro tutti: dettaglio task 90, Impostazioni 92, composer 93.

   L'effetto: i menu del dettaglio task e delle Impostazioni sparivano dietro un
   velo nero al 52% con 7px di sfocatura. Non sembravano coperti, sembravano
   morti — e nelle Impostazioni era peggio, perché il clic finiva sul velo, che
   chiude la modale. Finché il pannello era figlio del comando (`absolute z-20`)
   il problema non poteva esistere: stava dentro il velo, non sotto.

   94 e non 99: sopra i tre veli, **sotto** i dialoghi di conferma (95) e gli
   avvisi (96). Quelli non sono pannelli fra i quali un menu galleggia, sono
   domande e guasti: un menu aperto che copre "vuoi cancellare il progetto?"
   sarebbe la cosa sbagliata da mettere davanti. */
const PANEL = "fixed z-[94] p-1.5 rounded-lg border border-divider bg-surface shadow-elev-lg";
const ITEM =
  "flex items-center gap-[9px] px-[9px] py-2 w-full text-left rounded-sm border-none bg-transparent " +
  "cursor-pointer text-[12.5px] hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]";

/* Quanto il pannello sta staccato dal comando, e dai bordi della finestra. Il
   primo viene dagli artboard (6); il secondo è respiro, non misura di
   disegno. */
const STACCO = 6;
const MARGINE = 10;

export function Dropdown({ open, onClose, align = "left", placement = "bottom", width, children }) {
  const segnaposto = useRef(null);
  const pannello = useRef(null);
  const [posa, setPosa] = useState(null);

  /* La posa si calcola **dopo** che il pannello è nel DOM: serve la sua
     altezza vera per decidere se ci sta sotto il comando o se deve scorrere, e
     prima di disegnarlo quell'altezza non esiste. Il primo fotogramma esce a
     `visibility: hidden`, quindi non si vede saltare. */
  useLayoutEffect(() => {
    if (!open) {
      setPosa(null);
      return undefined;
    }

    const misura = () => {
      const comando = segnaposto.current?.parentElement;
      const el = pannello.current;
      if (!comando || !el) return;
      const c = comando.getBoundingClientRect();
      const altezzaNaturale = el.scrollHeight;
      const larghezza = width ?? el.offsetWidth;

      const sopra = placement === "top";
      const spazio = sopra ? c.top - STACCO - MARGINE : window.innerHeight - c.bottom - STACCO - MARGINE;
      const altezza = Math.min(altezzaNaturale, Math.max(120, spazio));

      const top = sopra ? c.top - STACCO - altezza : c.bottom + STACCO;
      const sinistraGrezza = align === "right" ? c.right - larghezza : c.left;
      const left = Math.max(
        MARGINE,
        Math.min(sinistraGrezza, window.innerWidth - larghezza - MARGINE),
      );

      setPosa({ top, left, maxHeight: altezza });
    };

    misura();
    window.addEventListener("resize", misura);
    /* Anche allo scorrimento: il comando può muoversi sotto il menu (la
       testata sta in una regione che scorre), e un menu che resta indietro è
       peggio di un menu chiuso. */
    window.addEventListener("scroll", misura, true);
    return () => {
      window.removeEventListener("resize", misura);
      window.removeEventListener("scroll", misura, true);
    };
  }, [open, align, placement, width]);

  useEffect(() => {
    if (!open) return undefined;
    const fuori = (e) => {
      const dentroPannello = pannello.current?.contains(e.target);
      const dentroComando = segnaposto.current?.parentElement?.contains(e.target);
      if (!dentroPannello && !dentroComando) onClose();
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

  /* Il segnaposto resta sempre nell'albero, anche a menu chiuso: è da lui che
     si trova il comando, e cercarlo solo all'apertura vorrebbe dire non averlo
     quando serve. Non occupa spazio. */
  return (
    <span ref={segnaposto} className="hidden" aria-hidden="true">
      {open
        ? createPortal(
            <div
              ref={pannello}
              role="menu"
              className={`${PANEL} overflow-y-auto`}
              style={{
                width,
                top: posa?.top ?? 0,
                left: posa?.left ?? 0,
                maxHeight: posa?.maxHeight,
                visibility: posa ? "visible" : "hidden",
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
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
