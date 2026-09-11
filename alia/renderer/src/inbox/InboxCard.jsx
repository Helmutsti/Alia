import { useEffect, useRef } from "react";
import { Alarm, NoteLines, Subtasks } from "../components/icons.jsx";

/* Card minima dell'Inbox — trascritta da `.sp-card` / `.sp-check` di
   DEF_Inbox min. È la forma usata dalla colonna Small Inbox, dalle righe
   della vista Lista, dalle card del Kanban e (per decisione registrata in
   Rinascita.md) dalla colonna "Da smistare" della Full Inbox.

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

/* Il bordo si ritira insieme al pallino, e non e' un dettaglio estetico: e' la
   ragione per cui titolo e scadenza non erano allineati (trovato l'11/09/2026).

   Il pallino a riposo e' `w-0`, ma il bordo stava nello stile in linea
   (`border: 2.2px solid …`) e con `box-sizing: border-box` i due bordi
   occupano comunque **4px** a larghezza zero. `opacity-0` lo rende invisibile,
   non inesistente: il titolo partiva 4px piu' a destra della scadenza, che gli
   sta sotto ma fuori dalla riga del pallino e quindi non riceveva la stessa
   spinta. Quattro pixel non si notano da soli; si notano come due righe che non
   cominciano nello stesso punto.

   Quindi la larghezza del bordo diventa una classe che vive in hover come tutto
   il resto, e in linea resta il solo colore — che e' l'unica cosa che il
   componente non puo' sapere in anticipo. A riposo il pallino occupa zero
   davvero, e le due righe partono allineate. */
const CHECK =
  "w-0 h-[13px] mt-0.5 mr-0 rounded-full shrink-0 opacity-0 overflow-hidden border-0 " +
  "transition-[width,opacity,margin-right,border-width] duration-[140ms] " +
  "group-hover:w-[13px] group-hover:opacity-100 group-hover:mr-2 group-hover:border-[2.2px]";

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

/* ── la card completa ───────────────────────────────────────────────────────

   Una preferenza decide se la card dice il minimo (titolo e scadenza, com'e'
   sempre stata) o tutto quello che il task sa di se'. Sta nelle Impostazioni,
   sezione Aspetto: e' una scelta di gusto che si fa una volta, non un gesto da
   ripetere mentre si lavora.

   **La card non sa niente di chi la ospita, ed e' voluto.** Riceve `meta` e
   disegna quello che c'e' dentro; un campo assente non si disegna. Cosi' la
   regola "nel Kanban non ripetere quello che la colonna dice gia'" — niente
   stato nelle colonne per stato, niente progetto in quelle per progetto,
   niente progetto ne' fase in quelle per fase — vive nel **punto di chiamata**,
   che e' l'unico a sapere come sono fatte le colonne. Qui dentro sarebbe una
   catena di casi da tenere allineata a mano con il raggruppamento.

   L'ordine delle fasce va dal piu' al meno identificante: chi e' (priorita' e
   titolo), dove vive (progetto e fase), come e' etichettato (i tag), a che
   punto sta (sotto-task, scadenza, promemoria, note, sorgente, stato).

   L'ultima fascia va a capo da sola: a 204px non ci sta in riga, e andare a
   capo e' meglio che troncare — il dato c'e' o non c'e', non si mostra a
   meta'. */
const CHIP = "inline-flex items-center h-[18px] px-2 rounded-full text-micro whitespace-nowrap";
const CHIP_RUOLO = {
  start: `${CHIP} bg-card-line text-content`,
  mid: `${CHIP} bg-accent text-bg`,
  end: `${CHIP} border border-card-line text-content/45`,
};

const oraDi = (iso) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/* Il cancelletto si mette solo se non c'e' gia'. Le etichette arrivano da due
   strade che la pensano diversamente: scritte nel composer valgono la parola
   nuda (`casa`), raccolte da una sorgente esterna arrivano con il simbolo
   attaccato (`#progetti`, che su Discord e' il nome del canale). Anteporlo
   sempre scriveva `##progetti`. Si normalizza a schermo e non nel dato: il
   dato e' quello che l'utente ha scritto, e riscriverglielo sotto non e'
   compito di una card. */
const conCancelletto = (label) => (label.startsWith("#") ? label : `#${label}`);

