import { useState } from "react";

import { useAlia } from "./AliaProvider.jsx";

/* Le tre cose che il core può rimandare indietro invece di applicare.

   Esistono perché la macchina a stati ha due punti in cui la specifica vuole
   una scelta umana, e un trigger SQL non può fermarsi ad aspettarla:
     · chiudere un padre i cui figli sono già chiusi su un altro stato
     · riaprire un figlio quando il padre chiuso va riaperto anche lui
   Più un terzo caso che non è una domanda ma un rifiuto: la migrazione con
   sotto-task ancora aperti.

   Finché uno di questi dialoghi è aperto non è stato scritto niente: la
   transazione è già stata annullata, e la conferma rigioca l'operazione da
   capo. */

const VELO =
  "absolute inset-0 z-[95] flex items-center justify-center p-7 " +
  "bg-[color-mix(in_srgb,#000_52%,transparent)] backdrop-blur-[7px]";
const RIQUADRO = "w-[440px] max-w-full rounded-[14px] bg-surface shadow-elev-lg p-5 flex flex-col gap-3";
const BTN =
  "h-8 px-3 rounded-lg border border-divider bg-transparent cursor-pointer text-[12.5px] " +
  "text-content hover:border-accent";
const BTN_PRIM = "h-8 px-3 rounded-lg border-0 bg-accent text-bg cursor-pointer text-[12.5px] font-medium";

function Titolo({ children }) {
  return <h4 className="m-0 text-base font-medium tracking-[-0.01em]">{children}</h4>;
}

function Elenco({ tasks }) {
  return (
    <ul className="m-0 pl-4 flex flex-col gap-1 max-h-40 overflow-y-auto">
      {tasks.map((t) => (
        <li key={t.idTask} className="text-meta text-content/70">
          {t.title}
        </li>
      ))}
    </ul>
  );
}

/* Caso 1 — i figli già chiusi. La scelta è fra sovrascriverli con lo stato del
   padre o lasciarli dove sono; entrambe le risposte procedono, quindi sono due
   pulsanti di conferma e non un sì/annulla. */
function FigliGiaChiusi({ richiesta, rispondi, annulla }) {
  return (
    <div className={RIQUADRO}>
      <Titolo>Alcuni sotto-task sono già chiusi</Titolo>
      <p className="m-0 text-meta text-content/70">
        Chiudendo questa task, i sotto-task ancora aperti la seguono. Questi invece sono già chiusi su
        un altro stato:
      </p>
      <Elenco tasks={richiesta.tasks} />
      <div className="flex gap-2 justify-end mt-1">
        <button type="button" className={BTN} onClick={annulla}>
          Annulla
        </button>
        <button
          type="button"
          className={BTN}
          onClick={() => rispondi({ sovrascriviFigliChiusi: false })}
        >
          Lasciali come sono
        </button>
        <button
          type="button"
          className={BTN_PRIM}
          onClick={() => rispondi({ sovrascriviFigliChiusi: true })}
        >
          Sovrascrivili
        </button>
      </div>
    </div>
  );
}

/* Caso 2 — la riapertura. Il core non sceglie lo stato di destinazione: lo
   chiede, uno per ogni antenato da riaprire. */
