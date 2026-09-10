import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, PathIcon } from "../components/icons.jsx";
import { InboxCard } from "./InboxCard.jsx";
import { TaskRow } from "./TaskRow.jsx";
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from "./Dropdown.jsx";
import {
  GROUP_KEYS,
  SHOW_DONE,
  SORT_KEYS,
  activeFilterCount,
  filterGroups,
  filterTasks,
  groupTasks,
  sortTasks,
} from "./contentQuery.js";
import { VIEW_BLOCKED, VIEW_ICONS, VIEW_LABELS, VIEW_ORDER } from "./data.js";
import { useAlia } from "../lib/AliaProvider.jsx";
import { dueLabel, giorniDiScarto } from "../lib/tasks.js";

/* Area contenuto — testata risolta in DEF_Content.

   Riga 1: a sinistra il progetto (20px, senza bordi, pallino e freccia), a
   destra la vista. Sono le due scelte che valgono per tutte le viste.
   Riga 2: gli strumenti della vista corrente. In Lista: ordinamento, filtro,
   raggruppamento. Misura 94px in tutto, contro i 141 della versione a tre file
   che aveva ambito, tab e filtri su righe separate.

   Fuori: la barra di ricerca, le chip Priorità/Milestone e la tab "Oggi".
   La ricerca non era stata decisa; le chip sono confluite nel menu filtri; gli
   intervalli temporali, non essendo chiavi di raggruppamento, stanno nel filtro
   e hanno reso la tab superflua.

   Il selettore di progetto non ha la voce "Senza progetto": quelle task vivono
   nella sezione "Da smistare". Compaiono qui come *gruppo*, quando si raggruppa
   per progetto — che è un'altra cosa. */

const CTL =
  "inline-flex items-center gap-[7px] h-8 px-3 rounded-lg border border-divider bg-transparent " +
  "cursor-pointer text-[12.5px] hover:border-accent";
const CTL_MUT = `${CTL} text-content/70`;
const PICK =
  "inline-flex items-center gap-[9px] border-0 bg-transparent cursor-pointer text-content " +
  "font-medium tracking-[-0.015em] px-1 py-0.5 rounded-md leading-[1.2] text-lg " +
  "hover:bg-[color-mix(in_srgb,var(--color-content)_7%,transparent)]";

