import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  analizzaTitolo,
  completaToken,
  formattaPromemoria,
  risolviMilestone,
  risolviProgetto,
  tokenInCorso,
} from "../lib/composerSyntax.js";

import { Alarm, Bandierina, Calendario, Cartella, Etichette, Send } from "./icons.jsx";
import { useAlia } from "../lib/AliaProvider.jsx";
import { useTrappolaFuoco } from "../lib/fuoco.js";
import { SCORCIATOIA_COMPOSER } from "../lib/piattaforma.js";
import { PRIORITIES } from "../lib/tasks.js";

/* Il composer — trascritto da `DEF_Task Composer` (vedi Rinascita.md, § Interfaccia).

   È l'inserimento **completo**: si apre dal comando `⤢` dei campi rapidi, con
   dentro già quello che era stato scritto lì (`titoloIniziale`, che nell'artboard
   è la prop `seedTitle` — il composer è progettato per essere aperto a titolo già
   cominciato, non da vuoto).

   Struttura dell'artboard: card larga 640 in due blocchi. Sopra il titolo a 19px
   e la nota; sotto, oltre un filo, la barra delle cinque chip — scadenza,
   priorità, promemoria, progetto, tag — ognuna con il suo menu, e a destra
   l'aeroplanino che aggiunge. Due modi, `inline` e `floating`: il secondo mette
   un velo sotto la card e una riga di aiuti in fondo. Qui si usa il secondo,
   perché il gesto che lo apre è un "fermati e compila".

   **Scostamento dichiarato: l'invio è `Invio`, non `Maiusc+Invio`.** L'artboard
   usa la seconda, e la scrive anche nella riga di aiuti in fondo. È stata
   scartata di proposito: in un campo di testo `Maiusc+Invio` vuol dire "vai a
   capo" in mezzo mondo, e girarla ad "aggiungi" sorprende invece di aiutare.
   Nella nota, dove andare a capo serve davvero, `Invio` fa il suo mestiere
   normale e non aggiunge niente — l'aggiunta si comanda dal titolo o
   dall'aeroplanino.

   Secondo scostamento: **le voci dei menu vengono dai dati**, non dall'elenco
   fisso dell'artboard. Le priorità sono le cinque del core, i progetti quelli
   che esistono, i tag quelli già usati — più la possibilità di scriverne uno
   nuovo, che è la stessa scelta fatta per il filtro: elencare tutti i tag è un
   menu che cresce senza limite. */

const CARD =
  "relative w-full max-w-[640px] rounded-[14px] bg-surface shadow-elev-lg overflow-visible";
const CHIP =
  "inline-flex items-center gap-1.5 h-[27px] px-2.5 rounded-lg bg-transparent cursor-pointer " +
  "text-[12px] border transition-colors duration-[120ms] " +
  "hover:bg-[color-mix(in_srgb,var(--color-content)_7%,transparent)]";
const CHIP_SPENTA = `${CHIP} border-transparent text-content/62`;
const CHIP_ACCESA = `${CHIP} border-accent text-accent`;
const VOCE =
  "flex items-center justify-between gap-3 w-full px-2 py-1.5 rounded-md border-0 bg-transparent " +
  "cursor-pointer text-left text-[13px] hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]";

/* Le scadenze e i promemoria dell'artboard, tradotti in istanti veri. Sono
   pochi e grossolani di proposito: qui si butta dentro una cosa, non si prende
   un appuntamento — per la data precisa c'è la scheda del task. */
const oggiA = (ore, minuti = 0) => {
  const d = new Date();
  d.setHours(ore, minuti, 0, 0);
  return d;
};
const fraGiorni = (n, ore = 12) => {
  const d = oggiA(ore);
  d.setDate(d.getDate() + n);
  return d;
};
const fraMinuti = (n) => new Date(Date.now() + n * 60000);

