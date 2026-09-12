import { useState } from "react";

import { Check } from "../components/icons.jsx";
import { dueLabel } from "../lib/tasks.js";
import { Dropdown, DropdownItem, DropdownSeparator } from "./Dropdown.jsx";

/* La riga della vista Lista — da DEF_Row.

   Componente distinto da InboxCard, e la distinzione non è di nome. Una CARD è
   un oggetto autonomo: sta dentro una colonna, si trascina, e il suo bordo la
   chiude perché deve reggere da sola. Una ROW è un elemento di un elenco:
   occupa tutta la larghezza, vive dell'allineamento con le righe sopra e sotto,
   e può contare sull'elenco per la separazione.

   Perciò: la vista Lista usa questa; le colonne dell'Inbox e del Kanban usano
   InboxCard.

   La forma è quella decisa in DEF_Row, e non ce n'è un'altra:
     · disposizione A — pallino, titolo elastico, meta in coda a destra
     · R1 la scatola  — fondo elevated e bordo proprio, che schiarisce in hover
     · S2 chip pieno  — lo stato riempito, per dargli il peso che gli mancava */

const CHIP = "inline-flex items-center h-5 px-[9px] rounded-md text-[10.5px] font-medium whitespace-nowrap";

/* Il chip si colora per **ruolo** dello stato, non per etichetta. Gli stati
   sono configurabili: possono essere tre come dieci, e chiamarsi come vuole
   l'utente. Quello che non cambia è la struttura garantita dallo schema — uno
   di partenza, uno o più di chiusura, gli altri in mezzo — e su quella si può
   basare la grafica. Nessun colore nuovo rispetto a DEF_Row: la partenza è
   neutra, l'avanzamento prende l'accento, la chiusura è spenta e resta contorno.

   Conseguenza da sapere: più stati intermedi condividono lo stesso azzurro. Se
   diventeranno tanti servirà distinguerli, ma non inventando colori qui — è una
   decisione di design, da prendere sull'artboard. */
const CHIP_RUOLO = {
  start: `${CHIP} bg-card-line text-content`,
  mid: `${CHIP} bg-accent text-bg`,
  end: `${CHIP} border border-card-line text-content/45`,
};

/* ── la selezione multipla ──────────────────────────────────────────────────

   `selezionabile` non e' un'aggiunta alla riga: e' un **cambio di significato**
   del clic, e la riga lo dice a chi guarda. Dentro la modalita' fa una cosa
   sola — si seleziona — e tutto il resto si spegne: niente apertura del
   dettaglio, niente trascinamento, niente chip di stato cliccabile. E' tutto il
   punto di avere una modalita' esplicita invece di un modificatore: dentro non
   c'e' niente da indovinare.

   Il segno della selezione e' il bordo in accento piu' il fondo tinto, non una
   casella: una casella in piu' su ogni riga sposterebbe il titolo di 20px
   all'entrata e all'uscita dalla modalita', e l'elenco ballerebbe. Il pallino
   della priorita', che c'e' gia', diventa una spunta quando la riga e' presa —
   stesso posto, stessa misura, nessuno spostamento. */