export function ContentPane({ onOpenTask, onRowPointerDown, onOrdinamento, anteprima }) {
  const alia = useAlia();
  const [scope, setScope] = useState("all");
  /* Parte da "lista", l'unica vista non bloccata, e `setView` rifiuta le altre:
     `view` non puo quindi assumere il valore di una vista bloccata. */
  const [view, setView] = useState("lista");
  const [sortKey, setSortKey] = useState("scadenza");
  const [sortDir, setSortDir] = useState("asc");
  const [group, setGroup] = useState("progetto");
  const [filters, setFilters] = useState(() => new Set());
  const [menu, setMenu] = useState(null);

  /* L'ordinamento in uso viene riferito a chi ospita il pannello, perche' il
     rilascio del trascinamento deve sapere se la posizione ha un senso: con un
     ordinamento calcolato (scadenza, priorita', titolo) scriverla non si
     vedrebbe, il task salterebbe subito dove lo mette l'ordinamento. */
  useEffect(() => {
    onOrdinamento?.(sortKey);
  }, [onOrdinamento, sortKey]);

  const chiudi = useCallback(() => setMenu(null), []);
  const apri = (id) => setMenu((m) => (m === id ? null : id));

  const toggleFiltro = (id) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { tasks, projects, states } = alia;
  const progetto = projects.find((p) => p.id === scope);
  const nFiltri = activeFilterCount(filters);
  const gruppiFiltro = useMemo(() => filterGroups(states), [states]);

  /* L'area contenuto mostra le task di primo livello: i sotto-task appartengono
     al loro padre e si leggono nel dettaglio, non come righe pari agli altri.
     Senza questo, un task con tre figli occuperebbe quattro righe. */
  const radici = useMemo(() => tasks.filter((t) => t.parentId === null), [tasks]);

  /* Ambito → filtri → ordinamento → gruppi, in quest'ordine: l'ambito decide
     l'insieme di partenza, il resto lavora su quello. */
  /* L'anteprima del trascinamento, applicata **solo a schermo**.

     La riga trascinata viene togliata dal gruppo in cui sta e inserita nel
     gruppo bersaglio, prima della riga sotto cui cadrebbe: le righe seguenti
     scorrono di una posizione e si apre il varco che accogliera' l'elemento,
     come fanno le card nella colonna.

     Perche' qui e non riordinando l'array dei task, che sarebbe la strada
     ovvia: l'elenco e ordinato per scadenza (o priorita', o titolo), quindi
     l'ordine dell'array non decide niente e rimescolarlo produrrebbe uno
     spostamento arbitrario. E soprattutto, riordinando l'array si
     ri-impaginavano tutti i gruppi a ogni pixel di movimento, che e' il
     difetto per cui trascinando una riga si muoveva tutto. Qui si sposta un
     elemento e nient'altro. */
  const conAnteprima = useCallback(
    (gruppi) => {
      if (!anteprima?.groupId) return gruppi;
      const trascinata = tasks.find((t) => t.id === anteprima.id);
      if (!trascinata) return gruppi;

      return gruppi.map((g) => {
        const senza = g.items.filter((t) => t.id !== anteprima.id);
        if (g.id !== anteprima.groupId) {
          return senza.length === g.items.length ? g : { ...g, items: senza };
        }
        const dove = anteprima.beforeId
          ? senza.findIndex((t) => String(t.id) === String(anteprima.beforeId))
          : -1;
        const items = senza.slice();
        items.splice(dove === -1 ? items.length : dove, 0, trascinata);
        return { ...g, items };
      });
    },
    [anteprima, tasks],
  );

  const gruppi = useMemo(() => {
    const inAmbito = scope === "all" ? radici : radici.filter((t) => t.project?.id === scope);
    const visibili = sortTasks(filterTasks(inAmbito, filters, gruppiFiltro), sortKey, sortDir);
    return conAnteprima(groupTasks(visibili, view === "lista" ? group : "nessuno", { projects, states }));
  }, [radici, scope, filters, gruppiFiltro, sortKey, sortDir, group, view, projects, states, conAnteprima]);

  const totale = gruppi.reduce((n, g) => n + g.items.length, 0);

  /* Le colonne del Kanban sono gli stati configurati, in ordine di `stepOrder`:
     non tre colonne fisse. Le chiusure si accorpano nell'ultima, altrimenti con
     quattro stati finali il Kanban diventerebbe una fila di colonne vuote. */
  const colonneKanban = useMemo(() => {
    const visibili = gruppi.flatMap((g) => g.items);
    const aperti = states.filter((s) => s.role !== "end").sort((a, b) => a.stepOrder - b.stepOrder);
    const chiusure = states.filter((s) => s.role === "end");
    const colonne = aperti.map((s) => ({
      key: `s${s.id}`,
      label: s.label,
      items: visibili.filter((t) => t.state.id === s.id),
    }));
    if (chiusure.length > 0) {
      colonne.push({ key: "chiuse", label: "Chiuse", items: visibili.filter((t) => t.done) });
    }
    return colonne;
  }, [gruppi, states]);

  /* Calendario e Gantt restano le viste abbozzate che erano — l'utente ha
     rimandato il loro disegno — ma smettono di mostrare dati inventati: i
     punti sono le scadenze vere del mese corrente, le barre le task che hanno
     davvero un intervallo `startAt`→`dueAt`. */
  const giorniDelMese = useMemo(() => {
    const oggi = new Date();
    return new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0).getDate();
  }, []);

  const barreGantt = useMemo(() => {
    const conIntervallo = gruppi
      .flatMap((g) => g.items)
      .filter((t) => t.startAt && t.dueAt)
      .slice(0, 8);
    if (conIntervallo.length === 0) return [];

    const inizi = conIntervallo.map((t) => new Date(t.startAt).getTime());
    const fini = conIntervallo.map((t) => new Date(t.dueAt).getTime());
    const da = Math.min(...inizi);
    const a = Math.max(...fini);
    const ampiezza = Math.max(1, a - da);
    return conIntervallo.map((t) => ({
      id: t.id,
      label: t.title,
      left: ((new Date(t.startAt).getTime() - da) / ampiezza) * 100,
      width: Math.max(2, ((new Date(t.dueAt).getTime() - new Date(t.startAt).getTime()) / ampiezza) * 100),
    }));
  }, [gruppi]);

  const puntiCalendario = useMemo(() => {
    const oggi = new Date();
    return new Set(
      gruppi
        .flatMap((g) => g.items)
        .map((t) => (t.dueAt ? new Date(t.dueAt) : null))
        .filter((d) => d && d.getMonth() === oggi.getMonth() && d.getFullYear() === oggi.getFullYear())
        .map((d) => d.getDate()),
    );
  }, [gruppi]);

  /* Il progetto nella riga solo quando non è già la chiave del gruppo e
     l'ambito è su tutti: altrimenti sarebbe la stessa parola su ogni riga. */
  const mostraProgetto = scope === "all" && group !== "progetto";

  /* Il Kanban dispone le task in colonne, quindi lì sono card e non righe:
     è la stessa distinzione che tiene separati TaskRow e InboxCard. */
  const kanbanCard = (t) => (
    <InboxCard
      key={t.id}
      id={t.id}
      title={t.title}
      due={dueLabel(t.dueAt)}
      titleSize="text-meta"
      dueSize="text-[10.5px]"
      priorityColor={t.priorityColor}
    />
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col px-6 py-5 overflow-hidden relative">
      {/* ═══ riga 1 — cosa guardo · in che forma ═══ */}
      <div className="flex items-center h-[34px] mb-3 shrink-0">
        <div className="relative">
          <button type="button" onClick={() => apri("progetto")} className={PICK}>
            {progetto ? (
              <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: progetto.color }} />
            ) : (
              <span className="w-[9px] h-[9px] rounded-full shrink-0 border-[1.4px] border-dashed border-content/55" />
            )}
            {progetto ? progetto.name : "Tutti i progetti"}
            <ChevronDown size={14} className="opacity-65 shrink-0 ml-0.5" />
          </button>
          <Dropdown open={menu === "progetto"} onClose={chiudi} width={236}>
            <DropdownItem
              selected={scope === "all"}
              onClick={() => {
                setScope("all");
                chiudi();
              }}
            >
              <span className="w-[9px] h-[9px] rounded-full shrink-0 border-[1.4px] border-dashed border-content/55" />
              <span className="flex-1">Tutti i progetti</span>
              <span className="text-mini opacity-70">{radici.length}</span>
            </DropdownItem>
            <DropdownSeparator />
            {projects.map((p) => (
              <DropdownItem
                key={p.id}
                selected={scope === p.id}
                onClick={() => {
                  setScope(p.id);
                  chiudi();
                }}
              >
                <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: p.color }} />
                <span className="flex-1">{p.name}</span>
                <span className="text-mini opacity-70">
                  {radici.filter((t) => t.project?.id === p.id).length}
                </span>
              </DropdownItem>
            ))}
          </Dropdown>
        </div>

        <span className="ml-2 text-sm text-content/42">{totale} task</span>
        <span className="flex-1" />

        <div className="relative">
          <button type="button" onClick={() => apri("vista")} className={CTL}>
            <PathIcon d={VIEW_ICONS[view]} size={14} />
            {VIEW_LABELS[view]}
            <ChevronDown size={11} className="opacity-70" />
          </button>
          <Dropdown open={menu === "vista"} onClose={chiudi} align="right" width={180}>
            {VIEW_ORDER.map((v) => (
              <DropdownItem
                key={v}
                selected={view === v}
                disabled={VIEW_BLOCKED.has(v)}
                onClick={() => {
                  /* Il controllo c'e anche qui e non solo nel `disabled`: il
                     bottone disabilitato basta per il mouse, questo copre
                     un'attivazione che arrivasse da altro (tastiera, test). */
                  if (VIEW_BLOCKED.has(v)) return;
                  setView(v);
                  chiudi();
                }}
              >
                <PathIcon d={VIEW_ICONS[v]} size={14} />
                <span className="flex-1">{VIEW_LABELS[v]}</span>
                {VIEW_BLOCKED.has(v) ? (
                  <span className="text-[10px] text-content/40">non attiva</span>
                ) : null}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* ═══ riga 2 — strumenti della vista ═══ */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="relative">
          <button type="button" onClick={() => apri("ordina")} className={CTL_MUT}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h13M4 12h9M4 18h5" />
            </svg>
            Ordina: {SORT_KEYS.find((k) => k.id === sortKey).label.toLowerCase()}
            <ChevronDown size={11} className="opacity-70" />
          </button>
          <Dropdown open={menu === "ordina"} onClose={chiudi} width={200}>
            {SORT_KEYS.map((k) => (
              <DropdownItem key={k.id} selected={sortKey === k.id} onClick={() => setSortKey(k.id)}>
                <span className="flex-1">{k.label}</span>
              </DropdownItem>
            ))}
            <DropdownSeparator />
            {/* La direzione è una seconda scelta, non una sesta chiave: separata,
                e spenta quando l'ordine è manuale perché lì non vuol dire nulla. */}
            {sortKey === "manuale" ? (
              <p className="text-mini text-content/38 px-[9px] py-2 m-0">
                L’ordine manuale non ha direzione.
              </p>
            ) : (
              ["asc", "desc"].map((d) => (
                <DropdownItem key={d} selected={sortDir === d} onClick={() => setSortDir(d)}>
                  <span className="flex-1">{d === "asc" ? "Crescente" : "Decrescente"}</span>
                </DropdownItem>
              ))
            )}
          </Dropdown>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => apri("filtri")}
            className={nFiltri ? CTL : CTL_MUT}
            aria-label={nFiltri ? `Filtri, ${nFiltri} attivi` : "Filtri"}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16l-6 7v5l-4 2v-7z" />
            </svg>
            Filtri
            {nFiltri > 0 ? (
              <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-accent text-bg text-micro font-medium">
                {nFiltri}
              </span>
            ) : null}
          </button>
          <Dropdown open={menu === "filtri"} onClose={chiudi} width={224}>
            {gruppiFiltro.map((g, i) => (
              <div key={g.id}>
                {i > 0 ? <DropdownSeparator /> : null}
                <DropdownLabel>{g.label}</DropdownLabel>
                {g.items.map((f) => (
                  /* Il menu non si chiude: accendere due filtri di fila non
                     deve costare due aperture. */
                  <DropdownItem key={f.id} selected={filters.has(f.id)} onClick={() => toggleFiltro(f.id)}>
                    <span className="flex-1">{f.label}</span>
                  </DropdownItem>
                ))}
              </div>
            ))}
            <DropdownItem selected={filters.has(SHOW_DONE.id)} onClick={() => toggleFiltro(SHOW_DONE.id)}>
              <span className="flex-1">{SHOW_DONE.label}</span>
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onClick={() => setFilters(new Set())}>
              <span className="flex-1">Azzera i filtri</span>
            </DropdownItem>
          </Dropdown>
        </div>

        {view === "lista" ? (
          <div className="relative">
            <button type="button" onClick={() => apri("raggruppa")} className={CTL_MUT}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 5h16M4 12h16M4 19h16" opacity=".45" />
                <path d="M4 5h6M4 12h6M4 19h6" />
              </svg>
              Raggruppa: {GROUP_KEYS.find((k) => k.id === group).label.toLowerCase()}
              <ChevronDown size={11} className="opacity-70" />
            </button>
            <Dropdown open={menu === "raggruppa"} onClose={chiudi} width={200}>
              {GROUP_KEYS.map((k) => (
                <DropdownItem
                  key={k.id}
                  selected={group === k.id}
                  onClick={() => {
                    setGroup(k.id);
                    chiudi();
                  }}
                >
                  <span className="flex-1">{k.label}</span>
                </DropdownItem>
              ))}
            </Dropdown>
          </div>
        ) : null}
      </div>

      {/* ═══ vista Lista ═══ */}
      {view === "lista" ? (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {totale === 0 ? (
            <p className="text-meta text-content/45 m-0 pt-2">
              Nessuna task con questi filtri.
            </p>
          ) : (
            gruppi.map((g) => (
              <div
                key={g.id}
                /* Bersaglio del rilascio solo raggruppando per progetto: e' il
                   solo raggruppamento in cui il gruppo identifica un valore
                   assegnabile senza ambiguita'. Sugli altri l'attributo non
                   c'e', quindi il motore non trova bersagli e il rilascio viene
                   rifiutato da se' — senza un elenco di casi da mantenere. */
                data-drop-group={group === "progetto" ? g.id : undefined}
                className="flex flex-col gap-2 rounded-lg transition-colors duration-[120ms]">
                {g.label ? (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="flex items-center gap-1.5 text-[10.5px] tracking-[0.1em] uppercase font-medium text-content/62">
                      {g.dot ? (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.dot }} />
                      ) : null}
                      {g.dashed ? (
                        <span className="w-1.5 h-1.5 rounded-full border-[1.4px] border-dashed border-content/55" />
                      ) : null}
                      {g.label}
                    </span>
                    <span className="text-mini text-content/42">{g.items.length}</span>
                    <span className="flex-1 h-px bg-divider" />
                  </div>
                ) : null}
                {g.items.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    showProject={mostraProgetto}
                    states={states}
                    onChangeState={(task, stato) => alia.cambiaStato(task.id, stato.id)}
                    onOpen={onOpenTask ? () => onOpenTask(t.id) : undefined}
                    onPointerDown={
                      onRowPointerDown && group === "progetto"
                        ? (e) => onRowPointerDown(t.id, e)
                        : undefined
                    }
                  />
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* ═══ vista Kanban ═══ */}
      {view === "kanban" ? (
        <div className="flex-1 min-h-0 flex gap-3.5 overflow-x-auto">
          {colonneKanban.map((col) => (
            <div key={col.key} className="flex-[0_0_220px] flex flex-col gap-2 overflow-y-auto">
              <div className="text-mini tracking-[0.1em] uppercase font-medium text-content/62 px-0.5 mb-1">
                {col.label} <span className="font-normal text-content/50">{col.items.length}</span>
              </div>
              {col.items.map((t) => kanbanCard(t))}
            </div>
          ))}
        </div>
      ) : null}

      {/* ═══ vista Calendario ═══ */}
      {view === "calendario" ? (
        <div className="flex-1 min-h-0 grid grid-cols-7 auto-rows-fr gap-1.5">
          {Array.from({ length: giorniDelMese }, (_, i) => i + 1).map((day) => (
            <div key={day} className="border border-divider rounded-sm p-1.5 flex flex-col gap-1">
              <span className="text-micro text-content/50">{day}</span>
              {puntiCalendario.has(day) ? <span className="w-[5px] h-[5px] rounded-full bg-accent" /> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ═══ vista Gantt ═══ */}
      {view === "gantt" ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2.5 justify-center">
          {barreGantt.length === 0 ? (
            <p className="text-meta text-content/45 m-0">
              Nessuna task con un intervallo: il Gantt mostra solo quelle che hanno sia inizio che
              scadenza.
            </p>
          ) : null}
          {barreGantt.map((bar) => (
            <div key={bar.id} className="flex items-center gap-2.5">
              <span className="flex-[0_0_90px] text-[11.5px] text-content/60">{bar.label}</span>
              <div className="flex-1 h-4 rounded-sm relative overflow-hidden bg-content/6">
                <div
                  className="absolute inset-y-0 bg-accent rounded-sm opacity-85"
                  style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
