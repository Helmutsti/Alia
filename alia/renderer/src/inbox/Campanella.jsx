import { useCallback, useEffect, useRef, useState } from "react";
import { Alarm, Bell, MailBox } from "../components/icons.jsx";
import { core, hasCore } from "../lib/aliaClient.js";

/* La campanella — quello che Alia ti ha detto.

   Sta accanto all'ingranaggio, in cima alla schermata, e non dentro una
   colonna: come le Impostazioni, non appartiene ne' all'inbox ne' al
   contenuto. E' il registro degli **eventi**, cioe' delle cose successe mentre
   guardavi da un'altra parte.

   ── Perche' esiste, visto che i toast ci sono gia' ─────────────────────────

   Un toast dura otto secondi. Chi era in riunione quando ha suonato non ha
   modo di sapere che cosa si e' perso — Windows lo tiene nel suo centro
   notifiche insieme a quelli di tutti gli altri programmi, che e' meglio di
   niente ma non e' un posto in cui si va a cercare. Qui invece c'e' l'elenco
   di Alia, e ogni riga porta alla sua task.

   ── Due specie di riga, e il pallino ne conta una sola specie ──────────────

   **Promemoria** (una sveglia ha suonato) e **origini** (e' arrivata una cosa
   da confermare). Sono eventi diversi ma la domanda che li porta qui e' la
   stessa: *cosa e' successo mentre non guardavo*.

   Il badge delle origini accanto a "INBOX" resta, e non e' un doppione: quello
   conta **l'arretrato** — quante cose aspettano una decisione, un numero che
   scende man mano che le smaltisci — questo conta le **novita'**, e si azzera
   guardando. Uno dice quanto lavoro c'e', l'altro cosa e' cambiato.

   ── Aprire vuol dire leggere ───────────────────────────────────────────────

   Nessun bottone "segna tutte come lette": aprire la tendina *e'* il gesto con
   cui si dice "visto". Un secondo gesto per confermare di aver visto quello che
   si sta guardando sarebbe una domanda a cui l'utente ha gia' risposto
   aprendo. */

const QUANTE = 40;

/* Quanto tempo fa, come lo direbbe una persona. Sotto il minuto non si dice un
   numero: "adesso" e' piu' vero di "12 secondi fa". */
