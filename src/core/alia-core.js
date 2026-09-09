/* La facciata del core nuovo: lega un database alle funzioni di `task-core.js`
   e le espone come oggetto, sullo stampo di `createItemCore`.

   Serve perché le funzioni del core prendono il database come primo argomento
   — comodo nei test, scomodo da esporre via IPC. Qui il database è legato una
   volta sola, e il processo main può girare le chiamate senza sapere niente
   dello schema.

   L'elenco `ALIA_OPERATIONS` è la superficie pubblica, ed è condiviso con
   `electron/preload.cjs`: aggiungere un'operazione al core senza aggiungerla
   lì la lascia invisibile al renderer. */

import { openDatabase } from "./database.js";
import {
  createTask,
  deleteTask,
  getTask,
  getTaskHistory,
  listMilestones,
  listProjects,
  listStates,
  listTasks,
  migrateTaskExternally,
  reorderRootTasks,
  reorderTasks,
  reparentTask,
  restoreTaskTechnical,
  setTaskProject,
  setTaskState,
  updateTask,
} from "./task-core.js";

export const ALIA_OPERATIONS = [
  "listTasks",
  "getTask",
  "getTaskHistory",
  "listStates",
  "listProjects",
  "listMilestones",
  "createTask",
  "updateTask",
  "setTaskState",
  "setTaskProject",
  "reorderTasks",
  "reparentTask",
  "deleteTask",
  "restoreTask",
  "migrateTask",
];

export function createAliaCore({ databasePath }) {
  const database = openDatabase(databasePath);

  return {
    /* lettura */
    listTasks: (opzioni) => listTasks(database, opzioni),
    getTask: (idTask) => getTask(database, idTask),
    getTaskHistory: (idTask) => getTaskHistory(database, idTask),
    listStates: () => listStates(database),
    listProjects: () => listProjects(database),
    listMilestones: (idProject) => listMilestones(database, idProject),

    /* scrittura — le tre che possono chiedere conferma restituiscono un esito
       invece di lanciare, e vanno richiamate con `decisioni` (vedi task-core) */
    createTask: (input, decisioni) => createTask(database, input, decisioni),
    updateTask: (idTask, patch) => updateTask(database, idTask, patch),
    setTaskState: (idTask, idState, decisioni) => setTaskState(database, idTask, idState, decisioni),
    setTaskProject: (idTask, idProject, idMilestone) =>
      setTaskProject(database, idTask, idProject, idMilestone),
    /* `idParentTask` nullo = le task di primo livello, che hanno una funzione
       a parte perché `IS NULL` non si esprime come parametro. */
    reorderTasks: (idParentTask, orderedIds) =>
      idParentTask == null
        ? reorderRootTasks(database, orderedIds)
        : reorderTasks(database, idParentTask, orderedIds),
    reparentTask: (idTask, idParentTask) => reparentTask(database, idTask, idParentTask),
    deleteTask: (idTask) => deleteTask(database, idTask),
    restoreTask: (idTask, decisioni) => restoreTaskTechnical(database, idTask, decisioni),
    migrateTask: (idTask, idState) => migrateTaskExternally(database, idTask, idState),

    close: () => database.close(),
  };
}
