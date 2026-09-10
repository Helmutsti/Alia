import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Espandi, PathIcon } from "../components/icons.jsx";
import { InboxCard } from "./InboxCard.jsx";
import { TaskRow } from "./TaskRow.jsx";
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from "./Dropdown.jsx";
import {
  GROUP_KEYS,
  SENZA_PROGETTO,
  SHOW_DONE,
  SORT_KEYS,
  activeFilterCount,
  eFiltroTag,
  filterGroups,
  filterTasks,
  filtroDaTag,
  tagDaFiltro,
  groupTasks,
  sortTasks,
} from "./contentQuery.js";
import { VIEW_BLOCKED, VIEW_ICONS, VIEW_LABELS, VIEW_ORDER } from "./data.js";
import { useAlia } from "../lib/AliaProvider.jsx";
import { dueLabel, giorniDiScarto } from "../lib/tasks.js";

/* Area contenuto — testata risolta in DEF_Content.

   Riga 1: a sinistra il progetto (20px, senza bordi, pallino e freccia), a
   destra la vista. Sono le due scelte che valgono per tutte le viste.
   Riga 2: gli strumenti della vista corrente. In Lista: ordinamento, filtro,
   raggruppamento. Misura 94px in tutto, contro i 141 della versione a tre file
   che aveva ambito, tab e filtri su righe separate.

   Fuori: la barra di ricerca, le chip Priorità/Milestone e la tab "Oggi".
   La ricerca non era stata decisa; le chip sono confluite nel menu filtri; gli
   intervalli temporali, non essendo chiavi di raggruppamento, stanno nel filtro
   e hanno reso la tab superflua.

   Il selettore di progetto non ha la voce "Senza progetto": quelle task vivono
   nella sezione "Da smistare". Compaiono qui come *gruppo*, quando si raggruppa
   per progetto — che è un'altra cosa. */

/* Il segnaposto del varco: un valore identitario, confrontato con `===`, cosi'
   non puo' essere confuso con un task. */
const VARCO = Symbol("varco");

/* Altezza del varco, pari a quella di una riga a una riga di testo: 13.5px di
   testo per 1.35 di interlinea, piu' 12+12 di padding verticale e 3 di bordi. */
const ALTEZZA_RIGA = 46;

const CTL =
  "inline-flex items-center gap-[7px] h-8 px-3 rounded-lg border border-divider bg-transparent " +
  "cursor-pointer text-[12.5px] hover:border-accent";
const CTL_MUT = `${CTL} text-content/70`;
/* Il selettore di progetto. `h-8` come i comandi accanto, e non e' un dettaglio:
   il testo qui e' 18px contro i 12.5 del selettore vista, quindi a riquadri
   liberi il suo e' alto 25.6 contro 32. Centrati nella stessa riga i due
   condividono il centro ma non il bordo alto — e siccome quello a destra ha un
   contorno visibile e questo no, si vede il suo riquadro cominciare tre pixel
   piu in alto del testo di questo, e la riga sembra sfalsata. Alla stessa
   altezza i due riquadri cominciano insieme. */
const PICK =
  "inline-flex items-center gap-[9px] h-8 border-0 bg-transparent cursor-pointer text-content " +
  "font-medium tracking-[-0.015em] px-1.5 rounded-md leading-[1.2] text-lg " +
  "hover:bg-[color-mix(in_srgb,var(--color-content)_7%,transparent)]";

/* Quanto si prende la barra di scorrimento dentro l'elemento che scorre.

   Serve perché il margine destro non può essere una costante: la barra non e
   in sovrimpressione dappertutto. Nell'app lo e (Electron parte con
   `--enable-features=OverlayScrollbar`) e non occupa niente; in un browser
   normale — la pagina di anteprima — si prende una decina di pixel **dentro**
   il riquadro, e un `padding-right` di 12 non li annulla: gli si somma, e le
   righe finiscono a 22 dal bordo mentre la colonna a sinistra sta a 12. E
   l'asimmetria che si vedeva.

   Quindi si misura invece di assumere, e il margine diventa `12 - barra`: 12
   dove la barra non occupa spazio, 2 dove se ne prende 10. In tutti e due i
   casi il bordo destro delle righe cade a 12, come la colonna a sinistra.

   La misura si rifa a ogni cambio di contenuto perche la barra va e viene con
   la lunghezza dell'elenco. */
function useLarghezzaBarra(rif, dipendenze) {
  const [barra, setBarra] = useState(0);
  useLayoutEffect(() => {
    const el = rif.current;
    if (!el) return;
    const misurata = el.offsetWidth - el.clientWidth;
    setBarra((prec) => (Math.abs(prec - misurata) < 0.5 ? prec : misurata));
  });
  return barra;
}

