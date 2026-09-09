/* La superficie pubblica del pacchetto: il core "Rinascita".

   Il core precedente (`item-core.js`, con `items`/`subtasks`/`statuses` e
   l'API `createItemCore`) è stato rimosso: era costruito su uno schema che
   `t_task` sostituisce per intero, e non c'era niente da riportare. Le
   migrazioni dalla versione 1 alla 6 restano invece in `core/database.js`,
   perché sono la strada che un database già installato deve percorrere per
   arrivare allo schema nuovo. */

export { ALIA_OPERATIONS, createAliaCore } from "./core/alia-core.js";
export { openDatabase, runInTransaction } from "./core/database.js";
export { TASK_PRIORITIES } from "./core/task-core.js";
