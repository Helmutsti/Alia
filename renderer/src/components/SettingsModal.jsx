import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Bell, Cartella, Check, Flusso, ManigliaRiordino, Plus, Sorgenti, Tastiera, Trash } from "./icons.jsx";
import { useAlia } from "../lib/AliaProvider.jsx";
import { useTrappolaFuoco } from "../lib/fuoco.js";

/* Impostazioni — trascritto da `DEF_Impostazioni` (vedi Rinascita.md, § Interfaccia).

   Card 820×600 divisa in due: navigazione a sinistra larga 220 con bordo
   destro, contenuto a destra che scorre. Quattro sezioni: Notifiche, Fonti
   collegate, Scorciatoie, Stati.

   **Solo Stati funziona davvero, e le altre tre lo dichiarano.** Non è una
   svista né un rinvio silenzioso:

     · Fonti collegate lo dice già l'artboard ("Non ancora attivo in questa
       versione"), ed è l'unica delle quattro a essere onesta per disegno;
     · Notifiche presuppone un posto dove salvare le preferenze che non esiste —
       nessuna tabella, nessun file — e delle notifiche che non ci sono. Gli
       interruttori sono disegnati e spenti: uno che si accende e torna indietro
       alla riapertura mentirebbe due volte, sul salvataggio e sull'effetto;
     · Scorciatoie elenca sette tasti che nessuno ascolta. Disegnare l'elenco e
       basta sarebbe una schermata che promette una tastiera che non c'è.

   Gli scostamenti dall'artboard, tutti dovuti a regole del core che l'artboard
   non poteva conoscere, sono commentati nel punto in cui capitano. */

const VELO =
  "absolute inset-0 z-[92] box-border flex items-center justify-center p-7 " +
  "bg-[color-mix(in_srgb,#000_52%,transparent)] backdrop-blur-[7px]";
const CARD =
  "w-full max-w-[820px] h-[600px] max-h-full rounded-[14px] bg-surface shadow-elev-lg " +
  "flex overflow-hidden";
const NAV_ITEM =
  "flex items-center gap-2.5 w-full px-3 py-[9px] rounded-md border-0 bg-transparent cursor-pointer " +
  "text-left text-[13px] text-content/72 hover:bg-[color-mix(in_srgb,var(--color-content)_6%,transparent)]";
const NAV_ATTIVO =
  "flex items-center gap-2.5 w-full px-3 py-[9px] rounded-md border-0 cursor-pointer " +
  "text-left text-[13px] text-content bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]";
const SEZ_TITOLO = "text-[11px] tracking-[0.1em] uppercase text-accent mb-1";
const RIGA = "flex items-center justify-between gap-4 py-4 border-b border-divider last:border-b-0";
const ETICHETTA = "text-[13.5px] text-content";
const NOTA = "text-[12px] text-content/56 max-w-[360px] leading-[1.5]";
const CAMPO =
  "h-8 rounded-lg border border-divider bg-elevated px-2 text-content " +
  "focus:outline-none focus:border-accent";
const GHOST_ICO =
  "grid place-items-center w-7 h-7 p-0 rounded-md border-0 bg-transparent cursor-pointer " +
  "text-content/55 hover:text-content hover:bg-[color-mix(in_srgb,var(--color-content)_9%,transparent)]";
const LINK_BTN =
  "flex items-center gap-1.5 p-0 border-0 bg-transparent cursor-pointer text-[12.5px] text-accent hover:opacity-80";

/* Ordine della navigazione: Stati sta **sopra** Scorciatoie, e non e l'ordine
   dell'artboard. Le prime tre voci descrivono come lavora Alia — cosa avvisa,
   da dove pesca, come si chiama quello che fa; le Scorciatoie sono un
   promemoria, non una configurazione, e i promemoria stanno in fondo. */
const SEZIONI = [
  { id: "notifiche", label: "Notifiche", Icona: Bell },
  { id: "fonti", label: "Fonti collegate", Icona: Sorgenti },
  { id: "progetti", label: "Progetti", Icona: Cartella },
  { id: "stati", label: "Stati", Icona: Flusso },
  { id: "scorciatoie", label: "Scorciatoie", Icona: Tastiera },
];

