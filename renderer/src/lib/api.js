const scheduler = window.schedulerCore;

if (!scheduler) {
  throw new Error(
    "window.schedulerCore non disponibile: l'app deve girare dentro Electron con preload.cjs caricato.",
  );
}

export const api = {
  createItem: (input) => scheduler.createItem(input),
  getItem: (id, options) => scheduler.getItem(id, options),
  listItems: (filters) => scheduler.listItems(filters),
  updateItem: (id, changes) => scheduler.updateItem(id, changes),
  completeItem: (id) => scheduler.completeItem(id),
  activateItem: (id) => scheduler.activateItem(id),
  moveToInbox: (id) => scheduler.moveToInbox(id),
  archiveItem: (id) => scheduler.archiveItem(id),
  deleteItem: (id) => scheduler.deleteItem(id),
  restoreItem: (id) => scheduler.restoreItem(id),
  getItemHistory: (id) => scheduler.getItemHistory(id),
  addSubtask: (itemId, title) => scheduler.addSubtask(itemId, title),
  toggleSubtask: (subtaskId) => scheduler.toggleSubtask(subtaskId),
  removeSubtask: (subtaskId) => scheduler.removeSubtask(subtaskId),
  addComment: (itemId, body) => scheduler.addComment(itemId, body),
  listStatuses: () => scheduler.listStatuses(),
  createStatus: (input) => scheduler.createStatus(input),
  updateStatus: (id, changes) => scheduler.updateStatus(id, changes),
  deleteStatus: (id) => scheduler.deleteStatus(id),
  reorderStatuses: (orderedIds) => scheduler.reorderStatuses(orderedIds),
  listProjects: () => scheduler.listProjects(),
  createProject: (input) => scheduler.createProject(input),
  updateProject: (id, changes) => scheduler.updateProject(id, changes),
  deleteProject: (id) => scheduler.deleteProject(id),
  reorderProjects: (orderedIds) => scheduler.reorderProjects(orderedIds),
  createList: (projectId, input) => scheduler.createList(projectId, input),
  updateList: (id, changes) => scheduler.updateList(id, changes),
  deleteList: (id) => scheduler.deleteList(id),
  reorderLists: (projectId, orderedIds) => scheduler.reorderLists(projectId, orderedIds),
};
