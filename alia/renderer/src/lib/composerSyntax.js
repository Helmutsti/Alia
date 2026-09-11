/* La sintassi rapida del composer: si scrive il titolo e i simboli accendono i
   chip.

   ── Da dove viene ──────────────────────────────────────────────────────────

   Esisteva, ed era documentata in `SPECIFICA_PRODOTTO.md`. È stata persa nel
   commit che ha sostituito il core (`t_task` al posto di `items`): buttata via
   insieme al vecchio modello, **non per decisione**. Questa è la ripresa, con
   le regole di allora dove reggono ancora e le traduzioni dove il modello è
   cambiato.

   E questa volta con i test: la specifica era dettagliata e il parser era
   scoperto, il che è esattamente il modo in cui regole come l'ambiguità di `/`
   si rompono in silenzio.

   ── I simboli ─────────────────────────────────────────────────────────────

     !1..!4              priorità (1 urgente → 4 bassa)
     #parola             tag, ripetibile
     @progetto           progetto, solo fra quelli che esistono
     @progetto/fase      progetto e milestone
     /2h                 promemoria relativo ad **adesso** (m, h, g)

   La **scadenza non ha un simbolo, e non deve averlo**: è una scelta esplicita,
   e resta solo dal chip. Era già deciso allora, e vale ancora.

   Scartati `~` (vuole AltGr su tastiera italiana) e `\` (sostituito da `/`).

   ── Cos'è cambiato col modello nuovo ──────────────────────────────────────

   `@progetto` scriveva una stringa libera in `items.project`. Ora i progetti
   sono una tabella con id e colore, e **si accettano solo quelli che esistono**:
   inventarne uno con un errore di battitura riempirebbe l'elenco di progetti
   senza colore. Il parser qui estrae il *nome scritto*; a risolverlo in un id è
   chi ha l'elenco vero sotto mano (vedi `risolviProgetto`).

   `@progetto/lista` aveva una "lista" che era un pezzo di stringa. Ora esistono
   le **milestone** dentro il progetto, e la barra le indica: non è un ripiego,
   è quello che quella barra voleva dire fin dall'inizio.

   `#tag` invece **crea**: è la regola già scritta in Rinascita.md — *i tag si
   scrivono, non si scelgono*. Progetti e tag si comportano al contrario, e la
   differenza non è un'incoerenza: un progetto è una struttura che si governa,
   un tag è una parola che si appiccica.

   ── L'ambiguità di `/` ────────────────────────────────────────────────────

   Dopo un `@parola` è il separatore della milestone; isolato è il promemoria.
   Il progetto si consuma **per primo**, così lo slash già mangiato da `@…` non
   viene riletto come `/2h`. */

const PRIORITA_RAPIDA = { 1: "urgent", 2: "high", 3: "medium", 4: "low" };

export const UNITA_MS = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  g: 24 * 60 * 60 * 1000,
};

/* Una "parola" di un simbolo: tutto tranne spazi e gli altri simboli. Esclude
   `/` perché quello separa progetto e fase, e non può far parte di un nome. */
const PAROLA = "[^\\s!@#/]+";

/**
 * Legge il titolo grezzo e restituisce quello pulito più quello che i simboli
 * hanno detto. **Non tocca il testo mostrato**: chi chiama usa il pulito solo
 * al salvataggio (vedi la regola più sotto).
 */
export function analizzaTitolo(grezzo) {
  let resto = String(grezzo ?? "");
  let priorita = null;
  let promemoriaMs = null;
  let progetto = null;
  let milestone = null;
  const tag = [];

  resto = resto.replace(/(^|\s)!([1-4])(?=\s|$)/g, (_intero, prima, cifra) => {
    priorita = PRIORITA_RAPIDA[cifra];
    return prima;
  });

  /* Prima il progetto: consuma anche la `/fase` incorporata, così il
     promemoria qui sotto non se la ritrova davanti come se fosse un `/2h`. */
  resto = resto.replace(new RegExp(`(^|\\s)@(${PAROLA})(?:/(${PAROLA}))?`, "g"), (_i, prima, nome, fase) => {
    progetto = nome;
    milestone = fase ?? null;
    return prima;
  });

  resto = resto.replace(/(^|\s)\/(\d+)(m|h|g)(?=\s|$)/gi, (_i, prima, quanti, unita) => {
    promemoriaMs = Number(quanti) * UNITA_MS[unita.toLowerCase()];
    return prima;
  });

  resto = resto.replace(new RegExp(`(^|\\s)#(${PAROLA})`, "g"), (_i, prima, parola) => {
    /* Ripetere lo stesso tag non lo aggiunge due volte, e il confronto ignora
       le maiuscole: `#Casa` e `#casa` sono la stessa etichetta. */
    if (!tag.some((t) => t.toLowerCase() === parola.toLowerCase())) tag.push(parola);
    return prima;
  });

  return {
    titoloPulito: resto.replace(/\s{2,}/g, " ").trim(),
    priorita,
    tag,
    progetto,
    milestone,
    promemoriaMs,
  };
}

