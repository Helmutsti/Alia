#!/usr/bin/env node
/* L'avvio del servizio. Poco più di un montaggio: leggi la configurazione,
   accendi, e resta acceso finché non ti fermano. */

import { assicuraConfig, leggiConfig, PERCORSO_CONFIG } from "../src/config.js";
import { avviaServizio } from "../src/servizio.js";

const orario = () => new Date().toISOString().slice(11, 19);
const log = (...parti) => console.log(orario(), ...parti);

const { creato, percorso } = assicuraConfig(PERCORSO_CONFIG);
if (creato) {
  log(`configurazione creata in ${percorso} — con un token nuovo di zecca dentro`);
}

const config = leggiConfig(percorso);

if (!config.token) {
  console.error(`Manca il token dell'API. Mettilo in ${percorso} o in ALIA_API_TOKEN.`);
  process.exit(1);
}
if (!config.sorgenti.telegram?.token) {
  log("Telegram non configurato: metti il token del bot in", percorso, "→ sorgenti.telegram.token");
}

const servizio = avviaServizio(config, log);

/* La porta occupata è l'errore più probabile di questo programma, e senza
   ascoltarlo `listen` emette un evento `error` che nessuno raccoglie: Node lo
   rilancia, e quello che si legge è uno stack trace di `node:net`. Il caso vero
   però è quasi sempre uno solo — un'istanza precedente rimasta accesa — e
   merita una frase invece di una diagnosi da fare a mano. */
servizio.server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `La porta ${config.porta} è già occupata: probabilmente c'è un'altra copia del servizio accesa.\n` +
        "Chiudi quella, oppure cambia \"porta\" nella configurazione (e l'indirizzo nelle impostazioni di Alia).",
    );
  } else {
    console.error(`Impossibile mettersi in ascolto: ${err.message}`);
  }
  process.exit(1);
});

const indirizzo = await servizio.ascolta(config.porta, config.host);
log(`confluenza in ascolto su http://${config.host}:${indirizzo.port}`);
log(`coda: ${config.dati} — ${servizio.coda.quanteDaProcessare()} origini da processare`);

/* Si esce in silenzio e per bene: i connettori hanno una richiesta lunga aperta
   verso Telegram, e senza `ferma()` la chiusura resterebbe appesa fino a 25
   secondi dietro a un `getUpdates` che aspetta. */
let inChiusura = false;
for (const segnale of ["SIGINT", "SIGTERM"]) {
  process.on(segnale, async () => {
    if (inChiusura) return;
    inChiusura = true;
    log("chiusura…");
    await servizio.ferma();
    process.exit(0);
  });
}
