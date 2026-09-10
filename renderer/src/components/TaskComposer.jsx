import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export function TaskComposer({ titoloIniziale = "", idProgetto = null, inbox = true, onChiudi }) {
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
     un dato che serve qui e in nessun altro posto della schermata. */
  useEffect(() => {
    let vivo = true;
    alia.leggiTag?.().then((righe) => {
      if (vivo) setTagEsistenti(righe?.map((r) => r.label) ?? []);
    }).catch(() => {});
    return () => {
      vivo = false;
    };
  }, [alia]);

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

    const esito = await alia.creaTask({
      title: pulito,
      description: nota.trim() || null,
      priority: priorita?.id ?? "none",
      dueAt: scadenza?.quando()?.toISOString() ?? null,
      reminderAt: promemoria?.quando()?.toISOString() ?? null,
      idProject: progetto?.id ?? null,
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
    onChiudi();
  }, [alia, inbox, inCorso, nota, onChiudi, priorita, progetto, promemoria, scadenza, tag, titolo]);

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
    { id: "promemoria", Icona: Alarm, label: promemoria?.label ?? "Promemoria", acceso: !!promemoria },
    { id: "progetto", Icona: Cartella, label: progetto?.name ?? "Progetto", acceso: !!progetto },
    { id: "tag", Icona: Etichette, label: tag.length ? `${tag.length} tag` : "Tag", acceso: tag.length > 0 },
  ];

  return (
    <div
      onClick={onChiudi}
      className="absolute inset-0 z-[93] box-border grid justify-items-center items-start p-6 bg-[color-mix(in_srgb,#0a0b0b_62%,transparent)]"
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
          <input
            ref={rifTitolo}
            type="text"
            value={titolo}
            placeholder="Cosa c'è da fare?"
            aria-label="Titolo della task"
            onChange={(e) => setTitolo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                invia();
              }
            }}
            className="w-full bg-transparent border-0 outline-none p-0 font-medium text-[19px] tracking-[-0.015em] text-content placeholder:text-content/56"
          />
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
              maggiore. */}
          <span className="ml-auto">{SCORCIATOIA_COMPOSER} da ogni schermata</span>
        </div>
      </div>
    </div>
  );
}
