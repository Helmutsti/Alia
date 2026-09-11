/* Le sveglie — il pezzo che fa suonare i promemoria.

   Sta nel processo principale e non nel renderer, e non e' un dettaglio di
   architettura: **una sveglia deve suonare anche a finestra chiusa**. Il
   renderer vive dentro la finestra e muore con lei; qui si e' vivi finche' e'
   viva l'applicazione, che da quando c'e' l'icona vicino all'orologio vuol dire
   finche' non la si chiude davvero.

   ── Come si tiene il conto di cosa ha gia' suonato ─────────────────────────

   Una riga in `t_setting`: `promemoria.ultimoControllo`, l'istante fino al
   quale abbiamo gia' guardato. Ogni giro sveglia i promemoria che cadono fra
   quell'istante e adesso, e poi lo sposta ad adesso.

   E' un **segnalibro**, non un elenco di cose fatte, e questo ha due
   conseguenze buone: non cresce mai, e sopravvive al riavvio senza dover
   segnare niente sulle task. La terza conseguenza e' quella per cui e' stato
   scelto: riaprendo l'applicazione dopo due giorni, il segnalibro e' rimasto
   indietro e i promemoria di quei due giorni **suonano in ritardo** — che e' la
   decisione presa l'11/09/2026. Un promemoria non suonato non e' un promemoria
   perso: e' una cosa che qualcuno voleva sapere.

   Al primo avvio in assoluto il segnalibro non c'e', e in quel caso si parte da
   adesso: svegliare tutto lo storico di un database appena migrato sarebbe una
   raffica di notifiche che non significano niente.

   ── Perche' un giro ogni trenta secondi, e non un timer per ogni task ──────

   Un `setTimeout` per promemoria sarebbe piu' elegante e sbaglierebbe in tre
   modi: va rifatto a ogni modifica di una task, non sopravvive alla sospensione
   del computer (il timer di Chromium si ferma e recupera in modo suo), e con
   date lontane supera il massimo di `setTimeout` (24,8 giorni). Un giro corto
   che guarda l'orologio non ha nessuno di questi problemi: al risveglio dalla
   sospensione il primo giro utile recupera tutto quello che e' passato. */

const MEZZO_MINUTO = 30_000;
const CHIAVE = "promemoria.ultimoControllo";

/* **Nessun limite al ritardo** (deciso l'11/09/2026, dopo averne messo uno di
   un giorno e averlo tolto).

   L'idea del limite era che oltre le ventiquattr'ore un promemoria non fosse
   piu' un promemoria ma una task in ritardo, e che l'elenco lo dicesse gia'.
   E' vero per l'elenco e falso per il promemoria: chi mette una sveglia sta
   dicendo "questo voglio saperlo", e decidere al posto suo che dopo un giorno
   non gli interessa piu' e' esattamente il genere di intelligenza che fa
   perdere le cose. Se dopo una vacanza arrivano venti notifiche, quelle venti
   cose erano state messe li' da qualcuno. */

const oraDi = (iso) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

