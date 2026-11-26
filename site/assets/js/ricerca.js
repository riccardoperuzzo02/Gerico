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

  // le notizie trovate da G.cerca (common.js), ripassate: fino a tre lettere solo le parole che cominciano così, nel
  // titolo o nei temi («eni» non deve portare i «genitori»); da quattro in su ogni parola in titolo, temi o sommario
  G.ricercaNotizie = (storie, q) => {
    const ws = parole(q), corta = compatta(q).length <= 3;
    return (storie || []).filter((h) => {
      const r = h && h.r;
      if (!r || !ws.length) return false;
      const t = r.t || "", g = r.g || "", s = r.s || "";
      return ws.every((w) => (corta ? aInizio(t, w) || aInizio(g, w) : t.includes(w) || g.includes(w) || s.includes(w)));
    });
  };

  if (typeof document === "undefined") return;

  // ---------- il campo nella barra in alto ----------
  // I risultati di GERICO arrivano mentre si scrive; quelli di Yahoo Finance (titoli che GERICO non segue) dal nostro
  // Worker, poco dopo. Quello che si cerca nei dati di GERICO resta nel browser.
  const GRUPPI = {
    titoli: ["Titoli", "Stocks"], strumenti: ["Indici, valute e materie prime", "Indices, currencies and commodities"],
    societa: ["Trimestrali e cedole", "Earnings and dividends"], agenda: ["Agenda", "Calendar"], glossario: ["Glossario", "Glossary"],
    sezioni: ["Sezioni del Terminal", "Terminal sections"], notizie: ["Notizie di GERICO", "GERICO news"], yahoo: ["Altri titoli, da Yahoo Finance", "More securities, from Yahoo Finance"]
  };
  const ORDINE = ["titoli", "strumenti", "societa", "agenda", "glossario", "sezioni"];
  const TIPI = { azione: ["Azione", "Stock"], etf: ["ETF", "ETF"], fondo: ["Fondo", "Fund"], indice: ["Indice", "Index"], valuta: ["Valuta", "Currency"], cripto: ["Cripto", "Crypto"], future: ["Future", "Future"] };
  const lungo = (q) => compatta(q).length;

  G.ricercaCampo = (P, azioni) => {
    const L = G.L, esc = G.esc, $ = (id) => document.getElementById(id);
    const form = $("t-cerca"), q = $("tq"), pan = $("tq-p"), lista = $("tq-l"), nota = $("tq-n"), notaY = $("tq-y");
    if (!form || !q || !pan) return;
    form.querySelector("label").textContent = L("Cerca nel Terminal", "Search the Terminal");
    lista.setAttribute("aria-label", L("Risultati della ricerca", "Search results"));

    // al suo posto: sul computer nella riga del nome, sul telefono accanto a «Sezioni» (lo stesso modulo, spostato)
    const riga1 = document.querySelector(".top .top-row"), riga2 = document.querySelector(".top nav.wrap");
    const mq = window.matchMedia("(min-width: 760px)");
    const metti = () => {
      if (mq.matches) { if (form.parentElement !== riga1) riga1.insertBefore(form, riga1.querySelector(".mode")); }
      else if (riga2 && form.parentElement !== riga2) riga2.appendChild(form);
      q.placeholder = mq.matches ? L("Cerca un titolo, una valuta, un evento", "Search a stock, a currency, an event") : L("Cerca un titolo", "Search a stock");
      form.classList.add("a-posto");
    };

    // i dati: al primo uso del campo, non all'apertura della pagina
    let ixP = null;
    const carica = () => ixP || (ixP = G.load("indici/elenco").then((el) => {
      const codici = Object.keys((el && el.indici) || {});
      const uno = (n) => Promise.resolve(G.load(n)).catch(() => null);
      return Promise.all([Promise.all(codici.map((c) => uno("indici/" + c))), uno("quotes"), uno("societari"), uno("agenda"), uno("calendario"), uno("glossario")])
        .then(([xs, quotes, societari, ag, cal, glossario]) => {
          const indici = {};
          codici.forEach((c, i) => { if (xs[i]) indici[c] = xs[i]; });
          const agenda = ((ag && ag.items) || []).map((it) => ({ ev: it.event, cur: it.currency, date: ag.date, time: it.time }))
            .concat(((cal && cal.items) || []).map((it) => ({ ev: it.title, cur: it.currency, date: it.date, time: it.time })));
          const ix = G.ricercaIndice({ indici, quotes, societari, agenda, glossario });
          form.dataset.pronto = "1";
          return ix;
        });
    }).catch(() => { ixP = null; return G.ricercaIndice({}); }));
    const notizie = (testo) => (G.cerca && G.cerca.indice ? G.cerca.indice().then((n) => (n && n.storie ? G.ricercaNotizie(G.cerca.trova(n, testo).storie, testo).slice(0, 3) : [])).catch(() => []) : Promise.resolve([]));

    // ---------- Yahoo Finance, dal nostro Worker ----------
    const yh = new Map();
    let tYh = 0, ctlYh = null;
    const chiediYahoo = (testo) => {
      const k = testo.toLowerCase();
      clearTimeout(tYh);
      if (yh.has(k) || lungo(testo) < 2) return;
      tYh = setTimeout(async () => {
        if (ctlYh) ctlYh.abort();
        const ctl = (ctlYh = new AbortController());
        let v;
        try {
          const r = await fetch("/api/cerca?q=" + encodeURIComponent(testo), { signal: ctl.signal, credentials: "same-origin", headers: { Accept: "application/json" } });
          const d = await r.json().catch(() => null);
          v = r.ok && d && Array.isArray(d.risultati) ? { stato: "ok", risultati: d.risultati } : { stato: "errore" };
        } catch (e) { if (ctl.signal.aborted) return; v = { stato: "errore" }; }
        yh.set(k, v);
        if (yh.size > 60) yh.delete(yh.keys().next().value);
        if (q.value.trim().toLowerCase() === k) mostra();
      }, 350);
    };

    // ---------- l'elenco ----------
    let opzioni = [], attiva = -1, giro = 0, mostrato = null, tIn = 0;
    const idDi = (i) => "tq-o" + i;
    const valore = (o) => (o.valore == null ? "" : o.bp ? G.num(o.valore, 2) + "%" : o.tipo === "strumento" ? G.price(o.rif.sym, o.valore) : G.num(o.valore, o.valore >= 1000 ? 0 : 2));
    const cambio = (o) => (o.cambio == null ? "" : o.bp ? G.signed(o.cambio, 1) + L(" pb", " bp") : G.pct(o.cambio));
    const riga = (o, i, ws) => {
      const v = valore(o), c = cambio(o), su = o.bp ? "" : o.cambio > 0 ? " t-up" : o.cambio < 0 ? " t-down" : "";
      return '<div class="t-o" role="option" id="' + idDi(i) + '" data-i="' + i + '" aria-selected="false">' +
        '<span class="t-o-n">' + G.cerca.segna(o.nome, ws) + "</span>" + (o.sotto ? '<span class="t-o-s">' + esc(o.sotto) + "</span>" : "") +
        (v ? '<span class="t-o-v">' + esc(v) + "</span>" : "") + (c ? '<span class="t-o-c' + su + '">' + esc(c) + "</span>" : "") + "</div>";
    };
    const evidenzia = (i, scorri) => {
      attiva = i;
      lista.querySelectorAll('[aria-selected="true"]').forEach((el) => el.setAttribute("aria-selected", "false"));
      const el = i >= 0 ? $(idDi(i)) : null;
      if (el) {
        el.setAttribute("aria-selected", "true");
        q.setAttribute("aria-activedescendant", el.id);
        if (scorri) el.scrollIntoView({ block: "nearest" });
      } else q.removeAttribute("aria-activedescendant");
    };
    const apri = () => { if (pan.hidden) { pan.hidden = false; q.setAttribute("aria-expanded", "true"); } };
    const chiudi = () => { if (!pan.hidden) { pan.hidden = true; q.setAttribute("aria-expanded", "false"); } evidenzia(-1); };
    const disegna = (r, storie, testo) => {
      const gruppi = ORDINE.map((k) => ({ k, righe: r[k] })).filter((g) => g.righe.length)
        .sort((a, b) => b.righe[0].p - a.righe[0].p || ORDINE.indexOf(a.k) - ORDINE.indexOf(b.k));
      if (storie.length) {
        gruppi.push({ k: "notizie", righe: storie.map((h) => ({ tipo: "notizia", nome: h.r.x.t,
          sotto: G.secLabel(h.r.x.sec) + (h.r.x.d ? " · " + G.cerca.quando(h.r.x.d) : ""), rif: { url: h.r.oggi ? G.storyUrl(h.r.x) : "/s/" + encodeURIComponent(h.r.x.id) } })) });
      }
      // gli altri titoli di Yahoo: senza quelli che GERICO ha già mostrato
      const y = yh.get(testo.toLowerCase()), visti = new Set(r.titoli.concat(r.strumenti).map((o) => String(o.rif.sym).toUpperCase()));
      let attesa = "";
      if (lungo(testo) >= 2) {
        if (!y) attesa = L("Cerco altri titoli su Yahoo Finance…", "Looking for more on Yahoo Finance…");
        else if (y.stato !== "ok") attesa = L("Yahoo Finance non risponde ora: qui ci sono solo i risultati di GERICO.", "Yahoo Finance is not responding right now: these are GERICO's results only.");
        else {
          const righe = y.risultati.filter((x) => x && x.s && !visti.has(String(x.s).toUpperCase())).map((x) => ({ tipo: "yahoo", nome: x.n || x.s,
            sotto: [x.s, x.b, TIPI[x.k] ? L(TIPI[x.k][0], TIPI[x.k][1]) : ""].filter(Boolean).join(" · "), rif: { yahoo: x } }));
          if (righe.length) gruppi.push({ k: "yahoo", righe });
        }
      }
      opzioni = [];
      let html = "";
      gruppi.forEach((g, gi) => {
        html += '<div role="group" class="t-gr" aria-labelledby="tq-g' + gi + '"><div class="t-g" id="tq-g' + gi + '" role="presentation">' + esc(L(GRUPPI[g.k][0], GRUPPI[g.k][1])) + "</div>";
        g.righe.forEach((o) => { html += riga(o, opzioni.length, r.ws); opzioni.push(o); });
        html += "</div>";
      });
      lista.innerHTML = html;
      attiva = -1;
      q.removeAttribute("aria-activedescendant");
      const n = opzioni.length;
      nota.textContent = n ? (n === 1 ? L("Un risultato.", "One result.") : n + L(" risultati.", " results.")) : attesa ? "" : L("Nessun risultato: prova con un altro nome o con il simbolo.", "No results: try another name or the symbol.");
      nota.classList.toggle("sr-only", n > 0);
      notaY.textContent = attesa;
      notaY.hidden = !attesa;
      mostrato = testo;
    };
    const mostra = async () => {
      const mio = ++giro, testo = q.value.trim();
      clearTimeout(tIn);
      if (!testo) { chiudi(); lista.innerHTML = ""; opzioni = []; mostrato = null; return; }
      const [ix, storie] = await Promise.all([carica(), notizie(testo)]);
      if (mio !== giro) return;
      disegna(G.ricercaTrova(ix, testo), storie, testo);
      if (document.activeElement === q) apri();
      chiediYahoo(testo);
    };

    // ---------- scegliere ----------
    const vai = (url) => (G.go ? G.go(url) : (location.href = url));
    const scegli = (i) => {
      const o = opzioni[i];
      if (!o) return;
      chiudi();
      q.value = "";
      mostrato = null;
      q.blur();
      const r = o.rif;
      if (o.tipo === "titolo") azioni.titolo(r.code, r.sym);
      else if (o.tipo === "strumento") azioni.strumento(r.sym);
      else if (o.tipo === "societa") azioni.comando(r.so === "cedole" ? "CEDOLE" : "TRIMESTRALI");
      else if (o.tipo === "agenda") azioni.comando("AGENDA");
      else if (o.tipo === "sezione") azioni.comando(r.cmd);
      else if (o.tipo === "glossario") vai("glossario#" + encodeURIComponent(r.gl));
      else if (o.tipo === "notizia") vai(r.url);
      else if (o.tipo === "yahoo") azioni.yahoo(r.yahoo);
    };

    P.on(q, "input", () => { clearTimeout(tIn); tIn = setTimeout(mostra, 60); });
    P.on(q, "focus", () => { carica(); if (q.value.trim()) mostra(); });
    P.on(form, "pointerdown", () => { carica(); });
    P.on(form, "submit", (e) => e.preventDefault());
    P.on(q, "keydown", async (e) => {
      if (e.isComposing) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (pan.hidden) { if (q.value.trim()) mostra(); return; }
        const n = opzioni.length;
        if (n) evidenzia(e.key === "ArrowDown" ? (attiva + 1) % n : attiva <= 0 ? n - 1 : attiva - 1, true);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const testo = q.value.trim();
        if (!testo) return;
        // scritto e subito Invio: prima i risultati di quel testo, poi il primo
        if (mostrato !== testo) { await mostra(); if (q.value.trim() === testo) scegli(0); }
        else scegli(attiva >= 0 ? attiva : 0);
      } else if (e.key === "Escape") {
        if (!pan.hidden) { e.preventDefault(); e.stopPropagation(); chiudi(); }
        else if (q.value) { e.preventDefault(); q.value = ""; mostrato = null; }
      } else if (e.key === "Tab") chiudi();
    });
    // il fuoco resta nel campo mentre si sceglie con il mouse o con il dito
    P.on(pan, "mousedown", (e) => e.preventDefault());
    P.on(lista, "click", (e) => { const o = e.target.closest("[role=option]"); if (o) scegli(+o.dataset.i); });
    P.on(lista, "mousemove", (e) => { const o = e.target.closest("[role=option]"); if (o && +o.dataset.i !== attiva) evidenzia(+o.dataset.i, false); });
    P.on(document, "pointerdown", (e) => { if (!form.contains(e.target)) chiudi(); }, true);
    P.on(form, "focusout", (e) => { if (!form.contains(e.relatedTarget)) chiudi(); });
    // «/» porta al campo (prima della ricerca delle notizie, che nel Terminal non si apre con il tasto)
    P.on(window, "keydown", (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      q.focus();
      q.select();
    }, true);
    P.on(mq, "change", () => { chiudi(); metti(); });
    P.add(() => { clearTimeout(tIn); clearTimeout(tYh); if (ctlYh) ctlYh.abort(); });
    metti();
  };
})();
