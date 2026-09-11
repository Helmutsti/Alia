import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "../components/icons.jsx";

/* Vista Gantt — il tempo come larghezza.

   Sceglie l'opzione 2 delle tre provate in GalleriaGantt: **raggruppata per
   progetto, con la barra di riepilogo**. A sinistra l'elenco — intestazione del
   progetto e sotto le sue task; a destra le stesse righe distese sul tempo.
   L'intestazione porta una barra sua: da quando comincia la prima task a quando
   finisce l'ultima. E' la sola delle tre che risponde anche alla domanda grande
   — *quanto dura un progetto* — senza smettere di rispondere a quella piccola.

   Le altre due restano nella galleria, e non e' pigrizia: una scelta si legge
   meglio accanto a quelle che non sono state prese.

   ── I tre gesti (11/09/2026) ───────────────────────────────────────────────

   Sulla riga di una task, e **solo li'**, si puo' fare una cosa sola in tre
   modi, distinti da cosa c'e' sotto il dito e da quanto ci si muove:

     · **trascinare sul vuoto** disegna un intervallo, da dove si e' premuto a
       dove si lascia: `startAt` → `dueAt`;
     · **un clic sul vuoto** mette una scadenza secca in quella colonna: solo
       `dueAt`, perche' un clic non ha una larghezza e inventargliene una
       vorrebbe dire decidere una durata al posto di chi clicca;
     · **trascinare una barra** la sposta intera, durata compresa.

   Il gesto e' lo stesso in tutte e tre le forme — si preme, ci si muove, si
   lascia — e non c'e' niente da imparare: la differenza la fa il posto, e il
   cursore la annuncia prima che si prema (mirino sul vuoto, mano sulla barra).

   E un quarto modo, che e' una variante del terzo: **trascinare un capo della
   barra** ne sposta solo quello. Le maniglie sono larghe 9px — piu' del bordo
   che segnano, perche' un bersaglio di tre pixel non si prende — e compaiono
   in hover con il cursore che le annuncia. Su una barra troppo stretta per
   ospitarle non ci sono affatto: li' il gesto giusto e' ridisegnarla, che
   funziona a ogni scala.

   Tutto il resto **mostra e basta**. Zoom e passo del tempo non toccano i
   dati: sono il modo di guardarli. Un Gantt che non si puo' muovere nel tempo
   non mostra niente — mostra una settimana.

   ── Le scale ───────────────────────────────────────────────────────────────

   Quattro, dall'ora al mese, e le due lenti ci si muovono dentro un gradino
   alla volta. L'ora c'e' perche' una giornata e' un orizzonte come gli altri:
   chi lavora a blocchi di due ore ha bisogno di vederli, e un Gantt che parte
   dal giorno lo costringe a fidarsi.

   Cambia solo **quanto dura una colonna** e quanto e' larga; tutto il resto
   del disegno e' lo stesso. Sotto l'ora non si scende: il quarto d'ora e' la
   grana dei gesti del Calendario, non di una panoramica.

   ── La finestra ────────────────────────────────────────────────────────────

   Si vede **esattamente quello che ci sta**, e il resto si raggiunge con < e >.
   Non c'e' scorrimento orizzontale, ed e' una scelta: con due modi di muoversi
   nel tempo — la barra di scorrimento e le frecce — nessuno dei due e' il modo,
   e la finestra non ha mai una posizione che si possa dire. Le frecce spostano
   di mezza finestra, cosi' qualcosa di quello che si stava guardando resta in
   scena e l'occhio non deve ricominciare da capo. */

/* La scaletta dello zoom, dalla piu' fitta alla piu' larga: le lenti sono un
   indice qui dentro. `minuti` e' quanto dura una colonna, `larghezza` quanto e'
   larga in pixel.

   **Otto gradini e non quattro** (11/09/2026). Con quattro, ogni lente era un
   salto: dal giorno alla settimana la stessa barra passava da 44 pixel a 14, e
   quello che si stava guardando diventava un trattino. Uno zoom si usa per
   avvicinarsi *quanto serve*, e un gradino che triplica non lo permette — si
   scavalca sempre la misura giusta. Qui ogni gradino sta fra il mezzo e i due
   terzi del precedente: si arriva dove si vuole, e nessun passo fa perdere di
   vista quello che si stava guardando.

   Due gradini hanno la colonna piu' corta del giorno (un'ora e tre ore): sono
   la giornata e la mezza settimana, dove le ore sono il dato. Gli altri sei
   hanno la colonna di un giorno e cambiano solo quanto e' larga: dal giorno
   ampio al trimestre, dove una colonna e' un filo di quattro pixel e le
   etichette si diradano da se' (vedi `etichettata`).

   Gli `id` restano stabili perche' sono quello che finisce in `t_setting`:
   aggiungere un gradino in mezzo non deve rendere illeggibile la preferenza di
   chi ne aveva scelto un altro. */