const giornoDi = (iso) =>
  new Date(iso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

/* Il testo della notifica. Una sveglia puntuale dice solo l'ora della task;
   una in ritardo dice **per quando era**, perche' altrimenti mentirebbe: una
   notifica che arriva alle 14 per un promemoria delle 9 senza dirlo fa credere
   che siano le 9. */
export function testoPromemoria(task, adesso = new Date()) {
  const ritardo = adesso.getTime() - new Date(task.reminderAt).getTime();
  const inRitardo = ritardo > 90_000;
  const quando = inRitardo
    ? `Era per le ${oraDi(task.reminderAt)}${
        new Date(task.reminderAt).toDateString() === adesso.toDateString()
          ? ""
          : ` di ${giornoDi(task.reminderAt)}`
      }`
    : task.dueAt
      ? `Scade alle ${oraDi(task.dueAt)}`
      : "Promemoria";
  return { titolo: task.title, corpo: quando };
}

export function creaPromemoria({ core, log = () => {}, onApriTask = () => {} }) {
  let timer = null;
  let inCorso = false;

  const controlla = async () => {
    if (inCorso) return;
    inCorso = true;
    try {
      const adesso = Date.now();
      /* Le due preferenze si rileggono **a ogni giro**, non una volta all'avvio:
         si cambiano dalle Impostazioni, che vivono in un'altra finestra, e un
         valore letto una volta sola resterebbe quello fino al riavvio. Un
         giro e' mezzo minuto: due letture di una riga non sono un carico. */
      const accese = (await core.getSetting("notifiche.promemoria", true)) !== false;
      const conSuono = (await core.getSetting("notifiche.suono", true)) !== false;
      const salvato = await core.getSetting(CHIAVE, null);
      const da = salvato ? new Date(salvato).getTime() : adesso;
      /* Primo avvio: si segna il posto e si aspetta il prossimo giro. */
      if (!salvato) {
        await core.setSetting(CHIAVE, new Date(adesso).toISOString());
        return;
      }
      if (adesso <= da) return;

      const tasks = await core.listTasks();
      /* Righe **grezze** del core, non la forma che usa il renderer: qui non
         passa `normalizeTask`, quindi i nomi sono quelli della tabella
         (`isCompleted`, `isEndState`, `deletedAt`) e non `done` o `state.role`.
         Confondere i due insiemi di nomi non lancia niente: filtra e basta, e
         il sintomo sarebbe una sveglia che suona per una task gia' chiusa. */
      const suonano = tasks.filter((t) => {
        if (!t.reminderAt || t.deletedAt) return false;
        /* Una task chiusa non suona: la sveglia serviva a farla fare. */
        if (t.isCompleted || t.isEndState) return false;
        const quando = new Date(t.reminderAt).getTime();
        return quando > da && quando <= adesso;
      });

      /* `electron` si carica **qui dentro** e non in cima al file, e non e' una
         stranezza: cosi' il modulo si puo' importare in un test di node, dove
         `electron` non esiste. E' la stessa ragione per cui `promemoria.js` del
         renderer sta fuori dal componente — il testo di una sveglia e' il
         genere di cosa che si prova senza aprire una finestra. */
      const { Notification } = await import("electron");

      for (const task of suonano) {
        const { titolo, corpo } = testoPromemoria(task, new Date(adesso));
        log("promemoria:", titolo, "—", corpo, accese ? "" : "(notifiche spente)");
        /* Spente: si passa avanti **senza fermare il segnalibro**, che infatti
           si sposta comunque qui sotto. Trattenerle vorrebbe dire che
           riaccendendo le notifiche arriverebbe tutto l'arretrato del periodo
           in cui erano spente — cioe' che spegnerle non le spegne, le rimanda. */
        if (!accese) continue;
        if (!Notification.isSupported()) continue;
        const n = new Notification({
          title: titolo,
          body: corpo,
          urgency: "normal",
          /* Il suono lo mette il sistema, non noi: qui si puo' solo dire di
             tacere. Acceso di fabbrica — una sveglia muta e' una sveglia che
             funziona solo se stavi guardando lo schermo. */
          silent: !conSuono,
        });
        /* Cliccare una notifica porta alla task, non genericamente all'app:
           il motivo per cui la si clicca e' quello. */
        n.on("click", () => onApriTask(task.idTask ?? task.id));
        n.show();
      }

      await core.setSetting(CHIAVE, new Date(adesso).toISOString());
    } catch (err) {
      /* Una sveglia che non parte non deve portarsi dietro l'applicazione: si
         scrive nel log e si riprova al giro dopo. */
      log("promemoria: giro fallito:", err.message, err.stack ?? "");
    } finally {
      inCorso = false;
    }
  };

  return {
    avvia() {
      if (timer) return;
      /* Un primo giro subito — chi riapre l'app dopo due giorni vuole sapere
         adesso, non fra mezzo minuto — e poi a ritmo. */
      controlla();
      timer = setInterval(controlla, MEZZO_MINUTO);
    },
    ferma() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    /* La notifica di prova delle Impostazioni.

       Passa **da qui** e non da un `new Notification` scritto nel pannello, e
       non e' un capriccio: una prova che prende un'altra strada di quella vera
       puo' riuscire mentre quella vera e' rotta, ed e' esattamente il caso in
       cui la si preme. Stesso processo, stessa classe, stessa preferenza del
       suono. */
    async prova() {
      const conSuono = (await core.getSetting("notifiche.suono", true)) !== false;
      const { Notification } = await import("electron");
      if (!Notification.isSupported()) return { esito: "non-supportate" };
      new Notification({
        title: "Alia — prova",
        body: "Se leggi questo, le notifiche di sistema funzionano.",
        silent: !conSuono,
      }).show();
      return { esito: "mostrata", conSuono };
    },
    /* Per i test e per il rilancio a mano dal log. */
    controlla,
  };
}
