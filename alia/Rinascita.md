# Rinascita

Il documento del progetto Alia: **uno solo**. Raccoglie il modello dei dati, i flussi, le decisioni di interfaccia e le cose da fare.

Dal 2026-09-10 e l'unico documento del repo. `DESIGN_LOCK.md`, `SPECIFICA_PRODOTTO.md`, `README.md` e `TODO.md` sono stati riassorbiti qui: le parti ancora vere sono nelle sezioni che seguono, il resto era cronaca di decisioni superate e resta nella storia di git, dove va cercato se serve.

## Stato del documento

Aggiornato al 2026-09-10.

- **Database** — entita `t_task`/`t_project`/`t_milestone`/`t_state`, convenzioni, vincoli, migrazioni. Schema corrente: **9**.
- **Flussi** — la macchina a stati: nascita, promemoria, cascata di chiusura e riapertura, migrazione esterna.
- **Interfaccia** — cosa c'e a schermo e perche, con le misure che vanno rispettate.
- **Come si lavora** — avviare, provare, seminare dati, pubblicare.
- **ToDo** — le domande aperte, in ordine di quanto bloccano.

Resta volutamente aperta una sola questione di modello dati: i dettagli dell'oggetto sorgente esterno.

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
- `idProject`: riferimento al progetto di appartenenza, sostituisce l'attuale `items.project` testuale. **Rimane opzionale** (`NULL` ammesso, come nello schema attuale): un task **non deve necessariamente avere un progetto**, coerente con il principio dell'inbox già fissato ("l'inbox non coincide necessariamente con la lista definitiva delle attività" — un task può nascere non ancora categorizzato). `ON DELETE`: vedi "Cancellazione di un progetto con task collegati" più sotto — non è un semplice `SET NULL` automatico, richiede una scelta esplicita dell'utente.
- `idMilestone`: riferimento alla milestone di appartenenza (vedi nuova entità `t_milestone` sotto), **opzionale** (`NULL` ammesso). `ON DELETE SET NULL`: cancellando una milestone, i task collegati perdono solo il riferimento, non vengono cancellati. Vincolo di coerenza da garantire nel core (non esprimibile in un `CHECK` dichiarativo su SQLite senza una sotto-query): la milestone scelta deve appartenere allo stesso progetto del task (`t_milestone.idProject = t_task.idProject`). **Deciso**: nessuna colonna propria per livello — un sotto-task eredita `idMilestone` dal padre esattamente come `idProject` (stessa logica, stessa propagazione a cascata se cambia).
- `position`: ordinamento tra fratelli (figli dello stesso `idParentTask`, o tra i task di primo livello dello stesso progetto).

**Revisione (sostituisce la versione precedente basata su `isContainer`)**: le "liste" come tipo di task contenitore **non esistono più**. Il flag `isContainer` è eliminato dallo schema. Restano invece, come concetti distinti:
- i **task padre con sotto-task**, che continuano a esistere esattamente come prima (un task qualunque può avere figli, senza bisogno di marcarsi come "contenitore" per farlo);
- le **milestone**, che non sono più un tipo di task ma un'entità a parte, propria dei progetti (vedi sotto) — sostituiscono sia il ruolo organizzativo che avevano le "liste" sia il concetto di milestone introdotto in precedenza come variante di task.

**Coerenza `idProject`/`idMilestone` tra padre e figli**: un sotto-task **non può appartenere a un progetto (né a una milestone) diversi da quelli del proprio padre** — vincolo forte, imposto nel core (non un `CHECK` dichiarativo, richiede di leggere la riga del padre). In pratica solo il task di primo livello di un albero sceglie liberamente progetto e milestone (o nessuno dei due); ogni sotto-task li eredita entrambi, e riassegnarli sul task di primo livello deve propagarsi a cascata su tutti i suoi discendenti per mantenere l'invariante.

**Stati speciali del task (inbox, "non ancora preparato", ecc.) — deciso (2026-09-10): flag dedicato `isInbox`**. Serve poter distinguere con filtri efficaci i task "appena arrivati/non ancora lavorati" da quelli già in lavorazione. Le tre strade possibili (assenza di `idProject`, assenza di date `startAt`/`dueAt`, flag dedicato) non sono equivalenti, e la condizione derivata — "inbox = nessun progetto e nessuna data" — è stata scartata: si vuole poter **mettere in agenda un task che è ancora da triare**, dandogli una data o un progetto senza per questo farlo sparire dall'Inbox. Derivare lo stato dai campi di catalogazione lega insieme due cose che devono restare ortogonali. Quindi: campo `isInbox` su `t_task`, indipendente da `idProject`/`idMilestone`/`startAt`/`dueAt`, che l'uscita dal triage azzera esplicitamente.

**Implementato il 2026-09-10** (schema 8). Le quattro sotto-domande lasciate aperte, decise:

1. **Valore iniziale**: un task di primo livello nasce **sempre** in triage, e non perché gli manchi qualcosa (progetto, data) ma perché l'inbox è il posto dove le cose arrivano prima di essere decise. Vale identico per la creazione manuale e per le sorgenti esterne: la differenza fra le due la dice già `sourceType`, non serve dirla due volte. `input.isInbox` scavalca la regola, per chi crea un task sapendo già dove va (una migrazione esterna, un seed).
2. **Ereditarietà sui sotto-task**: un sotto-task nasce **fuori** dal triage. Lo si scrive dentro un task che esiste già, quindi è lavoro organizzato per costruzione, e mandarlo in triage riempirebbe la colonna di figli che nessuno ha bisogno di smistare. Invariante verificata sul database reale: nessun figlio con `isInbox = 1`.
3. **Quale gesto lo azzera**: `setTaskInbox`, una funzione a parte e non un campo di `updateTask`. Il motivo non è di stile: `isInbox` non è un attributo come il titolo o la priorità, è una posizione nel flusso di lavoro — allo stesso titolo di `idState` — e le posizioni nel flusso hanno funzioni proprie perché possono avere regole. Di suo passa dallo storico come tutto il resto. In interfaccia lo governano la conferma sulle card origine e la voce "Togli dal triage / Rimetti da smistare" nel dettaglio; presto il trascinamento verso il pannello contenuto.
4. **Migrazione dei task esistenti**: `isInbox = 1` per i task di primo livello senza progetto, `0` per tutti gli altri. Non è una ricostruzione dello storico — quel dato non esisteva — è la fotografia di ciò che l'interfaccia stava già chiamando "da smistare", dato che la colonna mostrava esattamente quelli. Applicata al database reale: 40 task, 25 in triage (tutti di primo livello), 0 figli.

Prova del principio, misurata sull'app: assegnando un progetto a un task della colonna, il task **resta** in colonna (`isInbox = 1` con `idProject` valorizzato). Con la condizione derivata sarebbe sparito nell'istante dell'assegnazione, ed è precisamente ciò che si voleva evitare.

### Origini nuove — deciso e implementato (2026-09-10, schema 9): flag `isNew`

Un secondo flag su `t_task`, che **non** è uno stato di lavoro: dice "questa origine è arrivata e nessuno l'ha ancora guardata". È la campanella delle notifiche, e serve al badge azzurro sull'intestazione di quadro — nella vista divisa la colonna delle origini non è a schermo, quindi senza questo dato non c'è modo di sapere che nella Full Inbox è arrivato qualcosa.

Perché un campo e non una condizione derivata, di nuovo: `isInbox` è la posizione nel flusso (un'origine resta da smistare per giorni dopo che l'hai vista) e `createdAt` misura l'età, non lo sguardo — con una soglia a tempo la campanella tornerebbe a spegnersi da sola. "Visto" è un fatto dell'utente, e i fatti dell'utente si scrivono.

Le decisioni, con la stessa griglia usata per `isInbox`:

1. **Valore iniziale**: acceso solo per le **origini esterne di primo livello che entrano in triage** (`sourceType` diverso da `manual`). Un task scritto a mano non ha bisogno di annunciarsi a chi lo ha appena scritto; un sotto-task non compare nella colonna delle origini, quindi non ha nessuno a cui annunciarsi. `input.isNew` scavalca la regola, per il seed e le importazioni.
2. **Quale gesto lo azzera**: `markOriginsSeen`, che le spegne **tutte insieme**, perché ciò che lo scatena è collettivo — entrare nella Full Inbox vuol dire avere davanti l'intera colonna. Spegnerle una a una richiederebbe che la vista sapesse quali erano visibili, e non lo sa. L'interfaccia lo chiama entrando nella board e tiene un'istantanea locale di quali erano nuove, così i pallini sulle card restano visibili finché si sta lì dentro invece di spegnersi sotto gli occhi.
3. **Storico**: nessuna traccia, a differenza di `setTaskInbox`. Lo storico racconta cosa è successo *al task*; qui non è successo niente al task, è successo a chi guarda, e registrarlo riempirebbe la cronologia di righe che non spiegano nessuna decisione.
4. **Migrazione dei task esistenti**: `isNew = 1` per le origini esterne ancora in triage. Non è una ricostruzione dello storico — quel dato non c'era — è la lettura più vicina al vero, perché fino a oggi nessuno ha potuto guardarle nel senso che questo campo intende.

Ortogonalità verificata a test: vedere un'origine non la smista, e smistarla non la fa vedere.