function Meta({ meta, due, scaduta, dueSize }) {
  const { progetto, fase, tag = [], sottotask, promemoria, note, sorgente, stato } = meta;
  const fasciaBassa = due || sottotask || promemoria || note || sorgente || stato;

  return (
    <>
      {progetto || fase ? (
        <span className="flex items-center gap-1.5 text-mini text-content/62 min-w-0">
          {progetto ? (
            <span
              className="w-[6px] h-[6px] shrink-0 rounded-full"
              style={{ background: progetto.color }}
            />
          ) : null}
          <span className="truncate">
            {progetto && fase ? `${progetto.name} / ${fase}` : (progetto?.name ?? fase)}
          </span>
        </span>
      ) : null}

      {tag.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {tag.map((t) => (
            <span
              key={t}
              className="inline-flex items-center h-[17px] px-1.5 rounded-sm text-micro bg-content/8 text-content/55"
            >
              {conCancelletto(t)}
            </span>
          ))}
        </span>
      ) : null}

      {fasciaBassa ? (
        <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${dueSize} text-content/55`}>
          {sottotask ? (
            <span className="inline-flex items-center gap-1 tabular-nums" title="Sotto-task completati">
              <Subtasks size={11} />
              {sottotask.fatti}/{sottotask.totali}
            </span>
          ) : null}
          {/* La scadenza sta **in riga con il resto**, non su una riga sua:
              nella card essenziale e' l'unica cosa sotto il titolo e la riga se
              la merita tutta, qui e' una fra sei e sprecare una riga per lei
              spingerebbe la card a un'altezza che non serve. */}
          {due ? (
            <span
              className="whitespace-nowrap"
              style={scaduta ? { color: "var(--color-priority-urgent)" } : undefined}
            >
              {due}
            </span>
          ) : null}
          {promemoria ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Promemoria">
              <Alarm size={11} />
              {oraDi(promemoria)}
            </span>
          ) : null}
          {note ? (
            <span title="Ha delle note">
              <NoteLines size={11} />
            </span>
          ) : null}
          {sorgente ? (
            <span className="text-micro uppercase tracking-[0.08em] text-content/42">{sorgente}</span>
          ) : null}
          {stato ? (
            <span className="ml-auto">
              <span className={CHIP_RUOLO[stato.role]}>{stato.label}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

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
  /* Assente = card essenziale, cioe' quella di sempre. Vedi la nota sopra:
     quello che c'e' dentro lo decide chi chiama, non la card. */
  meta = null,
  /* Il pallino della priorita' sempre acceso. E' una prop sua e non una
     conseguenza di `meta` perche' e' un interruttore come gli altri: si puo'
     volere il pallino fisso e nient'altro, o tutto il resto senza il pallino. */
  prioritaFissa = false,
  /* La scadenza passata si accende del rosso della priorita' urgente. Lo dice
     chi chiama perche' e' lui a sapere la data vera: qui arriva gia' scritta
     ("in ritardo", "domani"), e da una parola non si ricava un confronto. */
  scaduta = false,
}) {
  return (
    <div
      {...{ [idAttr]: id }}
      onPointerDown={onPointerDown}
      style={{ opacity: dragging ? 0.35 : 1 }}
      className={`${CARD} ${className}`}
    >
      <div className="flex flex-nowrap items-start w-full">
        {/* Acceso fisso, il pallino dice la priorita' a colpo d'occhio; spento,
            resta il gesto dell'artboard — a riposo occupa zero, in hover si
            apre spingendo il titolo. Un dato che si vede solo passandoci sopra
            non e' "mostrato", ed e' per questo che si puo' chiedere fisso. */}
        {prioritaFissa ? (
          <span
            className="w-[13px] h-[13px] mt-0.5 mr-2 shrink-0 rounded-full"
            style={{ border: `2.2px solid ${priorityColor}` }}
          />
        ) : (
          <span className={CHECK} style={{ borderColor: priorityColor }} />
        )}
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
      {meta ? (
        <Meta meta={meta} due={due} scaduta={scaduta} dueSize={dueSize} />
      ) : due ? (
        <span
          className={`${dueSize} ${scaduta ? "" : "text-content/55"}`}
          style={scaduta ? { color: "var(--color-priority-urgent)" } : undefined}
        >
          {due}
        </span>
      ) : null}
    </div>
  );
}

/* Rinomina in linea. Il campo prende fuoco e seleziona tutto al montaggio;
   Invio conferma, Esc annulla, la perdita di fuoco conferma.

   È una `textarea`, non un `input` — scostamento voluto dall'artboard, in prova
   (vedi Rinascita.md, § Interfaccia). Il motivo: la card mostra il titolo su più righe, quindi
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
