import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { confluenza } from "../lib/confluenza.js";
import { Bell, Calendario, Cartella, Check, Flusso, Layers, ManigliaRiordino, Plus, Sorgenti, Tastiera, Trash } from "./icons.jsx";
import {
  DISPONIBILITA_PREDEFINITA,
  GIORNI,
  INTERVALLO_PREDEFINITO,
  MODI_SETTIMANA,
  applicaModo,
  daMinuti,
  eOra,
  inMinuti,
  intervalliComuni,
  modoDellaSettimana,
  normalizzaGiorno,
  oreDisponibili,
  oreScritte,
  oreSettimanali,
} from "../lib/disponibilita.js";
/* La tendina della testata contenuto, riusata qui: e' la stessa cosa — una
   scelta fra poche voci, con la spunta su quella in vigore — e un secondo
   menu a discesa sarebbe un secondo comportamento da tenere allineato. */
import { Dropdown, DropdownItem } from "../inbox/Dropdown.jsx";
import { ChevronDown } from "./icons.jsx";
import { CAMPI_CARD, DENSITA_CARD, PRESET_CARD, densitaDeiCampi } from "../lib/tasks.js";
import { useAlia } from "../lib/AliaProvider.jsx";
import { useTrappolaFuoco } from "../lib/fuoco.js";
import { usePreferenza } from "../lib/preferenze.js";

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

const IcoCalendario = (p) => <Calendario size={15} {...p} />;

/* Ordine della navigazione: Stati sta **sopra** Scorciatoie, e non e l'ordine
   dell'artboard. Le prime tre voci descrivono come lavora Alia — cosa avvisa,
   da dove pesca, come si chiama quello che fa; le Scorciatoie sono un
   promemoria, non una configurazione, e i promemoria stanno in fondo. */