/* Murata nel bundle da Vite (vedi renderer/vite.config.js), che la legge da
   package.json: qui dentro non c'e modo di raggiungerlo. */
const VERSIONE = typeof __ALIA_VERSION__ === "string" ? __ALIA_VERSION__ : null;

/* ── sezioni dichiaratamente non attive ─────────────────────────────────────── */

/* L'interruttore dell'artboard: pista 34×20, pallino 16, acceso in accento.

   Serve in due modi opposti, e la differenza la fa `disabled`:
     · nella sezione Stati è un comando vero, ed è quello che ha sostituito la
       tendina dei tipi;
     · nelle Notifiche è una vetrina, perché quelle preferenze non hanno ancora
       un posto dove essere salvate. Lì è sempre spento, e il grigio non è uno
       stile in più: è la stessa cosa detta due volte, dal colore e
       dall'attributo. */
function Interruttore({ acceso, disabilitato, onChange, etichetta, title }) {
  const comune = "relative w-[34px] h-5 rounded-full shrink-0 border-0 p-0";
  const sfondo = acceso ? "var(--color-accent)" : "var(--color-neutral-700)";

  if (disabilitato || !onChange) {
    return (
      <span
        role="switch"
        aria-checked={acceso}
        aria-disabled="true"
        title={title}
        className={`${comune} opacity-45`}
        style={{ background: sfondo }}
      >
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white" style={{ left: acceso ? 16 : 2 }} />
      </span>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      aria-label={etichetta}
      title={title}
      onClick={() => onChange(!acceso)}
      className={`${comune} cursor-pointer transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]`}
      style={{ background: sfondo }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-[left] duration-[120ms]"
        style={{ left: acceso ? 16 : 2 }}
      />
    </button>
  );
}

function NonAttiva({ children }) {
  return (
    <p className="m-0 mb-1.5 text-[12px] text-content/56 leading-[1.5]">
      {children} <span className="text-content/80">Non ancora attivo in questa versione.</span>
    </p>
  );
}

function Notifiche() {
  const righe = [
    ["Promemoria attività in scadenza", "Un avviso quando un'attività si avvicina alla scadenza", true],
    ["Notifiche push su desktop", "Ricevi un avviso anche quando l'app è in background", true],
    ["Riepilogo email settimanale", "Un'email ogni lunedì con quello che resta aperto", false],
    ["Orario silenzioso", "Nessuna notifica tra le 22:00 e le 08:00", false],
  ];
  return (
    <div>
      <div className={SEZ_TITOLO}>Notifiche</div>
      <NonAttiva>
        Alia non ha ancora né un posto dove ricordare queste preferenze né le notifiche da mandare.
      </NonAttiva>
      {righe.map(([label, nota, acceso]) => (
        <div key={label} className={RIGA}>
          <div>
            <div className={ETICHETTA}>{label}</div>
            <div className={`${NOTA} mt-[3px]`}>{nota}</div>
          </div>
          <Interruttore acceso={acceso} disabilitato />
        </div>
      ))}
    </div>
  );
}

function Fonti() {
  return (
    <div>
      <div className={SEZ_TITOLO}>Fonti collegate</div>
      <NonAttiva>
        Collega le fonti da cui vuoi che Alia raccolga le attività.
      </NonAttiva>
      {["Email di lavoro", "Chat del team", "Note"].map((nome) => (
        <div key={nome} className={RIGA}>
          <div className={ETICHETTA}>{nome}</div>
          <span className="text-[11px] px-2 py-1 rounded-md border border-divider text-content/55">
            non connessa
          </span>
        </div>
      ))}
    </div>
  );
}

function Tasto({ children }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md bg-elevated border border-divider text-[11.5px] font-medium text-content/82">
      {children}
    </span>
  );
}

function Scorciatoie() {
  const gruppi = [
    ["Navigazione", [
      [["J", "K"], "Vai all'attività successiva / precedente"],
      [["/"], "Cerca"],
      [["G"], "Vai a un elenco"],
    ]],
    ["Attività", [
      [["N"], "Nuova attività"],
      [["E"], "Modifica l'attività selezionata"],
      [["Spazio"], "Segna come completata"],
      [["⌫"], "Elimina l'attività"],
    ]],
  ];
  return (
    <div>
      <div className={SEZ_TITOLO}>Navigazione</div>
      <NonAttiva>Queste scorciatoie non sono ancora collegate a nessun gesto.</NonAttiva>
      {gruppi.map(([titolo, righe], i) => (
        <div key={titolo}>
          {i > 0 ? <div className={`${SEZ_TITOLO} mt-[22px]`}>{titolo}</div> : null}
          {righe.map(([tasti, testo]) => (
            <div key={testo} className="flex items-center gap-3 py-[9px]">
              {tasti.map((t) => (
                <Tasto key={t}>{t}</Tasto>
              ))}
              <span className={NOTA}>{testo}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Progetti e milestone ───────────────────────────────────────────────────── */

/* I colori assegnabili a un progetto.

   Sono **token del tema**, non valori esadecimali: salvando `var(--color-sky-400)`
   il progetto segue la palette invece di congelare un colore di oggi. Il campo
   `t_project.color` è testo libero e finisce dritto in `style`, quindi un `var()`
   funziona esattamente come un `#rrggbb` — e i progetti nati dalla vecchia
   migrazione, che hanno un esadecimale dentro, continuano a leggersi bene.

   Otto, tutti al gradino 400 (300 per l'arancio) perché è quello che regge il
   contrasto sul fondo scuro senza gridare. Non è una tavolozza aperta: un
   selettore libero produrrebbe presto due progetti che si distinguono per un
   grado di saturazione, cioè per niente. */
const COLORI = [
  { id: "sky", valore: "var(--color-sky-400)", nome: "Azzurro" },
  { id: "purple", valore: "var(--color-purple-400)", nome: "Viola" },
  { id: "emerald", valore: "var(--color-emerald-400)", nome: "Verde" },
  { id: "orange", valore: "var(--color-orange-300)", nome: "Arancio" },
  { id: "rose", valore: "var(--color-rose-400)", nome: "Rosa" },
  { id: "amber", valore: "var(--color-amber-400)", nome: "Ambra" },
  { id: "teal", valore: "var(--color-teal-400)", nome: "Verdeacqua" },
  { id: "neutral", valore: "var(--color-neutral-400)", nome: "Grigio" },
];

/* Il pallino del colore è anche il comando che lo cambia: si apre in una
   tavolozza sotto di lui. Un pallino che non si può premere e un selettore
   accanto sarebbero due cose dove ne basta una. */
function ScegliColore({ colore, onScegli }) {
  const [aperta, setAperta] = useState(false);

  useEffect(() => {
    if (!aperta) return undefined;
    const chiudi = () => setAperta(false);
    /* Il ritardo di un giro serve a non farsi chiudere dal click che ha appena
       aperto la tavolozza. */
    const t = setTimeout(() => document.addEventListener("click", chiudi), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", chiudi);
    };
  }, [aperta]);

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAperta((v) => !v)}
        aria-label="Cambia il colore del progetto"
        title="Cambia colore"
        className="grid place-items-center w-6 h-6 p-0 rounded-md border-0 bg-transparent cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-content)_10%,transparent)]"
      >
        <span className="w-[11px] h-[11px] rounded-full" style={{ background: colore }} />
      </button>

      {aperta ? (
        <span
          onClick={(e) => e.stopPropagation()}
          /* Colonne esplicite e `w-max`, non `grid-cols-4`: un elemento in
             posizione assoluta si dimensiona sul suo contenitore, che qui è il
             bottone del pallino largo 24, e quattro colonne `1fr` dentro 24px
             diventano quattro strisce di sei pixel. Con la misura scritta la
             tavolozza è larga quanto le sue caselle, dovunque stia. */
          className="absolute left-0 top-7 z-10 w-max grid grid-cols-[repeat(4,24px)] gap-1 p-1.5 rounded-lg border border-divider bg-elevated shadow-elev-md"
        >
          {COLORI.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.nome}
              aria-label={c.nome}
              onClick={() => {
                setAperta(false);
                if (c.valore !== colore) onScegli(c.valore);
              }}
              className="grid place-items-center w-6 h-6 p-0 rounded-md border-0 bg-transparent cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-content)_12%,transparent)]"
            >
              <span className="w-[13px] h-[13px] rounded-full grid place-items-center" style={{ background: c.valore }}>
                {c.valore === colore ? <Check size={9} sw={3.2} className="text-bg" /> : null}
              </span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/* Campo di testo che scrive quando si esce o si preme Invio, non a ogni tasto:
   ogni battuta sarebbe una scrittura sul database. Esc rimette il valore di
   prima. È lo stesso comportamento del nome degli stati — vedi `NomeStato`, che
   resta separato perché ha una larghezza sua e un'etichetta sua. */
function CampoTesto({ valore: iniziale, onCommit, className, ...rest }) {
  const [valore, setValore] = useState(iniziale);
  useEffect(() => setValore(iniziale), [iniziale]);

  const conferma = () => {
    const pulito = valore.trim();
    if (!pulito || pulito === iniziale) {
      setValore(iniziale);
      return;
    }
    onCommit(pulito);
  };

  return (
    <input
      type="text"
      value={valore}
      onChange={(e) => setValore(e.target.value)}
      onBlur={conferma}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValore(iniziale);
          e.currentTarget.blur();
        }
      }}
      className={className}
      {...rest}
    />
  );
}

/* Il campo che aggiunge: sempre presente in fondo all'elenco delle fasi, vuoto,
   e si svuota da sé dopo ogni invio. Un bottone "Aggiungi" che fa comparire un
   campo è un passaggio in più per un gesto che qui si ripete — le fasi si
   scrivono a raffica quando si imposta un progetto. */
function CampoAggiungi({ segnaposto, onAggiungi, className }) {
  const [valore, setValore] = useState("");
  return (
    <input
      type="text"
      value={valore}
      placeholder={segnaposto}
      onChange={(e) => setValore(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setValore("");
        if (e.key !== "Enter") return;
        const pulito = valore.trim();
        if (!pulito) return;
        setValore("");
        onAggiungi(pulito);
      }}
      className={className}
    />
  );
}

function Progetti({ errore }) {
  const alia = useAlia();
  const { projects, milestones, tasks } = alia;

  const perProgetto = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      if (!t.project) continue;
      m.set(t.project.id, (m.get(t.project.id) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  const fasiDi = useCallback(
    (idProject) =>
      (milestones ?? [])
        .filter((m) => m.idProject === idProject)
        .sort((a, b) => a.position - b.position),
    [milestones],
  );

  return (
    <div>
      <div className={SEZ_TITOLO}>Progetti</div>
      <p className={`m-0 mb-2.5 ${NOTA} max-w-none`}>
        Un progetto è una casa: ha un nome, un colore e, dentro, le fasi in cui si divide.
        Cancellarne uno chiede dove mandare le task che ci vivono; cancellare una fase no — le task
        restano nel progetto e perdono solo la fase.
      </p>

      {errore ? (
        <p className="m-0 mb-2.5 text-[12px] leading-[1.5] text-priority-high">{errore}</p>
      ) : null}

      {projects.length === 0 ? (
        <p className={`m-0 mb-3 ${NOTA} max-w-none`}>Nessun progetto. Il primo si scrive qui sotto.</p>
      ) : null}

      {projects.map((p) => {
        const fasi = fasiDi(p.id);
        const quante = perProgetto.get(p.id) ?? 0;
        return (
          <div key={p.id} className="py-2 border-b border-divider last:border-b-0">
            <div className="flex items-center gap-2.5">
              <ScegliColore
                colore={p.color}
                onScegli={(color) => alia.aggiornaProgetto(p.id, { color })}
              />
              <CampoTesto
                valore={p.name}
                onCommit={(name) => alia.aggiornaProgetto(p.id, { name })}
                aria-label="Nome del progetto"
                className={`${CAMPO} flex-1 min-w-0 text-[13px]`}
              />
              <span className="text-mini text-content/42 shrink-0 w-[52px] text-right">
                {quante === 1 ? "1 task" : `${quante} task`}
              </span>
              <button
                type="button"
                onClick={() => alia.eliminaProgetto(p.id)}
                aria-label={`Elimina il progetto ${p.name}`}
                className={GHOST_ICO}
              >
                <Trash size={13} />
              </button>
            </div>

            {/* Le fasi, rientrate sotto il progetto a cui appartengono: il
                rientro dice l'appartenenza meglio di un titolo ripetuto — e da
                solo, senza pallini davanti. I pallini c'erano e sono stati
                tolti: non distinguevano niente (le fasi sono tutte uguali fra
                loro) e facevano rumore accanto al pallino del colore, che
                invece un mestiere ce l'ha. Tolti quelli, il rientro sale da 12
                a 20: e' l'unica cosa rimasta a dire l'appartenenza, quindi deve
                dirla piu' forte. Il bordo destro non si muove — la riga finisce
                dove finisce quella del progetto. */}
            <div className="flex flex-col gap-1 mt-1.5 ml-[54px]">
              {fasi.map((m) => (
                <div key={m.idMilestone} className="flex items-center gap-2">
                  <CampoTesto
                    valore={m.label}
                    onCommit={(label) => alia.aggiornaMilestone(m.idMilestone, { label })}
                    aria-label="Nome della fase"
                    className={`${CAMPO} flex-1 min-w-0 h-7 text-[12.5px]`}
                  />
                  {/* Lo stesso spazio che sopra occupa il conteggio delle task:
                      senza, i campi delle fasi finirebbero 54px più a destra del
                      nome del progetto a cui appartengono, e il rientro a
                      sinistra direbbe una cosa che il bordo destro smentisce.
                      56 e non 54: queste righe hanno `gap-2` contro il `gap-2.5`
                      della riga del progetto, e due pixel su un bordo si
                      vedono. */}
                  <span className="w-[56px] shrink-0" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => alia.eliminaMilestone(m.idMilestone)}
                    aria-label={`Elimina la fase ${m.label}`}
                    className={GHOST_ICO}
                  >
                    <Trash size={12} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <CampoAggiungi
                  segnaposto={fasi.length === 0 ? "Aggiungi una fase…" : "Aggiungi…"}
                  onAggiungi={(label) => alia.creaMilestone({ idProject: p.id, label })}
                  className={`${CAMPO} flex-1 min-w-0 h-7 text-[12.5px] border-dashed placeholder:text-content/38`}
                />
                <span className="w-[56px] shrink-0" aria-hidden="true" />
                <span className="w-7 shrink-0" />
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2.5 pt-3">
        <span className="w-6 shrink-0 grid place-items-center">
          <span
            className="w-[11px] h-[11px] rounded-full"
            style={{ background: COLORI[projects.length % COLORI.length].valore }}
          />
        </span>
        {/* Il colore del prossimo progetto non si sceglie qui: ne prende uno a
            giro dalla tavolozza, e si cambia dopo con un click sul pallino.
            Chiedere nome *e* colore prima di aver creato niente sarebbe un modulo
            per un gesto che deve costare una riga scritta. */}
        <CampoAggiungi
          segnaposto="Aggiungi un progetto…"
          onAggiungi={(name) =>
            alia.creaProgetto({ name, color: COLORI[projects.length % COLORI.length].valore })
          }
          className={`${CAMPO} flex-1 min-w-0 text-[13px] border-dashed placeholder:text-content/38`}
        />
        <span className="w-[52px] shrink-0" />
        <span className="w-7 shrink-0" />
      </div>
    </div>
  );
}

/* ── Stati: l'unica sezione che scrive ──────────────────────────────────────── */

/* Le righe della fila non sono tutte uguali, e la differenza è di posizione:
   la prima è l'apertura, l'ultima la chiusura, in mezzo i passaggi.

   Ai due capi mancano la maniglia e il cestino — non sono spenti, non ci sono:
   un comando disabilitato dice "qui potresti, ma non ora", e non è il caso.
   Qui non si potrà mai, perché senza apertura il flusso non ha ingresso e senza
   chiusura non ha capolinea. Al loro posto resta lo spazio, così i nomi restano
   incolonnati.

   La tendina dei tipi è sparita insieme al modello che la reggeva: con i capi
   fissi l'unica cosa che resta da decidere è se un passaggio conta come
   concluso, che è una domanda sì/no e vuole un interruttore. Ai capi la
   risposta è già scritta dalla posizione, e infatti lì l'interruttore è spento:
   sull'apertura giù, sulla chiusura su. */
function Stati({ errore }) {
  const alia = useAlia();
  const { states } = alia;

  /* Copia locale del solo **ordine**, per il trascinamento: durante il gesto la
     fila si riordina a ogni passaggio sopra una riga, e non si può scrivere sul
     database a ogni movimento. La scrittura avviene al rilascio. I nomi e gli
     interruttori non passano di qui: quelli si scrivono subito, uno per gesto. */
  const [ordine, setOrdine] = useState(() => states.map((s) => s.id));
  useEffect(() => setOrdine(states.map((s) => s.id)), [states]);

  const [trascinato, setTrascinato] = useState(null);
  const righeRef = useRef(new Map());
  const posizioni = useRef(null);
  /* La griglia congelata all'inizio del trascinamento: dove comincia la prima
     riga e quanto è alta una riga. Vedi `bersaglio` qui sotto. */
  const griglia = useRef(null);

  const perId = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);
  const elenco = ordine.map((id) => perId.get(id)).filter(Boolean);
  const idApertura = elenco[0]?.id;
  const idChiusura = elenco[elenco.length - 1]?.id;

  /* FLIP, come nell'artboard e come la board: si misura **prima** di cambiare
     l'ordine, si lascia disegnare React, e si riporta ogni riga da dove stava
     alla nuova posizione. Senza, le righe salterebbero. */
  const misura = useCallback(() => {
    const m = new Map();
    for (const [id, el] of righeRef.current) if (el) m.set(id, el.getBoundingClientRect().top);
    posizioni.current = m;
  }, []);

  /* Dove va a finire la riga trascinata, calcolato **dalla posizione del
     puntatore** e non da quale riga ha appena ricevuto un evento.

     La differenza è tutta qui, ed è il difetto per cui fermandosi a metà due
     stati si scambiavano vorticosamente. Reagire a `dragenter` è un anello
     chiuso: entro sulla riga sotto, l'ordine cambia, quella riga si sposta
     dov'ero io, il puntatore si ritrova "dentro" un'altra riga, parte un altro
     `dragenter`, e si torna indietro — a puntatore fermo. Ogni fotogramma ne
     fa un giro.

     Calcolando l'indice da `clientY` l'anello si apre: a puntatore fermo la
     risposta è sempre la stessa, quindi dopo il primo spostamento non ne
     seguono altri. La griglia (dove comincia la fila, quanto è alta una riga) è
     fotografata all'inizio del gesto e resta ferma: le righe sono tutte alte
     uguale e il loro numero non cambia durante il trascinamento, quindi la
     posizione di ogni casella è nota e non dipende dall'ordine corrente — che è
     esattamente ciò che serve perché il calcolo non si insegua da solo.

     I due capi non sono caselle raggiungibili: l'indice è limitato fra la prima
     e l'ultima posizione libera. */
  const bersaglio = useCallback((clientY) => {
    const g = griglia.current;
    if (!g || g.altezza <= 0) return null;
    const grezzo = Math.round((clientY - g.top) / g.altezza);
    return Math.min(Math.max(grezzo, 1), g.righe - 2);
  }, []);

  const inizia = (id) => {
    const righe = ordine.map((x) => righeRef.current.get(x)).filter(Boolean);
    const prima = righe[0]?.getBoundingClientRect();
    const seconda = righe[1]?.getBoundingClientRect();
    griglia.current =
      prima && seconda
        ? { top: prima.top, altezza: seconda.top - prima.top, righe: ordine.length }
        : null;
    setTrascinato(id);
  };

  useLayoutEffect(() => {
    const prima = posizioni.current;
    if (!prima) return;
    posizioni.current = null;
    for (const [id, el] of righeRef.current) {
      if (!el || id === trascinato) continue;
      const partenza = prima.get(id);
      if (partenza === undefined) continue;
      const dy = partenza - el.getBoundingClientRect().top;
      if (!dy) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1)";
        el.style.transform = "";
      });
    }
  }, [ordine, trascinato]);

  const sopra = (clientY) => {
    if (trascinato == null) return;
    const a = bersaglio(clientY);
    if (a == null) return;
    setOrdine((prec) => {
      const da = prec.indexOf(trascinato);
      if (da < 0 || da === a) return prec;
      misura();
      const next = [...prec];
      next.splice(a, 0, next.splice(da, 1)[0]);
      return next;
    });
  };

  const rilascia = () => {
    setTrascinato(null);
    const attuale = states.map((s) => s.id);
    /* Si scrive solo se l'ordine è davvero cambiato: un trascinamento che
       finisce dov'era cominciato non è una modifica. */
    if (ordine.length === attuale.length && ordine.every((id, i) => id === attuale[i])) return;
    alia.riordinaStati(ordine);
  };

  return (
    <div>
      <div className={SEZ_TITOLO}>Stati</div>
      <p className={`m-0 mb-2.5 ${NOTA} max-w-none`}>
        Il primo stato è quello con cui nascono le task, l'ultimo è il capolinea: si possono
        rinominare, ma non spostare né togliere. In mezzo metti i passaggi che vuoi, nell'ordine che
        vuoi, e accendi <span className="text-content/72">Chiude</span> su quelli che contano già come
        conclusi — migrato, archiviato, annullato.
      </p>

      {errore ? (
        /* Gli errori del core arrivano qui e non in un dialogo: sono rifiuti che
           spiegano una regola, e si leggono accanto alla cosa che li ha
           provocati. */
        <p className="m-0 mb-2.5 text-[12px] leading-[1.5] text-priority-high">{errore}</p>
      ) : null}

      {/* Il bottone di aggiunta sta **prima dell'ultima riga**, non in fondo, ed è
          il posto letterale in cui comparirà lo stato nuovo: `createState` lo
          infila prima della chiusura finale, perché in fondo diventerebbe lui
          l'ultimo e l'ultimo è la chiusura. Un "Aggiungi" sotto la chiusura
          prometterebbe una fila che il core non può costruire. */}
      {elenco.map((s, i) => {
        const capo = s.id === idApertura || s.id === idChiusura;
        const chiude = s.id === idChiusura ? true : s.role === "end";

        const aggiunta =
          i === elenco.length - 1 ? (
            <button
              key="aggiungi"
              type="button"
              onClick={() => alia.creaStato({ label: nomeLibero(states) })}
              className={`${LINK_BTN} my-1.5 ml-[28px]`}
            >
              <Plus size={12} />
              Aggiungi stato
            </button>
          ) : null;

        const riga = (
          <div
            key={s.id}
            ref={(el) => {
              if (el) righeRef.current.set(s.id, el);
              else righeRef.current.delete(s.id);
            }}
            /* `dragover` e non `dragenter`: porta con sé la posizione del
               puntatore a ogni movimento, ed è la posizione che decide. */
            onDragOver={(e) => {
              e.preventDefault();
              sopra(e.clientY);
            }}
            onDrop={(e) => e.preventDefault()}
            className="flex items-center gap-2.5 py-1.5"
            style={{ opacity: trascinato === s.id ? 0.4 : 1 }}
          >
            {capo ? (
              <span className="w-[18px] h-6 shrink-0" aria-hidden="true" />
            ) : (
              <span
                draggable
                onDragStart={() => inizia(s.id)}
                onDragEnd={rilascia}
                aria-label="Riordina"
                className="grid place-items-center w-[18px] h-6 shrink-0 cursor-grab active:cursor-grabbing text-content/45 hover:text-content/75"
              >
                <ManigliaRiordino />
              </span>
            )}

            <NomeStato stato={s} onCommit={(label) => alia.aggiornaStato(s.id, { label })} />

            <span className="flex items-center gap-2 w-[120px] shrink-0">
              <Interruttore
                acceso={chiude}
                disabilitato={capo}
                etichetta={`Lo stato ${s.label} conta come concluso`}
                title={
                  s.id === idApertura
                    ? "È lo stato con cui nascono le task: non può contare come concluso"
                    : s.id === idChiusura
                      ? "È il capolinea del flusso: conta sempre come concluso"
                      : "Le task su questo stato contano come concluse"
                }
                onChange={capo ? undefined : (v) => alia.aggiornaStato(s.id, { isEnd: v })}
              />
              <span className={`text-[12px] ${capo ? "text-content/38" : "text-content/62"}`}>
                Chiude
              </span>
            </span>

            {capo ? (
              <span className="w-7 h-7 shrink-0" aria-hidden="true" />
            ) : (
              <button
                type="button"
                onClick={() => alia.eliminaStato(s.id)}
                aria-label={`Rimuovi lo stato ${s.label}`}
                className={GHOST_ICO}
              >
                <Trash size={13} />
              </button>
            )}
          </div>
        );

        return aggiunta ? [aggiunta, riga] : riga;
      })}
    </div>
  );
}

/* L'etichetta è unica a schema, quindi "Nuovo stato" due volte fallirebbe: si
   numera dal secondo in poi. L'artboard non poteva saperlo — lì la lista è
   finta e i nomi non collidono con niente. */
function nomeLibero(states) {
  const presi = new Set(states.map((s) => s.label));
  if (!presi.has("Nuovo stato")) return "Nuovo stato";
  let i = 2;
  while (presi.has(`Nuovo stato ${i}`)) i += 1;
  return `Nuovo stato ${i}`;
}

/* Il nome si scrive quando si esce dal campo o si preme Invio, non a ogni
   tasto: ogni battuta sarebbe una scrittura sul database e una riga di storico.
   Esc rimette il valore di prima. */
function NomeStato({ stato, onCommit }) {
  const [valore, setValore] = useState(stato.label);
  useEffect(() => setValore(stato.label), [stato.label]);

  const conferma = () => {
    const pulito = valore.trim();
    if (!pulito || pulito === stato.label) {
      setValore(stato.label);
      return;
    }
    onCommit(pulito);
  };

  return (
    <input
      type="text"
      value={valore}
      onChange={(e) => setValore(e.target.value)}
      onBlur={conferma}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setValore(stato.label);
          e.currentTarget.blur();
        }
      }}
      aria-label="Nome dello stato"
      className={`${CAMPO} w-[200px] text-[13px]`}
    />
  );
}

/* ── il pannello ────────────────────────────────────────────────────────────── */

export function SettingsModal({ onClose }) {
  const { errore, ricarica } = useAlia();
  const [sezione, setSezione] = useState("stati");
  const rifCard = useRef(null);

  /* Stessa trappola del composer, stesso difetto: senza, il Tab usciva dietro
     il velo. */
  useTrappolaFuoco(rifCard);

  /* Si apre su Stati e non su Notifiche come l'artboard: è l'unica sezione che
     fa qualcosa, e aprire su una vetrina spenta sarebbe un benvenuto storto. */

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Chiudendo si ricarica: gli stati appena cambiati sono già nel provider, ma
     un errore rimasto appeso non deve sopravvivere alla finestra che lo ha
     prodotto. */
  const chiudi = () => {
    if (errore) ricarica();
    onClose();
  };

  return (
    <div onClick={chiudi} className={VELO}>
      <div
        ref={rifCard}
        role="dialog"
        aria-modal="true"
        aria-label="Impostazioni"
        onClick={(e) => e.stopPropagation()}
        className={CARD}
      >
        <div className="w-[220px] shrink-0 border-r border-divider px-3 py-5 flex flex-col gap-0.5">
          <div className="font-medium text-base px-3 pt-1 pb-4">Impostazioni</div>
          {SEZIONI.map(({ id, label, Icona }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSezione(id)}
              className={sezione === id ? NAV_ATTIVO : NAV_ITEM}
            >
              <Icona className={sezione === id ? "text-accent shrink-0" : "opacity-75 shrink-0"} />
              <span>{label}</span>
            </button>
          ))}

          {/* La versione, in fondo e centrata. `mt-auto` la tiene attaccata al
              basso qualunque sia il numero di voci sopra, senza posizionamento
              assoluto: cosi non puo mai finire sotto l'ultima voce se un giorno
              l'elenco diventa lungo, perche resta nel flusso.
              Non e un comando e non si seleziona come tale: e testo, spento,
              del rango piu piccolo della scala. */}
          {VERSIONE ? (
            <div className="mt-auto pt-4 text-center text-micro text-content/38 select-text">
              Alia {VERSIONE}
            </div>
          ) : null}
        </div>

        <div className="flex-1 min-w-0 px-8 py-6 overflow-y-auto">
          {sezione === "notifiche" ? <Notifiche /> : null}
          {sezione === "fonti" ? <Fonti /> : null}
          {sezione === "progetti" ? <Progetti errore={errore} /> : null}
          {sezione === "scorciatoie" ? <Scorciatoie /> : null}
          {sezione === "stati" ? <Stati errore={errore} /> : null}
        </div>
      </div>
    </div>
  );
}
