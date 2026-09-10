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
/* Il padding destro si ritira in hover (13px -> 0) insieme all'apertura del
   pallino: entrando, il pallino spinge il titolo a destra di 21px (13 di
   larghezza piu 8 di margine), e senza restituire spazio sul lato opposto il
   testo rifluirebbe a meta animazione. Stessa durata del pallino (140ms) per
   leggerlo come un gesto solo, non due. `transition-colors` non basta piu:
   serve elencare anche padding-right, altrimenti il ritiro sarebbe uno scatto. */
const CARD =
  "group flex flex-col gap-1.5 pl-[13px] pr-[13px] py-3 rounded-lg border-[1.5px] border-card-line " +
  "bg-elevated cursor-grab touch-none " +
  "transition-[color,background-color,border-color,padding-right] duration-[140ms] " +
  "hover:border-card-line-hover hover:pr-0";

const CHECK =
  "w-0 h-[13px] mt-0.5 mr-0 rounded-full shrink-0 opacity-0 overflow-hidden " +
  "transition-[width,opacity,margin-right] duration-[140ms] " +
  "group-hover:w-[13px] group-hover:opacity-100 group-hover:mr-2";

/* `overflow-wrap: anywhere` e non `break-word`: servono entrambe le cose che
   fa in più. Un titolo scritto tutto attaccato (capita dalle sorgenti esterne,
   e nei dati di prova) è una parola sola non spezzabile, che `min-w-0` da solo
   non contiene — il box si stringe, il testo no, e sborda. `anywhere` la
   spezza e, a differenza di `break-word`, abbassa anche la larghezza
   min-content: senza quello il flex-item resterebbe largo quanto la parola.
   Il sintomo era una scrollbar orizzontale nella colonna, che su Windows si
   prende ~10px di altezza e li toglie alle card. */
const TITLE =
  "flex-1 min-w-0 font-medium tracking-[-0.01em] leading-[1.35] [overflow-wrap:anywhere]";

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

/* Rinomina in linea. Il campo prende fuoco e seleziona tutto al montaggio;
   Invio conferma, Esc annulla, la perdita di fuoco conferma.

   È una `textarea`, non un `input` — scostamento voluto dall'artboard, in prova
   (vedi DESIGN_LOCK). Il motivo: la card mostra il titolo su più righe, quindi
   con un `input` il testo cambiava forma nel momento in cui si entrava in
   modifica — una riga sola che scorre in orizzontale invece del blocco che si
   stava leggendo — e con i titoli lunghi si vedeva solo la parte finale.

   Tre cose che la textarea si porta dietro e vanno sistemate a mano:

     · l'altezza, che non si adatta da sé: si rimisura a ogni battuta su
       `scrollHeight`, con `overflow-hidden` perché il blocco cresca invece di
       scorrere internamente;
     · Invio, che di suo inserirebbe un capo riga: il titolo è una riga sola nel
       modello (`t_task.title`), quindi Invio conferma e non scrive mai un "
";
     · `overflow-wrap: anywhere`, per lo stesso motivo del titolo a schermo —
       un titolo scritto tutto attaccato altrimenti sborda in orizzontale. */
export function TitleInput({ value, size, onCommit }) {
  const ref = useRef(null);

  /* Una funzione sola, usata al montaggio e a ogni battuta. Due accortezze:

       · `auto` prima di misurare, perché `scrollHeight` non scende mai da solo
         quando il testo si accorcia;
       · i bordi vanno aggiunti a mano. Il campo è in `box-border`, quindi
         l'altezza che si scrive comprende i bordi, mentre `scrollHeight` misura
         il solo contenuto: assegnare `scrollHeight` liscio lascia il campo 2px
         corto e la textarea scorre internamente di due pixel — invisibile come
         barra (c'è `overflow-hidden`) ma l'ultima riga resta tagliata.
         `offsetHeight - clientHeight` è esattamente lo spessore dei bordi. */
  const adatta = (el) => {
    if (!el) return;
    const bordi = el.offsetHeight - el.clientHeight;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + bordi}px`;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
    adatta(el);
  }, []);

  return (
    <textarea
      ref={ref}
      data-title="1"
      rows={1}
      defaultValue={value}
      onClick={(e) => e.stopPropagation()}
      onInput={(e) => adatta(e.target)}
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
        "resize-none overflow-hidden block [overflow-wrap:anywhere] " +
        "bg-[color-mix(in_srgb,var(--color-content)_8%,var(--color-elevated))]"
      }
    />
  );
}
