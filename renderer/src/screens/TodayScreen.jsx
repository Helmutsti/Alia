import ListScreen from "./ListScreen.jsx";

/**
 * "Oggi" è la stessa pagina di "Tutti i task": stessa Filter Bar, stessa
 * lista/kanban, stesso Task Row — differisce solo per l'ambito (solo i task
 * con scadenza oggi) e per l'assenza del composer in testa.
 */
export default function TodayScreen({ reloadKey, onOpen, onMutated }) {
  return <ListScreen reloadKey={reloadKey} onOpen={onOpen} onMutated={onMutated} scope="today" />;
}
