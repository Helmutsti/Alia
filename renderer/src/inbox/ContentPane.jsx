import { useMemo, useState } from "react";
import { Check, ChevronDown, Layers, PathIcon, Search } from "../components/icons.jsx";
import { InboxCard } from "./InboxCard.jsx";
import {
  CALENDAR_DOTS,
  CONTENT_TASKS,
  GANTT_BARS,
  PRIORITY_COLOR,
  PROJECTS,
  VIEW_ICONS,
  VIEW_LABELS,
  VIEW_ORDER,
} from "./data.js";

/* Area contenuto della schermata principale — da DEF_Inbox min: selettore
   d'ambito, tab, filtri e le quattro viste (Lista, Kanban, Calendario, Gantt).

   Estratta dalla schermata perché durante il movimento verso la Full Inbox il
   pannello si spegne come blocco unico: chi lo posiziona e lo dissolve è
   InboxWorkspace, qui c'è solo il contenuto. */

const VIEW_BTN =
  "flex items-center rounded-lg border border-divider bg-transparent cursor-pointer hover:border-accent";
const MENU = "absolute top-[38px] z-10 p-1.5 rounded-lg border border-divider bg-surface shadow-elev-lg";
const MENU_ITEM =
  "flex items-center gap-[9px] px-[9px] py-2 w-full text-left rounded-sm border-none bg-transparent " +
  "cursor-pointer text-[12.5px] hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]";
const CHIP =
  "h-8 px-3 rounded-lg border border-divider bg-transparent cursor-pointer text-[12.5px] " +
  "text-content/70 hover:border-[color-mix(in_srgb,var(--color-content)_30%,transparent)]";

