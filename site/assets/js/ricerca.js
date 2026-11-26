/* GERICO Terminal: la ricerca. In cima il motore, che cerca nei dati di GERICO (titoli degli indici della mappa,
   strumenti di «Prezzi e grafici», trimestrali e cedole, agenda, glossario, sezioni) tutto nel browser; sotto il campo
   nella barra in alto, che aggiunge le notizie (G.cerca) e gli altri titoli di Yahoo Finance (/api/cerca). */
(function () {
  "use strict";
  const G = (window.G = window.G || {});

  // ---------- il motore ----------
  const norm = (s) => G.cerca.norm(s);
  const compatta = (s) => norm(s).replace(/[^a-z0-9]/g, "");
  // le parole cercate (al più otto), senza accenti
  const parole = (q) => norm(q).split(/[^a-z0-9%&]+/).filter(Boolean).slice(0, 8);
  // le sigle di un titolo o di uno strumento, compatte: «ENI.MI» → enimi ed eni; «EURUSD=X» → eurusdx ed eurusd; «^GSPC» → gspc
  const sigle = (...xs) => {
    const out = new Set();
    xs.forEach((x) => { if (x) { out.add(compatta(x)); out.add(compatta(String(x).replace(/[=.].*$/, ""))); } });
    out.delete("");
    return Array.from(out);
  };
  const aInizio = (testo, w) => new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(testo);
  // quanto una voce è vicina a quello che si cerca: il ticker esatto prima di tutto; poi il nome che comincia così,
  // ogni parola all'inizio di una parola del nome, l'inizio di una sigla, ogni parola dentro il nome (solo da quattro
  // lettere in su: «oro» non deve trovare Toronto). Zero: fuori
  function punti(v, ws, cq) {
    if (cq && v.sigle.includes(cq)) return 1000;
    if (cq.length < 2) return 0;
    let p = 0;
    const t = v.testo;
    if (ws.length && ws.every((w) => t.includes(w))) p = t.startsWith(ws.join(" ")) ? 300 : ws.every((w) => aInizio(t, w)) ? 200 : cq.length > 3 ? 50 : 0;
    if (v.sigle.some((s) => s.length > cq.length && s.startsWith(cq))) p = Math.max(p, 150);
    return p;
  }
  const numero = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  // le sezioni del Terminal: il comando di terminal.js, il nome e le parole con cui si cercano
  const SEZIONI = [
    ["MAPPA", "Mappa dei mercati", "Market map", "mappa map mondo world borse markets"],
    ["MAPPA EUROPA", "Mappa dell'Europa", "Europe map", "europa europe"],
    ["INDICI", "Indici", "Indices", "indici indices borse"],
    ["VALUTE", "Valute", "Currencies", "valute cambi currencies forex fx"],
    ["TASSI", "Tassi a 10 anni", "10-year yields", "tassi rendimenti rates yields titoli di stato btp bund treasury"],
    ["MATERIE PRIME", "Materie prime", "Commodities", "materie prime commodities"],
    ["CRIPTO", "Cripto", "Crypto", "cripto crypto criptovalute"],
    ["AGENDA", "Agenda di oggi", "Today's calendar", "agenda calendario calendar eventi events"],
    ["NOTIZIE", "Notizie sui mercati", "Market news", "notizie news"],
    ["MACRO", "Macro: Stati Uniti ed eurozona", "Macro: US and euro area", "macro economia economy inflazione inflation pil gdp lavoro jobs"],
    ["SENTIMENT", "Tono delle notizie", "News tone", "sentiment tono tone"],
    ["TRIMESTRALI", "Trimestrali", "Earnings", "trimestrali utili conti risultati earnings"],
    ["CEDOLE", "Cedole", "Dividends", "cedole dividendi dividends"],
    ["SEC", "Documenti SEC", "SEC filings", "sec edgar"]
  ];

  // l'indice di tutto quello che si può cercare, fatto una volta quando arrivano i dati
  G.ricercaIndice = (d) => {
    const L = G.L, ix = { titoli: [], strumenti: [], societa: [], agenda: [], glossario: [], sezioni: [] };
    const indici = (d && d.indici) || {};
    Object.keys(indici).forEach((code) => {
      const x = indici[code];
      if (!x || !Array.isArray(x.items)) return;
      x.items.forEach((s) => {
        if (!s || !s.s || !s.n) return;
        ix.titoli.push({ testo: norm(s.n), sigle: sigle(s.t, s.s), w: +s.w || 0,
          riga: { tipo: "titolo", id: code + ":" + s.s, nome: s.n, sotto: (s.t || s.s) + " · " + (x.index || code), valore: numero(s.p), cambio: numero(s.c), cur: x.cur || "", rif: { code, sym: s.s } } });
      });
    });
    ((d && d.quotes && d.quotes.groups) || []).forEach((g) => (g.items || []).forEach((it) => {
      if (!it || !it.sym || !it.name) return;
      const bp = g.key === "tassi" || typeof it.bp === "number";
      ix.strumenti.push({ testo: norm(it.name + " " + G.tn(it.name)), sigle: sigle(it.sym, it.name), w: 0,
        riga: { tipo: "strumento", id: it.sym, nome: G.tn(it.name), sotto: G.tn(g.label || ""), valore: numero(it.last), cambio: numero(bp ? it.bp : it.chg), bp, cur: it.currency || "", rif: { sym: it.sym } } });
    }));
    ((d && d.societari && d.societari.items) || []).forEach((it) => {
      if (!it || !it.sym || !it.name || !it.date) return;
      const tipo = it.kind === "cedole" ? L("Cedola", "Dividend") : L("Trimestrale", "Earnings");
      ix.societa.push({ testo: norm(it.name), sigle: sigle(it.sym), w: 0,
        riga: { tipo: "societa", id: it.kind + ":" + it.sym + ":" + it.date, nome: it.name, sotto: tipo + " · " + G.dayOnly(it.date) + (it.index ? " · " + it.index : ""), data: it.date, rif: { so: it.kind === "cedole" ? "cedole" : "utili", sym: it.sym } } });
    });
    ((d && d.agenda) || []).forEach((it) => {
      if (!it || !it.ev) return;
      ix.agenda.push({ testo: norm(it.ev), sigle: [], w: 0,
        riga: { tipo: "agenda", id: "ag:" + (it.date || "") + (it.time || "") + it.ev, nome: it.ev, sotto: [it.cur, it.date ? G.dayOnly(it.date) : "", it.time].filter(Boolean).join(" · "), rif: { ag: it.ev } } });
    });
    ((d && d.glossario && d.glossario.voci) || []).forEach((v) => {
      if (!v || !v.id || !v.it) return;
      const lato = (G.en && v.en) || v.it;
      ix.glossario.push({ testo: norm([lato.t].concat(lato.alt || [], v.it.t, v.it.alt || []).join(" ")), sigle: [], w: 0,
        riga: { tipo: "glossario", id: v.id, nome: lato.t, sotto: lato.d || "", rif: { gl: v.id } } });
    });
    SEZIONI.forEach(([cmd, it, en, kw]) => ix.sezioni.push({ testo: norm(L(it, en) + " " + kw), sigle: [], w: 0,
      riga: { tipo: "sezione", id: cmd, nome: L(it, en), sotto: "", rif: { cmd } } }));
    return ix;
  };

  // i risultati a gruppi: titoli al più 6, gli altri al più 4. Per eventi, voci e sezioni conta solo l'inizio delle parole.
  // Ogni riga porta il suo punteggio (p): la pagina mette prima il gruppo con la riga più vicina
  G.ricercaTrova = (ix, q) => {
    const ws = parole(q), cq = compatta(q);
    const scegli = (lista, max, minimo) => lista.map((v) => ({ v, p: punti(v, ws, cq) })).filter((x) => x.p >= minimo)
      .sort((a, b) => b.p - a.p || b.v.w - a.v.w || a.v.riga.nome.localeCompare(b.v.riga.nome)).slice(0, max).map((x) => Object.assign({ p: x.p }, x.v.riga));
    return { ws, titoli: scegli(ix.titoli, 6, 1), strumenti: scegli(ix.strumenti, 4, 1), societa: scegli(ix.societa, 4, 1),
      agenda: scegli(ix.agenda, 4, 150), glossario: scegli(ix.glossario, 4, 150), sezioni: scegli(ix.sezioni, 4, 150) };
  };

  if (typeof document === "undefined") return;
})();
