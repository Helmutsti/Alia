const { contextBridge, ipcRenderer } = require("electron");

/* Copia dell'elenco `ALIA_OPERATIONS` di src/core/alia-core.js.
   È duplicato per forza: il preload gira in CommonJS in un contesto isolato e
   non può importare il modulo ESM del core. Se qui manca un'operazione, il
   renderer non la vede — quindi i due elenchi vanno tenuti allineati a mano. */
const ALIA_OPERATIONS = [
  "listTasks",
  "getTask",
  "getTaskHistory",
  "listStates",
  "createState",
  "updateState",
  "reorderStates",
  "deleteState",
  "createProject",
  "updateProject",
  "deleteProject",
  "createMilestone",
  "updateMilestone",
  "deleteMilestone",
  "listProjects",
  "listMilestones",
  "createTask",
  "updateTask",
  "setTaskState",
  "setTaskProject",
  "setTaskInbox",
  "reorderTasks",
  "reparentTask",
  "deleteTask",
  "restoreTask",
  "migrateTask",
  "listTags",
  "listTaskTags",
  "addTaskTag",
  "removeTaskTag",
  "getSetting",
  "setSetting",
  "listSettings",
  "removeSettings",
  "listTaskComments",
  "addTaskComment",
  "removeTaskComment",
];

const alia = Object.fromEntries(
  ALIA_OPERATIONS.map((operation) => [
    operation,
    (...args) => ipcRenderer.invoke(`alia:${operation}`, ...args),
  ]),
);

/* L'unico canale nel verso opposto: main avvisa il renderer che una sorgente
   esterna ha scritto qualcosa (vedi `avvisaFinestre` in main.js). Non è
   un'operazione del core e non sta in `ALIA_OPERATIONS` — quelle sono tutte
   domande con una risposta, questa è un colpetto sulla spalla.

   Restituisce la funzione per disiscriversi, che è la forma che si aspetta un
   `useEffect`: senza, ogni rimontaggio del provider lascerebbe un ascoltatore
   in più attaccato al canale. */
alia.onOrigini = (callback) => {
  const ascoltatore = () => callback();
  ipcRenderer.on("alia:origini", ascoltatore);
  return () => ipcRenderer.off("alia:origini", ascoltatore);
};

/* La confluenza: un oggetto suo, non una voce di `alia`. Il ponte `alia` e' il
   core — domande al database, tutte con una risposta. La confluenza e' un
   servizio esterno che puo' non esserci, e le sue chiamate restituiscono un
   esito da mostrare invece di un dato da usare: tenerle in un oggetto separato
   dice questa differenza senza doverla spiegare. */
const OPERAZIONI_CONFLUENZA = ["leggiConfig", "scriviConfig", "elenco", "accetta", "rifiuta", "provaCollegamento", "stato"];

contextBridge.exposeInMainWorld(
  "confluenza",
  Object.fromEntries(
    OPERAZIONI_CONFLUENZA.map((operazione) => [
      operazione,
      (...args) => ipcRenderer.invoke(`confluenza:${operazione}`, ...args),
    ]),
  ),
);

contextBridge.exposeInMainWorld("alia", alia);
