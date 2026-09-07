import { useCallback, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import TaskComposer from "./components/TaskComposer.jsx";
import TaskDetailModal from "./components/TaskDetailModal.jsx";
import InboxScreen from "./screens/InboxScreen.jsx";
import TodayScreen from "./screens/TodayScreen.jsx";
import ListScreen from "./screens/ListScreen.jsx";
import { api } from "./lib/api.js";

export default function App() {
  const [view, setView] = useState("inbox");
  const [reloadKey, setReloadKey] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [counts, setCounts] = useState({});

  const bump = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      const [inbox, active, everything] = await Promise.all([
        api.listItems({ status: "inbox", limit: 200 }),
        api.listItems({ status: "active", limit: 200 }),
        api.listItems({ limit: 200 }),
      ]);
      if (cancelled) return;
      setCounts({
        inbox: inbox.length,
        today: active.length,
        list: everything.filter((i) => i.status !== "archived").length,
      });
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    function onKeyDown(e) {
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setComposerOpen(true);
      } else if (e.key === "Escape") {
        setComposerOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function openItem(item) {
    const fresh = await api.getItem(item.id);
    setSelected(fresh);
  }

  function onItemChanged(updated) {
    setSelected(updated);
    bump();
  }

  function onItemDeleted() {
    setSelected(null);
    bump();
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--color-bg)" }}>
      <Sidebar view={view} onNavigate={setView} counts={counts} onAddTask={() => setComposerOpen(true)} />

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "32px 40px 24px", overflow: "hidden" }}>
        {view === "inbox" && <InboxScreen reloadKey={reloadKey} onOpen={openItem} onMutated={bump} />}
        {view === "today" && <TodayScreen reloadKey={reloadKey} onOpen={openItem} />}
        {view === "list" && <ListScreen reloadKey={reloadKey} onOpen={openItem} />}
      </main>

      {composerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "color-mix(in srgb, #0a0b0b 60%, transparent)",
            zIndex: 30,
          }}
          onClick={() => setComposerOpen(false)}
        >
          {/* Centrato sull'area del contenuto (dopo la sidebar), non su tutta la finestra */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 224,
              display: "grid",
              placeItems: "start center",
              paddingTop: 150,
            }}
          >
            <div style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
              <TaskComposer
                mode="floating"
                autoFocus
                onCreated={bump}
                onClose={() => setComposerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {selected && (
        <TaskDetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onChanged={onItemChanged}
          onDeleted={onItemDeleted}
        />
      )}
    </div>
  );
}
