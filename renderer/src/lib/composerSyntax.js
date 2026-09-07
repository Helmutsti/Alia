const PRIORITY_SHORTHAND = {
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
};

export const UNIT_TO_MS = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  g: 24 * 60 * 60 * 1000,
};

const WORD = "[^\\s!@#/]+";

// Simboli: !1-4 priorità, #tag, @progetto(/lista) — progetto e lista (sotto-progetto)
// separati da /, es. "@lavoro/clienti" — /Ng promemoria relativo ad adesso quando lo
// slash è isolato (non parte di un token @). Nessun simbolo per la scadenza: resta
// impostabile solo dal chip manuale "Scadenza" nell'interfaccia.
export function parseComposerTitle(raw) {
  let clean = raw;
  let priority = null;
  let reminderMs = null;
  const tags = [];
  let project = null;

  clean = clean.replace(/(^|\s)!([1-4])(?=\s|$)/g, (_match, pre, digit) => {
    priority = PRIORITY_SHORTHAND[digit];
    return pre;
  });

  // Progetto prima del promemoria: consuma anche lo "/lista" incorporato, così
  // il parsing del promemoria che segue non lo scambia per un token "/Ng".
  clean = clean.replace(new RegExp(`(^|\\s)@(${WORD})(?:/(${WORD}))?`, "g"), (_match, pre, name, list) => {
    project = list ? `${name}/${list}` : name;
    return pre;
  });

  clean = clean.replace(/(^|\s)\/(\d+)(m|h|g)(?=\s|$)/gi, (_match, pre, amount, unit) => {
    reminderMs = Number(amount) * UNIT_TO_MS[unit.toLowerCase()];
    return pre;
  });

  clean = clean.replace(new RegExp(`(^|\\s)#(${WORD})`, "g"), (_match, pre, word) => {
    if (!tags.includes(word)) tags.push(word);
    return pre;
  });

  clean = clean.replace(/\s{2,}/g, " ").trim();

  return { cleanTitle: clean, priority, tags, project, reminderMs };
}

export function formatReminderOffset(ms) {
  if (ms % UNIT_TO_MS.g === 0) return `tra ${ms / UNIT_TO_MS.g}g`;
  if (ms % UNIT_TO_MS.h === 0) return `tra ${ms / UNIT_TO_MS.h}h`;
  return `tra ${Math.round(ms / UNIT_TO_MS.m)}m`;
}
