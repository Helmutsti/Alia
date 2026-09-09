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
import { createAliaCore } from "./src/index.js";

const core = createAliaCore({
  databasePath: "./data/scheduler.sqlite",
});

const stati = core.listStates();
const inCorso = stati.find((s) => s.label === "In corso");

const { idTask } = core.createTask({
  title: "Richiamare il cliente",
  description: "Confermare la data di consegna",
  priority: "high",
  reminderAt: "2026-09-08T09:00:00+02:00",
});

core.setTaskState(idTask, inCorso.idState);
core.close();
```

In Electron il percorso del database si costruisce nel processo principale, dalla cartella dati dell'applicazione (`electron/main.js` fa esattamente questo):

```js
import { app } from "electron";
import { join } from "node:path";
import { createAliaCore } from "./src/index.js";

const core = createAliaCore({
  databasePath: join(app.getPath("userData"), "scheduler.sqlite"),
});
```

L'interfaccia non riceve mai l'oggetto `core`: il processo principale espone le sole operazioni di `ALIA_OPERATIONS` attraverso IPC, e il preload le monta su `window.alia`.

## API disponibile

Lettura: `listTasks(opzioni)`, `getTask(id)`, `getTaskHistory(id)`, `listStates()`, `listProjects()`, `listMilestones(idProject)`.

Scrittura: `createTask(input, decisioni)`, `updateTask(id, patch)`, `setTaskState(id, idState, decisioni)`, `setTaskProject(id, idProject, idMilestone)`, `reorderTasks(idParentTask, orderedIds)`, `reparentTask(id, idParentTask)`, `deleteTask(id)`, `restoreTask(id, decisioni)`, `migrateTask(id, idState)`. Più `close()`.

Tre di queste possono **non applicare** e restituire invece un esito da negoziare, perché la macchina a stati ha punti in cui serve una scelta umana e un trigger SQL non può fermarsi ad aspettarla:

```js
{ esito: "applicato", cambi: [...], avvisi: [...] }
{ esito: "conferma",  richiesta: { tipo, tasks, ... } }  // richiama con `decisioni`
{ esito: "bloccato",  motivo, tasks }
```

Finché torna `"conferma"` non è stato scritto niente: la transazione è annullata, e la stessa chiamata va rigiocata con la decisione dentro (`sovrascriviFigliChiusi`, `statiRiapertura`). Le regole complete stanno in `Rinascita.md`, sezione Flussi.

`deleteTask` è una cancellazione logica ed estesa a tutto il sotto-albero. Il ripristino (`restoreTask`) esiste nel core come intervento tecnico, non come funzione di prodotto.

## Test

```powershell
node --test
```

## Dati di esempio (seed)

```powershell
npm run seed
```

Popola `./data/scheduler.sqlite` (percorso di default) con qualche task di esempio, sotto-task e origini esterne comprese, utile per provare l'interfaccia senza partire da un database vuoto. Non azzera niente: su un database già pieno i dati si sommano. Per popolare invece il database reale usato dall'app Electron, passa il percorso esplicito:

```powershell
node scripts/seed.js "$env:APPDATA\alia\scheduler.sqlite"
```

## Interfaccia grafica

L'app Electron vive in `electron/` (main process + preload, che aprono il core reale e lo espongono al renderer solo tramite IPC) e in `renderer/` (React + Vite, Tailwind puro — vedi `DESIGN_LOCK.md`).

È una schermata sola, a tre sezioni di cui due visibili per volta: origini da confermare, "Da smistare", area contenuto. Le viste Lista e Kanban sono costruite; Calendario e Gantt sono abbozzi, in attesa che il loro disegno venga deciso.

`preview.html` (via `npm run dev:renderer`) mostra le stesse schermate su un dataset dichiaratamente finto: serve al confronto con gli artboard, e gira nel browser dove il core non è raggiungibile.

```powershell
npm install
npm run dev     # Vite dev server + Electron con hot reload
```

Per una build di produzione:

```powershell
npm start        # builda il renderer e avvia Electron dal bundle
```

I dati restano nello stesso database SQLite del core, salvato in `app.getPath('userData')/scheduler.sqlite`.
