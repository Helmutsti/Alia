# Rinascita

Documento di lavoro per il refactoring importante del progetto Scheduler (Alia). Raccoglie le decisioni prese via via, a partire dal database. Non sostituisce `SPECIFICA_PRODOTTO.md`, lo supera nelle parti in cui questo refactoring introduce un modello diverso.

## Stato del documento

Aggiornato al 2026-09-09. Contiene la sezione Database (entità `t_task`/`t_project`/`t_milestone`/`t_state`, convenzioni, vincoli, migrazione), la sezione Flussi (macchina a stati: nascita, reminder, cascata di chiusura/riapertura, migrazione esterna) e la sezione Interfaccia (schermata principale: colonna Inbox ridimensionabile/magnetica, ambito progetto, colonna contenuto con selettore vista). Restano volutamente aperte solo due questioni di modello dati, entrambe rimandate: gli "stati speciali" del task (inbox/non preparato) e i dettagli dell'oggetto sorgente esterno — più la progettazione della schermata "Full Inbox" lato interfaccia (vedi sezione Interfaccia).

## Database

### Perché il refactoring

Lo schema attuale (`src/core/database.js`) ha due limiti che questo refactoring risolve:

- `items` e `subtasks` sono due entità diverse con due modelli diversi: un `item` ha tutti gli attributi (stato, priorità, scadenza, tag, ecc.), un `subtask` ha solo `title` e `done`. Un sotto-task non può quindi avere una propria scadenza, priorità, sotto-sotto-task, ecc.
- `projects` e `lists` sono una gerarchia fissa a due livelli (progetto → lista) separata dagli item veri e propri; un item si limita a riferirla con una stringa (`items.project`, oggi testo libero).

### Convenzioni di naming

Da questo refactoring in poi, valgono per tutte le tabelle nuove:

- **Nome tabella**: prefisso `t_` seguito dal nome in inglese, singolare (es. `t_task`, `t_project`, `t_state`).
- **Chiave primaria**: `id<NomeTabella>` in camelCase (es. `idTask` su `t_task`, `idProject` su `t_project`, `idState` su `t_state`). Le chiavi esterne seguono lo stesso schema del nome della tabella referenziata (es. `idProject` su `t_task` per riferirsi a `t_project`), tranne quando serve distinguere il ruolo della relazione (es. `idParentTask` per l'auto-relazione dei sotto-task, vedi sotto).
- **Tutte le altre colonne**: nome in inglese, coerente con lo stile già in uso nel codice (camelCase o snake_case da allineare all'implementazione, ma comunque in inglese — mai italiano).

Questa convenzione si applica alle entità descritte più sotto e a tutte le tabelle collegate (storico, commenti, tag, allegati). Le tabelle attuali (`items`, `subtasks`, `projects`, `lists`, `statuses`, `item_history`, `item_comments`) non la seguono: verranno sostituite dalle nuove in migrazione, non rinominate sul posto.

### Entità t_task

Sostituisce sia `items` sia `subtasks` attuali con un'unica entità ricorsiva: un task può avere sotto-task, e un sotto-task è a sua volta un task a tutti gli effetti (stessi attributi, può avere altri sotto-task).

- `idTask`: identificatore univoco (chiave primaria).
- `idParentTask`: riferimento al task padre, `NULL` se il task è di primo livello (nessun genitore). Auto-relazione su `t_task(idTask)`. I task padre con sotto-task continuano a esistere e a funzionare come descritto (ricorsione libera) — **non esiste più però un flag "contenitore/lista"**: vedi nota di revisione sotto.
- Tutti gli attributi già presenti su `items` restano sul task (nome colonna da allineare in inglese secondo la convenzione sopra), **tranne lo stato**, che diventa `idState` (vedi sotto): `title`, `description`, `priority`, `dueAt`, `startAt`, `reminderAt`, `sourceType`, `sourceId`, `sourceUrl`, `originalContent`, `contentGeneratedByAi`, `tags`, `notes`, `createdAt`, `updatedAt`, `completedAt`, `archivedAt`, `deletedAt`.
- `idState`: riferimento allo stato corrente in `t_state` (**deciso**: numerico, non più una chiave testuale come l'attuale `status`/`key`) — segue la convenzione di naming (`id<NomeTabella>`).
- `isCompleted`: booleano, introdotto per la macchina a stati (vedi sezione "Flussi"). **Aggiornato automaticamente in base allo stato corrente**, non impostato a mano: `true` quando `idState` punta a uno stato con `isEndState = true`, rimosso (`false`) ad ogni modifica che porta il task su uno stato diverso da uno stato finale. Da implementare con un trigger sulla scrittura di `idState` su `t_task`, così da non poter mai disallinearsi dallo stato corrente. Nota: questo supera la distinzione ipotizzata inizialmente tra "completato" e "chiuso per un'altra via" (es. migrazione) — vedi "Migrazione verso una piattaforma esterna" nella sezione Flussi, aggiornata di conseguenza.
- `idProject`: riferimento al progetto di appartenenza, sostituisce l'attuale `items.project` testuale. **Rimane opzionale** (`NULL` ammesso, come nello schema attuale): un task **non deve necessariamente avere un progetto**, coerente con il principio dell'inbox già fissato in `SPECIFICA_PRODOTTO.md` ("l'inbox non coincide necessariamente con la lista definitiva delle attività" — un task può nascere non ancora categorizzato). `ON DELETE`: vedi "Cancellazione di un progetto con task collegati" più sotto — non è un semplice `SET NULL` automatico, richiede una scelta esplicita dell'utente.
- `idMilestone`: riferimento alla milestone di appartenenza (vedi nuova entità `t_milestone` sotto), **opzionale** (`NULL` ammesso). `ON DELETE SET NULL`: cancellando una milestone, i task collegati perdono solo il riferimento, non vengono cancellati. Vincolo di coerenza da garantire nel core (non esprimibile in un `CHECK` dichiarativo su SQLite senza una sotto-query): la milestone scelta deve appartenere allo stesso progetto del task (`t_milestone.idProject = t_task.idProject`). **Deciso**: nessuna colonna propria per livello — un sotto-task eredita `idMilestone` dal padre esattamente come `idProject` (stessa logica, stessa propagazione a cascata se cambia).
- `position`: ordinamento tra fratelli (figli dello stesso `idParentTask`, o tra i task di primo livello dello stesso progetto).

**Revisione (sostituisce la versione precedente basata su `isContainer`)**: le "liste" come tipo di task contenitore **non esistono più**. Il flag `isContainer` è eliminato dallo schema. Restano invece, come concetti distinti:
- i **task padre con sotto-task**, che continuano a esistere esattamente come prima (un task qualunque può avere figli, senza bisogno di marcarsi come "contenitore" per farlo);
- le **milestone**, che non sono più un tipo di task ma un'entità a parte, propria dei progetti (vedi sotto) — sostituiscono sia il ruolo organizzativo che avevano le "liste" sia il concetto di milestone introdotto in precedenza come variante di task.

**Coerenza `idProject`/`idMilestone` tra padre e figli**: un sotto-task **non può appartenere a un progetto (né a una milestone) diversi da quelli del proprio padre** — vincolo forte, imposto nel core (non un `CHECK` dichiarativo, richiede di leggere la riga del padre). In pratica solo il task di primo livello di un albero sceglie liberamente progetto e milestone (o nessuno dei due); ogni sotto-task li eredita entrambi, e riassegnarli sul task di primo livello deve propagarsi a cascata su tutti i suoi discendenti per mantenere l'invariante.

**Stati speciali del task (inbox, "non ancora preparato", ecc.) — questione aperta, rimandata**: serve poter distinguere con filtri efficaci i task "appena arrivati/non ancora lavorati" da quelli già in lavorazione. Non è ancora chiaro **cosa definisce esattamente questo stato**: l'assenza di `idProject`? l'assenza di date (`startAt`/`dueAt`)? un flag dedicato tipo `isInbox`? Le tre cose non sono equivalenti (un task può non avere progetto ma avere già una scadenza, o viceversa). Rimandato apposta a un momento successivo — da riprendere prima di disegnare i filtri della schermata Inbox.

Nota su `subtasks.done`: con questo modello "fatto" è semplicemente `idState` del task figlio che punta a uno stato di chiusura (vedi la nuova entità `t_state` più sotto, che sostituisce l'attuale tabella `statuses`), non serve più un campo booleano dedicato.

### Sorgente di origine (da pensare, non implementare ora)

Idea aperta, non ancora progettata nel dettaglio: aggiungere a `t_task` un campo (o un piccolo gruppo di campi, sul modello di `sourceType`/`sourceId`/`sourceUrl`/`originalContent` già presenti su `items`) per salvare la sorgente di origine del task quando questo nasce da uno spezzone di un altro task o da un contesto esterno diverso dalla semplice creazione manuale. Da riprendere insieme alle sorgenti esterne (email/Discord) già previste in `SPECIFICA_PRODOTTO.md`. Nessuna decisione di schema per ora.

**Principio guida (deciso, dettagli rimandati)**: l'oggetto sorgente deve contenere le informazioni della sorgente che **non servono al task in sé**, ma che permettono eventualmente di recuperare il messaggio/elemento originale (es. l'identificativo del messaggio, la cassetta/canale di provenienza, dettagli tecnici del protocollo) — informazioni di servizio, tenute separate dagli attributi operativi del task. La forma esatta (campi comuni a `mail`/`discord`/`telegram` o campi specifici per tipo) resta rimandata a quando si affronterà davvero l'integrazione delle sorgenti esterne.

**Nota importante emersa dai flussi**: una singola sorgente esterna (es. una email) **può generare più task** (es. un'email con tre azioni distinte diventa tre task separati), non uno solo. Questo significa che il vincolo di unicità oggi presente in `items_source_identity` (`UNIQUE(source_type, source_id) WHERE source_id IS NOT NULL`) **non può essere riportato così com'è** su `t_task`: impedirebbe a una stessa sorgente di generare più di un task. Quando si progetterà davvero questa parte, la relazione corretta è 1 sorgente → N task (più vicina a un'entità `t_source` separata referenziata da più righe di `t_task`, che non a una coppia di colonne uniche su `t_task` stesso); l'eventuale idempotenza dei connettori (non reimportare due volte lo stesso messaggio) andrà garantita a livello della sorgente, non del task.

### Storico e commenti

Le tabelle `item_history` e `item_comments` attuali diventano `t_task_history` e `t_task_comment`, con chiave primaria `idTaskHistory`/`idTaskComment` e chiave esterna `idTask` (`ON DELETE CASCADE`, come oggi). Restano per costruzione una entità per task: un sotto-task ha il proprio storico e i propri commenti, indipendenti da quelli del padre — l'eventuale aggregazione ("mostra anche lo storico dei figli") resta una scelta di interfaccia, non di schema.

### Prevenzione dei cicli

Lo schema SQL da solo non impedisce che un task diventi antenato di se stesso attraverso `idParentTask` (es. A → figlio B → figlio A). Non esiste un vincolo dichiarativo pratico in SQLite per questo caso (richiederebbe una CTE ricorsiva in un trigger); va quindi controllato nel core, ad ogni operazione che assegna o cambia `idParentTask`, risalendo la catena degli antenati del nuovo padre prima di confermare la scrittura.

### Tag e allegati

Le tabelle relazionali già previste in `SPECIFICA_PRODOTTO.md` (`tags` + `item_tags`, `attachments`) diventano `t_tag`, `t_task_tag`, `t_attachment`, agganciate a `idTask` invece che a `item_id`, seguendo la stessa unificazione e la stessa convenzione di naming. Vale per entrambe: chiave esterna `idTask` con `ON DELETE CASCADE`, nessuna differenza di comportamento tra un task di primo livello e un sotto-task (un sotto-task può avere i propri tag/allegati).

### Entità t_project

- `idProject`: identificatore univoco (chiave primaria).
- `name`: nome, univoco.
- `color`: colore per l'interfaccia.
- `position`: ordinamento.
- `createdAt`.

Il progetto resta un contenitore *esterno* ai task (non un task): raggruppa i task tramite `t_task.idProject` (opzionale, vedi sopra). La tabella `lists` attuale (secondo livello fisso dentro un progetto) **non viene più assorbita da un flag sui task** (revisione rispetto a una versione precedente di questo documento, che proponeva un flag `isContainer`): il ruolo organizzativo di "raggruppare i task di un progetto in fasi" è preso in carico dalla nuova entità `t_milestone` descritta sotto, che è a tutti gli effetti parte del progetto e non un task.

### Entità t_milestone

Un progetto si suddivide in milestone: la milestone è la nuova unità organizzativa "dentro" un progetto, e sostituisce sia il vecchio ruolo di `lists` sia l'idea, discussa in precedenza, di una milestone come variante di task (`isMilestone`) — qui la milestone non è più un task.

- `idMilestone`: identificatore univoco (chiave primaria).
- `idProject`: progetto di appartenenza, `NOT NULL`, `ON DELETE CASCADE` (una milestone non ha senso senza il suo progetto: cancellare il progetto cancella anche le sue milestone — coerente con l'idea che la milestone è "parte" del progetto, non un'entità indipendente).
- `label`: nome della milestone (es. "Fase 1", "Rilascio beta").
- `position`: ordinamento tra le milestone dello stesso progetto.
- `createdAt`.

I task si assegnano a un progetto (facoltativo) e, se lo hanno, facoltativamente anche a una milestone di quel progetto (`t_task.idMilestone`, vedi sopra) — se il task ha una milestone, deve essere una milestone dello stesso progetto a cui il task appartiene.

**Deciso**: la milestone **non ha una chiusura propria** — nessuno stato derivato dal completamento dei suoi task, nessuna cascata che la riguardi. Resta un'etichetta organizzativa pura: raggruppa i task di una fase del progetto, senza un proprio ciclo di vita.

### Cancellazione di un progetto con task collegati

Non è un'operazione silenziosa: se il progetto ha ancora task collegati (direttamente via `idProject` o indirettamente tramite le sue milestone), **l'utente deve scegliere esplicitamente** come trattarli prima che la cancellazione sia permessa — stessa filosofia già decisa per la cancellazione di uno stato in uso (vedi sezione `t_state`). Le opzioni da presentare:

- **Lasciare i task orfani**: `idProject` (e di conseguenza `idMilestone`, che non avrebbe più senso) tornano a `NULL` su tutti i task del progetto, ricorsivamente sui discendenti (per mantenere l'invariante padre/figlio appena fissata). Il task resta, semplicemente senza categorizzazione.
- **Migrare verso un altro progetto**: l'utente sceglie un progetto di destinazione (e opzionalmente una milestone di quel nuovo progetto, oppure lascia i task senza milestone) per tutti i task coinvolti, di nuovo propagando ricorsivamente ai discendenti.

A livello di schema questo si traduce semplicemente in `idProject`/`idMilestone` con `ON DELETE SET NULL` (per il caso "orfani"): il caso "migrazione" è un'operazione applicativa che riassegna i task **prima** di eseguire la cancellazione, non un comportamento diverso della foreign key.

**Semplificazione emersa dall'analisi**: il caso "lascia orfani" non richiede in realtà alcuna logica applicativa ricorsiva. Dato che `idProject`/`idMilestone` sono denormalizzati su *ogni* task (anche i sotto-task, non solo quello di primo livello — vedi "Coerenza tra padre e figli"), una semplice `DELETE FROM t_project WHERE idProject = ?` scatena da sola, tramite le foreign key già definite, l'intera catena: cancella le milestone del progetto (`CASCADE`), il che a sua volta annulla `idMilestone` su tutti i task che le referenziavano (`SET NULL`), e annulla direttamente `idProject` su tutti i task del progetto, sotto-task inclusi (`SET NULL`) — nessun ciclo esplicito nel core necessario per questo caso. Solo il caso "migra verso un altro progetto" richiede codice applicativo (un `UPDATE` che sceglie il nuovo valore, cosa che una foreign key da sola non può fare).

### Entità t_state

Sostituisce l'attuale tabella `statuses` (`id:TEXT, key, label, type CHECK apertura/in_corso/chiusura, position`). Il nuovo modello sostituisce il campo `type` a tre valori con due flag booleani indipendenti, più flessibili:

- `idState`: identificatore numerico (chiave primaria, `INTEGER`).
- `label`: etichetta visibile.
- `isStartState`: `true` se è uno stato di partenza (equivalente all'attuale `apertura`).
- `isEndState`: `true` se è uno stato di chiusura (equivalente all'attuale `chiusura`); uno stato con entrambi i flag a `false` corrisponde all'attuale `in_corso`.
- `stepOrder`: posizione dello stato nella sequenza — non solo per l'ordinamento in interfaccia (Kanban, menu di stato, analogo a `position` oggi), ma **vincolante per il comportamento della cascata**: vedi "Macchina a stati" nella sezione Flussi, dove decide su quale stato finale atterra un padre chiuso per cascata. Rinominato da `order` (parola riservata SQL, `ORDER BY`) a `stepOrder` per evitare il fastidio di doverla sempre quotare nelle query.

**Deciso — mutua esclusione**: `isStartState` e `isEndState` non possono essere entrambi `true` sullo stesso stato. Uno stato è o di partenza, o di chiusura, o nessuno dei due — mai entrambi. Vincolo da imporre con un `CHECK (NOT (isStartState = 1 AND isEndState = 1))`. Resta fissa la regola già stabilita altrove: un solo stato con `isStartState = true` in tutto il sistema, ma possono esistere più stati con `isEndState = true`.

**Deciso**: `t_task.idState` è numerico (FK a `t_state.idState`), non più una chiave testuale come l'attuale `status`/`key` — vedi anche la nota nella sezione Entità t_task.

**Protezione degli stati critici**: dato che gli stati restano configurabili dall'utente (come già oggi), va impedito che la configurazione arrivi mai a uno stato invalido per la macchina a stati:

- Non si può cancellare (né togliere il flag a) l'unico stato con `isStartState = true`: deve sempre essercene esattamente uno in tutto il sistema. L'interfaccia deve avvisare/bloccare il tentativo.
- Non si può cancellare l'ultimo stato con `isEndState = true` rimasto: deve sempre essercene almeno uno.
- **Cancellazione di uno stato attualmente in uso** da uno o più task: non può essere una cancellazione silenziosa, perché lascerebbe quei task senza uno stato valido. L'utente deve scegliere esplicitamente come trattare i task coinvolti prima che la cancellazione sia permessa. **Deciso**: la rimappatura su un altro stato scelto al momento è **sempre obbligatoria** (altrimenti i task resterebbero senza stato valido); in aggiunta, l'interfaccia **propone di creare al volo un tag** che marchi i task coinvolti (es. "ex-<nome stato cancellato>") per non perdere traccia del cambiamento — ma applicarlo o no resta una scelta dell'utente, non un passo obbligato.

Stati previsti in seed, sulla falsariga di quelli attuali (`inbox`/`active`/`completed`/`archived`) — da confermare in dettaglio, ma **`archived` va incluso come stato di chiusura** a tutti gli effetti anche nel nuovo modello, non solo come flag separato su `t_task`:

| `label` | `isStartState` | `isEndState` |
|---|---|---|
| Da fare (`inbox`) | true | false |
| In corso (`active`) | false | false |
| Fatto (`completed`) | false | true |
| Archiviato (`archived`) | false | true |

### Relazioni

```
t_project (1) ──< (N) t_milestone [idProject]   -- ON DELETE CASCADE
t_project (1) ──< (N) t_task [idProject]        -- opzionale, ON DELETE SET NULL (previa scelta utente se non orfani, vedi sopra)
t_milestone (1) ──< (N) t_task [idMilestone]    -- opzionale, ON DELETE SET NULL
t_task (1) ──< (N) t_task [idParentTask]        -- sotto-task (ricorsivo, profondità libera)
t_state (1) ──< (N) t_task [idState]            -- stato corrente del task
```

### Vincoli da portare avanti in migrazione

- `idProject` è opzionale (`NULL` ammesso) su `t_task`, `ON DELETE SET NULL` — ma la cancellazione di un progetto con task collegati richiede prima una scelta utente (orfani o migrazione verso un altro progetto), vedi "Cancellazione di un progetto con task collegati" sopra: il `SET NULL` copre solo il caso "lascia orfani", il caso "migra" è gestito dall'applicazione con un `UPDATE` preventivo.
- `idMilestone` con `ON DELETE SET NULL` su `t_task`: cancellando una milestone, i suoi task perdono solo il riferimento, non vengono cancellati.
- `idProject` con `ON DELETE CASCADE` su `t_milestone`: cancellare un progetto cancella anche le sue milestone (che a quel punto, per l'`ON DELETE SET NULL` sopra, sganciano semplicemente i task collegati invece di cancellarli).
- Coerenza `t_task.idMilestone` / `t_task.idProject`: la milestone assegnata a un task deve appartenere allo stesso progetto del task. Non esprimibile con un `CHECK` dichiarativo in SQLite (richiede una sotto-query su un'altra tabella) — da imporre nel core ad ogni scrittura di `idMilestone` o `idProject`.
- Coerenza `idProject` tra padre e figli: un sotto-task deve avere lo stesso `idProject` del padre (vedi nota nella sezione Entità t_task) — da imporre nel core, con propagazione ricorsiva quando il progetto di un task di primo livello cambia.
- Cancellazione a cascata dei figli quando un task padre viene eliminato (`ON DELETE CASCADE` su `idParentTask`, come già avviene su `item_id` in `subtasks`/`item_comments`).
- Nessun vincolo dichiarativo per i cicli su `idParentTask`: controllo da fare nel core (vedi "Prevenzione dei cicli" sopra).
- Indice su `(idParentTask, position)` per l'ordinamento dei figli, analogo a `subtasks_item_id` attuale.
- Indice su `(idProject)` e su `(idMilestone)` per i task di un progetto/milestone.
- Indice su `(idProject, position)` su `t_milestone` per l'ordinamento delle milestone di un progetto.

### Migrazione dai dati attuali

- Ogni riga di `items` diventa una riga di `t_task` con `idParentTask = NULL`. `idProject` resta `NULL` se `items.project` era `NULL` (nessun progetto di ripiego necessario, dato che `idProject` è opzionale anche nel nuovo modello).
- Ogni riga di `subtasks` diventa una riga di `t_task` con `idParentTask = <item_id>`, ereditando `title`; `done` si traduce in uno stato di chiusura (es. `completed`) o di apertura, secondo il valore attuale. Eredita anche `idProject`/`idMilestone` dal padre, per rispettare il vincolo di coerenza appena fissato.
- Ogni riga di `lists` diventa una riga di `t_milestone` (non più un task): `idProject = lists.project_id`, `label = lists.name`, `position = lists.position`.
- `items.status` (testuale, oggi una `key` come `"inbox"`/`"active"`) diventa `t_task.idState` (numerico): la migrazione deve creare prima le righe di `t_state` corrispondenti (vedi seed sotto) e poi tradurre ogni valore testuale nel relativo `idState`.
- **`items.list`** (colonna di testo libero introdotta in una migrazione precedente allo schema attuale, prima ancora che esistesse la tabella `lists`) **non ha mai avuto una foreign key verso `lists`**: è semplicemente una parola scritta a mano dall'utente (es. `list = "Manutenzione"`), senza garanzia che esista davvero una riga `lists.name = "Manutenzione"`. **Deciso**: i valori di `items.list` senza corrispondenza vengono scartati in migrazione (il task resta senza milestone) — nessuna milestone "improvvisata" creata automaticamente, per non sporcare `t_milestone` con voci nate da un refuso o da una lista mai formalizzata.

### Domande aperte

1. Profondità massima dei sotto-task: **deciso, nessun limite** — ricorsione libera, nessun vincolo né a schema né in interfaccia.
2. Sorgente di origine sul task: campo/i da progettare (vedi "Sorgente di origine" sopra) — non ancora da implementare.
3. **Stati speciali del task (inbox/"non preparato")**: rimandata esplicitamente (vedi nota nella sezione Entità t_task) — va definita prima di disegnare i filtri della schermata Inbox.
4. Una milestone ha una propria scadenza/data target (es. "Fase 1 entro il 30/09"), o è puramente un'etichetta organizzativa senza attributi temporali propri? **Deciso per ora**: nessun attributo temporale su `t_milestone` — solo `label`/`position`. Riprendibile in futuro se serve.
5. ~~`stepOrder` è solo indicativo o influisce sul comportamento?~~ **deciso**: `stepOrder` **è vincolante** — "l'ordine è legge". Riordinare gli stati finali cambia deliberatamente anche su quale stato atterra un padre chiuso per cascata, non è un effetto collaterale da evitare. Nessun flag separato: un solo campo governa sia la presentazione sia il comportamento.
6. ~~Nome colonna riservato SQL~~ **deciso**: rinominata `stepOrder` (vedi Entità t_state).

### Chiusura sezione

Sezione database considerata stabile (2026-09-09, più volte revisionata nello stesso giorno): entità `t_task` (ricorsiva, senza più `isContainer`, con `idProject`/`idMilestone` opzionali ed ereditati dai sotto-task, `idState` numerico), `t_project`, `t_milestone` (nuova, suddivide un progetto in fasi, nessuna chiusura propria), `t_state` (un solo stato di partenza, più stati finali, mutuamente esclusivi con lo stato di partenza), storico/commenti/tag/allegati agganciati a `idTask`, convenzioni di naming fissate. Restano aperte solo le due questioni rimandate volutamente (stati speciali/inbox, dettagli della sorgente esterna); eventuali altre estensioni allo schema emerse lavorando sui flussi vanno aggiunte qui prima di essere implementate, non decise a parte.

## Flussi (macchina a stati)

### Nascita di un task

Un task nasce in due modi:

- **Creazione manuale** dall'utente.
- **Generazione da una sorgente esterna** (mail, Discord, Telegram): la sorgente genera un "oggetto sorgente" a cui il task risultante resta collegato. Lo schema di questo oggetto sorgente non è ancora definito (vedi "Sorgente di origine" nella sezione Database, per ora volutamente non progettata) — qui basta fissare che, indipendentemente dalla sorgente, il task che ne risulta è un task come tutti gli altri, con gli stessi attributi e la stessa macchina a stati descritta sotto.

In entrambi i casi il task porta con sé tutti gli attributi già definiti nella sezione Database (titolo, descrizione, note, priorità, stato, tag, ecc.); la sorgente non cambia la forma del task, aggiunge solo il collegamento a dove è nato.

Indipendentemente da come nasce, un task **può restare senza progetto** (`idProject` opzionale, revisionato: non è più obbligatorio, vedi sezione Database) — coerente con il principio dell'inbox: un task appena arrivato, manuale o da sorgente esterna, non deve necessariamente essere già categorizzato. Se ha un progetto, può facoltativamente avere anche una **milestone** di quel progetto (`idMilestone`). Resta aperta (vedi "Stati speciali del task" nella sezione Database) la domanda su cosa distingua esattamente, ai fini dei filtri, un task "appena arrivato/non preparato" da uno già in lavorazione.

### Durata e reminder, facoltativi

- **Durata**: un task può avere una durata opzionale, espressa come coppia `startAt`/`dueAt` (già presenti nello schema `t_task`). Non è obbligatoria: un task può restare puntuale (nessun intervallo) o non avere affatto una collocazione temporale.
- **Reminder**: un task può avere in aggiunta un promemoria, indipendente dalla durata (coerente con la distinzione già presente in `SPECIFICA_PRODOTTO.md` tra schedulazione e promemoria). È un singolo campo (`reminderAt`) su `t_task` stesso, come nello schema attuale: niente tabella dedicata, un solo reminder per task.

### Comportamento dell'alert (reminder)

L'ancoraggio temporale del reminder cambia a seconda che il task abbia o meno una durata (`startAt` valorizzato):

- **Task con durata**: il reminder avvisa **prima dell'inizio** — è ancorato a `startAt`, con un offset all'indietro (es. "1 ora prima", "1 giorno prima" dell'inizio). Non ha senso ancorarlo alla creazione del task in questo caso: l'utente vuole essere avvisato in vista dell'inizio pianificato, non in base a quando ha scritto il task.
- **Task senza durata** (`startAt` assente): il reminder si comporta come un promemoria "normale" — è ancorato al momento in cui viene impostato (di norma la creazione/stesura del task), con un offset in avanti (es. "tra 2 ore", coerente con la sintassi rapida già in uso nel composer, `/2h`, descritta in `SPECIFICA_PRODOTTO.md`).

In pratica lo stesso concetto di "offset" (es. "2 ore") cambia segno/direzione a seconda del contesto: prima di `startAt` se il task ha una durata, dopo il momento di impostazione se non ce l'ha. **Precisazione**: questa distinzione prima/dopo è solo un aiuto dell'interfaccia per suggerire una data/ora mentre si imposta il reminder — non cambia nulla nel dato salvato né nel comportamento del reminder una volta creato. Il reminder resta sempre un singolo istante assoluto (`reminderAt` su `t_task`): non si ricalcola automaticamente se `startAt` viene spostato in seguito, non porta con sé l'informazione "era prima/dopo", e non è periodico (nessun concetto di ricorrenza: non è un calendario, eventuale gestione di eventi ricorrenti è esplicitamente rimandata a un possibile sviluppo futuro, fuori da questo refactoring).

### Macchina a stati

Regole fissate per il funzionamento di `t_state` applicato a `t_task`:

- **Uno stato di partenza**: esiste un solo stato con `isStartState = true` in tutto il sistema (non uno a scelta per ogni task). Un task nasce sempre in quello stato: **"Nuovo"**.
- **Più stati finali**: possono esistere più stati con `isEndState = true` (es. `Fatto`, `Archiviato`, `Migrato` — quest'ultimo per il caso della migrazione, vedi sotto). Un task raggiunge la chiusura arrivando a uno qualsiasi di questi stati, non necessariamente sempre lo stesso.
- **Stati intermedi**: tra la nascita (`Nuovo`) e uno stato finale, il task attraversa uno o più stati intermedi (`isStartState = false`, `isEndState = false`). **Deciso**: sono configurabili dall'utente, non fissi. Il campo `stepOrder` di `t_state` definisce l'ordine con cui presentarli in interfaccia (es. nel menu di cambio stato, nel Kanban) e **non vincola le singole transizioni manuali**: l'utente può saltare da uno stato qualsiasi a un altro qualsiasi, anche non adiacenti nell'ordine. `stepOrder` resta comunque vincolante per la cascata automatica (vedi sotto: decide su quale stato finale atterra un padre chiuso per cascata) — sono due cose distinte: libertà di transizione manuale, ma `stepOrder` come legge per gli automatismi.
- **`isCompleted`**: non è una scelta manuale, è un riflesso automatico dello stato corrente — `true` quando `idState` punta a uno stato con `isEndState = true`, altrimenti `false`. Si aggiorna via trigger ad ogni cambio di `idState` su `t_task` (vedi dettaglio nella sezione Database): entrare in uno stato finale lo imposta a `true`, uscirne (riapertura) lo riporta a `false`. Non distingue quindi *come* si è arrivati alla chiusura (completamento, archiviazione, migrazione, ecc.) — è solo "il task è attualmente su uno stato finale sì/no".
- **Chiusura per cascata dai figli verso il padre**: quando **tutti** i figli di un task raggiungono uno stato finale, il task padre si completa automaticamente di conseguenza (passa anche lui a uno stato finale, e quindi per trigger a `isCompleted = true`, senza bisogno di un'azione esplicita sul padre). Un task **senza figli non è mai soggetto a questa regola**: "tutti i figli chiusi" richiede che ne esista almeno uno — altrimenti un task nuovo, che per definizione ha zero figli, si chiuderebbe da solo per vacuità. Vale ricorsivamente: la chiusura di un padre per cascata può a sua volta chiudere il proprio padre, se ne ha uno.
  **Deciso — quale stato finale riceve il padre**: sempre **l'ultimo stato con `isEndState = true` nell'ordine (`stepOrder`) configurato** (tipicamente il più "definitivo", es. `Completato`), indipendentemente da quali stati finali abbiano raggiunto i singoli figli. **Nota da mostrare in interfaccia** (da tenere da parte per il disegno della UI, non ancora implementata): questo può produrre un caso ambiguo — se ad esempio tutti i figli sono stati chiusi come `Migrato` (uno stato finale, ma non l'ultimo in ordine), il padre atterra comunque sull'ultimo stato (`Completato`) anche se localmente non è stato "davvero" completato, solo i suoi figli sono stati spostati altrove. Va segnalato chiaramente all'utente quando questo scarto si verifica.
- **Chiusura per cascata dal padre verso i figli**: vale anche il percorso inverso — se un task viene chiuso manualmente (portato su uno stato finale) mentre ha ancora figli non chiusi, **anche i figli vengono chiusi**, ricorsivamente lungo tutto il sotto-albero, **ricevendo lo stesso stato finale del padre** (deciso: non uno stato dedicato separato).
  **Deciso — protezione dei figli già chiusi**: questa cascata **non deve sovrascrivere silenziosamente** un figlio che si trova già su uno stato finale (magari diverso da quello del padre, es. già `Migrato` mentre il padre chiude su `Completato`). In questo caso va mostrata una **conferma esplicita all'utente**, che sceglie se sovrascrivere lo stato dei figli già chiusi con quello del padre oppure lasciarli come sono. Solo i figli ancora non chiusi vengono forzati senza bisogno di conferma.
- **Riapertura simmetrica**: se un figlio già chiuso torna su uno stato non finale (riaperto), e il padre era chiuso (per cascata o manualmente), **il padre si riapre automaticamente**. Vale ricorsivamente anche verso l'alto (riaprire un padre può a sua volta riaprire il proprio padre). **Deciso — su quale stato atterra il padre riaperto**: non c'è un automatismo che lo sceglie da solo — **lo stato di destinazione lo sceglie l'utente** (prompt di scelta al momento della riapertura), coerente con l'idea che le transizioni non sono vincolate a un percorso fisso.
- **Nuovo figlio aggiunto a un padre chiuso**: se si aggiunge un nuovo sotto-task a un task che si trovava già su uno stato finale, **il padre si riapre automaticamente** — stessa logica della riapertura sopra, dato che "tutti i figli chiusi" non è più vero nel momento in cui compare un figlio nuovo e non ancora chiuso.

Nota: la vecchia eccezione per i "task-contenitore" non serve più — non esistendo più `isContainer`, tutte le regole sopra si applicano uniformemente a qualunque task con figli. Le milestone, non essendo più task ma un'entità propria del progetto (vedi sezione Database), restano fuori da questa macchina a stati per costruzione e per decisione esplicita: non hanno un `idState` proprio, quindi nessuna cascata le riguarda.

### Cancellazione vs. chiusura

Sono due eventi distinti, da non confondere nella logica di cascata appena descritta:

- **Chiusura**: il task raggiunge uno stato con `isEndState = true`. È un evento ordinario del ciclo di vita, sempre reversibile dall'utente (riapertura), e come visto sopra si propaga tra padre e figli.
- **Cancellazione** (`deletedAt` valorizzato, soft-delete già presente nello schema attuale): è un evento eccezionale, non simmetrico. Un utente che cancella un task **non può ripristinarlo** dall'interfaccia: il ripristino di un task cancellato resta possibile solo come intervento tecnico/manuale (es. un tecnico che agisce direttamente sul database o con uno strumento di supporto), non come funzione esposta nel prodotto. Questo aggiorna quanto descritto in `SPECIFICA_PRODOTTO.md`, dove "ripristinare un item cancellato" era elencato come normale operazione del core: qui resta a livello di dato (utile per recupero in caso di errore/supporto), ma non più come azione utente ordinaria.
- **Ai fini della cascata**: un figlio cancellato non conta né come "chiuso" né come "aperto" nel calcolo "tutti i figli chiusi" sul padre — va escluso dal conteggio, come se non esistesse più. Se il ripristino tecnico di un figlio cancellato lo riporta in vita su uno stato non finale, si applica la stessa regola di "nuovo figlio aggiunto a un padre chiuso" vista sopra (il padre si riapre se necessario).

### Migrazione verso una piattaforma esterna

Un task in stato `Nuovo` (o comunque non ancora concluso) può essere **trasferito** a una piattaforma esterna (es. Todoist, Zoho Projects, coerente con quanto già previsto in `SPECIFICA_PRODOTTO.md`) invece di essere portato avanti internamente. Questo trasferimento è un'altra via per raggiungere uno stato finale:

- Il task passa a uno stato `isEndState = true` dedicato (es. `Migrato`), distinto da `Fatto`.
- **La migrazione è bloccata se il task ha ancora sotto-task non chiusi**: non si cascata automaticamente la migrazione sui figli (a differenza della chiusura normale vista sopra) — l'utente deve prima chiudere, migrare o cancellare i figli aperti, poi può migrare il padre. Scelta deliberata: la migrazione sposta il lavoro fuori dal sistema, e farlo "trascinando" involontariamente dei sotto-task ancora aperti rischierebbe di perdere lavoro non finito senza che l'utente se ne accorga.
- Con la revisione di `isCompleted` (vedi sopra: riflesso automatico via trigger di `isEndState`), anche un task migrato risulta `isCompleted = true` una volta su questo stato — `isCompleted` non distingue più "fatto" da "migrato", lo fa solo `idState`/`t_state`. Chi ha bisogno di distinguere le due cose (es. report, statistiche) deve guardare lo stato puntuale, non `isCompleted`.
- Il collegamento alla piattaforma esterna di destinazione (quale piattaforma, eventuale id/URL della nuova posizione) non è ancora modellato: da progettare insieme al resto delle integrazioni di uscita già previste in `SPECIFICA_PRODOTTO.md`.

### Domande aperte sui flussi

Tutte le domande precedenti sono state chiuse in questo giro di revisione (2026-09-09):

- ~~Reminder singolo o tabella dedicata~~ **deciso**: campo singolo `reminderAt`, nessuna tabella.
- ~~Stati intermedi fissi o configurabili~~ **deciso**: configurabili, con transizioni manuali libere; `stepOrder` resta però vincolante per gli automatismi (cascata), non solo per la presentazione — vedi decisione più recente nella sezione Database.
- ~~La macchina a stati vincola le transizioni?~~ **deciso**: le transizioni manuali sono libere, l'utente può saltare tra stati; `stepOrder` è "legge" solo per gli automatismi (es. cascata), non un vincolo sui salti manuali.
- ~~Cascata verso il padre con esiti diversi tra i figli~~ **deciso**: il padre atterra sempre sull'ultimo stato `isEndState` in ordine — con una nota da mostrare in interfaccia quando questo non riflette l'esito reale dei figli (es. tutti migrati). Resta aperta la sotto-domanda su `isCompleted`: dato che ora `isCompleted` è comunque un riflesso automatico di "stato attuale = uno stato finale" (vedi sezione Database), il padre ha semplicemente `isCompleted = true` non appena atterra sul suo stato finale — non serve più chiedersi se richieda che *tutti* i figli abbiano `isCompleted = true`, la domanda era legata a una versione precedente di `isCompleted` ormai superata.
- ~~Cascata verso i figli quando il padre chiude manualmente~~ **deciso**: stesso stato del padre, **ma senza sovrascrivere silenziosamente i figli già chiusi** — su quelli va chiesta conferma esplicita all'utente (nuova regola, vedi sopra).
- ~~Riapertura in cascata~~ **deciso**: nessun automatismo, lo stato di destinazione del padre riaperto lo sceglie l'utente al momento.
- ~~Cancellazione di uno stato in uso~~ **deciso**: rimappatura sempre obbligatoria, tag automatico proposto come opzione a scelta dell'utente.
- ~~Oggetto sorgente~~ **principio fissato, dettagli rimandati**: contiene solo informazioni di servizio per recuperare il messaggio originale, separate dagli attributi del task; struttura esatta da decidere in fase di integrazione.

**Nota tecnica su SQLite e trigger** (rispondo qui alla domanda "SQLite dà problemi con i trigger?"): non ci sono limiti che impediscano di realizzare tutta questa logica con trigger, ma ci sono alcuni punti da tenere presenti in fase di implementazione:

- **Trigger ricorsivi disattivati di default**: se un trigger su `t_task` (es. "quando cambia `idState`, controlla se il padre va chiuso") deve a sua volta scatenare lo stesso tipo di trigger su un altro livello (padre → nonno), SQLite richiede `PRAGMA recursive_triggers = ON` nella connessione — di base i trigger non si richiamano a catena tra loro.
- **Rischio di loop**: con cascate bidirezionali (figli→padre e padre→figli, più le riaperture) va progettata la logica in modo che un trigger non retro-inneschi quello opposto all'infinito — tipicamente aggiornando una riga solo se il suo stato cambia davvero (un `UPDATE` che non cambia valore non deve ri-scatenare il trigger, ma va verificato nel design delle condizioni `WHEN`).
- **Conferme utente non gestibili da un trigger**: le regole appena decise (5bis: chiedere conferma prima di sovrascrivere figli già chiusi; riapertura: l'utente sceglie lo stato) **non possono essere implementate come semplici trigger SQL**, perché un trigger non può interrompersi a metà per aspettare un input dall'utente. Vanno quindi implementate nel core applicativo (`item-core.js` o equivalente futuro), che orchestra: legge lo stato attuale, decide se serve chiedere conferma, e solo dopo l'eventuale conferma esegue gli `UPDATE` necessari — i trigger restano utili solo per gli automatismi che non richiedono mai una scelta umana (es. l'aggiornamento di `isCompleted`, la chiusura per cascata quando non ci sono figli già chiusi in conflitto).
- Nessun problema noto specifico del binding `node:sqlite` usato dal progetto rispetto ai trigger — il vincolo `recursive_triggers` è generale a SQLite, non specifico di questo binding.

### Implementazione del core (2026-09-09)

Il core nuovo è scritto: `src/core/rinascita-schema.js` (schema + migrazione dal vecchio) e `src/core/task-core.js` (macchina a stati). Copertura in `test/task-core.test.js` e `test/rinascita-migration.test.js`. Il vecchio `item-core.js` e i suoi test **sono stati rimossi** una volta completato l'innesto (vedi sotto): restano in piedi solo le migrazioni 1→6 in `database.js`, che sono la strada obbligata per un database già installato, e le tabelle vecchie che quelle creano — lette dalla migrazione, mai più scritte.

Tre punti su cui la specifica non era decisa e su cui l'implementazione ha dovuto scegliere. **Tutti e tre confermati dall'utente il 2026-09-09**:

1. **Nome dello stato di partenza**: **"Nuovo"**. La sezione Database seminava "Da fare (`inbox`)"; la sezione Flussi dice due volte che un task nasce in "Nuovo", e vince quella. Il seed è `Nuovo` → `In corso` → `Migrato` → `Archiviato` → `Fatto`. "Nuovo" e "Da fare" non sono sinonimi nel modello dell'inbox — il primo dice "appena arrivato", il secondo "già smistato e da lavorare".
2. **Ordine degli stati e atterraggio della cascata**: gli stati hanno **un solo** ordine, `stepOrder`, e la cascata prende **il più grande** tra quelli finali. Niente flag separato, niente doppio ruolo da distinguere. Nel seed questo significa `Fatto` per ultimo, dopo `Migrato` e `Archiviato` — che sono chiusure laterali, non l'esito normale del lavoro — così un padre chiuso per cascata atterra su `Fatto`, come vuole l'esempio della specifica. Conseguenza accettata: nei menu ordinati per `stepOrder`, "Archiviato" compare prima di "Fatto".
3. **Forma delle due conferme utente**. Non potendo stare in un trigger, `setTaskState`, `createTask` e `restoreTaskTechnical` non lanciano eccezioni ma restituiscono un esito: `{ esito: "applicato" | "conferma" | "bloccato" }`. Quando serve una conferma la transazione viene annullata e non viene scritto niente; l'interfaccia richiama la stessa funzione passando la decisione (`sovrascriviFigliChiusi`, `statiRiapertura`). L'avviso di "scarto" della cascata (§ padre che atterra su Fatto mentre i figli sono Migrato) viaggia in `avvisi[]` sull'esito, pronto per essere mostrato.

### Innesto del renderer sul core (2026-09-09)

Il renderer non usa più dati di esempio. Catena: `electron/preload.cjs` espone `window.alia` → `alia:<operazione>` via IPC → `src/core/alia-core.js` → `task-core.js`. Nel renderer il ponte è `lib/aliaClient.js`, i dati stanno in `lib/AliaProvider.jsx` (un provider solo, perché la colonna "Da smistare" e l'area contenuto mostrano le stesse task da due angoli e non devono poter divergere), la traduzione core→viste in `lib/tasks.js`, i dialoghi delle conferme in `lib/AliaDialogs.jsx`.

Verificato sul database vero: l'app carica 39 task, 26 progetti, 2 stati. Fuori da Electron non c'è nessun core e la schermata lo dice invece di fingere; il dataset finto (`inbox/data.js`, `demoDataset`) esiste solo per `preview.html`, che serve al confronto con gli artboard.

Tre punti in cui l'innesto ha toccato decisioni non ancora prese. **Da confermare:**

1. **Le origini da confermare non hanno un dato dietro.** Nel core non esiste un flag "non ancora confermata" — è esattamente la domanda che la sezione Database lascia aperta sotto "Stati speciali del task". Nel frattempo la colonna legge ciò che il modello sa già dire: task nata da una sorgente esterna (`sourceType <> 'manual'`) e ancora nello stato di partenza; "confermare" la porta sul primo stato intermedio. Se non ce n'è uno configurato — è il caso del database attuale, che ha solo `Da fare` e `Fatto` — il gesto è spento e il pulsante spiega perché. Va deciso davvero.
2. **Le priorità sono cinque nel core e quattro nel design.** `urgent` non aveva un colore; gli ho dato il rosso più saturo della rampa (`red-500` contro `red-400` di `high`), che li distingue senza rifare la scala. Da verificare sull'artboard.
3. **Il chip di stato si colora per ruolo, non per etichetta** — partenza neutra, intermedio con l'accento, chiusura spenta e a contorno. È l'unica cosa su cui la grafica può contare, dato che gli stati sono configurabili. Conseguenza: più stati intermedi condividono lo stesso azzurro. Se diventeranno molti servirà distinguerli, ma è una decisione da prendere sull'artboard, non inventando colori nel componente.

Le viste Calendario e Gantt restano gli abbozzi che erano — il loro disegno è rimandato — ma non mostrano più dati inventati: i punti sono le scadenze vere del mese, le barre solo le task che hanno davvero `startAt` e `dueAt`.

Due perdite di informazione accettate nella migrazione, da sapere: il vecchio `item_history` è un diario di eventi (`event_type` + `details`), non un registro di campi cambiati, quindi entra in `t_task_history` con l'evento in `field`, il dettaglio in `newValue` e `oldValue` nullo — non c'è modo di ricostruire il valore precedente. E `item_comments.author` si perde, perché `t_task_comment` non ha un autore (sistema mono-utente).

## Interfaccia

Sezione separata dedicata alle direttive grafiche/UI decise lavorando sui mockup in Claude Design (progetto Alia, design system Nocturne, board `MainDEF.dc.html`). A differenza delle sezioni Database e Flussi, qui si documentano scelte di *presentazione e interazione*, non di schema — ma sono comunque decisioni vincolanti per l'implementazione futura del renderer.

### Schermata principale — struttura a due colonne

- **Colonna Inbox** (sinistra): larghezza di default 1/5 dello schermo, ridimensionabile trascinando una maniglia centrale. Superato il **75%** della larghezza durante il trascinamento, la colonna si apre subito e completamente al 100% ("Full Inbox") con una transizione fluida (non uno scatto), mostrando una pillola "Rilascia per Full Inbox" centrata in alto; se il cursore torna sotto soglia mentre si tiene ancora premuto, l'effetto si annulla di colpo e la colonna torna esattamente sotto il cursore (nessuna easing di ritorno). Un pulsante "Torna alla vista divisa" in alto a destra permette di uscire dalla modalità Full Inbox, ripristinando l'ultima larghezza usata prima dello scatto.
- **Colonna contenuto** (destra): non è a tutto campo come lo sfondo — è una card "in sovraimpressione" (`var(--color-surface)`, bordi arrotondati, ombra), con margine rispetto ai bordi del frame. La colonna Inbox invece condivide lo stesso colore di sfondo dell'app (`var(--color-bg)`), senza tinta propria, cosicché in modalità Full Inbox non c'è alcuna cucitura visibile.
- **Niente rail di navigazione fissa nella colonna contenuto**: una versione precedente prevedeva una fascia laterale interna con nav (Oggi/Tutti/Kanban/Gantt) + elenco progetti — è stata rimossa. I progetti si selezionano altrove (vedi sotto), non c'è una seconda barra di navigazione duplicata dentro la card.

### Dove vivono i progetti: selettore di ambito nell'Inbox

**Deciso**: i progetti non hanno una propria sezione di navigazione dedicata nella schermata principale. Vivono invece come **selettore di ambito** in cima alla colonna Inbox: un pulsante a tendina (icona/pallino colore + nome + freccia) che apre un menu con:

- **Tutti i progetti** (mostra tutto, nessun filtro);
- **Nessun progetto** (mostra solo i task non categorizzati — l'inbox "vera", in senso stretto);
- un elenco dei progetti esistenti (pallino colore + nome + conteggio).

La scelta fatta qui è **condivisa** con la colonna contenuto: l'etichetta "Ambito: …" nella barra della vista principale riflette lo stesso valore selezionato nell'Inbox — un solo stato, due punti in cui si legge, non due filtri indipendenti da tenere sincronizzati manualmente.

**Creazione/cancellazione progetti**: non avviene da questa schermata. Si fa in **Impostazioni** (schermata a parte, non ancora disegnata in dettaglio). Qui il progetto è solo selezionabile, mai creabile/cancellabile — coerente con l'idea che la schermata principale serve a *lavorare* sui task, non ad amministrare la struttura dei progetti.

### Small Inbox vs. Full Inbox — due modalità con scopi diversi

Distinzione importante emersa discutendo l'assegnazione dei task ai progetti, da tenere ferma nel disegno futuro:

- **Small Inbox** (colonna stretta, stato di default): si lavora **su un ambito alla volta** (un progetto specifico, "tutti" o "nessuno", scelto dal selettore sopra) — è la vista di *filtro/consultazione* principale.
- **Full Inbox** (colonna espansa al 100%, magnetica): è la schermata pensata per il **triage di più task insieme** — spazio per barra di ricerca/filtri estesa, target di trascinamento per progetto, selezione multipla con azione in blocco.

### Funzioni definite per Small Inbox e Full Inbox

Entrambe condividono lo stesso selettore di ambito in cima (vedi sopra), ma per il resto sono due schermate/stati distinti, con elementi diversi — fissato disegnandole davvero (frame 01 e 02 su `MainDEF.dc.html`):

**Small Inbox** (colonna stretta, stato di default), dall'alto in basso:
1. Selettore di ambito (Tutti/Nessuno/progetto).
2. **Pulsante "Aggiungi task"** (bordo tratteggiato, icona +, scorciatoia ⌘K) — riprende esattamente lo stile del vecchio sidebar Alia (`Main board.dc.html`). Qui resta un pulsante che apre il composer altrove, non un form completo — non c'è spazio.
3. **Elenco di card semplici**: una card per task, mostra **solo il titolo**, sfondo leggermente rilevato rispetto al fondo colonna. Sono **trascinabili** — il trascinamento qui serve a **riordinare** l'elenco (drag verticale con riordino live in base alla posizione del cursore), non ad assegnare un progetto: in questa vista stretta non ci sono target di assegnazione visibili.

**Full Inbox** (colonna espansa al 100%, magnetica), dall'alto in basso:
1. Selettore di ambito, **ma non più a larghezza piena** — diventa un pulsante compatto (dimensionato al contenuto) accanto al titolo "Inbox", per lasciare spazio al resto.
2. **Board in stile Trello**: una colonna per "Nessun progetto" (neutra, tratteggiata) più una colonna per ciascun progetto, con **intestazione colorata** (tinta ricavata dal colore del progetto). Le card mostrano titolo, priorità e scadenza (più elementi della semplice card della Small Inbox, coerente con "stile Trello" della vista Kanban già presente altrove). Due gesti di trascinamento distinti:
   - **Card tra colonne**: trascinare una card su un'altra colonna riassegna il progetto del task (stesso meccanismo di drag già visto nel vecchio mockup Alia, Filter Bar/Kanban).
   - **Intestazione di colonna**: trascinare l'intestazione di un progetto la riordina rispetto alle altre colonne (la colonna "Nessun progetto" resta sempre la prima, non riordinabile — non è un vero progetto).

**Sulla sintassi rapida `@progetto`**: resta comunque il modo più veloce di assegnare un progetto **al momento della creazione** scrivendo nel composer (in entrambe le viste, quando si userà il composer pieno) — non sostituisce quanto sopra, lo completa.

**Revisione**: il composer completo previsto al punto 2 sopra è stato **rimosso dalla Full Inbox** — l'inserimento di un nuovo task troverà posto altrove (schermata/punto d'accesso ancora da decidere), non è più parte di questa vista. La Full Inbox si concentra solo sul triage di task già esistenti (spostare, confermare, riordinare), non sulla creazione.

**Revisione**: rimosso anche il **selettore di ambito dalla Full Inbox** — è ridondante lì, dato che la board è già organizzata per progetto tramite le colonne. Nella Small Inbox il selettore resta, ma **senza la voce "Nessun progetto"** (restano solo "Tutti i progetti" e i singoli progetti) — vedere i soli task non categorizzati non è un caso d'uso previsto per questa vista di filtro veloce.

### Interazione standard delle card task (definita disegnando le card reali, non più segnaposto grigi)

Applicata a ogni card in cui compare un task vero (Small Inbox, board della Full Inbox, viste Lista/Kanban della colonna contenuto) — copiata dalla card "Task Row" del vecchio mockup Alia (vista Kanban), poi adattata:

- **Struttura**: riga superiore con checkbox + titolo (mai spezzati su righe diverse — sono nello stesso contenitore flex senza possibilità di andare a capo separatamente); riga inferiore opzionale con la sola scadenza, mostrata **solo se presente** (nessuna icona/etichetta finta quando il dato manca).
- **Checkbox di completamento**: **invisibile di default**, appare **solo al passaggio del mouse sulla card**. Non lascia uno spazio vuoto quando è nascosto (larghezza e margine a zero, non solo opacità) — quando appare, "cresce" da zero e **spinge il titolo verso destra** in modo fluido, invece di sovrapporsi o lasciare un buco. Colorato secondo la priorità del task (stessi colori del vecchio mockup: rosso/ambra/verde/grigio).
- **Bordo della card**: trasparente di default, si colora dell'accent al passaggio del mouse (nessun cambio di sfondo).
- Le card della colonna "Origini da confermare" (Full Inbox) restano un caso a parte: non hanno checkbox (non sono ancora task veri), mostrano invece la sorgente e i tre pulsanti Elimina/Modifica/Conferma già descritti sopra.

### Task da sorgente esterna in Full Inbox — colonna "Origini da confermare"

**Deciso**: niente doppia modalità operativa (una per il triage normale, una per le sorgenti esterne) — i task nati da una sorgente esterna (mail/Discord/Telegram, vedi sezione Flussi) si gestiscono **nella stessa board Trello** della Full Inbox, non altrove.

- Aggiunta una colonna **fissa, sempre la più a sinistra**, prima ancora di "Nessun progetto": tinta azzurra (stesso colore accent dell'app, non un colore nuovo), intestazione **"Origini da confermare"** con icona busta/inbox al posto del pallino colore.
- Le card in questa colonna rappresentano task non ancora confermati: al posto di priorità/scadenza mostrano la **sorgente di provenienza** (Mail/Discord/Telegram, con icona) e due **pulsanti piccoli**:
  - **Modifica** (icona matita): apre la revisione del task prima di confermarlo — destinazione non ancora progettata (verrà collegata quando si disegnerà il dettaglio/editor del task).
  - **Conferma** (icona spunta): conferma con un solo click, equivalente a trascinarlo su "Nessun progetto" — utile quando non serve assegnare subito un progetto.
- **Confermare un task da sorgente** si può fare in due modi equivalenti: il pulsante "Conferma" (sempre verso "Nessun progetto") oppure **trascinandolo** fuori da questa colonna direttamente su un progetto specifico — stesso identico gesto di drag già usato per il triage normale. Entrambi convertono il task (rimuovono lo stato "da confermare", assegnano il progetto di destinazione).
- La colonna "Origini da confermare" **non è un target di trascinamento**: non si può spostare un task già confermato all'indietro dentro di essa — è un ingresso a senso unico, coerente con l'idea che una volta triagato un task non torna "in sospeso".

### Selettore vista (Lista/Kanban/Calendario/Gantt)

**Deciso**: le modalità di visualizzazione dei task (Lista, Kanban, Calendario, Gantt) non sono tab separate — sono raccolte in un **menu a tendina all'estrema destra della barra filtri**, con icona coerente per ogni vista (lista: righe; kanban: colonne; calendario: griglia; gantt: barre orizzontali) e spunta sulla vista attiva. "Oggi" resta una tab separata a sinistra, distinta dal concetto di "vista" — è un filtro temporale, non un modo di visualizzare.

### Componenti/stili riutilizzati dal design system

Tutto costruito sopra Nocturne (stessi token `--color-*`/`--radius-*`/`--shadow-*`, stessa tipografia Inter, stesse icone Phosphor-style già in uso nel mockup Alia originale). Pattern specifici riusati/introdotti in questa schermata: pulsanti a tendina con icona+etichetta+freccia (stesso pattern per selettore ambito e selettore vista), menu a comparsa con voci icona+etichetta+spunta, skeleton grigi (`color-mix` sul colore testo) per rappresentare contenuto non ancora definito nei mockup.
