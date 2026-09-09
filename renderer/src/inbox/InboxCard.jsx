import { useEffect, useRef } from "react";

/* Card minima dell'Inbox — trascritta da `.sp-card` / `.sp-check` di
   DEF_Inbox min. È la forma usata dalla colonna Small Inbox, dalle righe
   della vista Lista, dalle card del Kanban e (per decisione registrata in
   DESIGN_LOCK.md) dalla colonna "Da smistare" della Full Inbox.

   Il pallino della priorità non è sempre visibile: parte a larghezza 0 e si
   apre in hover, spingendo il titolo a destra. È il gesto distintivo della
   card, quindi le durate (140ms) e le misure (0 → 13px, margine 0 → 8px)
   vengono dall'artboard e non sono da arrotondare. */

/* Il bordo è sempre visibile (`border-card-line`), non trasparente come
   nell'artboard: là colonna e card avevano lo stesso fondo e senza bordo la
   card scompariva dentro la colonna. Ora la card sta un livello sopra
   (`bg-elevated`) e ha una linea propria; l'hover la schiarisce restando
   neutra, invece di passare all'accento come nell'artboard. */
const CARD =
  "group flex flex-col gap-1.5 px-[13px] py-3 rounded-lg border-[1.5px] border-card-line " +
  "bg-elevated cursor-grab touch-none transition-colors duration-[120ms] " +
  "hover:border-card-line-hover";

const CHECK =
  "w-0 h-[13px] mt-0.5 mr-0 rounded-full shrink-0 opacity-0 overflow-hidden " +
  "transition-[width,opacity,margin-right] duration-[140ms] " +
  "group-hover:w-[13px] group-hover:opacity-100 group-hover:mr-2";

const TITLE = "flex-1 min-w-0 font-medium tracking-[-0.01em] leading-[1.35]";

export function InboxCard({
  id,
  title,
  priorityColor,
  due,
  /* 13.5px nella colonna Small Inbox e nella vista Lista, 13px nel Kanban e
     nella colonna "Da smistare": la differenza è nell'artboard. */
  titleSize = "text-card",
  dueSize = "text-mini",
  dragging = false,
  editing = false,
  onTitleClick,
  onCommit,
  onPointerDown,
  idAttr = "data-card",
  className = "",
}) {
  return (
    <div
      {...{ [idAttr]: id }}
      onPointerDown={onPointerDown}
      style={{ opacity: dragging ? 0.35 : 1 }}
      className={`${CARD} ${className}`}
    >
      <div className="flex flex-nowrap items-start w-full">
        <span className={CHECK} style={{ border: `2.2px solid ${priorityColor}` }} />
        {editing ? (
          <TitleInput value={title} size={titleSize} onCommit={onCommit} />
        ) : (
          <span
            data-title={onTitleClick ? "1" : undefined}
            title={onTitleClick ? "Clicca per rinominare" : undefined}
            onClick={onTitleClick}
            className={`${TITLE} ${titleSize} ${onTitleClick ? "cursor-text" : ""}`}
          >
            {title}
          </span>
        )}
      </div>
      {due ? <span className={`${dueSize} text-content/55`}>{due}</span> : null}
    </div>
  );
}

/* Rinomina in linea. Nell'artboard il campo prende fuoco e seleziona tutto al
   montaggio; Invio conferma, Esc annulla, la perdita di fuoco conferma. */
export function TitleInput({ value, size, onCommit }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      data-title="1"
      defaultValue={value}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(e.target.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCommit(null);
        }
      }}
      onBlur={(e) => onCommit(e.target.value)}
      /* Un solo anello, e neutro. Prima ce n'erano due sovrapposti e entrambi
         azzurri: il bordo proprio del campo più l'anello di fuoco globale, che
         `outline-none` non riusciva a spegnere perché la regola stava fuori dai
         layer. Ora quella sta in `@layer base` e questa utility la scavalca. */
      className={
        `${TITLE} ${size} box-border px-[5px] py-px -my-0.5 text-content ` +
        "border border-card-line-hover rounded-sm outline-none " +
        "bg-[color-mix(in_srgb,var(--color-content)_8%,var(--color-elevated))]"
      }
    />
  );
}
