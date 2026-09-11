import { InboxCard } from "./inbox/InboxCard.jsx";
import { PRESET_CARD, dueLabel, eInRitardo, metaCard, priorityOf } from "./lib/tasks.js";

/* Galleria delle card — **solo anteprima, non entra nell'app**.

   Serve a una domanda sola: *quali dei dati che un task ha addosso valgono un
   posto sulla card, e come stanno insieme quando ci sono tutti?* Finche' la si
   guarda in astratto la risposta e' "tutti"; messa in scena, la maggior parte
   si squalifica da sola.

   Come e' fatta, e perche' cosi':

     · la **larghezza e' quella vera**, misurata sull'app: 232, che dalle
       colonne del Kanban a 248 e' la stessa nei due posti. Giudicare una card
       a larghezza arbitraria e' il modo piu' rapido di approvare un disegno
       che poi non ci sta;
     · le card sono **quelle vere**, `InboxCard` importata dall'app, nelle sue
       due configurazioni estreme: essenziale a sinistra, completa a destra.
       Non copie — se cambia il componente cambia qui, e il confronto non puo'
       mentire. Fra i due estremi ci sono tutte le combinazioni che gli
       interruttori delle Impostazioni permettono (§ Aspetto): la galleria
       mostra i capi, non il mezzo.

   Uso: `npm run dev:renderer` → http://localhost:5173/preview.html?screen=carte */

/* Una sola misura, da quando le colonne del Kanban sono larghe 248 e la card
   dentro e' 232 come quella della colonna Inbox: la stessa card, alla stessa
   larghezza, nei due posti. La galleria e' rimasta a mostrarne una perche'
   mostrarne due identiche direbbe che sono diverse. */
const LARGHEZZA = 232;

/* I dati che un task ha addosso nel renderer (vedi `normalizeTask`), messi in
   scala: ogni esempio ne aggiunge uno al precedente, cosi' si vede **dove**
   comincia a diventare troppo invece di vedere solo i due estremi. */
const ESEMPI = [
  {
    nota: "il minimo — solo un titolo",
    task: base({ title: "Chiamare l'idraulico" }),
  },
  {
    nota: "+ scadenza",
    task: base({ title: "Pagare la bolletta della luce", dueAt: fra(1) }),
  },
  {
    nota: "+ priorità urgente, scadenza passata",
    task: base({ title: "Inviare la fattura di agosto", dueAt: fra(-3), priority: "urgent" }),
  },
  {
    nota: "+ progetto e fase",
    task: base({
      title: "Preparare la presentazione trimestrale",
      dueAt: fra(0),
      priority: "high",
      project: { id: "p", name: "Lavoro", color: "#c78bff" },
      milestone: { id: "m", label: "Clienti" },
    }),
  },
  {
    nota: "+ sotto-task e note",
    task: base({
      title: "Rinnovare il contratto col fornitore",
      dueAt: fra(9),
      priority: "medium",
      project: { id: "p", name: "Lavoro", color: "#c78bff" },
      milestone: { id: "m", label: "Amministrazione" },
      childCount: 5,
      childDoneCount: 2,
      notes: "Chiedere lo sconto sul rinnovo triennale.",
    }),
  },
  {
    nota: "+ tag e promemoria",
    task: base({
      title: "Prenotare la visita dal dentista",
      dueAt: fra(4),
      reminderAt: fra(3),
      priority: "low",
      project: { id: "c", name: "Salute", color: "#3ddc97" },
      tags: ["casa", "telefonate"],
    }),
  },
  {
    nota: "tutto insieme, con un titolo che va a capo",
    task: base({
      title: "Rivedere il preventivo di ristrutturazione e rimandarlo firmato",
      dueAt: fra(-1),
      reminderAt: fra(-1),
      startAt: fra(-8),
      priority: "urgent",
      project: { id: "p", name: "Lavoro", color: "#c78bff" },
      milestone: { id: "m", label: "Clienti" },
      tags: ["preventivi", "urgente", "firma"],
      childCount: 7,
      childDoneCount: 7,
      notes: "Allegare il computo metrico aggiornato.",
      sourceType: "discord",
      state: { id: 2, label: "In corso", role: "mid", stepOrder: 2 },
    }),
  },
];

function base(patch) {
  return {
    id: patch.title,
    parentId: null,
    description: null,
    notes: null,
    priority: "none",
    dueAt: null,
    startAt: null,
    reminderAt: null,
    sourceType: "manual",
    done: false,
    inbox: true,
    tags: [],
    state: { id: 1, label: "Nuovo", role: "start", stepOrder: 1 },
    project: null,
    milestone: null,
    childCount: 0,
    childDoneCount: 0,
    ...patch,
    priorityColor: priorityOf(patch.priority ?? "none").color,
  };
}

function fra(giorni) {
  const d = new Date();
  d.setDate(d.getDate() + giorni);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}



function Colonna({ titolo, sottotitolo, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-mini tracking-[0.1em] uppercase text-content/62">{titolo}</span>
        <span className="text-micro text-content/38">{sottotitolo}</span>
      </div>
      {children}
    </div>
  );
}

export function GalleriaCard() {
  return (
    <div className="w-full max-w-[1180px] flex flex-col gap-7 p-8 bg-bg text-content font-sans rounded-[14px]">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[17px] font-medium tracking-[-0.01em]">Le card, con tutti i dati</h1>
        <p className="m-0 text-meta text-content/55 max-w-[720px]">
          La stessa <code className="text-content/75">InboxCard</code> dell'app nelle sue due
          configurazioni estreme: a sinistra essenziale — titolo e scadenza — a destra completa, con
          tutto quello che la task sa dire di sé. In mezzo ci sono tutte le combinazioni che gli
          interruttori in Impostazioni → Aspetto permettono. Larghezza 232, la stessa nella colonna
          Inbox e nel Kanban. Gli esempi crescono di un dato alla volta.
        </p>
      </div>

      {ESEMPI.map(({ nota, task }) => (
        <div key={nota} className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-meta text-content/75">{nota}</span>
            <span className="flex-1 h-px bg-divider" />
          </div>
          <div className="flex flex-wrap items-start gap-7">
            <Colonna titolo="essenziale" sottotitolo={`${LARGHEZZA}px`}>
              <div style={{ width: LARGHEZZA }}>
                <InboxCard
                  id={task.id}
                  title={task.title}
                  due={dueLabel(task.dueAt)}
                  scaduta={eInRitardo(task)}
                  priorityColor={task.priorityColor}
                />
              </div>
            </Colonna>
            <Colonna titolo="completa" sottotitolo={`${LARGHEZZA}px`}>
              <div style={{ width: LARGHEZZA }}>
                <InboxCard
                  id={task.id}
                  title={task.title}
                  due={dueLabel(task.dueAt)}
                  scaduta={eInRitardo(task)}
                  prioritaFissa
                  meta={metaCard(task, PRESET_CARD.completa)}
                  priorityColor={task.priorityColor}
                />
              </div>
            </Colonna>
          </div>
        </div>
      ))}
    </div>
  );
}
