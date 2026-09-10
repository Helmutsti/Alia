# Inbox per lo smistamento delle attivita

## Stato del documento

Questo documento raccoglie le decisioni prese finora sul prodotto e le prime scelte tecniche relative al core. Non rappresenta ancora una specifica definitiva.

## Avanzamento (aggiornato 2026-09-07)

### Fatto

- **Core** (`src/core/task-core.js`, `src/core/rinascita-schema.js`, `src/core/database.js`): CRUD sulle task con lo schema `t_task` ricorsivo, macchina a stati configurabile, persistenza SQLite, storico, cancellazione logica. Coperto da test automatici (`test/task-core.test.js`, `test/rinascita-migration.test.js`). **Sostituisce** `item-core.js` e lo schema `items`/`subtasks`/`statuses` descritti nel resto di questo documento, che sono stati rimossi il 2026-09-09: la descrizione autorevole del modello è ora `Rinascita.md`, e quanto segue qui va letto come storia del prodotto, non come schema corrente.
- **Interfaccia grafica** (`electron/`, `renderer/`): app Electron + React, stile "Nocturne" con accento blu copiato dal mockup Alia (Claude Design). Il main process apre il core reale e lo espone al renderer solo tramite IPC (`electron/main.js`, `electron/preload.js`); il renderer non tocca mai il database direttamente.
  - **Inbox** (`renderer/src/screens/InboxScreen.jsx`): elenco item con `status:'inbox'`, composer inline per l'inserimento manuale, azioni rapide "Attiva" e "Scarta".
  - **Oggi** (`TodayScreen.jsx`): item con `status:'active'` raggruppati in Scaduti / Oggi / Senza scadenza in base a `dueAt`.
  - **Tutti i task** (`ListScreen.jsx`): tabella con ricerca testuale e filtro Tutti/Aperti/Fatti.
  - **Composer** (`components/TaskComposer.jsx`): variante inline e flottante (⌘K), chip Scadenza/Priorità/Promemoria con icona propria. Invio semplice si comporta in modo normale (nel titolo non fa nulla, nella nota va a capo); **Maiusc+Invio** è l'azione: nel titolo passa alla nota, nella nota invia il task — scelto così per non intralciare la scrittura libera. Sintassi rapida in stile Todoist mentre si scrive il titolo (vedi sotto).
  - **Dettaglio task** (`components/TaskDetailModal.jsx`): completa/riapri, rimanda a domani, modifica priorità, elimina con conferma.

### Da fare

Sul **core**: tutto quanto elencato in "Funzionalità rinviate" più sotto (progetti, tag, sotto-task, ricorrenze, allegati, dipendenze, sorgenti esterne, riscrittura IA, sync/multiutente).

Sull'**interfaccia**, nell'ordine in cui sbloccano le rispettive schermate del mockup Alia:
1. ~~Progetti nel core~~ **fatto in forma leggera** (2026-09-07): `items.project` è una colonna testo singola (non ancora la tabella `projects` con colore/conteggi prevista sotto) — sblocca solo la scrittura tramite sintassi `@progetto` nel composer, non ancora barra laterale/Kanban per progetto (quelli restano legati alla tabella `projects` vera e propria).
2. ~~Tag nel core~~ **fatto in forma leggera** (2026-09-07): `items.tags` è un array JSON su colonna testo (non ancora la tabella `tags`/`item_tags` relazionale prevista sotto) — sblocca la scrittura tramite `#tag` nel composer, non ancora un filtro per tag nella lista.
3. **Kanban** (schermata "Avanzamento"): può in realtà partire subito sullo `status` esistente (inbox/active/completed/archived) senza aspettare i progetti — è la prima estensione grafica realistica.
4. **Calendario** (vista mensile): fattibile subito con il solo `dueAt`, nessuna estensione al core necessaria.
5. **Sotto-task** nel core → sblocca la sezione "Sottotask" nel dettaglio e il progress bar nel Gantt.
6. **Gantt**: richiede anche una durata (non solo un `dueAt` puntuale) e il progresso — è la schermata più lontana, va ridisegnata più semplice rispetto al mockup finché il core non ha questi dati.
7. **Sorgenti esterne** (email/Discord) e **riscrittura IA**: sbloccano le card di triage nell'Inbox come nel mockup (badge sorgente, proposta IA, "Vedi originale").
8. **Naming**: ~~da confermare~~ **deciso: il prodotto si chiama Alia** (2026-09-07). Tra i tre finalisti con marchio (Aliante, Rotta, Filo) e il nome placeholder già in uso, si è scelto di tenere "Alia" — nessuna modifica al codice necessaria, l'interfaccia lo usava già come placeholder. Resta da fare, se si vuole procedere in modo serio: verifica marchi (classi 9/42, assonanza con nomi esistenti come segnalato nel mockup "Naming e logo.dc.html") e scelta definitiva del marchio figurativo tra le varianti disegnate.