const SCADENZE = [
  { id: "oggi", label: "Oggi", quando: () => fraGiorni(0, 18) },
  { id: "domani", label: "Domani", quando: () => fraGiorni(1, 12) },
  { id: "settimana", label: "Questa settimana", quando: () => fraGiorni(7, 12) },
  { id: "nessuna", label: "Nessuna", quando: () => null },
];

const PROMEMORIA = [
  { id: "30m", label: "Tra 30 minuti", quando: () => fraMinuti(30) },
  { id: "1h", label: "Tra 1 ora", quando: () => fraMinuti(60) },
  { id: "3h", label: "Tra 3 ore", quando: () => fraMinuti(180) },
  { id: "domani", label: "Domani", quando: () => fraGiorni(1, 9) },
  { id: "nessuno", label: "Nessuno", quando: () => null },
];

/* `nudo`: il composer senza il velo e senza la sovrapposizione, cioe' **la sola
   card**. Serve alla finestrella di cattura (Ctrl+Alt+K), dove non c'e' niente
   sotto da velare — la finestra e' la card, e il velo diventerebbe un
   rettangolo scuro con gli angoli vivi intorno agli angoli tondi.

   Un interruttore e non un secondo componente: quello che cambia e' dove sta,
   non cosa fa, e due composer da tenere allineati sarebbero il modo piu' rapido
   di farne divergere uno. */
