/* La task sulla linea temporale — vista Calendario, estensione Giorno.

   E' una terza forma, accanto alla riga della Lista e alla card dell'Inbox, e
   non un adattamento di una delle due. La differenza non e' di stile: **qui
   l'altezza e' un dato**. Una card alta quanto il suo contenuto direbbe
   un'ora che non e' quella che ha; questa e' alta quanto dura, e tutto il
   resto discende da li'.

   Da cui la forma: rettangolare, angoli appena smussati (`rounded-[3px]`, non i
   10 della card). Un angolo tondo su un blocco di quindici minuti si mangia
   meta' del blocco, e due blocchi consecutivi con gli angoli tondi lasciano
   fra loro una fessura che sembra tempo libero.

   E da cui il contenuto: **il titolo e l'ora, nient'altro**. Progetto, tag,
   stato, priorita' non entrano — a un quarto d'ora di altezza non ci sono
   righe da spenderci, e sulla linea temporale la domanda non e' "che cos'e'
   questa task" ma "cosa c'e' alle dieci". Il resto si legge aprendola.

   L'unica cosa non scritta e' il filo del progetto sul bordo sinistro: e' il
   colore che l'applicazione usa dappertutto per dire di chi e' una task, e tre
   pixel di colore non sono un'informazione da leggere — sono quella che
   permette di non leggere.

   ── La tinta, e perche' non e' grigia (11/09/2026) ─────────────────────────

   Il blocco era `bg-elevated` con il suo bordo neutro, come la card. Sulla
   linea non funzionava, ed e' un difetto di **contesto** e non di colore: la
   card dell'Inbox sta dentro una colonna scura e si stacca da sola, il blocco
   sta sopra le bande della disponibilita', che sono gia' schiarite. Grigio
   chiaro su grigio chiaro: due rettangoli che si somigliano, e l'occhio deve
   cercare il bordo per sapere dove finisce l'uno e comincia l'altro.

   La risposta viene dal filo: se tre pixel di colore bastano a dire di chi e'
   la task, il blocco puo' essere **lavato di quello stesso colore** invece di
   restare neutro. Il fondo e' la tinta del progetto al 16% mischiata al grigio
   della card, il bordo la stessa tinta al 45%: abbastanza da staccarsi dalla
   banda e da distinguere due progetti a colpo d'occhio, troppo poco per
   leggersi come "una superficie colorata". Il testo resta su un fondo che e'
   ancora, in luminosita', quello di prima.

   Non e' una deroga alla regola dell'accento unico: i colori dei progetti sono
   gia' nell'applicazione — i pallini, il filo qui a sinistra — e questa e' la
   stessa informazione detta con piu' superficie, non un colore nuovo. Una task
   senza progetto prende il grigio di ripiego e resta neutra, com'e' giusto.

   In piu' un'ombra corta: sulla linea il blocco **sta sopra** la giornata, non
   dentro. E' la seconda meta' della risposta, quella che il colore da solo non
   da'. */

/* Le due maniglie di ridimensionamento. Alte 6px, mezze dentro e mezze fuori
   dal bordo: prenderle deve essere facile, ma non a scapito del corpo del
   blocco — con maniglie alte 10 un blocco di mezz'ora sarebbe quasi tutto
   maniglia, e spostarlo diventerebbe impossibile.

   Compaiono solo in hover, e il cursore le annuncia (`ns-resize`) prima che si
   prema: e' il solo modo di far sapere che i bordi fanno una cosa diversa dal
   centro. */
const MANIGLIA =
  "absolute left-0 right-0 h-[7px] cursor-ns-resize opacity-0 group-hover:opacity-100 " +
  "transition-opacity duration-[120ms] z-[2] flex items-center justify-center";
const TACCA = "w-6 h-[3px] rounded-full bg-content/45";

