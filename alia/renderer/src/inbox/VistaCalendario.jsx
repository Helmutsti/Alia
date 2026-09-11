import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "../components/icons.jsx";
import { CardCalendarTask } from "./CardCalendarTask.jsx";
import { InboxCard } from "./InboxCard.jsx";
import { eInRitardo } from "../lib/tasks.js";
import {
  DISPONIBILITA_PREDEFINITA,
  daMinuti,
  eOra,
  inMinuti,
  intervalliDelGiorno,
  oreDisponibili,
  oreScritte,
} from "../lib/disponibilita.js";

/* Vista Calendario — la terza forma, dopo Lista e Kanban.

   Il calendario dispone le task su una **griglia di date**, e questo decide da
   solo quasi tutto il resto:

     · la chiave e' `dueAt`, e non c'e' scelta. Lista e Kanban raggruppano per
       qualcosa (progetto, stato, fase); qui il posto di una task e' il giorno
       in cui scade, e un calendario raggruppato per progetto non sarebbe un
       calendario. Per questo la riga degli strumenti — ordina, filtra,
       raggruppa — qui non compare affatto: non e' che sia vuota, e' che non ha
       niente da dire.

     · le task **senza scadenza non compaiono**. Non e' una dimenticanza ed e'
       il motivo per cui la testata le conta lo stesso: sparire in silenzio
       farebbe sembrare che manchino delle task, e invece manca una data.

   Tre estensioni della stessa griglia — mese, settimana, giorno — e la scelta
   sta nella prima riga della testata, accanto alla vista. E' una proprieta'
   *del* calendario, non una quarta vista: il selettore delle viste dice in che
   forma si guarda, questo dice quanto tempo ci sta dentro.

   Il periodo mostrato e' uno stato locale e non una preferenza: "dove sono nel
   tempo" e' il genere di cosa che riaprendo l'app deve ripartire da oggi. Il
   *modo* invece si ricorda, e sta in ContentPane con le altre preferenze di
   vista.

   I trascinamenti non ci sono ancora — questa e' la geometria, il gesto viene
   dopo. Le celle sono comunque gia' contenitori a se' stanti, che e' quello
   che servira' per farne dei bersagli.

   ── Le ore stanno nel Giorno, e solo li' ───────────────────────────────────

   Il Giorno ha la griglia delle ore; mese e settimana no, ed e' una scelta di
   scala e non un lavoro lasciato a meta'. In una colonna larga un settimo, e
   alta quanto lo schermo, ventiquattro fasce fanno righe da venti pixel: si
   disegnerebbe una precisione che li' non si puo' ne' leggere ne' usare. Nel
   Giorno lo spazio c'e', e allora l'ora e' un dato come un altro — il core la
   tiene da sempre dentro `dueAt`.

   Sopra le ore c'e' la **disponibilita'** (vedi lib/disponibilita.js): le
   fasce in cui si lavora davvero, accese, e tutto il resto spento. Serve
   adesso a leggere la giornata per quello che e' — due ore libere prima di
   pranzo non sono le due ore di notte in cui la griglia non finisce mai — e
   servira' al rilascio, che avra' un posto dove sapere se una task e' stata
   lasciata in un'ora che esiste. */

/* ═══ aritmetica di calendario ═══════════════════════════════════════════════
   Tutta locale al fuso dell'utente, e volutamente: un calendario e' un oggetto
   locale, e un giorno qui e' il giorno che si vede sull'orologio in cucina. */

const aMezzanotte = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const piuGiorni = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/* La settimana comincia di lunedi': `getDay()` la fa cominciare di domenica
   (0), quindi si ruota di uno. */
const lunediDi = (d) => piuGiorni(d, -((d.getDay() + 6) % 7));

/* Chiave di raggruppamento per giorno. Anno-mese-giorno e non l'ISO: l'ISO e'
   in UTC e a cavallo di mezzanotte sposterebbe le task di un giorno. */
const chiaveGiorno = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const maiuscola = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const GIORNI_CORTI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

const MODI = {
  mese: { label: "Mese" },
  settimana: { label: "Settimana" },
  giorno: { label: "Giorno" },
};

export const MODI_CALENDARIO = Object.entries(MODI).map(([id, m]) => ({ id, ...m }));
export const eModoCalendario = (v) => Object.hasOwn(MODI, v);

/* ═══ la pillola ═════════════════════════════════════════════════════════════
   Dentro una cella non ci sta una card: nel mese una cella e' larga un settimo
   dello spazio e alta un quinto, e una card da 256 con priorita', meta e tag
   la sfonderebbe. La pillola dice le due sole cose che servono per ritrovare
   una task su una griglia di date — di chi e' (il pallino del progetto) e come
   si chiama — e il resto si legge aprendola.

   Resta pero' una **card in piccolo** e non una riga di testo: bordo, fondo
   sollevato e angoli sono gli stessi della card, perche' e' lo stesso oggetto
   visto da lontano. */
function Pillola({ task, onOpen }) {
  return (
    <button
      type="button"
      title={task.title}
      onClick={onOpen ? () => onOpen(task.id) : undefined}
      className={
        "flex items-center gap-1.5 w-full min-w-0 px-1.5 py-[3px] rounded-md shrink-0 " +
        "border border-card-line bg-elevated text-left cursor-pointer " +
        "text-mini text-content transition-colors duration-[140ms] hover:border-card-line-hover"
      }
    >
      <span
        className="w-[6px] h-[6px] rounded-full shrink-0"
        style={{ background: task.project?.color ?? "var(--color-project-fallback)" }}
      />
      <span className={`truncate ${task.done ? "line-through text-content/45" : ""}`}>
        {task.title}
      </span>
    </button>
  );
}

/* ═══ la griglia delle ore ═══════════════════════════════════════════════════ */

/* Quanto dura una **scadenza netta**, a schermo. Una task con il solo `dueAt`
   e' un istante, non un intervallo: non ha una durata da disegnare, e un
   blocco alto un pixel non si prenderebbe in mano. Un'ora e' una convenzione
   dichiarata, non una stima — e appena si trascina un bordo la task smette di
   essere un istante e diventa `startAt`→`dueAt`, cioe' una durata vera. */