export function TaskComposer({
  titoloIniziale = "",
  idProgetto = null,
  inbox = true,
  nudo = false,
  /* Il segnaposto del campo. E' una prop e non una costante perche' la
     finestrella di cattura ha una cosa in piu' da dire: li' il composer compare
     **sopra un altro programma**, e chi lo vede deve capire in due parole di
     che finestra si tratta. Dentro Alia non serve — si e' gia' dentro Alia. */
  segnaposto = "Aggiungi un task",
  aiutoScorciatoia = `${SCORCIATOIA_COMPOSER} da ogni schermata`,
  onChiudi,
}) {
  const alia = useAlia();
  const { projects } = alia;

  const [titolo, setTitolo] = useState(titoloIniziale);
  const [nota, setNota] = useState("");
  const [scadenza, setScadenza] = useState(null);
  const [priorita, setPriorita] = useState(null);
  const [promemoria, setPromemoria] = useState(null);
  const [progetto, setProgetto] = useState(
    () => projects.find((p) => p.id === idProgetto) ?? null,
  );
  const [tag, setTag] = useState([]);
  const [menu, setMenu] = useState(null);
  const [tagEsistenti, setTagEsistenti] = useState([]);
  const [tagScritto, setTagScritto] = useState("");
  /* ── la sintassi rapida ──────────────────────────────────────────────────

     Chi ha impostato cosa. È la regola più sottile della specifica di allora, e
     senza questa mappa non si può rispettare: **cancellare il simbolo annulla
     l'impostazione, ma solo se veniva dal testo.** Se l'avevi scelta a mano dal
     chip, continuare a scrivere non te la porta via.

     In una frase: l'ultima azione vince, e il testo non disfa una scelta fatta
     col mouse. */
  const [origine, setOrigine] = useState({});
  const [cursore, setCursore] = useState(0);
  const [scelto, setScelto] = useState(0);

  /* Il promemoria scritto come `/2h` non è una delle voci del menu: è un offset
     da adesso, e diventa una data solo al salvataggio — come diceva la
     specifica, "relativo a adesso, non alla scadenza". */
  const [promemoriaMs, setPromemoriaMs] = useState(null);
  const [milestone, setMilestone] = useState(null);

  const [inCorso, setInCorso] = useState(false);
  const rifTitolo = useRef(null);
  const rifCard = useRef(null);

  /* Il Tab resta dentro. Senza, si usciva **dietro il velo**, su comandi che si
     vedono a malapena e che rispondono lo stesso: da lì, premendo invio, si
     faceva una cosa in una schermata che si credeva coperta. */
  useTrappolaFuoco(rifCard);

  useEffect(() => {
    rifTitolo.current?.focus();
    const fine = rifTitolo.current?.value.length ?? 0;
    rifTitolo.current?.setSelectionRange(fine, fine);
  }, []);

  /* I tag già usati si chiedono all'apertura, non si tengono nel provider: sono
     un dato che serve qui e in nessun altro posto della schermata.

     `leggiTuttiITag` e non `leggiTag`: quello vuole l'id di un task e torna i
     tag **di quello**, e chiamarlo senza argomenti — com'era scritto qui —
     mandava a SQLite un parametro vuoto. L'errore c'era, finiva nel log a ogni
     apertura del composer, e non si vedeva: il `catch` lo ingoiava e i
     suggerimenti restavano vuoti come se nessun tag fosse mai stato usato. Il
     `catch` resta, perché un suggerimento che non arriva non è una cosa da
     mostrare in mezzo alla scrittura — ma ora non ha più niente da ingoiare. */
  useEffect(() => {
    let vivo = true;
    alia.leggiTuttiITag?.().then((righe) => {
      if (vivo) setTagEsistenti(righe?.map((r) => r.label) ?? []);
    }).catch(() => {});
    return () => {
      vivo = false;
    };
  }, [alia]);

  /* Le fasi del progetto scelto, per suggerirle dopo lo slash. Si leggono dal
     provider, che le ha già caricate insieme al resto. */
  const fasiDelProgetto = useMemo(
    () => (progetto ? (alia.milestones ?? []).filter((m) => m.projectId === progetto.id) : []),
    [alia.milestones, progetto],
  );

  /* Il token che si sta scrivendo adesso, e cosa suggerirgli.

     I progetti si suggeriscono **solo fra quelli che esistono** — scriverne uno
     nuovo non lo crea, perché un errore di battitura riempirebbe l'elenco di
     progetti senza colore. I tag al contrario: si suggeriscono quelli già
     usati, ma scriverne uno nuovo lo crea, che è la regola già scritta —
     *i tag si scrivono, non si scelgono*. */
  const token = useMemo(() => tokenInCorso(titolo, cursore), [titolo, cursore]);

  const suggerimenti = useMemo(() => {
    if (!token) return [];
    const cerca = (elenco, campo) => {
      const parte = token.parte.replace(/\s+/g, "").toLowerCase();
      return elenco
        .filter((v) => String(v[campo] ?? "").replace(/\s+/g, "").toLowerCase().includes(parte))
        .slice(0, 6);
    };
    if (token.tipo === "progetto") return cerca(alia.projects ?? [], "name").map((p) => ({ id: p.id, testo: p.name, colore: p.color }));
    if (token.tipo === "milestone") {
      const suo = risolviProgetto(token.progetto, alia.projects ?? []);
      const fasi = suo ? (alia.milestones ?? []).filter((m) => m.projectId === suo.id) : [];
      /* `label`, non `name`: una fase non ha mai avuto un `name`, ne' grezza ne'
         normalizzata, quindi questa riga cercava dentro un campo inesistente e
         proponeva voci senza testo. */
      return cerca(fasi, "label").map((m) => ({ id: m.id, testo: m.label }));
    }
    return cerca(tagEsistenti.map((t) => ({ label: t })), "label").map((t) => ({ id: t.label, testo: t.label }));
  }, [token, alia.projects, alia.milestones, tagEsistenti]);

  /* Cosa dire quando il simbolo e' aperto ma non c'e' niente da scegliere.

     Tre situazioni diverse, e confonderle sarebbe dire una cosa falsa: un
     progetto non si puo' creare da qui (e allora si indica dove si crea), una
     fase nemmeno, un tag invece si' — basta finire di scriverlo. */
  const vuotoPerToken = useMemo(() => {
    if (!token) return null;
    if (token.tipo === "progetto") {
      return (alia.projects ?? []).length === 0
        ? "Non hai ancora nessun progetto. Si creano dalle Impostazioni → Progetti."
        : `Nessun progetto si chiama «${token.parte}». I progetti si scelgono, non si creano scrivendo.`;
    }
    if (token.tipo === "milestone") {
      const suo = risolviProgetto(token.progetto, alia.projects ?? []);
      if (!suo) return `Nessun progetto si chiama «${token.progetto}».`;
      return (alia.milestones ?? []).some((m) => m.projectId === suo.id)
        ? `Nessuna fase di ${suo.name} si chiama «${token.parte}».`
        : `${suo.name} non ha fasi. Si aggiungono dalle Impostazioni → Progetti.`;
    }
    /* I tag si scrivono: qui il vuoto non e' un problema, e' il caso normale
       del primo tag di quel nome. */
    return token.parte
      ? `Invio o spazio per creare il tag «${token.parte}».`
      : "Scrivi il nome del tag: se non esiste, lo crei.";
  }, [token, alia.projects, alia.milestones]);

  useEffect(() => setScelto(0), [token?.tipo, token?.parte]);

  /* Ad ogni battuta si rilegge il titolo e si aggiornano i chip.

     I simboli **restano visibili nel testo** mentre scrivi, e spariscono solo al
     salvataggio: era così nella specifica di allora ed è la cosa giusta —
     togliere caratteri sotto le dita mentre si scrive è il modo più veloce di
     far perdere il filo. */
  const leggiTitolo = useCallback(
    (testo) => {
      setTitolo(testo);
      const letto = analizzaTitolo(testo);

      /* Per ogni campo: se il testo lo dice, vince il testo. Se il testo non lo
         dice più **e l'aveva detto il testo**, si spegne. Se l'aveva scelto la
         mano, si lascia stare. */
      const applica = (chiave, valoreDalTesto, imposta) => {
        if (valoreDalTesto != null) {
          imposta(valoreDalTesto);
          setOrigine((prec) => ({ ...prec, [chiave]: "testo" }));
        } else if (origine[chiave] === "testo") {
          imposta(null);
          setOrigine((prec) => ({ ...prec, [chiave]: undefined }));
        }
      };

      applica("priorita", letto.priorita ? PRIORITIES.find((v) => v.id === letto.priorita) ?? null : null, setPriorita);
      applica("promemoriaMs", letto.promemoriaMs, setPromemoriaMs);

      if (letto.progetto != null) {
        const trovato = risolviProgetto(letto.progetto, alia.projects ?? []);
        if (trovato) {
          setProgetto(trovato);
          setOrigine((prec) => ({ ...prec, progetto: "testo" }));
          const fasi = (alia.milestones ?? []).filter((m) => m.projectId === trovato.id);
          setMilestone(letto.milestone ? risolviMilestone(letto.milestone, fasi) : null);
        }
      } else {
        if (origine.progetto === "testo") {
          setProgetto(null);
          setMilestone(null);
          setOrigine((prec) => ({ ...prec, progetto: undefined }));
        }
      }

      /* I tag scritti si **aggiungono** a quelli messi a mano, e togliendo il
         simbolo si toglie solo quello che il testo aveva messo. */
      setTag((prec) => {
        const aMano = prec.filter((t) => !(origine.tag ?? []).some((x) => x.toLowerCase() === t.toLowerCase()));
        const uniti = [...aMano];
        for (const t of letto.tag) {
          if (!uniti.some((x) => x.toLowerCase() === t.toLowerCase())) uniti.push(t);
        }
        return uniti;
      });
      setOrigine((prec) => ({ ...prec, tag: letto.tag }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alia.projects, alia.milestones, origine],
  );

  const completa = useCallback(
    (voce) => {
      if (!token) return;
      const esito = completaToken(titolo, token, voce.testo);
      leggiTitolo(esito.testo);
      /* Il cursore va rimesso a mano: React riscrive il valore e il browser lo
         manderebbe in fondo, che con un simbolo a metà frase è il posto
         sbagliato. */
      requestAnimationFrame(() => {
        rifTitolo.current?.setSelectionRange(esito.cursore, esito.cursore);
        setCursore(esito.cursore);
      });
    },
    [leggiTitolo, titolo, token],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(null);
      else onChiudi();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu, onChiudi]);

  const alterna = (chiave) => setMenu((m) => (m === chiave ? null : chiave));

  const aggiungiTag = (etichetta) => {
    const pulito = etichetta.trim();
    if (!pulito) return;
    setTag((prec) => (prec.some((t) => t.toLowerCase() === pulito.toLowerCase()) ? prec : [...prec, pulito]));
    setTagScritto("");
  };

  const invia = useCallback(async () => {
    const pulito = titolo.trim();
    if (!pulito || inCorso) return;
    setInCorso(true);

    /* **Solo qui** i simboli escono dal titolo. Mentre si scriveva restavano
       visibili — toglierli sotto le dita fa perdere il filo — e se la task non
       viene inviata non è successo niente: il testo è rimasto quello che hai
       scritto tu. */
    const { titoloPulito } = analizzaTitolo(pulito);

    const esito = await alia.creaTask({
      title: titoloPulito || pulito,
      description: nota.trim() || null,
      priority: priorita?.id ?? "none",
      dueAt: scadenza?.quando()?.toISOString() ?? null,
      /* Due strade per la stessa cosa: il menu dà una voce con una data, `/2h`
         dà un offset che diventa una data **adesso**, al salvataggio. È quello
         che "relativo ad adesso" vuol dire. */
      reminderAt:
        promemoriaMs != null
          ? new Date(Date.now() + promemoriaMs).toISOString()
          : (promemoria?.quando()?.toISOString() ?? null),
      idProject: progetto?.id ?? null,
      idMilestone: milestone?.id ?? null,
      /* `isInbox` lo eredita da dove si e' aperto il composer, e **non** dal
         progetto scelto qui: scegliere un progetto non vuol dire aver smistato.
         E' il punto della decisione su `isInbox` — un task puo' avere un
         progetto e restare da smistare. */
      isInbox: inbox,
    });

    /* I tag si agganciano dopo, uno per uno: `createTask` non li prende, e non
       deve — sono una relazione, non un campo del task. */
    if (esito?.esito === "applicato" && esito.idTask) {
      for (const t of tag) await alia.aggiungiTag(esito.idTask, t);
    }
    /* Chi chiude sa **se e' nata una task**. Dentro la finestra grande non
       cambia niente — il provider ricarica da se' dopo ogni scrittura — ma la
       cattura veloce vive in un'altra finestra, e la differenza fra "ho scritto
       una task" e "ho lasciato perdere" e' la differenza fra avvisare la
       finestra grande e non disturbarla. */
    onChiudi(true);
  }, [alia, inbox, inCorso, milestone, nota, onChiudi, priorita, progetto, promemoria, promemoriaMs, scadenza, tag, titolo]);

  const vociMenu = useMemo(() => {
    if (menu === "scadenza") {
      return {
        titolo: "Scadenza",
        voci: SCADENZE.map((v) => ({
          id: v.id,
          label: v.label,
          attiva: scadenza?.id === v.id,
          scegli: () => {
            setScadenza(v.id === "nessuna" ? null : v);
            setMenu(null);
          },
        })),
      };
    }
    if (menu === "priorita") {
      return {
        titolo: "Priorità",
        voci: [
          ...PRIORITIES.filter((p) => p.id !== "none").map((p) => ({
            id: p.id,
            label: p.label,
            colore: p.color,
            attiva: priorita?.id === p.id,
            scegli: () => {
              setPriorita(p);
              setMenu(null);
            },
          })),
          {
            id: "nessuna",
            label: "Nessuna",
            attiva: priorita === null,
            scegli: () => {
              setPriorita(null);
              setMenu(null);
            },
          },
        ],
      };
    }
    if (menu === "promemoria") {
      return {
        titolo: "Promemoria",
        voci: PROMEMORIA.map((v) => ({
          id: v.id,
          label: v.label,
          attiva: promemoria?.id === v.id,
          scegli: () => {
            setPromemoria(v.id === "nessuno" ? null : v);
            setMenu(null);
          },
        })),
      };
    }
    if (menu === "progetto") {
      return {
        titolo: "Progetto",
        voci: [
          ...projects.map((p) => ({
            id: p.id,
            label: p.name,
            colore: p.color,
            attiva: progetto?.id === p.id,
            scegli: () => {
              setProgetto(p);
              setMenu(null);
            },
          })),
          {
            id: "nessuno",
            label: "Nessuno",
            attiva: progetto === null,
            scegli: () => {
              setProgetto(null);
              setMenu(null);
            },
          },
        ],
      };
    }
    return null;
  }, [menu, priorita, progetto, projects, promemoria, scadenza]);

  const chips = [
    { id: "scadenza", Icona: Calendario, label: scadenza?.label ?? "Scadenza", acceso: !!scadenza },
    { id: "priorita", Icona: Bandierina, label: priorita?.label ?? "Priorità", acceso: !!priorita },
    {
      id: "promemoria",
      /* Il `/2h` scritto nel titolo si legge sul chip come "tra 2h": il chip
         deve dire la stessa cosa che dice il testo, altrimenti la sintassi
         sembra non aver fatto niente. */
      Icona: Alarm,
      label: promemoriaMs != null ? formattaPromemoria(promemoriaMs) : (promemoria?.label ?? "Promemoria"),
      acceso: promemoriaMs != null || !!promemoria,
    },
    {
      id: "progetto",
      Icona: Cartella,
      /* Con la fase, il chip le mostra tutte e due: e' quello che hai scritto
         dopo lo slash, e vederlo conferma che la barra e' stata capita. */
      label: progetto ? (milestone ? `${progetto.name} / ${milestone.name}` : progetto.name) : "Progetto",
      acceso: !!progetto,
    },
    { id: "tag", Icona: Etichette, label: tag.length ? `${tag.length} tag` : "Tag", acceso: tag.length > 0 },
  ];

  return (
    <div
      onClick={nudo ? undefined : onChiudi}
      className={
        nudo
          ? "w-full box-border grid justify-items-center items-start"
          : "absolute inset-0 z-[93] box-border grid justify-items-center items-start p-6 bg-[color-mix(in_srgb,#0a0b0b_62%,transparent)]"
      }
    >
      <div
        ref={rifCard}
        role="dialog"
        aria-modal="true"
        aria-label="Nuova task"
        onClick={(e) => e.stopPropagation()}
        className={CARD}
      >
        <div className="px-4 pt-4 pb-2 flex flex-col">
          <div className="relative">
            <input
              ref={rifTitolo}
              type="text"
              value={titolo}
              /* La sintassi rapida non sta piu' nel segnaposto.

                 `@progetto #tag !1 /2h` era un promemoria utile la prima volta
                 e rumore tutte le altre: un segnaposto si legge quando il campo
                 e' vuoto, cioe' **ogni volta che si apre il composer**, e
                 quattro simboli da decifrare al posto di una domanda semplice
                 rendono piu' lento proprio il gesto che dev'essere rapido. La
                 sintassi resta scritta nelle Impostazioni, e soprattutto
                 continua a suggerirsi da sola mentre si scrive. */
              placeholder={segnaposto}
              aria-label="Titolo della task"
              /* Il cursore si segue a ogni gesto che lo muove: i suggerimenti
                 guardano indietro **dal cursore**, non dalla fine del testo, e
                 senza questo scrivere a metà frase suggerirebbe la cosa
                 sbagliata. */
              onChange={(e) => {
                leggiTitolo(e.target.value);
                setCursore(e.target.selectionStart ?? e.target.value.length);
              }}
              onClick={(e) => setCursore(e.target.selectionStart ?? 0)}
              onKeyUp={(e) => setCursore(e.target.selectionStart ?? 0)}
              onKeyDown={(e) => {
                /* Con l'elenco aperto le frecce e l'Invio appartengono a lui:
                   Invio qui creerebbe la task mentre stavi scegliendo un
                   progetto, che è il modo più veloce di salvare la cosa
                   sbagliata. */
                if (suggerimenti.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setScelto((i) => (i + 1) % suggerimenti.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setScelto((i) => (i - 1 + suggerimenti.length) % suggerimenti.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    completa(suggerimenti[scelto]);
                    return;
                  }
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  invia();
                }
              }}
              className="w-full bg-transparent border-0 outline-none p-0 font-medium text-[19px] tracking-[-0.015em] text-content placeholder:text-content/56"
            />

            {/* I suggerimenti. Per i progetti sono l'unica strada: **si accetta
                solo quello che esiste**, quindi l'elenco non è una comodità, è
                il modo di sapere cosa si può scrivere. Per i tag è una comodità
                vera: scriverne uno nuovo lo crea comunque. */}
            {suggerimenti.length > 0 ? (
              <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[260px] p-1.5 rounded-lg border border-divider bg-surface shadow-elev-lg">
                {suggerimenti.map((v, i) => (
                  <button
                    key={v.id}
                    type="button"
                    onMouseDown={(e) => {
                      /* `mousedown` e non `click`: il click arriverebbe dopo che
                         il campo ha perso il fuoco, e il cursore da rimettere a
                         posto non sarebbe più dove lo avevamo lasciato. */
                      e.preventDefault();
                      completa(v);
                    }}
                    onMouseEnter={() => setScelto(i)}
                    className={
                      "flex items-center gap-2 px-[9px] py-2 w-full text-left rounded-sm border-0 cursor-pointer text-[12.5px] " +
                      (i === scelto
                        ? "bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-content"
                        : "bg-transparent text-content/75")
                    }
                  >
                    {v.colore ? (
                      <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: v.colore }} />
                    ) : null}
                    <span className="flex-1 truncate">{v.testo}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {/* Un simbolo aperto che non ha niente da suggerire **non deve
                restare muto**: senza questo pannello, premere `@` in un
                database senza progetti non fa comparire niente, e l'unica
                lettura possibile e' che la sintassi sia rotta.

                La frase cambia col caso, perche' sono situazioni diverse: non
                hai progetti / nessuno si chiama cosi' / il tag lo crei tu
                scrivendolo. */}
            {token && suggerimenti.length === 0 ? (
              <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[280px] px-[11px] py-2.5 rounded-lg border border-divider bg-surface shadow-elev-lg">
                <p className="m-0 text-[11.5px] leading-[1.45] text-content/60">{vuotoPerToken}</p>
              </div>
            ) : null}
          </div>
          {/* La nota va a capo con Invio, come si aspetta chiunque abbia mai
              scritto in un riquadro di testo. L'aggiunta si comanda dal titolo o
              dall'aeroplanino. */}
          <textarea
            value={nota}
            rows={3}
            placeholder="Aggiungi una nota"
            aria-label="Nota"
            onChange={(e) => setNota(e.target.value)}
            className="w-full mt-1.5 bg-transparent border-0 outline-none p-0 resize-none text-[13.5px] leading-[1.45] text-content/72 placeholder:text-content/55"
          />

          {tag.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {tag.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border border-divider text-[11.5px] text-content/80"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => setTag((prec) => prec.filter((x) => x !== t))}
                    aria-label={`Rimuovi il tag ${t}`}
                    className="border-0 bg-transparent p-0 cursor-pointer text-content/60 hover:text-content text-[12px] leading-none"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative flex items-center flex-wrap gap-2 px-4 py-3 border-t border-divider">
          {chips.map(({ id, Icona, label, acceso }) => (
            <button
              key={id}
              type="button"
              onClick={() => alterna(id)}
              className={acceso ? CHIP_ACCESA : CHIP_SPENTA}
            >
              <Icona size={13} />
              {label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={invia}
              disabled={!titolo.trim() || inCorso}
              title="Aggiungi task (Invio)"
              aria-label="Aggiungi task"
              className={
                "grid place-items-center w-[27px] h-[27px] p-0 rounded-md border-0 bg-transparent " +
                "cursor-pointer text-accent hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] " +
                "disabled:opacity-40 disabled:cursor-not-allowed"
              }
            >
              <Send size={15} />
            </button>
          </div>

          {menu === "tag" ? (
            /* Il menu dei tag è l'unico con un campo: quelli già usati si
               scelgono, uno nuovo si scrive. Stessa ragione del filtro — un
               elenco di tutti i tag cresce senza limite. */
            <div className="absolute left-4 top-[calc(100%+6px)] z-[5] min-w-[190px] p-2 rounded-lg bg-elevated border border-divider shadow-elev-md">
              <div className="text-[10px] tracking-[0.1em] uppercase text-content/60 px-2 pt-1 pb-1.5">
                Tag
              </div>
              <input
                type="text"
                value={tagScritto}
                placeholder="Scrivi un tag…"
                aria-label="Nuovo tag"
                onChange={(e) => setTagScritto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    aggiungiTag(tagScritto);
                  }
                }}
                className="w-full h-7 px-2 mb-1 rounded-md border border-dashed border-divider bg-transparent text-[12.5px] text-content placeholder:text-content/38 focus:outline-none focus:border-accent"
              />
              {tagEsistenti
                .filter((t) => !tag.some((x) => x.toLowerCase() === t.toLowerCase()))
                .map((t) => (
                  <button key={t} type="button" onClick={() => aggiungiTag(t)} className={VOCE}>
                    <span>#{t}</span>
                  </button>
                ))}
            </div>
          ) : null}

          {vociMenu ? (
            <div className="absolute left-4 top-[calc(100%+6px)] z-[5] min-w-[190px] p-2 rounded-lg bg-elevated border border-divider shadow-elev-md">
              <div className="text-[10px] tracking-[0.1em] uppercase text-content/60 px-2 pt-1 pb-1.5">
                {vociMenu.titolo}
              </div>
              {vociMenu.voci.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={v.scegli}
                  className={`${VOCE} ${v.attiva ? "text-accent" : "text-content"}`}
                >
                  <span className="flex items-center gap-2">
                    {v.colore ? (
                      <span
                        className="w-[9px] h-[9px] rounded-full shrink-0"
                        style={{ background: v.colore }}
                      />
                    ) : null}
                    {v.label}
                  </span>
                  {v.attiva ? <span aria-hidden="true">✓</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* La riga di aiuti dell'artboard, con la scorciatoia corretta: là
            diceva "Maiusc+Invio per aggiungere". */}
        <div className="flex gap-4 px-4 pt-2 pb-3 text-[11px] text-content/58">
          <span>Invio per aggiungere</span>
          <span>Esc per chiudere</span>
          {/* La terza voce c'è anche nell'artboard, che però ci scrive `⌘K` —
              da noi quella apre il campo rapido, e questa è la sua sorella
              maggiore.

              Nella finestrella sganciata dice l'altra scorciatoia, quella
              globale: lì "da ogni schermata" sarebbe una mezza verità detta
              proprio dove serve l'altra metà — quella finestra si apre **da
              qualunque programma**, ed è la sola cosa che spiega perché è
              comparsa sopra quello che si stava facendo. */}
          <span className="ml-auto">{aiutoScorciatoia}</span>
        </div>
      </div>
    </div>
  );
}