function StatoRiapertura({ richiesta, rispondi, annulla }) {
  const predefinito = richiesta.statiAmmessi[0]?.idState;
  const [scelte, setScelte] = useState(() =>
    Object.fromEntries(richiesta.tasks.map((t) => [t.idTask, predefinito])),
  );

  const completo = richiesta.tasks.every((t) => scelte[t.idTask] != null);

  return (
    <div className={RIQUADRO}>
      <Titolo>Riaprire anche le task che le contengono</Titolo>
      <p className="m-0 text-meta text-content/70">
        Riaprendo questa task non è più vero che tutti i sotto-task sono chiusi. Scegli su quale stato
        riportare {richiesta.tasks.length === 1 ? "la task padre" : "le task padre"}:
      </p>
      <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
        {richiesta.tasks.map((t) => (
          <label key={t.idTask} className="flex items-center gap-2 text-meta">
            <span className="flex-1 min-w-0 truncate text-content/80">{t.title}</span>
            <select
              value={scelte[t.idTask] ?? ""}
              onChange={(e) => setScelte((s) => ({ ...s, [t.idTask]: Number(e.target.value) }))}
              className="h-8 px-2 rounded-lg border border-divider bg-elevated text-content text-[12.5px]"
            >
              {richiesta.statiAmmessi.map((s) => (
                <option key={s.idState} value={s.idState}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end mt-1">
        <button type="button" className={BTN} onClick={annulla}>
          Annulla
        </button>
        <button
          type="button"
          className={BTN_PRIM}
          disabled={!completo}
          onClick={() => rispondi({ statiRiapertura: scelte })}
        >
          Riapri
        </button>
      </div>
    </div>
  );
}

/* Caso 3 — cancellare uno stato che dei task stanno usando.

   Non è un rifiuto ma una domanda, perché una risposta esiste: dove spostarli.
   Il core si ferma prima di scrivere e torna con l'elenco delle destinazioni;
   qui si sceglie, e la stessa chiamata riparte con la decisione dentro. */
function StatoInUso({ richiesta, rispondi, annulla }) {
  const [destinazione, setDestinazione] = useState(richiesta.destinazioni[0]?.idState);
  const quanti = richiesta.tasks;

  return (
    <div className={RIQUADRO}>
      <Titolo>Lo stato «{richiesta.label}» è in uso</Titolo>
      <p className="m-0 text-meta text-content/70">
        {quanti === 1 ? "Una task si trova" : `${quanti} task si trovano`} su questo stato. Cancellandolo
        {quanti === 1 ? " va" : " vanno"} spostat{quanti === 1 ? "a" : "e"} altrove: scegli dove.
      </p>
      <select
        value={destinazione ?? ""}
        onChange={(e) => setDestinazione(Number(e.target.value))}
        className="h-8 px-2 rounded-lg border border-divider bg-elevated text-content text-[12.5px]"
      >
        {richiesta.destinazioni.map((d) => (
          <option key={d.idState} value={d.idState}>
            {d.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2 justify-end mt-1">
        <button type="button" className={BTN} onClick={annulla}>
          Annulla
        </button>
        <button
          type="button"
          className={BTN_PRIM}
          disabled={destinazione == null}
          onClick={() => rispondi({ idStateDestinazione: destinazione })}
        >
          Sposta e cancella
        </button>
      </div>
    </div>
  );
}

/* Caso 4 — cancellare un progetto che ha delle task dentro.

   Come lo stato in uso, ma con una destinazione in più che non è un
   annullamento: **nessun progetto**. Le task senza progetto sono uno stato
   legittimo del modello (ci vive tutta la colonna "Da smistare"), quindi la
   voce sta nell'elenco insieme agli altri progetti, non come un ripiego. */
function ProgettoInUso({ richiesta, rispondi, annulla }) {
  const [destinazione, setDestinazione] = useState("nessuno");
  const quante = richiesta.tasks;

  return (
    <div className={RIQUADRO}>
      <Titolo>Il progetto «{richiesta.name}» non è vuoto</Titolo>
      <p className="m-0 text-meta text-content/70">
        {quante === 1 ? "Una task vive" : `${quante} task vivono`} in questo progetto. Cancellandolo
        {quante === 1 ? " va" : " vanno"} spostat{quante === 1 ? "a" : "e"} altrove: scegli dove. Le
        fasi del progetto spariscono comunque.
      </p>
      <select
        value={destinazione}
        onChange={(e) => setDestinazione(e.target.value)}
        className="h-8 px-2 rounded-lg border border-divider bg-elevated text-content text-[12.5px]"
      >
        <option value="nessuno">Senza progetto</option>
        {richiesta.destinazioni.map((d) => (
          <option key={d.idProject} value={d.idProject}>
            {d.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2 justify-end mt-1">
        <button type="button" className={BTN} onClick={annulla}>
          Annulla
        </button>
        <button
          type="button"
          className={BTN_PRIM}
          onClick={() => rispondi({ destinazione })}
        >
          Sposta e cancella
        </button>
      </div>
    </div>
  );
}

/* Caso 5 — non è una domanda: la migrazione con sotto-task aperti è vietata, e
   la scelta deliberata della specifica è non trascinarli fuori dal sistema. */
function Bloccato({ bloccato, annulla }) {
  return (
    <div className={RIQUADRO}>
      <Titolo>Non si può migrare con sotto-task aperti</Titolo>
      <p className="m-0 text-meta text-content/70">
        Migrare sposta il lavoro fuori da Alia. Questi sotto-task sono ancora aperti e vanno prima
        chiusi, migrati o cancellati:
      </p>
      <Elenco tasks={bloccato.tasks} />
      <div className="flex justify-end mt-1">
        <button type="button" className={BTN_PRIM} onClick={annulla}>
          Ho capito
        </button>
      </div>
    </div>
  );
}

/* ── il canale dei messaggi, in alto a destra ───────────────────────────────

   Un posto solo per le cose che non fermano niente ma vanno sapute, e sono di
   due specie:

   - gli **avvisi** dicono "è successo qualcosa che devi sapere" — l'operazione
     è passata, con una conseguenza che non avevi chiesto;
   - gli **errori** dicono "non è successo niente" — il core ha rifiutato la
     scrittura, e il gesto che sembrava riuscito non ha lasciato traccia.

   Stanno insieme perché la domanda che pongono a chi guarda è la stessa
   ("fermati un attimo e leggi"), e tenerli in due posti diversi voleva dire —
   ed è quello che succedeva — che uno dei due non aveva nessun posto: l'errore
   viveva solo dentro il pannello Impostazioni, e ovunque altro una scrittura
   rifiutata passava inosservata. La differenza fra le due specie resta, ma la
   porta il colore, non la posizione.

   In alto e non in basso: è l'angolo dove l'occhio arriva da solo quando
   qualcosa cambia, e in basso a destra ci finisce la mano che lavora.

   `top-20` e non `top-5`, ed è una misura presa sull'app in funzione, non a
   occhio: quell'angolo è già di due comandi — la rotella delle Impostazioni
   (finisce a 31px dal bordo) e il selettore di vista (37-69px) — e il riquadro
   li copriva tutti e due. **Un messaggio che passa non deve coprire un comando
   che resta**: finché non lo scarti quei due sono incliccabili, e chi ha appena
   sbagliato qualcosa è esattamente chi potrebbe voler aprire le Impostazioni.

   A 80px il riquadro comincia sotto entrambi e copre solo la cima delle colonne,
   che è contenuto e non comandi. */
function Messaggi({ avvisi, scarta, errore, scartaErrore }) {
  if (!errore && avvisi.length === 0) return null;
  return (
    <div className="absolute right-5 top-20 z-[96] flex flex-col gap-2 w-[340px] max-w-[calc(100%-40px)]">
      {/* L'errore per primo: è l'unico dei due che dice che il lavoro non è
          stato fatto, e chi ha appena toccato qualcosa deve leggerlo prima. */}
      {errore ? (
        <Messaggio grave onChiudi={scartaErrore} etichetta="Chiudi l'errore">
          {errore}
        </Messaggio>
      ) : null}
      {avvisi.map((a, i) => (
        <Messaggio key={i} onChiudi={() => scarta(i)} etichetta="Chiudi l'avviso">
          {/* Due forme, perché sono due cose diverse. Gli avvisi della macchina
              a stati sono oggetti con un `tipo`, e la frase la scrive qui chi
              conosce il contesto. Quelli della configurazione degli stati sono
              già frasi compiute — "«Da fare» non è più lo stato di partenza" —
              perché solo il core sa quale stato era, e riportare qui quella
              conoscenza per riscriverne il testo sarebbe duplicarla. */}
          {typeof a === "string"
            ? a
            : a.tipo === "chiusura-per-cascata-con-scarto"
              ? "Una task si è chiusa perché tutti i suoi sotto-task sono chiusi, ma non erano tutti completati: è stata portata sullo stato finale, che potrebbe non riflettere com'è andata davvero."
              : "Operazione applicata con un avviso."}
        </Messaggio>
      ))}
    </div>
  );
}

/* La stessa scatola per tutti e due, perché sono lo stesso gesto di lettura.
   `grave` cambia il bordo e il colore del testo: quel tanto che basta a far
   capire, senza leggere, che questo non è andato a buon fine. */
function Messaggio({ children, onChiudi, etichetta, grave = false }) {
  return (
    <div
      role={grave ? "alert" : "status"}
      className={
        "rounded-lg bg-elevated shadow-elev-md px-3 py-2.5 flex gap-2 items-start border " +
        (grave ? "border-priority-high/55" : "border-divider")
      }
    >
      <p
        className={
          "m-0 flex-1 text-meta [overflow-wrap:anywhere] " +
          (grave ? "text-priority-high" : "text-content/80")
        }
      >
        {children}
      </p>
      <button
        type="button"
        onClick={onChiudi}
        aria-label={etichetta}
        className="shrink-0 w-5 h-5 grid place-items-center rounded-sm bg-transparent border-0 cursor-pointer text-content/55 hover:text-content"
      >
        ✕
      </button>
    </div>
  );
}

export function AliaDialogs() {
  const { richiesta, bloccato, avvisi, errore, rispondi, annulla, scartaAvviso, scartaErrore } =
    useAlia();

  return (
    <>
      {richiesta || bloccato ? (
        <div className={VELO} onClick={annulla}>
          <div onClick={(e) => e.stopPropagation()}>
            {richiesta?.tipo === "figli-gia-chiusi" ? (
              <FigliGiaChiusi richiesta={richiesta} rispondi={rispondi} annulla={annulla} />
            ) : null}
            {richiesta?.tipo === "scegli-stato-riapertura" ? (
              <StatoRiapertura
                /* La chiave rimonta il dialogo quando cambia la richiesta: le
                   scelte fatte per la conferma precedente non devono
                   sopravvivere a quella dopo. */
                key={richiesta.tasks.map((t) => t.idTask).join("|")}
                richiesta={richiesta}
                rispondi={rispondi}
                annulla={annulla}
              />
            ) : null}
            {richiesta?.tipo === "stato-in-uso" ? (
              <StatoInUso
                key={richiesta.idState}
                richiesta={richiesta}
                rispondi={rispondi}
                annulla={annulla}
              />
            ) : null}
            {richiesta?.tipo === "progetto-in-uso" ? (
              <ProgettoInUso
                key={richiesta.idProject}
                richiesta={richiesta}
                rispondi={rispondi}
                annulla={annulla}
              />
            ) : null}
            {!richiesta && bloccato ? <Bloccato bloccato={bloccato} annulla={annulla} /> : null}
          </div>
        </div>
      ) : null}
      <Messaggi
        avvisi={avvisi}
        scarta={scartaAvviso}
        errore={errore}
        scartaErrore={scartaErrore}
      />
    </>
  );
}