const DURATA_BLOCCO = 60;

/* L'altezza di riposo di un'ora. Non e' fissa: la griglia si stira a riempire
   lo spazio quando le ore in scena sono poche (vedi `minHeight` piu' sotto), e
   questa e' la misura sotto la quale non scende — a meno di 44px un blocco con
   titolo e ora non ci sta piu' dentro. */
const ALTEZZA_ORA = 44;

/* Il passo dei gesti: un quarto d'ora. Al minuto il gesto sarebbe nervoso e
   non si riuscirebbe a fermarlo su un'ora tonda; alla mezz'ora non si
   potrebbe dire "le nove e un quarto", che e' un orario che la gente usa. */
const PASSO = 15;

/* Sotto il quarto d'ora un blocco non ha piu' un corpo da prendere: resterebbe
   solo maniglia sopra e maniglia sotto. */
const DURATA_MINIMA = 15;

const minutiDi = (iso) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

const arrotonda = (minuti) =>
  Math.max(0, Math.min(24 * 60, Math.round(minuti / PASSO) * PASSO));

/* L'istante vero da un giorno e un'ora: e' cio' che si scrive nel dato. */
function istanteDel(giorno, minuti) {
  const d = new Date(giorno);
  d.setHours(0, minuti, 0, 0);
  return d.toISOString();
}

/* Una task **senza ora** e' quella che cade esatta a mezzanotte: il core salva
   un istante comunque, e chi scrive una scadenza dall'app le da' le 9 (vedi
   TaskDetailModal). Mezzanotte tonda e' quindi quasi sempre un import o una
   data scritta a mano senza orario, e appoggiarla in cima alla notte sarebbe
   inventarle un'ora che nessuno ha scelto: va nella fascia "tutto il giorno",
   sopra la griglia. */
const senzOra = (t) => minutiDi(t.dueAt) === 0;

/* Dove sta una task sulla linea, e se e' un istante o un intervallo.

   `startAt` esiste da sempre nel modello — lo usa il Gantt — e qui diventa il
   bordo alto del blocco. Vale solo se cade nello stesso giorno del `dueAt`:
   un intervallo che scavalca la mezzanotte non e' una cosa che questa griglia
   sappia disegnare, e fingere che cominci alle 00:00 direbbe il falso. In quel
   caso si ricade sull'istante. */
function fasciaTask(t) {
  const fine = minutiDi(t.dueAt);
  const inizioIso = t.startAt;
  if (inizioIso) {
    const stessoGiorno =
      chiaveGiorno(new Date(inizioIso)) === chiaveGiorno(new Date(t.dueAt));
    const inizio = minutiDi(inizioIso);
    if (stessoGiorno && inizio < fine) return { inizio, fine, puntuale: false };
  }
  return { inizio: fine, fine: fine + DURATA_BLOCCO, puntuale: true };
}

/* L'ora scritta sul blocco: un istante si dice con un'ora sola, un intervallo
   con due. E' l'unica differenza che si vede fra i due, ed e' giusto che si
   veda: sono due cose diverse. */
const etichettaOre = (f) =>
  f.puntuale ? daMinuti(f.inizio) : `${daMinuti(f.inizio)} – ${daMinuti(f.fine)}`;

/* La fascia di ore da disegnare.

   Parte dalla disponibilita' del giorno — e' la ragione per cui esiste, ed e'
   quello che si vuole vedere appena si apre — con un'ora di respiro sopra e
   sotto, e si allarga quanto basta a contenere le task che stanno fuori. Una
   task alle 7 del mattino in un giorno che comincia alle 9 non deve sparire:
   la griglia si allunga, e la task si vede fuori dalle fasce accese, che e'
   esattamente l'informazione. */
function fasciaOraria(intervalli, blocchi, minutiAdesso) {
  let da = 9 * 60;
  let a = 18 * 60;
  if (intervalli.length > 0) {
    da = inMinuti(intervalli[0].da);
    a = inMinuti(intervalli.at(-1).a);
  }
  da -= 60;
  a += 60;
  for (const b of blocchi) {
    da = Math.min(da, b.inizio);
    a = Math.max(a, b.fine);
  }
  /* E **adesso**, quando il giorno guardato e' oggi. Senza, guardando la
     giornata alle dieci di sera la barra dell'ora corrente non avrebbe un
     posto dove stare: la fascia finisce un'ora dopo il lavoro, e la sera
     resterebbe fuori. La griglia si allunga fin qui per la stessa ragione per
     cui si allunga fino a una task fuori orario — quello che esiste in quel
     giorno si deve vedere. */
  if (minutiAdesso != null) {
    da = Math.min(da, minutiAdesso);
    a = Math.max(a, minutiAdesso + 30);
  }
  return {
    da: Math.max(0, Math.floor(da / 60) * 60),
    a: Math.min(24 * 60, Math.ceil(a / 60) * 60),
  };
}

/* Chi sta accanto a chi. Due task sovrapposte non possono stare una sopra
   l'altra — una coprirebbe l'altra e la giornata sembrerebbe piu' vuota di
   quello che e' — quindi si dividono la larghezza.

   Si dividono **per grappolo** e non per giornata: tre task alle 9 e una alle
   15 fanno tre colonne alle 9 e una sola alle 15. Dividere sempre per il
   massimo della giornata assottiglierebbe anche le ore in cui non serve. */
function disponi(tasks, sostituzioni) {
  const ordinate = tasks
    .map((t) => ({ task: t, ...(sostituzioni?.[t.id] ?? fasciaTask(t)) }))
    .sort((x, y) => x.inizio - y.inizio || x.fine - y.fine);

  const disposti = [];
  let grappolo = [];
  let fineGrappolo = -1;

  const chiudi = () => {
    /* Dentro il grappolo, la prima colonna libera: si riusa una colonna appena
       la task che ci stava e' finita. */
    const finiPerColonna = [];
    for (const b of grappolo) {
      let colonna = finiPerColonna.findIndex((fine) => fine <= b.inizio);
      if (colonna === -1) colonna = finiPerColonna.length;
      finiPerColonna[colonna] = b.fine;
      b.colonna = colonna;
    }
    for (const b of grappolo) b.colonne = finiPerColonna.length;
    disposti.push(...grappolo);
  };

  for (const b of ordinate) {
    if (grappolo.length > 0 && b.inizio >= fineGrappolo) {
      chiudi();
      grappolo = [];
      fineGrappolo = -1;
    }
    grappolo.push(b);
    fineGrappolo = Math.max(fineGrappolo, b.fine);
  }
  if (grappolo.length > 0) chiudi();

  return disposti;
}