export const SCALE_GANTT = [
  { id: "ora", label: "Ora", minuti: 60, larghezza: 56 },
  { id: "tre-ore", label: "Tre ore", minuti: 180, larghezza: 38 },
  { id: "giorni-larghi", label: "Giorni larghi", minuti: 1440, larghezza: 68 },
  { id: "giorni", label: "Giorni", minuti: 1440, larghezza: 44 },
  { id: "quindicina", label: "Quindicina", minuti: 1440, larghezza: 26 },
  { id: "settimane", label: "Settimane", minuti: 1440, larghezza: 15 },
  { id: "mesi", label: "Mesi", minuti: 1440, larghezza: 8 },
  { id: "trimestri", label: "Trimestri", minuti: 1440, larghezza: 4 },
];

/* Una colonna che dura meno di un giorno: e' la domanda che separa le due
   meta' della scaletta, e la fanno in cinque posti diversi. Meglio una
   funzione che cinque confronti con 1440 sparsi. */
const aOre = (scala) => scala.minuti < 1440;

export const eScalaGantt = (v) => SCALE_GANTT.some((s) => s.id === v);
const scalaDi = (id) => SCALE_GANTT.find((s) => s.id === id) ?? SCALE_GANTT[3];

const MS_MINUTO = 60_000;
const SIDEBAR = 268;
const ALTEZZA_RIGA = 34;

/* Il bordo sinistro della colonna che contiene un istante.

   Si conta **dalla mezzanotte di quel giorno**, non dall'inizio dei tempi: con
   colonne da tre ore le colonne devono cadere alle 0, 3, 6… di ogni giorno, e
   partire da un'origine assoluta le farebbe sfasare a ogni ora legale. Alla
   scala del giorno e oltre, il bordo e' la mezzanotte. */
function inizioColonna(data, scala) {
  const mezzanotte = new Date(data);
  mezzanotte.setHours(0, 0, 0, 0);
  if (!aOre(scala)) return mezzanotte;
  const minutiDelGiorno = (data.getTime() - mezzanotte.getTime()) / MS_MINUTO;
  return new Date(
    mezzanotte.getTime() + Math.floor(minutiDelGiorno / scala.minuti) * scala.minuti * MS_MINUTO,
  );
}

const piuColonne = (data, scala, n) => new Date(data.getTime() + n * scala.minuti * MS_MINUTO);

/* Quanto e' larga l'area del tempo. Si misura, non si assume: la finestra
   mostra esattamente le colonne che ci stanno, quindi il numero di colonne
   dipende da quanto spazio c'e' — e cambia ridimensionando la finestra. */
function useLarghezza(rif) {
  const [larghezza, setLarghezza] = useState(0);
  useLayoutEffect(() => {
    const el = rif.current;
    if (!el) return undefined;
    const misura = () => setLarghezza((prec) => {
      const w = el.clientWidth;
      return Math.abs(prec - w) < 0.5 ? prec : w;
    });
    misura();
    const ro = new ResizeObserver(misura);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rif]);
  return larghezza;
}

/* ── i due capi di una task sulla linea ──────────────────────────────────────

   Una task con `startAt` e `dueAt` e' un intervallo; con il solo `dueAt` e' un
   **istante**, e non diventa una barra di un giorno: sarebbe dire che quel
   giorno e' occupato, e non lo sappiamo. E' un rombo — dice "qui", non "da qui
   a qui". Stessa distinzione della vista Giorno del Calendario, dove un istante
   e' un blocco di un'ora *per convenzione dichiarata*: li' serviva qualcosa da
   prendere in mano, qui no.

   Alle scale dal giorno in su i capi si arrotondano alla giornata: una task che
   scade il 12 alle 9:00 occupa **tutto** il 12, se no la barra finirebbe a un
   terzo della colonna e sembrerebbe che il giorno sia mezzo libero. Alla scala
   delle ore invece gli istanti sono quelli veri: li' l'ora e' esattamente il
   dato che si sta guardando. */
