/* Il ponte verso il core.

   In Electron il preload espone `window.alia`, che gira ogni chiamata al
   processo main via IPC. Fuori da Electron — la pagina di anteprima servita da
   Vite nel browser, quella che serve a confrontare le schermate con gli
   artboard — quel ponte non esiste. Lì non si finge di avere un core: si dice
   che non c'è, e la schermata lo mostra. Un finto database in memoria
   sembrerebbe funzionare e coprirebbe proprio gli errori che l'innesto deve
   far emergere. */

export const bridge = typeof window !== "undefined" ? window.alia : undefined;

export const hasCore = Boolean(bridge);

/* Le chiamate al core attraversano l'IPC, quindi sono asincrone anche quando il
   core sottostante è sincrono.

   `core` **non è un elenco scritto a mano**, ed è una correzione: lo era, e si è
   disallineato due volte nello stesso giorno. Gli elenchi delle operazioni erano
   tre — `ALIA_OPERATIONS` nel core, la sua copia nel preload, e questo — e il
   terzo era quello che nessuno si ricordava di aggiornare. Il sintomo era
   pessimo: `core.createState is not a function`, cioè un `TypeError` grezzo su
   un oggetto minificato, proprio il messaggio che il controllo qui sotto esiste
   per evitare. E ne era passato uno inosservato (`markOriginsSeen`, che quindi
   non spegneva mai il badge delle origini nuove).

   Un Proxy toglie il terzo elenco: qualunque operazione il preload esponga è
   chiamabile da qui senza doverla dichiarare due volte. Restano due elenchi, e
   quei due sono duplicati per forza — il preload gira in CommonJS in un contesto
   isolato e non può importare il modulo ESM del core.

   Il controllo sul tipo resta, e ora vale davvero per tutti: chiedendo
   un'operazione che il preload non espone si ottiene una frase che dice quale,
   invece di un errore su una proprietà mancante. */
function chiama(operazione, ...args) {
  if (!bridge) {
    return Promise.reject(new Error("Core non disponibile: questa pagina gira fuori da Electron."));
  }
  const fn = bridge[operazione];
  if (typeof fn !== "function") {
    return Promise.reject(new Error(`Operazione non esposta dal preload: ${operazione}`));
  }
  return fn(...args);
}

export const core = new Proxy(
  {},
  {
    get(_, operazione) {
      /* Le sole chiavi non-stringa che arrivano qui sono i simboli che React e
         gli strumenti di sviluppo usano per fiutare i thenable e i tipi: se si
         restituisse una funzione anche per quelli, `core` verrebbe scambiato per
         una promessa. */
      if (typeof operazione !== "string") return undefined;
      return (...args) => chiama(operazione, ...args);
    },
  },
);
