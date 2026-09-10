# DESIGN_LOCK

Set canonico degli artboard di Claude Design da cui viene ricostruita l'interfaccia.
Progetto: **Alia** — `https://claude.ai/design/p/8709c4b3-1615-4ff4-8c09-a3559521cdea`
Congelato il: **2026-09-09**

Ogni artboard qui elencato è la **fonte di verità** per il componente corrispondente.
Se un valore nel codice non è ricavabile dall'artboard, è un valore inventato: va
riportato in "Scostamenti aperti" e deciso, non lasciato implicito.

## Artboard canonici

| Artboard | Byte | etag congelato | Componente/i di destinazione |
|---|---|---|---|
| `DEF_Card.dc.html` | 18777 | `1788962689527845` | `renderer/src/components/TaskRow.jsx` (card task, foglia condivisa) |
| `DEF_Inbox min.dc.html` | 31999 | `1788961097441945` | schermata principale a due colonne (Small Inbox + area contenuto) |
| `DEF_Inbox max.dc.html` | 24607 | `1788962693486779` | Full Inbox (board di triage con colonna "Origini da confermare") |
| `DEF_Task Detail.dc.html` | 57610 | `1788962685594194` | `renderer/src/components/TaskDetailModal.jsx` |

Design system linkato dagli artboard (nessun override `:root` locale negli artboard):
`_ds/nocturne-03f410d7-b208-4f8f-9281-b5babf7f77d1/styles.css` — etag `1788784597229867`.

