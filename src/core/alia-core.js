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
  createMilestone,
  createProject,
  createState,
  createTask,
  deleteMilestone,
  deleteProject,
  deleteState,
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
  reorderStates,
  reorderTasks,
  reparentTask,
  restoreTaskTechnical,
  markOriginsSeen,
  setTaskInbox,
  setTaskProject,
  setTaskState,
  updateMilestone,
  updateProject,
  updateState,
  updateTask,
} from "./task-core.js";

export const ALIA_OPERATIONS = [
  "listTasks",
  "getTask",
  "getTaskHistory",
  "listStates",
  /* Configurazione degli stati — la sezione Stati di DEF_Impostazioni.
     Fino a ieri si leggevano soltanto. */
  "createState",
  "updateState",
  "reorderStates",
  "deleteState",
  /* Progetti e milestone — la sezione Progetti di Impostazioni. Come gli
     stati, erano nel modello dal primo giorno e si leggevano soltanto. */
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
  "markOriginsSeen",
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
    /* Stati: `deleteState` può chiedere dove spostare i task che lo usano,
       quindi riceve `decisioni` come le altre tre negoziabili. */
    createState: (input) => createState(database, input),
    updateState: (idState, patch) => updateState(database, idState, patch),
    reorderStates: (orderedIds) => reorderStates(database, orderedIds),
    deleteState: (idState, decisioni) => deleteState(database, idState, decisioni),
    /* `deleteProject` puo' chiedere dove mandare i task che ci vivono dentro,
       quindi riceve `decisioni`. `deleteMilestone` no: i task restano nel
       progetto e perdono solo la fase. */
    createProject: (input) => createProject(database, input),
    updateProject: (idProject, patch) => updateProject(database, idProject, patch),
    deleteProject: (idProject, decisioni) => deleteProject(database, idProject, decisioni),
    createMilestone: (input) => createMilestone(database, input),
    updateMilestone: (idMilestone, patch) => updateMilestone(database, idMilestone, patch),
    deleteMilestone: (idMilestone) => deleteMilestone(database, idMilestone),
    /* Senza argomenti: spegne la campanella su tutte le origini insieme.
       Vedi la nota in task-core.js. */
    markOriginsSeen: () => markOriginsSeen(database),
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