function estremi(task, scala) {
  const fine = new Date(task.dueAt);
  const perGiorni = !aOre(scala);

  if (!task.startAt) {
    return { punto: perGiorni ? inizioColonna(fine, scala) : fine, istante: true };
  }
  const inizio = new Date(task.startAt);
  if (inizio >= fine) return { punto: perGiorni ? inizioColonna(fine, scala) : fine, istante: true };

  return {
    da: perGiorni ? inizioColonna(inizio, scala) : inizio,
    a: perGiorni ? piuColonne(inizioColonna(fine, scala), scala, 1) : fine,
    istante: false,
  };
}

/* ── i gruppi ──────────────────────────────────────────────────────────────
   Gli stessi della vista Lista raggruppata per progetto, e non un elenco a
   parte: un progetto senza task in scena resta in scena — e' un posto, e i
   posti non spariscono perche' sono vuoti (la stessa regola dei gruppi della
   Lista). "Senza progetto" compare solo se qualcosa ci sta dentro. */
/* **L'ordine dentro il gruppo e' quello manuale** (`position`), non la data
   (deciso l'11/09/2026).

   Ordinando per data l'elenco raccontava la sequenza — chi comincia prima sta
   piu' in alto — ma si riordinava a ogni gesto: disegnavi un intervallo e la
   riga saltava due posti piu' giu', sotto le mani, mentre la stavi ancora
   guardando. Un Gantt si usa lavorando sulle righe, e le righe che si muovono
   da sole sono il contrario di un piano.

   La sequenza temporale la raccontano gia' le barre, che e' il loro mestiere:
   l'elenco a sinistra puo' permettersi di stare fermo. */
const perPosizione = (a, b) => (a.position ?? 0) - (b.position ?? 0);

function gruppiDi(tasks, projects) {
  const gruppi = projects.map((p) => ({
    id: String(p.id),
    nome: p.name,
    colore: p.color,
    task: tasks.filter((t) => t.project?.id === p.id).sort(perPosizione),
  }));
  const orfane = tasks.filter((t) => !t.project).sort(perPosizione);
  if (orfane.length > 0) {
    gruppi.push({
      id: "__senza__",
      nome: "Senza progetto",
      colore: "var(--color-project-fallback)",
      task: orfane,
    });
  }
  return gruppi;
}

/* Da quando comincia la prima a quando finisce l'ultima. Le task senza data
   non partecipano: non hanno un capo da confrontare. */
function riepilogoDi(task, scala) {
  const capi = task.filter((t) => t.dueAt).map((t) => estremi(t, scala));
  if (capi.length === 0) return null;
  const da = Math.min(...capi.map((c) => (c.istante ? c.punto : c.da).getTime()));
  const a = Math.max(...capi.map((c) => (c.istante ? c.punto : c.a).getTime()));
  return { da: new Date(da), a: new Date(a) };
}

/* ── il disegno ───────────────────────────────────────────────────────────── */

