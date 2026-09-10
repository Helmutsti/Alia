import { useState } from "react";

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

export function TaskRow({ task, showProject = false, states = [], onChangeState, onOpen }) {
  const [menuAperto, setMenuAperto] = useState(false);
  const interattivo = typeof onChangeState === "function" && states.length > 0;
  const apribile = typeof onOpen === "function";

  return (
    <div
      data-row={task.id}
      /* La riga intera apre il dettaglio, come la card dell'Inbox. Il chip di
         stato e il suo menu, che stanno dentro la riga, fermano la
         propagazione: cambiare stato da qui e un gesto suo, e non deve anche
         aprire la scheda. */
      onClick={apribile ? () => onOpen(task) : undefined}
      role={apribile ? "button" : undefined}
      tabIndex={apribile ? 0 : undefined}
      onKeyDown={
        apribile
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(task);
              }
            }
          : undefined
      }
      className={
        "flex items-start gap-2.5 px-[13px] py-3 rounded-lg border-[1.5px] border-card-line " +
        "bg-elevated transition-colors duration-[120ms] hover:border-card-line-hover " +
        (apribile ? "cursor-pointer" : "")
      }
    >
      <span
        className="shrink-0 mt-[3px] w-3 h-3 rounded-full"
        style={{ border: `2.2px solid ${task.priorityColor}` }}
      />
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