Vedi la sezione "Modello Item" più sotto per il dettaglio dei campi che ogni punto richiede.

### Sintassi rapida nel composer (stile Todoist)

Mentre si scrive il titolo, alcuni simboli vengono riconosciuti dal vivo e accendono subito il chip corrispondente — ma restano visibili nel testo del titolo così come li si digita. Vengono tolti dal titolo **solo al salvataggio del task** (mai prima, mai se il task non viene inviato): a quel punto il titolo salvato è pulito e i valori estratti finiscono negli attributi corrispondenti (`renderer/src/lib/composerSyntax.js`):

| Simbolo | Esempio | Effetto |
|---|---|---|
| `!1`–`!4` | `Chiamare il commercialista !2` | Priorità — mappatura stile Todoist: `!1` Urgente, `!2` Alta, `!3` Media, `!4` Bassa. Salvato in `items.priority`. |
| `#parola` | `Comprare il latte #casa` | Tag (uno o più, si possono ripetere). Salvato in `items.tags`. |
| `@progetto` o `@progetto/lista` | `Follow-up cliente @lavoro/clienti` | Progetto, con una "lista" opzionale dentro il progetto separata da `/` (uno solo, l'ultimo scritto vince). Salvato in `items.project` come stringa (es. `"lavoro/clienti"`). |
| `/<numero><unità>` (isolato, non dentro un `@...`) | `Richiamare /2h` (unità: `m` minuti, `h` ore, `g` giorni) | Promemoria **relativo a adesso** (non alla scadenza): `/2h` = tra 2 ore da quando si invia il task. Salvato in `items.reminderAt`. |

Simboli scartati: `~` (scomodo da digitare, richiede AltGr + tasto morto su layout comuni) e `\` (sostituito da `/` per il promemoria, più comodo). La scadenza (`dueAt`) **non ha e non deve avere** una sintassi da titolo: resta impostabile solo a mano dal chip "Scadenza" nell'interfaccia — scelta esplicita, non desumibile dal testo.

Nota sull'ambiguità `/`: quando `/` segue immediatamente un `@parola` viene letto come separatore progetto/lista (`@lavoro/clienti`); quando `/` è isolato (preceduto da spazio o a inizio titolo) è il promemoria. Il parser applica prima la regola progetto, così uno slash già "consumato" dentro `@...` non viene poi riletto come promemoria.

Ogni chip (Scadenza, Priorità, Promemoria) ha un'icona propria per essere riconoscibile a colpo d'occhio anche senza aver ancora impostato nulla — calendario per la scadenza, bandierina per la priorità, sveglia per il promemoria; il progetto derivato da `@` ha la sua cartellina.

**Cancellare il simbolo dal titolo annulla l'impostazione corrispondente** — ma solo se quell'impostazione veniva dal testo: se invece è stata scelta a mano dal menu del chip (Priorità, Scadenza o Promemoria), resta impostata anche cancellando o continuando a scrivere, finché non la si cambia di nuovo dal menu o dal testo. In pratica: l'ultima azione (testo o click) vince, e il testo scritto dopo non cancella una scelta fatta a mano se non ripete il simbolo.

Scadenza e Promemoria hanno anche un campo data/ora personalizzato (calendario nativo) nel loro menu, oltre alle scelte rapide — per un valore esatto che le scorciatoie non coprono.

Nessun campo tranne il titolo è obbligatorio: scadenza e promemoria partono entrambi su "nessuna/nessuno" e restano tali finché non li si imposta esplicitamente (da simbolo, da chip o da calendario). Anche la descrizione resta facoltativa.

### Convenzione: promemoria (reminder) vs schedulazione (due date)

Sono due concetti distinti e non vanno confusi, né nel codice né nella UI:

- **Schedulazione** = `dueAt`, quando il task è previsto/scade. Icona **calendario**. Già usato ovunque (chip "Scadenza", vista Oggi, colonna Scadenza in Lista).
- **Promemoria** = `reminderAt`, quando l'app deve avvisare l'utente (può non coincidere con la scadenza: es. "avvisami il giorno prima"). Icona **sveglia**, mai la campana/notifica generica.

Mockup di riferimento in Claude Design (progetto Alia), verificati e coerenti con questa convenzione:
- **Reminder — esempi.dc.html**: chip "Promemoria" nel composer (icona sveglia + menu Alla scadenza/1 ora prima/Il giorno prima/Data e ora personalizzata/Nessuno), indicatore a sveglia nelle righe di Oggi/Lista, toast di notifica in-app.
- **Allegati — esempi.dc.html**: foto come allegati in stile Trello — griglia di miniature nel dettaglio task, copertina sulla card Inbox quando è presente almeno un allegato, anteprima a schermo intero. Il core non ha ancora la tabella `attachments` (vedi tabella sotto), qui sono solo placeholder a righe.

Nessuno dei due è ancora implementato nel codice reale (solo mockup); l'implementazione nel core + IPC + renderer resta da fare.

## Obiettivo

Realizzare un programma per raccogliere e smistare lavori e attivita provenienti da sorgenti diverse.

Il riferimento funzionale e Todoist, ma il prodotto non nasce come un suo clone. Il suo ruolo principale e quello di fare da inbox centrale e da punto di triage: raccoglie gli input, li rende lavorabili, permette di catalogarli e aiuta a decidere dove dovranno essere gestiti.

## Principio principale

L'inbox non coincide necessariamente con la lista definitiva delle attivita.

- L'inbox e il luogo temporaneo in cui un nuovo input viene esaminato e smistato.
- Dopo la decisione, l'item puo continuare a vivere nel sistema oppure essere inviato a una piattaforma esterna.

## Sorgenti

Le sorgenti devono essere configurabili. Quelle previste finora sono:

- Manuale
- Email
- Discord

Ogni item conserva le informazioni disponibili sulla propria origine, come la sorgente, l'autore o mittente, la data, il contenuto originale e un eventuale collegamento al messaggio esterno.

## Flusso di un item

### 1. Arrivo

Un nuovo input entra nel sistema da una sorgente configurata. Vengono conservati il contenuto originale e i relativi dati di provenienza.

### 2. Riscrittura e normalizzazione

L'intelligenza artificiale puo trasformare l'input in un item operativo piu chiaro, producendo elementi come:

- un titolo breve;
- una descrizione pulita;
- il contesto utile;
- eventuali prossime azioni;
- ~~una priorita suggerita~~ (fuori perimetro: vedi sezione 3, l'IA non cataloga);
- ~~possibili categorie~~ (fuori perimetro: vedi sezione 3, l'IA non cataloga).

La riscrittura tramite IA non e obbligatoria per tutti gli input. Il suo comportamento viene configurato separatamente per ogni flusso o sorgente.

Le modalita previste sono:

- **Mai**: il contenuto non viene riscritto dall'IA.
- **Su richiesta**: la riscrittura avviene solo dopo un'azione esplicita dell'utente.
- **Automatica**: l'IA genera subito la versione operativa dell'item.
- **Suggerita**: l'IA prepara una proposta che l'utente puo decidere se applicare.

Il flusso manuale usa la modalita **Su richiesta**: l'utente scrive liberamente l'item e dispone di un pulsante live, per esempio **Riscrivi con IA**, che attiva intenzionalmente la riscrittura.

Il contenuto originale non viene sostituito. Rimane sempre disponibile tramite un'azione come **Vedi originale**. L'interfaccia deve inoltre indicare chiaramente quando il testo corrente e stato generato o modificato dall'IA.

### 3. Catalogazione

L'item puo essere organizzato usando informazioni come:

- progetto;
- cliente;
- area;
- tipo di lavoro;
- urgenza o priorita;
- impegno stimato;
- piattaforma di destinazione.

**Metodo deciso (2026-09-10): manuale come base, regole deterministiche come secondo strato. L'IA non cataloga.**

Due strati, utili ciascuno da solo e da implementare in questo ordine:

1. **Manuale**, sempre disponibile. E l'unico strato che funziona senza sorgenti esterne configurate, ed e anche la correzione dello strato successivo. In buona parte c'e gia: progetto, milestone e priorita si impostano dal dettaglio del task.
2. **Regole deterministiche**, insieme alle sorgenti esterne. Lo smistamento reale di mail e canali e in gran parte ripetitivo (un mittente e sempre lo stesso cliente, un canale e sempre lo stesso progetto): le regole sono prevedibili, verificabili e non costano chiamate a un modello. Si agganciano ai campi `sourceType`/`sourceId` gia presenti su `t_task`.

**L'IA e esclusa dalla catalogazione**: nessuna assegnazione e nessuna proposta di progetto, cliente, area, tipo di lavoro, urgenza, impegno o destinazione. Resta invece in gioco per la **riscrittura del testo** (sezione 2 qui sopra), che e un'altra cosa. Conseguenza da riportare sulla sezione 2: tra gli elementi che la riscrittura produce, "una priorita suggerita" e "possibili categorie" **escono dal perimetro** — la riscrittura si ferma al testo.

Nota sui campi: il modello attuale `t_task` copre di questa lista solo **progetto** (`idProject`, con `idMilestone` per la fase) e **urgenza** (`priority`, cinque livelli). Cliente, area, tipo di lavoro, impegno stimato e piattaforma di destinazione non hanno ancora un campo, e quali servano davvero resta da decidere (candidati concreti: cliente e tipo di lavoro).

### 4. Decisione

Dopo il triage, l'item puo essere:

- gestito come attivita interna;
- inviato a Todoist;
- inviato a Zoho Projects;
- trasformato in promemoria;
- archiviato;
- segnato come da chiarire;
- riconosciuto come duplicato ed eventualmente unito a un altro item.

### 5. Chiusura o trasferimento

L'item puo essere completato o cancellato nel sistema, oppure trasferito a una piattaforma esterna. Quando viene trasferito, il sistema deve mantenere una traccia della sua origine e della destinazione.

## Componenti concettuali

Il prodotto comprende, a livello funzionale:

- connettori di ingresso per ricevere contenuti dalle sorgenti;
- un item di inbox che conserva originale e versione lavorabile;
- strumenti di classificazione e catalogazione;
- connettori di uscita verso piattaforme esterne;
- stati che rappresentano il percorso dell'item;
- uno storico delle operazioni effettuate.

## Decisioni tecniche per il core

### Perimetro iniziale

La prima fase di sviluppo riguardera soltanto il funzionamento di base degli item e la loro persistenza. Il core si comportera come un'applicazione di promemoria, senza sviluppare per ora l'interfaccia utente, le sorgenti esterne e le integrazioni di uscita.

L'impostazione iniziale sara locale e orientata a un singolo utente. L'eventuale sincronizzazione tra dispositivi o supporto multiutente potra essere progettata in una fase successiva.

### Piattaforma e database

- L'applicazione sara realizzata con **Electron** e **Node.js**.
- Il database locale sara **SQLite**.
- SQLite consentira di conservare i dati senza richiedere un server separato.
- L'accesso al database avverra nel processo principale di Electron.
- L'interfaccia, quando verra sviluppata, comunichera con il core tramite un confine controllato e non accedera direttamente al database.

### Struttura del core

Il core sara separato in due responsabilita principali:

- un servizio degli item, responsabile delle operazioni e delle regole di funzionamento;
- un livello di persistenza, responsabile della lettura e scrittura su SQLite.

Questa separazione permettera di testare il comportamento degli item senza dipendere dall'interfaccia e senza distribuire query al database nel resto dell'applicazione.

Le operazioni di base previste sono:

- creare un item;
- leggere un item;
- modificare un item;
- elencare, cercare e filtrare gli item;
- completare un item;
- archiviare un item;
- cancellare logicamente un item;
- ripristinare un item cancellato.

### Attributi di un item

Gli attributi essenziali previsti sono:

- `id`: identificatore univoco;
- `title`: titolo breve;
- `description`: descrizione estesa facoltativa;
- `status`: stato corrente, inizialmente `inbox`, `active`, `completed` oppure `archived`;
- `priority`: priorita, inizialmente `none`, `low`, `medium`, `high` oppure `urgent`;
- `dueAt`: data entro cui completare l'item, facoltativa;
- `reminderAt`: momento in cui mostrare il promemoria, facoltativo;
- `createdAt`: data di creazione;
- `updatedAt`: data dell'ultima modifica;
- `completedAt`: data di completamento, se presente;
- `archivedAt`: data di archiviazione, se presente;
- `deletedAt`: data di cancellazione logica, se presente.

Per rendere il core compatibile con le future sorgenti, sono inoltre previsti:

- `sourceType`: tipo di sorgente, come `manual`, `email` o `discord`;
- `sourceId`: identificatore dell'elemento nella sorgente esterna, facoltativo;
- `sourceUrl`: collegamento all'originale, facoltativo;
- `originalContent`: contenuto originale immutabile;
- `contentGeneratedByAi`: indica se il testo corrente e stato generato o modificato dall'IA.

### Estensioni pianificate al modello Item

Ogni riga sotto è un campo/entità che oggi **non esiste** nel core ma che serve per sbloccare una parte specifica dell'interfaccia già disegnata nel mockup Alia. Servono come base per definire i prossimi task di implementazione, grafica inclusa.

| Estensione | Forma proposta | Sblocca (grafica) | Priorità |
|---|---|---|---|
| **Progetto** (relazionale) | Nuova tabella `projects` (`id`, `name`, `color`); migrare `items.project` (oggi testo libero, vedi sotto) verso un `projectId` che vi punta | Barra laterale con elenco progetti, colori, conteggi; filtro/raggruppamento per progetto; colonne Kanban "per progetto" | Alta |
| **Tag** (relazionale, con filtro) | Tabella `tags` + tabella ponte `item_tags`, per sostituire l'array JSON attuale quando serve un filtro efficiente per tag su grandi volumi | Filtro per tag nella lista, autocompletamento tag esistenti nel composer | Media |
| **Sotto-task** | Nuova tabella `subtasks` (`id`, `itemId`, `title`, `done`, `position`) | Sezione "Sottotask · x di y" nel dettaglio task, badge conteggio nelle card Kanban/Gantt | Media |
| **Durata pianificata** | `startAt` accanto a `dueAt` su `items` (oggi c'è solo un punto nel tempo) | Barre nel Gantt con inizio/fine reali invece di un singolo marcatore | Bassa (dopo sotto-task) |
| **Milestone** | Variante di item senza durata, marcata da un flag `isMilestone` | Marcatori a rombo nel Gantt/Calendario come nel mockup | Bassa |
| **Nota/commento** | Tabella `item_notes` (`id`, `itemId`, `text`, `createdAt`) — distinta da `item_history` che è automatico | Sezione "Attività" nel dettaglio (note manuali, non solo eventi di sistema) | Bassa |
| **Allegati (foto)** | Tabella `attachments` (`id`, `itemId`, `fileName`, `mimeType`, `path`, `size`, `createdAt`); file salvati su disco in `userData/attachments/`, solo il riferimento in SQLite | Griglia di miniature nel dettaglio task, copertina sulla card Inbox, anteprima a schermo intero — stile Trello, mockup già pronto (`Allegati - esempi.dc.html`) | Media |

Le sorgenti esterne (email/Discord) e la riscrittura IA restano più a monte: richiedono un connettore che scriva nuovi item con `sourceType`/`sourceId`/`sourceUrl` già supportati dal core, più un campo per la "proposta" IA prima della conferma (oggi il core assume che ogni item creato sia già confermato). Da progettare quando si affronta quel punto.

### Dati collegati

Tag, progetti e storico delle modifiche saranno conservati separatamente dagli item.

- Un item potra avere piu tag.
- Un item potra appartenere a un progetto.
- Lo storico registrera le operazioni rilevanti effettuate sull'item.

### Verifica

Il core avra test automatici indipendenti dall'interfaccia, con particolare attenzione alla creazione, modifica, transizione di stato, cancellazione logica, ripristino e persistenza degli item.

### Funzionalita rinviate

Non fanno parte del primo sviluppo del core:

- interfaccia grafica;
- ricorrenze;
- sotto-attivita;
- allegati;
- dipendenze tra item;
- importazione da email e Discord;
- riscrittura effettiva tramite IA;
- sincronizzazione tra dispositivi;
- integrazioni con Todoist e Zoho Projects.

## Prima versione ipotizzata

Come possibile perimetro iniziale sono stati individuati:

- inserimento manuale;
- inbox unica;
- tag, progetto e priorita;
- stati essenziali;
- riscrittura manuale tramite IA per gli item inseriti a mano;
- accesso immediato al contenuto originale;
- completamento e archivio;
- invio a Todoist, inizialmente simulato oppure reale;
- schermata di configurazione delle sorgenti, anche se nella prima fase fosse attiva soltanto quella manuale.

Questo perimetro e ancora da confermare.

## Questioni ancora aperte

Punti 1, 2 e 4 decisi il 2026-09-10; il 3 resta rimandato.

1. ~~Se il programma sara anche il luogo principale in cui gestire il lavoro oppure soprattutto un ponte verso Todoist, Zoho Projects e altre destinazioni.~~ **Deciso: dentro Alia si lavora.** Alia raccoglie dalle origini, e il lavoro vive qui. Verso Zoho Projects va **solo la creazione di nuovi task**, non la gestione: l'export e un gesto in uscita, non un trasferimento della sede di lavoro.
2. ~~Se la catalogazione sara manuale, basata su regole, affidata all'IA o composta da una combinazione delle tre modalita.~~ **Deciso: manuale + regole deterministiche, senza IA.** Il manuale e la base e la correzione, le regole arrivano con le sorgenti esterne; l'IA non assegna e non propone attributi di catalogazione (resta solo sulla riscrittura del testo). Dettagli e conseguenze nella sezione Catalogazione.
3. Se email e Discord importeranno tutto da caselle, cartelle o canali selezionati, oppure soltanto i messaggi marcati esplicitamente. **Rimandato** (2026-09-10): da riprendere insieme all'integrazione delle sorgenti.
4. ~~Se l'integrazione con Todoist e Zoho Projects dovra mantenere una sincronizzazione successiva oppure limitarsi a creare l'attivita esterna e conservarne il collegamento.~~ **Deciso: solo collegamento.** Si crea l'attivita esterna e si conserva il riferimento; nessuna sincronizzazione successiva, in nessuna delle due direzioni. Conseguenza sul modello: servono i campi del riferimento esterno (piattaforma, id, url) e la data di invio, non un meccanismo di riconciliazione dello stato.
5. Se l'interfaccia dovra assomigliare maggiormente a una inbox/email oppure a una dashboard gestionale.
6. Se completare e cancellare saranno due azioni distinte e quale storico dovra essere conservato in entrambi i casi.

Nota sul punto 5: l'interfaccia costruita finora è già un ibrido inbox + dashboard (Inbox per il triage, Oggi/Tutti i task come dashboard di lavoro), coerente con l'impostazione del mockup Alia — non è stata presa come decisione definitiva, ma è il punto di partenza su cui iterare.

Resta aperto il punto 3 (perimetro di importazione delle sorgenti), che condiziona direttamente le estensioni del modello elencate sopra. I punti 1 e 4, decisi, fissano invece il perimetro: Alia e la sede del lavoro e le destinazioni esterne sono di sola andata.
