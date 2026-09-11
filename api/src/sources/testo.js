/* Il pezzo di testo che ogni sorgente fa allo stesso modo.

   Da dove arriva un messaggio cambia tutto — il protocollo, l'idempotenza, il
   modo di dire "ricevuto" a chi ha scritto — ma la regola con cui un testo
   diventa il titolo di un'origine non cambia niente: è una proprietà di come si
   scrivono le cose da fare, non di Telegram o di Discord. Quindi sta qui, e
   nessuna sorgente la riscrive. */

/* Il titolo di un task è una riga in una card larga ~250px: ci sta poco, e
   quello che avanza vive comunque in `originalContent`, che non taglia niente. */
const TITOLO_MASSIMO = 120;

/* Il titolo è la prima riga, perché è così che si scrive un messaggio che
   contiene una cosa da fare: l'oggetto prima, i dettagli sotto. Se la prima
   riga è lunga si taglia sull'ultimo spazio prima del limite — spezzare una
   parola a metà si legge peggio di un titolo più corto. */
export function titoloDaTesto(testo) {
  const prima = testo.split("\n").find((riga) => riga.trim() !== "")?.trim() ?? "";
  if (prima.length <= TITOLO_MASSIMO) return prima;
  const tagliato = prima.slice(0, TITOLO_MASSIMO);
  const spazio = tagliato.lastIndexOf(" ");
  return `${(spazio > TITOLO_MASSIMO / 2 ? tagliato.slice(0, spazio) : tagliato).trimEnd()}…`;
}