function TestaTempo({ colonne, scala }) {
  /* Due righe: sopra il periodo lungo (il giorno alla scala delle ore, il mese
     alle altre), sotto la colonna. Le fasce sopra si fondono per costruzione —
     quante colonne di fila appartengono allo stesso periodo. */
  const fasce = [];
  for (const c of colonne) {
    const label = aOre(scala)
      ? c.data.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })
      : c.data.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const ultima = fasce.at(-1);
    if (ultima?.label === label) ultima.colonne += 1;
    else fasce.push({ label, colonne: 1 });
  }

  return (
    <div className="shrink-0">
      <div className="flex border-b border-divider">
        {fasce.map((f, i) => (
          <div
            key={`${f.label}-${i}`}
            className="text-micro tracking-[0.08em] uppercase text-content/45 px-1.5 py-1 border-r border-divider last:border-r-0 truncate"
            style={{ width: f.colonne * scala.larghezza }}
          >
            {f.label}
          </div>
        ))}
      </div>
      <div className="flex border-b border-divider">
        {colonne.map((c) => (
          <div
            key={c.data.getTime()}
            className={
              "flex flex-col items-center justify-center py-1 border-r border-divider/60 shrink-0 " +
              (c.festivo ? "bg-[color-mix(in_srgb,var(--color-content)_4%,transparent)]" : "")
            }
            style={{ width: scala.larghezza }}
          >
            {c.etichetta ? (
              <span
                className={
                  "text-micro tabular-nums leading-none " +
                  (c.adesso ? "px-1 py-[1px] rounded-sm font-medium" : "text-content/55")
                }
                style={c.adesso ? { background: "var(--color-adesso)", color: "var(--color-bg)" } : undefined}
              >
                {c.etichetta}
              </span>
            ) : null}
            {c.sottoEtichetta ? (
              <span className="text-micro text-content/32 leading-none mt-0.5">{c.sottoEtichetta}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* I capi arrivano da fuori: a riposo sono quelli scritti nel task, durante un
   gesto quelli provvisori. Cosi' la barra che si trascina e' **la stessa**
   barra, non una sua anteprima disegnata accanto. */
function Barra({ task, capi, x, scala, onApri, onPresa, onCapo, inMano = false, fantasma = false }) {
  const tinta = task.project?.color ?? "var(--color-project-fallback)";

  if (capi.istante) {
    const centro = x(capi.punto) + (scala.minuti >= 1440 ? scala.larghezza / 2 : 0);
    return (
      <button
        type="button"
        title={`${task.title} — scade ${capi.punto.toLocaleDateString("it-IT")}`}
        onClick={onApri}
        onPointerDown={onPresa}
        aria-label={task.title}
        className={
          "absolute top-1/2 w-[13px] h-[13px] rounded-[2px] border p-0 " +
          (fantasma ? "pointer-events-none " : "cursor-grab active:cursor-grabbing ")
        }
        style={{
          left: centro - 6.5,
          transform: "translateY(-50%) rotate(45deg)",
          background: `color-mix(in srgb, ${tinta} 55%, var(--color-elevated))`,
          borderColor: `color-mix(in srgb, ${tinta} 90%, transparent)`,
          opacity: fantasma ? 0.75 : 1,
          zIndex: inMano ? 5 : 2,
        }}
      />
    );
  }

  const da = x(capi.da);
  const a = x(capi.a);
  const larghezza = Math.max(a - da, 3);

  return (
    <button
      type="button"
      title={task.title}
      onClick={onApri}
      onPointerDown={onPresa}
      className={
        "group/barra absolute top-1/2 -translate-y-1/2 h-[18px] rounded-[3px] border flex items-center " +
        "overflow-hidden text-left px-0 " +
        (fantasma
          ? "pointer-events-none border-dashed "
          : "cursor-grab active:cursor-grabbing hover:brightness-110 ")
      }
      style={{
        left: da + 1,
        width: larghezza - 2,
        background: `color-mix(in srgb, ${tinta} 18%, var(--color-elevated))`,
        borderColor: fantasma
          ? "var(--color-accent)"
          : `color-mix(in srgb, ${tinta} 50%, transparent)`,
        opacity: fantasma ? 0.75 : 1,
        zIndex: inMano ? 5 : 2,
        boxShadow: inMano ? "var(--shadow-drag)" : undefined,
      }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: tinta }} />

      {/* I due capi. Dentro la barra e non a cavallo del bordo: a cavallo
          sporgerebbero sulla colonna accanto, e su barre vicine le maniglie di
          una finirebbero sopra l'altra. Sotto i 34px non si disegnano — una
          barra fatta di due sole maniglie non si potrebbe piu' spostare. */}
      {onCapo && !fantasma && larghezza >= 34
        ? ["inizio", "fine"].map((capo) => (
            <span
              key={capo}
              aria-hidden="true"
              onPointerDown={(e) => onCapo(e, capo)}
              className={
                "absolute top-0 bottom-0 w-[9px] cursor-ew-resize opacity-0 " +
                "group-hover/barra:opacity-100 transition-opacity duration-[120ms] z-[2] " +
                "flex items-center justify-center " +
                (capo === "inizio" ? "left-0" : "right-0")
              }
            >
              <span className="w-[2px] h-[10px] rounded-full bg-content/55" />
            </span>
          ))
        : null}

      {/* Il titolo dentro la barra solo se ci sta davvero: mezzo titolo
          troncato a quattro lettere non dice niente e sporca la barra. */}
      {larghezza > 96 ? (
        <span
          className={
            "text-micro leading-none truncate pl-2 pr-1.5 " +
            (task.done ? "line-through text-content/45" : "text-content/85")
          }
        >
          {task.title}
        </span>
      ) : null}
    </button>
  );
}

export function VistaGantt({
  tasks = [],
  projects = [],
  scala: idScala = "giorni",
  ancora,
  onOpenTask,
  onAggiornaTask,
  /* Quante colonne stanno in scena. Lo sa solo chi misura, cioe' questa vista;
     serve a chi comanda il passo, cioe' la testata — le frecce spostano di
     mezza finestra, e mezza finestra non e' un numero fisso: dipende da quanto
     e' larga la finestra e da quanto dura una colonna. */
  onFinestra,
}) {
  const scala = scalaDi(idScala);
  const rifTempo = useRef(null);
  const larghezzaTempo = useLarghezza(rifTempo);

  const [chiusi, setChiusi] = useState(() => new Set());
  const alterna = useCallback((id) => {
    setChiusi((prec) => {
      const p = new Set(prec);
      if (p.has(id)) p.delete(id);
      else p.add(id);
      return p;
    });
  }, []);

  /* Le colonne in scena: quelle che ci stanno, a partire dall'ancora. */
  const colonne = useMemo(() => {
    const quante = Math.max(1, Math.floor(larghezzaTempo / scala.larghezza));
    const inizio = inizioColonna(ancora, scala);
    const adesso = new Date();
    return Array.from({ length: quante }, (_, i) => {
      const data = piuColonne(inizio, scala, i);
      const perOre = aOre(scala);
      const giorno = data.getDay();
      /* Quali colonne portano un numero, e quali no: lo decide **la larghezza**
         e non il nome della scala. Sotto i 22px il numero non ci sta senza
         toccare quello accanto, e si scrive solo il lunedi'; sotto i 10 non ci
         sta nemmeno quello, e resta il primo del mese. Cosi' aggiungere un
         gradino alla scaletta non chiede di aggiungere un caso qui. */
      const etichettata =
        scala.larghezza >= 22 ? true : scala.larghezza >= 10 ? giorno === 1 : data.getDate() === 1;
      const fine = data.getTime() + scala.minuti * MS_MINUTO;
      return {
        data,
        festivo: !perOre && (giorno === 0 || giorno === 6),
        /* La colonna che contiene adesso, qualunque sia la sua durata: un
           confronto fra istanti, non fra ore o giorni. */
        adesso: adesso.getTime() >= data.getTime() && adesso.getTime() < fine,
        etichetta: etichettata
          ? perOre
            ? `${String(data.getHours()).padStart(2, "0")}`
            : String(data.getDate())
          : null,
        /* Il giorno della settimana solo dove c'e' spazio per due righe. */
        sottoEtichetta:
          !perOre && scala.larghezza >= 36
            ? data.toLocaleDateString("it-IT", { weekday: "short" })
            : null,
      };
    });
  }, [larghezzaTempo, scala, ancora]);

  useEffect(() => {
    onFinestra?.(colonne.length);
  }, [onFinestra, colonne.length]);

  const finestra = useMemo(() => {
    const da = inizioColonna(ancora, scala);
    return { da, a: piuColonne(da, scala, colonne.length) };
  }, [ancora, scala, colonne.length]);

  /* Da un istante alla sua ascissa. Fuori finestra il valore esce dai bordi, e
     va bene: le barre stanno in un riquadro che taglia, quindi una task che
     comincia prima entra dal bordo invece di comparire dal nulla. */
  const x = useCallback(
    (data) => ((data.getTime() - finestra.da.getTime()) / (scala.minuti * MS_MINUTO)) * scala.larghezza,
    [finestra.da, scala],
  );

  const gruppi = useMemo(() => gruppiDi(tasks, projects), [tasks, projects]);

  /* Le righe, in un elenco solo: l'elenco a sinistra e le corsie a destra sono
     due disegni della **stessa** sequenza, e costruirla una volta e' cio' che
     garantisce che restino allineate. */
  const righe = useMemo(() => {
    const out = [];
    for (const g of gruppi) {
      out.push({ tipo: "gruppo", chiave: `g:${g.id}`, gruppo: g, riepilogo: riepilogoDi(g.task, scala) });
      if (chiusi.has(g.id)) continue;
      for (const t of g.task) out.push({ tipo: "task", chiave: `t:${t.id}`, task: t, gruppo: g });
    }
    return out;
  }, [gruppi, chiusi, scala]);

  /* ── i gesti ───────────────────────────────────────────────────────────────

     Uno stato solo per tutti e tre: `tipo` dice quale, `colonne` dove siamo
     arrivati. Vive finche' il dito e' giu' e non scrive niente: la scrittura
     avviene una volta sola al rilascio, come nel Calendario e nel motore delle
     card, e per la stessa ragione — a ogni pixel si scriverebbe cento volte
     una cosa che l'utente non ha ancora finito di dire. */
  const [gesto, setGesto] = useState(null);
  const rifCorsie = useRef(null);
  const mosso = useRef(false);

  /* La colonna in cui cade un istante. L'inverso di `dataColonna`, e serve al
     ridimensionamento: il capo che **non** si sta trascinando resta dov'e', e
     per riscriverlo insieme all'altro bisogna sapere in che colonna sta. */
  const colonnaDi = useCallback(
    (data) => Math.floor((data.getTime() - finestra.da.getTime()) / (scala.minuti * 60_000)),
    [finestra.da, scala],
  );

  const colonnaSotto = useCallback(
    (ev) => {
      const el = rifCorsie.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const i = Math.floor((ev.clientX - r.left) / scala.larghezza);
      return Math.max(0, Math.min(colonne.length - 1, i));
    },
    [scala.larghezza, colonne.length],
  );

  const dataColonna = useCallback(
    (i) => piuColonne(finestra.da, scala, i),
    [finestra.da, scala],
  );

  /* Cosa si scrive, e l'unico posto dove questa vista tocca i dati.

     Alla scala del giorno le ore non si inventano: l'inizio prende le 9 — la
     stessa convenzione con cui l'app scrive una scadenza dal dettaglio — e la
     fine prende le 9 dell'ultimo giorno scelto, che il disegno copre per
     intero (vedi `estremi`). Un intervallo dentro un giorno solo diventa
     9→18: una giornata di lavoro, non un istante.

     Alla scala delle ore i capi sono quelli veri, e la fine e' il **bordo
     destro** dell'ultima colonna: trascinando dalle 10 alle 12 si intendono
     tre ore piene, non due. */
  const scriviIntervallo = useCallback(
    (task, iDa, iA) => {
      const da = dataColonna(Math.min(iDa, iA));
      const a = dataColonna(Math.max(iDa, iA));
      if (aOre(scala)) {
        return onAggiornaTask?.(task.id, {
          startAt: da.toISOString(),
          dueAt: piuColonne(a, scala, 1).toISOString(),
        });
      }
      const inizio = new Date(da);
      inizio.setHours(9, 0, 0, 0);
      const fine = new Date(a);
      fine.setHours(+da === +a ? 18 : 9, 0, 0, 0);
      return onAggiornaTask?.(task.id, {
        startAt: inizio.toISOString(),
        dueAt: fine.toISOString(),
      });
    },
    [dataColonna, onAggiornaTask, scala],
  );

  /* Un clic mette una scadenza secca: `dueAt` e basta, e `startAt` via se
     c'era. Non e' una perdita di dati per distrazione — e' quello che il gesto
     dice: "questa cosa scade qui", senza durata. */
  const scriviPunto = useCallback(
    (task, i) => {
      const d = new Date(dataColonna(i));
      if (!aOre(scala)) d.setHours(9, 0, 0, 0);
      return onAggiornaTask?.(task.id, { dueAt: d.toISOString(), startAt: null });
    },
    [dataColonna, onAggiornaTask, scala],
  );

  /* Spostare: tutto quello che la task ha addosso trasla dello stesso scarto,
     che si conta **in colonne** e non in pixel. Alla scala del giorno questo
     conserva l'ora: una task che cominciava alle 14 continua a cominciare alle
     14, tre giorni dopo. */
  const sposta = useCallback(
    (task, colonneScarto) => {
      const scarto = colonneScarto * scala.minuti * 60_000;
      const patch = { dueAt: new Date(new Date(task.dueAt).getTime() + scarto).toISOString() };
      if (task.startAt) {
        patch.startAt = new Date(new Date(task.startAt).getTime() + scarto).toISOString();
      }
      return onAggiornaTask?.(task.id, patch);
    },
    [onAggiornaTask, scala],
  );

  const prendi = useCallback(
    (ev, task, tipo, capo = null) => {
      if (ev.button !== 0 || !onAggiornaTask) return;
      ev.preventDefault();
      ev.stopPropagation();
      const partenza = colonnaSotto(ev);
      const xPartenza = ev.clientX;
      /* Ridimensionando, il capo fermo e' l'altro: si legge una volta qui e non
         si tocca piu'. `capi.a` e' il bordo **destro** dell'ultima colonna
         occupata, quindi la colonna e' quella prima. */
      const attuali = tipo === "capo" ? estremi(task, scala) : null;
      const fermo =
        attuali && !attuali.istante
          ? capo === "inizio"
            ? colonnaDi(attuali.a) - 1
            : colonnaDi(attuali.da)
          : partenza;
      let stato = {
        tipo,
        capo,
        id: task.id,
        da: tipo === "capo" ? fermo : partenza,
        a: partenza,
        scarto: 0,
        mosso: false,
      };
      mosso.current = false;
      setGesto(stato);

      const move = (e) => {
        if (!mosso.current && Math.abs(e.clientX - xPartenza) < 4) return;
        mosso.current = true;
        const qui = colonnaSotto(e);
        stato =
          tipo === "spostamento"
            ? { ...stato, scarto: qui - partenza, mosso: true }
            : /* disegno e capo finiscono nello stesso posto: due colonne, una
                 ferma e una che segue il dito. Che sia la prima o la seconda lo
                 dice gia' `da`, scritto alla partenza. */
              { ...stato, a: qui, mosso: true };
        setGesto(stato);
      };

      const up = async () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const finale = stato;
        setGesto(null);
        if (tipo === "disegno") {
          /* Fermo vuol dire clic, e un clic e' una scadenza secca. La soglia e'
             la stessa del motore delle card: sotto i 4px il dito non si e'
             mosso, si e' appoggiato. */
          if (!finale.mosso) return scriviPunto(task, finale.da);
          return scriviIntervallo(task, finale.da, finale.a);
        }
        /* Un capo tirato e basta: la barra resta dov'era. Non e' un clic che
           vuol dire qualcos'altro — sulle maniglie non c'e' un secondo gesto. */
        if (tipo === "capo") {
          if (!finale.mosso) return undefined;
          return scriviIntervallo(task, finale.da, finale.a);
        }
        if (!finale.mosso || finale.scarto === 0) return undefined;
        return sposta(task, finale.scarto);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [colonnaSotto, onAggiornaTask, scriviIntervallo, scriviPunto, sposta],
  );

  /* I capi da disegnare per una task: quelli scritti, o quelli provvisori se e'
     lei ad essere in mano. */
  const capiDi = useCallback(
    (task) => {
      if (!gesto?.mosso || gesto.id !== task.id) return estremi(task, scala);
      if (gesto.tipo === "disegno" || gesto.tipo === "capo") {
        const da = dataColonna(Math.min(gesto.da, gesto.a));
        const a = piuColonne(dataColonna(Math.max(gesto.da, gesto.a)), scala, 1);
        return { da, a, istante: false };
      }
      const scarto = gesto.scarto * scala.minuti * 60_000;
      const base = estremi(task, scala);
      return base.istante
        ? { ...base, punto: new Date(base.punto.getTime() + scarto) }
        : { ...base, da: new Date(base.da.getTime() + scarto), a: new Date(base.a.getTime() + scarto) };
    },
    [gesto, scala, dataColonna],
  );

  const adesso = new Date();
  const xAdesso = x(adesso);
  const mostraAdesso = xAdesso >= 0 && xAdesso <= colonne.length * scala.larghezza;

  return (
    <div className="flex-1 min-h-0 flex flex-col border border-divider rounded-xl bg-surface overflow-hidden mr-3">
      {/* Le due testate, sulla stessa riga: quella dell'elenco e quella del
          tempo. Restano ferme mentre le righe scorrono. */}
      <div className="flex shrink-0">
        <div
          className="shrink-0 border-r border-divider flex items-end px-3 pb-1"
          style={{ width: SIDEBAR, height: 45 }}
        >
          <span className="text-micro tracking-[0.08em] uppercase text-content/38">
            Progetto e task
          </span>
        </div>
        <div ref={rifTempo} className="flex-1 min-w-0 overflow-hidden">
          <TestaTempo colonne={colonne} scala={scala} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex">
        {/* ── l'elenco ── */}
        <div className="shrink-0 border-r border-divider" style={{ width: SIDEBAR }}>
          {righe.map((r) =>
            r.tipo === "gruppo" ? (
              <button
                key={r.chiave}
                type="button"
                onClick={() => alterna(r.gruppo.id)}
                aria-expanded={!chiusi.has(r.gruppo.id)}
                className={
                  "w-full flex items-center gap-2 px-3 border-b border-divider/50 cursor-pointer " +
                  "bg-[color-mix(in_srgb,var(--color-content)_4%,transparent)] text-left border-0 border-b"
                }
                style={{ height: ALTEZZA_RIGA }}
              >
                <ChevronDown
                  size={11}
                  className={`opacity-55 shrink-0 transition-transform duration-[120ms] ${chiusi.has(r.gruppo.id) ? "-rotate-90" : ""}`}
                />
                <span
                  className="w-[7px] h-[7px] rounded-full shrink-0"
                  style={{ background: r.gruppo.colore }}
                />
                <span className="text-mini tracking-[0.08em] uppercase font-medium text-content/72 truncate">
                  {r.gruppo.nome}
                </span>
                <span className="text-mini text-content/38">{r.gruppo.task.length}</span>
              </button>
            ) : (
              <div
                key={r.chiave}
                className="flex items-center gap-2 pl-[30px] pr-3 border-b border-divider/50"
                style={{ height: ALTEZZA_RIGA }}
              >
                <span
                  className={`text-meta truncate ${r.task.done ? "line-through text-content/45" : ""}`}
                >
                  {r.task.title}
                </span>
                {/* Una task senza scadenza non ha un posto nel tempo, e la riga
                    resta vuota a destra. Dirlo qui e' meglio che lasciar
                    cercare: la riga c'e', la barra no, e il motivo si legge. */}
                {r.task.dueAt ? (
                  r.task.milestone ? (
                    <span className="text-micro text-content/32 shrink-0 ml-auto">
                      {r.task.milestone.label}
                    </span>
                  ) : null
                ) : (
                  <span className="text-micro text-content/28 shrink-0 ml-auto">senza date</span>
                )}
              </div>
            ),
          )}
        </div>

        {/* ── il tempo ── */}
        <div ref={rifCorsie} className="flex-1 min-w-0 relative overflow-hidden">
          {/* Il fondo: le colonne, i festivi in ombra. Una volta sola, alto
              quanto tutte le righe. */}
          <div className="absolute inset-0 flex pointer-events-none">
            {colonne.map((c) => (
              <div
                key={c.data.getTime()}
                className={
                  "border-r border-divider/40 shrink-0 " +
                  (c.festivo ? "bg-[color-mix(in_srgb,var(--color-content)_4%,transparent)]" : "")
                }
                style={{ width: scala.larghezza }}
              />
            ))}
          </div>

          {/* Adesso: la stessa barra d'oro della vista Giorno, in verticale.
              Sopra le barre, perche' e' il riferimento rispetto a cui si legge
              se una cosa e' in ritardo o deve ancora venire. */}
          {mostraAdesso ? (
            <div
              aria-hidden="true"
              className="absolute top-0 bottom-0 w-[2px] z-[4] pointer-events-none"
              style={{ left: xAdesso, background: "var(--color-adesso)" }}
            />
          ) : null}

          {righe.map((r) =>
            r.tipo === "gruppo" ? (
              <div
                key={r.chiave}
                className="relative border-b border-divider/50 bg-[color-mix(in_srgb,var(--color-content)_4%,transparent)]"
                style={{ height: ALTEZZA_RIGA }}
              >
                {/* La barra di riepilogo: piu' bassa, senza titolo, senza
                    bordo. Dice una **misura** — da quando a quando — non una
                    cosa da fare, e confonderla con una task sarebbe il modo
                    piu' rapido di rendere illeggibile il gruppo. */}
                {r.riepilogo ? (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-[7px] rounded-full opacity-70"
                    style={{
                      left: x(r.riepilogo.da) + 1,
                      width: Math.max(x(r.riepilogo.a) - x(r.riepilogo.da) - 2, 3),
                      background: `color-mix(in srgb, ${r.gruppo.colore} 55%, transparent)`,
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <div
                key={r.chiave}
                onPointerDown={(e) => prendi(e, r.task, "disegno")}
                className={
                  "relative border-b border-divider/50 " +
                  (onAggiornaTask ? "cursor-crosshair" : "")
                }
                style={{ height: ALTEZZA_RIGA }}
              >
                {r.task.dueAt || (gesto?.mosso && gesto.id === r.task.id) ? (
                  <Barra
                    task={r.task}
                    /* `capiDi` risponde per tutti e tre i casi: i capi
                       scritti, quelli spostati, quelli che si stanno
                       disegnando — anche su una task che non aveva date, che
                       e' il caso per cui il gesto esiste. */
                    capi={capiDi(r.task)}
                    x={x}
                    scala={scala}
                    inMano={gesto?.mosso && gesto.id === r.task.id}
                    fantasma={
                      gesto?.mosso && gesto.id === r.task.id && gesto.tipo !== "spostamento"
                    }
                    onApri={() => {
                      if (mosso.current) {
                        mosso.current = false;
                        return;
                      }
                      onOpenTask?.(r.task.id);
                    }}
                    onPresa={(e) => prendi(e, r.task, "spostamento")}
                    onCapo={(e, capo) => prendi(e, r.task, "capo", capo)}
                  />
                ) : null}
              </div>
            ),
          )}

          {righe.length === 0 ? (
            <p className="text-meta text-content/45 m-0 p-4">
              Nessun progetto da mostrare.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
