# ToDo — Alia

> Documento di raccolta. Nessun punto è ancora stato sviluppato.

# BUG — Incongruenze grafiche

## Sidebar

- [ ] **Allineamento del `+`** — il pulsante `+` per aggiungere un progetto è più rientrante rispetto ai numeri dei progetti sottostanti. Da allineare.
- [ ] **Cancellazione progetto** — il flusso attuale (doppia pressione per confermare) non è chiaro. Da sostituire con un **confirm component** dedicato, da disegnare dentro Claude Design.

## Tutti i task

### Griglia (tabella)

- [ ] **Colonna "Stato" mostra "Inbox"** — non deve succedere. Ogni task deve essere creato con lo **stato di apertura** corrispondente.
- [ ] **Stato di chiusura unico** — può esistere **un solo** stato di chiusura. Da implementare.
- [ ] **Allineamenti in tabella** — la scritta non è allineata al tag dello stato. Ipotesi da valutare:
  - testo al centro e label dello stato che riempie la colonna della tabella;
  - oppure: testi allineati a **sinistra** nella cella, mentre il contenuto tipo label di stato **riempie tutta la colonna**; il titolo allineato a sinistra.
  - Servono **alternative di design** da mostrare prima di implementare.
- [ ] **Intestazione "Task"** — la scritta non convince, da rivedere.
- [ ] **Padding verticale** — il padding Y non sembra uniforme tra le righe/celle. Da verificare e uniformare.
- [ ] In generale: **revisione complessiva della tabella**.

### Filtro

- [ ] **Menu "Progetto"** — non pesca dai progetti della sidebar. Da indagare: i progetti sono su database? Allineare la sorgente dati.

### Kanban

- [ ] **Padding delle card** — le card dentro il kanban hanno più padding-bottom. Indagare la causa e correggere.

---

# ToDo

- [ ] **Inbox** — ragionare sulla pagina Inbox e sulla vista flottante di Inbox.