function quandoScritto(iso, adesso = Date.now()) {
  const scarto = Math.max(0, adesso - new Date(iso).getTime());
  const minuti = Math.floor(scarto / 60_000);
  if (minuti < 1) return "adesso";
  if (minuti < 60) return `${minuti} min fa`;
  const ore = Math.floor(minuti / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? "ora" : "ore"} fa`;
  const giorni = Math.floor(ore / 24);
  if (giorni === 1) return "ieri";
  if (giorni < 7) return `${giorni} giorni fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export function Campanella({ onApriTask, className = "" }) {
  const [aperta, setAperta] = useState(false);
  const [notifiche, setNotifiche] = useState([]);
  const [nonLette, setNonLette] = useState(0);
  const rif = useRef(null);

  const carica = useCallback(async () => {
    if (!hasCore) return;
    try {
      const esito = await core.listNotifiche({ limite: QUANTE });
      setNotifiche(esito?.notifiche ?? []);
      setNonLette(esito?.nonLette ?? 0);
    } catch {
      /* Il registro non e' un pezzo critico: se non si legge, la campanella
         resta spenta invece di far comparire un errore in cima alla
         schermata. */
    }
  }, []);

  /* Si ricarica da sola ogni mezzo minuto, che e' il ritmo delle sveglie
     (vedi electron/promemoria.js): piu' spesso non ci sarebbe niente di nuovo,
     meno spesso il pallino arriverebbe dopo il toast. */
  useEffect(() => {
    carica();
    const battito = setInterval(carica, 30_000);
    return () => clearInterval(battito);
  }, [carica]);

  /* E quando arriva un colpetto: una sveglia appena suonata, un'origine
     appena entrata. Cosi' il pallino compare **insieme** al toast e non fino a
     mezzo minuto dopo. */
  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.alia : undefined;
    const via = [];
    if (typeof bridge?.onRicarica === "function") via.push(bridge.onRicarica(carica));
    if (typeof bridge?.onOrigini === "function") via.push(bridge.onOrigini(carica));
    return () => via.forEach((spegni) => spegni?.());
  }, [carica]);

  useEffect(() => {
    if (!aperta) return undefined;
    const fuori = (e) => {
      if (!rif.current?.contains(e.target)) setAperta(false);
    };
    const esc = (e) => {
      if (e.key === "Escape") setAperta(false);
    };
    document.addEventListener("pointerdown", fuori);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuori);
      document.removeEventListener("keydown", esc);
    };
  }, [aperta]);

  const apri = async () => {
    const prossimo = !aperta;
    setAperta(prossimo);
    if (!prossimo || !hasCore) return;
    await carica();
    if (nonLette > 0) {
      await core.segnaNotificheLette();
      /* Il pallino sparisce subito, senza aspettare la rilettura: e' un
         numero che l'utente ha appena azzerato guardando. */
      setNonLette(0);
      setNotifiche((prec) => prec.map((n) => (n.lettaAt ? n : { ...n, lettaAt: "adesso" })));
    }
  };

  return (
    <div ref={rif} className={`relative ${className}`}>
      <button
        type="button"
        onClick={apri}
        aria-label={nonLette > 0 ? `Notifiche, ${nonLette} nuove` : "Notifiche"}
        title="Notifiche"
        className={
          "relative grid place-items-center w-6 h-6 rounded-md border-0 bg-transparent cursor-pointer " +
          "text-content/62 hover:text-content"
        }
      >
        <Bell size={15} />
        {nonLette > 0 ? (
          <span
            className="absolute -top-[1px] -right-[1px] min-w-[13px] h-[13px] px-[3px] rounded-full bg-accent text-bg text-micro font-medium grid place-items-center"
            style={{ lineHeight: 1 }}
          >
            {nonLette > 9 ? "9+" : nonLette}
          </span>
        ) : null}
      </button>

      {aperta ? (
        <div
          role="dialog"
          aria-label="Notifiche"
          className="absolute right-0 top-[30px] z-[60] w-[320px] max-h-[420px] overflow-y-auto rounded-lg border border-divider bg-surface shadow-elev-lg py-1.5"
        >
          {notifiche.length === 0 ? (
            <p className="m-0 px-3 py-4 text-meta text-content/45">
              Niente da dire, per adesso. Qui finiscono i promemoria che suonano e le cose che
              arrivano dalle fonti collegate.
            </p>
          ) : (
            notifiche.map((n) => {
              const apribile = !!n.idTask && !n.taskCancellata && onApriTask;
              const Icona = n.tipo === "origine" ? MailBox : Alarm;
              return (
                <button
                  key={n.idNotifica}
                  type="button"
                  disabled={!apribile}
                  onClick={() => {
                    if (!apribile) return;
                    setAperta(false);
                    onApriTask(n.idTask);
                  }}
                  className={
                    "w-full flex items-start gap-2.5 px-3 py-2 text-left border-0 bg-transparent " +
                    (apribile
                      ? "cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-content)_6%,transparent)]"
                      : "cursor-default")
                  }
                >
                  <Icona size={13} className="mt-[3px] shrink-0 text-content/45" />
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-meta text-content truncate">{n.titolo}</span>
                    {n.corpo ? (
                      <span className="text-mini text-content/50 truncate">{n.corpo}</span>
                    ) : null}
                  </span>
                  <span className="text-micro text-content/32 shrink-0 mt-[3px]">
                    {quandoScritto(n.creataAt)}
                  </span>
                  {/* Il pallino delle non lette: **resta finche' la tendina e'
                      aperta**, anche se la lettura e' gia' stata scritta. Farle
                      spegnere sotto gli occhi mentre le si legge vorrebbe dire
                      togliere proprio il segno che dice quali sono nuove. */}
                  {!n.lettaAt || n.lettaAt === "adesso" ? (
                    <span className="w-[6px] h-[6px] rounded-full bg-accent shrink-0 mt-[7px]" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
