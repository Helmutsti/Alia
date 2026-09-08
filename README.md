# Alia

Task manager locale (core Node.js + interfaccia grafica Electron/React in stile "Alia", design system Nocturne, accento blu).

## Requisiti

- Node.js 22.13 o successivo
- SQLite fornito dal runtime Node.js

## Installazione come comando globale

Ogni GitHub Release pubblicata fa scattare la pipeline `.github/workflows/release.yml`, che builda il renderer, impacchetta il progetto con `npm pack` e allega il tarball (`alia-<versione>.tgz`) alla Release stessa. Per installarlo:

```powershell
npm install -g https://github.com/Helmutsti/Alia/releases/download/vX.Y.Z/alia-X.Y.Z.tgz
alia
```

`npm install` scarica in automatico le dipendenze (incluso Electron, per la piattaforma corrente) dal registro npm pubblico: serve una connessione di rete al momento dell'installazione, non in seguito. Il comando `alia` avvia l'app; i dati restano in `%APPDATA%\alia\scheduler.sqlite` (per utente, indipendente da dove è installato il pacchetto).

Per pubblicare una nuova release: crea un tag `vX.Y.Z`, pubblica una GitHub Release su quel tag — la pipeline si occupa del resto (versione presa dal tag, nessun bump manuale di `package.json` richiesto).

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

## Dati di esempio (seed)

```powershell
npm run seed
```

Popola `./data/scheduler.sqlite` (percorso di default) con qualche item di esempio, utile per provare l'interfaccia senza partire da un database vuoto. Per popolare invece il database reale usato dall'app Electron, passa il percorso esplicito:

```powershell
node scripts/seed.js "$env:APPDATA\alia\scheduler.sqlite"
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