export function ContentPane() {
  const [view, setView] = useState("lista");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [scope, setScope] = useState("all");
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);

  const scopeMap = useMemo(() => {
    const map = { all: { label: "Tutti i progetti", dot: null, count: 20 } };
    PROJECTS.forEach((p) => (map[p.id] = { label: p.label, dot: p.dot, count: p.count }));
    return map;
  }, []);
  const currentScope = scopeMap[scope];

  const byStatus = useMemo(() => {
    const groups = { todo: [], doing: [], done: [] };
    CONTENT_TASKS.forEach((t) => groups[t.status].push(t));
    return groups;
  }, []);

  return (
    <div className="flex-1 min-w-0 flex flex-col px-6 py-5 overflow-hidden relative">
      {/* selettore d'ambito */}
      <div className="relative mb-3.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            setScopeMenuOpen((v) => !v);
            setViewMenuOpen(false);
          }}
          className={`${VIEW_BTN} w-full justify-between h-[34px] pl-3 pr-2.5 text-content/85 text-[12.5px]`}
        >
          <span className="inline-flex items-center gap-2 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis">
            {currentScope.dot ? (
              <span className="shrink-0 w-[7px] h-[7px] rounded-full" style={{ background: currentScope.dot }} />
            ) : null}
            <span className="overflow-hidden text-ellipsis">{currentScope.label}</span>
          </span>
          <ChevronDown
            size={11}
            className="shrink-0 opacity-70"
            style={{ transform: `rotate(${scopeMenuOpen ? 180 : 0}deg)` }}
          />
        </button>
        {scopeMenuOpen ? (
          <div className={`${MENU} left-0 right-0`}>
            <button
              type="button"
              onClick={() => {
                setScope("all");
                setScopeMenuOpen(false);
              }}
              className={MENU_ITEM}
              style={{ color: scope === "all" ? "var(--color-accent)" : "var(--color-content)" }}
            >
              <Layers size={13} />
              <span className="flex-1 text-left">Tutti i progetti</span>
              <span className="text-mini opacity-70">20</span>
            </button>
            <div className="h-px my-1 mx-0.5 bg-divider" />
            {PROJECTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setScope(p.id);
                  setScopeMenuOpen(false);
                }}
                className={MENU_ITEM}
                style={{ color: scope === p.id ? "var(--color-accent)" : "var(--color-content)" }}
              >
                <span className="shrink-0 w-[7px] h-[7px] rounded-full" style={{ background: p.dot }} />
                <span className="flex-1 text-left">{p.label}</span>
                <span className="text-mini opacity-70">{p.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* tab */}
      <div className="flex items-center gap-6 border-b border-divider mb-4 shrink-0">
        <button
          type="button"
          className="sp-tab-active relative border-none bg-transparent cursor-pointer px-0.5 pb-2.5 font-medium text-card text-content"
        >
          Oggi
        </button>
      </div>

      {/* filtri e selettore vista */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="flex items-center gap-[7px] h-8 px-[11px] rounded-lg border border-divider text-content/55 text-[12.5px]">
          <Search size={13} />
          Cerca…
        </div>
        <button type="button" className={CHIP}>
          Priorità
        </button>
        <button type="button" className={CHIP}>
          Milestone
        </button>

        <div className="ml-auto relative">
          <button
            type="button"
            onClick={() => {
              setViewMenuOpen((v) => !v);
              setScopeMenuOpen(false);
            }}
            className={`${VIEW_BTN} h-8 pl-[11px] pr-2.5 gap-[7px] text-content/82 text-[12.5px]`}
          >
            <PathIcon d={VIEW_ICONS[view]} size={14} />
            {VIEW_LABELS[view]}
            <ChevronDown
              size={11}
              className="opacity-70"
              style={{ transform: `rotate(${viewMenuOpen ? 180 : 0}deg)` }}
            />
          </button>
          {viewMenuOpen ? (
            <div className={`${MENU} right-0 w-[168px]`}>
              {VIEW_ORDER.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setView(v);
                    setViewMenuOpen(false);
                  }}
                  className={MENU_ITEM}
                  style={{ color: view === v ? "var(--color-accent)" : "var(--color-content)" }}
                >
                  <PathIcon d={VIEW_ICONS[v]} size={14} />
                  {VIEW_LABELS[v]}
                  {view === v ? <Check size={13} className="ml-auto" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* — vista Lista — */}
      {view === "lista" ? (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {CONTENT_TASKS.map((t) => (
            <InboxCard
              key={t.id}
              id={t.id}
              title={t.title}
              due={t.due}
              priorityColor={PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.Nessuna}
            />
          ))}
        </div>
      ) : null}

      {/* — vista Kanban — */}
      {view === "kanban" ? (
        <div className="flex-1 min-h-0 flex gap-3.5 overflow-x-auto">
          {[
            { label: "Da fare", items: byStatus.todo },
            { label: "In corso", items: byStatus.doing },
            { label: "Fatto", items: byStatus.done },
          ].map((col) => (
            <div key={col.label} className="flex-[0_0_220px] flex flex-col gap-2 overflow-y-auto">
              <div className="text-mini tracking-[0.1em] uppercase font-medium text-content/62 px-0.5 mb-1">
                {col.label} <span className="font-normal text-content/50">{col.items.length}</span>
              </div>
              {col.items.map((t) => (
                <InboxCard
                  key={t.id}
                  id={t.id}
                  title={t.title}
                  due={t.due}
                  titleSize="text-meta"
                  dueSize="text-[10.5px]"
                  priorityColor={PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.Nessuna}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* — vista Calendario — */}
      {view === "calendario" ? (
        <div className="flex-1 min-h-0 grid grid-cols-7 auto-rows-fr gap-1.5">
          {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
            <div key={day} className="border border-divider rounded-sm p-1.5 flex flex-col gap-1">
              <span className="text-micro text-content/50">{day}</span>
              {CALENDAR_DOTS.includes(day) ? <span className="w-[5px] h-[5px] rounded-full bg-accent" /> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* — vista Gantt — */}
      {view === "gantt" ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2.5 justify-center">
          {GANTT_BARS.map((bar) => (
            <div key={bar.label} className="flex items-center gap-2.5">
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