/* Il simbolo che si sta scrivendo **adesso**, per i suggerimenti.

   Guarda solo indietro dal cursore, e si ferma al primo spazio: mentre scrivi
   `Chiamare @lav` il pezzo interessante è `lav`, e serve sapere anche dove
   comincia per poterlo sostituire con quello scelto.

   Restituisce `null` appena il token si chiude (uno spazio) o se il cursore non
   è dentro a niente. Per `@progetto/fase` distingue le due metà: si suggerisce
   il progetto finché non c'è lo slash, le fasi dopo. */
export function tokenInCorso(grezzo, cursore) {
  const testo = String(grezzo ?? "");
  const pos = Math.max(0, Math.min(cursore ?? testo.length, testo.length));
  const prima = testo.slice(0, pos);

  const inizio = Math.max(prima.lastIndexOf("@"), prima.lastIndexOf("#"));
  if (inizio === -1) return null;

  /* Il simbolo vale solo a inizio parola: `mail@dominio` non apre i
     suggerimenti dei progetti. */
  const precedente = inizio === 0 ? " " : testo[inizio - 1];
  if (!/\s/.test(precedente)) return null;

  const scritto = prima.slice(inizio + 1);
  if (/\s/.test(scritto)) return null;

  const simbolo = testo[inizio];
  if (simbolo === "#") return { tipo: "tag", parte: scritto, inizio, fine: pos };

  const barra = scritto.indexOf("/");
  if (barra === -1) return { tipo: "progetto", parte: scritto, inizio, fine: pos };
  return {
    tipo: "milestone",
    parte: scritto.slice(barra + 1),
    progetto: scritto.slice(0, barra),
    inizio,
    fine: pos,
  };
}

/* Sostituisce il token in corso con quello scelto dai suggerimenti, e dice dove
   va rimesso il cursore — subito dopo, con lo spazio già messo, così si
   continua a scrivere senza toccare il mouse. */
export function completaToken(grezzo, token, scelto) {
  const testo = String(grezzo ?? "");
  const simbolo = token.tipo === "tag" ? "#" : "@";
  const corpo =
    token.tipo === "milestone" ? `${token.progetto}/${senzaSpazi(scelto)}` : senzaSpazi(scelto);
  const nuovo = `${testo.slice(0, token.inizio)}${simbolo}${corpo} ${testo.slice(token.fine)}`;
  return { testo: nuovo, cursore: token.inizio + simbolo.length + corpo.length + 1 };
}

/* I nomi con lo spazio non si possono scrivere in un token — lo spazio chiude
   il simbolo. Si attaccano: "Casa Nuova" diventa `@CasaNuova`, e il confronto
   che risolve il nome fa la stessa cosa (vedi `risolviProgetto`). */
const senzaSpazi = (s) => String(s ?? "").replace(/\s+/g, "");

const normalizza = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

/* Risolve il nome scritto contro l'elenco vero. **Solo quelli che esistono**:
   se non trova niente restituisce `null`, e chi chiama lo mostra come "non
   trovato" invece di creare un progetto per un errore di battitura. */
export function risolviProgetto(nome, progetti) {
  if (!nome) return null;
  const cercato = normalizza(nome);
  return progetti.find((p) => normalizza(p.name) === cercato) ?? null;
}

export function risolviMilestone(nome, milestone) {
  if (!nome) return null;
  const cercato = normalizza(nome);
  return milestone.find((m) => normalizza(m.name ?? m.label) === cercato) ?? null;
}

/* L'etichetta del chip promemoria: `/2h` diventa "tra 2h". Si sceglie l'unità
   più grossa che divide esatto, così 120 minuti si leggono "tra 2h" e non "tra
   120m". */
export function formattaPromemoria(ms) {
  if (ms == null) return null;
  if (ms % UNITA_MS.g === 0) return `tra ${ms / UNITA_MS.g}g`;
  if (ms % UNITA_MS.h === 0) return `tra ${ms / UNITA_MS.h}h`;
  return `tra ${Math.round(ms / UNITA_MS.m)}m`;
}
