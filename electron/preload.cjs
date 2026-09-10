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
  "listTags",
  "listTaskTags",
  "addTaskTag",
  "removeTaskTag",
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

contextBridge.exposeInMainWorld("alia", alia);
