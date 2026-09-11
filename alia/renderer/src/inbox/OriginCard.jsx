import { Check, PathIcon, Pencil, Trash } from "../components/icons.jsx";
import { TitleInput } from "./InboxCard.jsx";
import { SOURCE_ICONS, SOURCE_LABELS } from "./data.js";

/* Card della colonna "Origini da confermare" — da DEF_Inbox max
   (`.fi-card.origin`, `.fi-origin-btn`).

   ── Non e' una card di task, e non lo e' mai stata ────────────────────────

   Mostra un'**origine**: qualcosa arrivato da fuori che aspetta una decisione,
   e che nel database di Alia non esiste ancora. Per un giro e' stata scritta
   come task in triage, ed e' l'errore da cui venivano tutti i sintomi (vedi
   § Flussi, "Vita di un'origine"). Da qui la differenza visibile nel codice:
   la card riceve un `origine` con il suo `seq`, non un `task` con un `id`.

   Conseguenza: **non si trascina.** Non ha `data-task`, quindi il motore del
   trascinamento non la vede, e nessuna colonna e' un bersaglio per lei. Il
   senso di marcia e' unico — un'origine diventa un task, un task non torna a
   essere un'origine — e l'ordine della colonna e' quello di arrivo, che non e'
   materia di preferenze.

   ── Due azioni, e non ce n'e' una terza ───────────────────────────────────

   Il cestino rifiuta, la spunta accetta. Non c'e' un "dopo": lo stallo
   intermedio e' proprio cio' che il modello esiste per impedire. La matita non
   e' una terza decisione — corregge il titolo *prima* di accettare, perche' il
   testo di un messaggio raramente e' gia' il titolo di una cosa da fare.

   Differenze rispetto alla card minima, tutte dall'artboard:
     · fondo tinto d'accento al 9% sopra la superficie
     · nessun pallino di priorita' (una task da confermare non ne ha ancora)
     · titolo a 13px, non 13.5
     · riga sorgente in accent-300 con le azioni in coda */

const BTN =
  "grid place-items-center w-5 h-5 p-0 shrink-0 rounded-sm border border-divider " +
  "bg-transparent cursor-pointer text-content/65 hover:border-accent hover:text-content";

export function OriginCard({ origine, editing, occupata, onCommit, onEdit, onAccetta, onRifiuta }) {
  const etichetta = SOURCE_LABELS[origine.sourceType] ?? origine.sourceType;

  return (
    <div
      data-origine={origine.seq}
      className={
        /* Unica card non grigia dell'app: azzurro scuro e desaturato (famiglia
           slate), sugli stessi gradini di luminosita' delle card neutre — vedi
           i token `--color-origin-*` in theme.css. */
        "flex flex-col gap-1.5 px-[13px] py-3 rounded-lg border-[1.5px] border-origin-line " +
        "transition-colors duration-[120ms] hover:border-origin-line-hover bg-origin-surface " +
        (occupata ? "opacity-50 pointer-events-none" : "")
      }
    >
      <div className="flex flex-nowrap items-start w-full">
        {editing ? (
          <TitleInput value={origine.title} size="text-meta" onCommit={onCommit} />
        ) : (
          <span
            data-title="1"
            title="Clicca per correggere il titolo prima di accettarla"
            /* Vedi la nota su TITLE in InboxCard.jsx: i titoli senza spazi
               vanno spezzati a forza, altrimenti sbordano dalla card. */
            className="flex-1 min-w-0 font-medium text-meta tracking-[-0.01em] leading-[1.35] cursor-text [overflow-wrap:anywhere]"
          >
            {origine.title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {/* L'icona c'e' quando la sorgente e' una di quelle disegnate, e
            altrimenti resta il nome: `sourceType` e' testo libero nel servizio,
            e le sorgenti che verranno non sono ancora scritte. */}
        {SOURCE_ICONS[origine.sourceType] ? (
          <PathIcon d={SOURCE_ICONS[origine.sourceType]} size={11} sw={2} className="text-accent" />
        ) : null}
        {/* Il link al messaggio originale c'e' solo dove esiste davvero (canali
            e gruppi pubblici): in una chat privata non c'e' indirizzo, e
            l'etichetta resta testo invece di fingere un collegamento. */}
        {origine.sourceUrl ? (
          <a
            href={origine.sourceUrl}
            target="_blank"
            rel="noreferrer"
            title="Apri il messaggio originale"
            className="text-[10.5px] text-accent underline underline-offset-2"
          >
            {etichetta}
          </a>
        ) : (
          <span className="text-[10.5px] text-accent">{etichetta}</span>
        )}

        <span className="ml-auto flex gap-[5px]">
          <button
            type="button"
            onClick={onRifiuta}
            title="Rifiuta: non diventa niente"
            aria-label="Rifiuta"
            className={`${BTN} hover:!border-danger hover:!text-danger`}
          >
            <Trash size={11} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Correggi il titolo"
            aria-label="Correggi il titolo"
            className={BTN}
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={onAccetta}
            title="Accetta: diventa una task da smistare"
            aria-label="Accetta"
            className={`${BTN} hover:!border-confirm hover:!text-confirm`}
          >
            <Check size={12} />
          </button>
        </span>
      </div>
    </div>
  );
}
