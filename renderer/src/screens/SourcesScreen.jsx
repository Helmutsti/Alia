const MailIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6 8.5-6" />
  </svg>
);
const ChatIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
  </svg>
);
const VoiceIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const CalIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" />
  </svg>
);
const SEND_ICON = {
  mail: MailIcon,
  chat: ChatIcon,
  voice: VoiceIcon,
  cal: CalIcon,
};

const RAW_ITEMS = [
  { day: "oggi", source: "Gmail", kind: "mail", from: "marco@studiolegale.it", when: "2 ore fa", excerpt: "«Ti mando il preventivo per la pratica: se ti torna firmalo e rimandalo entro giovedì.»", proposal: "Firmare e rispedire il preventivo", chips: ["gio 10 set", "Lavoro", "Alta"], state: "new" },
  { day: "oggi", source: "Discord", kind: "chat", from: "#progetto-svolto · lisa", when: "4 ore fa", excerpt: "«Ricordati di aggiornare i grafici prima della riunione, quelli di agosto sono vecchi.»", proposal: "Aggiornare i grafici del trimestre", chips: ["ven 11 set", "Lavoro", "Media"], state: "new" },
  { day: "ieri", source: "WhatsApp", kind: "chat", from: "Mamma", when: "ieri", excerpt: "«Il regalo per Marco lo prendiamo insieme? Il compleanno è lunedì prossimo.»", proposal: "Comprare il regalo con mamma", chips: ["lun 14 set", "Personale", "Media"], state: "integrated", landed: "in Personale" },
  { day: "ieri", source: "Note vocali", kind: "voice", from: "memo di 12″", when: "ieri", excerpt: "«Chiamare l'officina per il tagliando e chiedere l'auto sostitutiva.»", proposal: "Prenotare il tagliando in officina", chips: ["gio 17 set", "Casa", "Bassa"], state: "new" },
  { day: "settimana", source: "Google Calendar", kind: "cal", from: "Riunione trimestrale", when: "2 giorni fa", excerpt: "«Invito accettato per lunedì 14 alle 10:00 in sala grande.»", proposal: "Preparare i materiali per la riunione", chips: ["lun 14 set", "Lavoro"], state: "integrated", landed: "in Lavoro" },
  { day: "settimana", source: "Gmail", kind: "mail", from: "servizioclienti@enel.it", when: "3 giorni fa", excerpt: "«La bolletta di agosto è disponibile: 84,20 € con scadenza l'08 settembre.»", proposal: "Pagare la bolletta della luce", chips: ["domani", "Casa", "Alta"], state: "integrated", landed: "in Oggi" },
  { day: "settimana", source: "Slack", kind: "chat", from: "@fornitore-nord", when: "4 giorni fa", excerpt: "«Sconto confermato sul prossimo ordine, ti serve altro?»", proposal: "Rispondere al fornitore", chips: ["fatto"], state: "integrated", landed: "completato" },
];

const GROUPS = [
  { key: "oggi", label: "Oggi", color: "var(--color-accent-300)" },
  { key: "ieri", label: "Ieri", color: "color-mix(in srgb, var(--color-text) 60%, transparent)" },
  { key: "settimana", label: "Questa settimana", color: "color-mix(in srgb, var(--color-text) 60%, transparent)" },
];

const STATE_FILTERS = ["Tutti", "Da confermare", "Già integrati"];

const pendingCount = RAW_ITEMS.filter((i) => i.state === "new").length;

export default function SourcesScreen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", marginBottom: 8 }}>
            {RAW_ITEMS.length} fonti collegate · {pendingCount} da confermare
          </div>
          <h2 style={{ margin: 0, fontSize: 38 }}>Inbox</h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {STATE_FILTERS.map((label, idx) => (
            <span
              key={label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 32,
                padding: "0 12px",
                fontSize: 12.5,
                borderRadius: "var(--radius-md)",
                cursor: "not-allowed",
                border: `1px solid ${idx === 0 ? "var(--color-accent)" : "transparent"}`,
                color: idx === 0 ? "var(--color-accent-300)" : "color-mix(in srgb, var(--color-text) 62%, transparent)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.55, color: "color-mix(in srgb, var(--color-text) 66%, transparent)", margin: "0 0 20px" }}>
        Ogni messaggio che arriva da fuori viene letto e ridotto a una proposta di task. Qui si conferma, si corregge o
        si scarta: dopo la conferma l'elemento vive nel sistema come qualsiasi altro task. Le connessioni non sono
        ancora attive: quanto segue è un esempio di come apparirà questa schermata.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, overflowY: "auto", minHeight: 0, paddingRight: 6, opacity: 0.85 }}>
        {GROUPS.map((g) => {
          const items = RAW_ITEMS.filter((i) => i.day === g.key);
          if (!items.length) return null;
          const pending = items.filter((i) => i.state === "new");
          const integrated = items.filter((i) => i.state === "integrated");
          return (
            <div key={g.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "0 12px" }}>
                <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: g.color }}>{g.label}</span>
                <span style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{items.length}</span>
                <span style={{ height: 1, flex: 1, background: "linear-gradient(to right, var(--color-divider), transparent)" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pending.map((item) => (
                  <div key={item.proposal} className="card" style={{ gap: 0, padding: 12, borderLeft: "2px solid var(--color-accent)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "color-mix(in srgb, var(--color-text) 57%, transparent)" }}>
                      {SEND_ICON[item.kind]}
                      <span style={{ color: "var(--color-text)" }}>{item.source}</span>
                      <span>·</span>
                      <span>{item.from}</span>
                      <span style={{ marginLeft: "auto" }}>{item.when}</span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 9, color: "color-mix(in srgb, var(--color-text) 80%, transparent)" }}>{item.excerpt}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--color-divider)", flexWrap: "wrap" }}>
                      <span style={{ width: 8, height: 8, flex: "0 0 auto", rotate: "45deg", background: "var(--color-accent)" }} />
                      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 13.5, letterSpacing: "-0.01em" }}>{item.proposal}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                        {item.chips.map((c) => (
                          <span key={c} style={{ display: "inline-flex", alignItems: "center", height: 23, padding: "0 9px", fontSize: 11, borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", color: "color-mix(in srgb, var(--color-text) 74%, transparent)" }}>{c}</span>
                        ))}
                        <button type="button" className="ghost-send" disabled title="Crea il task" aria-label="Crea il task" style={{ display: "grid", placeItems: "center", width: 27, height: 27, padding: 0, border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "not-allowed", color: "var(--color-accent)", marginLeft: 4 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2.5L2.8 9.6c-.7.3-.7 1.2 0 1.5l7.1 2.7c.2.1.4.3.5.5l2.7 7.1c.3.7 1.2.7 1.5 0z" /><path d="M10.4 13.6l5.6-5.6" /></svg>
                        </button>
                        <button type="button" className="ghost-send" disabled title="Scarta" aria-label="Scarta" style={{ display: "grid", placeItems: "center", width: 27, height: 27, padding: 0, border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "not-allowed", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
                {integrated.map((item) => (
                  <div key={item.proposal} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--color-divider)", fontSize: 12.5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}><polyline points="20 6 9 17 4 12" /></svg>
                    <span style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 57%, transparent)", whiteSpace: "nowrap" }}>{item.source}</span>
                    <span style={{ color: "color-mix(in srgb, var(--color-text) 40%, transparent)" }}>·</span>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "color-mix(in srgb, var(--color-text) 80%, transparent)" }}>{item.proposal}</span>
                    <span style={{ marginLeft: "auto", flex: "0 0 auto", fontSize: 11, color: "var(--color-accent-300)" }}>{item.landed}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
