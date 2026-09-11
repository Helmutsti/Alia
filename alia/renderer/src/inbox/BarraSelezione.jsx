import { useState } from "react";

import { Check, ChevronDown } from "../components/icons.jsx";
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from "./Dropdown.jsx";

/* La barra delle azioni rapide, che compare quando si è in selezione.

   ── Perché una modalità esplicita, e non un modificatore ──────────────────

   Entrare in selezione con `Ctrl`+clic costa zero a schermo ma è invisibile:
   chi non lo sa non lo trova. La casella che compare in hover si scopre, ma
   rende ambiguo ogni singolo clic — su una riga che si apre *e* si trascina,
   un terzo significato nascosto è un rischio a ogni gesto.

   Il tasto "Seleziona" in testata risolve entrambe: **il clic cambia
   significato solo quando lo hai chiesto tu.** Dentro la modalità non c'è
   niente da indovinare — ogni riga si seleziona e basta — e fuori non è
   cambiato niente.

   ── Perché l'azione si sceglie e poi si conferma ──────────────────────────

   Non si applica al clic sull'azione. Si sceglie *cosa* fare, la barra lo
   mostra, e poi si conferma. Due ragioni:

     · un'azione in blocco è la cosa più distruttiva che l'app sa fare — venti
       task cancellati con un clic non hanno un "annulla";
     · e permette di correggere la mira senza uscire: scelgo "Stato: Fatto",
       vedo che ho selezionato una riga di troppo, la tolgo, e confermo.

   "Annulla" esce senza aver toccato niente, ed è sempre disponibile. */

const BARRA =
  "absolute left-[18px] right-3 bottom-3 z-[8] flex items-center gap-2 h-11 px-3 " +
  "rounded-xl border border-divider bg-surface shadow-elev-lg";

const AZIONE =
  "flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-divider bg-transparent " +
  "cursor-pointer text-[12.5px] text-content/75 hover:text-content hover:border-accent " +
  "transition-colors duration-[120ms]";

const AZIONE_SCELTA =
  "flex items-center gap-1.5 h-7 px-2.5 rounded-lg border cursor-pointer text-[12.5px] " +
  "border-accent text-accent bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]";

const CONFERMA =
  "h-7 px-3 rounded-lg border-0 cursor-pointer text-[12.5px] font-medium bg-accent text-bg hover:opacity-90";

const ANNULLA =
  "h-7 px-2.5 rounded-lg border-0 bg-transparent cursor-pointer text-[12.5px] text-content/60 hover:text-content";

/* Tre azioni, non tutto il CRUD: assegnare un progetto, cambiare stato,
   cancellare.

   Titolo e scadenza non ci sono di proposito — sono valori per uno, non per
   venti.

   E non c'e' **"togli dallo smistamento"**, che pure il core saprebbe fare in
   blocco: smistare vuol dire decidere dove va ogni singola cosa, e deciderlo
   per venti insieme e' la definizione di non averlo fatto. Le tre che restano
   invece dicono qualcosa di vero su tutto il gruppo — questi venti sono dello
   stesso progetto, questi venti sono chiusi, questi venti non servono. */
export function BarraSelezione({ quante, progetti, stati, azione, onAzione, onConferma, onAnnulla, inCorso }) {
  const [menu, setMenu] = useState(null);
  const chiudi = () => setMenu(null);

  const scegli = (nuova) => {
    chiudi();
    onAzione(nuova);
  };

  const etichetta = {
    progetto: (a) => `Progetto: ${progetti.find((p) => p.id === a.valore)?.name ?? "Nessuno"}`,
    stato: (a) => `Stato: ${stati.find((s) => s.id === a.valore)?.label ?? "?"}`,
    elimina: () => "Elimina",
  };

  return (
    <div className={BARRA}>
      <span className="text-[12.5px] text-content/70 tabular-nums shrink-0">
        {quante} {quante === 1 ? "selezionata" : "selezionate"}
      </span>
      <span className="w-px h-5 bg-divider shrink-0" />

      {/* Scelta la, le altre spariscono: la barra mostra una decisione, non un
          menu ancora aperto. Il chip resta cliccabile per cambiarla. */}
      {azione ? (
        <button
          type="button"
          onClick={() => onAzione(null)}
          title="Cambia azione"
          className={AZIONE_SCELTA + (azione.tipo === "elimina" ? " !border-danger !text-danger" : "")}
        >
          {etichetta[azione.tipo](azione)}
        </button>
      ) : (
        <>
          <div className="relative">
            <button type="button" onClick={() => setMenu("progetto")} className={AZIONE}>
              Progetto <ChevronDown size={11} className="opacity-70" />
            </button>
            <Dropdown open={menu === "progetto"} onClose={chiudi} placement="top" width={220}>
              <DropdownLabel>Assegna a</DropdownLabel>
              <DropdownItem onClick={() => scegli({ tipo: "progetto", valore: null })}>
                <span className="flex-1">Nessun progetto</span>
              </DropdownItem>
              {progetti.map((p) => (
                <DropdownItem key={p.id} onClick={() => scegli({ tipo: "progetto", valore: p.id })}>
                  <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="flex-1">{p.name}</span>
                </DropdownItem>
              ))}
            </Dropdown>
          </div>

          <div className="relative">
            <button type="button" onClick={() => setMenu("stato")} className={AZIONE}>
              Stato <ChevronDown size={11} className="opacity-70" />
            </button>
            <Dropdown open={menu === "stato"} onClose={chiudi} placement="top" width={200}>
              {stati.map((s, i) => (
                <div key={s.id}>
                  {/* Le chiusure stanno dopo una riga, come nella riga singola:
                      portare su uno stato finale non è un passaggio come gli
                      altri — trascina i sotto-task con sé. */}
                  {s.role === "end" && stati[i - 1]?.role !== "end" ? <DropdownSeparator /> : null}
                  <DropdownItem onClick={() => scegli({ tipo: "stato", valore: s.id })}>
                    <span className="flex-1">{s.label}</span>
                  </DropdownItem>
                </div>
              ))}
            </Dropdown>
          </div>

          <button
            type="button"
            onClick={() => scegli({ tipo: "elimina" })}
            className={`${AZIONE} hover:!border-danger hover:!text-danger`}
          >
            Elimina
          </button>
        </>
      )}

      <span className="flex-1" />
      <button type="button" onClick={onAnnulla} className={ANNULLA} disabled={inCorso}>
        Annulla
      </button>
      <button
        type="button"
        onClick={onConferma}
        disabled={!azione || quante === 0 || inCorso}
        className={CONFERMA + (!azione || quante === 0 || inCorso ? " opacity-40 cursor-not-allowed" : "")}
        title={azione ? undefined : "Scegli prima cosa fare"}
      >
        {inCorso ? "Applico…" : "Conferma"}
      </button>
    </div>
  );
}

/* Il tasto che apre la modalità, in testata accanto al conteggio. Sta lì e non
   in fondo perché è dove si dice *cosa si sta guardando*: la selezione è un
   modo di guardare prima che un modo di agire. */
export function TastoSeleziona({ attivo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "ml-2 flex items-center gap-1.5 h-[26px] px-2.5 rounded-lg border cursor-pointer text-[12.5px] " +
        "transition-colors duration-[120ms] " +
        (attivo
          ? "border-accent text-accent bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]"
          : "border-divider text-content/60 bg-transparent hover:text-content hover:border-accent")
      }
    >
      {attivo ? <Check size={12} /> : null}
      Seleziona
    </button>
  );
}
