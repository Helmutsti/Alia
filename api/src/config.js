/* La configurazione del servizio: un file, con le variabili d'ambiente che
   vincono sopra.

   L'ordine non è un capriccio: il file è comodo su una macchina tua, le
   variabili sono l'unico modo decente di passare un segreto a un container. Chi
   mette in produzione non deve riscrivere il file, deve poterlo scavalcare. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PERCORSO_CONFIG = process.env.ALIA_API_CONFIG ?? join(RADICE, "config.json");

const PREDEFINITI = {
  porta: 8787,
  /* `127.0.0.1` e non `0.0.0.0`: finché il servizio gira sulla stessa macchina
     di Alia non ha nessun motivo di farsi vedere dalla rete. Metterlo in
     ascolto ovunque è una scelta da fare apposta, il giorno che il servizio va
     su un server vero — non un valore che ti ritrovi addosso. */
  host: "127.0.0.1",
  dati: "dati/coda.sqlite",
  sorgenti: {},
};

/* Una lista in una variabile d'ambiente è una stringa separata da virgole: non
   c'è un altro modo, e ogni sorgente ne ha una (le chat di Telegram, i canali di
   Discord). `undefined` quando la variabile non c'è, perché "non l'hai scritta"
   e "l'hai scritta vuota" devono restare due cose diverse: la prima lascia
   vincere il file, la seconda lo azzera apposta. */
const elenco = (valore) =>
  valore === undefined ? undefined : valore.split(",").map((s) => s.trim()).filter(Boolean);

export function leggiConfig(percorso = PERCORSO_CONFIG) {
  let file = {};
  if (existsSync(percorso)) {
    file = JSON.parse(readFileSync(percorso, "utf8"));
  }

  const config = {
    ...PREDEFINITI,
    ...file,
    porta: Number(process.env.ALIA_API_PORTA ?? file.porta ?? PREDEFINITI.porta),
    host: process.env.ALIA_API_HOST ?? file.host ?? PREDEFINITI.host,
    token: process.env.ALIA_API_TOKEN ?? file.token ?? null,
    sorgenti: {
      ...file.sorgenti,
      telegram: {
        ...file.sorgenti?.telegram,
        token: process.env.ALIA_TELEGRAM_TOKEN ?? file.sorgenti?.telegram?.token ?? null,
        chat: elenco(process.env.ALIA_TELEGRAM_CHAT) ?? file.sorgenti?.telegram?.chat ?? [],
      },
      discord: {
        ...file.sorgenti?.discord,
        token: process.env.ALIA_DISCORD_TOKEN ?? file.sorgenti?.discord?.token ?? null,
        canali: elenco(process.env.ALIA_DISCORD_CANALI) ?? file.sorgenti?.discord?.canali ?? [],
      },
    },
  };

  /* Il percorso del database si intende relativo alla cartella del servizio,
     non a quella da cui lo hai lanciato: `npm start` da un'altra directory non
     deve creare una seconda coda vuota da qualche parte. */
  config.dati = config.dati === ":memory:" || isAbsolute(config.dati)
    ? config.dati
    : join(RADICE, config.dati);

  return config;
}

/* Alla prima accensione il file non c'è e il token nemmeno. Inventarne uno e
   scriverlo è meglio delle due alternative: partire senza (un'API aperta) o
   fermarsi con un'istruzione da eseguire a mano (che si esegue male). 32 byte
   casuali in esadecimale sono un segreto vero, e finiscono in un file che si
   può leggere per copiarlo in Alia. */
export function assicuraConfig(percorso = PERCORSO_CONFIG) {
  if (existsSync(percorso)) return { creato: false, percorso };

  const iniziale = {
    porta: PREDEFINITI.porta,
    host: PREDEFINITI.host,
    token: randomBytes(32).toString("hex"),
    dati: PREDEFINITI.dati,
    /* Le sorgenti compaiono tutte, vuote: un file che le nomina si compila
       riempiendo un campo, uno che le tace si compila andando a cercare come si
       chiamano. */
    sorgenti: {
      telegram: { token: null, chat: [] },
      discord: { token: null, canali: [] },
    },
  };
  writeFileSync(percorso, `${JSON.stringify(iniziale, null, 2)}\n`, "utf8");
  return { creato: true, percorso };
}