Nota su `subtasks.done`: con questo modello "fatto" è semplicemente `idState` del task figlio che punta a uno stato di chiusura (vedi la nuova entità `t_state` più sotto, che sostituisce l'attuale tabella `statuses`), non serve più un campo booleano dedicato.

### Configurazione degli stati — implementato (2026-09-10)

`t_state` era configurabile per disegno e immutabile in pratica: nessuna operazione lo scriveva. Il pannello Impostazioni (`DEF_Impostazioni`, sezione Stati) ha portato `createState`, `updateState`, `reorderStates`, `deleteState`.

**La fila ha i due capi fissi.** Deciso lo stesso giorno, dopo un primo giro in cui il ruolo era un campo libero su ogni riga:

| | |
|---|---|
| **primo** | apertura: uno solo, sempre in testa. Non si cancella, non cambia ruolo, non si sposta. Si può solo rinominare |
| **in mezzo** | passaggi: quanti se ne vuole, riordinabili, cancellabili, e ciascuno può contare o no come conclusione — le **chiusure secondarie** (migrato, archiviato, annullato) |
| **ultimo** | chiusura: sempre in coda, sempre conclusiva. Non si cancella e non si sposta. Si può solo rinominare |

Perché irrigidirla. Con il ruolo libero nascevano tre domande a cui nessuna risposta era buona: che succede se tolgo il ruolo all'unica apertura (il flusso resta senza ingresso), se cancello l'ultima chiusura (i padri chiusi per cascata non hanno dove atterrare), se riordino mettendo una chiusura in mezzo (l'atterraggio si sposta sotto i piedi senza che nessuno abbia toccato un task). Il primo giro rispondeva con tre rifiuti e due avvisi. Fissando i due capi le domande **non si pongono più**: non sono vietate, sono irrappresentabili.

Il guadagno più grande è sull'atterraggio. La regola della specifica resta la stessa — "l'ultimo `isEndState` per `stepOrder`" — ma ora ha **una sola risposta possibile** in ogni configurazione: la chiusura finale, che è l'ultima per costruzione. "L'ordine è legge" continua a valere e smette di essere una trappola.

Le tre invarianti che ogni scrittura difende:

1. esiste esattamente uno stato con `isStartState = 1`, ed è il primo per `stepOrder`;
2. l'ultimo per `stepOrder` ha `isEndState = 1`;
3. gli stati in mezzo non sono mai di apertura, e la loro conclusività è libera.

Da cui, nelle operazioni:

- **`createState`** infila il nuovo stato **prima della chiusura finale**, non in fondo: in fondo diventerebbe lui l'ultimo, e l'ultimo è la chiusura. Nasce non conclusivo.
- **`updateState`** accetta due sole cose: l'etichetta, sempre, e `isEnd`, solo per gli stati in mezzo. Il ruolo dei due capi non è un campo, è la loro posizione. Cambiare `isEnd` **riallinea `isCompleted` dei task su quello stato**: i trigger dello schema scattano sull'inserimento del task e sul cambio del suo `idState`, e qui il task non si muove — si muove il terreno sotto di lui.
- **`reorderStates`** vuole l'elenco completo e senza ripetizioni (`stepOrder` è una posizione assoluta), e rifiuta ogni ordine che sposti i capi. Un elenco sbagliato viene rifiutato invece che corretto in silenzio: correggerlo significherebbe eseguire una richiesta diversa da quella arrivata.
- **`deleteState`** rifiuta i due capi, e sugli stati in mezzo si ferma a chiedere dove spostare i task che li usano (`conferma` con le destinazioni, si richiama con `decisioni.idStateDestinazione`). Lo spostamento passa dallo storico come qualunque altro cambio di stato. Dopo la cancellazione le posizioni si richiudono sul buco, così `stepOrder` resta una fila e non una serie di numeri qualsiasi.

### Sorgente di origine (da pensare, non implementare ora)

Idea aperta, non ancora progettata nel dettaglio: aggiungere a `t_task` un campo (o un piccolo gruppo di campi, sul modello di `sourceType`/`sourceId`/`sourceUrl`/`originalContent` già presenti su `items`) per salvare la sorgente di origine del task quando questo nasce da uno spezzone di un altro task o da un contesto esterno diverso dalla semplice creazione manuale. Da riprendere insieme alle sorgenti esterne (email/Discord) già previste per le sorgenti esterne. Nessuna decisione di schema per ora.

**Principio guida (deciso, dettagli rimandati)**: l'oggetto sorgente deve contenere le informazioni della sorgente che **non servono al task in sé**, ma che permettono eventualmente di recuperare il messaggio/elemento originale (es. l'identificativo del messaggio, la cassetta/canale di provenienza, dettagli tecnici del protocollo) — informazioni di servizio, tenute separate dagli attributi operativi del task. La forma esatta (campi comuni a `mail`/`discord`/`telegram` o campi specifici per tipo) resta rimandata a quando si affronterà davvero l'integrazione delle sorgenti esterne.

**Nota importante emersa dai flussi**: una singola sorgente esterna (es. una email) **può generare più task** (es. un'email con tre azioni distinte diventa tre task separati), non uno solo. Questo significa che il vincolo di unicità oggi presente in `items_source_identity` (`UNIQUE(source_type, source_id) WHERE source_id IS NOT NULL`) **non può essere riportato così com'è** su `t_task`: impedirebbe a una stessa sorgente di generare più di un task. Quando si progetterà davvero questa parte, la relazione corretta è 1 sorgente → N task (più vicina a un'entità `t_source` separata referenziata da più righe di `t_task`, che non a una coppia di colonne uniche su `t_task` stesso); l'eventuale idempotenza dei connettori (non reimportare due volte lo stesso messaggio) andrà garantita a livello della sorgente, non del task.

### La confluenza delle sorgenti — implementata (2026-09-11)

Le sorgenti esterne non parlano con Alia: parlano con un **servizio a parte**, e
Alia scarica da lì come un client di posta da un server. Il repo tiene i due
progetti affiancati — `alia/` (l'app) e `api/` (il servizio) — separati perché
hanno vite diverse: l'app sta accesa quando la usi, il servizio sta acceso
sempre.

Chiude la questione aperta 9 ("non c'è nessuna origine: badge e colonna sono
costruiti e invisibili"): il mittente che mancava adesso c'è.

**Perché fuori e non dentro.** La prima versione, la mattina stessa, era un bot
Telegram dentro il processo main di Electron. Funzionava, ma aveva un limite che
non si poteva togliere restando lì: ascoltava solo ad app aperta, e quello che
arrivava oltre le ~24 ore di ritenzione di Telegram si perdeva. Spostarlo in un
processo separato che scrivesse sullo stesso `.sqlite` non era la risposta —
`core/database.js` documenta da tempo che `node:sqlite` non si aggancia in modo
affidabile al `-wal` scritto da un'altra connessione. La risposta è che il
servizio **non tocchi il database**: parla una lingua sua, e Alia gliela chiede.

#### Il contratto

    GET  /salute                   come sta, e quanto c'è in coda
    GET  /origini?limite=&da=      le origini dopo il cursore
    POST /origini/conferma {fino}  sposta la ricevuta di lettura

Tre proprietà, e sono tutto il disegno:

1. **Leggere non consuma.** `GET /origini` si può richiamare all'infinito e
   restituisce le stesse righe finché nessuno conferma. È ciò che rende l'intero
   giro ritentabile: se la connessione cade a metà, si ricomincia e non manca
   niente.
2. **La ricevuta è una sola, e sta sul server.** Il cursore vive nella tabella
   `lettore` del servizio, non in Alia. Due ricevute sarebbero due verità che
   prima o poi divergono, e quando divergono o si perde un'origine o se ne
   importa una due volte.
3. **Si conferma DOPO aver scritto.** Mai prima. Il prezzo è il doppione raro —
   Alia scrive, muore prima di confermare, e al giro dopo riscrive le stesse. È
   il verso giusto in cui sbagliare: una task duplicata si cancella in un gesto,
   una persa non si sa nemmeno di averla persa.

#### Dove sta l'idempotenza, finalmente per intero

§ Sorgente di origine aveva deciso che il vincolo `UNIQUE(sourceType, sourceId)`
**non** poteva vivere su `t_task`, perché una sorgente può generare N task, e che
l'idempotenza andava garantita "a livello della sorgente". Ora ci sono tre
confini e ognuno ha la sua guardia, senza che nessuna contraddica le altre:

| Confine | Guardia |
|---|---|
| Telegram → servizio | l'offset di `getUpdates`, in `sorgente_stato` |
| Discord → servizio | il cursore `after` per canale, nella stessa `sorgente_stato` |
| dentro il servizio | `UNIQUE(sourceType, sourceId)` su `origine` — lì una riga **è** un messaggio |
| servizio → Alia | nessuna, e non serve: leggere non consuma (vedi `isProcessed`) |

E su `t_task` non c'è nessun vincolo, come deve essere: una riga di `origine` può
diventare tre task, e nessuno glielo impedisce.

#### `origine.servizio`: il posto delle informazioni di servizio

La colonna `servizio` (JSON) tiene chi ha scritto, in che chat, l'id tecnico del
messaggio, quando è stato inviato. È esattamente quello che § Sorgente di origine
voleva "tenuto separato dagli attributi operativi del task", ed è la prima forma
concreta di `t_source`. Resta di là: Alia scarica `title`, `originalContent`,
`sourceType`, `sourceId`, `sourceUrl` e non tocca il resto, perché non avrebbe
dove metterlo.

#### Una sveglia, tre modi di suonarla

Il giro è sempre lo stesso; cambia chi lo fa partire — e si configura in
Impostazioni, Fonti collegate:

- **manuale** (predefinito) — una freccia circolare nella testata della colonna
  delle origini, accanto al conteggio: quel numero è l'unica risposta che il
  comando ha da dare, quindi stanno sulla stessa riga. Era un bottone largo in
  fondo alla colonna, e pesava come se andare a prendere le origini fosse il
  gesto principale della schermata — che invece è smistarle;
- **periodico** — un timer ogni N minuti, minimo uno;
- **push** — non ancora: vedi questione aperta 15.

Il manuale è il predefinito perché **la confluenza è facoltativa**: può non
essere configurata, essere spenta, stare su una macchina che oggi non risponde.
Uno scarico automatico in quelle condizioni è un errore che si ripete dove
nessuno lo guarda. Un gesto ha sempre qualcuno davanti — e infatti sotto la
testata compare l'errore per esteso con accanto "Riprova": il comando si è
ristretto a un'icona, il fallimento no, perché un'icona che diventa rossa direbbe
che qualcosa non va senza dire cosa. È anche la risposta
locale alla questione aperta 4 (gli errori invisibili fuori dalle Impostazioni):
qui l'errore non ha bisogno di un posto generico, perché ha un posto suo.

#### Il verso opposto dell'IPC

Tutto il resto di Alia è `invoke`: il renderer chiede, il main risponde. Lo
scarico rovescia il verso — le origini arrivano mentre nessuno le stava
chiedendo — quindi il main manda `alia:origini` alle finestre e il provider
ricarica. Le rotte della confluenza stanno in un ponte separato
(`window.confluenza`) e non in `ALIA_OPERATIONS`: non sono operazioni del core, e
**restituiscono un esito invece di lanciare**, perché possono fallire per ragioni
che il core non conosce — rete, token, servizio spento.

#### Configurazione

- **Servizio**: `api/config.json`, creato al primo avvio con un token casuale
  dentro. Porta, host (`127.0.0.1` di default: farsi vedere dalla rete è una
  scelta da fare apposta), percorso della coda, e una voce per sorgente sotto
  `sorgenti` — `telegram` (token del bot, `chat` autorizzate), `discord` (token
  del bot, `canali` da leggere). Ogni campo si può scavalcare con una variabile
  d'ambiente (`ALIA_DISCORD_TOKEN`, `ALIA_DISCORD_CANALI`, e le equivalenti di
  Telegram), perché in un container un segreto non si passa con un file.
- **Alia**: `confluenza.json` nella cartella dei dati — indirizzo, token, modo,
  intervallo. Si compila da Impostazioni, Fonti collegate: la sezione che era
  disegnata e vuota.

#### Il connettore Discord — aggiunto l'11/09/2026

Seconda sorgente, sulla forma della prima: `api/src/sources/discord.js` è un
modulo puro come `telegram.js`, e il montaggio in `servizio.js` è diventato un
registro (`SORGENTI`) invece di un `if` per sorgente — la terza si aggiunge con
una voce e un file.

**REST a intervalli, non Gateway.** Un bot Discord di solito tiene aperta una
WebSocket e riceve `MESSAGE_CREATE` in tempo reale. Serve a ricevere da tutto
quello che il bot vede; qui i canali sono quelli che gli dici tu, e per quelli
`GET /channels/{id}/messages?after=` dice la stessa cosa con una `fetch` e zero
dipendenze. Il prezzo è la latenza, fino a cinque secondi. Il Gateway, se un
giorno servisse, entra dietro la stessa interfaccia (`start`/`stop`/`attivo`).

**Il ricevuto è una reazione, non una risposta.** Su Telegram la chat col bot è
una casella privata e una risposta è l'unica conferma possibile. Un canale
Discord è condiviso: un bot che replica a ogni messaggio lo rende illeggibile
per tutti gli altri. Quindi ✅ quando l'origine è entrata, 🚫 quando non c'era
testo da prenderci — silenzioso, e visibile a chi ha scritto.

**La storia non si importa.** Al primo sguardo su un canale il cursore si pianta
ad *adesso* (uno snowflake fabbricato dall'orologio, che funziona anche su un
canale ancora vuoto). Un canale vivo da tre anni non è un arretrato da smistare:
è rumore che seppellirebbe la colonna al primo avvio.

**La trappola, per iscritto.** `GET messages` restituisce anche i messaggi dei
bot — al contrario di `getUpdates`, che non ti ridà quello che hai mandato tu.
Senza il filtro su `author.bot`, un bot che scrivesse in canale si rileggerebbe
da solo, per sempre. Per questo il filtro è una funzione esportata e provata
(`daGuardare`), non un `if` dentro il ciclo.

#### Resta fuori

Gli allegati senza didascalia (il modello del task è fatto di testo); la mail,
che è la terza sorgente prevista e non c'è; il webhook al posto del long polling
verso Telegram e il Gateway al posto del polling verso Discord, che diventeranno
sensati quando il servizio avrà un indirizzo pubblico; e il push, questione
aperta 15.

### Dove vivono i dati — sul Desktop, fuori dal repo (2026-09-11)

Database, configurazione delle sorgenti e profilo di Chromium stanno tutti in
**`Alia-dati` sul Desktop**. Fino all'11/09/2026 stavano in `%APPDATA%\alia`,
che è il `app.getPath("userData")` proposto da Electron.

La riga che lo decide è in cima a `electron/main.js`:

```js
const CARTELLA_DATI = process.env.ALIA_DATA ?? join(app.getPath("desktop"), "Alia-dati");
mkdirSync(CARTELLA_DATI, { recursive: true });
app.setPath("userData", CARTELLA_DATI);
```

Tre cose che non sono dettagli:

- **`setPath` e non solo un `databasePath` diverso.** Cambiare il percorso del
  solo `.sqlite` lascerebbe nel posto vecchio tutto il resto — cache, Local
  Storage, preferenze della finestra — cioè metà trasloco. Spostando `userData`
  alla radice si sposta tutto insieme.
- **Prima di `whenReady`.** Dopo, Chromium ha già aperto il profilo dov'era e
  non lo sposta più.
- **`app.getPath("desktop")` e non un percorso scritto a mano.** Il Desktop può
  essere reindirizzato — OneDrive lo fa di suo — e l'unico che sa dov'è davvero
  è il sistema.

**Fuori dalla cartella dell'applicazione, non dentro.** Il primo tentativo fu
`data/`, accanto al codice: sbagliato, perché quella cartella è un repository
git. Là dentro il database sarebbe un file non tracciato in mezzo a file
tracciati — da ignorare a mano (e infatti serviva una regola `data/*` con
un'eccezione per il seed), e da perdere il giorno che il progetto si ricancella
o si riclona. **I dati sopravvivono al codice, quindi non stanno dentro al
codice.** Nel repo `data/` torna a contenere solo `seed.sqlite`, che è un dato
del progetto e non un database di lavoro.

`ALIA_DATA` scavalca tutto, per chi vuole i dati altrove senza toccare il codice.

### Entità t_setting — implementata (2026-09-11)

Il posto dove Alia ricorda una preferenza. Fino a qui non ne esisteva nessuno,
né tabella né file, e si vedeva in tre punti: gli interruttori delle Notifiche
disegnati e sempre spenti, i gruppi chiusi della vista Lista che si riaprivano a
ogni avvio, vista e ordinamento che ripartivano dal valore di fabbrica.

```sql
CREATE TABLE t_setting (
  chiave TEXT PRIMARY KEY,
  valore TEXT NOT NULL       -- JSON
);
```

**Chiave-valore e non colonne tipizzate.** Le preferenze nascono e muoiono con
le schermate, e una colonna per ciascuna vorrebbe una migrazione per ciascuna:
la tabella diventerebbe il registro di tutto quello che l'interfaccia ha
provato. Così una preferenza nuova non tocca lo schema.

**Il prezzo, dichiarato**: il database non può più garantire che un valore abbia
senso — può contenere una vista nel frattempo bloccata, un ordinamento tolto dal
menu, l'id di un progetto cancellato. La garanzia si sposta nel lettore, su due
gradini:

- `getSetting` garantisce che **torni qualcosa**: JSON rotto, chiave mai
  scritta o valore di una versione precedente valgono come assenti e danno il
  ripiego. Non è un errore — è il caso normale al primo avvio e dopo ogni
  cambio di interfaccia;
- `usePreferenza` (renderer) chiede a chi legge di dire **cosa accetta**, e
  quello che non passa il controllo torna al ripiego.

**Le chiavi si nominano a famiglie** — `vista.ordinamento`, `lista.gruppiChiusi`,
`notifiche.reminder` — così `listSettings(prefisso)` e `removeSettings(prefisso)`
possono lavorare su un gruppo intero quando una schermata cambia, senza doverne
elencare le chiavi.

**`null` cancella invece di salvare "null"**: "non ho una preferenza" e "la mia
preferenza è niente" sono la stessa cosa per chi legge, e tenerle distinte
sarebbe due modi di dire lo stesso — che prima o poi divergono.

**Cosa NON va qui.** La configurazione dell'installazione: dove sta la
confluenza, con che token. Vive in `confluenza.json` ed è una cosa diversa — una
preferenza descrive come vuoi lavorare, la configurazione descrive questa
macchina. Insieme, esportare le impostazioni si porterebbe dietro un segreto.

**Primo consumatore**: vista, ordinamento, direzione e raggruppamento della vista
Lista. I gruppi chiusi **no**, e non per dimenticanza: il commento in
`ContentPane.jsx` sostiene che chiudere un gruppo è un gesto di lettura, come
scorrere, non una preferenza da ricordare. Le due posizioni sono in contrasto e
la contraddizione resta aperta — vale la pena deciderla usando l'app, non a
tavolino. Le Notifiche restano ferme perché gli manca l'altra metà (chi le
manda, e quando: punto 10).

### Storico e commenti

Le tabelle `item_history` e `item_comments` attuali diventano `t_task_history` e `t_task_comment`, con chiave primaria `idTaskHistory`/`idTaskComment` e chiave esterna `idTask` (`ON DELETE CASCADE`, come oggi). Restano per costruzione una entità per task: un sotto-task ha il proprio storico e i propri commenti, indipendenti da quelli del padre — l'eventuale aggregazione ("mostra anche lo storico dei figli") resta una scelta di interfaccia, non di schema.

### Prevenzione dei cicli

Lo schema SQL da solo non impedisce che un task diventi antenato di se stesso attraverso `idParentTask` (es. A → figlio B → figlio A). Non esiste un vincolo dichiarativo pratico in SQLite per questo caso (richiederebbe una CTE ricorsiva in un trigger); va quindi controllato nel core, ad ogni operazione che assegna o cambia `idParentTask`, risalendo la catena degli antenati del nuovo padre prima di confermare la scrittura.

### Tag e allegati

Le tabelle relazionali già previste per le sorgenti esterne (`tags` + `item_tags`, `attachments`) diventano `t_tag`, `t_task_tag`, `t_attachment`, agganciate a `idTask` invece che a `item_id`, seguendo la stessa unificazione e la stessa convenzione di naming. Vale per entrambe: chiave esterna `idTask` con `ON DELETE CASCADE`, nessuna differenza di comportamento tra un task di primo livello e un sotto-task (un sotto-task può avere i propri tag/allegati).

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
3. ~~**Stati speciali del task (inbox/"non preparato")**~~ **deciso e implementato (2026-09-10)**: flag dedicato `isInbox` su `t_task` (schema 8), non una condizione derivata da progetto/date — un task in inbox deve poter essere messo in agenda restando da triare. Default, ereditarietà, gesto di uscita e migrazione: vedi la nota nella sezione Entità t_task.
3-bis. ~~**Origini appena arrivate**~~ **deciso e implementato (2026-09-10)**: flag `isNew` su `t_task` (schema 9), campo della notifica e non dello stato di lavoro, spento in blocco da `markOriginsSeen` all'ingresso nella Full Inbox. Vedi la nota nella sezione Entità t_task.
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

### La scrivania e il lavoro — deciso l'11/09/2026

**L'inbox è una scrivania dove si prepara il lavoro vero, che si fa nel pannello
contenuto.**

Una frase, e mette in fila cose che fino a oggi erano regole staccate.

#### Cosa ne discende

`isInbox` non è un'etichetta sul task: dice **da che parte dello schermo vive**.

- la **colonna a sinistra** mostra `isInbox = 1`: la scrivania, dove si prepara;
- il **pannello contenuto** — Lista, Kanban, e le viste che verranno — mostra
  `isInbox = 0`: il lavoro.

Le due non si sovrappongono mai, e **un task sta in uno solo dei due posti**. Una
task in triage non è ancora lavoro: è arrivata, o è stata scritta di fretta, e
aspetta di essere decisa. Mostrarla nel pannello direbbe che è già in corso.

#### Il difetto che questa frase ha scoperto

`radici` erano tutte le task di primo livello, quindi una task da smistare
compariva **in due posti insieme**. È lo stesso errore di categoria delle
origini, un piano più su: là un'origine era scritta come task, qui una task sulla
scrivania era mostrata come lavoro.

Si è visto per una conseguenza laterale: trascinando una card dal Kanban alla
colonna Inbox, la card arrivava a sinistra **e restava anche sul tabellone**.
Sembrava un bug del trascinamento, ed era il modello.

#### Le regole che erano già lì, e ora hanno un perché

Tre comportamenti esistevano già, ognuno con la sua spiegazione locale:

- il campo in fondo a un gruppo crea con `isInbox: false`;
- trascinare una card su un gruppo della Lista la toglie dal triage;
- trascinare una card su una colonna del Kanban fa lo stesso.

Non erano tre eccezioni: erano **la stessa cosa detta tre volte** — entrare nel
pannello contenuto *significa* aver smistato. Ora la regola sta scritta una
volta, e quelle tre ne sono conseguenze invece che casi particolari.

#### Conseguenza sui numeri

Il conteggio in testata (`N task`) dice adesso il **lavoro**, non tutto quello
che esiste. È giusto: è il numero della schermata che si sta guardando. La
scrivania ha il suo, sulla linea "Inbox", e le origini ancora da decidere hanno
il badge. Tre numeri, tre posti diversi, nessuno dei quali conta due volte la
stessa cosa.

### Vita di un'origine — deciso l'11/09/2026

La sezione che mancava, e la cui assenza si è vista: le origini erano state
implementate prima di essere definite, e ogni sintomo trovato poi — colonne
sovrapposte, trascinamento che cancellava, conferma che saltava l'inbox — veniva
dallo stesso errore di categoria, ripetuto tre volte.

#### Un'origine non è un task, e non è una notifica

È **qualcosa arrivato da fuori che aspetta una decisione.** Non è una cosa da
fare: lo diventa, semmai, quando qualcuno lo decide. Finché nessuno decide non è
niente — ed è per questo che non può vivere in `t_task`, dove esistere significa
già essere una cosa da fare.

Il primo disegno la scriveva come task con `isInbox = 1`, e da lì tutto il resto
seguiva: se è un task in triage allora è nell'inbox, quindi le due colonne
mostrano la stessa riga, quindi "confermare" non può che voler dire uscire dal
triage, quindi trascinare un'origine verso l'inbox la faceva sparire da entrambe.
Tre bug con una causa sola.

#### Le due decisioni, e non ce n'è una terza

    o entra nel sistema (diventa un task)   oppure   viene rifiutata

**Non esiste uno stallo intermedio.** Non esiste "vista ma non decisa", non
esiste "rimandata": sarebbe l'arretrato invisibile che tutto questo esiste per
impedire.

#### Un flag solo: `isProcessed`

Dice che la decisione è stata presa, **quale che sia stata**, e quindi che la
riga non va più mostrata.

"Accettata" e "rifiutata" non servono come stati distinti perché sono
**derivabili**: se esiste un task che cita quell'origine (`sourceId`) allora è
entrata; se non esiste, è stata buttata. Un secondo flag terrebbe in due posti
una cosa vera in uno, e le due copie prima o poi divergono.

**Niente `seenAt`, e niente campanella.** `isNew` e `markOriginsSeen` erano
nati per dire "arrivata da poco, non l'hai ancora guardata": un gradino fra
l'arrivo e la decisione, cioè esattamente lo stallo che non deve esistere.
Restano nello schema di `t_task` senza più nessuno che li legga (vedi Piccoli).

#### Il badge è un arretrato, non un avviso

Conta le origini **da processare**, non quelle nuove. Un avviso si guarda e si
spegne; un arretrato si smaltisce. Il numero scende solo decidendo, e questa è
la proprietà che lo rende utile: finché non è zero, c'è del lavoro da fare che
nessuno ha ancora fatto.

#### L'area origini è una finestra, non un magazzino

Alia **non conserva le origini**: le guarda dove stanno, nel servizio. Quindi:

- non c'è niente da scaricare, e "sincronizzare" vuol dire *riaffacciarsi*;
- rilanciare una sincronizzazione rilegge le stesse righe e **non produce
  nessun effetto** — il gesto è ripetibile senza pensarci;
- non c'è nessuna ricevuta di lettura da tenere allineata. Il cursore che il
  primo disegno aveva è sparito: "quali restano da decidere" è già una query
  su `isProcessed`.

Il prezzo, accettato consapevolmente: **a servizio spento la colonna e il badge
sono vuoti.** Non è uno zero che mente, è una finestra chiusa, e va detto come
tale in interfaccia — con la frase dell'errore e il modo di riprovare.

#### L'ordine dei due passi non è negoziabile

    prima nasce il task, poi l'origine è processata

Mai al contrario. Se si processasse per prima e la creazione fallisse, quella
cosa da fare non esisterebbe più da nessuna parte. Così invece il peggio che può
succedere è che un'origine resti nella finestra dopo essere già diventata un
task: la si rivede e la si rifiuta. **Visibile e rimediabile** batte *pulito e
silenzioso*, ogni volta che si tratta di roba da fare.

È lo stesso principio che governa l'offset di Telegram nel servizio, e per la
stessa ragione: un doppione raro si cancella in un gesto, una cosa persa non si
sa nemmeno di averla persa.

#### L'ordine è di arrivo, dalla più recente

La colonna mostra prima quello che è appena arrivato. L'obiezione classica al
più-recente-in-alto — *la lista si muove sotto le mani mentre ci lavori, e il
vecchio affonda dove nessuno guarda* — **qui non si applica**, e vale la pena
dire perché: quella vale per un elenco in cui si lavora a lungo e che ha un
ordine manuale da rispettare. Questa colonna non è nessuna delle due cose. È un
mucchio da svuotare, e le origini non hanno `position`: l'unico ordine possibile
è quello di arrivo, in un verso o nell'altro.

Resta quindi il caso d'uso vero, che è uno solo: hai mandato una nota dal
telefono e la vuoi vedere. Col più vecchio in alto avresti dovuto scorrere fino
in fondo ogni volta.

Con il limite, "le più recenti" vuol dire che a restare fuori è la più vecchia —
la meno urgente da guardare — e il conteggio continua a dire l'arretrato per
intero.

#### Il senso di marcia è unico

**Un task non può tornare a essere un'origine.** Un'origine è un fatto del
passato — un messaggio arrivato in un certo istante da una certa sorgente — e
niente di ciò che si fa dopo lo cambia. Rimettere un task "fra le origini"
vorrebbe dire fingere che quella decisione non sia stata presa, quando invece è
stata presa e ha lasciato una traccia.

Quello che si può fare, e che copre il bisogno vero ("l'ho smistata troppo in
fretta"), è **rimetterlo in triage**: `isInbox = 1`, che lo riporta in "Da
smistare". Quello sì che è un ripensamento legittimo, perché riguarda uno stato
del task e non la storia di come è nato.

Conseguenza di interfaccia: la colonna delle origini **non è un bersaglio di
rilascio**. Non lo è per i task (non tornano indietro) e non lo è per le origini
stesse (il loro ordine è quello di arrivo, e non è materia di preferenze).

#### Una sorgente, N task

Resta vero quanto deciso in § Sorgente di origine, e adesso è anche praticabile:
un messaggio con tre cose dentro può diventare tre task, tutti con lo stesso
`sourceId`. L'origine si processa una volta sola — la decisione è una, sono i
task a essere tre.

Il vincolo di unicità vive quindi **nel servizio** (`UNIQUE(sourceType,
sourceId)` su `origine`, dove una riga *è* un messaggio) e **non** su `t_task`,
dove impedirebbe proprio il caso che si vuole permettere.

### Durata e reminder, facoltativi

- **Durata**: un task può avere una durata opzionale, espressa come coppia `startAt`/`dueAt` (già presenti nello schema `t_task`). Non è obbligatoria: un task può restare puntuale (nessun intervallo) o non avere affatto una collocazione temporale.
- **Reminder**: un task può avere in aggiunta un promemoria, indipendente dalla durata (coerente con la distinzione già tra schedulazione e promemoria). È un singolo campo (`reminderAt`) su `t_task` stesso, come nello schema attuale: niente tabella dedicata, un solo reminder per task.

### Comportamento dell'alert (reminder)

L'ancoraggio temporale del reminder cambia a seconda che il task abbia o meno una durata (`startAt` valorizzato):

- **Task con durata**: il reminder avvisa **prima dell'inizio** — è ancorato a `startAt`, con un offset all'indietro (es. "1 ora prima", "1 giorno prima" dell'inizio). Non ha senso ancorarlo alla creazione del task in questo caso: l'utente vuole essere avvisato in vista dell'inizio pianificato, non in base a quando ha scritto il task.
- **Task senza durata** (`startAt` assente): il reminder si comporta come un promemoria "normale" — è ancorato al momento in cui viene impostato (di norma la creazione/stesura del task), con un offset in avanti (es. "tra 2 ore", coerente con la sintassi rapida del composer, `/2h`).

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
- **Cancellazione** (`deletedAt` valorizzato, soft-delete già presente nello schema attuale): è un evento eccezionale, non simmetrico. Un utente che cancella un task **non può ripristinarlo** dall'interfaccia: il ripristino di un task cancellato resta possibile solo come intervento tecnico/manuale (es. un tecnico che agisce direttamente sul database o con uno strumento di supporto), non come funzione esposta nel prodotto. Questo aggiorna quanto, dove "ripristinare un item cancellato" era elencato come normale operazione del core: qui resta a livello di dato (utile per recupero in caso di errore/supporto), ma non più come azione utente ordinaria.
- **Ai fini della cascata**: un figlio cancellato non conta né come "chiuso" né come "aperto" nel calcolo "tutti i figli chiusi" sul padre — va escluso dal conteggio, come se non esistesse più. Se il ripristino tecnico di un figlio cancellato lo riporta in vita su uno stato non finale, si applica la stessa regola di "nuovo figlio aggiunto a un padre chiuso" vista sopra (il padre si riapre se necessario).

### Migrazione verso una piattaforma esterna

Un task in stato `Nuovo` (o comunque non ancora concluso) può essere **trasferito** a una piattaforma esterna (es. Todoist, Zoho Projects, coerente con quanto già) invece di essere portato avanti internamente. Questo trasferimento è un'altra via per raggiungere uno stato finale:

- Il task passa a uno stato `isEndState = true` dedicato (es. `Migrato`), distinto da `Fatto`.
- **La migrazione è bloccata se il task ha ancora sotto-task non chiusi**: non si cascata automaticamente la migrazione sui figli (a differenza della chiusura normale vista sopra) — l'utente deve prima chiudere, migrare o cancellare i figli aperti, poi può migrare il padre. Scelta deliberata: la migrazione sposta il lavoro fuori dal sistema, e farlo "trascinando" involontariamente dei sotto-task ancora aperti rischierebbe di perdere lavoro non finito senza che l'utente se ne accorga.
- Con la revisione di `isCompleted` (vedi sopra: riflesso automatico via trigger di `isEndState`), anche un task migrato risulta `isCompleted = true` una volta su questo stato — `isCompleted` non distingue più "fatto" da "migrato", lo fa solo `idState`/`t_state`. Chi ha bisogno di distinguere le due cose (es. report, statistiche) deve guardare lo stato puntuale, non `isCompleted`.
- Il collegamento alla piattaforma esterna di destinazione (quale piattaforma, eventuale id/URL della nuova posizione) non è ancora modellato: da progettare insieme al resto delle integrazioni di uscita già previste per le sorgenti esterne.

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

1. ~~**Le origini da confermare non hanno un dato dietro.**~~ **Risolto (2026-09-10)**: il dato è `isInbox`, e la colonna legge quello — sorgente esterna (`sourceType <> 'manual'`) **e** ancora in triage. Prima si arrangiava con "sorgente esterna e ancora nello stato di partenza", e confermare significava portare il task sul primo stato intermedio: sui database che non ne hanno uno — come quello attuale, con soli `Da fare` e `Fatto` — il gesto restava spento con una spiegazione. Ora confermare significa uscire dal triage, che si può fare sempre: il pulsante non è più disabilitabile, e un'origine confermata resta fuori dalla colonna anche se il suo stato non è cambiato.
2. **Le priorità sono cinque nel core e quattro nel design.** `urgent` non aveva un colore; gli ho dato il rosso più saturo della rampa (`red-500` contro `red-400` di `high`), che li distingue senza rifare la scala. Da verificare sull'artboard.
3. **Il chip di stato si colora per ruolo, non per etichetta** — partenza neutra, intermedio con l'accento, chiusura spenta e a contorno. È l'unica cosa su cui la grafica può contare, dato che gli stati sono configurabili. Conseguenza: più stati intermedi condividono lo stesso azzurro. Se diventeranno molti servirà distinguerli, ma è una decisione da prendere sull'artboard, non inventando colori nel componente.

Il Gantt resta l'abbozzo che era — il suo disegno è rimandato — ma non mostra più dati inventati: le barre sono solo le task che hanno davvero `startAt` e `dueAt`. Il Calendario è uscito dall'abbozzo l'11/09/2026: vedi § Interfaccia, "Vista Calendario".

Due perdite di informazione accettate nella migrazione, da sapere: il vecchio `item_history` è un diario di eventi (`event_type` + `details`), non un registro di campi cambiati, quindi entra in `t_task_history` con l'evento in `field`, il dettaglio in `newValue` e `oldValue` nullo — non c'è modo di ricostruire il valore precedente. E `item_comments.author` si perde, perché `t_task_comment` non ha un autore (sistema mono-utente).

## Interfaccia

Questa sezione sostituisce `DESIGN_LOCK.md`. Contiene **quello che è vero adesso**:
gli artboard da cui l'interfaccia è ricostruita, le decisioni grafiche in vigore e
le misure che vanno rispettate. La cronaca delle versioni superate — e ce n'è
parecchia, il disegno è cambiato più volte in due giorni — sta nella storia di git.

### Gli artboard canonici

Progetto Claude Design: `https://claude.ai/design/p/8709c4b3-1615-4ff4-8c09-a3559521cdea`

| Artboard | Componente |
|---|---|
| `DEF_Card.dc.html` | `renderer/src/inbox/InboxCard.jsx` — la card del task |
| `DEF_Row.dc.html` | `renderer/src/inbox/TaskRow.jsx` — la riga della vista Lista |
| `DEF_Inbox min.dc.html` | vista divisa: colonna Inbox + area contenuto |
| `DEF_Inbox max.dc.html` | Full Inbox: origini da confermare + "Da smistare" |
| `DEF_Content.dc.html` | testata dell'area contenuto |
| `DEF_Task Detail.dc.html` | `renderer/src/components/TaskDetailModal.jsx` |
| `DEF_Impostazioni.dc.html` | `renderer/src/components/SettingsModal.jsx` |
| `DEF_Task Composer.dc.html` | `renderer/src/components/TaskComposer.jsx` |

**Regola di riproduzione**: l'artboard è la fonte di verità. Se un valore nel codice
non è ricavabile da lì è un valore inventato, e va dichiarato — in questa sezione,
sotto "scostamenti", non lasciato implicito.

**Attenzione all'elenco degli artboard.** Questo è una fotografia: il progetto vive
in Claude Design e ci si aggiungono cose. Prima di dire che un artboard non esiste,
**si guarda il progetto** — `DEF_Impostazioni` è stato dichiarato mancante per una
giornata intera perché nessuno ha controllato.

### Palette e tipografia

**Nocturne è fuori**, colori inclusi: nessun import del design system remoto. Tailwind
puro (tema in `renderer/src/styles/theme.css`), scala tipografica di Tailwind non
sovrascritta — aggiunti solo i gradini che non ha (`--text-micro` 10, `--text-mini`
11, `--text-meta` 13, `--text-card` 13.5).

**Tutta l'interfaccia è neutra, con un solo accento azzurro** (`blue-300`). La
struttura usa `neutral-*`, l'unica famiglia davvero acromatica di Tailwind. Tre
livelli di superficie che crescono di luminosità con l'elevazione:

```
bg        neutral-950   il fondo
surface   neutral-900   colonne e pannelli
elevated  neutral-800   le card
```

Unica eccezione al grigio: le **card delle origini**, in `slate-*` — azzurro scuro e
desaturato, sugli stessi gradini di luminosità dei neutri, così cambia la tinta e non
la gerarchia dei livelli.

Icone: Lucide dove il tracciato coincide con l'artboard, trascritte a mano dove no
(`renderer/src/components/icons.jsx`, con il perché caso per caso). Negli artboard
sono rese a 11/12/13/14px: passare sempre `size` esplicita, mai scalare via CSS.

### La schermata: due geometrie e un solo movimento

Una schermata sola, due stati di riposo, e fra loro un movimento continuo governato
da `renderer/src/inbox/useInboxMorph.js`:

- **vista divisa** (`p = 0`): colonna Inbox a sinistra, area contenuto a destra;
- **Full Inbox** (`p = 1`): "Origini da confermare" + "Da smistare", l'area contenuto
  è spenta.

La premessa dell'intero componente: la colonna di sinistra della vista divisa **è** la
colonna "Da smistare" della Full Inbox — stesse card, stesso elemento. Non c'è nessuno
scambio di componente, quindi non c'è nessun salto alla conferma.

Il gesto ha tre fasi sulla maniglia: fino al 50% la colonna si allarga; dal 50 al 70
si stacca e segue il puntatore stringendosi verso i 300px finali; oltre il 70 si
aggancia. Rilasciando a metà si riavvolge alla fine della fase A.

**Cosa si muove**: `left`, `width` e le imbottiture interne. Nient'altro. Fondo, bordo,
raggio, `top` e `height` sono costanti, e l'intestazione non si dissolve — vedi le due
decisioni qui sotto, che è da lì che viene la semplificazione.

### Contenitori invertiti

**La colonna è la card, il contenuto è appoggiato sul fondo** — il contrario di
`DEF_Inbox min`, ed è uno scostamento deliberato.

La ragione è di senso: nella Full Inbox la colonna "Da smistare" *è* una card di
superficie, quindi l'artboard chiedeva che il contenitore nascesse dal nulla a metà
trascinamento. Invertendo, la colonna è la stessa cosa dall'inizio alla fine. Le due
metà si distinguono per **elevazione** — la colonna sopra, il contenuto sul tavolo —
invece che per un bordo ciascuna.

### Il ritmo: 12, ovunque

Un solo respiro, su tutti i lati e fra le fasce:

```
12  bordo alto  →  scritta "Inbox" e ingranaggio
12  scritta     →  colonne
12  colonne     →  bordo basso, e bordi laterali
```

Le costanti stanno in `FRAME`, esportato da `useInboxMorph` **e usato anche dal
componente**: prima erano scritte due volte, in pixel là e in classi Tailwind qua, e
bastava cambiarne una per scollare la testata dalle colonne.

**La compensazione ottica sta in un posto solo** (`OTTICA = 5`). Quello che deve
distare 12 dal bordo è il *contorno visibile*, non il riquadro che lo contiene:
l'icona è 15 dentro un bottone di 24, e le maiuscole di 11px cominciano circa 4.5
sotto il bordo alto della riga di testo alta 17. Stesso scarto, stesso recupero — ed è
anche il motivo per cui i due tornano allineati fra loro.

**A destra i comandi cominciano dove comincia il contenitore a sinistra.** La colonna è
una card con un bordo visibile: taglia l'immagine in orizzontale, ed è la linea forte
della schermata, quindi la riga di comandi dell'area contenuto si allinea a quella e non
alla prima card dentro la colonna. Per un giro si allineava alla card, con un rientro di
13 in cima al pannello, e aveva senso finché in testa alla colonna c'era il bottone
"Aggiungi task" a cui agganciarsi: tolto il bottone, l'aggancio è morto con lui e il
rientro allineava solo se stesso.

Sulla stessa riga, il selettore di progetto è alto **32 come i comandi accanto**, non
quanto il suo testo. Il testo lì è 18px contro 12.5, quindi a riquadri liberi il suo
sarebbe 25.6 contro 32: centrati nella stessa riga condividerebbero il centro ma non il
bordo alto, e siccome il comando a destra ha un contorno visibile e questo no, si
vedrebbe una scala di tre gradini — contenitore, comando, testo.

La barra di scorrimento non è una costante: nell'app è in sovrimpressione e non occupa
niente, in un browser si prende una decina di pixel **dentro** l'elemento che scorre.
Si misura, e il margine destro dell'elenco diventa `12 − barra`.

### L'intestazione di quadro

Una riga sola, sempre accesa, valida per entrambe le geometrie: **"Inbox" + badge
delle origini nuove** a sinistra, **ingranaggio** delle impostazioni a destra. Sta
fuori da entrambi i contenitori perché non appartiene a nessuno dei due — un
ingranaggio dentro la card dell'Inbox leggerebbe come "impostazioni dell'inbox".

Siccome quella riga c'è sempre, le colonne cominciano sotto di lei anche a `p = 0`, e
`top`/`height` smettono di essere interpolati.

Il badge conta le origini con `isNew = 1` ed è pieno d'accento con il testo nel colore
del fondo — stesso disegno del contatore filtri. All'altro capo della riga, accanto
all'ingranaggio, andranno le notifiche.

### La card e la riga sono due componenti diversi

Una **card** è un oggetto autonomo (colonna Inbox, origini); una **riga** è un elemento
di un elenco (vista Lista). Durante il trascinamento il clone cambia larghezza passando
da una parte all'altra: è il segnale che il rilascio è valido, oltre a essere la forma
giusta.

### Trascinamento

- **Il varco**: dove il task andrà a finire si apre uno spazio vuoto, alto quanto una
  riga. Spazio e nient'altro — nessun bordo, nessun fondo.
- **Niente si illumina**: né le colonne né i gruppi. La destinazione la dicono già il
  varco e il clone che cambia forma; un contorno acceso era una terza voce che
  ripeteva, e sulla colonna diventata card era anche la più rumorosa.
- **Il varco è un `Symbol`, non un task**, e vive solo nel livello che disegna: nelle
  liste su cui si fanno i conti non entra mai. Metterlo lì dentro ha già rotto tutto
  una volta (`.state.id` su un Symbol).
- **Il FLIP indicizza per elemento (`WeakMap`), non per id**: lo stesso task può essere
  a schermo due volte — card a sinistra e riga a destra — e con un solo indice per id
  sopravviveva una sola posizione, così i due elementi partivano dallo stesso punto
  sbagliato. Era il difetto per cui le righe tremavano.

### Filtri: i tag si scrivono, non si scelgono

Gli altri gruppi di filtro elencano quello che c'è — le priorità del modello, gli stati
configurati — perché sono pochi e chiusi. I tag no: un elenco di tutti diventerebbe un
menu che cresce senza limite, e sarebbe inutile proprio quando i tag servono davvero,
cioè quando sono tanti. Quindi si scrive quello che si cerca e si preme Invio; il tag
compare acceso sopra il campo e si spegne cliccandolo, come qualsiasi altro filtro.

Tre conseguenze:

- **un tag filtrato non deve esistere.** Se ne può scrivere uno che nessuna task ha, e
  il risultato è un elenco vuoto — che è la risposta giusta alla domanda fatta, non un
  errore da impedire;
- **il confronto è minuscolo contro minuscolo**: chi filtra scrive "Urgente" o
  "urgente" senza pensarci. Il core intanto conserva l'etichetta com'è stata scritta la
  prima volta;
- più tag valgono **in OR**, come dentro ogni altro gruppo di filtro.

I tag viaggiano con la lista delle task, concatenati in una stringa (`listTasks`), non
chiesti uno per uno: `listTaskTags` è giusta per il dettaglio, che apre una task per
volta, ma qui sarebbero decine di andate e ritorni sull'IPC per disegnare un elenco. Il
separatore è `char(31)` e non una virgola — le etichette sono testo scritto da una
persona, e una persona la virgola la usa.

### Dove nasce una task

**Due modi di inserire, e la differenza non è quanto si scrive: è dove si finisce.**

| | Comando | Cosa succede |
|---|---|---|
| **rapido** | `Invio` | La task nasce e il campo resta lì, vuoto e a fuoco, per la prossima. Non si va da nessuna parte, ed è il punto: di cose da buttare dentro se ne butta una dopo l'altra |
| **completo** | il comando `⤢`, o `Ctrl+Maiusc+K` / `⇧⌘K` | Si apre il **composer** (`DEF_Task Composer`) con dentro quello che era già stato scritto. `Invio` aggiunge |

Le due scorciatoie sono parenti di proposito — stessa lettera, con Maiusc per la
versione grande — perché è la convenzione che usano quasi tutti (`⌘N` / `⇧⌘N`): chi ne
conosce una indovina l'altra. La rapida **esclude** Maiusc, e non è un dettaglio: senza
quel controllo `Ctrl+Maiusc+K` soddisferebbe tutte e due le condizioni, aprendo il
composer *e* mettendo il fuoco nel campo rapido dietro di lui — due comandi con un tasto
solo. E quello che era scritto nel campo rapido entra nel composer: se ci si accorge a
metà che serve di più, non si ricomincia.

**Niente scorciatoie con Maiusc.** C'era la tentazione di dare a `Maiusc+Invio` il modo
completo, ed è stata scartata: in un campo di testo quella combinazione vuol dire "vai a
capo" in mezzo mondo, e girarla a "apri un'altra finestra" sorprende invece di aiutare.
Il modo completo ha un comando che si vede.

**Il completo apre il composer, non la scheda del task.** Sono due cose diverse: il
composer è fatto per *creare* — titolo, nota e cinque chip, e finché non si preme invio
non esiste niente — mentre la scheda è l'editor di una task che c'è già. La differenza si
sente sull'annullamento: dal composer `Esc` non lascia dietro nulla.

Il titolo scritto nel campo rapido entra nel composer già dentro: è la prop `seedTitle`
dell'artboard, che quel passaggio lo prevede. Aprendolo da un gruppo, il progetto è già
scelto.

### Il composer

Card 640 in due blocchi. Sopra il titolo a 19px e la nota; sotto, oltre un filo, la
barra delle cinque chip — **scadenza, priorità, promemoria, progetto, tag** — ognuna col
suo menu, e a destra l'aeroplanino che aggiunge. Sotto ancora, la riga degli aiuti.

Tre scostamenti dall'artboard, tutti dichiarati:

1. **L'invio è `Invio`, non `Maiusc+Invio`.** L'artboard usa la seconda e la scrive
   anche nella riga degli aiuti. Scartata: in un campo di testo quella combinazione vuol
   dire "vai a capo" in mezzo mondo, e girarla ad "aggiungi" sorprende invece di
   aiutare. Nella nota, dove andare a capo serve davvero, `Invio` fa il suo mestiere
   normale — l'aggiunta si comanda dal titolo o dall'aeroplanino.
2. **Le voci dei menu vengono dai dati**, non dall'elenco fisso dell'artboard: le
   priorità sono le cinque del core, i progetti quelli che esistono, i tag quelli già
   usati — più un campo per scriverne uno nuovo, che è la stessa scelta fatta per il
   filtro.
3. **Nessun "flash" dopo l'aggiunta.** L'artboard resta aperto e mostra "Aggiunto ·
   Casa": ha senso nel modo `inline`, dove se ne aggiungono molte di fila. Qui il
   composer è il modo *completo*, quello in cui ci si ferma su una task sola: alla
   conferma si chiude. Di aggiunte a raffica se ne occupa il campo rapido.

`isInbox` lo eredita da dove si è aperto, **non dal progetto scelto lì dentro**:
scegliere un progetto non vuol dire aver smistato — è il punto della decisione su
`isInbox`, un task può avere un progetto e restare da smistare.

Tre porte, due stanze.

| Porta | Dove nasce |
|---|---|
| **Il campo in fondo alla colonna Inbox** | In inbox, da smistare |
| **`Ctrl+K` / `⌘K`** | Idem: non apre niente di suo, mette il cursore in quel campo |
| **Il campo in fondo a ogni gruppo** (vista Lista) | Dentro quel progetto, già smistata |

Il campo della colonna ha sostituito il bottone "Aggiungi" di `DEF_Inbox max`, ed è un
cambio di gesto e non di aspetto: quel bottone creava una task intitolata "Nuova task" e
ne apriva la riga in modifica — due passaggi e un titolo finto da cancellare. Sta **in
fondo**, non in cima, perché è il posto in cui la task comparirà.

I campi dei gruppi ci sono **sempre**, ma stanno indietro: tratteggio e testo al 24%,
che salgono al passaggio del mouse. Non è timidezza — con dieci gruppi aperti, dieci
campi a piena voce sarebbero dieci righe di rumore fra un elenco e l'altro. Il **doppio
clic nel vuoto del gruppo** apre lo stesso campo: è una scorciatoia per quello, non un
secondo gesto, ed è importante che il campo si veda comunque — un gesto che non lascia
traccia a schermo non lo trova chi non sa già che c'è. Un doppio clic *su una riga* non
apre niente: lì quel gesto appartiene alla riga.

Vale **solo raggruppando per progetto**, come il rilascio del trascinamento e per la
stessa ragione: è il solo raggruppamento in cui il gruppo identifica un valore
assegnabile senza ambiguità — dentro "In corso" o "Alta", cosa vorrebbe dire creare lì?
E la task nasce con `isInbox: false`, al contrario di quelle del campo in colonna: chi
la scrive la sta mettendo in un progetto preciso, e mandarla in triage vorrebbe dire
chiedergli di ridecidere una cosa appena decisa.

Sulla riga "Inbox" c'è stato per un giro un `+` che portava al campo della colonna.
**Tolto**: quella riga ha già la scritta con il suo badge e, all'altro capo,
l'ingranaggio — e il campo che il `+` andava ad aprire è visibile lo stesso, poco più
sotto. Era un comando per arrivare a un comando che si vedeva già.

**Il modificatore cambia con il sistema, e cambia anche come si scrive**
(`renderer/src/lib/piattaforma.js`): `⌘K` su macOS, `Ctrl+K` altrove. Non è un dettaglio
grafico — `⌘K` mostrato a chi ha una tastiera Windows è un'istruzione sbagliata. Su Mac
i modificatori si accostano senza segni, ovunque altro si legano con il più: attaccare
il nome del tasto alla lettera darebbe `CtrlK`, che non è come si scrive una scorciatoia
in nessun sistema. Il riconoscimento dell'evento guarda `metaKey` su Mac e `ctrlKey`
altrove, mai entrambi: su Windows `Meta` è il tasto Windows, e intercettarlo ruberebbe
scorciatoie al sistema. La scorciatoia non scatta mentre si sta già scrivendo altrove.

### Le finestre trattengono il fuoco

`lib/fuoco.js`, usato dal composer, dalle impostazioni e dal dettaglio del task.

Il difetto che chiude: con il Tab si usciva dalla finestra e si finiva **dietro il
velo**, su comandi che si vedono a malapena e che rispondono lo stesso — da lì, premendo
invio, si faceva una cosa in una schermata che si credeva coperta. Non è una gentilezza
per chi usa la tastiera: una finestra modale che lascia uscire il fuoco non è modale, è
solo disegnata come se lo fosse.

Il giro si chiude in tutti e due i versi, e l'elenco dei comandi si **rimisura a ogni
Tab**: dentro queste finestre i comandi vanno e vengono — un menu che si apre, una chip
che compare, l'aeroplanino che smette di essere spento — e un elenco fotografato
all'apertura manderebbe il fuoco su cose che nel frattempo non ci sono più. L'ascolto è
in cattura, così arriva prima dei gestori interni e non dipende da chi lascia o non
lascia propagare l'evento.

### Vista Lista: gruppi che si chiudono

La testata del gruppo è il comando che lo apre e lo chiude, **tutta intera** — freccia,
pallino, nome, conteggio e filo. È un `button`, quindi ci si arriva col tabulatore.

Tre cose che valgono più del disegno:

1. la chiave dello stato porta con sé **anche il raggruppamento** (`progetto:casa`, non
   `casa`): gli id vengono da domini diversi a seconda di come si raggruppa, e senza il
   prefisso il progetto "1" e lo stato "1" si chiuderebbero a vicenda;
2. chiuso, **il conteggio resta**: è l'unica cosa che dice cosa c'è dentro;
3. **trascinare dentro un gruppo chiuso lo apre**, e resta aperto: senza, il task
   finirebbe in una scatola chiusa e sparirebbe davanti a chi lo ha appena spostato.

Lo stato vive quanto la schermata — chiudere un gruppo è un gesto di lettura, come
scorrere, non una preferenza da ricordare (vedi ToDo).

### Impostazioni

Modale a tutta finestra sullo stampo del dettaglio task, card 820×600: navigazione a
sinistra (220px), contenuto a destra. Cinque sezioni: Notifiche, Fonti collegate,
**Progetti**, Stati, Scorciatoie — le ultime due sono le sole che scrivono.

**Progetti e Stati funzionano; le altre tre lo dichiarano.** Non è un rinvio silenzioso: Fonti
lo diceva già l'artboard, Notifiche non ha un posto dove salvare le preferenze,
Scorciatoie elenca tasti che nessuno ascolta. Un interruttore che si accende e torna
indietro alla riapertura mentirebbe due volte.

**Progetti** tiene insieme le due entita' che si annidano: il progetto con il suo
colore, e dentro, rientrate, le sue fasi. Il pallino del colore **e'** il comando che
lo cambia — un pallino da guardare piu' un selettore accanto sarebbero due cose dove
ne basta una. La tavolozza e' chiusa, otto colori del tema salvati come token
(`var(--color-sky-400)`) e non come esadecimali, cosi' i progetti seguono la palette
invece di congelare un colore di oggi; un selettore libero produrrebbe presto due
progetti che si distinguono per un grado di saturazione, cioe' per niente.

Nomi e fasi si scrivono **uscendo dal campo o premendo Invio**, non a ogni tasto — ogni
battuta sarebbe una scrittura. Il campo che aggiunge e' sempre in fondo all'elenco,
vuoto, e si svuota da se': le fasi si scrivono a raffica quando si imposta un progetto,
e un bottone che fa comparire un campo sarebbe un passaggio in piu' ogni volta.

Il nuovo progetto prende un colore a giro dalla tavolozza invece di chiederlo: nome
*e* colore prima di aver creato qualcosa sarebbe un modulo per un gesto che deve
costare una riga scritta. Il colore si cambia dopo, con un click.

In fondo alla navigazione, centrata, **la versione** — letta da `package.json` e murata
nel bundle da Vite, perché il renderer non può raggiungerlo.

**Scostamenti dall'artboard**, tutti per regole che l'artboard non poteva conoscere:

| Scostamento | Perché |
|---|---|
| Via la tendina dei tipi, dentro un interruttore "Chiude" | Con i capi della fila fissi, l'unica cosa che resta da decidere è se un passaggio conta già come concluso: una domanda sì/no |
| Ai due capi mancano maniglia e cestino — non spenti, assenti | Un comando disabilitato dice "qui potresti, ma non ora". Qui non si potrà mai |
| Il trascinamento non accetta i capi come bersaglio | Il varco non deve aprirsi dove il rilascio verrebbe rifiutato: il gesto non promette ciò che non può mantenere |
| "Aggiungi stato" sta **sopra** l'ultima riga | È il posto letterale in cui comparirà: `createState` infila prima della chiusura finale |
| Il nome di default si numera (`Nuovo stato 2`) | `t_state.label` è UNIQUE |
| Si apre su Stati, non su Notifiche | È l'unica sezione che fa qualcosa |
| Stati sta sopra Scorciatoie | Le prime tre voci configurano; le Scorciatoie sono un promemoria, e i promemoria stanno in fondo |
| Colori mappati sul tema | L'artboard porta un `:root` locale con l'accento Nocturne |

Il riordino degli stati calcola l'indice **dalla posizione del puntatore**, contro una
griglia fotografata all'inizio del gesto — non da quale riga ha ricevuto l'evento.
Reagire a `dragenter` è un anello chiuso: l'ordine cambia, la riga si sposta dove sei,
parte un altro evento, e si torna indietro a puntatore fermo, un giro per fotogramma.

### Viste bloccate

Resta spento il solo **Gantt**. Una voce spenta dice che la vista esiste e non è
pronta, meglio di un elenco corto che lascia chiedersi se sia mai stata prevista. Il
codice c'è in `ContentPane`; sbloccarla vuol dire togliere una stringa da
`VIEW_BLOCKED` e sistemare quello che salta fuori. Kanban e Calendario sono usciti
di lì l'11/09/2026.

### Vista Calendario — 11/09/2026

Le task su una griglia di date, in `inbox/VistaCalendario.jsx`. Tre estensioni della
stessa griglia — **mese, settimana, giorno** — scelte in un selettore che sta nella
riga 1 accanto a quello delle viste, perché è una proprietà *del* calendario e non
una quarta vista: il selettore delle viste dice in che forma si guarda, questo quanto
tempo ci sta dentro. Si ricorda (`vista.calendario`), come il raggruppamento del
Kanban e per la stessa ragione.

La **riga 2 non c'è**. Ordinamento, filtri e raggruppamento sono scelte che il
calendario non può accogliere: il posto di una task lì è il giorno in cui scade, e
non c'è un secondo modo di disporle. Una riga di comandi spenti direbbe il contrario.
Resta il selettore di progetto, che è l'ambito e vale per tutte le viste.

Conseguenze accettate, entrambe dette a schermo invece che nascoste:

- le task **senza scadenza non compaiono**, e la testata del periodo le conta
  («1 senza scadenza, fuori dal calendario»): sparire in silenzio farebbe sembrare
  che manchino delle task, e invece manca una data;
- **niente griglia delle ore** nel mese e nella settimana. È una scelta di scala: in
  una colonna larga un settimo, ventiquattro fasce fanno righe da venti pixel, cioè
  una precisione che lì non si può né leggere né usare.

Dentro una cella non ci sta una card: nel mese e nella settimana le task sono
**pillole** (pallino del progetto e titolo), che restano card viste da lontano —
stesso bordo, stesso fondo sollevato.

Il periodo mostrato è stato locale e non preferenza: riaprendo l'app si riparte da
oggi. I trascinamenti non ci sono ancora — questa è la geometria, il gesto viene
dopo — ma ogni cella porta già `data-giorno`, che è quello che servirà per farne un
bersaglio.

### Le ore, e le ore di disponibilità — 11/09/2026

Il **Giorno** ha la griglia delle ore, e solo lui: lì lo spazio c'è, e l'ora è un dato
come un altro — il core la tiene da sempre dentro `dueAt`. Ogni task è un blocco alto
un'ora: non è una stima, è una convenzione dichiarata, perché una durata nel modello
non esiste (`dueAt` è un istante). Il giorno in cui esisterà, quella costante diventa
un campo. Le task alla stessa ora si dividono la larghezza **per grappolo**, non per
giornata: tre alle 9 e una alle 15 fanno tre colonne alle 9 e una sola alle 15.

Una task a mezzanotte tonda è una task **senza ora** — chi scrive una scadenza
dall'app le dà le 9, quindi mezzanotte è quasi sempre un import — e va nella fascia
"tutto il giorno" sopra la griglia, invece di essere appoggiata in cima alla notte.

Sopra le ore ci sono le **ore di disponibilità** (`lib/disponibilita.js`,
Impostazioni → Calendario): le fasce in cui si lavora davvero, accese, e tutto il
resto spento. Accese di **grigio** e non d'accento (11/09/2026): una banda colorata
gareggiava con le task colorate, e la gara la vinceva lo sfondo — la cosa più accesa
della giornata finiva per essere l'orario di lavoro invece di quello che c'è dentro.
Un grigio appena più chiaro del fondo si legge come un rilievo e non come un segnale,
e tutto il colore resta alle task. Non sono un orario di apertura da esporre: sono la fascia in cui ha
senso *mettere* una task, e serviranno al rilascio per sapere se una task è stata
lasciata in un'ora che esiste.

La forma è un oggetto con una chiave per giorno di `Date.getDay()` e sotto un elenco
di intervalli `{ da, a }` in "HH:MM". Tre decisioni che vale la pena ricordare:

- **un giorno spento è un elenco vuoto**, non un flag accanto alle ore. Due dati
  possono contraddirsi — un giorno "attivo" con zero intervalli — e allora
  bisognerebbe decidere ogni volta chi vince;
- **gli intervalli che si toccano si fondono**. 9:00–13:00 più 12:00–14:00 non è un
  errore da contestare, è un modo goffo di dire 9:00–14:00: contarli separati
  direbbe due volte l'ora fra le 12 e le 13 in ogni totale;
- **il modo della settimana si riconosce, non si salva.** La tendina Lunedì–venerdì /
  Lunedì–sabato / Personalizzata è la stessa idea delle preselezioni delle card
  (`densitaDeiCampi`): con una preselezione l'orario si scrive **una volta sola** e
  vale per tutti i giorni accesi, e "Personalizzata" è il nome che la settimana
  prende quando non combacia più con nessuna delle due. L'unica eccezione è
  *chiedere* Personalizzata su una settimana che combacia: quella richiesta vive
  nella finestra (apre i sette giorni) e non nel dato, perché le ore restano l'unica
  verità.

Le ore sono scritte "HH:MM" e non in minuti dopo mezzanotte: è la forma che
`<input type="time">` legge senza conversioni ed è leggibile dentro `t_setting`. Il
giorno finisce alle 23:59, perché quel campo non sa dire 24:00.

Il conto (fusione, totali, riconoscimento del modo) è coperto da
`test/disponibilita.test.js`, per la stessa ragione dei test del promemoria: sono
conti che sbagliano in silenzio.

### Il trascinamento sulla linea temporale — 11/09/2026

Nel Giorno la posizione **è** la scadenza: spostare una task lì dentro non è un
riordino, è una riscrittura di `startAt`/`dueAt`. Da qui tutto il resto.

**`CardCalendarTask`** è la terza forma, accanto alla riga della Lista e alla card
dell'Inbox, e non un adattamento di una delle due: qui **l'altezza è un dato**. Una
card alta quanto il suo contenuto direbbe un'ora che non ha. Rettangolare, angoli
appena smussati (3px: un angolo tondo si mangia metà di un blocco da un quarto d'ora,
e due blocchi consecutivi sembrerebbero avere del tempo libero in mezzo), e sopra ci
si legge **il titolo e l'ora, nient'altro** — a quell'altezza non ci sono righe da
spendere, e la domanda sulla linea non è "che cos'è questa task" ma "cosa c'è alle
dieci". L'unica cosa non scritta è il filo del progetto sul bordo sinistro.

**Il blocco è lavato della tinta del progetto** (corretto l'11/09/2026). Era neutro
come la card, e sulla linea non funzionava: un difetto di contesto, non di colore —
la card dell'Inbox sta in una colonna scura e si stacca da sé, il blocco sta sopra le
bande della disponibilità, che sono già schiarite, e grigio chiaro su grigio chiaro
obbliga a cercare il bordo per sapere dove finisce l'uno e comincia l'altro. La
risposta viene dal filo: se tre pixel di colore bastano a dire di chi è la task, il
fondo può dire la stessa cosa con più superficie — tinta al 16% mischiata al grigio
della card, bordo al 45%, più un'ombra corta perché sulla linea il blocco *sta sopra*
la giornata. Non è una deroga all'accento unico: i colori dei progetti sono già
nell'interfaccia, e una task senza progetto resta neutra. Il testo, nella stessa
correzione, sale di un gradino (titolo 12.5px, ora 11): sulla linea si guarda la
giornata intera, non una card alla volta.

**Tre gesti su un blocco solo**, distinti da dove si preme: il centro lo sposta lungo
la linea, i due bordi (cursore `ns-resize`, maniglie in hover) ne cambiano un capo.
Passo di un quarto d'ora, durata minima un quarto d'ora. Non passano dal motore delle
card (`dragKit`): lì il trascinamento sposta un elemento **dentro un elenco** e la
domanda è "prima di quale altro"; qui lo sposta **su un asse continuo** e la domanda
è "a che minuto". Sono due geometrie diverse. Il blocco si muove da solo, senza clone:
è già un rettangolo in posizione assoluta, quindi cambiargli le ore lo sposta davvero.

**Ridimensionare cambia natura, spostare no.** Una task con il solo `dueAt` è un
istante (disegnato alto un'ora per convenzione dichiarata); tirarne un bordo è il
gesto con cui diventa un intervallo `startAt`→`dueAt`, e non c'è bisogno di chiederlo
— tirare un bordo *è* dire "dura da qui a qui". Un termine spostato resta un termine.

**Dentro e fuori, con il cambio di forma.** Una card lasciata sulla linea esce dal
triage, prende il giorno e l'ora del punto in cui è stata lasciata, e apre una tendina
che chiede l'unica cosa che il gesto non ha detto: se è una scadenza netta o un
intervallo. La tendina non è un modulo da confermare — la data è già scritta, e
chiuderla lascia la task dov'è — serve a precisare. Nel verso opposto, un blocco
portato sulla colonna del triage **perde la scadenza** e torna in inbox: è l'unico
rilascio nel triage che cancella una data, e vale solo qui perché qui la data era la
posizione (altrove il flag significa "da rivedere", non "da azzerare").

Il cambio di forma è la metà visibile della regola: entrando nel calendario il clone
del motore si nasconde e al suo posto la vista disegna un blocco fantasma all'ora
sotto il puntatore; uscendo verso l'Inbox il blocco resta fermo e sbiadito e al
puntatore compare la card vera. Le due direzioni dicono la stessa cosa — di là le
task non hanno un'ora, quindi non hanno la forma che l'ora dà.

Il motore ha guadagnato una **terza famiglia di bersagli** accanto alle colonne e ai
gruppi: la pista (`data-drop-ora`), che al posto di `beforeId` restituisce `minuti`.
Il motore non sa cosa sia un calendario: legge i due estremi che la pista dichiara
(`data-fascia-da`/`-a`) e fa una proporzione — geometria, non semantica, come i centri
delle righe. Chi scrive resta la vista, via ref (`refRilascioCalendario`), con lo
stesso giro del Kanban e per lo stesso motivo: il motore vede tutte le colonne, ma
cosa voglia dire "lasciare qui" lo sa solo chi mostra il giorno.

### Sintassi rapida nel composer — ripresa l'11/09/2026

Mentre si scrive il titolo, alcuni simboli accendono i chip corrispondenti.

**Era già stata scritta, ed era documentata** in `SPECIFICA_PRODOTTO.md` con
tanto di tabella e di implementazione (`renderer/src/lib/composerSyntax.js`,
58 righe, usata da `TaskComposer`). È sparita nel commit che ha sostituito il
core — `t_task` al posto di `items` — **buttata via insieme al vecchio modello,
non per decisione**. Questa è la ripresa.

| Simbolo | Esempio | Effetto |
|---|---|---|
| `!1`–`!4` | `Chiamare il commercialista !2` | Priorità: `!1` urgente, `!2` alta, `!3` media, `!4` bassa |
| `#parola` | `Comprare il latte #casa` | Tag, ripetibile |
| `@progetto` | `Follow-up @lavoro` | Progetto, **solo fra quelli che esistono** |
| `@progetto/fase` | `Preventivo @lavoro/gennaio` | Progetto e milestone |
| `/2h` | `Richiamare /2h` | Promemoria **relativo ad adesso** (`m`, `h`, `g`) |

#### Le tre regole che contano più della tabella

**I simboli restano visibili mentre scrivi**, e vengono tolti dal titolo *solo
al salvataggio*. Mai prima, e mai se la task non viene inviata: togliere
caratteri sotto le dita mentre si scrive è il modo più veloce di far perdere il
filo.

**Cancellare il simbolo annulla l'impostazione, ma solo se veniva dal testo.**
Se l'avevi scelta a mano dal chip, continuare a scrivere non te la porta via. In
una frase: l'ultima azione vince, e il testo non disfa una scelta fatta col
mouse. È la regola più sottile della specifica, e senza tenere traccia
dell'**origine** di ogni campo non si può rispettare.

**La scadenza non ha un simbolo, e non deve averlo.** È una scelta esplicita e
resta solo dal chip: una data non si desume dal testo. Deciso allora, vale
ancora. Scartati anche `~` (vuole AltGr sulla tastiera italiana) e `\`,
sostituito da `/`.

#### L'ambiguità di `/`

Dopo un `@parola` è il separatore della milestone; isolato è il promemoria. Il
progetto si consuma **per primo**, così lo slash già mangiato da `@…` non viene
riletto come `/2h`. Conseguenza voluta: `@lavoro/2h` è un progetto con una fase
che si chiama "2h", non un promemoria — ed è giusto, perché una fase può
chiamarsi come vuole.

#### Cos'è cambiato col modello nuovo

`@progetto` scriveva una stringa libera in `items.project`. Ora i progetti sono
una tabella con id e colore, e **si accettano solo quelli che esistono**:
inventarne uno con un errore di battitura riempirebbe l'elenco di progetti senza
colore. Un nome che non corrisponde a niente **si dice** — non si crea e non si
ignora in silenzio. L'elenco dei suggerimenti qui non è una comodità: è il modo
di sapere cosa si può scrivere.

`@progetto/lista` aveva una "lista" che era un pezzo di stringa. Ora ci sono le
**milestone**, e la barra le indica. Non è un ripiego: è quello che quella barra
voleva dire fin dall'inizio.

`#tag` invece **crea**, e i suggerimenti sono una comodità vera. Non è
un'incoerenza con i progetti: *i tag si scrivono, non si scelgono* è già scritto
qui sopra, e la differenza è che un progetto è una struttura che si governa
mentre un tag è una parola che si appiccica.

#### Dove si applica

**Solo nel composer espanso**, per ora. Le altre due porte — la riga fantasma in
fondo alla colonna e il campo in fondo a ogni gruppo — restano senza sintassi:
quella veloce è dove servirebbe di più, ed è il prossimo passo naturale.

#### Nota sui test

La versione di allora **non aveva test**, con una specifica di questo dettaglio.
È il motivo per cui regole come l'ambiguità di `/` possono rompersi senza che
nessuno se ne accorga. Adesso ce ne sono venti, e coprono i casi che stanno
scritti qui sopra — compreso `@lavoro/2h`, che è quello che nessuno penserebbe
di provare.

## Come si lavora

```powershell
npm install
npm run dev      # Vite + Electron con hot reload
npm start        # builda il renderer e avvia Electron dal bundle
node --test      # i test del core
```

I dati stanno in `%APPDATA%\alia\scheduler.sqlite`, uno per utente.

`preview.html` (`npm run dev:renderer`) mostra le stesse schermate su un dataset
dichiaratamente finto: serve al confronto con gli artboard e gira nel browser, dove il
core non è raggiungibile. Lì le mutazioni non scrivono niente — comodo per il disegno,
inutile per provare la logica, e va ricordato prima di dichiarare funzionante qualcosa
provato solo lì.

### Il ponte verso il core

Il renderer non vede mai l'oggetto `core`: il processo principale espone le operazioni
di `ALIA_OPERATIONS` via IPC e il preload le monta su `window.alia`.

Gli elenchi delle operazioni sono **due**, e sono duplicati per forza: il preload gira
in CommonJS in un contesto isolato e non può importare il modulo ESM del core. Il terzo
elenco, scritto a mano in `aliaClient.js`, **non esiste più**: si era disallineato due
volte nello stesso giorno, quindi ora è un Proxy sul ponte. Qualunque operazione il
preload esponga è chiamabile senza doverla dichiarare di nuovo.

Tre operazioni possono **non applicare** e restituire un esito da negoziare, perché la
macchina a stati ha punti in cui serve una scelta umana e un trigger SQL non può
fermarsi ad aspettarla:

```js
{ esito: "applicato", cambi: [...], avvisi: [...] }
{ esito: "conferma",  richiesta: { tipo, ... } }   // richiama con `decisioni`
{ esito: "bloccato",  motivo, tasks }
```

Finché torna `"conferma"` non è stato scritto niente: la transazione è annullata, e la
stessa chiamata va rigiocata con la decisione dentro.

### Dati di esempio

Il seed è un **database già fatto**, `data/seed.sqlite`, non uno script: si applica
copiandolo sopra quello dell'app, con l'app chiusa.

```powershell
Copy-Item data\seed.sqlite "$env:APPDATA\alia\scheduler.sqlite" -Force
Remove-Item "$env:APPDATA\alia\scheduler.sqlite-wal","$env:APPDATA\alia\scheduler.sqlite-shm" -ErrorAction SilentlyContinue
```

I due file `-wal`/`-shm` vanno rimossi con la copia: sono il giornale di scrittura del
database precedente, e lasciarli accanto a un file principale diverso significa mettere
insieme due database che non si conoscono. **Sostituisce, non aggiunge.**

`npm run seed` è un'altra cosa: **aggiunge** task di esempio a un database qualsiasi
senza azzerarlo.

### Pubblicare

Ogni GitHub Release fa scattare `.github/workflows/release.yml`, che builda il
renderer, impacchetta con `npm pack` e allega il tarball alla Release. Per installare:

```powershell
npm install -g https://github.com/Helmutsti/Alia/releases/download/vX.Y.Z/alia-X.Y.Z.tgz
alia
```

Per pubblicare: si crea un tag `vX.Y.Z` e si pubblica una Release su quel tag — la
versione la prende dal tag, nessun bump manuale di `package.json`.

## ToDo

Le domande aperte, in ordine di quanto bloccano. Ognuna ha il contesto per riprenderla
fra un mese senza rileggersi niente; dove ho una preferenza è scritta come tale.

### ~~1. I progetti non si possono creare~~ · ~~2. CRUD progetti UI~~ — fatto il 2026-09-10

Nel core: `createProject`, `updateProject`, `deleteProject`, `createMilestone`,
`updateMilestone`, `deleteMilestone`. In interfaccia: la sezione **Progetti** delle
Impostazioni.

Le due entita' non hanno lo stesso peso, e le operazioni lo rispecchiano: un progetto
e' una casa, quindi cancellarlo si ferma e chiede dove mandare le task che ci vivono
(un altro progetto, oppure **nessuno**, che e' una risposta legittima e non un
annullamento); una fase e' una suddivisione dentro quella casa, quindi cancellarla non
chiede niente — le task restano nel progetto e perdono solo la fase, e lo si dice.

Il vincolo che si sarebbe rotto in silenzio: `t_milestone` sparisce per cascata con il
progetto, ma `t_task.idMilestone` **non ha cascata**. Lo spostamento delle task azzera
progetto e fase insieme, e c'e' una rete che prende anche i sotto-task cancellati in
precedenza, che `applicaProgetto` non segue perche' guarda solo i discendenti vivi.

Trovato per strada: **il provider non caricava le milestone**. Il dettaglio del task
le chiedeva (`const { milestones = [] } = alia`) e riceveva sempre l'elenco vuoto,
quindi la tendina delle fasi era vuota per costruzione, non perche' non ce ne fossero.

Resta fuori: **il riordino dei progetti e delle fasi**. `position` c'e' su entrambe le
tabelle e nessuno la cambia; le fasi nascono in coda. Da fare quando serve, con lo
stesso trascinamento degli stati.

### 3. La tabella delle preferenze — fatta l'11/09/2026, resta chi la usa

`t_setting` esiste (schema 11): vedi § Database, "Entità t_setting". Chiave-valore
con il valore in JSON, `getSetting`/`setSetting`/`listSettings`/`removeSettings`
nel core e `usePreferenza` nel renderer.

Delle tre cose che la chiedevano ne è servita **una**:

- ✅ **vista / ordinamento / raggruppamento** della vista Lista: si ricordano;
- ⏸️ **i gruppi chiusi**: non collegati, e non per dimenticanza. Il commento in
  `ContentPane.jsx` dice che chiudere un gruppo è un gesto di lettura, non una
  preferenza — il contrario di quanto sosteneva questo punto. Da decidere
  usando l'app: se dopo qualche giorno di lavoro vero riaprire tutto ogni
  mattina dà fastidio, ha ragione il todo; se non ci si fa caso, ha ragione il
  commento;
- ⛔ **le Notifiche**: la tabella non basta, manca l'altra metà — chi le manda e
  quando (punto 10).

### ~~4. Gli errori del core sono invisibili fuori dalle Impostazioni~~ — fatto l'11/09/2026

**Sì, un errore ci sta insieme agli avvisi** — era la domanda aperta, e la risposta è
che la differenza fra i due non è di posto ma di colore. Gli avvisi dicono "è successo
qualcosa che devi sapere", gli errori dicono "non è successo niente": due frasi diverse,
ma la stessa richiesta a chi guarda — *fermati un attimo e leggi*. Tenerle in due posti
voleva dire, ed è quello che succedeva, che una delle due non aveva **nessun** posto.

**Il canale si è anche spostato: da in basso a destra a in alto a destra.** In basso a
destra ci finisce la mano che lavora — è dove sta il campo di aggiunta in fondo alla
colonna, ed è la zona che il puntatore attraversa di continuo; in alto è dove l'occhio
arriva da solo quando qualcosa cambia.

In pratica: `Avvisi` in `lib/AliaDialogs.jsx` è diventato `Messaggi`, che prende dal
provider sia `avvisi` sia `errore`. La scatola è una sola (`Messaggio`), con un
interruttore `grave` che cambia bordo e colore del testo; l'errore sta sempre in cima,
perché è l'unico dei due che dice che il lavoro non è stato fatto. Nuovo in
`AliaProvider`: `scartaErrore`, la ✕ che prima non esisteva — `errore` si svuotava solo
con una ricarica.

**Due cose sono venute fuori solo lanciando l'app, e sono nel codice per quello.**

- **L'angolo in alto a destra è già di due comandi**: la rotella delle Impostazioni
  (finisce a 31px) e il selettore di vista (37-69px). A `top-5` il riquadro li copriva
  entrambi, e finché non lo si scarta restano incliccabili — proprio mentre chi ha
  appena sbagliato qualcosa potrebbe voler aprire le Impostazioni. Il riquadro parte
  quindi da **80px**, misurati sull'app in funzione: sotto i due comandi, sopra solo la
  cima delle colonne, che è contenuto.
- **Il messaggio arrivava incartato dall'IPC**: "Error invoking remote method
  'alia:updateState': Error: Esiste gia uno stato con questa etichetta: In corso" — nome
  del canale e un secondo "Error:" davanti alla frase vera. Finché si leggeva solo nelle
  Impostazioni era una bruttezza in un angolo; ora è la prima cosa che si legge dopo un
  gesto andato storto. `ripulisci` in `lib/aliaClient.js` toglie il prefisso, e lascia
  intatto qualunque messaggio non abbia quella forma.

**Conseguenza voluta: le due copie inline nelle Impostazioni sono sparite.** `Progetti`
e `Stati` stampavano l'errore accanto alla sezione che l'aveva provocato — la
motivazione era "si legge accanto alla cosa che l'ha causato", e con un canale globale
sarebbero diventate un doppione a schermo, visto che il pannello dei messaggi sta sopra
il velo delle Impostazioni (z-96 contro z-92). Per la stessa ragione **chiudere le
Impostazioni non cancella più l'errore**: prima lo faceva, con una ricarica, perché
l'errore viveva solo lì dentro e sopravvivergli voleva dire diventare illeggibile. Ora
resta finché non lo si scarta, che è il punto di tutto il giro.

### 5. CRUD rapido sulla riga, e il gesto che lo apre — fuso con il 16 l'11/09/2026

Due voci che erano la stessa: il **problema** (cambiare le cose senza aprire il
modale) e il **gesto** (lo scorrimento laterale). Tenerle separate faceva sembrare
lo scorrimento un vezzo grafico, quando invece è la risposta candidata — e
faceva sembrare il CRUD rapido una domanda aperta, quando la domanda vera era
soltanto con che gesto.

#### Il problema

Cambiare titolo, scadenza, priorità, stato e progetto **restando nell'elenco**.
Oggi per quasi tutto bisogna aprire il dettaglio, che è un viaggio per un gesto
da due secondi.

#### Il gesto: scorrimento laterale, come Promemoria e Mail

Si scorre la card di lato e da sotto escono le azioni, invece di andarle a
cercare. **Ha la meglio sul menu contestuale col tasto destro**, che era l'altra
strada considerata: fanno la stessa cosa, ma lo scorrimento si può *scoprire*
muovendo la card — il tasto destro no, e su un'app che non ha mai avuto un menu
contestuale nessuno prova.

**Perché risolverebbe un problema che esiste già.** La `OriginCard` ha tre
bottoni da 5×5px schiacciati in fondo alla riga della sorgente: è il massimo che
quella card regge, e qualunque quarta azione non ci sta. Sotto lo scorrimento
ci starebbero comode, e la card tornerebbe pulita.

**L'ostacolo vero, e va guardato prima di disegnare:** il trascinamento
orizzontale **è già preso**. `dragKit.js` fa partire lo spostamento fra colonne
al `pointerdown` seguito da 4px di movimento, in qualunque direzione. Un dito (o
un mouse) che tira la card di lato oggi vuol dire "portala in un'altra colonna",
e non si possono volere due cose dallo stesso gesto senza una regola che le
distingua. Le strade sono tre:

- **la ruota, non il puntatore.** Due dita sul trackpad producono un evento
  `wheel` con `deltaX`, che è un canale **completamente diverso** dal
  trascinamento e oggi non lo usa nessuno. Sarebbe lo scorrimento di Promemoria
  senza toccare il motore del drag. Limite: con un mouse a rotellina semplice il
  `deltaX` non esiste, quindi resterebbe un gesto per chi ha il trackpad —
  accettabile solo se le stesse azioni restano raggiungibili altrove;
- **l'angolo del movimento.** Al superamento della soglia si guarda se il
  movimento è più orizzontale che verticale e si decide lì fra scorrimento e
  trascinamento. È quello che fanno le liste native, ma qui il trascinamento fra
  colonne **è** orizzontale: le due direzioni coincidono, e la regola non
  separa niente;
- **solo dove il trascinamento non c'è.** Nella vista Lista le righe non sempre
  si trascinano; là il gesto sarebbe libero. Ma avere lo scorrimento in una
  vista sì e in una no è peggio che non averlo.

La prima è l'unica che regge davvero, e va verificata su Windows prima di
disegnarci sopra.

**Da decidere, oltre a quello:** quante azioni per lato (Mail ne mette due a
destra e una a sinistra); se lo scorrimento pieno esegue l'azione principale
senza rilasciare, come l'archiviazione di Mail — per un'origine sarebbe
"conferma", che è il gesto più frequente; se la card aperta si richiude da sola
quando se ne apre un'altra (deve); e le soglie, che vanno prese da un artboard e
non inventate qui.

**Regola che resta valida comunque:** come per il tasto destro, lo scorrimento
non può essere l'unica porta per nessuna azione. È invisibile finché non lo
provi, e un'azione raggiungibile solo così, per chi non lo scopre, non esiste.

#### Cosa resta da decidere del problema, non del gesto

Quali campi meritano il gesto rapido. Non tutti e cinque: sotto lo scorrimento
ci stanno due o tre azioni per lato, e riempirle di roba le rende illeggibili.
Priorità e stato sono i candidati forti (sono a valore chiuso, quindi un tocco
basta); scadenza e progetto vogliono un selettore, che sotto una card non ci
sta — per quelli la strada è la modifica in luogo o il dettaglio.

### ~~6. Selezione massiva nella vista Lista~~ — fatto

Le due domande aperte hanno avuto risposta, e sono in `inbox/BarraSelezione.jsx` con il
ragionamento per esteso.

**Come si entra**: un tasto "Seleziona" in testata, cioè una **modalità esplicita**.
Non `Ctrl`+clic, che costa zero a schermo ma è invisibile a chi non lo sa; non la
casella in hover, che rende ambiguo ogni clic su una riga che già si apre *e* si
trascina. Con la modalità il clic cambia significato solo quando l'hai chiesto tu.

**Dove vivono le azioni**: una barra in fondo alla colonna, e l'azione **si sceglie e
poi si conferma** invece di partire al clic — un'azione in blocco è la cosa più
distruttiva che l'app sa fare e non ha un "annulla", e così si corregge la mira senza
uscire dalla selezione.

Trovato per strada: dopo ogni scrittura la lista si ricarica e metà degli id
selezionati può non esserci più, quindi la selezione si **interseca** con quello che
resta invece di essere buttata.

### ~~7. "Aggiungi task" nella vista divisa~~ — fatto il 2026-09-10

Tre porte: il campo in fondo alla colonna Inbox, `Ctrl+K`/`⌘K` che porta a quello, e il
campo in fondo a ogni gruppo della vista Lista (l'unico che crea già dentro un
progetto). Vedi § Interfaccia, "Dove nasce una task".

Con la scorciatoia è nato anche il primo pezzo dell'impianto della tastiera
(`lib/piattaforma.js`), che serve alle altre sei disegnate nelle Impostazioni — vedi il
punto 11.

### 8. Lo stato di apertura è fisso per sempre

Con i capi della fila bloccati, quale stato apre il flusso si decide una volta e non si
sposta più. **Il core saprebbe spostarlo** — promuovere uno e declassare l'altro in un
colpo, dicendolo con un avviso — ma quel ramo è stato tolto con la tendina: manca il
gesto, non la capacità. Se serve, la forma naturale è una voce "rendi apertura" sulla
riga, non un ritorno del menu.

### ~~9. Non c'è nessuna origine: badge e colonna sono costruiti e invisibili~~ — risolto l'11/09/2026

I bot Telegram e Discord sono il mittente che mancava: le origini arrivano,
`isNew` si accende e il badge conta. Vedi § Database, "La confluenza delle
sorgenti". La mail resta da scrivere, ma ha due forme da ricalcare — il
connettore è un modulo puro che non sa niente né di Electron né del database, e
il montaggio è un registro dove aggiungerla è una voce.

### 10. Notifiche desktop (riscritto l'11/09/2026)

**La parte che contava è fatta, e non era una notifica.** Le origini si vedono
nel badge in cima alla schermata, e il numero sale quando ne arriva una. Fine:
quello *è* l'avviso, ed è già lì. Un arretrato visibile fa il lavoro che una
notifica avrebbe fatto, e lo fa meglio — non si perde, non va spento, e sparisce
solo decidendo.

Resta la notifica **fuori dall'app**: la vaschetta di sistema quando arriva
un'origine mentre stai guardando altro. Utile, non urgente.

**Il pezzo tecnico è piccolo.** Electron ha `new Notification()`, e il client sa
già quando il numero cambia — è lo stesso `onCambio` che oggi fa riaffacciare la
finestra (`src/confluenza/cliente.js`). Una mezza giornata, comprese le
impostazioni.

**La dipendenza non si aggira: in modo manuale nessuno sta guardando.** Una
notifica presuppone qualcuno che controlli, e il manuale controlla solo quando
glielo dici. Quindi l'interruttore ha senso solo a **periodico** acceso (esiste)
o con il **push** (punto 15). E l'interfaccia deve dirlo: spento e spiegato
quando il modo è manuale, non acceso e muto.

**Secondo limite, più duro:** ad Alia chiusa non arriva niente. Il servizio lo
saprebbe ma non ha un'interfaccia — e mandarti un messaggio Telegram per dirti
che ti è arrivato un messaggio Telegram è una barzelletta, non una funzione.

**Dei quattro interruttori disegnati ne sopravvive uno**, e questa è la decisione
vera che resta:

| Interruttore | Se le notifiche sono le origini |
|---|---|
| Notifiche push su desktop | ✅ è questo |
| Promemoria attività in scadenza | ❓ è un'altra cosa — `reminderAt` e § Flussi, "Comportamento dell'alert" |
| Riepilogo email settimanale | ⛔ fuori portata |
| Orario silenzioso | ⚠️ ha senso solo se le notifiche sono più di una |

Da decidere quindi: **i promemoria di scadenza restano una funzione di Alia?**
Se sì, le notifiche sono due cose diverse e la sezione resta metà vuota finché
non c'è chi fa scattare gli alert. Se no, si toglie `reminderAt` dal disegno e
la sezione diventa piccola e onesta: un interruttore, che dipende dal modo di
controllo.

### 11. Scorciatoie: implementarle o togliere la sezione

Sette tasti disegnati (J/K, `/`, G, N, E, Spazio, ⌫) che nessuno ascolta. Oggi la
sezione lo dichiara — onesto, ma non è uno stato in cui restare a lungo.

### 12. Gantt

Kanban e Calendario sono usciti da questa voce l'11/09/2026. Il Gantt resta l'impianto
preso dall'artboard e mai verificato sui dati veri.

Del Calendario resta da decidere il trascinamento **nel Mese e nella Settimana**:
lì spostare una pillola da una cella all'altra dovrebbe cambiare la data lasciando
l'ora com'era. E resta la domanda che le ore di disponibilità aprono senza chiudere:
lasciare un blocco **fuori** dalle fasce accese oggi si accetta in silenzio. Rifiutare,
avvertire o accettare è una decisione di prodotto, non un dettaglio di
implementazione.

### 13. Dump del database dalle Impostazioni (chiesto il 2026-09-11)

Una sezione di Impostazioni che esporta i dati, con un **wizard di selezione e filtro**:
si sceglie *cosa* esce (task, progetti, stati, tag, commenti, storico), *quali* righe
(per progetto, per stato, per periodo, cancellati sì/no) e in *che forma* (JSON, CSV,
copia `.sqlite`). Non è un backup: il backup è il file, e si copia. Questo serve a
portare via una fetta leggibile — per un foglio, per un altro strumento, per guardarci
dentro.

Da decidere: se il dump passa dal core (una `dumpTasks` che riusa i filtri di
`listTasks`, e allora il wizard è la stessa grammatica dei filtri già in testata) o se
è un'operazione a parte che legge le tabelle; e dove finisce il file (dialogo di
salvataggio di Electron, presumibilmente).

### ~~14. Le sorgenti dietro un'API, e Alia che le scarica~~ — fatto l'11/09/2026

Vedi § Database, "La confluenza delle sorgenti". Il repo si è diviso in `alia/` e
`api/`; il connettore Telegram è passato di là senza una riga di modifica, perché
era già un modulo puro che consegna a una funzione.

### 15. Push: il servizio che bussa, invece del timer che chiede

Il terzo modo di suonare la sveglia, dopo manuale e periodico. **La forma giusta è
SSE** (Server-Sent Events): Alia apre una `GET /flusso` che non si chiude, il
servizio ci scrive una riga quando arriva qualcosa, e Alia risponde facendo lo
scarico che già fa.

La decisione importante, e va tenuta: **la riga non porta i dati, porta un
colpetto.** Se portasse le origini sarebbe un secondo canale con una seconda
contabilità — cioè esattamente il problema che la confluenza esiste per evitare.
Portando solo un colpetto, un evento perso non fa danno: lo scarico successivo
recupera tutto lo stesso, perché la ricevuta di lettura resta l'unica e sta sul
server.

Perché SSE e non le altre due:

- **WebSocket** è bidirezionale, e Alia non ha niente da dire al servizio in
  tempo reale: si pagherebbe un handshake di upgrade e un protocollo in più per
  una direzione sola.
- **Long polling** funzionerebbe — è quello che il servizio fa con Telegram — ma
  su HTTP/1.1 tiene occupata una connessione per ogni client in attesa, e non dà
  niente in più di SSE per questo caso.

Da fare: la rotta `/flusso` nel servizio con l'elenco degli ascoltatori, un
heartbeat per non farla chiudere dai proxy, la riconnessione con backoff lato
Alia, e il terzo bottone in Impostazioni. Nessuna modifica al contratto
esistente: `push` si aggiunge a `MODI`, e il resto è già al suo posto.

### ~~16. Scorrimento laterale sulla card~~ — confluito nel punto 5 l'11/09/2026

Era la stessa cosa vista dall'altro lato: il punto 5 chiedeva *come* cambiare le
cose senza aprire il dettaglio, questo proponeva *il gesto*. Ora stanno insieme,
col problema sopra e il meccanismo sotto. Il numero resta qui vuoto per non
rinumerare gli altri.

### 17. Trascinare un'origine dentro "Da smistare" (chiesto l'11/09/2026)

Prendere una card della colonna origini, tirarla sulla colonna "Da smistare" e
lasciarla lì: l'origine viene accettata e nasce il task. È il gesto che la
spunta fa già, ma detto con le mani.

**Perché oggi non funziona, e non è una decisione.** Il motore del
trascinamento lavora su `data-task`: prende l'elemento con `closest("[data-task]")`
(`dragKit.js:196`) e costruisce l'anteprima leggendo tutti gli elementi con
quell'attributo (`dragKit.js:217`). Quando le origini hanno smesso di essere
task hanno perso quell'attributo, e il motore **ha smesso di vederle**. Non è
stato disattivato: si è spento da sé.

Non contraddice il senso di marcia unico (§ Flussi, "Vita di un'origine"), e la
distinzione va tenuta ferma:

- **dentro** le origini non si rilascia niente — già impedito dal motore, che
  esclude `[data-drop-col="origin"]` dai bersagli (`dragKit.js:251`);
- **fuori** dalle origini si trascina, ed è la conversione. Va bene.

**La versione da fare è quella leggera, e non per risparmiare.** La parità con
i task costerebbe cara — l'anteprima che apre il varco e il FLIP vogliono che
l'oggetto trascinato esista nella lista dei task, e un'origine non c'è — ma
soprattutto **non ha senso**: trascinando un'origine non si sceglie *dove*
metterla (il task nasce comunque in fondo a "Da smistare"), si sceglie **se**
farla entrare. Quindi:

- presa al `pointerdown` con la stessa soglia di 4px del motore;
- un clone che galleggia sotto il puntatore;
- al rilascio su `[data-drop-col="none"]` si chiama `accetta(seq)`; su
  qualunque altro bersaglio, niente.

Niente varco, niente FLIP, niente posizioni da scrivere: una sessantina di
righe, in un hook a parte che non tocca `dragKit`.

**Quasi gratis, e coerente:** rilasciare sopra un gruppo di progetto della vista
Lista può voler dire "accetta **e** assegna quel progetto", che è già il
significato che quel rilascio ha per i task.

**Da decidere:** cosa si vede mentre si trascina sopra un bersaglio non valido
(oggi, per i task, non si vede niente — vedi la nota in `inbox.css` sul contorno
tolto); e se l'origine trascinata debba sparire subito dalla colonna
(ottimistico) o solo dopo che il servizio ha confermato. Visto che la colonna è
una finestra e non un magazzino, la seconda è più onesta — ma su rete lenta si
vede il ritardo.

### 18. Archiviare: uno stato o un flag? (chiesto l'11/09/2026)

**La domanda.** Oggi archiviare è uno **stato** — la voce "Archivia" del menu dei tre
pallini chiama `alia.cambiaStato(task, Archiviato)` (`TaskDetailModal.jsx:497`), e
`Archiviato` è uno stato di chiusura secondaria fra quelli di fabbrica
(`database.js:164`). La domanda è se sia il posto giusto, o se archiviare sia invece un
**flag** ortogonale allo stato, come `isInbox` e `deletedAt`.

**Il residuo che va guardato per primo: `archivedAt` esiste già, e non lo scrive
nessuno.** La colonna è nello schema, è nell'elenco letto da `getTask`
(`task-core.js:574`), ed è citata nel commento di `scriviStato` — *"`completedAt` e
`archivedAt` seguono lo stato"* — ma l'`UPDATE` lì sotto scrive solo `completedAt`.
`listTasks` non la seleziona nemmeno, quindi il renderer non l'ha mai vista. Cioè: la
mezza risposta "flag" è già nel modello, morta, mentre il comportamento vive nello
stato. Qualunque cosa si decida, questa incoerenza va chiusa — o la colonna si riempie,
o si toglie con il commento che la promette.

**Cosa oggi non si riesce a dire.** Lo stato è uno solo per task, quindi archiviare
*sostituisce* l'informazione precedente invece di aggiungersi:

- una task **Fatta** e poi archiviata smette di risultare fatta: `idState` diventa
  `Archiviato` e `completedAt` resta lì da solo, senza più uno stato che lo spieghi.
  E la distinzione conta proprio dove serve — i conti di fine mese, "quante ne ho
  chiuse", che § Flussi ("Migrazione") dice già di fare su `idState` e non su
  `isCompleted`;
- una task **In corso** che si vuole togliere di mezzo senza dichiararla finita non ha
  dove andare: archiviarla la conta come conclusa, perché `Archiviato` è
  `isEndState`, e con la cascata questo può anche chiudere il padre.

Sono i due casi che fanno pensare al flag: "a che punto è" e "la voglio ancora vedere"
sono due domande diverse, e oggi rispondono allo stesso campo.

**Cosa c'è dall'altra parte.** La fila degli stati è stata irrigidita apposta per
ospitare le *chiusure secondarie* — migrato, archiviato, annullato (§ Database, "Entità
t_state") — quindi il flag duplicherebbe un concetto che il modello ha già e si è
pagato. E un flag non è gratis: vuole un filtro suo (oggi gli archiviati spariscono
dietro **"Mostra completate"**, che è la stessa leva delle fatte — vedi sotto), una
regola nel Kanban (una task archiviata resta nella colonna del suo stato? o esce dal
tabellone?), una posizione nella cascata, e una voce nelle Impostazioni.

**Da dove è nata la domanda.** Provando il trascinamento nel Kanban: lasciando una card
su **Archiviato** (o Migrato, o Fatto) la card sparisce dal tabellone, perché lo stato è
`isEndState`, il trigger mette `isCompleted` e `filterTasks` nasconde le chiuse finché
non si accende "Mostra completate" (`contentQuery.js:114`). Il dato è corretto e il
gesto ha funzionato, ma a schermo è indistinguibile da una task persa. Anche restando
sugli stati, **quel momento va disegnato**.

**La mia preferenza: flag**, con `archivedAt` come dato e `Archiviato` che smette di
essere uno stato di fabbrica. Archiviare non è un punto del percorso, è una decisione
sulla *scrivania*: la stessa famiglia di `isInbox`, che infatti è già un flag e non uno
stato per la stessa ragione (§ Flussi, "La scrivania e il lavoro"). Con il flag una task
resta "Fatta e archiviata" o "In corso e archiviata", che è quello che si vuole dire, e
il filtro diventa suo — "Mostra archiviate", separato da "Mostra completate".

**Da decidere prima di muovere una riga:** cosa succede ai database esistenti che hanno
già task nello stato `Archiviato` (una migrazione che le porta sul flag deve inventare
lo stato da cui venivano, e non può — probabilmente le lascia dove sono e converte solo
il futuro), e se il flag debba togliere la task dal Kanban o lasciarla nella sua colonna.

### Piccoli

- **Il periodico confronta un numero, non il contenuto** — il giro chiede
  `/salute` e bussa solo se `daProcessare` è cambiato. Se fra due giri
  un'origine viene decisa altrove e un'altra arriva, il totale resta lo stesso e
  il colpetto non parte: la finestra mostra roba vecchia fino al giro dopo o
  fino alla freccia. Raro e innocuo (nessun dato si perde), ma è il prezzo di
  confrontare un conteggio invece di un'impronta. Si chiude quando serve
  facendo restituire a `/salute` anche il `seq` più alto.

- **Icona `Gear`** — è il glifo `settings` di Lucide, non viene da un artboard. Da
  verificare col disegno quando capita.
- **Selettori nativi** — i pochi `select` rimasti (dialoghi di conferma) usano la
  freccia del sistema; gli artboard la ridisegnano. Se serve, farne un componente unico.
- **Card della colonna Inbox** — sono alte 43.5px contro i 44.2 dell'artboard
  (−0.7 ciascuna): la card minima non è autonoma in nessun canonico e la geometria è
  presa da `DEF_Inbox min`. Se serve la corrispondenza esatta, va deciso se recuperare
  `Task Row` nel set canonico.
- **Posizione scritta al rilascio** — il trascinamento scrive anche la posizione dentro
  il gruppo, ma si vede solo con l'ordinamento **Manuale**: con Scadenza, Priorità o
  Titolo la posizione viene conservata e il task salta subito dove lo mette
  l'ordinamento. Le strade sono due: passare a "Manuale" al primo rilascio posizionale,
  o scrivere la posizione solo quando l'ordinamento è Manuale.

### Vecchi, dalla lista precedente

- **Sidebar** — allineamento del `+`; la cancellazione progetto a doppia pressione va
  sostituita con un componente di conferma. (Da rivedere: la sidebar non esiste più.)
- **Griglia/tabella** — stato "Inbox" che non deve comparire, stato di chiusura unico,
  allineamenti, intestazione "Task", padding verticale. Revisione complessiva.
- **Filtro** — il menu "Progetto" non pescava dai progetti veri.
- **Inbox** — ragionare sulla pagina Inbox e sulla vista flottante.
