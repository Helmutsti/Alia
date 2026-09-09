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

/* Caso 3 — non è una domanda: la migrazione con sotto-task aperti è vietata, e
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

/* Gli avvisi non fermano niente: sono cose già successe che l'utente deve
   sapere. Per ora ce n'è uno solo — lo scarto della chiusura per cascata. */
function Avvisi({ avvisi, scarta }) {
  if (avvisi.length === 0) return null;
  return (
    <div className="absolute right-5 bottom-5 z-[96] flex flex-col gap-2 w-[340px] max-w-[calc(100%-40px)]">
      {avvisi.map((a, i) => (
        <div
          key={i}
          className="rounded-lg border border-divider bg-elevated shadow-elev-md px-3 py-2.5 flex gap-2 items-start"
        >
          <p className="m-0 flex-1 text-meta text-content/80">
            {a.tipo === "chiusura-per-cascata-con-scarto"
              ? "Una task si è chiusa perché tutti i suoi sotto-task sono chiusi, ma non erano tutti completati: è stata portata sullo stato finale, che potrebbe non riflettere com'è andata davvero."
              : "Operazione applicata con un avviso."}
          </p>
          <button
            type="button"
            onClick={() => scarta(i)}
            aria-label="Chiudi l'avviso"
            className="shrink-0 w-5 h-5 grid place-items-center rounded-sm bg-transparent border-0 cursor-pointer text-content/55 hover:text-content"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function AliaDialogs() {
  const { richiesta, bloccato, avvisi, rispondi, annulla, scartaAvviso } = useAlia();

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
            {!richiesta && bloccato ? <Bloccato bloccato={bloccato} annulla={annulla} /> : null}
          </div>
        </div>
      ) : null}
      <Avvisi avvisi={avvisi} scarta={scartaAvviso} />
    </>
  );
}
