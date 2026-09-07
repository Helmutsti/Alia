const { contextBridge, ipcRenderer } = require("electron");

const CORE_OPERATIONS = [
  "createItem",
  "getItem",
  "listItems",
  "updateItem",
  "completeItem",
  "activateItem",
  "moveToInbox",
  "archiveItem",
  "deleteItem",
  "restoreItem",
  "getItemHistory",
];

const scheduler = Object.fromEntries(
  CORE_OPERATIONS.map((operation) => [
    operation,
    (...args) => ipcRenderer.invoke(`scheduler:${operation}`, ...args),
  ]),
);

contextBridge.exposeInMainWorld("schedulerCore", scheduler);
