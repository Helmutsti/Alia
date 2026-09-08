import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { PRIORITY_LABELS, STATUS_LABELS, formatWeekdayLong, isSameDay, projectColor } from "../lib/format.js";
import FilterBar from "../components/FilterBar.jsx";
import KanbanBoard from "../components/KanbanBoard.jsx";
import TaskRow from "../components/TaskRow.jsx";

const PRIORITY_ORDER_DESC = ["urgent", "high", "medium", "low", "none"];
const STATUS_KEYS = ["inbox", "active", "completed", "archived"];

const CHANGE_STATUS = {
  inbox: (id) => api.moveToInbox(id),
  active: (id) => api.activateItem(id),
  completed: (id) => api.completeItem(id),
  archived: (id) => api.archiveItem(id),
};

export default function ListScreen({ reloadKey, onOpen, onMutated, scope = "all", pendingProject, onConsumePendingProject }) {
  const isToday = scope === "today";
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [statusMulti, setStatusMulti] = useState([]);
  const [projectMulti, setProjectMulti] = useState([]);
  const [priorityMulti, setPriorityMulti] = useState([]);
  const [sortBy, setSortBy] = useState("dueAt");
  const [sortDir, setSortDir] = useState("asc");
  const [view, setView] = useState("list");
  const [groupingList, setGroupingList] = useState("none");
  const [groupingKanban, setGroupingKanban] = useState("status");
  const [menu, setMenu] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    const rows = await api.listItems({ limit: 200, ...(search.trim() ? { search: search.trim() } : {}) });
    setItems(rows);
  }, [search]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (!pendingProject) return;
    setProjectMulti([pendingProject]);
    onConsumePendingProject?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingProject]);

  function toggleMulti(key, value) {
    const setters = { status: setStatusMulti, project: setProjectMulti, priority: setPriorityMulti };
    setters[key]((list) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]));
  }

  function clearAll() {
    setSearch("");
    setStatusMulti([]);
    setProjectMulti([]);
    setPriorityMulti([]);
    setMenu(null);
  }

  function toggleCollapse(key) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  const scopedItems = useMemo(() => {
    if (!isToday) return items;
    return items.filter((i) => i.dueAt && isSameDay(i.dueAt, new Date()));
  }, [items, isToday]);

  const projectOptions = useMemo(() => {
    const set = new Set(scopedItems.filter((i) => i.project).map((i) => i.project));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [scopedItems]);

  const matchesExcept = useCallback(
    (item, skip) => {
      if (skip !== "status") {
        if (statusMulti.length ? !statusMulti.includes(item.status) : item.status === "archived") return false;
      }
      if (skip !== "project" && projectMulti.length && !projectMulti.includes(item.project)) return false;
      if (skip !== "priority" && priorityMulti.length && !priorityMulti.includes(item.priority)) return false;
      return true;
    },
    [statusMulti, projectMulti, priorityMulti],
  );

  const counts = useMemo(() => {
    const c = { status: {}, project: {}, priority: {} };
    for (const s of STATUS_KEYS) c.status[s] = scopedItems.filter((i) => matchesExcept(i, "status") && i.status === s).length;
    for (const p of projectOptions) c.project[p] = scopedItems.filter((i) => matchesExcept(i, "project") && i.project === p).length;
    for (const p of PRIORITY_ORDER_DESC) c.priority[p] = scopedItems.filter((i) => matchesExcept(i, "priority") && i.priority === p).length;
    return c;
  }, [scopedItems, matchesExcept, projectOptions]);

  const filtered = scopedItems.filter((i) => matchesExcept(i, null));

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "dueAt") {
        const av = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const bv = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        cmp = av - bv;
      } else if (sortBy === "priority") {
        cmp = PRIORITY_ORDER_DESC.indexOf(a.priority) - PRIORITY_ORDER_DESC.indexOf(b.priority);
      } else if (sortBy === "project") {
        cmp = (a.project || "").localeCompare(b.project || "");
      } else if (sortBy === "title") {
        cmp = a.title.localeCompare(b.title);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortBy, sortDir]);

  function buildGroups(list, dim) {
    if (dim === "project") {
      return [...projectOptions, null].map((p) => ({
        key: p ? `project:${p}` : "project:none",
        value: p,
        label: p || "Senza progetto",
        color: p ? projectColor(p) : "color-mix(in srgb, var(--color-text) 62%, transparent)",
        rows: list.filter((i) => (i.project || null) === p),
      }));
    }
    if (dim === "priority") {
      return PRIORITY_ORDER_DESC.map((p) => ({
        key: `priority:${p}`,
        value: p,
        label: PRIORITY_LABELS[p],
        color: p === "urgent" || p === "high" ? "var(--priority-high)" : "color-mix(in srgb, var(--color-text) 62%, transparent)",
        rows: list.filter((i) => i.priority === p),
      }));
    }
    if (dim === "status") {
      return STATUS_KEYS.map((s) => ({
        key: `status:${s}`,
        value: s,
        label: STATUS_LABELS[s],
        color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
        rows: list.filter((i) => i.status === s),
      }));
    }
    return [{ key: "all", value: null, label: "", rows: list }];
  }

  async function toggle(item) {
    if (item.status === "completed") await api.activateItem(item.id);
    else await api.completeItem(item.id);
    onMutated();
  }

  async function postpone(item) {
    const base = item.dueAt ? new Date(item.dueAt) : new Date();
    base.setDate(base.getDate() + 1);
    await api.updateItem(item.id, { dueAt: base.toISOString() });
    onMutated();
  }

  async function remove(item) {
    await api.deleteItem(item.id);
    onMutated();
  }

  async function dropToColumn(item, field, value) {
    if (field === "status") {
      await CHANGE_STATUS[value]?.(item.id);
    } else {
      await api.updateItem(item.id, { [field]: value ?? null });
    }
    onMutated();
  }

  async function addInColumn(field, value, title) {
    const payload = { title, sourceType: "manual" };
    if (value) payload[field] = value;
    await api.createItem(payload);
    onMutated();
  }

  const dim = view === "kanban" ? groupingKanban : groupingList;
  const groups = buildGroups(sorted, dim);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "var(--text-sm)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", marginBottom: 8 }}>
          {isToday ? formatWeekdayLong() : "Elenco"}
        </div>
        <h2 style={{ margin: 0 }}>{isToday ? "Oggi" : "Tutti i task"}</h2>
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        statusMulti={statusMulti}
        projectMulti={projectMulti}
        priorityMulti={priorityMulti}
        onToggleMulti={toggleMulti}
        projectOptions={projectOptions}
        counts={counts}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={setSortBy}
        onToggleSortDir={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
        view={view}
        onSetView={setView}
        grouping={dim}
        onSetGrouping={(g) => (view === "kanban" ? setGroupingKanban(g) : setGroupingList(g))}
        menu={menu}
        onSetMenu={setMenu}
        onClearAll={clearAll}
      />

      <div style={{ flex: 1, minHeight: 0, overflowX: "hidden", overflowY: "auto" }}>
        {view === "kanban" ? (
          <KanbanBoard groups={groups} groupingField={dim} onOpen={onOpen} onToggle={toggle} onDrop={dropToColumn} onAddInColumn={addInColumn} />
        ) : (
          <div style={{ marginTop: 16 }}>
            {dim === "none" && (
              <div style={{ display: "grid", gridTemplateColumns: "14px minmax(0,1fr) 110px 90px 72px", gap: 12, padding: "0 12px 8px", fontSize: "var(--text-xs)", letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 57%, transparent)", borderBottom: "1px solid var(--color-divider)" }}>
                <span />
                <span>Task</span>
                <span>Progetto</span>
                <span>Scadenza</span>
                <span style={{ textAlign: "right" }}>Stato</span>
              </div>
            )}
            {groups
              .filter((g) => g.rows.length > 0)
              .map((g) => (
                <div key={g.key} style={{ marginTop: dim === "none" ? 0 : 18 }}>
                  {dim !== "none" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "0 12px" }}>
                      <button
                        type="button"
                        className="gtoggle"
                        onClick={() => toggleCollapse(g.key)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "none", background: "transparent", cursor: "pointer", padding: 0, color: g.color, fontFamily: "var(--font-body)" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed[g.key] ? "rotate(0deg)" : "rotate(90deg)", opacity: 0.6 }}>
                          <path d="M9 5l7 7-7 7" />
                        </svg>
                        <span style={{ fontSize: "var(--text-sm)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{g.label}</span>
                      </button>
                      <span style={{ fontSize: "var(--text-sm)", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{g.rows.length}</span>
                      <span style={{ height: 1, flex: 1, background: "linear-gradient(to right, var(--color-divider), transparent)" }} />
                    </div>
                  )}
                  {!collapsed[g.key] &&
                    g.rows.map((item) => (
                      <TaskRow
                        key={item.id}
                        item={item}
                        onOpen={onOpen}
                        onToggle={toggle}
                        onPostpone={postpone}
                        onRemove={remove}
                        hideProject={dim === "project"}
                        hideStatus={dim === "status"}
                      />
                    ))}
                </div>
              ))}
            {sorted.length === 0 && (
              <div style={{ padding: "24px 12px", fontSize: "var(--text-base-sm)", color: "color-mix(in srgb, var(--color-text) 58%, transparent)" }}>
                {isToday ? (
                  "Nessun task in scadenza oggi."
                ) : (
                  <>
                    Nessun task con questi filtri.{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); clearAll(); }}>Azzera</a> per rivedere tutto.
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