**Attenzione:** `DEF_Inbox min` ha un etag anteriore agli altri tre (non toccato
nell'ultimo giro di correzioni del 2026-09-09). Verificare che le correzioni finali
non lo riguardassero prima di trascriverlo.

## Esplicitamente fuori scopo

Appartengono a direzioni progettuali diverse. **Non vanno cancellati e non vanno usati
come riferimento**; saranno rivisti separatamente.

- `DEFINITIVI/` (`FullInboxDEF`, `MinInboxDEF`, `TaskCardDEF`) — generazione precedente
- `Full Inbox.dc.html`, `Schermata Principale.dc.html`, `Main board.dc.html`, `MainDEF.dc.html`
- `Task Row.dc.html`, `Task List.dc.html`, `Task Composer.dc.html`, `Filter Bar.dc.html`
- `Gantt Timeline.dc.html`, `Impostazioni.dc.html`, `Impostazioni - esplorazione.dc.html`
- `Naming e logo.dc.html`, `Allegati - esempi.dc.html`, `Reminder - esempi.dc.html`
- `uploads/`, `screenshots/`, `Canvas.dc.html`

Conseguenza da tenere presente: Gantt, Calendario, Impostazioni, Composer e Filter Bar
**non hanno oggi un artboard canonico**. Restano sul design attuale del codice finché
non si decide diversamente.

## Decisioni grafiche (2026-09-09)

- **Nocturne è fuori**, colori inclusi. Nessun import del DS remoto.
- **Tailwind puro** (v4.3.3, plugin `@tailwindcss/vite`). Tema in
  `renderer/src/styles/theme.css`; la scala tipografica di Tailwind **non** viene
  sovrascritta (12px = `text-xs`, 14px = `text-sm`, 20px = `text-xl` sono già suoi);
  aggiunti solo i gradini che in Tailwind non esistono: `--text-micro` 10px,
  `--text-mini` 11px, `--text-meta` 13px, `--text-card` 13.5px.
- **Icone: Lucide + glifi custom inline** (`renderer/src/components/icons.jsx`).
  Verificate identiche all'artboard: `Check`, `Paperclip`. Custom perché assenti in
  Lucide: `PriorityFlag`, `Subtasks`, `NoteLines`. Negli artboard le icone sono rese
  a 11px/8px: passare sempre `size` esplicita, mai scalare via CSS.
- `renderer/src/styles/tokens.css` resta **solo come CSS legacy in dismissione**: non
  definisce più colori, è una serie di alias sui token Tailwind, così gli schermi non
  ancora ricostruiti prendono già la nuova palette. Va svuotato componente per
  componente.

### Palette: neutra con un solo accento (decisione del 2026-09-09, seconda revisione)

**Tutta l'interfaccia è neutra, l'unico colore è `blue-600`.** Questa decisione
sostituisce la precedente mappatura per vicinanza OKLab sui colori del design
(violet + slate): non si inseguono più i colori degli artboard, che erano un blurple
su fondi tinti di blu.

Struttura sulla famiglia **`neutral`**, l'unica davvero acromatica di Tailwind: è
definita `oklch(L 0 none)`, chroma zero e nessuna tinta, mentre slate, zinc, gray e
stone hanno tutte una punta di colore. Le luminosità restano quelle del design: il
fondo passa da L 0.20 a L 0.205.

**Tre livelli di superficie.** Il design ne aveva due e usava lo stesso valore per le
colonne e per le card, che così sparivano l'una nell'altra (difetto visto in Full
Inbox). I livelli crescono di luminosità con l'elevazione:

| token | Tailwind | L | ruolo |
|---|---|---|---|
| `--color-bg` | `neutral-950` | 0.145 | il fondo, il più scuro |
| `--color-surface` | `neutral-900` | 0.205 | colonne e pannelli: più scuri delle card, non quanto il fondo |
| `--color-elevated` | `neutral-800` | 0.269 | le card, il livello più chiaro |
| `--color-card-line` | `neutral-700` | 0.371 | bordo delle card, sempre visibile |
| `--color-content` | `neutral-200` | 0.922 | testo |
| `--color-accent` | `blue-300` | 0.809 | unico colore dell'interfaccia |
| `--color-divider` | `neutral-200` al 16% | | |
| elevazioni | bordi `neutral-700/600/400` | | |
| `--color-priority-none` | `neutral-500` | | |
| `--color-project-fallback` | `neutral-400` | | |

Rampe adottate integralmente da Tailwind: `blue-*` (accento), `neutral-*` (struttura).

**Bordo delle card**: negli artboard era `1.5px solid transparent` con l'accento in
hover, quindi a riposo la card non aveva contorno. Ora la linea è sempre visibile
(`--color-card-line`, `neutral-700`): è quello che, insieme al livello `elevated`, fa
leggere la card come card dentro la colonna.

In hover il bordo **non** passa all'accento come nell'artboard: l'accento azzurro
risultava troppo vistoso e colorato. Resta un neutro appena meno luminoso
dell'azzurro — `--color-card-line-hover`, `neutral-400` a L 0.708 contro L 0.809 di
`blue-300`. Se è ancora troppo, il gradino sotto è `neutral-500` (L 0.556).
Vale per entrambe le card, minima e origine. I bordi in hover che **non** sono card
(selettore vista, chip, "Aggiungi task") sono rimasti sull'accento.

**Accento**: `blue-300`, l'azzurro già usato per le origini. Con un accento chiaro non
serve più distinguere un gradino chiaro per testi e icone, quindi
`--color-accent-light` è stato rimosso e i suoi usi sono tornati su `--color-accent`
(intestazione colonna origini, etichette sorgente, icona della mail, voce di menu
selezionata).

### Colori ancora semantici — da confermare

`priority-high/medium/low` (`red-400`, `amber-400`, `emerald-400`) e i pallini progetto
(`sky-400`, `purple-400`, `emerald-400`, `orange-300`) sono rimasti **colorati**: non
sono cromatura d'interfaccia ma codifica del dato, e renderli neutri togliebbe
l'informazione che portano. Nelle due Inbox si vedono solo nel pallino di priorità in
hover e nei pallini del menu d'ambito.

Se "tutta l'app neutra" deve valere anche per priorità e progetti, va detto: sono tre
righe in `theme.css`.

### Card delle origini — l'unica eccezione al grigio

Le card della colonna "Origini da confermare", **e solo loro**, usano un azzurro scuro
e desaturato invece del grigio: la famiglia `slate` di Tailwind, chroma ~0.04 (un
quarto dell'accento) e tinta ~258°.

I gradini sono scelti per coincidere in luminosità con quelli neutri delle altre card,
così cambia la tinta e non la gerarchia dei livelli:

| ruolo | card origine | card neutre |
|---|---|---|
| superficie | `slate-800` L 0.279 | `neutral-800` L 0.269 |
| bordo | `slate-700` L 0.372 | `neutral-700` L 0.371 |
| bordo hover | `slate-400` L 0.704 | `neutral-400` L 0.708 |

Token: `--color-origin-surface`, `--color-origin-line`, `--color-origin-line-hover`.

Sostituiscono la tinta d'accento al 9% sopra la superficie usata prima (ripresa
dall'artboard): a chroma ~0.01 risultava di fatto grigia, cioè non leggeva come
azzurra. Verificato reso: fondo `oklch(0.279 0.041 260.031)` contro
`oklch(0.269 0 none)` della card neutra accanto.

Intestazione della colonna, etichette sorgente e icona della mail restano
sull'accento `blue-300`, che sull'azzurro scuro si stacca bene.

## Regola di riproduzione

1. **Token**: la palette Tailwind è la fonte di verità (`theme.css`). I token di ruolo
   sono alias sui gradini scelti sopra, non valori nuovi. Nessun hex scritto a mano nei
   componenti.
2. **Geometria**: gli artboard scrivono px letterali inline (`padding:12px 13px`,
   `gap:7px`, `font-size:13.5px`, `margin-left:22px`): si trascrivono 1:1.
3. **Props**: i `{{placeholder}}` e i `<sc-if>` dell'artboard sono il contratto dati
   esatto del componente. Nessun campo in più, nessuno in meno.
4. **Stati interattivi**: hover/focus/active/drag sono nel `<style>` dell'artboard
   (`.tcard:hover`, `.tchk:focus-visible`, `.sp-handle`, `.sp-tab.active::after`, …).
   Si trascrivono letteralmente, non si reinventano.
5. **Verifica**: `render_preview` dell'artboard a viewport fissa contro screenshot
   Playwright dell'app allo stesso viewport e con gli stessi dati di seed, diff pixel.

## Stato della ricostruzione

| Artboard | Componente | Stato |
|---|---|---|
| `DEF_Inbox min` | `InboxWorkspace.jsx` (riposo a p=0) | ricostruito e verificato |
| `DEF_Inbox max` | `InboxWorkspace.jsx` (riposo a p=1) | ricostruito e verificato |
| movimento min↔max | `useInboxMorph.js` | ridisegnato come scorrimento (vedi sotto) |
| `DEF_Content` (testata) | `renderer/src/inbox/ContentPane.jsx` | ricostruita e verificata |
| `DEF_Row` | `renderer/src/inbox/TaskRow.jsx` | ricostruito e verificato |
| `DEF_Card` | — | non ancora: nessuna delle due Inbox usa la card piena |
| `DEF_Task Detail` | segnaposto in `InboxFull.jsx` | solo il contenitore (640px, max-h 690px, padding 28px) |

Supporto: `InboxCard.jsx` (card minima), `OriginCard.jsx` (colonna origini),
`dragKit.js` (trascinamento + FLIP), `data.js` (dati identici agli artboard),
`inbox.css` (le due sole regole non esprimibili come utility).

Anteprima nel browser: `npm run dev:renderer` → `/preview.html?screen=min|max`.
Esiste perché `src/lib/api.js` lancia fuori da Electron; queste schermate non
toccano il core, quindi si aprono in Vite e si confrontano con gli artboard.
Per il diff pixel va fotografato l'elemento `[data-frame]`, non la pagina.

### Verifica geometrica eseguita (2026-09-09)

Confronto misurato con Playwright fra artboard reso e ricostruzione, coordinate
relative al riquadro 1180×760.

**DEF_Inbox min** — combaciano al decimo di pixel: colonna sinistra 236×760,
"Aggiungi task" 20,47 196×32, lista card 0,91 236×669, prima card 16,91
204×44.2, seconda 16,143.3 204×62.4, selettore d'ambito 260,36 880×34, tab
260,84 34.5×26, riga filtri 260,127 880×32, pannello contenuto 236,16 928×728.

**DEF_Inbox max** — combaciano: bottone di ritorno 986.3,18 173.7×31, board
20,63 1140×679, colonna origini 20,63 826×675, colonna "Nessun progetto"
860,63 300×675, testate 40.9 di altezza, card origine 21,108.9 824×69.5,
bottoni azione 20×20.

**Movimento** — vedi "Movimento ridisegnato" qui sotto: la verifica è stata
rifatta dopo il cambio.

### Movimento min↔max — scorrimento a tre sezioni (2026-09-09, terza revisione)

La home è **tre sezioni**, di cui se ne vedono due alla volta:

1. **origini** — le task da confermare
2. **inbox senza progetto** — la sezione cardine, sempre presente
3. **content page** — Lista / Kanban / Calendario / Gantt

Combinazioni ammesse: (2 + 3) è la vista divisa, (1 + 2) è la Full Inbox. La
sezione 2 non compare e non scompare mai: **è la stessa colonna** che nella
vista divisa sta a sinistra e nella Full Inbox finisce a destra. Scorrendo
verso destra si porta dietro lo spazio e tira dentro da sinistra la sezione 1;
tornando indietro la sezione 1 esce e riappare la 3.

Le due schermate quindi non sono più due componenti che si scambiano: sono i
due stati di riposo dello stesso componente, agli estremi dello stesso
movimento. `p = 0` è la geometria di DEF_Inbox min, `p = 1` quella di
DEF_Inbox max, e non c'è nessun salto alla conferma perché non c'è nessuno
scambio.

**Le tre fasi** (`useInboxMorph.js`):

| fase | trascinamento | cosa fa |
|---|---|---|
| A | 0 → 50% | la sezione 2 si allarga seguendo il puntatore, bordo sinistro a zero |
| B | 50 → 70% | il **bordo destro** della sezione 2 segue il puntatore e la larghezza si restringe verso i 300px finali: la colonna scorre a destra e la sezione 1 entra da sinistra |
| C | ≥ 70% | la sezione 2 si aggancia al suo posto (860px, larga 300) in 220ms, la sezione 1 finisce di entrare, il rilascio conferma |

Il perno del movimento: la traslazione delle origini non è un parametro a sé,
è **legata al bordo sinistro della sezione 2** (`originsX = noneLeft - 860`).
A colonna a zero le origini sono esattamente fuori quadro, a colonna a 860 sono
al loro posto. Così sono davvero tirate dentro dallo spostamento, e restano in
sincrono anche durante l'aggancio.

Legate a `p` (avanzamento della fase B): inserimento verticale (top 0→63,
altezza 760→675), cromatura della sezione 2, dissolvenza incrociata
dell'intestazione con lo spazio che si stringe da 91px a 40.9px, spegnimento
della sezione 3, comparsa dell'intestazione di quadro.

Rilascio a metà fase B: non è uno stato di riposo, quindi il movimento si
riavvolge alla fine della fase A (50%). Il rientro dalla Full Inbox usa i 280ms
e torna all'ultima larghezza registrata sotto soglia.

**Verificato** — in fase A e B il bordo destro coincide sempre col puntatore:
a 30% colonna x0 w354 (bordo 354), a 50% x0 w590 (bordo 590), a 60% x263 w445
(bordo 708), a 69% x500 w315 (bordo 815). Le origini non si sovrappongono mai
alla colonna: bordo destro 249 contro 263 al 60%, 486 contro 500 al 69%. A 75%
tutto è ai valori finali (colonna 860/300, origini a 20). Giro completo:
conferma → maniglia disattivata e sezione 3 spenta; rientro → colonna a 236,
maniglia attiva, sezione 3 visibile.

**Due revisioni precedenti, entrambe superate**: lo scatto a tutta larghezza con
badge "Rilascia per Full Inbox" (meccanismo dell'artboard), e il passaggio secco
durante il trascinamento senza badge. Il badge non serve più: a metà strada il
movimento mostra già cosa sta succedendo.

### Nome della sezione 2: "Da smistare"

L'etichetta della colonna non è più "Nessun progetto" (nome dell'artboard) ma
**"Da smistare"**: dice cosa deve accadere a quelle task invece di dichiarare
un'assenza, e si accoppia con "Origini da confermare" — due colonne, due azioni.
Il conteggio accanto resta.

Alternative scartate: "Senza progetto" (solo più corto, stessa impostazione
negativa); "Inbox" (avrebbe reso inutile il cambio di intestazione fra i due
stati, risolvendo G1, ma è ridondante finché il titolo di quadro è INBOX — resta
praticabile se un giorno la schermata si chiamerà *Smistamento*).

Nei commenti del codice la colonna è ora chiamata "Da smistare"; nelle sezioni
di questo documento che riportano misure prese sugli artboard resta "Nessun
progetto", perché è il nome che ha là.

Il pallino tratteggiato accanto all'etichetta è rimasto: nell'artboard indicava
"nessun progetto" e regge anche come "non ancora assegnata", ma con il nuovo
nome un'icona da vassoio o da inbox sarebbe più a fuoco. Da valutare.

### Spaziatura delle liste di card: 8px ovunque

La lista della sezione 2 nello stato finale aveva **4px** di spaziatura, come in
`DEF_Inbox max`, mentre tutte le altre liste di card — origini, vista Lista,
Kanban — ne hanno 8. Era l'unica diversa, e ora è a 8 come le altre.

Conseguenza dichiarata: nello stato finale le card della sezione 2 distano 4px
in più dell'artboard (la prima resta a y=109, le successive scendono di 4px
ciascuna). In compenso il valore coincide con quello della vista divisa, quindi
durante il movimento la spaziatura non cambia più.

### Cursore di spostamento (maniglia) più evidente

L'artboard lo teneva a `divider` con opacità 0.70: alfa effettiva 0.112 di
`neutral-200`, un composito a L 0.26 sul fondo — quasi invisibile per un comando
che si deve trovare. Ora è `content` al 20% a opacità piena: L 0.35, appena sotto
il bordo delle card (`neutral-700`, L 0.371). Si legge come il contorno di una
card, non di più.

Geometria invariata (2×44px, dall'artboard) e accento in hover invariato: è
cambiato solo il valore a riposo.

### La riga è un componente distinto dalla card (DEF_Row)

`TaskRow.jsx` per la vista Lista, `InboxCard.jsx` per le colonne dell'Inbox e
del Kanban. Non è una distinzione di nome: una **card** è un oggetto autonomo
che sta in una colonna, si trascina, e il bordo la chiude perché deve reggere da
sola; una **riga** è un elemento di un elenco, occupa tutta la larghezza e vive
dell'allineamento con le righe sopra e sotto.

Una prima versione della sezione contenuto usava `InboxCard` anche nella Lista:
sbagliato, ed è stato corretto.

Implementata la **disposizione A**: pallino di priorità, titolo elastico
troncato, meta in coda con scadenza, progetto e stato. Il progetto compare solo
quando non è già la chiave del raggruppamento e l'ambito è su tutti — altrimenti
sarebbe la stessa parola su ogni riga.

**La forma è una sola**, quella scelta in DEF_Row: **R1** la scatola — fondo
`elevated` e bordo proprio che schiarisce in hover — e **S2** il chip di stato
pieno, che è ciò che gli dà il peso che gli mancava. La riga misura 46px: uno in
più della versione col tag sottile, perché il chip pieno è alto 20 invece di 19.

Una versione intermedia le aveva lasciate come proprietà con l'alternativa
accanto, in attesa della revisione. Rimosse: opzioni che nessuno sceglierà fanno
credere che una scelta sia ancora aperta, e invecchiano male.

### Testata della sezione contenuto (DEF_Content)

Due righe, **94px** in tutto contro i 141 della versione a tre file — misurato
sul reso, uguale all'artboard.

- **Riga 1**: a sinistra il progetto (20px, senza bordi, pallino a sinistra e
  freccia a destra, fondo solo in hover) col conteggio accanto; a destra il
  selettore di vista. Riga alta 34, entrambi sullo stesso centro.
- **Riga 2**: gli strumenti della vista. In Lista: ordinamento, filtro,
  raggruppamento — in quest'ordine. Il raggruppatore compare **solo** in Lista.

Tolti dalla testata precedente: la barra di ricerca (mai decisa), le chip
Priorità e Milestone (confluite nel menu filtri) e la tab "Oggi" (gli intervalli
temporali stanno nel filtro, quindi la tab non serviva più).

**Il vocabolario è applicato, non solo disegnato** — è ciò che tiene in piedi la
testata:

| comando | cosa fa | può nascondere task |
|---|---|---|
| filtro | restringe | **sì** — perciò è l'unico col contatore |
| ordinamento | dispone | no |
| raggruppamento | divide in gruppi | no |

Dettagli che discendono da questa distinzione, tutti in `contentQuery.js`:
dentro un gruppo di filtri le voci valgono in OR, fra gruppi in AND;
raggruppando, l'ordinamento vale **dentro** il gruppo; "Senza scadenza" va in
fondo in entrambe le direzioni, perché è assenza di data e non una data
lontanissima; l'ordine dei gruppi segue il significato e non i dati (In ritardo
prima di Oggi, Alta prima di Media, "Senza progetto" in fondo).

**"Mostra completate"** sta fuori dal gruppo "Stato" anche se nel menu gli è
accanto: non restringe, allarga. Dentro quel gruppo si comporterebbe al
contrario delle sue vicine. Le completate sono nascoste finché non la si accende.

Il selettore di progetto **non ha** la voce "Senza progetto": quelle task vivono
nella sezione "Da smistare", e due strade per lo stesso insieme sarebbero una di
troppo. Compaiono qui come *gruppo*, raggruppando per progetto — che è un'altra
cosa.

Conseguenza sui dati: `CONTENT_TASKS` ora porta `day` numerico (null = senza
scadenza) e `project`, perché ordinamento, raggruppamento e filtri per
intervallo devono confrontarli. L'etichetta della scadenza si calcola con
`dueLabel()`, stessa logica di DEF_Card.

Verificato interagendo: ordinamento per priorità riordina dentro i gruppi;
raggruppamento per scadenza produce In ritardo / Oggi / Questa settimana / Più
avanti / Senza scadenza; il filtro "Oggi" porta la lista da 9 a 1 riga col
contatore a 1, e il menu resta aperto per accendere il secondo filtro;
"Azzera" riporta a 9; l'ambito su un progetto aggiorna titolo, conteggio e
righe; passando a Kanban il raggruppatore sparisce e il filtro resta.

### Comando di ritorno

Non è più il pulsante con testo in alto a destra del quadro, come nell'artboard:
è un **tondo di 36px senza testo, con la sola freccia**, nell'angolo in basso a
destra della colonna origini — quindi appena a sinistra della colonna della
sezione 2 (tasto a 809,701; bordo destro delle origini a 846, colonna a 860).

Sta *dentro* la colonna origini, non nel quadro: così entra ed esce con lo
stesso scorrimento delle origini invece di comparire a parte. Fondo `surface` e
non trasparente perché galleggia sullo spazio vuoto della board. Nome
accessibile su `aria-label` e `title`, obbligatorio senza testo visibile.

La lista delle origini ha `padding-bottom` 54px per non far finire l'ultima card
sotto al tondo quando scorre; con la lista corta non sposta nulla, e la
geometria verificata della prima card non cambia.

Intanto in `theme.css` è stato aggiunto l'anello di fuoco da tastiera
(`:focus-visible`), che stava solo in `tokens.css` — non caricato dalla pagina
di anteprima. Senza, un tasto icona non dà alcun segnale a chi naviga da
tastiera.

### Difetto corretto: doppio anello sul campo di rinomina

Il titolo modificabile nelle card mostrava **due** anelli sovrapposti, entrambi
azzurri: il bordo proprio del campo e l'anello di fuoco globale. La causa era
un mio errore introdotto poco prima: le regole aggiunte a `theme.css`
(`:focus-visible`, `button { line-height }`, scrollbar, `body`) stavano **fuori
dai layer**, e le regole non stratificate battono ogni layer — quindi
`outline-none` sul campo non riusciva a spegnere l'anello globale.

Correzione in due punti:

1. Tutte quelle regole ora stanno in `@layer base`. Così continuano a vincere
   sul preflight di Tailwind (stesso layer, ma prima) e restano scavalcabili
   dalle utility, che stanno in un layer successivo. Era un problema latente per
   tutte, non solo per l'anello.
2. Il campo tiene **un solo** anello e **neutro**: bordo 1px
   `--color-card-line-hover` (`neutral-400`), `outline-none`, e fondo neutro
   (`content` all'8% sopra `elevated`) al posto della tinta d'accento al 10%,
   che con un bordo neutro stonava.

Verificato a fuoco: bordo `1px solid oklch(0.708 0 none)`, `outline-style: none`,
nessuna ombra.

L'anello di fuoco d'accento resta su tutti gli altri controlli, che non hanno un
segnale proprio.

### Difetto corretto: bordo tagliato della sezione 2

La cromatura della colonna era uno strato sovrapposto a `-inset-px`, cioè 1px
fuori dal padding box, per disegnare il bordo dove lo disegna l'artboard. Ma la
colonna ha `overflow-hidden`, che ritaglia proprio lì: il bordo risultava
tagliato. Ora fondo, bordo e raggio stanno sulla colonna stessa e cambiano solo
valore (`color-mix` con `p`); il bordo di 1px è sempre presente e a `p = 0` è
trasparente, così il contenuto resta rientrato di 1px come negli artboard.

Due correzioni sono nate da questa verifica, entrambe dovute all'ambiente
Tailwind e non alla trascrizione, e sono in `theme.css`:

1. `button { line-height: normal }` — il preflight di Tailwind applica
   `font: inherit` ai controlli e con la scorciatoia `font` eredita anche il
   line-height 1.55 del body; gli artboard non hanno quel reset. Senza questa
   riga la tab "Oggi" misurava 30.9px contro 26 e trascinava giù tutta la
   colonna di 5px.
2. Regole delle scrollbar (sottili, invisibili fino all'hover) spostate da
   `tokens.css` a `theme.css`: sono regole di tutti gli artboard, e la pagina
   di anteprima non carica il CSS legacy.

## Scostamenti aperti

### 1. Il diff pixel non può chiudere sul colore, per scelta

Gli artboard rendono con la palette blu di Nocturne; l'app è neutra con accento
`blue-600`, per decisione esplicita. Quindi la verifica pixel vale su **geometria,
spaziature, tipografia e stati** — non sui valori di colore, che si confrontano contro
`theme.css`, non contro l'artboard.

Se in futuro si vuole un diff pixel pieno anche sul colore, va applicato ai 4 artboard
un `:root` con i token neutral + blue-600.

### 0. Dati di esempio allineati

Prima erano due elenchi separati, uno per la Small Inbox e uno per la board della
Full Inbox, e non coincidevano: 7 elementi contro 5. Con lo scorrimento la
sezione 2 è la stessa colonna dall'inizio alla fine, quindi card diverse
sarebbero cambiate sotto gli occhi a metà movimento. Ora c'è una lista sola
(`TASKS`) e le due colonne ne leggono lo stesso sottoinsieme via `unassignedOf`
e `pendingOf`. `CONTENT_TASKS` resta a sé: è l'ambito "Oggi" della sezione 3,
non l'inbox.

Nota: le card della sezione 2 restano a 13.5px per tutto il movimento, ed è
anche la misura giusta — a 13.5px l'altezza è 44.2px e "Aggiungi" cade a y=350,
cioè i valori dell'artboard. La versione precedente le portava a 13px nello
stato finale e sbagliava di 0.7px per card.

### 1-bis. La card minima non è autonoma in nessun canonico

`DEF_Card` (variante "card-minima") e la colonna "Nessun progetto" di
`DEF_Inbox max` ottengono entrambi la card minima importando **`Task Row`**,
che è fuori scope. `DEF_Inbox min` invece la disegna inline (`.sp-card`, con il
pallino di priorità che si apre in hover da 0 a 13px).

Decisione applicata: si usa quella di `DEF_Inbox min`, perché è dentro il set
canonico, è autonoma e rende le due schermate coerenti fra loro.

Conseguenza misurata: le card di "Nessun progetto" sono alte 43.5px contro
44.2px dell'artboard (−0.7px ciascuna), che sui cinque elementi sposta il
bottone "Aggiungi" da y=350 a y=346.7. Se serve la corrispondenza esatta, va
deciso se recuperare `Task Row` nel set canonico.

### 2. Schermate senza artboard canonico

Gantt, Calendario, Impostazioni, Task Composer, Filter Bar (vedi sopra).

### 3. Flussi

Gli artboard sono *stati*, non *transizioni*. Il grafo dei flussi vive in
`Rinascita.md` — `## Flussi (macchina a stati)` (righe 179-258) e `## Interfaccia`
(righe 260-337). Serve un inventario stato-per-stato in cui ogni voce è coperta da un
artboard o da una regola scritta.

## La UI vecchia è stata rimossa (2026-09-09)

L'app è ora la sola schermata a tre sezioni, a tutta finestra. Rimossi per
intero: `Sidebar`, `TaskComposer`, `TaskDetailModal`, `FilterBar`,
`KanbanBoard`, la vecchia `components/TaskRow`, tutte le `screens/`
(Oggi, Lista, Calendario, Gantt, Sorgenti, Impostazioni), `lib/format.js`,
`lib/composerSyntax.js`, `lib/projectsStore.js`, `lib/api.js` e
`styles/tokens.css`. Erano costruiti sul design vecchio e sul vecchio schema
del core: non c'era niente da riportare, e restano nella storia del repo.

Conseguenza utile: senza `lib/api.js` — che lanciava fuori da Electron — l'app
si apre anche nel browser. La pagina `preview.html` resta perché blocca la
schermata a 1180×760, la dimensione con cui si confronta con gli artboard.

**La geometria non è più ancorata a 1180×760.** `useInboxMorph` misura il quadro
con un `ResizeObserver` e ricava da lì le posizioni finali; restano fisse solo
le misure che vengono dagli artboard (padding 20/18, colonne a 63 dall'alto,
distanza 14, colonna "Da smistare" larga 300). Verificato: a 1180×760 i valori
sono identici all'artboard (origini 20,63 826×675 · colonna 860,63 300×675), e
a 1500×920 diventano 20,63 1146×835 e 1180,63 300×835 — cioè la stessa formula.

### Il core nuovo non esiste ancora

Le schermate girano su dati di esempio. Il core attuale ha il vecchio schema
(`status: inbox|active|completed|archived`, `priority: none|low|medium|high|urgent`,
il progetto come stringa); quello nuovo — `t_task`, `t_project`, `t_milestone`,
`t_state`, sotto-task — è descritto in `Rinascita.md` e non è mai stato scritto.

Collegare le schermate al core vecchio richiederebbe uno strato di mappatura
destinato a essere buttato con la migrazione. **Il prossimo passo è il core
nuovo**, poi l'innesto.

## Miglioramenti grafici da discutere

Non sono difetti: funzionano, ma si possono fare meglio. Da riprendere quando la
ricostruzione delle schermate è completa.

### G1. L'intestazione della sezione 2 durante lo scorrimento

**Stato attuale.** Nel movimento vista divisa ↔ Full Inbox la sezione 2 (inbox senza
progetto) cambia intestazione, perché ne cambia il significato: nella vista divisa è
*l'inbox* — titolo "Inbox" e campo "Aggiungi task" a tutta larghezza con ⌘K — mentre
nella Full Inbox è *una colonna fra le altre* e le serve la propria identità, il
pallino tratteggiato e il conteggio. Le due varianti si dissolvono l'una nell'altra
mentre lo spazio dell'intestazione si stringe da 91px a 40.9px.

**Cosa non convince.** Due cose, entrambe visibili a metà movimento:

1. La dissolvenza incrociata mostra per un tratto le due intestazioni **sovrapposte**,
   una sopra l'altra a mezza opacità. È leggibile ma torbido.
2. L'azione di aggiunta esiste in due forme diverse in due posti diversi — "Aggiungi
   task" a tutta larghezza nell'intestazione (vista divisa) e "Aggiungi" piccola in
   fondo alla lista (Full Inbox) — e le due si dissolvono a vicenda invece di essere
   la stessa cosa che si sposta.

**Direzione proposta.** Tenere **una sola** affordance di aggiunta che si sposta e si
ridimensiona lungo il movimento, invece di due che si sostituiscono. Per il titolo,
valutare se serve davvero cambiarlo o se basta che "Inbox" migri verso l'intestazione
di quadro (dove già compare a `p = 1`), lasciando alla sezione 2 solo pallino e
conteggio in entrambi gli stati.

**Da decidere prima di toccarlo.** Se nella vista divisa la sezione 2 può perdere il
titolo "Inbox": è l'unico posto dove quella colonna si dichiara, e togliendolo la
vista divisa resta senza un nome per la propria colonna principale.

---

## DEF_Task Detail — ricostruito (2026-09-10)

Il segnaposto è stato sostituito dal componente vero,
`renderer/src/components/TaskDetailModal.jsx`, trascritto dall'artboard
all'etag congelato (`1788962685594194`, verificato identico al momento della
trascrizione). Geometria misurata nell'app: scheda 640px, testata 52, corpo
435 scorrevole, piede 52.

Si apre da tre punti: le card della colonna Inbox (già così), le **righe della
vista Lista** (nuovo: `TaskRow` riceve `onOpen`, e il chip di stato ferma la
propagazione perché cambiare stato non deve anche aprire la scheda) e la
tastiera (Invio/Spazio sulla riga a fuoco).

### Corrispondenze fra artboard e core

L'artboard usa nomi propri, che non sono quelli dello schema:

| artboard | core |
|---|---|
| `notes` (descrizione grande) | `t_task.description` |
| `note` (nota interna) | `t_task.notes` |
| `list` (chip dopo il "/") | `t_milestone` |
| `status` | `t_state`, configurabile |

### Scostamenti di questo artboard

1. **Priorità: cinque, non quattro.** L'artboard fissa Alta/Media/Bassa/Nessuna;
   il core ha anche `urgent`. Il menu le legge da `PRIORITIES`, quindi la voce in
   più c'è. È lo stesso scostamento già annotato per il colore di `urgent`.
2. **Stati: configurabili, non tre.** L'artboard mostra Da fare/In corso/Fatto.
   Il chip legge `t_state` e si colora **per ruolo** (partenza neutra, intermedio
   con l'accento, chiusura spenta a contorno), come `TaskRow` e per la stessa
   ragione. Conseguenza visibile: sul database attuale, migrato dal vecchio
   schema, esistono solo `Da fare` e `Fatto` — un database nuovo ne ha cinque.
3. **"Archivia" e "Sposta in Output" sono stati, non azioni proprie** — e le
   voci ci sono sempre (rivisto il 2026-09-10). Prima erano condizionali
   all'esistenza di uno stato con quel nome, e su un database migrato dal
   vecchio schema — che ha solo `Da fare` e `Fatto` — il menu restava con la
   sola "Elimina": sembravano mancanti. Ora:
   - **Archivia** è spenta se non esiste uno stato `Archiviato`, con la
     ragione accanto ("nessuno stato"). Su un database nuovo, che ne ha
     cinque, è attiva.
   - **Sposta in Output** è spenta sempre, per decisione: la migrazione verso
     le destinazioni esterne non è implementata (vedi `SPECIFICA_PRODOTTO.md`,
     punto 4 — solo collegamento, nessuna sincronizzazione). Il core espone
     già `migrateTask`, quindi è un'attivazione, non un lavoro da zero.
4. **Attività unisce due sorgenti.** L'artboard mostra un elenco unico con
   avatar `AI`/`GR`. Qui sono lo storico della macchina a stati
   (`t_task_history`, tradotto in frasi dalla vista) più le note scritte a mano
   (`t_task_comment`), uniti solo a schermo e ordinati dal più recente. Non
   esistendo utenti a schema, l'avatar è `IO` per le note e un pallino per le
   voci di sistema: **gli avatar dell'artboard non sono riproducibili** finché
   non c'è un'identità nel modello.
5. **Discord non ha un glifo negli artboard**: la pillola d'origine mostra la
   sola etichetta. Non è stata inventata un'icona, perché non sarebbe
   verificabile col diff.
6. **Allegati: sezione non attiva.** È l'unica parte dell'artboard senza un dato
   dietro. `t_attachment` esiste a schema (`fileName`, `filePath`, `mimeType`,
   `sizeBytes`) ma il core non la espone, e **prima di esporla va deciso dove
   vivono i file**: copiati in `userData` (l'app diventa proprietaria, il
   database resta coerente da solo) o referenziati dove stanno (nessuna copia,
   ma un file spostato rompe il riferimento). Fino a quella decisione la scheda
   lo dichiara, invece di offrire un "Aggiungi" che non aggiunge.
7. **Promemoria: i preset dipendono dalla scadenza.** "Alla scadenza", "1 ora
   prima", "Il giorno prima" non hanno un istante a cui riferirsi se `dueAt` è
   vuoto: in quel caso restano spenti e resta la data personalizzata. L'artboard
   non affronta il caso.

### 8. Il piede è stato ridisposto (2026-09-10)

L'artboard tiene il promemoria a sinistra e il menu dello stato all'estremità
destra, con niente in mezzo. Su richiesta, ora **promemoria e stato stanno
insieme a sinistra** — sono le due cose che dicono "quando" e "a che punto" sta
il task, e da vicino si leggono come un gruppo — e la destra porta le due azioni
di chiusura della scheda, **Annulla** e **Salva**. Il menu dello stato si apre
di conseguenza allineato a sinistra e non a destra, altrimenti uscirebbe verso
il centro della scheda.

**Deciso (2026-09-10): un solo pulsante, "Chiudi".** La coppia
Annulla/Salva è durata un giro. Questa scheda scrive subito, campo per campo —
è così nell'artboard, dove titolo, descrizione e nota hanno ciascuno la propria
conferma e i chip scrivono all'istante. Senza una bozza da scartare, "Annulla"
prometteva un ritorno indietro che non esisteva e "Salva" un salvataggio già
avvenuto: due pulsanti che facevano la stessa cosa con due nomi sbagliati.

Scartata quindi l'alternativa — convertire la scheda a modifica tamponata — e
vale la pena dire perché, se dovesse tornare la tentazione: sotto-task, tag e
note non sono campi del task, sono righe di altre tabelle. Tamponarli
richiederebbe una transazione lunga lato interfaccia, quindi resterebbero a
scrittura immediata comunque, e Salva/Annulla governerebbero solo una parte
della scheda — la peggiore delle due coerenze.

Resta invece la coppia **Salva/Annulla dell'editor della descrizione**, che
viene dall'artboard: lì una bozza c'è per davvero (`bozzaDescrizione`), e i due
pulsanti fanno due cose diverse.

### Aggiunte al core rese necessarie

Tag e commenti erano tabelle senza operazioni. Aggiunte a `task-core.js` con
test: `listTags`, `listTaskTags`, `addTaskTag`, `removeTaskTag`,
`listTaskComments`, `addTaskComment`, `removeTaskComment`. I tag sono un
vocabolario condiviso (`t_tag` UNIQUE + `t_task_tag`), non una stringa per task:
due task che scrivono "urgente" puntano alla stessa riga, ed è ciò che rende
possibile filtrare per tag più avanti.

---

## Viste bloccate (2026-09-10)

`Kanban`, `Calendario` e `Gantt` sono **spente** nel selettore della vista:
l'elenco `VIEW_BLOCKED` in `renderer/src/inbox/data.js` le disattiva, con la
ragione accanto alla voce ("non attiva"). Resta solo `Lista`.

Le voci non sono state rimosse dal menu, e non è un dettaglio: il selettore
dichiara quali viste il prodotto avrà, e una voce spenta lo dice meglio di un
elenco corto — chi apre il menu vede che Kanban esiste e non è pronta, invece di
chiedersi se sia mai stata prevista. Il codice delle tre viste resta al suo posto
in `ContentPane`: sbloccarne una vuol dire togliere una stringa da
`VIEW_BLOCKED`, non riscrivere la vista.

Perché sono bloccate: il Kanban ha il padding delle card da correggere e le
colonne larghe 220px fisse, che con molti progetti producono un tabellone da
migliaia di pixel (vedi `TODO.md`); Calendario e Gantt sono impianti presi dagli
artboard e non ancora verificati sui dati reali.

---

## Il campo di rinomina delle card è una textarea — in prova (2026-09-10)

Negli artboard la rinomina in linea è un `<input>`. Nel codice è diventata una
`<textarea>`: `TitleInput` in `InboxCard.jsx`, condiviso dalle card dell'Inbox
e dalle card origine.

**Perché.** La card mostra il titolo su più righe. Con un `input` il testo
cambiava forma nell'istante in cui si entrava in modifica — da blocco su tre
righe a una riga sola che scorre in orizzontale — e di un titolo lungo si
vedeva solo la coda, cioè proprio la parte che non serve per riconoscerlo.
Con la textarea il testo resta dov'era: misurato, il campo è alto **132px
esattamente quanto lo span che sostituisce**, e la card non cambia altezza
entrando in modifica (154px prima e durante).

**Cosa si porta dietro**, e va tenuto presente se si tocca:

1. **L'altezza non si adatta da sé.** Si rimisura a ogni battuta su
   `scrollHeight`, con `overflow-hidden` perché il blocco cresca invece di
   scorrere internamente. Ai bordi va aggiunto lo spessore a mano
   (`offsetHeight - clientHeight`): il campo è in `box-border`, quindi
   l'altezza scritta comprende i bordi mentre `scrollHeight` misura il solo
   contenuto — assegnare `scrollHeight` liscio lascia il campo 2px corto e
   l'ultima riga tagliata. Difetto trovato in prova e corretto.
2. **Invio non deve scrivere un capo riga.** `t_task.title` è una riga sola:
   Invio conferma, come nell'`input` di prima. Un titolo su più righe non è
   rappresentabile nel modello, quindi non si può nemmeno inserire per sbaglio.
3. **`overflow-wrap: anywhere`**, per lo stesso motivo del titolo a schermo: un
   titolo scritto tutto attaccato altrimenti sborda in orizzontale.

Misurato in prova: una riga 22px (card 44, identica al riposo), tre righe 95px
(card 117), rientro a 22px accorciando il testo, nessuno scorrimento interno in
nessuno dei casi, Esc torna allo span e la card torna a 44.

**Resta un'incoerenza dichiarata:** il titolo nel dettaglio del task
(`TaskDetailModal`) è ancora un `<input>`. Se la prova si conferma va allineato
anche quello; se si torna indietro, non c'è niente da fare.

---

## Trascinamento fra colonna Inbox e pannello contenuto (2026-09-10)

Meccanismo nuovo, non presente negli artboard: si trascina una card dalla
colonna del triage a un gruppo della vista Lista, e una riga dalla vista Lista
alla colonna. Il clone cambia larghezza attraversando il confine — card 236px a
sinistra, riga 926px a destra, misurati — che è il segnale che il rilascio è
valido oltre a essere la forma giusta: una card è un oggetto autonomo, una row
un elemento di un elenco.

### Il pannello di destra non è un contenitore

È il risultato di una query: filtrata, ordinata, raggruppata. Quindi il gesto
non è "spostare un oggetto" ma **assegnare l'attributo che il bersaglio
rappresenta**, e il bersaglio non è il pannello: è il **gruppo**. Da cui le
scelte:

- **Solo il raggruppamento per progetto** accetta il rilascio, per ora. È il
  solo in cui il gruppo identifica un valore assegnabile senza ambiguità (Stato
  e Priorità lo sarebbero, Scadenza solo in parte, "Nessuno" per niente).
- **Quali gruppi siano bersagli lo dichiara il DOM**, non il motore:
  `data-drop-group` viene messo solo dove il rilascio ha significato. Un
  raggruppamento non assegnabile non produce bersagli, e il rilascio è rifiutato
  da sé — senza un elenco di casi da tenere aggiornato in `dragKit`.
- **I gruppi hanno la precedenza sulle colonne** nella ricerca del bersaglio:
  stanno dentro il pannello, che sta dentro la board, quindi cercando le colonne
  per prime un rilascio su un gruppo verrebbe letto come rilascio sulla colonna
  che lo contiene.

### Cosa scrive il rilascio

| Direzione | Effetto |
|---|---|
| Card → gruppo progetto | assegna quel progetto **e** toglie dal triage (`isInbox = 0`) |
| Card → gruppo "Senza progetto" | progetto a `null` **e** toglie dal triage: "deciso che non ha progetto" non è "non ancora guardato" |
| Riga → colonna Inbox | rimette in triage (`isInbox = 1`) e **non tocca nient'altro**: progetto e date restano |

Il trascinamento verso destra *è* lo smistamento, perché è un gesto mirato e
deliberato: chi lo fa ha deciso dove va quel task.

### Difetto trovato in prova, e vale la pena ricordarlo

`onDrop` prendeva lo stato del task dalla lista **ottimistica** — quella in cui
l'anteprima aveva già scritto il risultato del rilascio per farlo vedere durante
il movimento. I controlli "il progetto è diverso?" e "è in triage?" trovavano
quindi il lavoro apparentemente già fatto, rispondevano no, e **non scrivevano
niente**: il gesto sembrava funzionare e non produceva nulla. Le decisioni si
prendono su `alia.tasks` (lo stato vero); la lista ottimistica serve solo a
ricavare l'ordine.

### Difetto grave, corretto subito dopo: trascinando una riga si muoveva tutto

Appena si iniziava a trascinare una riga del pannello, **tutte** le altre righe
partivano in ogni direzione. Due errori sovrapposti, entrambi introdotti con
questo meccanismo:

1. **Il FLIP prendeva tutta la board.** Le righe hanno ricevuto `data-task`
   perché serve al trascinamento, ed è lo stesso attributo con cui `useFlip`
   fotografa gli elementi da animare: da quel momento le quaranta righe della
   lista erano tutte candidate all'animazione. Ora il FLIP è ristretto alla
   colonna del triage (`flipRef`), che è il solo posto dove il riordino esiste
   per davvero, ed è lì che l'animazione serve.
2. **L'anteprima ri-impaginava il pannello a ogni pixel.** Il riordino
   ottimistico rimescola l'array dei task, e il pannello lo rende: ogni
   movimento del puntatore rifaceva l'impaginazione di tutti i gruppi. Ora
   `patchPerBersaglio` può restituire `null` — "nessuna anteprima" — e lo fa
   per i gruppi quando l'ordinamento è calcolato: lì un'anteprima non direbbe
   nemmeno il vero, perché l'ordinamento rimette il task dove vuole lui. Con
   l'ordine manuale l'anteprima resta, perché la posizione conta.

Verificato: 0 righe estranee spostate a ogni passo del trascinamento, entrambi
i versi del gesto ancora funzionanti, e il riordino dentro la colonna intatto
con la sua animazione.

### Scostamento consapevole: la posizione

Il rilascio scrive anche la **posizione** dentro il gruppo, su richiesta
esplicita. Va saputo che si vede solo con l'ordinamento **Manuale**: con
Scadenza, Priorità o Titolo la posizione viene scritta e conservata, ma il task
salta subito dove lo mette l'ordinamento, e il rilascio sembra non aver
posizionato niente. Se dà fastidio, le strade sono due — passare
automaticamente a "Manuale" al primo rilascio posizionale, oppure scrivere la
posizione solo quando l'ordinamento è Manuale.
