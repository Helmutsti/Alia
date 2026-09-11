/* La coda delle origini: il magazzino dell'API — e l'unico che c'è.

   Alia **non conserva niente**: la sua colonna origini è una finestra su questa
   tabella, non una copia. Rilanciare una sincronizzazione rilegge le stesse
   righe e non produce nessun effetto, che è la proprietà che rende il gesto
   ripetibile senza pensarci.

   ── `origine`: quello che è arrivato, e se è stato lavorato ────────────────

   Un'origine **non è un task, e non è una notifica**: è qualcosa arrivato da
   fuori che aspetta una decisione. Le decisioni sono due e non c'è una terza:
   o entra nel sistema diventando un task, o viene rifiutata. `isProcessed` dice
   che la decisione è stata presa, qualunque delle due sia stata — e quindi che
   la riga non va più mostrata.

   **Un flag solo, e basta.** "Diventata un task" e "rifiutata" non servono come
   stati distinti perché sono derivabili da fuori: se in Alia esiste un task che
   cita quell'origine, è entrata; se non esiste, è stata buttata. Aggiungere un
   secondo flag vorrebbe dire tenere in due posti una cosa che è vera in uno.

   E non c'è nessun "vista ma non decisa": sarebbe lo stallo che il modello
   esiste per impedire. Il badge conta le origini da processare, cioè un
   arretrato, non una campanella — un arretrato non si guarda, si smaltisce.

   `seq` resta la chiave e l'ordine: un intero che cresce e non torna indietro.
   Non è più un cursore — quello è sparito con la versione 2 — ma continua a
   ordinare totalmente, che un timestamp non farebbe (due messaggi nello stesso
   millisecondo non sono ordinabili).

   L'indice unico su `(sourceType, sourceId)` è la guardia del confine
   sorgente → coda: qui una riga **è** un messaggio, e lo stesso messaggio non
   entra due volte. Su `t_task` in Alia quel vincolo non c'è e non deve
   esserci — un'origine può generare N task.

   ── `sorgente_stato`: fin dove il connettore è arrivato ───────────────────

   Chiave-valore per i connettori: l'offset di Telegram vive qui invece che in
   un file. Dice "ho letto da Telegram", che è un fatto diverso da "il cliente
   ha deciso" e non va confuso con `isProcessed`. */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const VERSIONE_SCHEMA = 2;

export function apriCoda(percorso) {
  if (typeof percorso !== "string" || percorso.trim() === "") {
    throw new TypeError("percorso must be a non-empty string");
  }
  if (percorso !== ":memory:") mkdirSync(dirname(resolve(percorso)), { recursive: true });

  const database = new DatabaseSync(percorso);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  if (percorso !== ":memory:") database.exec("PRAGMA journal_mode = WAL");
  migra(database);

  return creaCoda(database);
}

function migra(database) {
  const versione = database.prepare("PRAGMA user_version").get().user_version;

  if (versione < 1) {
    database.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE origine (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        sourceUrl TEXT,
        title TEXT NOT NULL,
        originalContent TEXT NOT NULL,
        /* Le informazioni di servizio della sorgente — chi ha scritto, da dove
           e' stato inoltrato, l'identificativo tecnico del messaggio. Sono
           quelle che la specifica vuole "tenute separate dagli attributi
           operativi del task": qui stanno in un JSON perche' ogni sorgente ne
           ha di sue, e inventare colonne comuni a mail, Discord e Telegram
           prima di avere mail e Discord sarebbe indovinare. */
        servizio TEXT NOT NULL DEFAULT '{}',
        ricevutaAt TEXT NOT NULL
      );

      CREATE UNIQUE INDEX origine_identita ON origine(sourceType, sourceId);

      CREATE TABLE lettore (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cursore INTEGER NOT NULL DEFAULT 0,
        ultimoScaricoAt TEXT
      );
      INSERT INTO lettore (id, cursore) VALUES (1, 0);

      CREATE TABLE sorgente_stato (
        chiave TEXT PRIMARY KEY,
        valore TEXT NOT NULL
      );

      PRAGMA user_version = 1;
      COMMIT;
    `);
  }

  if (versione < 2) {
    /* Da cursore a `isProcessed`.

       La versione 1 teneva una ricevuta di lettura (`lettore.cursore`) e Alia
       trasformava in task tutto quello che scaricava, subito. Era il modello
       "casella di posta": il servizio consegna, il client conserva.

       Non reggeva, e il motivo e' che un'origine non e' un task: consegnarla
       significava gia' averla decisa. Ora il servizio **conserva** e Alia
       guarda: `isProcessed` dice che la decisione e' stata presa, e il cursore
       non serve piu' — "dammi le non processate" e' gia' la domanda giusta.

       Le righe che il vecchio cursore aveva superato sono proprio quelle che
       Alia aveva gia' trasformato in task: nascono processate. Quelle oltre il
       cursore non erano mai state consegnate, e restano da decidere. */
    const cursore = database.prepare("SELECT cursore FROM lettore WHERE id = 1").get()?.cursore ?? 0;
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE origine ADD COLUMN isProcessed INTEGER NOT NULL DEFAULT 0
        CHECK (isProcessed IN (0, 1));
      UPDATE origine SET isProcessed = 1 WHERE seq <= ${Number(cursore)};
      DROP TABLE lettore;
      /* Parziale: l'indice serve alla sola domanda che si fa davvero ("quali
         restano da processare"), e cosi' non cresce con l'archivio di quelle
         gia' decise, che nessuno interroga. */
      CREATE INDEX origine_da_processare ON origine(seq) WHERE isProcessed = 0;
      PRAGMA user_version = 2;
      COMMIT;
    `);
  }
}

