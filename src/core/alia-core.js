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
  addTaskComment,
  addTaskTag,
  listMilestones,
  listProjects,
  listStates,
  listTaskComments,
  listTaskTags,
  listTags,
  listTasks,
  migrateTaskExternally,
  removeTaskComment,
  removeTaskTag,
  reorderRootTasks,
  reorderTasks,
  reparentTask,
  restoreTaskTechnical,
  setTaskInbox,
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
  "setTaskInbox",
  "reorderTasks",
  "reparentTask",
  "deleteTask",
  "restoreTask",
  "migrateTask",
  /* Tag e commenti: tabelle che lo schema aveva gia e che nessuna operazione
     esponeva. Le chiede il dettaglio del task. */
  "listTags",
  "listTaskTags",
  "addTaskTag",
  "removeTaskTag",
  "listTaskComments",
  "addTaskComment",
  "removeTaskComment",
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
    listTags: () => listTags(database),
    listTaskTags: (idTask) => listTaskTags(database, idTask),
    listTaskComments: (idTask) => listTaskComments(database, idTask),

    /* scrittura — le tre che possono chiedere conferma restituiscono un esito
       invece di lanciare, e vanno richiamate con `decisioni` (vedi task-core) */
    createTask: (input, decisioni) => createTask(database, input, decisioni),
    updateTask: (idTask, patch) => updateTask(database, idTask, patch),
    setTaskState: (idTask, idState, decisioni) => setTaskState(database, idTask, idState, decisioni),
    setTaskProject: (idTask, idProject, idMilestone) =>
      setTaskProject(database, idTask, idProject, idMilestone),
    setTaskInbox: (idTask, inInbox) => setTaskInbox(database, idTask, inInbox),
    addTaskTag: (idTask, label) => addTaskTag(database, idTask, label),
    removeTaskTag: (idTask, idTag) => removeTaskTag(database, idTask, idTag),
    addTaskComment: (idTask, body) => addTaskComment(database, idTask, body),
    removeTaskComment: (idTaskComment) => removeTaskComment(database, idTaskComment),
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
