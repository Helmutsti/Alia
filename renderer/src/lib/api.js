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
};