export function TaskRow({
  task,
  showProject = false,
  states = [],
  onChangeState,
  onOpen,
  onPointerDown,
  selezionabile = false,
  selezionata = false,
  onSeleziona,
  /* Chiudere e riaprire dal cerchietto. Assente = cerchietto decorativo, come
     prima. In selezione non arriva: dentro la modalita' la riga fa una cosa
     sola, e il cerchietto e' gia' preso dalla spunta della selezione. */
  onToggleDone,
}) {
  const [menuAperto, setMenuAperto] = useState(false);
  const interattivo = typeof onChangeState === "function" && states.length > 0;
  const apribile = typeof onOpen === "function" && !selezionabile;
  const trascinabile = typeof onPointerDown === "function" && !selezionabile;

  return (
    <div
      data-row={task.id}
      /* `data-task` oltre a `data-row`: e' l'attributo con cui il motore del
         trascinamento riconosce un oggetto spostabile e con cui il FLIP misura
         le posizioni. Averli entrambi tiene in piedi i selettori che cercano
         una riga e fa entrare la riga nella stessa macchina delle card. */
      data-task={trascinabile ? task.id : undefined}
      onPointerDown={trascinabile ? onPointerDown : undefined}
      /* La riga intera apre il dettaglio, come la card dell'Inbox. Il chip di
         stato e il suo menu, che stanno dentro la riga, fermano la
         propagazione: cambiare stato da qui e un gesto suo, e non deve anche
         aprire la scheda.

         Quando la riga e' trascinabile l'apertura NON sta piu' qui: la decide
         il motore, che distingue un click da un trascinamento con la soglia dei
         4px. Tenere anche un `onClick` aprirebbe il dettaglio due volte. */
      onClick={
        selezionabile
          ? onSeleziona
          : apribile && !trascinabile
            ? () => onOpen(task)
            : undefined
      }
      role={selezionabile ? "checkbox" : apribile ? "button" : undefined}
      aria-checked={selezionabile ? selezionata : undefined}
      tabIndex={selezionabile || apribile ? 0 : undefined}
      onKeyDown={
        selezionabile || apribile
          ? (e) => {
              /* Solo se il tasto e' arrivato **alla riga**. Dentro ci sono
                 comandi che hanno il loro Invio — il cerchietto, il chip di
                 stato — e senza questa guardia premerli col tasto faceva
                 partire anche l'apertura della scheda: il bottone si attivava e
                 il keydown continuava a salire. Il clic quella guardia ce
                 l'aveva gia' (`stopPropagation` sul chip, `<button>` per il
                 cerchietto); la tastiera no. */
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (selezionabile) onSeleziona?.();
                else onOpen(task);
              }
            }
          : undefined
      }
      className={
        "flex items-start gap-2.5 px-[13px] py-3 rounded-lg border-[1.5px] " +
        "transition-colors duration-[120ms] " +
        (selezionata
          ? "border-accent bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-elevated))] "
          : "border-card-line bg-elevated hover:border-card-line-hover ") +
        (trascinabile ? "cursor-grab touch-none " : "") +
        (selezionabile || apribile ? "cursor-pointer" : "")
      }
    >
      {/* Stesso posto e stessa misura del pallino della priorita': quando la
          riga e' presa diventa una spunta piena, e niente si sposta. */}
      {selezionata ? (
        <span className="shrink-0 mt-[3px] w-3 h-3 rounded-full grid place-items-center bg-accent text-bg">
          <Check size={9} sw={3} />
        </span>
      ) : onToggleDone && !selezionabile ? (
        /* **Un `<button>` e non uno `<span>` con `onClick`.** Oltre a essere
           quello che e' — un comando, raggiungibile col tasto — e' anche cio'
           che lo tiene fuori dal trascinamento: `dragKit.start` si tira
           indietro da solo su `input,textarea,button`, quindi premere il
           pallino non prende in mano la riga e non ne apre la scheda al
           rilascio. Il motore non impara nessuna eccezione nuova.

           `stopPropagation` lo stesso, e non e' ridondante: quando la riga non
           e' trascinabile l'apertura non passa dal motore ma da un `onClick`
           suo, e quello il clic se lo prenderebbe salendo. */
        <button
          type="button"
          aria-pressed={task.done}
          aria-label={task.done ? "Riapri la task" : "Completa la task"}
          title={task.done ? "Riapri la task" : "Completa la task"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone();
          }}
          className={
            "shrink-0 mt-[3px] w-3 h-3 p-0 rounded-full grid place-items-center cursor-pointer " +
            /* Piena e spenta da fatta: una spunta dentro un contorno di 12px
               non si legge, e l'accento qui vuol dire "selezionata". Da aperta
               resta il contorno della priorita' e il passaggio del mouse la
               vela appena — un invito al gesto che non sposta niente, che in un
               elenco di righe allineate e' tutto il punto. */
            (task.done
              ? "bg-content/45 text-bg"
              : "bg-transparent hover:bg-content/12")
          }
          style={task.done ? undefined : { border: `2.2px solid ${task.priorityColor}` }}
        >
          {task.done ? <Check size={8} sw={3.2} /> : null}
        </button>
      ) : (
        <span
          className="shrink-0 mt-[3px] w-3 h-3 rounded-full"
          style={{ border: `2.2px solid ${task.priorityColor}` }}
        />
      )}
      <span
        className={
          "flex-1 min-w-0 font-medium text-card tracking-[-0.01em] leading-[1.35] truncate " +
          (task.done ? "line-through text-content/50" : "")
        }
      >
        {task.title}
      </span>
      <div className="flex items-center gap-2.5 shrink-0 text-mini text-content/55">
        {/* I sotto-task si dicono solo quando ce ne sono: è la sola traccia in
            riga del fatto che t_task è ricorsiva. */}
        {task.childCount > 0 ? (
          <span className="whitespace-nowrap tabular-nums" title="Sotto-task completati">
            {task.childDoneCount}/{task.childCount}
          </span>
        ) : null}
        {task.dueAt ? (
          <span className={`whitespace-nowrap ${task.done ? "text-content/42" : ""}`}>
            {dueLabel(task.dueAt)}
          </span>
        ) : null}
        {showProject && task.project ? (
          <span
            className="flex items-center gap-1.5"
            style={{ color: task.done ? undefined : task.project.color }}
          >
            <span
              className="w-[5px] h-[5px] shrink-0 rounded-full"
              style={{ background: task.project.color }}
            />
            {task.project.name}
          </span>
        ) : null}

        {interattivo ? (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMenuAperto((v) => !v)}
              className={`${CHIP_RUOLO[task.state.role]} cursor-pointer`}
              aria-label={`Stato: ${task.state.label}. Cambia stato`}
            >
              {task.state.label}
            </button>
            <Dropdown open={menuAperto} onClose={() => setMenuAperto(false)} align="right" width={200}>
              {states.map((s, i) => (
                <div key={s.id}>
                  {/* Le chiusure stanno dopo una riga: portare una task su uno
                      stato finale non è un passaggio come gli altri — trascina
                      i sotto-task con sé. */}
                  {s.role === "end" && states[i - 1]?.role !== "end" ? <DropdownSeparator /> : null}
                  <DropdownItem
                    selected={task.state.id === s.id}
                    onClick={() => {
                      setMenuAperto(false);
                      onChangeState(task, s);
                    }}
                  >
                    <span className="flex-1">{s.label}</span>
                  </DropdownItem>
                </div>
              ))}
            </Dropdown>
          </div>
        ) : (
          <span className={CHIP_RUOLO[task.state.role]}>{task.state.label}</span>
        )}
      </div>
    </div>
  );
}
