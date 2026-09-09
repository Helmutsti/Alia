/* Il ponte verso il core.

   In Electron il preload espone `window.alia`, che gira ogni chiamata al
   processo main via IPC. Fuori da Electron — la pagina di anteprima servita da
   Vite nel browser, quella che serve a confrontare le schermate con gli
   artboard — quel ponte non esiste. Lì non si finge di avere un core: si dice
   che non c'è, e la schermata lo mostra. Un finto database in memoria
   sembrerebbe funzionare e coprirebbe proprio gli errori che l'innesto deve
   far emergere. */

export const bridge = typeof window !== "undefined" ? window.alia : undefined;

export const hasCore = Boolean(bridge);

/* Le chiamate al core attraversano l'IPC, quindi sono asincrone anche quando
   il core sottostante è sincrono. Questo wrapper serve solo a dare un errore
   leggibile invece di un `undefined is not a function` quando si chiama una
   operazione che il preload non espone (i due elenchi vanno tenuti allineati:
   vedi il commento in electron/preload.cjs). */
function chiama(operazione, ...args) {
  if (!bridge) {
    return Promise.reject(new Error("Core non disponibile: questa pagina gira fuori da Electron."));
  }
  const fn = bridge[operazione];
  if (typeof fn !== "function") {
    return Promise.reject(new Error(`Operazione non esposta dal preload: ${operazione}`));
  }
  return fn(...args);
}

export const core = {
  listTasks: (opzioni) => chiama("listTasks", opzioni),
  getTask: (id) => chiama("getTask", id),
  getTaskHistory: (id) => chiama("getTaskHistory", id),
  listStates: () => chiama("listStates"),
  listProjects: () => chiama("listProjects"),
  listMilestones: (idProject) => chiama("listMilestones", idProject),

  createTask: (input, decisioni) => chiama("createTask", input, decisioni),
  updateTask: (id, patch) => chiama("updateTask", id, patch),
  setTaskState: (id, idState, decisioni) => chiama("setTaskState", id, idState, decisioni),
  setTaskProject: (id, idProject, idMilestone) => chiama("setTaskProject", id, idProject, idMilestone),
  reorderTasks: (idParent, orderedIds) => chiama("reorderTasks", idParent, orderedIds),
  reparentTask: (id, idParent) => chiama("reparentTask", id, idParent),
  deleteTask: (id) => chiama("deleteTask", id),
  restoreTask: (id, decisioni) => chiama("restoreTask", id, decisioni),
  migrateTask: (id, idState) => chiama("migrateTask", id, idState),
};
