/* Icone degli artboard.

   Regola: si usa Lucide **solo** dove il path è identico a quello disegnato
   nell'artboard; altrimenti si trascrive il path, o il diff pixel non chiude.
   Verificato glifo per glifo su DEF_Card, DEF_Inbox min e DEF_Inbox max:

     identici a Lucide → Check, Plus, Paperclip
     diversi           → lente (r=7 contro r=8), freccia indietro, chevron
                         doppio, mail, cestino, matita, bandierina priorità,
                         righe sotto-task e note, icone delle viste

   Negli artboard le icone sono rese a 11/12/13/14px, non a 24: passare sempre
   `size` esplicita, mai scalare via CSS. */

const stroke = (w = 2) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: w,
  strokeLinecap: "round",
});

function Glyph({ size, sw = 2, join, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      {...stroke(sw)}
      {...(join ? { strokeLinejoin: "round" } : null)}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* — glifi di DEF_Card — */

/* Bandierina priorità: fill e stroke sono lo stesso colore, sw 1.5. */
export function PriorityFlag({ size = 11, color = "currentColor", ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke={color}
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d="M5 3v18" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </svg>
  );
}

export const Subtasks = (p) => (
  <Glyph size={11} {...p}>
    <path d="M4 7h16M4 12h10M4 17h7" />
  </Glyph>
);

export const NoteLines = (p) => (
  <Glyph size={11} {...p}>
    <path d="M5 5h14M5 10h14M5 15h9" />
  </Glyph>
);

export const Alarm = (p) => (
  <Glyph size={11} {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 10v3.5l2.5 1.5" />
    <path d="M5.6 3.2L3.2 5.6M18.4 3.2L20.8 5.6" />
  </Glyph>
);

/* — glifi dell'Inbox — */

/* Identico a Lucide `Check`, ma tenuto qui perché l'artboard lo rende a
   spessori diversi a seconda del punto (2.4 nei menu e nel bottone conferma,
   4 dentro il pallino della card). */
export const Check = ({ size = 13, sw = 2.4, ...p }) => (
  <Glyph size={size} sw={sw} join {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Glyph>
);

/* Identico a Lucide `Plus`. */
export const Plus = ({ size = 13, ...p }) => (
  <Glyph size={size} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);

/* Lucide `Search` usa r=8: questa r=7. */
export const Search = ({ size = 13, ...p }) => (
  <Glyph size={size} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Glyph>
);

export const ChevronDown = ({ size = 11, ...p }) => (
  <Glyph size={size} sw={2.4} join {...p}>
    <path d="M6 9l6 6 6-6" />
  </Glyph>
);

/* Badge "Rilascia per Full Inbox": doppio chevron, sw 2.6. */
export const ChevronsRight = ({ size = 11, ...p }) => (
  <Glyph size={size} sw={2.6} join {...p}>
    <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
  </Glyph>
);

/* Bottone "Torna alla vista divisa". */
export const ArrowLeft = ({ size = 14, ...p }) => (
  <Glyph size={size} join {...p}>
    <path d="M11 17l-5-5 5-5M18 12H6" />
  </Glyph>
);

/* Testata della colonna "Origini da confermare". */
export const MailBox = ({ size = 13, ...p }) => (
  <Glyph size={size} join {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </Glyph>
);

export const Trash = ({ size = 11, ...p }) => (
  <Glyph size={size} join {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Glyph>
);

export const Pencil = ({ size = 11, ...p }) => (
  <Glyph size={size} join {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
  </Glyph>
);

export const Layers = ({ size = 13, ...p }) => (
  <Glyph size={size} sw={1.9} join {...p}>
    <path d="M12 3l9 5-9 5-9-5 9-5zM3 14l9 5 9-5" />
  </Glyph>
);

/* — chrome d'applicazione — */

/* Ingranaggio delle impostazioni: il glifo `settings` di Lucide, quello vero,
   corona a otto denti e mozzo al centro.

   **Non viene da un artboard**: `DEF_Impostazioni` non è ancora trascritto e
   `Impostazioni.dc.html` è un'esplorazione precedente (vedi Rinascita.md,
   § Interfaccia). Da
   verificare quando l'artboard arriva.

   Un primo tentativo aveva sostituito i denti con una ghiera e quattro tacche,
   temendo che a 15px la corona si impastasse. Sbagliato due volte: si impastava
   comunque, e soprattutto senza denti quel disegno non era più un ingranaggio —
   leggeva come un otturatore. I denti sono ciò che rende l'icona riconoscibile,
   quindi restano, e il tratto scende a 1.6 per far respirare gli intagli. */
export const Gear = ({ size = 15, ...p }) => (
  <Glyph size={size} sw={1.6} join {...p}>
    <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Glyph>
);

/* — glifi di DEF_Impostazioni —
   Trascritti dall'artboard: sono resi a 15px con `stroke-width` 1.8, che è la
   coppia con cui li disegna. La maniglia di riordino fa eccezione: non è un
   glifo a tratto ma sei cerchi pieni in un riquadro 10×14, e resta tale. */

export const Bell = ({ size = 15, ...p }) => (
  <Glyph size={size} sw={1.8} {...p}>
    <path d="M18 8a6 6 0 10-12 0c0 3.5-1.2 5.3-2 6.5h16c-.8-1.2-2-3-2-6.5z" />
    <path d="M10.5 19a1.7 1.7 0 003 0" />
  </Glyph>
);

export const Sorgenti = ({ size = 15, ...p }) => (
  <Glyph size={size} sw={1.8} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 4v5" />
  </Glyph>
);

export const Tastiera = ({ size = 15, ...p }) => (
  <Glyph size={size} sw={1.8} {...p}>
    <rect x="4" y="8" width="16" height="8" rx="1.5" />
    <path d="M7.5 12h.01M10.5 12h.01M13.5 12h.01M16.5 12h.01" />
  </Glyph>
);

export const Flusso = ({ size = 15, ...p }) => (
  <Glyph size={size} sw={1.8} {...p}>
    <circle cx="8" cy="7" r="2.3" />
    <circle cx="8" cy="17" r="2.3" />
    <path d="M8 9.5v5" />
    <path d="M14 7h6M14 17h6" />
  </Glyph>
);

/* Voce "Progetti" della navigazione. Una cartella, alla stessa misura e con lo
   stesso tratto degli altri quattro glifi della barra. */
export const Cartella = ({ size = 15, ...p }) => (
  <Glyph size={size} sw={1.8} join {...p}>
    <path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  </Glyph>
);

export const ManigliaRiordino = ({ ...p }) => (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true" {...p}>
    <circle cx="3" cy="3" r="1" />
    <circle cx="7" cy="3" r="1" />
    <circle cx="3" cy="7" r="1" />
    <circle cx="7" cy="7" r="1" />
    <circle cx="3" cy="11" r="1" />
    <circle cx="7" cy="11" r="1" />
  </svg>
);

/* — glifi di DEF_Task Composer —
   Le cinque chip della barra: scadenza, priorita, promemoria, progetto, tag.
   Trascritti dall'artboard, resi a 13px con tratto 2. `Alarm` del promemoria
   c'e' gia da DEF_Card ed e' lo stesso disegno: non si duplica. */

export const Calendario = ({ size = 13, ...p }) => (
  <Glyph size={size} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 11h18" />
  </Glyph>
);

export const Bandierina = ({ size = 13, ...p }) => (
  <Glyph size={size} {...p}>
    <path d="M5 21V4h9l-1 3 1 3H5" />
  </Glyph>
);

export const Etichette = ({ size = 13, ...p }) => (
  <Glyph size={size} {...p}>
    <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />
  </Glyph>
);

/* Passaggio da inserimento rapido a completo: due frecce che divaricano. Non
   una lente e non una matita — non si sta guardando ne correggendo, si sta
   aprendo la stessa cosa piu' in grande. */
export const Espandi = ({ size = 12, ...p }) => (
  <Glyph size={size} sw={2} join {...p}>
    <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
  </Glyph>
);

/* Icone a path variabile: viste (Lista/Kanban/Calendario/Gantt) e sorgenti
   esterne (Mail/Discord/Telegram). I path stanno in inbox/data.js, presi
   dagli artboard. */
export const PathIcon = ({ d, size = 14, sw = 1.9, ...p }) => (
  <Glyph size={size} sw={sw} join {...p}>
    <path d={d} />
  </Glyph>
);

/* — glifi di DEF_Task Detail — */

/* La croce: nell'artboard compare a tre spessori (1.9 nel chiudi della
   testata, 2 nel rimuovi sotto-task, 2.6 nella x minuscola dei tag), quindi
   `sw` va passato dal punto d'uso e non ha un default utile. */
export const Close = ({ size = 14, sw = 1.9, ...p }) => (
  <Glyph size={size} sw={sw} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Glyph>
);

/* Aeroplanino dell'invio nota. */
export const Send = ({ size = 15, ...p }) => (
  <Glyph size={size} sw={1.8} join {...p}>
    <path d="M21.5 2.5L2.8 9.6c-.7.3-.7 1.2 0 1.5l7.1 2.7c.2.1.4.3.5.5l2.7 7.1c.3.7 1.2.7 1.5 0z" />
    <path d="M10.4 13.6l5.6-5.6" />
  </Glyph>
);

/* I tre puntini del menu azioni: tre cerchi pieni, non un glifo di testo. */
export const MoreDots = ({ size = 15, ...p }) => (
  <Glyph size={size} {...p}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Glyph>
);

/* Freccia circolare: "controlla se c'e' qualcosa di nuovo". Un arco di tre
   quarti con la punta, non un cerchio chiuso — un cerchio chiuso non ha verso,
   e il verso e' l'unica cosa che distingue "aggiorna" da "in caricamento".
   Il quarto mancante in alto a destra e' dove sta la freccia, cosi' il glifo
   resta leggibile a 12px dove un anello completo diventerebbe una macchia. */
export const FrecciaCircolare = ({ size = 12, ...p }) => (
  <Glyph size={size} sw={2.2} join {...p}>
    <path d="M20 11a8 8 0 10-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Glyph>
);