const SEZIONI = [
  { id: "notifiche", label: "Notifiche", Icona: Bell },
  { id: "fonti", label: "Fonti collegate", Icona: Sorgenti },
  { id: "progetti", label: "Progetti", Icona: Cartella },
  { id: "stati", label: "Stati", Icona: Flusso },
  /* Dopo le quattro che dicono **come lavora** Alia e prima delle Scorciatoie,
     che sono un promemoria: l'aspetto non e' una configurazione del lavoro, ma
     non e' nemmeno un ripasso. */
  { id: "aspetto", label: "Aspetto", Icona: Layers },
  /* Il Calendario sta fra le quattro del "come lavora" e l'aspetto, perche'
     e' l'ultima cosa che dice **come si lavora** e non come si vede: le ore
     di disponibilita' sono un fatto della giornata, non una preferenza
     grafica. L'icona si chiede a 15 come le altre della navigazione: il suo
     ripiego e' 13, che e' la misura delle chip del dettaglio task. */
  { id: "calendario", label: "Calendario", Icona: IcoCalendario },
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
  /* Due preferenze vere, lette **anche dal processo principale** (vedi
     electron/promemoria.js): qui si scrivono, la' si leggono a ogni giro. Non
     passano per props come quelle dell'aspetto perche' nessun altro componente
     le guarda — chi le usa non e' un componente. */
  const [accese, setAccese] = usePreferenza("notifiche.promemoria", true, (v) => typeof v === "boolean");
  const [suono, setSuono] = usePreferenza("notifiche.suono", true, (v) => typeof v === "boolean");
  const [prova, setProva] = useState(null);

  const puoiProvare = typeof window !== "undefined" && !!window.notifiche;

  const provaAdesso = async () => {
    if (!puoiProvare) return;
    setProva("in corso");
    const esito = await window.notifiche.prova();
    setProva(esito?.esito ?? "sconosciuto");
    /* L'esito si spegne da se': e' una conferma, non uno stato. */
    setTimeout(() => setProva(null), 6000);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[15px] font-medium tracking-[-0.01em]">Notifiche</h2>
        <p className="m-0 text-meta text-content/55 max-w-[520px]">
          Quando una task ha un promemoria, Alia lo fa comparire fra le notifiche del sistema.
          Funziona anche a finestra chiusa: Alia resta viva vicino all&rsquo;orologio, e si esce
          da lì.
        </p>
      </div>

      <div className="flex flex-col">
        <div className={RIGA}>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={ETICHETTA}>Promemoria delle task</span>
            <span className={NOTA}>
              L&rsquo;avviso all&rsquo;ora che hai messo sulla task. Spegnendolo non si accumula
              niente: i promemoria di quel periodo non suoneranno più, nemmeno riaccendendolo.
            </span>
          </div>
          <Interruttore
            acceso={accese}
            onChange={setAccese}
            etichetta="Promemoria delle task"
          />
        </div>

        <div className={RIGA}>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={ETICHETTA}>Suono</span>
            <span className={NOTA}>
              Il suono lo mette il sistema, non Alia: qui si può solo chiedergli di tacere. Le
              notifiche continuano a comparire.
            </span>
          </div>
          <Interruttore acceso={suono} onChange={setSuono} etichetta="Suono delle notifiche" />
        </div>

        {/* La prova passa dalla stessa strada delle sveglie vere (vedi
            `prova` in electron/promemoria.js): una prova che prende un'altra
            strada puo' riuscire mentre quella vera e' rotta, ed e' proprio il
            caso in cui la si preme. */}
        <div className={RIGA}>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={ETICHETTA}>Prova</span>
            <span className={NOTA}>
              Manda subito una notifica di prova, con le impostazioni qui sopra. Se non compare,
              il permesso è negato nelle impostazioni di Windows — non in Alia.
            </span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {prova ? (
              <span className="text-mini text-content/55">
                {prova === "in corso"
                  ? "…"
                  : prova === "mostrata"
                    ? "Mandata"
                    : "Il sistema non le supporta"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={provaAdesso}
              disabled={!puoiProvare}
              className={
                "h-8 px-3 rounded-lg border border-divider bg-transparent text-[12.5px] " +
                (puoiProvare
                  ? "cursor-pointer text-content hover:border-accent"
                  : "cursor-not-allowed text-content/38")
              }
            >
              Prova la notifica
            </button>
          </div>
        </div>
      </div>

      <p className="m-0 text-meta text-content/45 max-w-[520px] pt-1 border-t border-divider">
        Un promemoria che scade mentre Alia è chiusa suona alla riapertura, dicendo per quando
        era — anche se sono passati giorni. Chi mette una sveglia sta dicendo “questo voglio
        saperlo”, e non tocca ad Alia decidere che dopo un po&rsquo; non ti interessa più.
      </p>
    </div>
  );
}

/* ── Fonti collegate: la confluenza ──────────────────────────────────────────

   Era la sezione disegnata e vuota — tre fonti finte con scritto "non
   connessa". Ora configura l'unica cosa che Alia ha davvero bisogno di sapere
   sulle sorgenti: **dove sta il servizio che le raccoglie e come si scarica**.
   Quali sorgenti ci siano dietro (Telegram oggi, mail e Discord domani) non e
   affare di Alia: e la configurazione del servizio, e sta di la'.

   Il modo di scarico e' la decisione vera di questa schermata:
     · manuale   — lo fai partire tu. E' il predefinito perche' la confluenza e'
                   facoltativa: puo' essere spenta, irraggiungibile, non
                   configurata, e uno scarico automatico in quelle condizioni e'
                   un errore che si ripete dove nessuno lo guarda;
     · periodico — un timer ogni N minuti. Il manuale resta comunque
                   disponibile: e' il "scarica posta" che in un client di posta
                   c'e' sempre.

   Il push (il servizio che bussa quando arriva qualcosa) sara' il terzo modo:
   la macchina sotto e' la stessa, cambia solo chi suona la sveglia. */
function Fonti() {
  const [config, setConfig] = useState(null);
  const [bozza, setBozza] = useState(null);
  const [prova, setProva] = useState(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    confluenza.leggiConfig().then((c) => {
      setConfig(c);
      setBozza(c);
    });
  }, []);

  if (!bozza) return <div className={SEZ_TITOLO}>Fonti collegate</div>;

  const cambia = (patch) => {
    setBozza((b) => ({ ...b, ...patch }));
    /* L'esito della prova invecchia appena si tocca un campo: mostrarlo accanto
       a valori diversi da quelli provati direbbe una cosa non vera. */
    setProva(null);
  };

  const sporca = config && ["url", "token", "modo", "ogniSecondi"].some((k) => bozza[k] !== config[k]);

  const salva = async () => {
    setInCorso(true);
    const salvata = await confluenza.scriviConfig(bozza);
    setConfig(salvata);
    setBozza(salvata);
    setInCorso(false);
  };

  const controlla = async () => {
    setInCorso(true);
    setProva(await confluenza.provaCollegamento(bozza));
    setInCorso(false);
  };

  return (
    <div>
      <div className={SEZ_TITOLO}>Fonti collegate</div>
      <p className={`${NOTA} mb-2 max-w-none`}>
        Le sorgenti (Telegram, e domani mail e Discord) non parlano con Alia: parlano con un
        servizio che le raccoglie, e Alia le scarica da lì come da una casella di posta. Qui si
        dice dove sta quel servizio e quando andarlo a interrogare.
      </p>

      <div className={RIGA}>
        <div>
          <div className={ETICHETTA}>Indirizzo del servizio</div>
          <div className={NOTA}>Es. http://127.0.0.1:8787</div>
        </div>
        <input
          type="text"
          value={bozza.url}
          onChange={(e) => cambia({ url: e.target.value })}
          placeholder="http://127.0.0.1:8787"
          className={`${CAMPO} w-[260px] text-[12.5px]`}
        />
      </div>

      <div className={RIGA}>
        <div>
          <div className={ETICHETTA}>Token</div>
          {/* Scritto in chiaro e non a pallini: e' il tuo segreto, sulla tua
              macchina, e lo devi poter confrontare con quello del servizio —
              che e' esattamente il momento in cui i pallini danno fastidio. */}
          <div className={NOTA}>Lo trovi in config.json del servizio.</div>
        </div>
        <input
          type="text"
          value={bozza.token}
          onChange={(e) => cambia({ token: e.target.value })}
          placeholder="—"
          spellCheck={false}
          className={`${CAMPO} w-[260px] text-[12px] font-mono`}
        />
      </div>

      <div className={RIGA}>
        <div>
          <div className={ETICHETTA}>Quando scaricare</div>
          <div className={NOTA}>
            {bozza.modo === "manuale"
              ? "Solo quando premi Scarica, nella colonna delle origini."
              : "Ogni tot minuti, e comunque quando premi Scarica."}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {[
            ["manuale", "Manuale"],
            ["periodico", "Periodico"],
          ].map(([valore, etichetta]) => (
            <button
              key={valore}
              type="button"
              onClick={() => cambia({ modo: valore })}
              className={
                "h-8 px-3 rounded-lg border cursor-pointer text-[12.5px] " +
                (bozza.modo === valore
                  ? "border-accent text-accent bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]"
                  : "border-divider text-content/70 bg-transparent hover:text-content")
              }
            >
              {etichetta}
            </button>
          ))}
        </div>
      </div>

      {bozza.modo === "periodico" ? (
        <div className={RIGA}>
          <div>
            <div className={ETICHETTA}>Ogni</div>
            {/* Il minimo e' un minuto, e non e' un limite tecnico: sotto quella
                soglia il periodico smette di essere comodo e diventa un modo di
                non accorgersi che il servizio e' spento. */}
            <div className={NOTA}>Minimo un minuto.</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={Math.round(bozza.ogniSecondi / 60)}
              onChange={(e) => cambia({ ogniSecondi: Math.max(1, Number(e.target.value) || 1) * 60 })}
              className={`${CAMPO} w-[70px] text-[12.5px] tabular-nums`}
            />
            <span className="text-[12.5px] text-content/60">minuti</span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-4">
        <button
          type="button"
          onClick={salva}
          disabled={!sporca || inCorso}
          className={
            "h-8 px-3.5 rounded-lg border-0 cursor-pointer text-[12.5px] font-medium bg-accent text-bg " +
            (!sporca || inCorso ? "opacity-40 cursor-not-allowed" : "hover:opacity-90")
          }
        >
          Salva
        </button>
        <button type="button" onClick={controlla} disabled={inCorso} className={LINK_BTN}>
          Prova il collegamento
        </button>

        {prova ? (
          <span
            className="text-[12px] ml-1"
            style={{ color: prova.esito === "riuscito" ? "var(--color-confirm)" : "var(--color-danger)" }}
          >
            {prova.esito === "riuscito"
              ? `Raggiunto: ${prova.salute.daProcessare} origini da processare.`
              : prova.errore}
          </span>
        ) : null}
      </div>
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

/* ── La scorciatoia globale, e come si cambia ────────────────────────────────

   Una combinazione **si preme, non si scrive**: chiedere di digitare
   "CommandOrControl+Alt+K" vorrebbe dire chiedere di conoscere il nome che
   Electron da' ai tasti, e sbagliarlo di una lettera non darebbe nessun
   errore — semplicemente non funzionerebbe. Qui si registra il tasto vero.

   Due regole mentre si ascolta:

     · **almeno un modificatore**, e non per gusto: una scorciatoia globale la
       sente tutto il sistema, e prendersi la K da sola vorrebbe dire rubarla a
       ogni programma che scrive testo;
     · i modificatori da soli non contano. Premendo Ctrl si sta ancora
       componendo, non si e' finito. */

const NOMI_TASTO = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  Enter: "Return",
};

function combinazioneDa(e) {
  const modificatori = [];
  if (e.ctrlKey || e.metaKey) modificatori.push("CommandOrControl");
  if (e.altKey) modificatori.push("Alt");
  if (e.shiftKey) modificatori.push("Shift");
  if (["Control", "Alt", "Shift", "Meta", "OS"].includes(e.key)) return null;
  if (modificatori.length === 0) return "senza-modificatore";
  const tasto = NOMI_TASTO[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return [...modificatori, tasto].join("+");
}

/* Come si legge a schermo: `CommandOrControl` e' il nome di Electron, non una
   cosa da mostrare a qualcuno. */
const aTasti = (combinazione) =>
  (combinazione ?? "")
    .replace("CommandOrControl", "Ctrl")
    .replace("Shift", "Maiusc")
    .split("+");

function Scorciatoie() {
  const [stato, setStato] = useState(null);
  const [inAscolto, setInAscolto] = useState(false);
  const [errore, setErrore] = useState(null);

  const ponte = typeof window !== "undefined" ? window.scorciatoie : undefined;

  useEffect(() => {
    if (!ponte) return;
    ponte.stato().then(setStato);
  }, [ponte]);

  useEffect(() => {
    if (!inAscolto || !ponte) return undefined;
    const onKey = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setInAscolto(false);
        setErrore(null);
        return;
      }
      const combinazione = combinazioneDa(e);
      if (combinazione === null) return;
      if (combinazione === "senza-modificatore") {
        setErrore("Serve almeno Ctrl o Alt: una scorciatoia globale la sente tutto il sistema.");
        return;
      }
      setInAscolto(false);
      const esito = await ponte.imposta(combinazione);
      setStato((prec) => ({ ...prec, ...esito, attiva: esito.esito === "registrata" }));
      setErrore(
        esito.esito === "registrata"
          ? null
          : "Quella combinazione se l’è già presa un altro programma. È rimasta quella di prima.",
      );
    };
    /* In cattura si ascolta tutto, anche i tasti che il pannello userebbe per
       altro: finche' si sta scegliendo, la tastiera e' di questa riga. */
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [inAscolto, ponte]);

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[15px] font-medium tracking-[-0.01em]">Scorciatoie</h2>
        <p className="m-0 text-meta text-content/55 max-w-[520px]">
          Una sola è vera, ed è quella che funziona anche quando Alia non è davanti.
        </p>
      </div>

      {/* La riga vera. Sta in cima e da sola, staccata dall'elenco di sotto:
          mescolarla a sette tasti che nessuno ascolta la farebbe sembrare
          finta come loro. */}
      <div className="flex items-start justify-between gap-4 py-3 border-b border-divider">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className={ETICHETTA}>Nuova task, da qualunque programma</span>
          <span className={NOTA}>
            Apre la finestrella di cattura sopra quello che stai facendo: scrivi, Invio, torni
            indietro. {stato && !stato.attiva ? null : "Funziona anche a finestra chiusa."}
          </span>
          {errore ? (
            <span className="text-mini mt-1" style={{ color: "var(--color-danger)" }}>
              {errore}
            </span>
          ) : null}
          {stato && !stato.attiva && !errore ? (
            <span className="text-mini mt-1" style={{ color: "var(--color-danger)" }}>
              Non è attiva: questa combinazione se l’è presa un altro programma. Scegline un’altra.
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {inAscolto ? (
            <span className="text-mini text-accent">Premi la combinazione…</span>
          ) : (
            <span className="flex items-center gap-1">
              {aTasti(stato?.combinazione).map((t, i) => (
                <Tasto key={`${t}-${i}`}>{t}</Tasto>
              ))}
            </span>
          )}
          <button
            type="button"
            disabled={!ponte}
            onClick={() => {
              setErrore(null);
              setInAscolto((a) => !a);
            }}
            className={
              "h-8 px-3 rounded-lg border bg-transparent text-[12.5px] " +
              (ponte
                ? inAscolto
                  ? "border-accent text-accent cursor-pointer"
                  : "border-divider text-content cursor-pointer hover:border-accent"
                : "border-divider text-content/38 cursor-not-allowed")
            }
          >
            {inAscolto ? "Annulla" : "Cambia"}
          </button>
        </div>
      </div>

      {/* E le altre, che restano quello che erano. */}
      <div>
        <NonAttiva>Queste invece non sono ancora collegate a nessun gesto.</NonAttiva>
        {gruppi.map(([titolo, righe], i) => (
          <div key={titolo}>
            <div className={`${SEZ_TITOLO} ${i > 0 ? "mt-[22px]" : ""}`}>{titolo}</div>
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
    </div>
  );
}

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

function Progetti() {
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
        .filter((m) => m.projectId === idProject)
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
                <div key={m.id} className="flex items-center gap-2">
                  <CampoTesto
                    valore={m.label}
                    onCommit={(label) => alia.aggiornaMilestone(m.id, { label })}
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
                    onClick={() => alia.eliminaMilestone(m.id)}
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
function Stati() {
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

/* ── Aspetto: quanto raccontano le card ─────────────────────────────────────

   Qui e non nella testata del pannello contenuto, ed e' una distinzione che
   vale la pena tenere ferma: vista, ordinamento, raggruppamento e filtri sono
   **domande sui dati** — cosa guardo, in che ordine, diviso come — e si
   cambiano di continuo mentre si lavora, quindi stanno a portata di mano.
   Quanto una card racconta e' una domanda sul **gusto**: la si decide una
   volta, come si decide un tema, e poi non la si tocca piu'. Una quinta
   tendina in testata per una cosa che si sceglie una volta l'anno sarebbe un
   comando che pesa tutti i giorni e serve una volta.

   Vale per le card e non per le righe della vista Lista: la riga mostra gia'
   progetto, sotto-task, scadenza e stato: e' larga abbastanza da non doverli
   nascondere, e non c'e' niente da scegliere. */
function Aspetto({ densita, campi, onDensita, onCampi }) {
  /* Toccare un interruttore **non** chiede di scegliere prima "Personalizzata":
     si accende o si spegne un campo, e il nome dell'insieme si aggiorna da se'.
     Chiedere di cambiare modalita' prima di poter toccare qualcosa sarebbe un
     passaggio in piu' per dire una cosa che il gesto dice gia'.

     E funziona anche al contrario: se spegnendo e riaccendendo si torna esatti
     su una delle due preselezioni, si riaccende quella — perche' quella
     configurazione **ha un nome**, e lasciare acceso "Personalizzata" su
     qualcosa che si chiama "Completa" sarebbe dire una cosa falsa. */
  const alterna = (id) => {
    const prossimi = { ...campi, [id]: !campi[id] };
    onCampi?.(prossimi, densitaDeiCampi(prossimi));
  };

  const scegliPreset = (id) => {
    if (id === "personalizzata") return onDensita?.(id);
    onCampi?.({ ...PRESET_CARD[id] }, id);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[15px] font-medium tracking-[-0.01em]">Aspetto</h2>
        <p className="m-0 text-meta text-content/55 max-w-[520px]">
          Quanto raccontano le card della colonna Inbox e del Kanban. Le righe della vista Lista non
          cambiano: sono larghe abbastanza da mostrare tutto senza doverlo scegliere.
        </p>
      </div>

      {/* Le due preselezioni, come scorciatoie: scrivono gli stessi
          interruttori qui sotto, invece di essere una modalita' a parte. */}
      <div className="flex gap-2" role="radiogroup" aria-label="Quanto raccontano le card">
        {DENSITA_CARD.map((d) => {
          const scelta = densita === d.id;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={scelta}
              onClick={() => scegliPreset(d.id)}
              disabled={!onCampi}
              title={d.nota}
              className={
                "flex-1 flex flex-col gap-0.5 text-left px-3.5 py-2.5 rounded-lg border bg-transparent " +
                "transition-colors duration-[120ms] " +
                (onCampi ? "cursor-pointer " : "cursor-default opacity-45 ") +
                (scelta
                  ? "border-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]"
                  : "border-divider hover:border-card-line-hover")
              }
            >
              <span className={`text-card font-medium ${scelta ? "text-accent" : "text-content"}`}>
                {d.label}
              </span>
              <span className="text-micro text-content/48 leading-[1.35]">{d.nota}</span>
            </button>
          );
        })}
      </div>

      {/* Gli interruttori, **sempre attivi**: sono il posto in cui si guarda
          cosa fa una preselezione, non solo quello in cui si personalizza. */}
      <div className="flex flex-col">
        {CAMPI_CARD.map((c, i) => (
          <div
            key={c.id}
            className={
              "flex items-center gap-4 py-2.5 " + (i > 0 ? "border-t border-divider" : "")
            }
          >
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-card">{c.label}</span>
              <span className="text-meta text-content/48">{c.nota}</span>
            </div>
            <Interruttore
              acceso={!!campi[c.id]}
              onChange={onCampi ? () => alterna(c.id) : undefined}
              etichetta={`Mostra ${c.label.toLowerCase()} sulle card`}
            />
          </div>
        ))}
      </div>

      {/* La regola del Kanban non e' configurabile, ed e' giusto che si legga
          qui: e' l'unica cosa che succede alle card **senza** che nessuno
          l'abbia chiesta, e scoprirla per caso guardando il tabellone farebbe
          pensare a un interruttore che non ha funzionato. */}
      <p className="m-0 text-meta text-content/45 max-w-[520px] pt-1 border-t border-divider">
        Nel Kanban la card non ripete mai quello che dice già la colonna:
        raggruppando per stato sparisce lo stato, per progetto il progetto, per fase il progetto e
        la fase. Vale anche se qui sono accesi.
      </p>
    </div>
  );
}

/* ── Calendario: le ore in cui si lavora davvero ──────────────────────── */

/* Un capo dell'intervallo. `<input type="time">` e non due caselle di numeri:
   e' il campo che il sistema gia' sa disegnare, con il suo formato a 24 ore e
   la sua tastiera, e rifarlo a mano vorrebbe dire rifare anche tutto quello
   che quel campo sa gia' fare.

   Si scrive **sull'uscita dal campo** e non a ogni battuta: mentre si digita
   "1" di "14:00" il campo vale un'ora che non e' quella che si sta scrivendo,
   e salvarla farebbe ballare la banda nel calendario a ogni tasto. */
function CampoOra({ valore, onCommit, etichetta }) {
  const [bozza, setBozza] = useState(valore);
  useEffect(() => setBozza(valore), [valore]);

  return (
    <input
      type="time"
      value={bozza}
      aria-label={etichetta}
      onChange={(e) => setBozza(e.target.value)}
      onBlur={() => (eOra(bozza) ? onCommit(bozza) : setBozza(valore))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setBozza(valore);
          e.currentTarget.blur();
        }
      }}
      className={`${CAMPO} w-[104px] tabular-nums [color-scheme:dark]`}
    />
  );
}

/* Gli intervalli di **una giornata tipo**: uno o piu' tratti, con le loro ore.

   Lo stesso componente serve il modo a preselezione — dove la giornata tipo e'
   una sola e vale per tutti i giorni accesi — e quello personalizzato, dove ce
   n'e' una per riga. E' la stessa cosa scritta una volta: quello che cambia fra
   i due modi non e' come si scrive un orario, e' a quanti giorni si applica. */
function EditorIntervalli({ intervalli, onCambia, nome }) {
  const scrivi = (prossimi) => onCambia(normalizzaGiorno(prossimi));

  /* Dove mettere l'intervallo nuovo: la prima ora libera **che non tocca**
     quelle che ci sono gia'.

     Attaccarlo alla fine dell'ultimo sembrava la cosa comoda, ed era un
     inganno: due intervalli che si toccano vengono fusi (vedi
     `normalizzaGiorno`), quindi il gesto "aggiungi" allungava l'ultimo invece
     di aggiungere qualcosa, e a schermo non compariva niente di nuovo. Serve
     uno stacco, ed e' anche il modo in cui una giornata si spezza davvero:
     non si riprende nel minuto in cui si e' smesso.

     Si parte un'ora dopo la fine dell'ultimo — il posto quasi sempre giusto, e
     un campo in meno da correggere — e se li' non ci sta si cerca dall'inizio
     della giornata. Se non c'e' varco da nessuna parte non si aggiunge niente:
     la giornata e' gia' piena, e un intervallo che non esiste non va inventato
     sopra gli altri. */
  const varco = (() => {
    const tocca = (da) =>
      intervalli.some((iv) => da <= inMinuti(iv.a) && inMinuti(iv.da) <= da + 60);
    const ultimo = intervalli.at(-1);
    const preferito = ultimo ? inMinuti(ultimo.a) + 60 : inMinuti(INTERVALLO_PREDEFINITO.da);
    for (const partenza of [preferito, 0]) {
      for (let inizio = partenza; inizio + 60 <= 24 * 60; inizio += 30) {
        if (!tocca(inizio)) return inizio;
      }
    }
    return null;
  })();

  /* Muovendo un capo l'altro si sposta con lui se serve: un intervallo con la
     fine prima dell'inizio non e' un dato che valga la pena conservare, e
     lasciarlo scritto in rosso in attesa che qualcuno lo aggiusti vorrebbe
     dire poter chiudere le Impostazioni con dentro qualcosa di rotto. */
  const cambiaCapo = (i, capo, ora) => {
    const prossimi = intervalli.map((iv, k) => (k === i ? { ...iv } : iv));
    const iv = prossimi[i];
    iv[capo] = ora;
    if (inMinuti(iv.da) >= inMinuti(iv.a)) {
      if (capo === "da") iv.a = daMinuti(Math.min(inMinuti(ora) + 60, 23 * 60 + 59));
      else iv.da = daMinuti(Math.max(inMinuti(ora) - 60, 0));
    }
    scrivi(prossimi);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      {intervalli.map((iv, i) => (
        <div key={`${i}-${iv.da}-${iv.a}`} className="flex items-center gap-2">
          <CampoOra
            valore={iv.da}
            etichetta={`${nome}, inizio dell'intervallo ${i + 1}`}
            onCommit={(ora) => cambiaCapo(i, "da", ora)}
          />
          <span className="text-content/38 text-meta">–</span>
          <CampoOra
            valore={iv.a}
            etichetta={`${nome}, fine dell'intervallo ${i + 1}`}
            onCommit={(ora) => cambiaCapo(i, "a", ora)}
          />
          {/* Togliere l'ultimo intervallo spegne il giorno, e non serve dirlo:
              un giorno senza ore **e'** un giorno spento (vedi la nota in
              lib/disponibilita.js), quindi l'interruttore si spegne da se' e le
              due strade portano allo stesso posto. */}
          <button
            type="button"
            onClick={() => scrivi(intervalli.filter((_, k) => k !== i))}
            aria-label={`Togli l'intervallo ${iv.da}–${iv.a} (${nome})`}
            title="Togli l'intervallo"
            className={GHOST_ICO}
          >
            <Trash />
          </button>
        </div>
      ))}

      {varco !== null ? (
        <button
          type="button"
          onClick={() => scrivi([...intervalli, { da: daMinuti(varco), a: daMinuti(varco + 60) }])}
          className={`${LINK_BTN} mt-0.5`}
        >
          <Plus />
          Aggiungi intervallo
        </button>
      ) : null}
    </div>
  );
}

/* Una riga della tabella personalizzata: l'interruttore del giorno, le sue
   ore, il totale.

   Il totale per giorno non e' un ornamento. Gli intervalli si leggono uno per
   uno e le ore vere della giornata non si vedono da nessuna parte — "9–13 e
   14–18" fa sette ore, e nessuno le somma a mente ogni volta che cambia
   qualcosa. */
function GiornoDisponibilita({ giorno, intervalli, onCambia }) {
  const acceso = intervalli.length > 0;

  return (
    <div className="flex items-start gap-4 py-3 border-t border-divider first:border-t-0">
      <div className="flex items-center gap-2.5 w-[150px] shrink-0 pt-1.5">
        <Interruttore
          acceso={acceso}
          onChange={(prossimo) => onCambia(prossimo ? [{ ...INTERVALLO_PREDEFINITO }] : [])}
          etichetta={`${giorno.label}: giorno lavorativo`}
        />
        <span className={`text-card ${acceso ? "text-content" : "text-content/40"}`}>
          {giorno.label}
        </span>
      </div>

      {acceso ? (
        <EditorIntervalli intervalli={intervalli} onCambia={onCambia} nome={giorno.label} />
      ) : (
        <span className="flex-1 text-meta text-content/38 py-1.5">Non lavorativo</span>
      )}

      <span className="w-[72px] shrink-0 text-right text-mini tabular-nums text-content/50 pt-2">
        {acceso ? oreScritte(oreDisponibili(intervalli)) : "—"}
      </span>
    </div>
  );
}

function CalendarioImpostazioni({ disponibilita, onDisponibilita }) {
  const disp = disponibilita ?? DISPONIBILITA_PREDEFINITA;
  const comuni = intervalliComuni(disp);
  const [menuAperto, setMenuAperto] = useState(false);
  /* Il modo si legge dalle ore, tranne quando lo si e' appena chiesto.

     "Personalizzata" non scrive niente — e' l'assenza degli altri due — quindi
     dedotta dal solo dato non arriverebbe mai: chi la sceglie su una settimana
     che *combacia* con lunedi'-venerdi' vedrebbe la tendina tornare indietro da
     sola e non succedere niente. Questo interruttore dice "aprimi i sette
     giorni", che e' la richiesta vera, e non e' un secondo dato sulla
     settimana: vive quanto la finestra, e si spegne appena si sceglie una delle
     due preselezioni. Le ore restano l'unica verita'.

     Al contrario non serve nulla: toccando i giorni finche' non combaciano piu'
     con nessun modo, la tendina dice "Personalizzata" da se'. */
  const [apriPersonalizzata, setApriPersonalizzata] = useState(false);
  const modo = apriPersonalizzata ? "personalizzata" : modoDellaSettimana(disp);

  /* Le ore di un giorno appena spento, per poterle rimettere se lo si riaccende
     subito. Vive **solo finche' la finestra e' aperta**, e non nel dato: un
     giorno spento e' un giorno senza ore, e tenere in cantina delle ore "di
     scorta" vorrebbe dire due verita' sullo stesso giorno. Serve a rimediare a
     un clic, non a ricordare una configurazione. */
  const ricordo = useRef({});

  const cambiaGiorno = (id, intervalli) => {
    if (intervalli.length === 0 && (disp[id] ?? []).length > 0) ricordo.current[id] = disp[id];
    const ripresi =
      intervalli.length === 1 &&
      intervalli[0].da === INTERVALLO_PREDEFINITO.da &&
      intervalli[0].a === INTERVALLO_PREDEFINITO.a &&
      (disp[id] ?? []).length === 0 &&
      ricordo.current[id]?.length > 0
        ? ricordo.current[id]
        : intervalli;
    onDisponibilita?.({ ...disp, [id]: ripresi });
  };

  const scegliModo = (id) => {
    setMenuAperto(false);
    /* Scegliere "Personalizzata" non tocca le ore: e' il momento in cui si sta
       per mettere le mani sui giorni, e azzerarli sarebbe il contrario di
       quello che serve. Apre la tabella con dentro quello che c'era. */
    setApriPersonalizzata(id === "personalizzata");
    if (id === "personalizzata" || id === modo) return;
    onDisponibilita?.(applicaModo(id, comuni, disp));
  };

  const giorniAccesi = GIORNI.filter((g) => (disp[g.id] ?? []).length > 0);
  const settimana = oreSettimanali(disp);
  const etichettaModo = MODI_SETTIMANA.find((m) => m.id === modo)?.label ?? "Personalizzata";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[15px] font-medium tracking-[-0.01em]">Calendario</h2>
        <p className="m-0 text-meta text-content/55 max-w-[520px]">
          Le ore in cui lavori davvero. Il calendario le accende nella vista Giorno, e sono le ore
          in cui ha senso mettere una task: tutto il resto della giornata resta disegnato, ma
          spento.
        </p>
      </div>

      {/* Prima **quali giorni**, poi l'orario. Quasi nessuno ha sette giornate
          diverse, e scrivere cinque volte lo stesso orario e' cinque volte lo
          stesso gesto piu' quattro occasioni di sbagliarne uno.

          Il modo non e' una preferenza a parte: si riconosce dalle ore (vedi
          `modoDellaSettimana`). Toccando un giorno nella tabella finche' non
          combacia piu' con nessuno dei due, questa voce dice "Personalizzata"
          da se' — e se si torna esatti su una delle due, torna quella. */}
      <div className={RIGA}>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className={ETICHETTA}>Giorni lavorativi</span>
          <span className={NOTA}>
            Con i primi due l’orario si scrive una volta sola e vale per tutti. Personalizzata
            apre i sette giorni, uno per uno.
          </span>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuAperto((aperto) => !aperto)}
            className={
              "inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-divider " +
              "bg-elevated cursor-pointer text-[12.5px] text-content hover:border-accent"
            }
          >
            {etichettaModo}
            <ChevronDown size={11} className="opacity-70" />
          </button>
          <Dropdown
            open={menuAperto}
            onClose={() => setMenuAperto(false)}
            align="right"
            width={190}
          >
            {MODI_SETTIMANA.map((m) => (
              <DropdownItem key={m.id} selected={modo === m.id} onClick={() => scegliModo(m.id)}>
                <span className="flex-1">{m.label}</span>
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      </div>

      {modo === "personalizzata" ? (
        <div className="flex flex-col">
          <div className="flex items-center gap-4 pb-2 border-b border-divider">
            <span className="w-[150px] shrink-0 text-micro tracking-[0.08em] uppercase text-content/38">
              Giorno
            </span>
            <span className="flex-1 text-micro tracking-[0.08em] uppercase text-content/38">
              Intervalli
            </span>
            <span className="w-[72px] shrink-0 text-right text-micro tracking-[0.08em] uppercase text-content/38">
              Totale
            </span>
          </div>

          {GIORNI.map((g) => (
            <GiornoDisponibilita
              key={g.id}
              giorno={g}
              intervalli={disp[g.id] ?? []}
              onCambia={onDisponibilita ? (intervalli) => cambiaGiorno(g.id, intervalli) : () => {}}
            />
          ))}
        </div>
      ) : (
        /* Una giornata tipo sola, e sotto a chi si applica. Le stesse righe
           della tabella, senza la colonna dei giorni: non e' una seconda
           interfaccia, e' la stessa con una dimensione in meno. */
        <div className="flex flex-col">
          <div className="flex items-start gap-4 pb-3 border-b border-divider">
            <span className="w-[150px] shrink-0 pt-2 text-card">Orario della giornata</span>
            <EditorIntervalli
              intervalli={comuni}
              onCambia={(intervalli) => onDisponibilita?.(applicaModo(modo, intervalli, disp))}
              nome="giornata tipo"
            />
            <span className="w-[72px] shrink-0 text-right text-mini tabular-nums text-content/50 pt-2">
              {oreScritte(oreDisponibili(comuni))}
            </span>
          </div>
          <p className="m-0 pt-3 text-meta text-content/45">
            Vale per {giorniAccesi.map((g) => g.label).join(", ")}.
          </p>
        </div>
      )}

      <div className="flex items-center gap-4 pt-3 border-t border-divider">
        <span className="flex-1 text-card">Ore disponibili a settimana</span>
        <span className="w-[72px] shrink-0 text-right text-card tabular-nums text-accent">
          {oreScritte(settimana)}
        </span>
      </div>

      {/* La regola che il pannello applica da se'. Si dice qui perche' succede
          **senza** che nessuno l'abbia chiesta, e scoprirla per caso vedendo
          due intervalli diventare uno farebbe pensare a un campo che non ha
          funzionato. */}
      <p className="m-0 text-meta text-content/45 max-w-[520px] pt-1 border-t border-divider">
        Gli intervalli che si toccano diventano uno solo: 9:00–13:00 e 12:00–14:00 sono
        9:00–14:00, non sette ore. Un giorno senza intervalli è un giorno non lavorativo, ed è la
        stessa cosa che dice l’interruttore.
      </p>
    </div>
  );
}

/* ── il pannello ────────────────────────────────────────────────────────────── */

export function SettingsModal({
  onClose,
  densitaCard,
  onDensitaCard,
  campiCard,
  onCampiCard,
  disponibilita,
  onDisponibilita,
}) {
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

  /* Chiudere non tocca più l'errore. Prima lo cancellava — con una ricarica —
     perché l'errore viveva solo dentro questa finestra, e restarci appeso a
     finestra chiusa voleva dire non essere più leggibile da nessuna parte. Ora
     ha un posto suo in alto a destra, con la sua ✕: resta in scena finché non
     lo si scarta, che è il punto. */
  const chiudi = () => onClose();

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
          {sezione === "progetti" ? <Progetti /> : null}
          {sezione === "scorciatoie" ? <Scorciatoie /> : null}
          {sezione === "stati" ? <Stati /> : null}
          {sezione === "calendario" ? (
            <CalendarioImpostazioni
              disponibilita={disponibilita}
              onDisponibilita={onDisponibilita}
            />
          ) : null}
          {sezione === "aspetto" ? (
            <Aspetto
              densita={densitaCard}
              campi={campiCard ?? PRESET_CARD.essenziale}
              onDensita={onDensitaCard}
              onCampi={onCampiCard}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
