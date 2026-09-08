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
    title: "Inviare la fattura di agosto",
    description: "Ricontrollare gli importi prima di inviarla.",
    status: "inbox",
    priority: "high",
    dueAt: isoAt(-3),
    project: "Lavoro",
    tags: ["fatturazione"],
    sourceType: "manual",
  },
  {
    title: "Pagare la bolletta della luce",
    description: "84,20 € con scadenza domani.",
    status: "active",
    priority: "high",
    dueAt: isoAt(1),
    project: "Casa",
    sourceType: "manual",
  },
  {
    title: "Prenotare visita dal dentista",
    status: "inbox",
    priority: "medium",
    dueAt: isoAt(2),
    project: "Salute",
    sourceType: "manual",
  },
  {
    title: "Preparare la presentazione trimestrale",
    description: "Riassumere i numeri del trimestre per la riunione di lunedì. Servono i grafici aggiornati dal foglio delle vendite e una slide di confronto con il trimestre precedente.",
    status: "active",
    priority: "high",
    dueAt: isoAt(0),
    project: "Lavoro",
    tags: ["urgente"],
    sourceType: "manual",
    subtasks: [
      { title: "Esportare i numeri dal foglio vendite", done: true },
      { title: "Aggiornare i grafici del trimestre", done: false },
      { title: "Scrivere la slide di confronto", done: false },
    ],
    comments: ["Ho esportato i numeri dal foglio vendite, mancano i grafici."],
  },
  {
    title: "Comprare il regalo di compleanno",
    status: "inbox",
    priority: "medium",
    dueAt: isoAt(6),
    project: "Personale",
    sourceType: "manual",
  },
  {
    title: "Rinnovare l'abbonamento in palestra",
    status: "inbox",
    priority: "medium",
    dueAt: isoAt(8),
    project: "Salute",
    sourceType: "manual",
  },
  {
    title: "Preparare la valigia per Firenze",
    description: "Weekend lungo, controllare il meteo prima di fare i bagagli.",
    status: "active",
    priority: "high",
    dueAt: isoAt(10),
    project: "Personale",
    sourceType: "manual",
    subtasks: [
      { title: "Prenotare il parcheggio in stazione", done: true },
      { title: "Fare i bagagli", done: false },
    ],
  },
  {
    title: "Portare l'auto in officina",
    description: "Chiedere anche il tagliando dei freni.",
    status: "inbox",
    priority: "low",
    dueAt: isoAt(12),
    project: "Casa",
    tags: ["auto"],
    sourceType: "manual",
  },
  {
    title: "Rispondere alla mail del fornitore",
    status: "completed",
    priority: "medium",
    dueAt: isoAt(-1),
    project: "Lavoro",
    sourceType: "manual",
  },
  {
    title: "Allenamento in palestra",
    status: "completed",
    priority: "low",
    dueAt: isoAt(0),
    project: "Salute",
    sourceType: "manual",
  },
  {
    title: "Archiviare le ricevute",
    status: "inbox",
    priority: "none",
    dueAt: isoAt(20),
    project: "Casa",
    sourceType: "manual",
  },
  {
    title: "Pane, latte e caffè",
    status: "inbox",
    priority: "none",
    dueAt: isoAt(3),
    project: "Casa",
    tags: ["spesa"],
    sourceType: "manual",
  },
  {
    title: "Rinnovare il passaporto",
    status: "active",
    priority: "high",
    dueAt: isoAt(-1),
    project: "Casa",
    sourceType: "manual",
  },
  {
    title: "Firmare e rispedire il preventivo",
    description: "Se torna, firmarlo e rimandarlo entro giovedì.",
    status: "inbox",
    priority: "high",
    dueAt: isoAt(2),
    project: "Lavoro",
    tags: ["urgente"],
    sourceType: "manual",
  },
  {
    title: "Aggiornare i grafici del trimestre",
    status: "inbox",
    priority: "medium",
    dueAt: isoAt(3),
    project: "Lavoro",
    sourceType: "manual",
  },
  {
    title: "Chiamata di follow-up col cliente",
    status: "active",
    priority: "urgent",
    dueAt: isoAt(0),
    project: "Lavoro",
    sourceType: "manual",
  },
  {
    title: "Vecchio progetto concluso",
    status: "archived",
    priority: "low",
    project: "Personale",
    sourceType: "manual",
  },
  {
    title: "Idea senza scadenza né progetto",
    description: "Da valutare più avanti, ancora senza contesto.",
    status: "inbox",
    priority: "none",
    sourceType: "manual",
  },
];

const core = createItemCore({ databasePath });

for (const { subtasks, comments, ...input } of seedItems) {
  const item = core.createItem(input);
  for (const st of subtasks ?? []) {
    const updated = core.addSubtask(item.id, st.title);
    if (st.done) {
      const added = updated.subtasks.find((s) => s.title === st.title);
      if (added) core.toggleSubtask(added.id);
    }
  }
  for (const body of comments ?? []) {
    core.addComment(item.id, body);
  }
}

console.log(`Seed completato: ${seedItems.length} item creati in "${databasePath}".`);

core.close();
