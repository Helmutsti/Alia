import { useState } from "react";
import { ChevronDown, PathIcon } from "./components/icons.jsx";
import { VIEW_ICONS } from "./inbox/data.js";

/* Galleria del Gantt — **solo anteprima, non entra nell'app**.

   Serve a scegliere, non a funzionare: la vista Gantt e' ancora bloccata, e
   qui dentro non succede niente. I comandi sono disegnati e spenti, le barre
   non si prendono, lo zoom non zooma. La domanda a cui questa pagina risponde
   e' una sola: **come stanno insieme l'elenco a sinistra e il tempo a
   destra**, che e' la sola decisione da cui discende tutto il resto.

   Tre opzioni, e non tre stili della stessa: cambiano *cosa* e' una riga.
     1. una riga = una task
     2. una riga = una task, ma raggruppate per progetto
     3. una riga = un progetto, e le sue task ci stanno tutte dentro

   La testata e' quella chiesta e non cambia fra le tre, quindi si disegna una
   volta sola qui in cima: filtro progetti a sinistra, le due lenti dello zoom,
   il cursore del tempo, il selettore vista a destra.

   Uso: `npm run dev:renderer` → http://localhost:5173/preview.html?screen=gantt */

/* ── il banco di prova ──────────────────────────────────────────────────────
   Dati finti, e devono esserlo: il dataset di anteprima (`demoDataset`) non ha
   nessun `startAt`, quindi un Gantt costruito su quello sarebbe vuoto — cioe'
   non direbbe niente proprio sulla cosa da giudicare. Qui ci sono intervalli
   veri, di lunghezze diverse, con dentro i due casi che un Gantt deve saper
   dire: le task che durano e quelle che scadono e basta. */

const PROGETTI = {
  casa: { nome: "Casa", colore: "var(--color-project-casa)" },
  lavoro: { nome: "Lavoro", colore: "var(--color-project-lavoro)" },
  salute: { nome: "Salute", colore: "var(--color-project-salute)" },
  personale: { nome: "Personale", colore: "var(--color-project-personale)" },
};

/* `da`/`a` sono giorni di scarto da oggi. `a` senza `da` e' una scadenza
   secca: nel modello e' una task con `dueAt` e senza `startAt`, ed e' il caso
   piu' frequente di tutti. */
const TASK = [
  { titolo: "Ristrutturazione del bagno", progetto: "casa", fase: "Lavori", da: -6, a: 10 },
  { titolo: "Pagare la bolletta della luce", progetto: "casa", a: 0 },
  { titolo: "Portare l’auto in officina", progetto: "casa", da: 4, a: 5 },
  { titolo: "Preparare la presentazione trimestrale", progetto: "lavoro", fase: "Clienti", da: -2, a: 3 },
  { titolo: "Rivedere il preventivo del fornitore", progetto: "lavoro", fase: "Acquisti", da: 1, a: 6 },
  { titolo: "Rinnovo contratto fornitore", progetto: "lavoro", fase: "Acquisti", a: 9 },
  { titolo: "Ciclo di visite di controllo", progetto: "salute", da: 2, a: 8 },
  { titolo: "Allenamento in palestra", progetto: "salute", a: -1, fatto: true },
  { titolo: "Comprare il regalo di compleanno", progetto: "personale", da: 5, a: 6 },
  { titolo: "Preparare la valigia per Firenze", progetto: "personale", da: 8, a: 10 },
];

const DA = -7;
const A = 14;
const GIORNI = Array.from({ length: A - DA + 1 }, (_, i) => DA + i);

const dataDi = (scarto) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + scarto);
  return d;
};

const NOMI_GIORNO = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const eFestivo = (scarto) => [0, 6].includes(dataDi(scarto).getDay());

/* Le due scale. Non sono lo zoom vero — quello e' un comando dell'app, e qui
   non funziona niente — ma senza vedere lo stesso disegno stretto e largo non
   si puo' giudicare: a 44px al giorno tutto sembra comodo, ed e' a 16 che si
   scopre cosa non si legge piu'. */