function creaCoda(database) {
  const inserisci = database.prepare(`
    INSERT INTO origine (sourceType, sourceId, sourceUrl, title, originalContent, servizio, ricevutaAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    /* Il doppione non è un errore da segnalare: è il caso normale quando un
       connettore riparte e rilegge qualcosa che aveva già visto. Si ignora, e
       il conteggio delle righe dice che non è entrato niente. */
    ON CONFLICT (sourceType, sourceId) DO NOTHING
  `);

  return {
    /* Restituisce il `seq` assegnato, oppure `null` se era un doppione. Chi
       chiama lo usa per sapere se c'e' davvero qualcosa di nuovo da annunciare. */
    accoda(origine, servizio = {}) {
      const esito = inserisci.run(
        origine.sourceType,
        origine.sourceId,
        origine.sourceUrl ?? null,
        origine.title,
        origine.originalContent,
        JSON.stringify(servizio),
        new Date().toISOString(),
      );
      return esito.changes === 0 ? null : Number(esito.lastInsertRowid);
    },

    /* Le origini che aspettano una decisione. **Leggere non cambia niente**:
       questa e' la finestra su cui Alia si affaccia, e riaffacciarsi due volte
       mostra le stesse righe. L'unica cosa che le toglie di qui e' `processa`.

       **Dalla piu' recente**, e non dalla piu' vecchia (deciso l'11/09/2026).

       La cosa che di solito sconsiglia il piu'-recente-in-alto qui non vale:
       l'obiezione e' che una lista in cui si lavora non deve muoversi sotto le
       mani, e che il vecchio affonda in fondo dove nessuno guarda. Ma questa
       colonna non e' una lista in cui si lavora a lungo — e' un mucchio da
       svuotare, e non ha un ordine manuale da rispettare: le origini non hanno
       `position`, l'unico ordine possibile e' quello di arrivo.

       Vince quindi il caso d'uso vero: hai appena mandato una nota dal telefono
       e la vuoi vedere. Con il piu' vecchio in alto avresti dovuto scorrere
       fino in fondo ogni volta.

       Con `LIMIT` significa "le N piu' recenti": se l'arretrato supera il
       limite, quello che resta fuori e' il piu' vecchio — che e' anche il meno
       urgente da guardare, e il conteggio continua a dirlo per intero. */
    daProcessare({ limite = 200 } = {}) {
      const righe = database
        .prepare(`
          SELECT seq, sourceType, sourceId, sourceUrl, title, originalContent, servizio, ricevutaAt
          FROM origine WHERE isProcessed = 0 ORDER BY seq DESC LIMIT ?
        `)
        .all(Math.min(Math.max(1, limite), 1000));
      return righe.map((r) => ({ ...r, servizio: JSON.parse(r.servizio) }));
    },

    quanteDaProcessare() {
      return database.prepare("SELECT COUNT(*) c FROM origine WHERE isProcessed = 0").get().c;
    },

    /* La decisione e' presa: entrata nel sistema o rifiutata, qui non fa
       differenza — la differenza si legge da fuori, guardando se in Alia esiste
       un task che cita questa origine.

       Idempotente, e deve esserlo: processare due volte la stessa riga non e'
       un errore ma la conseguenza normale di due finestre aperte sulla stessa
       coda, o di una risposta persa e un gesto ripetuto. Restituisce `true`
       solo la prima volta, per chi vuole contare le decisioni vere. */
    processa(seq) {
      if (!Number.isInteger(seq) || seq < 1) throw new TypeError("seq must be a positive integer");
      const esito = database
        .prepare("UPDATE origine SET isProcessed = 1 WHERE seq = ? AND isProcessed = 0")
        .run(seq);
      return esito.changes > 0;
    },

    esiste(seq) {
      return database.prepare("SELECT 1 FROM origine WHERE seq = ?").get(seq) != null;
    },

    /* Lo stato dei connettori: `leggiStato`/`scriviStato` sono ciò che in Alia
       era `telegram-offset.json`. Sta nello stesso database delle origini di
       proposito — accodare un messaggio e ricordarsi di averlo letto sono due
       fatti che devono restare d'accordo, e in due file separati non lo
       restano. */
    leggiStato(chiave, predefinito = null) {
      const riga = database.prepare("SELECT valore FROM sorgente_stato WHERE chiave = ?").get(chiave);
      return riga ? JSON.parse(riga.valore) : predefinito;
    },

    scriviStato(chiave, valore) {
      database
        .prepare(`
          INSERT INTO sorgente_stato (chiave, valore) VALUES (?, ?)
          ON CONFLICT (chiave) DO UPDATE SET valore = excluded.valore
        `)
        .run(chiave, JSON.stringify(valore));
    },

    close: () => database.close(),
  };
}
