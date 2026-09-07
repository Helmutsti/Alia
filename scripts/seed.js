import { createItemCore } from "../src/index.js";

const databasePath = process.argv[2] || process.env.SCHEDULER_DB_PATH || "./data/scheduler.sqlite";

function isoAt(offsetDays, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const seedItems = [
  {
    title: "Chiamare il commercialista",
    description: "Confermare la data della prossima scadenza fiscale",
    sourceType: "manual",
  },
  {
    title: "Prenotare visita dal dentista",
    priority: "medium",
    sourceType: "manual",
  },
  {
    title: "Rinnovare il passaporto",
    status: "active",
    priority: "high",
    dueAt: isoAt(-1),
    tags: ["casa"],
    sourceType: "manual",
  },
  {
    title: "Preparare la presentazione trimestrale",
    description: "Riassumere i numeri del trimestre per la riunione di lunedì.",
    status: "active",
    priority: "high",
    dueAt: isoAt(0),
    project: "lavoro/clienti",
    tags: ["urgente"],
    sourceType: "manual",
  },
  {
    title: "Allenamento in palestra",
    status: "active",
    priority: "low",
    sourceType: "manual",
  },
  {
    title: "Rispondere alla mail del fornitore",
    status: "completed",
    priority: "medium",
    dueAt: isoAt(-2),
    sourceType: "manual",
  },
];

const core = createItemCore({ databasePath });

for (const item of seedItems) {
  core.createItem(item);
}

console.log(`Seed completato: ${seedItems.length} item creati in "${databasePath}".`);

core.close();