/* ── la tendina degli orari ─────────────────────────────────────────────────

   Compare appena una task **arriva** sulla linea da fuori, e chiede l'unica
   cosa che il gesto non ha detto: quanto dura.

   Il trascinamento ha gia' detto il giorno e l'ora d'arrivo, e quelle sono
   gia' scritte — la tendina non e' un modulo da confermare prima che succeda
   qualcosa, e chiuderla senza toccare niente lascia la task dov'e' stata
   lasciata, con la sua ora. Serve a **precisare**, e per questo propone gia'
   la risposta piu' probabile.

   Due forme, perche' nel modello sono due cose diverse: una scadenza netta
   (solo `dueAt` — "per le 11") e un intervallo (`startAt`→`dueAt` — "dalle 10
   alle 11"). Non e' una preferenza di visualizzazione: il secondo occupa del
   tempo, il primo e' un termine. */
function ChiediOrari({ minuti, top, onConferma, onChiudi }) {
  const [conInizio, setConInizio] = useState(false);
  const [inizio, setInizio] = useState(daMinuti(minuti));
  const [fine, setFine] = useState(daMinuti(Math.min(minuti + DURATA_BLOCCO, 23 * 60 + 59)));

  const conferma = () => {
    if (!eOra(inizio) || (conInizio && !eOra(fine))) return onChiudi();
    if (!conInizio) return onConferma({ inizio: inMinuti(inizio), fine: null });
    const da = inMinuti(inizio);
    const a = Math.max(inMinuti(fine), da + DURATA_MINIMA);
    return onConferma({ inizio: da, fine: a });
  };

  return (
    <div
      role="dialog"
      aria-label="Orario della task"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onChiudi();
        if (e.key === "Enter") conferma();
      }}
      className={
        "absolute z-[9] left-1/2 -translate-x-1/2 w-[268px] p-2.5 rounded-lg " +
        "border border-divider bg-surface shadow-elev-lg flex flex-col gap-2.5"
      }
      /* Attaccata all'ora in cui e' stata lasciata, non in cima alla pista:
         la domanda riguarda *quel* punto della giornata, e farla comparire
         altrove obbligherebbe a cercare con gli occhi dove sia finita la task.
         Scende di poco sotto il blocco, cosi' non lo copre. */
      style={{ top: `calc(${top}% + 6px)` }}
    >
      <div className="flex gap-1.5" role="radiogroup" aria-label="Che ora scrivere">
        {[
          { id: false, label: "Solo scadenza" },
          { id: true, label: "Inizio e fine" },
        ].map((v) => (
          <button
            key={String(v.id)}
            type="button"
            role="radio"
            aria-checked={conInizio === v.id}
            onClick={() => setConInizio(v.id)}
            className={
              "flex-1 h-7 rounded-md border text-[12px] cursor-pointer bg-transparent " +
              (conInizio === v.id
                ? "border-accent text-accent"
                : "border-divider text-content/62 hover:text-content")
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="time"
          autoFocus
          value={inizio}
          aria-label={conInizio ? "Ora di inizio" : "Ora della scadenza"}
          onChange={(e) => setInizio(e.target.value)}
          className={
            "h-8 w-[104px] rounded-lg border border-divider bg-elevated px-2 text-content " +
            "tabular-nums [color-scheme:dark] focus:outline-none focus:border-accent"
          }
        />
        {conInizio ? (
          <>
            <span className="text-content/38 text-meta">–</span>
            <input
              type="time"
              value={fine}
              aria-label="Ora di fine"
              onChange={(e) => setFine(e.target.value)}
              className={
                "h-8 w-[104px] rounded-lg border border-divider bg-elevated px-2 text-content " +
                "tabular-nums [color-scheme:dark] focus:outline-none focus:border-accent"
              }
            />
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={conferma}
          className="h-7 px-3 rounded-md border-0 bg-accent text-bg text-[12px] cursor-pointer"
        >
          Fatto
        </button>
        <button
          type="button"
          onClick={onChiudi}
          className="h-7 px-2 rounded-md border-0 bg-transparent text-content/55 text-[12px] cursor-pointer hover:text-content"
        >
          Lascia com’è
        </button>
      </div>
    </div>
  );
}

/* L'ora corrente, che **si muove da sola**.

   Senza questo la barra dell'adesso c'era gia', ma stava dove si trovava
   l'ultimo ridisegno: aprendo la vista alle nove e guardandola a mezzogiorno
   era ancora sulle nove, cioe' diceva una cosa falsa con la sicurezza di un
   dato. Una riga che dice "adesso" o si muove o non serve.

   Ogni trenta secondi: alla scala della griglia un minuto vale meno di un
   pixel, quindi e' gia' piu' fitto di quanto l'occhio possa vedere, ed e'
   abbastanza sparso da non pesare. Il battito vive **solo finche' la vista
   Giorno e' in scena** (il componente si smonta cambiando estensione), e
   l'intervallo si spegne con lei.

   `adesso` e' anche cio' che decide se il giorno guardato e' oggi: cosi' a
   mezzanotte la barra lascia il giorno vecchio da sola, invece di restarci
   fino al prossimo ridisegno. */
function useAdesso() {
  const [adesso, setAdesso] = useState(() => new Date());
  useEffect(() => {
    const battito = setInterval(() => setAdesso(new Date()), 30_000);
    return () => clearInterval(battito);
  }, []);
  return adesso;
}

function GrigliaOre({
  giorno,
  tasks,
  disponibilita,
  onOpenTask,
  onAggiornaTask,
  onTogliDalCalendario,
  refRilascio,
  anteprima,
}) {
  const intervalli = useMemo(
    () => intervalliDelGiorno(disponibilita, giorno),
    [disponibilita, giorno],
  );
  const conOra = useMemo(() => tasks.filter((t) => !senzOra(t)), [tasks]);
  const tuttoIlGiorno = useMemo(() => tasks.filter(senzOra), [tasks]);

  const rifPista = useRef(null);
  /* Il gesto in corso, e nient'altro: `null` quando non si sta trascinando.
     Tiene le ore **provvisorie**, che sono quelle disegnate finche' il dito e'
     giu'. La scrittura avviene una volta sola, al rilascio: e' la stessa
     regola del trascinamento delle card (vedi dragKit), e per la stessa
     ragione — a ogni pixel si scriverebbe un centinaio di volte una cosa che
     l'utente non ha ancora finito di dire. */
  const [gesto, setGesto] = useState(null);
  const [chiesta, setChiesta] = useState(null);
  /* Un gesto che ha mosso qualcosa non deve anche aprire il dettaglio: il clic
     arriva comunque, dopo il rilascio, ed e' questo a fermarlo. */
  const mosso = useRef(false);

  /* Due disposizioni, e la distinzione conta.

     `fermi` e' quella delle ore **scritte**, e da lei si ricava la fascia di
     ore in scena. Se la fascia seguisse il blocco in mano, trascinandolo verso
     l'alto la griglia si allungherebbe sotto il puntatore: ogni minuto
     cambierebbe di posto mentre lo si guarda, e il blocco scapperebbe dal dito.
     Si decide una volta, all'inizio del gesto, e non si muove piu'.

     `blocchi` e' quella disegnata, con dentro le ore provvisorie del gesto. */
  const fermi = useMemo(() => disponi(conOra), [conOra]);
  /* La barra dell'ora corrente, e solo se il giorno guardato e' oggi: su un
     altro giorno sarebbe una riga che indica un momento che li' non esiste. */
  const adesso = useAdesso();
  const eOggi = chiaveGiorno(giorno) === chiaveGiorno(adesso);
  const minutiOra = adesso.getHours() * 60 + adesso.getMinutes();
  const oraScritta = daMinuti(minutiOra);

  const fascia = useMemo(
    () => fasciaOraria(intervalli, fermi, eOggi ? minutiOra : null),
    [intervalli, fermi, eOggi, minutiOra],
  );

  const sostituzioni = gesto?.mosso
    ? { [gesto.id]: { inizio: gesto.inizio, fine: gesto.fine, puntuale: gesto.puntuale } }
    : null;
  const blocchi = sostituzioni ? disponi(conOra, sostituzioni) : fermi;

  const ampiezza = fascia.a - fascia.da;
  const ore = Array.from({ length: ampiezza / 60 }, (_, i) => fascia.da + i * 60);
  /* Dove cade un minuto, in percentuale della fascia: cosi' la griglia puo'
     stirarsi in altezza senza che nessuno debba ricalcolare niente. */
  const quota = (minuti) => ((minuti - fascia.da) / ampiezza) * 100;

  const mostraAdesso = eOggi && minutiOra >= fascia.da && minutiOra <= fascia.a;

  const oreDelGiorno = oreDisponibili(intervalli);

  /* ── il gesto ─────────────────────────────────────────────────────────────

     Tre gesti su un blocco solo, distinti da dove si preme: il centro lo
     sposta lungo la linea, i due bordi ne cambiano un capo. E' il gesto che
     ogni calendario ha, e vale la pena dire perche' non passa dal motore delle
     card (dragKit): li' il trascinamento sposta un elemento **dentro un
     elenco**, e la domanda e' "prima di quale altro"; qui sposta un elemento
     **su un asse continuo**, e la domanda e' "a che minuto". Sono due
     geometrie diverse, e forzare la seconda nella prima avrebbe voluto dire un
     terzo tipo di bersaglio in un motore che ne ha gia' due.

     Il blocco si muove **da solo** mentre lo si trascina, senza clone: e' gia'
     un rettangolo posizionato in assoluto sulla pista, quindi cambiargli le
     ore lo sposta davvero. Il clone serve dove l'elemento vive in un flusso e
     non lo si puo' staccare senza sfasciare l'impaginazione. */
  const prendi = (e, b, modo) => {
    if (e.button !== 0) return;
    const pista = rifPista.current;
    if (!pista) return;
    e.preventDefault();
    e.stopPropagation();

    const r = pista.getBoundingClientRect();
    const perPixel = ampiezza / r.height;
    const minutiDelPuntatore = (ev) => fascia.da + (ev.clientY - r.top) * perPixel;
    const partenza = minutiDelPuntatore(e);
    const originale = fasciaTask(b.task);
    const durata = originale.fine - originale.inizio;

    let stato = {
      id: b.task.id,
      modo,
      inizio: originale.inizio,
      fine: originale.fine,
      puntuale: originale.puntuale,
      fuori: false,
      mosso: false,
    };
    mosso.current = false;
    setGesto(stato);

    /* Fuori dalla linea c'e' una sola destinazione che vuol dire qualcosa: la
       colonna del triage. Tutto il resto dello schermo non e' un bersaglio, e
       rilasciare li' non fa niente — il blocco torna dov'era. */
    const sopraInbox = (ev) =>
      !!document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest?.('[data-drop-col="none"]');

    const move = (ev) => {
      if (!mosso.current) {
        if (Math.abs(minutiDelPuntatore(ev) - partenza) * (1 / perPixel) < 3) return;
        mosso.current = true;
      }
      const fuori = sopraInbox(ev);
      const puntatore = arrotonda(minutiDelPuntatore(ev));
      let { inizio, fine } = stato;

      /* Sopra l'Inbox il blocco **si ferma dov'era**. Continuare a calcolargli
         un'ora mentre il puntatore e' altrove vorrebbe dire mostrare un orario
         che non verra' scritto — di la' l'ora non esiste — e farlo scorrere in
         fondo alla giornata mentre si guarda da un'altra parte. Resta al suo
         posto, sbiadito: e' ancora li', ma non e' piu' dove sta andando. */
      if (fuori) {
        stato = {
          ...stato,
          inizio: originale.inizio,
          fine: originale.fine,
          puntuale: originale.puntuale,
          fuori: true,
          mosso: true,
          px: ev.clientX,
          py: ev.clientY,
        };
        setGesto(stato);
        return;
      }

      if (modo === "muovi") {
        const scarto = puntatore - arrotonda(partenza);
        inizio = originale.inizio + scarto;
        fine = originale.fine + scarto;
        /* Ai bordi **della fascia in scena**, non della mezzanotte: fuori di
           li' il blocco non si vedrebbe, e un gesto che porta una cosa dove
           non si vede e' un gesto che si e' perso. */
        if (inizio < fascia.da) {
          fine += fascia.da - inizio;
          inizio = fascia.da;
        }
        if (fine > fascia.a) {
          inizio -= fine - fascia.a;
          fine = fascia.a;
        }
      } else if (modo === "inizio") {
        inizio = Math.min(puntatore, originale.fine - DURATA_MINIMA);
        fine = originale.fine;
      } else {
        inizio = originale.inizio;
        fine = Math.max(puntatore, originale.inizio + DURATA_MINIMA);
      }

      /* Ridimensionare fa smettere di essere un istante: e' il gesto con cui
         una scadenza netta diventa un intervallo, e non c'e' bisogno di
         chiederlo — tirare un bordo *e'* dire "dura da qui a qui". Spostare
         invece non cambia natura: un termine spostato resta un termine. */
      const puntuale = modo === "muovi" ? originale.puntuale : false;
      stato = {
        ...stato,
        inizio,
        fine,
        puntuale,
        fuori,
        mosso: true,
        durata,
        /* Servono solo al fantasma che segue il puntatore fuori dalla linea. */
        px: ev.clientX,
        py: ev.clientY,
      };
      setGesto(stato);
    };

    const up = async (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const finale = stato;
      setGesto(null);
      if (!finale.mosso) return;

      if (finale.fuori) {
        /* ── verso l'Inbox: si toglie dal calendario ──
           La scadenza se ne va con il blocco. E' l'unico posto in cui il
           rilascio nel triage cancella una data, ed e' perche' qui la data
           **e'** la posizione: riportare indietro una task lasciandole l'ora
           vorrebbe dire vederla sparire dalla linea e restare programmata. */
        await onTogliDalCalendario?.(finale.id);
        return;
      }

      await onAggiornaTask?.(
        finale.id,
        finale.puntuale
          ? { dueAt: istanteDel(giorno, finale.inizio), startAt: null }
          : {
              startAt: istanteDel(giorno, finale.inizio),
              dueAt: istanteDel(giorno, finale.fine),
            },
      );
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* L'arrivo da fuori: una card lasciata sulla linea dal motore delle card.
     La registrazione passa da un ref, come il rilascio del Kanban e per la
     stessa ragione — il motore vive in InboxWorkspace, che e' l'unico a vedere
     tutte le colonne, ma cosa voglia dire "lasciare qui" lo sa solo questa
     vista. */
  const rilascia = useCallback(
    async (task, chiave, minuti) => {
      if (chiave !== chiaveGiorno(giorno)) return;
      const m = arrotonda(minuti);
      await onAggiornaTask?.(task.id, { dueAt: istanteDel(giorno, m), startAt: null });
      setChiesta({ id: task.id, minuti: m });
    },
    [giorno, onAggiornaTask],
  );

  useEffect(() => {
    if (refRilascio) refRilascio.current = rilascia;
  }, [refRilascio, rilascia]);

  /* Il fantasma di chi sta arrivando. Il motore delle card nasconde il suo
     clone appena entra qui (vedi dragKit): quello che si vede al suo posto e'
     questo, cioe' la card **gia' diventata** un blocco sulla linea. Il cambio
     di forma non e' un effetto: e' l'unico modo di far vedere che rilasciare
     qui vuol dire dare un'ora. */
  const inArrivo =
    anteprima?.groupId === `ora:${chiaveGiorno(giorno)}` && anteprima.minuti != null
      ? { minuti: arrotonda(anteprima.minuti), titolo: anteprima.titolo ?? "Nuova task" }
      : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col border border-divider rounded-xl bg-surface overflow-hidden">
      {/* La riga che dice quanto vale questo giorno. Vale anche da spiegazione
          delle bande accese: senza, sarebbero una sfumatura senza nome. */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-divider shrink-0">
        {oreDelGiorno > 0 ? (
          <>
            <span className="w-[18px] h-[10px] rounded-sm shrink-0 bg-[color-mix(in_srgb,var(--color-content)_6%,transparent)] border border-divider" />
            <span className="text-mini text-content/62">
              {oreScritte(oreDelGiorno)} di disponibilità
            </span>
            <span className="text-mini text-content/38">
              {intervalli.map((iv) => `${iv.da}–${iv.a}`).join(", ")}
            </span>
          </>
        ) : (
          <span className="text-mini text-content/45">
            Nessuna disponibilità in questo giorno — si imposta in Impostazioni → Calendario.
          </span>
        )}
      </div>

      {/* Tutto il giorno: c'e' solo quando serve. Una fascia sempre presente e
          quasi sempre vuota ruberebbe spazio alla griglia per non dire niente. */}
      {tuttoIlGiorno.length > 0 ? (
        <div className="flex items-start gap-2 px-3 py-2 border-b border-divider shrink-0">
          <span className="w-[52px] shrink-0 text-micro text-content/38 pt-[3px]">tutto il giorno</span>
          <div className="flex-1 min-w-0 flex flex-wrap gap-1">
            {tuttoIlGiorno.map((t) => (
              <span key={t.id} className="max-w-[240px]">
                <Pillola task={t} onOpen={onOpenTask} />
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Lo scorrimento sta qui, e la griglia dentro ha due misure: l'altezza
          che le spetta (`ALTEZZA_ORA` per ora) e un minimo pari a tutto lo
          spazio disponibile. Con poche ore in scena vince il minimo e la
          griglia riempie; con molte vince l'altezza e si scorre. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex" style={{ height: ore.length * ALTEZZA_ORA, minHeight: "100%" }}>
          {/* Le etichette. Ogni ora scritta al proprio bordo alto, spenta
              quando cade fuori dalla disponibilita'. */}
          <div
            className="w-[54px] shrink-0 grid border-r border-divider relative"
            style={{ gridTemplateRows: `repeat(${ore.length}, 1fr)` }}
          >
            {/* L'ora di adesso, scritta dove stanno le ore. Non sulla pista:
                li' coprirebbe le task, e questa colonna e' esattamente il posto
                in cui l'occhio va a cercare che ora e'. */}
            {mostraAdesso ? (
              <span
                className="absolute right-1.5 -translate-y-1/2 z-[3] px-1 rounded-sm text-micro tabular-nums font-medium leading-none py-[2px]"
                style={{
                  top: `${quota(minutiOra)}%`,
                  background: "var(--color-adesso)",
                  color: "var(--color-bg)",
                }}
              >
                {oraScritta}
              </span>
            ) : null}
            {ore.map((m) => {
              const dentro = intervalli.some((iv) => m >= inMinuti(iv.da) && m < inMinuti(iv.a));
              return (
                <span
                  key={m}
                  className={
                    "text-micro tabular-nums text-right pr-2 pt-1 leading-none " +
                    (dentro ? "text-content/55" : "text-content/28")
                  }
                >
                  {daMinuti(m)}
                </span>
              );
            })}
          </div>

          {/* La pista. `data-drop-ora` la dichiara bersaglio al motore delle
              card, e i due `data-fascia-*` gli dicono che ore vede: cosi' il
              motore ricava il minuto sotto il puntatore con una proporzione,
              senza sapere niente di calendari. */}
          <div
            ref={rifPista}
            className="flex-1 relative min-w-0"
            data-drop-ora={chiaveGiorno(giorno)}
            data-fascia-da={fascia.da}
            data-fascia-a={fascia.a}
          >
            {/* Le righe dell'ora, sotto tutto. */}
            <div
              className="absolute inset-0 grid"
              style={{ gridTemplateRows: `repeat(${ore.length}, 1fr)` }}
              aria-hidden="true"
            >
              {ore.map((m, i) => (
                <div key={m} className={i > 0 ? "border-t border-divider/60" : ""} />
              ))}
            </div>

            {/* Le bande di disponibilita'. Sopra le righe e sotto le task: sono
                il fondo su cui la giornata si legge, non un contenuto.

                **Grigio, non piu' l'accento** (11/09/2026). Tinte d'azzurro
                erano un colore che gareggiava con quello delle task, e la
                gara la vinceva lo sfondo: su una banda colorata i blocchi
                colorati si leggevano peggio, e la cosa piu' accesa della
                giornata finiva per essere l'orario di lavoro invece di quello
                che c'e' dentro. Adesso le ore buone sono **solo un grigio piu'
                chiaro del fondo**: si vedono come un rilievo, non come un
                segnale, e tutto il colore resta alle task. */}
            {intervalli.map((iv) => (
              <div
                key={`${iv.da}-${iv.a}`}
                aria-hidden="true"
                className="absolute left-0 right-0 bg-[color-mix(in_srgb,var(--color-content)_6%,transparent)] border-y border-divider"
                style={{
                  top: `${quota(inMinuti(iv.da))}%`,
                  height: `${((inMinuti(iv.a) - inMinuti(iv.da)) / ampiezza) * 100}%`,
                }}
              />
            ))}

            {/* La barra dell'adesso. Sopra le bande e sopra i blocchi, ed e'
                l'unica cosa che li scavalca: e' il riferimento rispetto a cui
                tutto il resto si legge — cosa e' passato, cosa deve ancora
                venire — e passarle sotto una task la renderebbe vera solo dove
                la giornata e' vuota.

                Oro e non accento: qui l'azzurro vuol dire "si puo' toccare", e
                questa e' la sola cosa in scena che non risponde a niente (vedi
                `--color-adesso` in theme.css). Due pixel, non uno: deve
                vincere sulle righe delle ore senza diventare un blocco. */}
            {mostraAdesso ? (
              <div
                aria-hidden="true"
                className="absolute left-0 right-0 h-[2px] z-[8] pointer-events-none"
                style={{ top: `${quota(minutiOra)}%`, background: "var(--color-adesso)" }}
              >
                <span
                  className="absolute -left-[1px] -top-[3px] w-[8px] h-[8px] rounded-full"
                  style={{ background: "var(--color-adesso)" }}
                />
              </div>
            ) : null}

            {blocchi.map((b) => {
              const inMano = gesto?.mosso && gesto.id === b.task.id;
              return (
                <CardCalendarTask
                  key={b.task.id}
                  title={b.task.title}
                  ora={etichettaOre(b)}
                  colore={b.task.project?.color}
                  scaduta={eInRitardo(b.task)}
                  done={b.task.done}
                  inMovimento={inMano}
                  onApri={() => {
                    if (mosso.current) {
                      mosso.current = false;
                      return;
                    }
                    onOpenTask?.(b.task.id);
                  }}
                  onPresa={(e) => prendi(e, b, "muovi")}
                  onRidimensiona={(e, capo) => prendi(e, b, capo)}
                  stile={{
                    top: `${quota(b.inizio)}%`,
                    height: `${((b.fine - b.inizio) / ampiezza) * 100}%`,
                    /* Il minimo per far stare una riga di titolo da 12.5px con
                       la sua imbottitura: sotto, un blocco da un quarto d'ora
                       non direbbe nemmeno come si chiama. */
                    minHeight: 26,
                    left: `calc(${(b.colonna / b.colonne) * 100}% + 3px)`,
                    width: `calc(${100 / b.colonne}% - 6px)`,
                    /* Sopra la linea di adesso mentre e' in mano, sotto quando
                       e' ferma: il blocco che si sta muovendo e' l'unica cosa
                       che l'occhio sta seguendo. */
                    zIndex: inMano ? 6 : 3,
                    opacity: gesto?.fuori && gesto.id === b.task.id ? 0.35 : 1,
                  }}
                />
              );
            })}

            {/* Chi sta arrivando da fuori, gia' in forma di blocco. */}
            {inArrivo ? (
              <CardCalendarTask
                fantasma
                title={inArrivo.titolo}
                ora={daMinuti(inArrivo.minuti)}
                stile={{
                  top: `${quota(inArrivo.minuti)}%`,
                  height: `${(DURATA_BLOCCO / ampiezza) * 100}%`,
                  minHeight: 26,
                  left: 3,
                  right: 3,
                  zIndex: 7,
                }}
              />
            ) : null}

            {/* Sopra l'Inbox il blocco **ridiventa una card**: e' la stessa
                trasformazione dell'arrivo, al contrario, e dice la stessa
                cosa — di la' le task non hanno un'ora, quindi non hanno una
                forma che l'ora possa dare. Il blocco sulla linea intanto
                sbiadisce: e' ancora li', ma non e' piu' dove sta andando. */}
            {gesto?.fuori
              ? /* In un portale su `body`, e non qui dentro: `position: fixed`
                   non basta a scavalcare un contenitore che ritaglia
                   (`overflow-hidden`) quando fra i due c'e' un elemento con una
                   trasformazione — e la board ne ha una, e' il movimento delle
                   colonne. Il fantasma restava ritagliato dentro la pista, cioe'
                   invisibile proprio dove serviva: sopra l'Inbox. E' lo stesso
                   motivo per cui il clone del motore delle card vive attaccato a
                   `body` (vedi `makeClone`). */
                createPortal(
                  <div
                    aria-hidden="true"
                    className="fixed z-[9999] w-[232px] pointer-events-none opacity-95"
                    style={{ left: gesto.px - 58, top: gesto.py - 18, boxShadow: "var(--shadow-drag)" }}
                  >
                    <InboxCard
                      id={gesto.id}
                      title={conOra.find((t) => t.id === gesto.id)?.title ?? ""}
                      due=""
                    />
                  </div>,
                  document.body,
                )
              : null}

            {chiesta ? (
              <ChiediOrari
                /* `key` su task e ora: i campi partono dall'ora del rilascio, e
                   un valore iniziale si legge una volta sola. Senza, una
                   seconda task lasciata sulla linea mentre la tendina e'
                   ancora aperta erediterebbe gli orari della prima. */
                key={`${chiesta.id}-${chiesta.minuti}`}
                minuti={chiesta.minuti}
                top={quota(chiesta.minuti)}
                onChiudi={() => setChiesta(null)}
                onConferma={async ({ inizio, fine }) => {
                  setChiesta(null);
                  await onAggiornaTask?.(
                    chiesta.id,
                    fine === null
                      ? { dueAt: istanteDel(giorno, inizio), startAt: null }
                      : {
                          startAt: istanteDel(giorno, inizio),
                          dueAt: istanteDel(giorno, fine),
                        },
                  );
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* La freccia del passo. E' il chevron dei menu girato: un secondo disegno per
   la stessa forma sarebbe una forma in piu' da tenere allineata. */
function Passo({ verso, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={
        "grid place-items-center w-8 h-8 rounded-lg border border-divider bg-transparent " +
        "cursor-pointer text-content/70 hover:border-accent hover:text-content"
      }
    >
      <ChevronDown size={13} className={verso === "indietro" ? "rotate-90" : "-rotate-90"} />
    </button>
  );
}

export function VistaCalendario({
  modo = "mese",
  tasks = [],
  onOpenTask,
  disponibilita = DISPONIBILITA_PREDEFINITA,
  onAggiornaTask,
  onTogliDalCalendario,
  refRilascio,
  anteprima,
}) {
  /* L'ancora e' **un giorno**, non un mese: cosi' una sola variabile regge
     tutti e tre i modi, e passando da mese a giorno si resta dove si era
     invece di tornare a oggi. */
  const [ancora, setAncora] = useState(() => aMezzanotte(new Date()));
  const oggi = useMemo(() => aMezzanotte(new Date()), []);

  /* I giorni in scena. Il mese ne mostra sempre settimane intere — comincia
     dal lunedi' prima del primo e finisce la domenica dopo l'ultimo — perche'
     una griglia a settimane monche non si legge per righe. */
  const giorni = useMemo(() => {
    if (modo === "giorno") return [ancora];
    if (modo === "settimana") {
      const da = lunediDi(ancora);
      return Array.from({ length: 7 }, (_, i) => piuGiorni(da, i));
    }
    const primo = new Date(ancora.getFullYear(), ancora.getMonth(), 1);
    const ultimo = new Date(ancora.getFullYear(), ancora.getMonth() + 1, 0);
    const da = lunediDi(primo);
    const quanti = Math.ceil((Math.round((ultimo - da) / 86_400_000) + 1) / 7) * 7;
    return Array.from({ length: quanti }, (_, i) => piuGiorni(da, i));
  }, [modo, ancora]);

  /* Le task per giorno, in una mappa sola: senza, ogni cella filtrerebbe
     l'intero elenco — quarantadue passate sulle stesse task per disegnare un
     mese. */
  const perGiorno = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      if (!t.dueAt) continue;
      const k = chiaveGiorno(new Date(t.dueAt));
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return m;
  }, [tasks]);

  const senzaScadenza = useMemo(() => tasks.filter((t) => !t.dueAt).length, [tasks]);

  const diGiorno = (d) => perGiorno.get(chiaveGiorno(d)) ?? [];

  const titolo = useMemo(() => {
    if (modo === "giorno") {
      return maiuscola(
        ancora.toLocaleDateString("it-IT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      );
    }
    if (modo === "settimana") {
      const da = lunediDi(ancora);
      const a = piuGiorni(da, 6);
      /* A cavallo di due mesi si dicono tutti e due, altrimenti il mese si
         scrive una volta sola: "8 – 14 settembre 2026", non "8 settembre –
         14 settembre 2026". */
      const stessoMese = da.getMonth() === a.getMonth() && da.getFullYear() === a.getFullYear();
      const sinistra = stessoMese
        ? String(da.getDate())
        : da.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
      const destra = a.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
      return maiuscola(`${sinistra} – ${destra} ${a.getFullYear()}`);
    }
    return maiuscola(ancora.toLocaleDateString("it-IT", { month: "long", year: "numeric" }));
  }, [modo, ancora]);

  /* Il passo e' quello del modo: un mese, una settimana, un giorno. Il mese si
     muove da giorno 1 e non dall'ancora, se no dal 31 gennaio si finirebbe al
     3 marzo. */
  const passo = (verso) => {
    setAncora((prec) => {
      if (modo === "giorno") return piuGiorni(prec, verso);
      if (modo === "settimana") return piuGiorni(prec, 7 * verso);
      return new Date(prec.getFullYear(), prec.getMonth() + verso, 1);
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col pr-3">
      {/* ═══ testata del periodo ═══
          Non e' la "riga 2" degli strumenti: quella dice come guardare le task
          e qui non c'e' niente da dire. Questa dice **quando** si sta
          guardando, ed e' parte del calendario come l'intestazione di una
          colonna e' parte del Kanban. */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <span className="text-lg font-medium tracking-[-0.015em] leading-[1.2]">{titolo}</span>
        {senzaScadenza > 0 ? (
          <span className="text-mini text-content/42">
            {senzaScadenza} senza scadenza, fuori dal calendario
          </span>
        ) : null}
        <span className="flex-1" />
        <Passo verso="indietro" label="Periodo precedente" onClick={() => passo(-1)} />
        <button
          type="button"
          onClick={() => setAncora(aMezzanotte(new Date()))}
          className={
            "inline-flex items-center h-8 px-3 rounded-lg border border-divider bg-transparent " +
            "cursor-pointer text-[12.5px] text-content/70 hover:border-accent hover:text-content"
          }
        >
          Oggi
        </button>
        <Passo verso="avanti" label="Periodo successivo" onClick={() => passo(1)} />
      </div>

      {/* ═══ mese ═══
          Sette colonne per tante righe quante ne servono, tutte della stessa
          altezza (`auto-rows-fr`): e' la forma che riempie lo spazio invece di
          lasciarlo in fondo, e tiene le settimane confrontabili fra loro.

          Le linee della griglia sono i **vuoti** fra le celle (`gap-px` su
          fondo divisore), non bordi: coi bordi ogni linea interna sarebbe
          doppia. */}
      {modo === "mese" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-7 gap-px shrink-0 pb-1.5">
            {GIORNI_CORTI.map((g) => (
              <span
                key={g}
                className="text-mini tracking-[0.1em] uppercase font-medium text-content/50 px-1.5"
              >
                {g}
              </span>
            ))}
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-7 auto-rows-fr gap-px bg-divider border border-divider rounded-xl overflow-hidden">
            {giorni.map((d) => {
              const fuori = d.getMonth() !== ancora.getMonth();
              const eOggi = chiaveGiorno(d) === chiaveGiorno(oggi);
              return (
                <div
                  key={chiaveGiorno(d)}
                  /* Ogni cella e' gia' un contenitore a se': quando arrivera' il
                     rilascio, il bersaglio e' questo. */
                  data-giorno={chiaveGiorno(d)}
                  className={`min-w-0 min-h-0 flex flex-col gap-1 p-1.5 ${fuori ? "bg-bg" : "bg-surface"}`}
                >
                  <span
                    className={
                      "shrink-0 grid place-items-center w-[19px] h-[19px] rounded-full text-mini tabular-nums " +
                      (eOggi
                        ? "bg-accent text-bg font-medium"
                        : fuori
                          ? "text-content/28"
                          : "text-content/62")
                    }
                  >
                    {d.getDate()}
                  </span>
                  {/* Scorre la cella, non la griglia: una giornata piena non
                      deve allungare la riga e con lei tutto il mese. */}
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
                    {diGiorno(d).map((t) => (
                      <Pillola key={t.id} task={t} onOpen={onOpenTask} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ═══ settimana ═══
          Sette colonne alte quanto lo spazio. Non c'e' la griglia delle ore, e
          non e' una mancanza: una scadenza qui e' un giorno — il core tiene un
          istante, ma nessuno lo sceglie — e disegnare ventiquattro fasce per
          appoggiare tutto a mezzogiorno sarebbe una griglia che dice il falso. */}
      {modo === "settimana" ? (
        <div className="flex-1 min-h-0 grid grid-cols-7 gap-px bg-divider border border-divider rounded-xl overflow-hidden">
          {giorni.map((d, i) => {
            const eOggi = chiaveGiorno(d) === chiaveGiorno(oggi);
            return (
              <div
                key={chiaveGiorno(d)}
                data-giorno={chiaveGiorno(d)}
                className="min-w-0 min-h-0 flex flex-col bg-surface"
              >
                <div className="flex items-center gap-1.5 px-2 pt-2 pb-1.5 shrink-0">
                  <span
                    className={
                      "grid place-items-center w-[19px] h-[19px] rounded-full text-mini tabular-nums " +
                      (eOggi ? "bg-accent text-bg font-medium" : "text-content/62")
                    }
                  >
                    {d.getDate()}
                  </span>
                  <span className="text-mini tracking-[0.1em] uppercase font-medium text-content/50 truncate">
                    {GIORNI_CORTI[i]}
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 px-1.5 pb-1.5">
                  {diGiorno(d).map((t) => (
                    <Pillola key={t.id} task={t} onOpen={onOpenTask} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ═══ giorno ═══
          L'unica estensione con le ore, ed e' il suo motivo di esistere: mese e
          settimana servono a trovare una task, il giorno a vedere **quando**
          sta. Sotto, la disponibilita' accesa dice quali di quelle ore sono
          davvero ore di lavoro. */}
      {modo === "giorno" ? (
        <GrigliaOre
          /* `key` sul giorno: il gesto in corso, la tendina degli orari e la
             fascia di ore appartengono al giorno che si sta guardando. Cambiando
             giorno non vanno riportati dietro, vanno dimenticati. */
          key={chiaveGiorno(ancora)}
          giorno={ancora}
          tasks={diGiorno(ancora)}
          disponibilita={disponibilita}
          onOpenTask={onOpenTask}
          onAggiornaTask={onAggiornaTask}
          onTogliDalCalendario={onTogliDalCalendario}
          refRilascio={refRilascio}
          anteprima={anteprima}
        />
      ) : null}
    </div>
  );
}
