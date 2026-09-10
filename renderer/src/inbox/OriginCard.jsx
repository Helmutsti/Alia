import { Check, PathIcon, Pencil, Trash } from "../components/icons.jsx";
import { TitleInput } from "./InboxCard.jsx";
import { SOURCE_ICONS, SOURCE_LABELS } from "./data.js";

/* Card della colonna "Origini da confermare" — da DEF_Inbox max
   (`.fi-card.origin`, `.fi-origin-btn`).

   Differenze rispetto alla card minima, tutte dall'artboard:
     · fondo tinto d'accento al 9% sopra la superficie
     · nessun pallino di priorità (una task da confermare non ne ha ancora)
     · titolo a 13px, non 13.5
     · riga sorgente in accent-300 con tre azioni: elimina, modifica, conferma

   I tre bottoni fermano la propagazione sul pointerdown, altrimenti il
   trascinamento della card partirebbe al posto del click. */

const BTN =
  "grid place-items-center w-5 h-5 p-0 shrink-0 rounded-sm border border-divider " +
  "bg-transparent cursor-pointer text-content/65 hover:border-accent hover:text-content";

export function OriginCard({ task, nuova, editing, dragging, onPointerDown, onCommit, onEdit, onConfirm, onDelete }) {
  const stop = (e) => e.stopPropagation();

  return (
    <div
      data-task={task.id}
      onPointerDown={onPointerDown}
      style={{ opacity: dragging ? 0.35 : 1 }}
      className={
        /* Unica card non grigia dell'app: azzurro scuro e desaturato (famiglia
           slate), sugli stessi gradini di luminosità delle card neutre — vedi
           i token `--color-origin-*` in theme.css. */
        "flex flex-col gap-1.5 px-[13px] py-3 rounded-lg border-[1.5px] border-origin-line " +
        "cursor-grab touch-none transition-colors duration-[120ms] " +
        "hover:border-origin-line-hover bg-origin-surface"
      }
    >
      <div className="flex flex-nowrap items-start w-full">
        {editing ? (
          <TitleInput value={task.title} size="text-meta" onCommit={onCommit} />
        ) : (
          <span
            data-title="1"
            title="Clicca per rinominare"
            /* Vedi la nota su TITLE in InboxCard.jsx: i titoli senza spazi
               vanno spezzati a forza, altrimenti sbordano dalla card. */
            className="flex-1 min-w-0 font-medium text-meta tracking-[-0.01em] leading-[1.35] cursor-text [overflow-wrap:anywhere]"
          >
            {task.title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {/* `sourceType` è testo libero nel core: le integrazioni che lo
            valorizzeranno non sono ancora scritte. Quindi l'icona c'è quando la
            sorgente è una di quelle disegnate, e altrimenti resta il nome. */}
        {SOURCE_ICONS[task.sourceType] ? (
          <PathIcon d={SOURCE_ICONS[task.sourceType]} size={11} sw={2} className="text-accent" />
        ) : null}
        <span className="text-[10.5px] text-accent">
          {SOURCE_LABELS[task.sourceType] ?? task.sourceType}
        </span>
        {/* Nuova: un punto pieno d'accento accanto al nome della sorgente.
            Un punto e non una parola perché dice l'unica cosa che c'è da dire,
            e perché il badge sulla linea "Inbox" ha già dato il numero: qui
            serve solo sapere *quali* sono, arrivati qui dentro. */}
        {nuova ? (
          <span
            className="w-[5px] h-[5px] shrink-0 rounded-full bg-accent"
            title="Arrivata da poco"
          />
        ) : null}
        <span className="ml-auto flex gap-[5px]">
          <button
            type="button"
            onPointerDown={stop}
            onClick={onDelete}
            title="Elimina"
            aria-label="Elimina"
            className={`${BTN} hover:!border-danger hover:!text-danger`}
          >
            <Trash size={11} />
          </button>
          <button
            type="button"
            onPointerDown={stop}
            onClick={onEdit}
            title="Modifica"
            aria-label="Modifica"
            className={BTN}
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onPointerDown={stop}
            onClick={onConfirm}
            /* Non e piu disabilitabile: confermare significa uscire dal triage
               (`isInbox`), e quello si puo fare sempre. Prima significava
               "portala sul primo stato intermedio", e sui database che non ne
               avevano uno il gesto restava spento con una spiegazione. */
            title="Conferma: toglila dal triage"
            aria-label="Conferma"
            className={`${BTN} hover:!border-confirm hover:!text-confirm`}
          >
            <Check size={12} />
          </button>
        </span>
      </div>
    </div>
  );
}