export function ContentPane({ onOpenTask, onApriComposer, onRowPointerDown, onOrdinamento, anteprima }) {
  const alia = useAlia();
  const rifLista = useRef(null);
  const barra = useLarghezzaBarra(rifLista);
  const [scope, setScope] = useState("all");
  /* Parte da "lista", l'unica vista non bloccata, e `setView` rifiuta le altre:
     `view` non puo quindi assumere il valore di una vista bloccata. */
  const [view, setView] = useState("lista");
  const [sortKey, setSortKey] = useState("scadenza");
  const [sortDir, setSortDir] = useState("asc");
  const [group, setGroup] = useState("progetto");
  const [filters, setFilters] = useState(() => new Set());
  const [menu, setMenu] = useState(null);
  /* Quello che si sta scrivendo nel campo dei tag. Vive qui e non nel filtro:
     finche' non si preme Invio non e' un filtro, e' una parola a meta. */
  const [tagScritto, setTagScritto] = useState("");

  /* Il doppio clic dentro un gruppo apre un campo **in quel gruppo**, e la task
     nasce gia' nel progetto: e' l'unico gesto di creazione che non passa dalla
     colonna Inbox, ed e' anche il motivo per cui vive qui — ContentPane e'
     l'unico posto che sa su quale gruppo si e' cliccato.

     Vale **solo raggruppando per progetto**, come il rilascio del
     trascinamento e per la stessa ragione: e' il solo raggruppamento in cui il
     gruppo identifica un valore assegnabile senza ambiguita'. Dentro "In corso"
     o "Alta", cosa vorrebbe dire creare li'? Una regola diversa per ogni
     raggruppamento sarebbe una regola che nessuno ricorda.

     `apertoIn` tiene l'id del gruppo con il campo aperto — uno per volta, che
     e' quanti ne servono.

     Il doppio clic non e' pero' l'unico modo di arrivarci, ed e' bene che non lo
     sia: un gesto che non lascia traccia a schermo non lo trova chi non sa gia'
     che c'e'. In fondo a ogni gruppo c'e' un campo **sempre presente**, appena
     visibile, che si accende al passaggio del mouse. Il doppio clic e' la
     scorciatoia per quello stesso campo, non un secondo gesto. */
  const [apertoIn, setApertoIn] = useState(null);
  const [titoloNuovo, setTitoloNuovo] = useState("");

  const apriIn = useCallback(
    (idGruppo) => {
      if (group !== "progetto") return;
      setTitoloNuovo("");
      setApertoIn(idGruppo);
    },
    [group],
  );

  /* Un doppio clic *su una riga* non deve aprire niente: li' il doppio clic e'
     un gesto della riga. Si apre solo dal vuoto del gruppo — che e' esattamente
     il posto in cui la task comparira'. */
  const doppioClic = useCallback(
    (e, idGruppo) => {
      if (e.target.closest("[data-task]")) return;
      apriIn(idGruppo);
    },
    [apriIn],
  );

  /* Gli stessi due modi del campo in colonna — rapido con Invio, completo con
     il comando che apre la scheda — con in piu' il progetto del gruppo. Vedi la
     nota estesa in InboxWorkspace: la differenza fra i due non e' quanto si
     scrive, e' dove si finisce. */
  const creaNelGruppo = useCallback(
    async (idGruppo, { completo = false } = {}) => {
      const titolo = titoloNuovo.trim();
      if (!titolo && !completo) return;
      setTitoloNuovo("");
      /* `isInbox: false` perche' questa task e' gia' decisa: chi la scrive la
         sta mettendo in un progetto preciso, e mandarla in triage vorrebbe dire
         chiedergli di ridecidere una cosa che ha appena deciso. E' l'opposto
         del campo della colonna Inbox, dove la task nasce da smistare proprio
         perche' li' non si e' scelto niente. */
      if (completo) {
        /* Il completo non crea: apre il composer con dentro quello che era
           stato scritto e il progetto del gruppo gia' scelto. Chi lo apre da
           qui ha gia' detto dove va. */
        setApertoIn(null);
        onApriComposer?.({
          titolo,
          idProgetto: idGruppo === SENZA_PROGETTO ? null : idGruppo,
          inbox: false,
        });
        return;
      }
      await alia.creaTask({
        title: titolo,
        idProject: idGruppo === SENZA_PROGETTO ? null : idGruppo,
        isInbox: false,
      });
    },
    [alia, onApriComposer, titoloNuovo],
  );

  /* I gruppi chiusi della vista Lista.

     La chiave porta con sé **anche il raggruppamento** (`progetto:casa`, non
     `casa`): gli id dei gruppi vengono da domini diversi a seconda di come si
     raggruppa — un progetto, uno stato, una priorità — e senza il prefisso il
     progetto con id "1" e lo stato con id "1" si chiuderebbero a vicenda.

     Vive quanto la schermata: chiudere un gruppo è un gesto di lettura, come
     scorrere, non una preferenza da ricordare. Se un giorno lo diventasse, il
     posto è la tabella delle preferenze che ancora non c'è (vedi TODO). */
  const [chiusi, setChiusi] = useState(() => new Set());
  const chiaveGruppo = useCallback((idGruppo) => `${group}:${idGruppo}`, [group]);
  const alterna = useCallback(
    (idGruppo) =>
      setChiusi((prec) => {
        const next = new Set(prec);
        const k = `${group}:${idGruppo}`;
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      }),
    [group],
  );

  /* L'ordinamento in uso viene riferito a chi ospita il pannello, perche' il
     rilascio del trascinamento deve sapere se la posizione ha un senso: con un
     ordinamento calcolato (scadenza, priorita', titolo) scriverla non si
     vedrebbe, il task salterebbe subito dove lo mette l'ordinamento. */
  useEffect(() => {
    onOrdinamento?.(sortKey);
  }, [onOrdinamento, sortKey]);

  /* Un gruppo chiuso che diventa bersaglio del trascinamento si apre, e resta
     aperto dopo il rilascio. Senza, il task finirebbe dentro una scatola chiusa
     e sparirebbe davanti agli occhi di chi lo ha appena spostato: il varco che
     dovrebbe mostrarne la destinazione non ha dove disegnarsi. */
  useEffect(() => {
    const bersaglio = anteprima?.groupId;
    if (!bersaglio) return;
    setChiusi((prec) => {
      const k = `${group}:${bersaglio}`;
      if (!prec.has(k)) return prec;
      const next = new Set(prec);
      next.delete(k);
      return next;
    });
  }, [anteprima?.groupId, group]);

  const chiudi = useCallback(() => setMenu(null), []);
  const apri = (id) => setMenu((m) => (m === id ? null : id));

  const toggleFiltro = (id) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { tasks, projects, states } = alia;
  const progetto = projects.find((p) => p.id === scope);
  const nFiltri = activeFilterCount(filters);
  /* I gruppi dipendono anche dai filtri accesi, non solo dai dati: quello dei
     tag e' fatto di quelli scritti (vedi contentQuery). */
  const gruppiFiltro = useMemo(() => filterGroups(states, filters), [states, filters]);

  /* L'area contenuto mostra le task di primo livello: i sotto-task appartengono
     al loro padre e si leggono nel dettaglio, non come righe pari agli altri.
     Senza questo, un task con tre figli occuperebbe quattro righe. */
  const radici = useMemo(() => tasks.filter((t) => t.parentId === null), [tasks]);

  /* Ambito → filtri → ordinamento → gruppi, in quest'ordine: l'ambito decide
     l'insieme di partenza, il resto lavora su quello. */
  /* L'anteprima del trascinamento, applicata **solo a schermo**.

     Nel gruppo bersaglio si apre un **varco vuoto**, e il task trascinato
     viene tolto dal gruppo in cui stava. Le righe fra i due punti scorrono di
     una posizione: e' il "fare spazio" che fanno le card nella colonna.

     Il varco e' spazio, non una copia della riga. Inserire il task vero e'
     stata la prima versione ed era sbagliata per due motivi che si vedono
     subito: il FLIP animava anche quella riga, facendola volare dal gruppo
     dov'era fino al punto d'inserimento — attraverso tutta la lista, sopra le
     intestazioni — a ogni cambio del punto d'inserimento; e il task finiva
     mostrato tre volte insieme, come card sbiadita nella colonna, come riga
     nel pannello e come clone sotto il puntatore. Il varco non ha
     `data-task`, quindi non entra ne' nel FLIP ne' nel calcolo del punto
     d'inserimento: resta spazio e non si muove.

     Perche' non riordinando l'array dei task, che sarebbe la strada ovvia:
     l'elenco e' ordinato per scadenza (o priorita', o titolo), quindi l'ordine
     dell'array non decide niente e rimescolarlo produrrebbe uno spostamento
     arbitrario — e farlo a ogni pixel ri-impaginava tutti i gruppi, che e' il
     difetto per cui trascinando una riga si muoveva tutto. */
  const conAnteprima = useCallback(
    (gruppi) => {
      if (!anteprima?.groupId) return gruppi;

      return gruppi.map((g) => {
        const senza = g.items.filter((t) => t.id !== anteprima.id);
        if (g.id !== anteprima.groupId) {
          return senza.length === g.items.length ? g : { ...g, items: senza };
        }
        const dove = anteprima.beforeId
          ? senza.findIndex((t) => String(t.id) === String(anteprima.beforeId))
          : -1;
        const items = senza.slice();
        items.splice(dove === -1 ? items.length : dove, 0, VARCO);
        return { ...g, items };
      });
    },
    [anteprima],
  );

  const gruppi = useMemo(() => {
    const inAmbito = scope === "all" ? radici : radici.filter((t) => t.project?.id === scope);
    const visibili = sortTasks(filterTasks(inAmbito, filters, gruppiFiltro), sortKey, sortDir);
    return groupTasks(visibili, view === "lista" ? group : "nessuno", { projects, states });
  }, [radici, scope, filters, gruppiFiltro, sortKey, sortDir, group, view, projects, states]);

  /* L anteprima si applica **solo a quello che disegna la Lista**, non a
     `gruppi`. I gruppi puri restano la sorgente per il conteggio in testata e
     per le altre viste, che iterano gli elementi aspettandosi dei task: il
     segnaposto del varco non e un task, e infilarlo la faceva esplodere
     colonneKanban, che legge lo stato di ogni elemento. */
  const gruppiDaDisegnare = useMemo(() => conAnteprima(gruppi), [conAnteprima, gruppi]);

  const totale = gruppi.reduce((n, g) => n + g.items.length, 0);

  /* Le colonne del Kanban sono gli stati configurati, in ordine di `stepOrder`:
     non tre colonne fisse. Le chiusure si accorpano nell'ultima, altrimenti con
     quattro stati finali il Kanban diventerebbe una fila di colonne vuote. */
  const colonneKanban = useMemo(() => {
    const visibili = gruppi.flatMap((g) => g.items);
    const aperti = states.filter((s) => s.role !== "end").sort((a, b) => a.stepOrder - b.stepOrder);
    const chiusure = states.filter((s) => s.role === "end");
    const colonne = aperti.map((s) => ({
      key: `s${s.id}`,
      label: s.label,
      items: visibili.filter((t) => t.state.id === s.id),
    }));
    if (chiusure.length > 0) {
      colonne.push({ key: "chiuse", label: "Chiuse", items: visibili.filter((t) => t.done) });
    }
    return colonne;
  }, [gruppi, states]);

  /* Calendario e Gantt restano le viste abbozzate che erano — l'utente ha
     rimandato il loro disegno — ma smettono di mostrare dati inventati: i
     punti sono le scadenze vere del mese corrente, le barre le task che hanno
     davvero un intervallo `startAt`→`dueAt`. */
  const giorniDelMese = useMemo(() => {
    const oggi = new Date();
    return new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0).getDate();
  }, []);

  const barreGantt = useMemo(() => {
    const conIntervallo = gruppi
      .flatMap((g) => g.items)
      .filter((t) => t.startAt && t.dueAt)
      .slice(0, 8);
    if (conIntervallo.length === 0) return [];

    const inizi = conIntervallo.map((t) => new Date(t.startAt).getTime());
    const fini = conIntervallo.map((t) => new Date(t.dueAt).getTime());
    const da = Math.min(...inizi);
    const a = Math.max(...fini);
    const ampiezza = Math.max(1, a - da);
    return conIntervallo.map((t) => ({
      id: t.id,
      label: t.title,
      left: ((new Date(t.startAt).getTime() - da) / ampiezza) * 100,
      width: Math.max(2, ((new Date(t.dueAt).getTime() - new Date(t.startAt).getTime()) / ampiezza) * 100),
    }));
  }, [gruppi]);

  const puntiCalendario = useMemo(() => {
    const oggi = new Date();
    return new Set(
      gruppi
        .flatMap((g) => g.items)
        .map((t) => (t.dueAt ? new Date(t.dueAt) : null))
        .filter((d) => d && d.getMonth() === oggi.getMonth() && d.getFullYear() === oggi.getFullYear())
        .map((d) => d.getDate()),
    );
  }, [gruppi]);

  /* Il progetto nella riga solo quando non è già la chiave del gruppo e
     l'ambito è su tutti: altrimenti sarebbe la stessa parola su ogni riga. */
  const mostraProgetto = scope === "all" && group !== "progetto";

  /* Il Kanban dispone le task in colonne, quindi lì sono card e non righe:
     è la stessa distinzione che tiene separati TaskRow e InboxCard. */
  const kanbanCard = (t) => (
    <InboxCard
      key={t.id}
      id={t.id}
      title={t.title}
      due={dueLabel(t.dueAt)}
      titleSize="text-meta"
      dueSize="text-[10.5px]"
      priorityColor={t.priorityColor}
    />
  );

  return (
    /* Imbottitura: quasi tutta via (era `px-6 py-5`).

       Quei 24/20 erano l'imbottitura **interna della card** che avvolgeva il
       contenuto. La card non c'è più — il contenitore è passato alla colonna —
       e sono rimasti a fare il doppio del margine di quadro, che nel frattempo
       il riquadro qui fuori applica già da sé (`FRAME.pad` su destra e basso,
       `colTop` in alto). Toglierli è ciò che riallinea il contenuto alle
       colonne invece di farlo galleggiare più dentro di loro.

       Resta il solo `pl`, e non è simmetria mancata: a sinistra c'è la maniglia
       di trascinamento, larga 22 e centrata sul bordo della colonna, quindi
       sporge di 11 dentro quest'area. 18 la scavalca con 7 di respiro.

       A destra il margine (`pr-3`, 12) sta sui **figli** e non qui, ed è la
       barra di scorrimento a chiederlo: quando non è in sovrimpressione se ne
       prende una decina dentro l'elemento che scorre. Con il margine sulla
       radice l'elenco finirebbe 12 prima del bordo e la barra dentro di lui,
       cioè le righe a 22 dal bordo contro i 12 della colonna a sinistra —
       l'asimmetria che si vedeva. Con il margine sui figli la barra cade nel
       margine e le righe tornano a 12.

       In alto **niente**, e prima c'erano 13. Allineavano la prima riga di
       comandi alla prima *card* della colonna — 1 di bordo piu 12 di
       imbottitura — e per un giro e' stata la cosa giusta, quando in cima alla
       colonna c'era il bottone "Aggiungi task" a cui agganciarsi. Quel bottone
       non c'e' piu, e l'aggancio e' morto con lui: restava un rientro di 13 che
       non allineava piu niente.

       Adesso il riferimento e' il **bordo alto del contenitore** a sinistra, che
       e' la linea forte della schermata: una card con un bordo visibile taglia
       l'immagine in orizzontale, e tutto quello che le sta a fianco deve
       cominciare li'. La prima card della colonna resta piu in basso, ed e'
       giusto: e' contenuto dentro un contenitore, non un comando accanto a
       esso. */
    <div className="flex-1 min-w-0 flex flex-col pl-[18px] overflow-hidden relative">
      {/* ═══ riga 1 — cosa guardo · in che forma ═══ */}
      <div className="flex items-center h-[34px] mb-3 pr-3 shrink-0">
        <div className="relative">
          <button type="button" onClick={() => apri("progetto")} className={PICK}>
            {progetto ? (
              <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: progetto.color }} />
            ) : (
              <span className="w-[9px] h-[9px] rounded-full shrink-0 border-[1.4px] border-dashed border-content/55" />
            )}
            {progetto ? progetto.name : "Tutti i progetti"}
            <ChevronDown size={14} className="opacity-65 shrink-0 ml-0.5" />
          </button>
          <Dropdown open={menu === "progetto"} onClose={chiudi} width={236}>
            <DropdownItem
              selected={scope === "all"}
              onClick={() => {
                setScope("all");
                chiudi();
              }}
            >
              <span className="w-[9px] h-[9px] rounded-full shrink-0 border-[1.4px] border-dashed border-content/55" />
              <span className="flex-1">Tutti i progetti</span>
              <span className="text-mini opacity-70">{radici.length}</span>
            </DropdownItem>
            <DropdownSeparator />
            {projects.map((p) => (
              <DropdownItem
                key={p.id}
                selected={scope === p.id}
                onClick={() => {
                  setScope(p.id);
                  chiudi();
                }}
              >
                <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: p.color }} />
                <span className="flex-1">{p.name}</span>
                <span className="text-mini opacity-70">
                  {radici.filter((t) => t.project?.id === p.id).length}
                </span>
              </DropdownItem>
            ))}
          </Dropdown>
        </div>

        <span className="ml-2 text-sm text-content/42">{totale} task</span>
        <span className="flex-1" />

        <div className="relative">
          <button type="button" onClick={() => apri("vista")} className={CTL}>
            <PathIcon d={VIEW_ICONS[view]} size={14} />
            {VIEW_LABELS[view]}
            <ChevronDown size={11} className="opacity-70" />
          </button>
          <Dropdown open={menu === "vista"} onClose={chiudi} align="right" width={180}>
            {VIEW_ORDER.map((v) => (
              <DropdownItem
                key={v}
                selected={view === v}
                disabled={VIEW_BLOCKED.has(v)}
                onClick={() => {
                  /* Il controllo c'e anche qui e non solo nel `disabled`: il
                     bottone disabilitato basta per il mouse, questo copre
                     un'attivazione che arrivasse da altro (tastiera, test). */
                  if (VIEW_BLOCKED.has(v)) return;
                  setView(v);
                  chiudi();
                }}
              >
                <PathIcon d={VIEW_ICONS[v]} size={14} />
                <span className="flex-1">{VIEW_LABELS[v]}</span>
                {VIEW_BLOCKED.has(v) ? (
                  <span className="text-[10px] text-content/40">non attiva</span>
                ) : null}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* ═══ riga 2 — strumenti della vista ═══ */}
      <div className="flex items-center gap-2 mb-4 pr-3 shrink-0">
        <div className="relative">
          <button type="button" onClick={() => apri("ordina")} className={CTL_MUT}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h13M4 12h9M4 18h5" />
            </svg>
            Ordina: {SORT_KEYS.find((k) => k.id === sortKey).label.toLowerCase()}
            <ChevronDown size={11} className="opacity-70" />
          </button>
          <Dropdown open={menu === "ordina"} onClose={chiudi} width={200}>
            {SORT_KEYS.map((k) => (
              <DropdownItem key={k.id} selected={sortKey === k.id} onClick={() => setSortKey(k.id)}>
                <span className="flex-1">{k.label}</span>
              </DropdownItem>
            ))}
            <DropdownSeparator />
            {/* La direzione è una seconda scelta, non una sesta chiave: separata,
                e spenta quando l'ordine è manuale perché lì non vuol dire nulla. */}
            {sortKey === "manuale" ? (
              <p className="text-mini text-content/38 px-[9px] py-2 m-0">
                L’ordine manuale non ha direzione.
              </p>
            ) : (
              ["asc", "desc"].map((d) => (
                <DropdownItem key={d} selected={sortDir === d} onClick={() => setSortDir(d)}>
                  <span className="flex-1">{d === "asc" ? "Crescente" : "Decrescente"}</span>
                </DropdownItem>
              ))
            )}
          </Dropdown>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => apri("filtri")}
            className={nFiltri ? CTL : CTL_MUT}
            aria-label={nFiltri ? `Filtri, ${nFiltri} attivi` : "Filtri"}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16l-6 7v5l-4 2v-7z" />
            </svg>
            Filtri
            {nFiltri > 0 ? (
              <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-accent text-bg text-micro font-medium">
                {nFiltri}
              </span>
            ) : null}
          </button>
          <Dropdown open={menu === "filtri"} onClose={chiudi} width={224}>
            {gruppiFiltro.map((g, i) => (
              <div key={g.id}>
                {i > 0 ? <DropdownSeparator /> : null}
                <DropdownLabel>{g.label}</DropdownLabel>
                {g.items.map((f) => (
                  /* Il menu non si chiude: accendere due filtri di fila non
                     deve costare due aperture. */
                  <DropdownItem key={f.id} selected={filters.has(f.id)} onClick={() => toggleFiltro(f.id)}>
                    <span className="flex-1">{f.label}</span>
                  </DropdownItem>
                ))}
              </div>
            ))}
            {/* I tag si scrivono, non si scelgono.

                Gli altri gruppi elencano quello che c'e' — le priorita' del
                modello, gli stati configurati — perche' sono pochi e chiusi. I
                tag no: un elenco di tutti diventerebbe un menu che cresce senza
                limite, e sarebbe inutile proprio quando i tag servono davvero,
                cioe' quando sono tanti. Qui si scrive quello che si cerca e si
                preme Invio; il tag scritto compare sopra il campo, acceso, e si
                spegne cliccandolo come qualsiasi altro filtro.

                Il gruppo non ha bisogno di una riga sua sopra: e' l'unico che
                puo' essere vuoto e comparire lo stesso, perche' il campo c'e'
                sempre. */}
            {gruppiFiltro.some((g) => g.id === "tag") ? null : (
              <>
                <DropdownSeparator />
                <DropdownLabel>Tag</DropdownLabel>
              </>
            )}
            <div className="px-[9px] pb-1.5 pt-0.5">
              <input
                type="text"
                value={tagScritto}
                placeholder="Scrivi un tag e premi Invio…"
                aria-label="Filtra per tag"
                onChange={(e) => setTagScritto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setTagScritto("");
                  if (e.key !== "Enter") return;
                  const pulito = tagScritto.trim();
                  if (!pulito) return;
                  setTagScritto("");
                  setFilters((prec) => new Set(prec).add(filtroDaTag(pulito)));
                }}
                className="w-full h-7 px-2 rounded-md border border-dashed border-divider bg-transparent text-[12.5px] text-content placeholder:text-content/38 focus:outline-none focus:border-accent"
              />
            </div>
            <DropdownSeparator />
            <DropdownItem selected={filters.has(SHOW_DONE.id)} onClick={() => toggleFiltro(SHOW_DONE.id)}>
              <span className="flex-1">{SHOW_DONE.label}</span>
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onClick={() => setFilters(new Set())}>
              <span className="flex-1">Azzera i filtri</span>
            </DropdownItem>
          </Dropdown>
        </div>

        {view === "lista" ? (
          <div className="relative">
            <button type="button" onClick={() => apri("raggruppa")} className={CTL_MUT}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 5h16M4 12h16M4 19h16" opacity=".45" />
                <path d="M4 5h6M4 12h6M4 19h6" />
              </svg>
              Raggruppa: {GROUP_KEYS.find((k) => k.id === group).label.toLowerCase()}
              <ChevronDown size={11} className="opacity-70" />
            </button>
            <Dropdown open={menu === "raggruppa"} onClose={chiudi} width={200}>
              {GROUP_KEYS.map((k) => (
                <DropdownItem
                  key={k.id}
                  selected={group === k.id}
                  onClick={() => {
                    setGroup(k.id);
                    chiudi();
                  }}
                >
                  <span className="flex-1">{k.label}</span>
                </DropdownItem>
              ))}
            </Dropdown>
          </div>
        ) : null}
      </div>

      {/* ═══ vista Lista ═══ */}
      {view === "lista" ? (
        <div
          ref={rifLista}
          className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2"
          style={{ paddingRight: Math.max(0, 12 - barra) }}
        >
          {totale === 0 ? (
            <p className="text-meta text-content/45 m-0 pt-2">
              Nessuna task con questi filtri.
            </p>
          ) : (
            gruppiDaDisegnare.map((g) => (
              <div
                key={g.id}
                /* Bersaglio del rilascio solo raggruppando per progetto: e' il
                   solo raggruppamento in cui il gruppo identifica un valore
                   assegnabile senza ambiguita'. Sugli altri l'attributo non
                   c'e', quindi il motore non trova bersagli e il rilascio viene
                   rifiutato da se' — senza un elenco di casi da mantenere. */
                data-drop-group={group === "progetto" ? g.id : undefined}
                onDoubleClick={group === "progetto" ? (e) => doppioClic(e, g.id) : undefined}
                className="flex flex-col gap-2 rounded-lg transition-colors duration-[120ms]">
                {g.label ? (
                  /* La testata è il comando che apre e chiude il gruppo, tutta
                     intera — freccia, pallino, nome, conteggio e filo. Un
                     bersaglio grande per un gesto frequente, invece di una
                     freccia da centrare; e resta un `button`, quindi ci si
                     arriva col tabulatore e si preme con Invio.
                     Il filo non è decorazione riciclata: era già lì a chiudere
                     la riga, e continua a farlo. */
                  <button
                    type="button"
                    onClick={() => alterna(g.id)}
                    aria-expanded={!chiusi.has(chiaveGruppo(g.id))}
                    title={chiusi.has(chiaveGruppo(g.id)) ? "Apri il gruppo" : "Chiudi il gruppo"}
                    className="flex items-center gap-2 pt-0.5 w-full text-left bg-transparent border-0 p-0 cursor-pointer group/testata"
                  >
                    <ChevronDown
                      size={11}
                      className={
                        "shrink-0 text-content/45 transition-transform duration-[140ms] group-hover/testata:text-content/75 " +
                        (chiusi.has(chiaveGruppo(g.id)) ? "-rotate-90" : "")
                      }
                    />
                    <span className="flex items-center gap-1.5 text-[10.5px] tracking-[0.1em] uppercase font-medium text-content/62 group-hover/testata:text-content/80">
                      {g.dot ? (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.dot }} />
                      ) : null}
                      {g.dashed ? (
                        <span className="w-1.5 h-1.5 rounded-full border-[1.4px] border-dashed border-content/55" />
                      ) : null}
                      {g.label}
                    </span>
                    {/* Il varco non e un task: non va contato. Chiuso, questo
                        numero è l'unica cosa che dice cosa c'è dentro. */}
                    <span className="text-mini text-content/42">
                      {g.items.filter((t) => t !== VARCO).length}
                    </span>
                    <span className="flex-1 h-px bg-divider" />
                  </button>
                ) : null}
                {chiusi.has(chiaveGruppo(g.id)) ? null : g.items.map((t) =>
                  t === VARCO ? (
                    /* Il varco: spazio e nient'altro. Nessun bordo e nessun
                       fondo — la destinazione la dice lo spazio che si apre, e
                       un disegno per sottolinearla e' da studiare. */
                    <div key="varco" aria-hidden="true" style={{ height: ALTEZZA_RIGA }} />
                  ) : (
                    <TaskRow
                      key={t.id}
                      task={t}
                      showProject={mostraProgetto}
                      states={states}
                      onChangeState={(task, stato) => alia.cambiaStato(task.id, stato.id)}
                      onOpen={onOpenTask ? () => onOpenTask(t.id) : undefined}
                      onPointerDown={
                        onRowPointerDown && group === "progetto"
                          ? (e) => onRowPointerDown(t.id, e)
                          : undefined
                      }
                    />
                  ),
                )}

                {/* La riga fantasma del gruppo: in coda, che e' dove la task
                    comparira'. C'e' sempre, ma sta indietro — tratteggio e testo
                    al 24%, che al passaggio del mouse salgono. Non e' timidezza:
                    con dieci gruppi aperti, dieci campi a piena voce sarebbero
                    dieci righe di rumore fra un elenco e l'altro. Cosi' invece
                    si conta come uno spazio, finche' non lo si guarda.

                    Scrivendo, resta aperto dopo Invio: di task in un progetto se
                    ne scrivono piu' d'una per volta. */}
                {apertoIn === g.id ? (
                  <div className="flex items-center gap-2 w-full h-[38px] pl-3 pr-2 rounded-lg border border-dashed border-accent">
                    <input
                      type="text"
                      autoFocus
                      value={titoloNuovo}
                      placeholder={`Nuova task in ${g.label ?? "questo gruppo"}…`}
                      aria-label="Titolo della nuova task"
                      onChange={(e) => setTitoloNuovo(e.target.value)}
                      onBlur={() => setApertoIn(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setTitoloNuovo("");
                          e.currentTarget.blur();
                        }
                        if (e.key === "Enter") creaNelGruppo(g.id);
                      }}
                      className="flex-1 min-w-0 bg-transparent border-0 outline-none text-card text-content placeholder:text-content/45"
                    />
                    {/* `onMouseDown` con `preventDefault` e non `onClick` da
                        solo: senza, il campo perde il fuoco prima che il click
                        arrivi, `onBlur` chiude la riga e il comando non viene
                        premuto mai. */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => creaNelGruppo(g.id, { completo: true })}
                      title="Apri la scheda completa"
                      aria-label="Apri la scheda completa"
                      className="grid place-items-center w-6 h-6 shrink-0 rounded-md border-0 bg-transparent cursor-pointer text-content/40 hover:text-accent hover:bg-[color-mix(in_srgb,var(--color-content)_10%,transparent)]"
                    >
                      <Espandi size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => apriIn(g.id)}
                    className={
                      "w-full h-[34px] px-3 rounded-lg bg-transparent cursor-pointer text-left " +
                      "border border-dashed text-[12.5px] transition-colors duration-[120ms] " +
                      "border-[color-mix(in_srgb,var(--color-content)_10%,transparent)] text-content/24 " +
                      "hover:border-[color-mix(in_srgb,var(--color-content)_28%,transparent)] hover:text-content/60"
                    }
                  >
                    Nuova task in {g.label ?? "questo gruppo"}…
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* ═══ vista Kanban ═══ */}
      {view === "kanban" ? (
        <div className="flex-1 min-h-0 flex gap-3.5 overflow-x-auto pr-3">
          {colonneKanban.map((col) => (
            <div key={col.key} className="flex-[0_0_220px] flex flex-col gap-2 overflow-y-auto">
              <div className="text-mini tracking-[0.1em] uppercase font-medium text-content/62 px-0.5 mb-1">
                {col.label} <span className="font-normal text-content/50">{col.items.length}</span>
              </div>
              {col.items.map((t) => kanbanCard(t))}
            </div>
          ))}
        </div>
      ) : null}

      {/* ═══ vista Calendario ═══ */}
      {view === "calendario" ? (
        <div className="flex-1 min-h-0 grid grid-cols-7 auto-rows-fr gap-1.5 pr-3">
          {Array.from({ length: giorniDelMese }, (_, i) => i + 1).map((day) => (
            <div key={day} className="border border-divider rounded-sm p-1.5 flex flex-col gap-1">
              <span className="text-micro text-content/50">{day}</span>
              {puntiCalendario.has(day) ? <span className="w-[5px] h-[5px] rounded-full bg-accent" /> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ═══ vista Gantt ═══ */}
      {view === "gantt" ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2.5 justify-center pr-3">
          {barreGantt.length === 0 ? (
            <p className="text-meta text-content/45 m-0">
              Nessuna task con un intervallo: il Gantt mostra solo quelle che hanno sia inizio che
              scadenza.
            </p>
          ) : null}
          {barreGantt.map((bar) => (
            <div key={bar.id} className="flex items-center gap-2.5">
              <span className="flex-[0_0_90px] text-[11.5px] text-content/60">{bar.label}</span>
              <div className="flex-1 h-4 rounded-sm relative overflow-hidden bg-content/6">
                <div
                  className="absolute inset-y-0 bg-accent rounded-sm opacity-85"
                  style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