export function CardCalendarTask({
  title,
  ora,
  colore,
  scaduta = false,
  done = false,
  fantasma = false,
  inMovimento = false,
  fuoriOrario = false,
  stile,
  onApri,
  onPresa,
  onRidimensiona,
}) {
  /* La tinta passa per una proprieta' custom, non per tre stili in linea: cosi'
     fondo, bordo e bordo-in-hover si scrivono come classi (che Tailwind vede e
     genera) e restano leggibili accanto alle altre. */
  const tinta = colore ?? "var(--color-project-fallback)";

  return (
    <div
      title={fuoriOrario ? "Fuori dalle ore di disponibilità" : undefined}
      style={{ ...stile, "--tinta": tinta }}
      className={
        "group absolute overflow-hidden rounded-[3px] border select-none " +
        "transition-[box-shadow,opacity,border-color] duration-[120ms] " +
        (fantasma
          ? "border-dashed border-accent bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-elevated))] opacity-70 pointer-events-none "
          : "bg-[color-mix(in_srgb,var(--tinta)_16%,var(--color-elevated))] " +
            "border-[color-mix(in_srgb,var(--tinta)_45%,transparent)] " +
            "hover:border-[color-mix(in_srgb,var(--tinta)_80%,transparent)] " +
            "shadow-[0_1px_3px_rgb(0_0_0/0.38)] " +
            /* Fuori dalle ore di lavoro: **tratteggiato**, e nient'altro. Un
               colore d'allarme direbbe che c'e' un errore, e non c'e' — c'e'
               una task in un'ora che non avevi dichiarato tua. Il tratteggio
               e' la stessa lingua con cui l'applicazione dice "questo posto
               non e' pieno": il pallino del progetto assente, il bordo dei
               gruppi vuoti. */
            (fuoriOrario ? "border-dashed " : "")) +
        (inMovimento ? "shadow-drag opacity-95 z-[6] " : "")
      }
    >
      {/* Il filo del progetto. In `background` e non un bordo: un bordo
          sinistro colorato spingerebbe il testo dentro di 3px in piu' rispetto
          ai blocchi senza progetto, e i titoli non comincerebbero tutti sulla
          stessa linea. */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: tinta }}
      />

      {onRidimensiona && !fantasma ? (
        <span
          className={`${MANIGLIA} top-0`}
          onPointerDown={(e) => onRidimensiona(e, "inizio")}
          aria-hidden="true"
        >
          <span className={TACCA} />
        </span>
      ) : null}

      {/* Il corpo: si prende da qui per spostare. E' un bottone perche' un clic
          senza movimento apre la task — lo stesso patto della card e della
          riga, dove prendere e aprire sono lo stesso gesto distinto solo dal
          fatto che ci si muova o no. */}
      <button
        type="button"
        title={title}
        onPointerDown={onPresa}
        onClick={onApri}
        className={
          "w-full h-full flex flex-col gap-px items-start text-left pl-2.5 pr-1.5 py-1 " +
          "border-0 bg-transparent min-w-0 " +
          (fantasma ? "cursor-default " : "cursor-grab active:cursor-grabbing ")
        }
      >
        {/* Un gradino sopra i due di prima: il titolo da 11 a 12.5 (la misura
            dei comandi della testata), l'ora da 10 a 11. Sulla linea si legge
            da piu' lontano che dentro una colonna — si guarda la giornata
            intera, non una card alla volta — e 11px erano una misura da
            didascalia. */}
        <span
          className={
            "text-[12.5px] leading-[1.25] w-full truncate " +
            (done ? "line-through text-content/45" : "text-content")
          }
        >
          {title}
        </span>
        <span
          className="text-mini tabular-nums leading-[1.2] w-full truncate"
          style={scaduta ? { color: "var(--color-priority-urgent)" } : { color: "var(--color-content)", opacity: 0.62 }}
        >
          {ora}
        </span>
      </button>

      {onRidimensiona && !fantasma ? (
        <span
          className={`${MANIGLIA} bottom-0`}
          onPointerDown={(e) => onRidimensiona(e, "fine")}
          aria-hidden="true"
        >
          <span className={TACCA} />
        </span>
      ) : null}
    </div>
  );
}