const SCALE = {
  giorni: { label: "Giorni", larghezza: 44 },
  settimane: { label: "Settimane", larghezza: 16 },
};

const SIDEBAR = 268;

/* ── i pezzi comuni ─────────────────────────────────────────────────────── */

/* La testa del tempo: mese sopra, giorni sotto. Alla scala stretta i numeri
   non ci stanno tutti e si scrivono solo i lunedi': un'intestazione illeggibile
   e' peggio di una rada. */
function TestaTempo({ scala }) {
  const larghezza = SCALE[scala].larghezza;
  const mesi = [];
  for (const g of GIORNI) {
    const d = dataDi(g);
    const chiave = `${d.getFullYear()}-${d.getMonth()}`;
    const ultimo = mesi.at(-1);
    if (ultimo?.chiave === chiave) ultimo.giorni += 1;
    else mesi.push({ chiave, giorni: 1, label: d.toLocaleDateString("it-IT", { month: "long" }) });
  }

  return (
    <div className="shrink-0">
      <div className="flex border-b border-divider">
        {mesi.map((m) => (
          <div
            key={m.chiave}
            className="text-micro tracking-[0.08em] uppercase text-content/45 px-1.5 py-1 border-r border-divider last:border-r-0 truncate"
            style={{ width: m.giorni * larghezza }}
          >
            {m.label}
          </div>
        ))}
      </div>
      <div className="flex border-b border-divider">
        {GIORNI.map((g) => {
          const d = dataDi(g);
          const oggi = g === 0;
          const rado = scala === "settimane" && d.getDay() !== 1;
          return (
            <div
              key={g}
              className={
                "flex flex-col items-center justify-center py-1 border-r border-divider/60 shrink-0 " +
                (eFestivo(g) ? "bg-[color-mix(in_srgb,var(--color-content)_4%,transparent)]" : "")
              }
              style={{ width: larghezza }}
            >
              {rado ? null : (
                <>
                  {scala === "giorni" ? (
                    <span className="text-micro text-content/38 leading-none">{NOMI_GIORNO[d.getDay()]}</span>
                  ) : null}
                  <span
                    className={
                      "text-micro tabular-nums leading-none mt-0.5 " +
                      (oggi ? "px-1 py-[1px] rounded-sm font-medium" : "text-content/55")
                    }
                    style={oggi ? { background: "var(--color-adesso)", color: "var(--color-bg)" } : undefined}
                  >
                    {d.getDate()}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Il fondo della griglia: le colonne dei giorni, i festivi in ombra, e la
   barra d'oro di oggi — la stessa del Calendario, e per la stessa ragione. */
function FondoGriglia({ scala, altezza }) {
  const larghezza = SCALE[scala].larghezza;
  return (
    <div className="absolute inset-0 flex pointer-events-none" style={{ height: altezza }}>
      {GIORNI.map((g) => (
        <div
          key={g}
          className={
            "border-r border-divider/40 shrink-0 relative " +
            (eFestivo(g) ? "bg-[color-mix(in_srgb,var(--color-content)_4%,transparent)]" : "")
          }
          style={{ width: larghezza }}
        >
          {g === 0 ? (
            <span
              className="absolute top-0 bottom-0 left-0 w-[2px]"
              style={{ background: "var(--color-adesso)" }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

const sinistra = (t, larghezza) => ((t.da ?? t.a) - DA) * larghezza;
const ampiezza = (t, larghezza) => ((t.a - (t.da ?? t.a)) + 1) * larghezza;

/* La barra. Stessa lingua della card del Calendario: lavata della tinta del
   progetto, bordo della stessa tinta piu' saturo. Il titolo ci sta dentro
   quando c'e' posto — su una barra di sedici pixel non ci starebbe mai, e
   scriverlo fuori a destra lo farebbe scontrare con la barra dopo. */
function Barra({ task, scala, conTitolo = true, stile }) {
  const larghezza = SCALE[scala].larghezza;
  const tinta = PROGETTI[task.progetto].colore;
  const largo = ampiezza(task, larghezza);
  const scadenzaSecca = task.da == null;

  if (scadenzaSecca) {
    /* Una scadenza secca non e' una barra corta: e' un **istante**, e disegnarla
       come un rettangolo di un giorno direbbe che quel giorno e' occupato.
       Un rombo dice "qui", non "da qui a qui". */
    return (
      <span
        title={task.titolo}
        className="absolute top-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border"
        style={{
          left: sinistra(task, larghezza) + larghezza / 2 - 6,
          width: 12,
          height: 12,
          background: `color-mix(in srgb, ${tinta} 55%, var(--color-elevated))`,
          borderColor: `color-mix(in srgb, ${tinta} 90%, transparent)`,
          ...stile,
        }}
      />
    );
  }

  return (
    <div
      title={task.titolo}
      className="absolute top-1/2 -translate-y-1/2 h-[18px] rounded-[3px] border flex items-center px-1.5 overflow-hidden"
      style={{
        left: sinistra(task, larghezza) + 1,
        width: largo - 2,
        background: `color-mix(in srgb, ${tinta} 18%, var(--color-elevated))`,
        borderColor: `color-mix(in srgb, ${tinta} 50%, transparent)`,
        ...stile,
      }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: tinta }} />
      {conTitolo && largo > 96 ? (
        <span
          className={
            "text-micro leading-none truncate pl-1.5 " +
            (task.fatto ? "line-through text-content/45" : "text-content/85")
          }
        >
          {task.titolo}
        </span>
      ) : null}
    </div>
  );
}

function RigaElenco({ children, altezza = 34, rientro = 0, forte = false }) {
  return (
    <div
      className={
        "flex items-center gap-2 border-b border-divider/50 px-3 shrink-0 " +
        (forte ? "bg-[color-mix(in_srgb,var(--color-content)_4%,transparent)]" : "")
      }
      style={{ height: altezza, paddingLeft: 12 + rientro }}
    >
      {children}
    </div>
  );
}

function Pallino({ progetto }) {
  return (
    <span
      className="w-[7px] h-[7px] rounded-full shrink-0"
      style={{ background: PROGETTI[progetto].colore }}
    />
  );
}

/* ── la testata, uguale per tutte e tre ─────────────────────────────────── */

const CTL =
  "inline-flex items-center gap-[7px] h-8 px-3 rounded-lg border border-divider bg-transparent " +
  "cursor-default text-[12.5px]";
const PICK =
  "inline-flex items-center gap-[9px] h-8 border-0 bg-transparent cursor-default text-content " +
  "font-medium tracking-[-0.015em] px-1.5 rounded-md leading-[1.2] text-lg";

function Lente({ segno }) {
  return (
    <button type="button" className="grid place-items-center w-8 h-8 rounded-lg border border-divider bg-transparent cursor-default text-content/70">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
        <path d={segno === "+" ? "M8 11h6M11 8v6" : "M8 11h6"} />
      </svg>
    </button>
  );
}

function Testata() {
  return (
    <div className="flex items-center h-[34px] px-1">
      <button type="button" className={PICK}>
        <span className="w-[9px] h-[9px] rounded-full shrink-0 border-[1.4px] border-dashed border-content/55" />
        Tutti i progetti
        <ChevronDown size={14} className="opacity-65 shrink-0 ml-0.5" />
      </button>
      <span className="ml-2 text-sm text-content/42">10 task</span>

      <span className="flex-1" />

      {/* Le due lenti e le due frecce: la stessa domanda in due meta' —
          *quanto* tempo guardo e *quale* — quindi stanno insieme.

          Il cursore a scorrimento che stava qui e' durato una revisione: un
          cursore dice "sei a un terzo di qualcosa", e di quale qualcosa non si
          sa. Le frecce dicono avanti e indietro, che e' l'unica cosa che si
          vuole davvero fare. */}
      <div className="flex items-center gap-1.5 mr-3">
        <Lente segno="+" />
        <Lente segno="−" />
      </div>
      <div className="flex items-center gap-1.5 mr-3">
        <button type="button" className="grid place-items-center w-8 h-8 rounded-lg border border-divider bg-transparent cursor-default text-content/70">
          <ChevronDown size={13} className="rotate-90" />
        </button>
        <button type="button" className={CTL}>Oggi</button>
        <button type="button" className="grid place-items-center w-8 h-8 rounded-lg border border-divider bg-transparent cursor-default text-content/70">
          <ChevronDown size={13} className="-rotate-90" />
        </button>
      </div>

      <button type="button" className={CTL}>
        <PathIcon d={VIEW_ICONS.gantt} size={14} />
        Gantt
        <ChevronDown size={11} className="opacity-70" />
      </button>
    </div>
  );
}

/* ── opzione 1 — una riga, una task ─────────────────────────────────────── */

function OpzioneElenco({ scala }) {
  const larghezza = SCALE[scala].larghezza;
  return (
    <Quadro scala={scala}>
      <div className="w-[268px] shrink-0 border-r border-divider">
        <div className="h-[45px] border-b border-divider flex items-end px-3 pb-1">
          <span className="text-micro tracking-[0.08em] uppercase text-content/38">Task</span>
        </div>
        {TASK.map((t) => (
          <RigaElenco key={t.titolo}>
            <Pallino progetto={t.progetto} />
            <span className={`text-meta truncate ${t.fatto ? "line-through text-content/45" : ""}`}>
              {t.titolo}
            </span>
          </RigaElenco>
        ))}
      </div>

      <div className="flex-1 overflow-x-auto">
        <div style={{ width: GIORNI.length * larghezza }}>
          <TestaTempo scala={scala} />
          <div className="relative">
            <FondoGriglia scala={scala} altezza={TASK.length * 34} />
            {TASK.map((t) => (
              <div key={t.titolo} className="relative border-b border-divider/50" style={{ height: 34 }}>
                <Barra task={t} scala={scala} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Quadro>
  );
}

/* ── opzione 2 — raggruppate per progetto ───────────────────────────────── */

function perProgetto() {
  return Object.entries(PROGETTI).map(([id, p]) => {
    const task = TASK.filter((t) => t.progetto === id);
    const da = Math.min(...task.map((t) => t.da ?? t.a));
    const a = Math.max(...task.map((t) => t.a));
    return { id, ...p, task, riepilogo: { progetto: id, da, a, titolo: p.nome } };
  });
}

function OpzioneGruppi({ scala }) {
  const larghezza = SCALE[scala].larghezza;
  const gruppi = perProgetto();
  const righe = gruppi.reduce((n, g) => n + 1 + g.task.length, 0);

  return (
    <Quadro scala={scala}>
      <div className="w-[268px] shrink-0 border-r border-divider">
        <div className="h-[45px] border-b border-divider flex items-end px-3 pb-1">
          <span className="text-micro tracking-[0.08em] uppercase text-content/38">Progetto e task</span>
        </div>
        {gruppi.map((g) => (
          <div key={g.id}>
            <RigaElenco forte>
              <ChevronDown size={11} className="opacity-55 shrink-0" />
              <Pallino progetto={g.id} />
              <span className="text-mini tracking-[0.08em] uppercase font-medium text-content/72 truncate">
                {g.nome}
              </span>
              <span className="text-mini text-content/38">{g.task.length}</span>
            </RigaElenco>
            {g.task.map((t) => (
              <RigaElenco key={t.titolo} rientro={18}>
                <span className={`text-meta truncate ${t.fatto ? "line-through text-content/45" : ""}`}>
                  {t.titolo}
                </span>
                {t.fase ? (
                  <span className="text-micro text-content/38 shrink-0">{t.fase}</span>
                ) : null}
              </RigaElenco>
            ))}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-x-auto">
        <div style={{ width: GIORNI.length * larghezza }}>
          <TestaTempo scala={scala} />
          <div className="relative">
            <FondoGriglia scala={scala} altezza={righe * 34} />
            {gruppi.map((g) => (
              <div key={g.id}>
                {/* La barra di riepilogo: da quando comincia la prima a quando
                    finisce l'ultima. Piu' bassa e senza titolo — dice una
                    misura, non una cosa da fare. */}
                <div
                  className="relative border-b border-divider/50 bg-[color-mix(in_srgb,var(--color-content)_4%,transparent)]"
                  style={{ height: 34 }}
                >
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-[7px] rounded-full opacity-70"
                    style={{
                      left: sinistra(g.riepilogo, larghezza) + 1,
                      width: ampiezza(g.riepilogo, larghezza) - 2,
                      background: `color-mix(in srgb, ${g.colore} 55%, transparent)`,
                    }}
                  />
                </div>
                {g.task.map((t) => (
                  <div key={t.titolo} className="relative border-b border-divider/50" style={{ height: 34 }}>
                    <Barra task={t} scala={scala} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Quadro>
  );
}

/* ── opzione 3 — una corsia per progetto ────────────────────────────────── */

/* Le task di un progetto su una riga sola. Quelle che si sovrappongono non
   possono stare una sopra l'altra, quindi la corsia si sdoppia: e' lo stesso
   impacchettamento del Calendario, girato di novanta gradi. */
function corsie(task) {
  const ordinate = [...task].sort((x, y) => (x.da ?? x.a) - (y.da ?? y.a));
  const piani = [];
  for (const t of ordinate) {
    const inizio = t.da ?? t.a;
    let piano = piani.findIndex((fine) => fine < inizio);
    if (piano === -1) piano = piani.length;
    piani[piano] = t.a;
    t.piano = piano;
  }
  return { task: ordinate, piani: Math.max(1, piani.length) };
}

function OpzioneCorsie({ scala }) {
  const larghezza = SCALE[scala].larghezza;
  const gruppi = perProgetto().map((g) => ({ ...g, ...corsie(g.task) }));
  const altezzaDi = (g) => 14 + g.piani * 26;

  return (
    <Quadro scala={scala}>
      <div className="w-[268px] shrink-0 border-r border-divider">
        <div className="h-[45px] border-b border-divider flex items-end px-3 pb-1">
          <span className="text-micro tracking-[0.08em] uppercase text-content/38">Progetto</span>
        </div>
        {gruppi.map((g) => (
          <div
            key={g.id}
            className="flex items-center gap-2 border-b border-divider/50 px-3"
            style={{ height: altezzaDi(g) }}
          >
            <Pallino progetto={g.id} />
            <span className="text-meta truncate">{g.nome}</span>
            <span className="text-mini text-content/38 ml-auto">{g.task.length}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-x-auto">
        <div style={{ width: GIORNI.length * larghezza }}>
          <TestaTempo scala={scala} />
          <div className="relative">
            <FondoGriglia
              scala={scala}
              altezza={gruppi.reduce((n, g) => n + altezzaDi(g), 0)}
            />
            {gruppi.map((g) => (
              <div
                key={g.id}
                className="relative border-b border-divider/50"
                style={{ height: altezzaDi(g) }}
              >
                {g.task.map((t) => (
                  <Barra
                    key={t.titolo}
                    task={t}
                    scala={scala}
                    stile={{ top: 7 + t.piano * 26, transform: "none" }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Quadro>
  );
}

/* ── la cornice ─────────────────────────────────────────────────────────── */

function Quadro({ children, scala }) {
  return (
    <div className="w-[1180px] rounded-xl border border-divider bg-surface overflow-hidden flex">
      {children}
    </div>
  );
}

function Opzione({ n, titolo, nota, pro, contro, children }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-3">
        <span className="text-mini tracking-[0.1em] uppercase text-accent">Opzione {n}</span>
        <span className="text-base font-medium">{titolo}</span>
      </div>
      <p className="m-0 text-meta text-content/62 max-w-[880px]">{nota}</p>
      {children}
      <div className="flex gap-6 text-mini">
        <span className="text-content/55">
          <span style={{ color: "var(--color-confirm)" }}>+ </span>
          {pro}
        </span>
        <span className="text-content/55">
          <span style={{ color: "var(--color-danger)" }}>− </span>
          {contro}
        </span>
      </div>
    </div>
  );
}

export function GalleriaGantt() {
  const [scala, setScala] = useState("giorni");

  return (
    <div className="flex flex-col gap-10 pb-16">
      <div className="flex flex-col gap-2 w-[1180px]">
        <h1 className="m-0 text-xl font-medium tracking-[-0.015em]">Vista Gantt — tre opzioni</h1>
        <p className="m-0 text-meta text-content/62 max-w-[880px]">
          Niente funziona: i comandi sono disegnati e spenti, le barre non si prendono. La domanda
          è una sola — <strong className="font-medium text-content">cosa è una riga</strong> — e da
          lì discende tutto il resto. La testata è quella chiesta e non cambia fra le tre.
        </p>
        <p className="m-0 text-meta text-content/45 max-w-[880px]">
          <strong className="font-medium text-content">Scelta l’opzione 2</strong> (11/09/2026):
          è quella che sta in <code className="text-content/62">inbox/VistaGantt.jsx</code>. Le
          altre due restano qui, e non è pigrizia — una scelta si legge meglio accanto a quelle
          che non sono state prese.
        </p>
        <p className="m-0 text-meta text-content/45 max-w-[880px]">
          In tutte: le barre sono lavate della tinta del progetto come i blocchi del Calendario, i
          giorni festivi sono in ombra, oggi è la barra d’oro, e una <em>scadenza secca</em> (task
          con solo <code className="text-content/62">dueAt</code>) è un rombo e non una barra corta
          — dice “qui”, non “da qui a qui”.
        </p>

        {/* Comando della galleria, non del disegno: serve a vedere lo stesso
            Gantt stretto e largo, che e' l'unico modo di giudicarlo. */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-mini text-content/38">Scala di prova:</span>
          {Object.entries(SCALE).map(([id, s]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScala(id)}
              className={
                "px-2.5 py-1 rounded-md border text-[12px] cursor-pointer bg-transparent " +
                (scala === id ? "border-accent text-accent" : "border-divider text-content/55")
              }
            >
              {s.label}
            </button>
          ))}
          <span className="text-mini text-content/28 ml-2">
            (nell’app sarà lo zoom, qui è solo per confrontare)
          </span>
        </div>
      </div>

      <div className="w-[1180px] rounded-xl border border-divider bg-surface px-3 py-2">
        <Testata />
      </div>

      <Opzione
        n={1}
        titolo="Elenco piatto — una riga, una task"
        nota="L’elenco a sinistra è quello della vista Lista senza gruppi: ogni task ha la sua riga, il pallino dice di chi è. È il Gantt che tutti riconoscono."
        pro="si legge per righe, e una task sta sempre in una riga sola"
        contro="con quaranta task diventa un elenco lungo, e il progetto lo dice solo un pallino"
      >
        <OpzioneElenco scala={scala} />
      </Opzione>

      <Opzione
        n={2}
        titolo="Raggruppato per progetto — con la barra di riepilogo"
        nota="Le stesse righe dell’opzione 1, ma sotto un’intestazione per progetto che porta la propria barra: da quando comincia la prima task a quando finisce l’ultima. I gruppi si chiudono."
        pro="risponde anche alla domanda grande: quanto dura un progetto"
        contro="una riga su tre non è una task, e a progetti chiusi il Gantt si svuota"
      >
        <OpzioneGruppi scala={scala} />
      </Opzione>

      <Opzione
        n={3}
        titolo="Corsie — una riga, un progetto"
        nota="A sinistra ci sono solo i progetti; a destra le loro task stanno tutte nella stessa corsia, che si sdoppia solo dove si sovrappongono. È la vista più corta delle tre."
        pro="tutto il carico su poche righe: si vede subito dove si accavalla"
        contro="il titolo della task esiste solo dentro la barra, e nelle barre corte sparisce"
      >
        <OpzioneCorsie scala={scala} />
      </Opzione>
    </div>
  );
}
