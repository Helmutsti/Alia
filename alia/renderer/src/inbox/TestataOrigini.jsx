import { useEffect, useRef, useState } from "react";

import { FrecciaCircolare, MailBox } from "../components/icons.jsx";

/* La testata della colonna "Origini da confermare", con dentro il comando che
   riaffaccia la finestra.

   ── Perché il comando sta qui e non in fondo ───────────────────────────────

   Prima era un bottone largo in fondo alla colonna, e sbagliava due volte:
   pesava come se fosse il gesto principale della schermata — che invece è
   decidere le origini, non andarle a guardare — e stava lontano dal numero che
   è la sua unica risposta. Il conteggio dice *quante ne restano*; riaffacciarsi
   serve a cambiare quel numero. Le due cose stanno sulla stessa riga perché
   sono la stessa conversazione.

   Una freccia circolare e non una parola: è il glifo che in ogni casella di
   posta significa "vai a vedere", non ha bisogno di essere letto, e in una
   testata larga 250px una frase sarebbe tutto lo spazio che c'è. Il testo vive
   nel `title` e in `aria-label`, dove serve a chi ne ha bisogno.

   ── Riaffacciarsi non costa niente, ed è importante che si veda ────────────

   L'area origini è una finestra sul servizio, non un magazzino: premere due
   volte rilegge le stesse righe e non produce nessun effetto. Per questo il
   comando non chiede conferma, non si spegne dopo l'uso e non ha uno stato
   "già fatto" — sarebbero tutte cautele per un gesto che non ne ha bisogno.

   ── L'errore resta, e resta grande ─────────────────────────────────────────

   Il comando si è ristretto; il fallimento no. La confluenza è facoltativa e
   può non rispondere — non configurata, spenta, irraggiungibile, token
   cambiato — e nessuno di quei casi è un guasto di Alia da nascondere. Quindi
   sotto la testata compare la frase per esteso, con "Riprova" accanto. Un'icona
   che diventa rossa e basta direbbe che qualcosa non va senza dire cosa, che è
   il modo peggiore di dirlo.

   E la colonna vuota, in quel caso, **non è uno zero**: è una finestra chiusa.
   Senza la frase sarebbe indistinguibile da "non è arrivato niente". */

const RIGA = "flex items-center gap-2 pt-3 pb-2 shrink-0 cursor-grab touch-none";

/* Quanto resta in scena il "Niente di nuovo". Quattro secondi: il tempo di
   leggerlo, non abbastanza da restare lì come se fosse uno stato della colonna.

   Sparisce da solo perché è una **risposta a un gesto**, non una condizione:
   vale finché è fresca, e un minuto dopo sarebbe una frase vecchia appesa sopra
   l'elenco. L'errore invece resta: quello è una condizione, e finché non si
   riprova è ancora vera. */
const RESPIRO = 4000;

const COMANDO =
  "grid place-items-center w-[22px] h-[22px] p-0 shrink-0 rounded-md border-0 bg-transparent " +
  "cursor-pointer text-content/45 hover:text-accent " +
  "hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] " +
  "transition-colors duration-[120ms]";

export function TestataOrigini({ quante, stato, errore, onRicarica }) {
  const [vuoto, setVuoto] = useState(false);
  const timer = useRef(null);
  const primaQuante = useRef(quante);

  useEffect(() => () => clearTimeout(timer.current), []);

  const inCorso = stato === "in-corso";

  const ricarica = async () => {
    clearTimeout(timer.current);
    setVuoto(false);
    primaQuante.current = quante;
    const risposta = await onRicarica();
    /* "Niente di nuovo" si dice solo se davvero non è cambiato niente **ed era
       già vuoto**: con origini in attesa il silenzio è corretto, perché sono
       loro il messaggio. */
    if (risposta?.esito === "riuscito" && (risposta.daProcessare ?? 0) === 0) {
      setVuoto(true);
      timer.current = setTimeout(() => setVuoto(false), RESPIRO);
    }
  };

  return (
    <div className="shrink-0">
      <div className={RIGA}>
        <MailBox size={13} className="text-accent" />
        <span className="font-medium text-card text-accent">Origini da confermare</span>
        <button
          type="button"
          /* Il pointerdown non deve arrivare alla testata, che è la maniglia
             con cui si trascina la colonna: senza questo, premere il comando
             inizierebbe un trascinamento invece di un click. */
          onPointerDown={(e) => e.stopPropagation()}
          onClick={ricarica}
          disabled={inCorso}
          title="Controlla aggiornamenti"
          aria-label="Controlla aggiornamenti"
          className={
            COMANDO + (inCorso ? " cursor-progress text-accent" : "") + (errore ? " !text-danger" : "")
          }
        >
          {/* Gira mentre guarda: è la stessa freccia, e il movimento dice "sto
              andando a vedere" senza aggiungere un secondo glifo. */}
          <FrecciaCircolare size={13} className={inCorso ? "animate-spin" : undefined} />
        </button>
        {/* Il numero è l'arretrato, non le novità: scende solo decidendo. */}
        <span className="ml-auto text-mini text-content/55">{quante}</span>
      </div>

      {errore ? (
        <div className="flex flex-col items-start gap-1 pb-2">
          <p className="m-0 text-[11.5px] leading-[1.45] text-danger [overflow-wrap:anywhere]">{errore}</p>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={ricarica}
            className="p-0 border-0 bg-transparent cursor-pointer text-[11.5px] font-medium text-danger underline underline-offset-2"
          >
            Riprova
          </button>
        </div>
      ) : null}

      {vuoto && !errore ? (
        <p className="origini-respiro m-0 pb-2 text-[11px] text-content/45">Niente di nuovo.</p>
      ) : null}
    </div>
  );
}
