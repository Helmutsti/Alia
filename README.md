# Scheduler

Modulo Node.js per la gestione locale degli item, con un'interfaccia grafica Electron + React in stile "Alia" (design system Nocturne, accento blu).

## Requisiti

- Node.js 22.13 o successivo
- SQLite fornito dal runtime Node.js

## Utilizzo

```js
import { createItemCore } from "./src/index.js";

const core = createItemCore({
  databasePath: "./data/scheduler.sqlite",
});

const item = core.createItem({
  title: "Richiamare il cliente",
  description: "Confermare la data di consegna",
  priority: "high",
  reminderAt: "2026-09-08T09:00:00+02:00",
});

core.activateItem(item.id);
core.completeItem(item.id);
core.close();
```

In Electron, il percorso del database dovra essere costruito nel processo principale usando la cartella dati dell'applicazione:

```js
import { app } from "electron";
import { join } from "node:path";
import { createItemCore } from "./src/index.js";

const core = createItemCore({
  databasePath: join(app.getPath("userData"), "scheduler.sqlite"),
});
```

La futura interfaccia non dovra ricevere l'oggetto `core` direttamente. Il processo principale esporra soltanto le operazioni necessarie attraverso un canale controllato.

## API disponibile

- `createItem(input)`
- `getItem(id, options)`
- `listItems(filters)`
- `updateItem(id, changes)`
- `completeItem(id)`
- `activateItem(id)`
- `moveToInbox(id)`
- `archiveItem(id)`
- `deleteItem(id)`
- `restoreItem(id)`
- `getItemHistory(id)`
- `close()`

`deleteItem` esegue una cancellazione logica. Gli item cancellati sono esclusi dalle letture normali e possono essere recuperati con `restoreItem`.

Il contenuto originale e i dati di provenienza vengono definiti alla creazione e non sono modificabili con `updateItem`.

## Filtri

`listItems` accetta i seguenti filtri facoltativi:

- `status`
- `priority`
- `sourceType`
- `search`
- `dueBefore`
- `dueAfter`
- `includeDeleted`
- `limit` e `offset`
- `orderBy`: `createdAt`, `updatedAt`, `dueAt` o `priority`
- `orderDirection`: `asc` o `desc`

## Test

```powershell
node --test
```

## Interfaccia grafica

L'app Electron vive in `electron/` (main process + preload, che aprono il core reale e lo espongono al renderer solo tramite IPC) e in `renderer/` (React + Vite, stile Nocturne portato dal progetto Alia in Claude Design). Copre per ora Inbox, Oggi, Tutti i task, composer e dettaglio task — Kanban/Calendario/Gantt/progetti/tag arriveranno quando il core avrà quei concetti.

```powershell
npm install
npm run dev     # Vite dev server + Electron con hot reload
```

Per una build di produzione:

```powershell
npm start        # builda il renderer e avvia Electron dal bundle
```

I dati restano nello stesso database SQLite del core, salvato in `app.getPath('userData')/scheduler.sqlite`.
