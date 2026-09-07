export const PRIORITY_LABELS = {
  none: "Nessuna",
  low: "Bassa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export const PRIORITY_ORDER = ["none", "low", "medium", "high", "urgent"];

export const PRIORITY_COLORS = {
  none: "var(--color-neutral-600)",
  low: "var(--color-neutral-500)",
  medium: "var(--color-accent-400)",
  high: "var(--color-accent)",
  urgent: "#ff6b6b",
};

export const STATUS_LABELS = {
  inbox: "Inbox",
  active: "In corso",
  completed: "Fatto",
  archived: "Archiviato",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function isPast(date) {
  return startOfDay(date).getTime() < startOfDay(new Date()).getTime();
}

export function todayIso() {
  return startOfDay(new Date()).toISOString();
}

export function tomorrowIso() {
  return new Date(startOfDay(new Date()).getTime() + MS_PER_DAY).toISOString();
}

export function endOfWeekIso() {
  const today = startOfDay(new Date());
  const day = today.getDay() === 0 ? 7 : today.getDay();
  const daysUntilSunday = 7 - day;
  return new Date(today.getTime() + daysUntilSunday * MS_PER_DAY).toISOString();
}

const MONTH_LABELS_IT = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];

export function formatDateTimeShort(iso) {
  const date = new Date(iso);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  const day = `${date.getDate()} ${MONTH_LABELS_IT[date.getMonth()]}`;
  if (!hasTime) return day;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${day}, ${hh}:${mm}`;
}

export function formatDueLabel(dueAt) {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  if (isSameDay(date, new Date())) return "Oggi";
  const tomorrow = new Date(startOfDay(new Date()).getTime() + MS_PER_DAY);
  if (isSameDay(date, tomorrow)) return "Domani";
  return `${date.getDate()} ${MONTH_LABELS_IT[date.getMonth()]}`;
}

export function formatWeekdayLong(date = new Date()) {
  const weekdays = [
    "Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato",
  ];
  return `${weekdays[date.getDay()]} ${date.getDate()} ${MONTH_LABELS_IT[date.getMonth()]}`;
}

export function dueColor(dueAt, status) {
  if (!dueAt || status === "completed") {
    return "color-mix(in srgb, var(--color-text) 56%, transparent)";
  }
  if (isPast(dueAt)) return "#ff6b6b";
  if (isSameDay(dueAt, new Date())) return "var(--color-accent-300)";
  return "color-mix(in srgb, var(--color-text) 62%, transparent)";
}
