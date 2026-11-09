/* GERICO: funzioni comuni a tutte le pagine. Nessuna dipendenza esterna. */
(function () {
  "use strict";
  const G = (window.G = {});

  // ---------- memoria del browser (solo preferenze, nessun cookie) ----------
  G.ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage non disponibile */ } }
  };

  G.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  G.safeUrl = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
  G.cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

  // ---------- lingua: italiano o inglese ----------
  // si sceglie nel menu (o con ?lang=en nell'indirizzo) e resta per le visite dopo. I testi dell'interfaccia stanno nelle
  // chiamate G.L(italiano, inglese) e, per le pagine e i nomi fissi, nel dizionario EN qui sotto. I contenuti arrivano
  // tradotti da scripts/traduci.py (data/tr/en.json e data/tr/it.json), applicati in G.load
  G.lang = (() => {
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q === "en" || q === "it") localStorage.setItem("gerico.lang", JSON.stringify(q));
    } catch (e) { /* niente */ }
    return G.ls.get("gerico.lang", "it") === "en" ? "en" : "it";
  })();
  G.en = G.lang === "en";
  G.L = (it, en) => (G.en ? en : it);
  document.documentElement.lang = G.lang;
  const EN = {
    // pagine
    "GERICO · Le notizie del giorno, scritte su tutte le fonti": "GERICO · The day's news, written from every source",
    "GERICO Terminal · I mercati a colpo d'occhio": "GERICO Terminal · Markets at a glance",
    "Una storia · GERICO": "A story · GERICO", "Come funziona · GERICO": "How it works · GERICO", "Privacy · GERICO": "Privacy · GERICO",
    "Pagina non trovata · GERICO": "Page not found · GERICO",
    "Vai alle notizie": "Skip to the news", "Vai alla storia": "Skip to the story", "Vai alla mappa": "Skip to the map", "Vai al testo": "Skip to the text",
    "GERICO, prima pagina": "GERICO, front page", "Oggi": "Today", "Notizie o Terminal": "News or Terminal", "Notizie": "News",
    "Menu": "Menu", "Ultim'ora": "Latest", "Ferma lo scorrimento": "Pause the ticker", "Chiudi il menu": "Close the menu", "Pagine": "Pages",
    "Come funziona": "How it works", "Tema": "Theme", "Chiaro": "Light", "Scuro": "Dark", "Testo": "Text", "Normale": "Normal",
    "Grande": "Large", "Molto grande": "Very large", "Lingua": "Language", "Ascolta il riepilogo": "Listen to the briefing",
    "Il riepilogo di oggi": "Today's briefing", "Notizie e mercati, con l'aggiornamento di oggi": "News and markets, from today's update",
    "Mercati": "Markets", "Apri il Terminal": "Open the Terminal", "Sezioni": "Sections", "Carico l'edizione…": "Loading the edition…",
    "Nessun consiglio di investimento": "Not investment advice", "Prima pagina": "Front page", "Condividi": "Share",
    "Carico la storia…": "Loading the story…", "Fonti e temi": "Sources and topics", "Sezioni del Terminal": "Terminal sections",
    "Mappa": "Map", "Indici": "Indices", "Valute": "Currencies", "Tassi": "Rates", "Materie prime": "Commodities", "Agenda": "Calendar",
    "Macro": "Macro", "Sentiment": "Sentiment", "Titoli": "Stocks", "Vai a": "Go to", "Vai": "Go",
    "mappa europa, eurusd, oro, macro…": "europe map, eurusd, gold, macro…",
    "GERICO Terminal: mercati e agenda": "GERICO Terminal: markets and calendar", "Mappa dei mercati": "Market map",
    "Vista della mappa": "Map view", "Mondo": "World", "Europa": "Europe",
    "Ogni quadrato è una Borsa: più è grande, più pesa nell'indice mondiale MSCI ACWI.": "Each square is a stock market: the bigger it is, the more it weighs in the MSCI ACWI world index.",
    "Tocca un quadrato per vedere il dettaglio.": "Tap a square to see the details.", "Tassi a 10 anni": "10-year yields",
    "Agenda di oggi": "Today's calendar", "Prezzi e grafici": "Prices and charts", "Gruppo di strumenti": "Instrument group",
    "Prezzi in diretta": "Live prices", "Nascondi i prezzi in diretta": "Hide live prices",
    "Dal widget gratuito di TradingView, con ritardi diversi per mercato. Si carica solo se lo chiedi e usa cookie di TradingView.": "From TradingView's free widget, with different delays for each market. It loads only if you ask, and uses TradingView cookies.",
    "Notizie sui mercati": "Market news", "Tono delle notizie": "News tone", "Titoli da seguire": "Stocks to watch",
    "Un segnale sui prezzi e una notizia che possono muoverli nei prossimi giorni.": "A price signal and a news item that could move them in the coming days.",
    "Macro: Stati Uniti ed eurozona": "Macro: United States and euro area", "Documenti SEC": "SEC filings",
    "Questa pagina non c'è.": "This page doesn't exist.", "Forse la storia è stata archiviata.": "The story may have been archived.",
    "Torna alla prima pagina": "Back to the front page", "Navigazione": "Navigation", "Ascolta": "Listen",
    // aree, paesi, temi
    "Italia": "Italy", "Stati Uniti": "United States", "Medio Oriente": "Middle East", "Ucraina e Russia": "Ukraine and Russia", "Oceania": "Oceania",
    "Giappone": "Japan", "Regno Unito": "United Kingdom", "Corea del Sud": "South Korea", "Cina": "China", "Francia": "France",
    "Svizzera": "Switzerland", "Germania": "Germany", "Paesi Bassi": "Netherlands", "Brasile": "Brazil", "Spagna": "Spain",
    "Arabia Saudita": "Saudi Arabia", "Emirati Arabi Uniti": "United Arab Emirates", "Israele": "Israel", "Ucraina": "Ukraine",
    "Polonia": "Poland", "Nuova Zelanda": "New Zealand", "America Latina": "Latin America", "Cisgiordania": "West Bank",
    "Banche": "Banks", "Cybersicurezza": "Cybersecurity", "Elezioni": "Elections", "Ferrovie": "Railways",
    "Intelligenza artificiale": "Artificial intelligence", "Petrolio": "Oil", "Politica": "Politics", "Sicurezza": "Security",
    "Terrorismo": "Terrorism", "Titoli di Stato": "Government bonds", "Trasporto aereo": "Air travel", "Energia": "Energy",
    "Conti pubblici": "Public finances", "BCE": "ECB", "Dazi": "Tariffs", "Tecnologia": "Technology", "Economia": "Economy",
    // tipi di fonte
    "agenzia": "news agency", "giornale": "newspaper", "giornale online": "online newspaper", "online": "online", "quotidiano": "daily", "tv": "TV",
    // strumenti e gruppi
    "Azioni": "Shares", "Cripto": "Crypto", "Tassi Usa": "US rates", "Indice del dollaro": "Dollar index", "Oro": "Gold",
    "Argento": "Silver", "Rame": "Copper", "Gas TTF": "TTF gas", "Gas Henry Hub": "Henry Hub gas", "Wti": "WTI",
    "Treasury 3 mesi": "3-month Treasury", "Treasury 5 anni": "5-year Treasury", "Treasury 10 anni": "10-year Treasury",
    "Treasury 30 anni": "30-year Treasury", "Btp 10 anni": "10-year BTP", "Bund 10 anni": "10-year Bund", "Oat 10 anni": "10-year OAT",
    "Spread Btp-Bund": "BTP-Bund spread", "Borsa Usa": "US stocks", "Dollaro": "Dollar", "Nikkei 225 (Tokyo)": "Nikkei 225 (Tokyo)"
  };
  G.tn = (s) => (G.en && s && Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : s);
  // le scritte fisse delle pagine (intestazione, menu, titoli dei pannelli): in inglese dal dizionario. I blocchi lunghi
  // (Come funziona, Privacy) hanno le due versioni nella pagina, con data-only="it" e data-only="en"
  G.i18nStatic = (root) => {
    if (!G.en || !root) return;
    const skip = "script, style, [translate='no'], [data-only='it'], [lang='it']";
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest(skip) ? 2 : 1) });
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((n) => { const t = n.nodeValue.trim(); if (t && Object.prototype.hasOwnProperty.call(EN, t)) n.nodeValue = n.nodeValue.replace(t, EN[t]); });
    root.querySelectorAll("[aria-label], [placeholder], [title]").forEach((el) => {
      if (el.closest(skip)) return;
      ["aria-label", "placeholder", "title"].forEach((a) => { const v = el.getAttribute(a); if (v && Object.prototype.hasOwnProperty.call(EN, v)) el.setAttribute(a, EN[v]); });
    });
    if (Object.prototype.hasOwnProperty.call(EN, document.title)) document.title = EN[document.title];
  };
  // un numero scritto all'italiana nei dati («4,33%», «50.053», «107 pb»), in inglese: «4.33%», «50,053», «107 bp»
  G.numText = (v) => (!G.en || !v ? v : String(v).replace(/\d[\d.,]*\d/g, (m) => m.replace(/[.,]/g, (c) => (c === "." ? "," : "."))).replace(/(\d) pb\b/g, "$1 bp"));

  // impronta di un testo (cyrb53, la stessa di scripts/traduci.py): la chiave delle traduzioni
  G.hash = (str) => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  // quali campi di quali file si traducono: in inglese i testi della redazione, in italiano i titoli che arrivano in inglese
  // (calendario di Forex Factory, notizie di Yahoo Finance per il tono). Un testo non ancora tradotto resta com'è
  const TR = {
    en: {
      edition: ["title", "summary", "article", "view", "change", "open", "text", "point", "says", "angle", "label"],
      brevi: ["title"], markets: ["summary", "label", "note", "why"], agenda: ["event", "note"], terminal: ["label", "note"],
      titoli: ["why", "risk", "signal", "note"]
    },
    it: { calendario: ["title"], sentiment: ["title"] }
  };
  const translate = (data, map, keys) => {
    const want = new Set(keys);
    const tr = (s) => { const k = typeof s === "string" && s ? map[G.hash(s)] : null; return typeof k === "string" ? k : s; };
    const walk = (o, key) => {
      if (Array.isArray(o)) return o.map((x) => (typeof x === "string" ? (want.has(key) ? tr(x) : x) : walk(x, key)));
      if (!o || typeof o !== "object") return o;
      const out = {};
      Object.keys(o).forEach((k) => { const v = o[k]; out[k] = typeof v === "string" ? (want.has(k) ? tr(v) : v) : walk(v, k); });
      return out;
    };
    const out = walk(data, "");
    // le storie non ancora tradotte si segnano: la pagina dice che sono in italiano
    if (out && Array.isArray(out.stories)) {
      const mark = (list, orig) => (list || []).forEach((s, i) => { if (orig[i] && s.title === orig[i].title) s.untranslated = true; });
      mark(out.stories, data.stories);
      mark(out.archive, data.archive || []);
    }
    return out;
  };

  // ---------- dati ----------
  // passando da una pagina all'altra senza ricaricare, gli stessi dati servono di nuovo: per un minuto si riusano.
  // Dopo, fino a dieci minuti, si usano subito quelli in mano e intanto si chiedono quelli nuovi per la volta dopo:
  // il passaggio di pagina non aspetta mai la rete del telefono. Oltre, si aspettano i dati nuovi.
  // fresh = true li riscarica comunque (per esempio per vedere se è uscita un'edizione nuova)
  const memo = {};
  const fetchData = async (name) => {
    try {
      const r = await fetch("data/" + name + ".json", { cache: "no-cache" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  };
  // i file con testi da tradurre passano dalla mappa della lingua (data/tr/<lingua>.json); il risultato si tiene per
  // lo stesso oggetto, così le pagine che lo chiedono di nuovo non rifanno il lavoro
  const done = new WeakMap();
  G.load = (name, fresh) => {
    const keys = (TR[G.lang] || {})[name];
    const p = loadRaw(name, fresh);
    if (!keys) return p;
    return Promise.all([p, loadRaw("tr/" + G.lang)]).then(([d, m]) => {
      if (!d || !m || typeof m !== "object") return d;
      if (!done.has(d)) done.set(d, translate(d, m, keys));
      return done.get(d);
    });
  };
  const loadRaw = (name, fresh) => {
    const hit = memo[name], age = hit ? Date.now() - hit.t : Infinity;
    if (!fresh && hit && age < 60000) return hit.p;
    if (!fresh && hit && hit.ok && age < 600000) {
      if (!hit.next) {
        hit.next = fetchData(name).then((d) => {
          if (memo[name] === hit) { if (d !== null) memo[name] = { p: Promise.resolve(d), t: Date.now(), ok: true }; else hit.next = null; }
        });
      }
      return hit.p;
    }
    const p = fetchData(name), entry = { p, t: Date.now(), ok: false };
    memo[name] = entry;
    p.then((d) => { if (memo[name] !== entry) return; if (d === null) delete memo[name]; else entry.ok = true; });
    return p;
  };
  // i dati delle pagine principali (pochi kB) si tengono pronti a pagina ferma: andando da una all'altra non si aspetta
  // la rete. Con il risparmio dati attivo no
  const WARM = ["edition", "markets", "quotes", "agenda", "calendario", "brevi", "audio", "terminal", "weights", "titoli", "titoli-storico", "indici/elenco"];
  let warmT = 0;
  G.warmData = () => {
    if (navigator.connection && navigator.connection.saveData) return;
    clearTimeout(warmT);
    warmT = setTimeout(() => {
      const run = () => WARM.forEach((n) => G.load(n));
      if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 4000 }); else run();
    }, 1500);
  };

  // ---------- date e ore, sempre a Roma ----------
  const TZ = "Europe/Rome", LOC = G.en ? "en-GB" : "it-IT";
  const fHM = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
  const fDay = new Intl.DateTimeFormat(LOC, { day: "numeric", month: "short", timeZone: TZ });
  const fDayLong = new Intl.DateTimeFormat(LOC, { day: "numeric", month: "long", timeZone: TZ });
  const fWeek = new Intl.DateTimeFormat(LOC, { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  const fLong = new Intl.DateTimeFormat(LOC, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  const fKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
  const valid = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d; };
  G.hm2 = (iso) => { const d = valid(iso); return d ? fHM.format(d) : ""; };
  G.hm = (iso) => G.hm2(iso).replace(/^0(\d)/, "$1");
  G.day = (iso) => { const d = valid(iso); return d ? fDay.format(d).replace(".", "") : ""; };
  G.longDay = (iso) => { const d = valid(iso); return d ? fLong.format(d) : ""; };
  G.dayKey = (d) => fKey.format(d);
  G.isToday = (iso) => { const d = valid(iso); return !!d && G.dayKey(d) === G.dayKey(new Date()); };
  // quanti giorni di calendario (a Roma) fa: 0 oggi, 1 ieri
  const utcDay = (key) => { const p = key.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  G.dayAge = (iso) => { const d = valid(iso); return d ? Math.round((utcDay(G.dayKey(new Date())) - utcDay(G.dayKey(d))) / 864e5) : Infinity; };
  const fWd = new Intl.DateTimeFormat(LOC, { weekday: "long", timeZone: TZ });
  G.weekday = (iso) => { const d = valid(iso); return d ? fWd.format(d) : ""; };
  G.hoursAgo = (iso) => { const d = valid(iso); return d ? (Date.now() - d.getTime()) / 3600000 : Infinity; };
  G.dayOnly = (ymd) => { const d = valid(String(ymd).slice(0, 10) + "T12:00:00Z"); return d ? fDay.format(d).replace(".", "") : ""; };
  G.when = (iso) => {
    const d = valid(iso); if (!d) return "";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return G.L("adesso", "just now");
    if (mins < 60) return mins + G.L(" min fa", " min ago");
    if (G.isToday(iso)) return G.L("alle ", "at ") + G.hm(iso);
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (G.dayKey(d) === G.dayKey(y)) return G.L("ieri alle ", "yesterday at ") + G.hm(iso);
    return G.L("il " + G.day(iso) + " alle ", "on " + G.day(iso) + " at ") + G.hm(iso);
  };
  // etichetta dei dati di mercato: «ieri», «stamattina» o «venerdì» valgono solo se i dati sono di oggi
  const RELATIVE = /ieri|oggi|stamattina|stasera|metà giornata|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|yesterday|today|this morning|tonight|midday|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i;
  G.mkWhen = (m) => {
    const label = G.cap((m && m.label) || ""), asOf = m && m.asOf;
    if (!asOf || !valid(asOf)) return label;
    if (G.isToday(asOf) || !RELATIVE.test(label)) return (label ? label + ", " : G.L("Dati ", "Data ")) + G.when(asOf);
    return G.en ? "Data from " + (G.dayAge(asOf) === 1 ? "yesterday" : G.day(asOf)) + ", " + G.hm(asOf)
      : "Dati " + (G.dayAge(asOf) === 1 ? "di ieri" : "del " + G.day(asOf)) + ", ore " + G.hm(asOf);
  };
  G.romeNow = () => {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), min: (Number(p.hour) % 24) * 60 + Number(p.minute), hm: (p.hour % 24).toString().padStart(2, "0") + ":" + p.minute };
  };
  // il sito si aggiorna verso le 7:30 e le 13:30 (notizie e mercati) e verso le 18:20 nei giorni feriali (solo i mercati):
  // ogni giro pubblica da solo appena ha finito.
  // newsOnly: il prossimo aggiornamento delle notizie
  G.nextUpdate = (newsOnly) => {
    const now = G.romeNow();
    const names = G.en ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] : ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
    const slots = (d) => (newsOnly || d === 0 || d === 6 ? [450, 810] : [450, 810, 1100]);
    for (let k = 0; k < 8; k++) {
      const d = (now.wd + k) % 7;
      for (const m of slots(d)) {
        if (k === 0 && m <= now.min) continue;
        const label = k === 0 ? G.L("oggi", "today") : k === 1 ? G.L("domani", "tomorrow") : names[d];
        return label + G.L(" alle ", " at ") + Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
      }
    }
    return "";
  };

  // riga dell'edizione nell'intestazione: lunga sul computer, corta sul telefono
  G.setEdition = (iso) => {
    const el = document.getElementById("edition-line");
    const d = valid(iso);
    if (!el || !d) return;
    el.innerHTML = '<span class="ed-l">' + G.esc(G.cap(fWeek.format(d))) + G.L(" · edizione delle ", " · edition of ") + G.esc(G.hm(iso)) + "</span>" +
      '<span class="ed-s">' + G.esc(fDayLong.format(d)) + G.L(", ore ", ", ") + G.esc(G.hm(iso)) + "</span>";
  };

  // ---------- numeri ----------
  const nf2 = new Intl.NumberFormat(LOC, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");
  G.pct = (v) => sign(v) + nf2.format(Math.abs(v)) + "%";
  G.pctBare = (v) => sign(v) + nf2.format(Math.abs(v));
  const dec = (v) => (G.en ? String(Math.abs(v)) : String(Math.abs(v)).replace(".", ","));
  G.bps = (v) => sign(v) + dec(v) + G.L(" pb", " bp");
  G.bpsLong = (v) => sign(v) + dec(v) + (Math.abs(v) === 1 ? G.L(" punto base", " basis point") : G.L(" punti base", " basis points"));
  G.wt = (v) => nf2.format(v) + "%";
  G.move = (it) => (typeof it.chg === "number" ? G.pct(it.chg) : typeof it.bp === "number" ? G.bps(it.bp) : "");
  // per i titoli di Stato un rendimento che sale è un prezzo che scende: va in rosso
  G.tone = (it, cls) => {
    const v = typeof it.bp === "number" ? (cls === "obbligazioni" ? -it.bp : it.bp) : it.chg;
    return typeof v !== "number" || v === 0 ? "" : v > 0 ? "up" : "down";
  };
  G.size = (it) => (typeof it.chg === "number" ? Math.abs(it.chg) : typeof it.bp === "number" ? Math.abs(it.bp) / 10 : -1);
  G.cleanValue = (v) => (v && v !== "—" && v !== "-" ? G.numText(v) : "");
  G.shortName = (n) => String(n || "").replace(/\s*\([^)]*\)/g, "").trim();
  // numeri con un numero fisso di decimali; i prezzi dei cambi con 4 (lo yen con 2), i numeri grandi in forma corta senza decimali
  const nfd = {};
  G.num = (v, d) => (nfd[d] || (nfd[d] = new Intl.NumberFormat(LOC, { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
  G.price = (sym, v, compact) => G.num(v, /=X$/.test(sym) && !/JPY/.test(sym) ? 4 : compact && Math.abs(v) >= 1000 ? 0 : 2);
  G.signed = (v, d) => sign(v) + G.num(Math.abs(v), d);
  // grafico a linea in SVG, senza librerie: area leggera sotto la linea solo se richiesta
  G.spark = (vals, w, h, cls, area) => {
    const v = (vals || []).filter((x) => typeof x === "number" && isFinite(x));
    if (v.length < 2) return "";
    let lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pts = v.map((x, i) => (1 + (i * (w - 2)) / (v.length - 1)).toFixed(1) + "," + (h - 1.5 - ((x - lo) / (hi - lo)) * (h - 3)).toFixed(1));
    const fill = area ? '<polygon points="1,' + h + " " + pts.join(" ") + " " + (w - 1) + "," + h + '" fill="currentColor" opacity="0.12"/>' : "";
    return '<svg class="' + cls + '" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + fill +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
  };

  // ---------- accordo tra le testate ----------
  // si contano le testate, non gli articoli: con più articoli della stessa testata vale il più recente
  const outletKey = (s) => G.shortName(s && s.name).toLowerCase().replace(/\s+/g, " ");
  G.outlets = (src) => {
    const by = new Map();
    (src || []).forEach((s, i) => {
      if (!s) return;
      const k = outletKey(s) || "#" + i;
      const t = Date.parse(s.at || s.date || "") || 0;
      const prev = by.get(k);
      if (!prev || t > prev.t) by.set(k, { s, t });
    });
    return Array.from(by.values()).map((x) => x.s);
  };
  // quante fonti ha l'articolo: «8 fonti». Sono le testate lette per scriverlo, non un voto su chi ha ragione
  G.srcCount = (src) => { const n = G.outlets(src).length; return n ? (n === 1 ? G.L("1 fonte", "1 source") : n + G.L(" fonti", " sources")) : ""; };
  // il testo dell'articolo in paragrafi (separati da una riga vuota)
  G.paras = (txt) => String(txt || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // una prima pagina o una pagina di sezione: domani dirà altro, quindi non prova niente
  G.isFrontPage = (u) => {
    try {
      const x = new URL(u);
      const path = x.pathname.replace(/\/+$/, "");
      const segs = path.split("/").filter(Boolean);
      if (!segs.length) return true;
      const last = segs[segs.length - 1];
      if (/^(index|default|home)(\.\w+)?$/i.test(last)) return true;
      if (!/\d/.test(path) && !/-/.test(last) && /\.s?html?$/i.test(last)) return true;
      return segs.length <= 2 && !/\d/.test(path) && (last.match(/-/g) || []).length <= 2;
    } catch (e) { return false; }
  };
  // ---------- storie ----------
  G.SECTIONS = G.en ? { mondo: "World", italia: "Italy", economia: "Economy", mercati: "Markets", tecnologia: "Technology" }
    : { mondo: "Mondo", italia: "Italia", economia: "Economia", mercati: "Mercati", tecnologia: "Tecnologia" };
  G.secLabel = (k) => G.SECTIONS[k] || G.L("Notizie", "News");
  G.storyUrl = (s) => "storia.html?id=" + encodeURIComponent(s.id);
  // la firma di tutti gli articoli: R.P. Gli articoli li scrive l'intelligenza artificiale sulle fonti elencate, e accanto
  // alla firma si dice (AI Act, articolo 50: i testi d'informazione generati con l'IA si dichiarano)
  G.FIRMA = "R.P.";
  G.desk = () => G.FIRMA;
  // la firma breve delle schede: la redazione e «IA» (per chi non vede, per esteso)
  G.cardBy = (s) => '<p class="c-by"><span class="c-desk">' + G.esc(G.desk(s.section)) + '</span><span class="c-ia" title="' +
    G.L("Scritto con l'intelligenza artificiale", "Written with artificial intelligence") + '"><span aria-hidden="true">' + G.L("IA", "AI") +
    '</span><span class="sr-only">' + G.L(", scritto con l'intelligenza artificiale", ", written with artificial intelligence") + "</span></span></p>";
  // l'immagine della storia: la mappa del luogo, disegnata da GERICO (scripts/mappe.py), con il luogo scritto sopra.
  // Solo file del sito (img/storie/...): niente immagini da altri siti
  const PIN = '<svg aria-hidden="true" width="10" height="13" viewBox="0 0 10 13"><path d="M5 0a5 5 0 0 0-5 5c0 3.6 5 8 5 8s5-4.4 5-8a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor"/></svg>';
  G.storyImg = (s, o) => {
    const im = s && s.img;
    if (!im || typeof im.src !== "string" || !/^img\/storie\/[\w.-]+\.svg(\?v=\w+)?$/.test(im.src)) return "";
    o = o || {};
    return '<figure class="media' + (o.cls ? " " + o.cls : "") + '"><img src="' + G.esc(im.src) + '" alt="" width="640" height="360" decoding="async"' +
      (o.eager ? ' fetchpriority="high"' : ' loading="lazy"') + ">" +
      (o.cap !== false && im.label ? '<figcaption class="m-cap">' + PIN + "<span>" + G.esc(im.label) + "</span></figcaption>" : "") + "</figure>";
  };
  // le immagini compaiono con una dissolvenza quando sono arrivate (quelle già pronte subito)
  G.showImgs = (root) => {
    (root || document).querySelectorAll(".media img:not(.in)").forEach((img) => {
      if (img.complete && img.naturalWidth) img.classList.add("in");
      else img.addEventListener("load", () => img.classList.add("in"), { once: true });
    });
  };

  // titolo da mostrare: i titoli vecchi sono lunghi come riassunti, si tiene la parte prima del punto e virgola
  G.headline = (s) => {
    const t = String((s && s.title) || "").trim();
    if (t.length <= 80) return t;
    const semi = t.indexOf(";");
    if (semi >= 20) return t.slice(0, semi).trim();
    const cut = t.lastIndexOf(" ", 78);
    return t.slice(0, cut > 40 ? cut : 78).replace(/[,:]$/, "") + "…";
  };
  // una novità vera: c'è un testo di novità che non è la prima notizia e la storia ha almeno due passaggi
  G.realChange = (s) => !!s.change && !/^prima notizia/i.test(s.change.trim()) && (s.history || []).length >= 2;
  // «Aggiornata alle 13:10» solo se la storia è cambiata dopo il primo giro del giorno
  G.firstRunToday = (stories) => {
    const t = (stories || []).filter((s) => G.isToday(s.updated)).map((s) => new Date(s.updated).getTime());
    return t.length ? Math.min.apply(null, t) : null;
  };
  G.updatedLabel = (s, firstRun) => {
    if (!s.updated || !G.isToday(s.updated) || !firstRun || !G.realChange(s)) return "";
    return new Date(s.updated).getTime() - firstRun > 60 * 60000 ? G.L("Aggiornata alle ", "Updated at ") + G.hm(s.updated) : "";
  };
  // le prime frasi intere che stanno in max caratteri (niente lookbehind: va anche su Safari vecchi)
  G.firstSentences = (text, max) => {
    const t = String(text || "");
    const re = /[.!?»]\s+/g;
    let out = "", last = 0, m;
    while ((m = re.exec(t))) {
      const piece = t.slice(last, m.index + 1);
      if ((out + " " + piece).trim().length > max && out) return out;
      out = (out + " " + piece).trim();
      last = re.lastIndex;
    }
    const rest = t.slice(last);
    if (!out || (out + " " + rest).trim().length <= max) out = (out + " " + rest).trim();
    return out;
  };

  // ---------- pannelli che si aprono e si chiudono ----------
  // il pulsante ha aria-expanded e aria-controls; il pannello ha la classe collapse
  // l'altezza si anima in CSS dove c'è interpolate-size; altrimenti la misura lo script
  const autoHeight = !!(window.CSS && CSS.supports && CSS.supports("interpolate-size", "allow-keywords"));
  G.toggle = (btn, open) => {
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    if (!panel) return false;
    if (open === undefined) open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    panel.inert = !open;
    if (autoHeight || G.reduced()) { panel.classList.toggle("open", open); return open; }
    const from = panel.getBoundingClientRect().height;
    panel.classList.toggle("open", open);
    const to = open ? panel.scrollHeight : 0;
    panel.style.height = from + "px";
    void panel.offsetHeight;
    panel.style.height = to + "px";
    const end = (e) => {
      if (e && (e.target !== panel || e.propertyName !== "height")) return;
      panel.style.height = "";
      panel.removeEventListener("transitionend", end);
    };
    panel.addEventListener("transitionend", end);
    setTimeout(end, 400);
    return open;
  };

  // ---------- avviso breve in basso («Link copiato») ----------
  G.toast = (msg) => {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("on"));
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("on"), 2200);
  };

  // ---------- temi seguiti ----------
  G.follows = () => G.ls.get("gerico.follows", []);
  G.toggleFollow = (t) => {
    const f = G.follows();
    const n = f.includes(t) ? f.filter((x) => x !== t) : f.concat(t);
    G.ls.set("gerico.follows", n);
    return n;
  };

  // ---------- menu, tema e dimensione del testo ----------
  G.isDark = () => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t) return t === "dark";
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  };
  G.reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // righe che scorrono di lato: sfumatura a destra solo se c'è altro da vedere
  G.watchRow = (row) => {
    if (!row || row._fade) return;
    row._fade = () => row.classList.toggle("has-more", row.scrollWidth - row.clientWidth - row.scrollLeft > 4);
    row.addEventListener("scroll", row._fade, { passive: true });
    row._fade();
  };

  // controllo segmentato: un indicatore scivola sotto la scelta attiva.
  // Si animano solo transform e opacity: per la larghezza si usa FLIP (si parte scalati e si torna a scala 1).
  // dove portare il binario perché una scheda (x, w) stia al centro, senza andare oltre i bordi
  const segCenter = (box, x, w) => Math.max(0, Math.min(box.scrollWidth - box.clientWidth, Math.round(x + w / 2 - box.clientWidth / 2)));
  // colori dei nomi delle schede durante lo swipe: «rgb(…)» in numeri, una via di mezzo, e via i colori messi a mano
  const rgb = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const v = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return v.length >= 3 && v.every((n) => !isNaN(n)) ? [v[0], v[1], v[2], v.length > 3 ? v[3] : 1] : null;
  };
  const mixRGB = (x, y, p) => "rgba(" + [0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * p)).join(", ") + ", " + (x[3] + (y[3] - x[3]) * p).toFixed(3) + ")";
  const untint = (box) => box.querySelectorAll(":scope > a, :scope > button").forEach((el) => { el.style.color = ""; el.style.transition = ""; });
  G.seg = (box, instant) => {
    if (!box) return;
    let ind = box.querySelector(":scope > .seg-ind");
    if (!ind) {
      ind = document.createElement("span");
      ind.className = "seg-ind";
      ind.setAttribute("aria-hidden", "true");
      box.prepend(ind);
    }
    const on = box.querySelector(':scope > [aria-current="page"], :scope > [aria-current="true"], :scope > [aria-pressed="true"]');
    if (!on || !on.offsetWidth) { ind.style.opacity = "0"; ind._pos = null; return; }
    const x = on.offsetLeft, w = on.offsetWidth, prev = ind._pos, followed = !!ind._follow;
    ind.style.opacity = "";
    if (ind._follow) {
      // l'indicatore arriva da uno swipe (scala e transizione proprie): si mette al suo posto così com'è
      ind._follow = false;
      untint(box);
      ind.style.transition = "none";
      ind.style.width = w + "px";
      ind.style.transform = "translateX(" + x + "px)";
      void ind.offsetWidth;
      ind.style.transition = "";
      instant = true;
    }
    ind.style.width = w + "px";
    if (prev && !instant && !G.reduced() && (prev.x !== x || prev.w !== w)) {
      ind.style.transition = "none";
      ind.style.transform = "translateX(" + prev.x + "px) scaleX(" + (prev.w / w).toFixed(4) + ")";
      void ind.offsetWidth;
      ind.style.transition = "";
    }
    ind.style.transform = "translateX(" + x + "px)";
    ind._pos = { x, w };
    box.classList.add("ready");
    // se il binario scorre, la scelta attiva va al centro (le vicine restano in vista ai due lati), come le schede di iOS.
    // Dopo uno swipe il binario l'ha già portata lì G.segFollow, insieme alla pagina: qui non si tocca
    if (box.scrollWidth > box.clientWidth + 1 && !followed) {
      const to = segCenter(box, x, w);
      if (Math.abs(to - box.scrollLeft) > 1) box.scrollTo({ left: to, behavior: instant || !prev || G.reduced() ? "auto" : "smooth" });
    }
    G.watchRow(box);
    box._fade();
  };

  // intestazione: la riga sottile e il titolo piccolo compaiono quando il titolo grande passa sotto
  let topObs = null;
  G.watchTop = () => {
    if (topObs) { topObs.disconnect(); topObs = null; }
    document.documentElement.classList.remove("scrolled");
    const top = document.querySelector(".top");
    if (!top || !window.IntersectionObserver) return;
    let target = document.getElementById("large-title"), margin = "-" + top.offsetHeight + "px 0px 0px 0px";
    if (!target) {
      target = document.createElement("div");
      target.className = "top-sentinel";
      target.setAttribute("aria-hidden", "true");
      document.body.prepend(target);
      margin = "0px";
    }
    topObs = new IntersectionObserver(([e]) => {
      const on = !e.isIntersecting && e.boundingClientRect.top < top.offsetHeight;
      top.classList.toggle("scrolled", on);
      document.documentElement.classList.toggle("scrolled", on);
    }, { rootMargin: margin });
    topObs.observe(target);
  };

  // intro: alla prima apertura del sito in questa scheda il nome GERICO compare al centro, resta un momento e va al suo posto.
  // Finché la scheda resta aperta non si rivede (memoria di sessione). Con «riduci movimento» non c'è.
  // Solo transform e opacity con curve cubic-bezier: Safari le anima da solo, anche mentre la pagina sotto si sta disegnando.
  const afterIntro = [];
  // ciò che deve entrare in scena (mappa, numeri) aspetta che lo schermo dell'intro si apra
  G.afterIntro = (fn) => {
    const c = document.documentElement.classList;
    if (c.contains("intro-run") && !c.contains("intro-open")) afterIntro.push(fn); else fn();
  };
  // entrata: a ogni nuova apertura del sito (una volta per scheda) il nome GERICO compare al centro, il tratto
  // dell'evidenziatore lo attraversa, il nome va al suo posto in alto e le notizie salgono a cascata; un tocco o uno
  // scorrimento la saltano. Se le notizie non sono ancora arrivate il nome aspetta al centro, al massimo un secondo e mezzo.
  // Il contenuto è già disegnato sotto lo schermo dell'intro: l'entrata non ritarda la lettura.
  G.today = () => new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  G.intro = () => {
    const html = document.documentElement;
    if (html.classList.contains("intro-mini")) {
      try { sessionStorage.setItem("gerico.intro", "1"); } catch (e) { /* niente */ }
      setTimeout(() => html.classList.remove("intro-mini"), 900);
    }
    if (!html.classList.contains("intro-run")) return;
    const scr = document.querySelector(".intro-screen"), word = document.querySelector(".intro-word"), brand = document.querySelector(".top .brand");
    let ended = false, opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      html.classList.add("intro-open");
      afterIntro.splice(0).forEach((fn) => { try { fn(); } catch (e) { /* niente */ } });
    };
    const end = () => {
      if (ended) return;
      ended = true;
      open();
      html.classList.remove("intro-run", "intro-open", "intro-go");
      [word, scr, brand].forEach((el) => el && el.getAnimations && el.getAnimations().forEach((a) => a.cancel()));
    };
    try { sessionStorage.setItem("gerico.intro", "1"); localStorage.removeItem("gerico.introDay"); } catch (e) { /* niente */ }
    if (!scr || !word || !brand || !word.animate) return end();
    // tempi in millisecondi: il nome compare (IN) mentre il tratto lo attraversa (SWEEP), resta un attimo (HOLD),
    // viaggia al suo posto (MOVE) e lascia il posto al nome vero (OUT)
    const IN = 160, SWEEP = 360, HOLD = 120, MOVE = 520, OUT = 120;
    const base = "translate(-50%, -50%)";
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // il nome resta al centro finché la pagina sotto non ha disegnato le notizie (al massimo un secondo e mezzo):
    // lo schermo si apre su notizie vere, non sugli scheletri
    const pageReady = () => Promise.race([Promise.resolve(G.P && G.P.done), wait(1500)]);
    const move = () => {
      if (ended) return;
      const tn = Array.from(brand.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
      const range = document.createRange();
      range.selectNodeContents(tn || brand);
      // nella grafica nuova il nome ha il punto dopo il testo (::after) e niente margini: si misura tutto il nome
      const b = (html.classList.contains("nuova") ? brand : range).getBoundingClientRect(), w = word.getBoundingClientRect();
      const s = parseFloat(getComputedStyle(brand).fontSize) / parseFloat(getComputedStyle(word).fontSize);
      const dx = b.left + b.width / 2 - (w.left + w.width / 2), dy = b.top + b.height / 2 - (w.top + w.height / 2);
      const there = base + " translate(" + dx.toFixed(2) + "px, " + dy.toFixed(2) + "px) scale(" + s.toFixed(4) + ")";
      const T = MOVE + OUT, k = MOVE / T;
      word.animate([
        { offset: 0, opacity: 1, transform: base, easing: "cubic-bezier(0.5, 0, 0.1, 1)" },
        { offset: k, opacity: 1, transform: there, easing: "linear" },
        { offset: 1, opacity: 0, transform: there }
      ], { duration: T, fill: "both" }).finished.then(end, end);
      // il nome vero compare sotto quello in viaggio nell'istante in cui arriva: nessuno scatto
      brand.getAnimations().forEach((a) => a.cancel());
      brand.animate([{ opacity: 0 }, { opacity: 0, offset: k }, { opacity: 1, offset: k }, { opacity: 1 }], { duration: T, fill: "both" });
      // lo schermo si apre mentre il nome parte: le notizie salgono sotto di lui
      scr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" });
      open();
      setTimeout(end, T + 1200);
    };
    // si parte con il carattere già caricato: niente cambio di carattere a metà e arrivo esatto
    const go = () => {
      if (ended) return;
      // il tratto parte con il nome (animazione CSS di ::before, classe intro-go)
      html.classList.add("intro-go");
      word.animate([{ opacity: 0 }, { opacity: 1 }], { duration: IN, easing: "linear", fill: "forwards" });
      Promise.all([wait(SWEEP + HOLD), pageReady()]).then(move, move);
    };
    const face = html.classList.contains("nuova") ? '750 64px "Newsreader"' : '800 48px "Atkinson Hyperlegible Next"';
    const font = document.fonts && document.fonts.load ? document.fonts.load(face) : Promise.resolve();
    Promise.race([font, new Promise((r) => setTimeout(r, 600))]).then(go, go);
    // un tocco o uno scorrimento la saltano
    scr.addEventListener("pointerdown", end, { once: true });
    window.addEventListener("wheel", end, { once: true, passive: true });
    window.addEventListener("touchmove", end, { once: true, passive: true });
    setTimeout(() => { if (!word.getAnimations().length) end(); }, 1500);
  };

  // ---------- pagine: ogni script di pagina si registra con G.page; la navigazione lo avvia e lo chiude ----------
  // Quello che una pagina accende fuori dai suoi elementi (ascoltatori su window e document, timer, osservatori)
  // passa da P: uscendo dalla pagina si spegne tutto, così niente si accumula da una pagina all'altra.
  let cleanup = [];
  const P = {
    on(t, type, fn, o) { t.addEventListener(type, fn, o); cleanup.push(() => t.removeEventListener(type, fn, o)); },
    every(fn, ms) { const id = setInterval(fn, ms); cleanup.push(() => clearInterval(id)); return id; },
    later(fn, ms) { const id = setTimeout(fn, ms); cleanup.push(() => clearTimeout(id)); return id; },
    keep(o) { cleanup.push(() => { try { o.disconnect(); } catch (e) { /* niente */ } }); return o; },
    add(fn) { cleanup.push(fn); },
    done: Promise.resolve()
  };
  G.P = P;
  G.pages = {};
  G.current = "";
  const startPage = (name) => {
    let r;
    try { r = G.pages[name](P); } catch (e) { console.error(e); }
    P.done = Promise.resolve(r).catch((e) => console.error(e));
  };
  G.page = (name, fn) => {
    G.pages[name] = fn;
    if (!G.current || G.current === name) { G.current = name; startPage(name); }
  };
  const stopPage = () => { cleanup.splice(0).forEach((f) => { try { f(); } catch (e) { /* niente */ } }); };

  // ---------- riepilogo a voce: un solo lettore per tutto il sito ----------
  // L'audio vive fuori dalla pagina: cambiando pagina continua, e anche in un'altra scheda o a schermo bloccato.
  // Una barra in basso lo comanda da ogni pagina; la posizione resta in memoria di sessione:
  // dopo un ricaricamento si riprende da lì con un tocco (iOS non fa ripartire l'audio da solo).
  G.player = (() => {
    const audio = new Audio();
    audio.preload = "none";
    const KEY = "gerico.audio";
    let info = null, saved = 0, closed = false, cardSeen = false, lastSave = 0, lastPos = 0, bar = null;
    const subs = new Set();
    const emit = () => { subs.forEach((f) => { try { f(); } catch (e) { /* niente */ } }); paint(); };
    const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    const when = () => info && (info.source || info.asOf);
    const title = () => (info ? (G.isToday(when()) ? G.L("Il riepilogo di oggi", "Today's briefing (in Italian)") : G.L("Il riepilogo di ", "Briefing of ") + G.weekday(when()) + G.L("", " (in Italian)")) : "");
    const dur = () => audio.duration || (info && info.duration) || 0;
    const pos = () => audio.currentTime || saved || 0;
    const started = () => !!info && (!audio.paused || pos() > 0);
    const save = () => {
      try {
        if (!info || (!pos() && audio.paused)) sessionStorage.removeItem(KEY);
        else sessionStorage.setItem(KEY, JSON.stringify({ src: info.src, t: Math.round(pos()), at: Date.now() }));
      } catch (e) { /* niente */ }
    };
    const srcReady = () => {
      if (!info || audio.getAttribute("src")) return;
      audio.src = info.src;
      if (saved) {
        const t = saved;
        const jump = () => { try { if (Math.abs(audio.currentTime - t) > 1) audio.currentTime = t; } catch (e) { /* niente */ } };
        audio.addEventListener("loadedmetadata", jump, { once: true });
        audio.addEventListener("canplay", jump, { once: true });
      }
    };
    const session = () => {
      if (!("mediaSession" in navigator) || !window.MediaMetadata || !info) return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: title(), artist: "GERICO", album: "Notizie e mercati, a voce",
        artwork: [{ src: new URL("assets/img/apple-touch-icon.png", location.href).href, sizes: "180x180", type: "image/png" }] });
      const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* non tutti i browser li hanno */ } };
      set("play", () => api.play());
      set("pause", () => audio.pause());
      set("seekbackward", () => api.seek(-15));
      set("seekforward", () => api.seek(15));
      set("seekto", (d) => { if (d && typeof d.seekTime === "number") audio.currentTime = d.seekTime; });
      set("stop", () => api.close());
    };
    const api = {
      audio, mmss, title, dur, pos, info: () => info,
      set(data) {
        if (!data || !data.src) return;
        const same = info && info.src === data.src;
        info = data;
        if (!same) {
          try {
            const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
            saved = s && s.src === data.src && Date.now() - s.at < 6 * 3600000 ? s.t : 0;
          } catch (e) { saved = 0; }
          if (audio.getAttribute("src") && audio.getAttribute("src") !== data.src) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
        }
        emit();
      },
      play() { if (!info) return; closed = false; srcReady(); audio.play().catch(() => {}); },
      toggle() { if (audio.paused) api.play(); else audio.pause(); },
      seek(d) { if (!audio.duration) return; audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + d)); },
      close() { audio.pause(); closed = true; saved = 0; try { audio.currentTime = 0; } catch (e) { /* niente */ } save(); emit(); },
      playing: () => !audio.paused,
      on(f) { subs.add(f); return () => subs.delete(f); },
      // in prima pagina la scheda «Ascolta» fa da lettore: quando è in vista la barra non serve
      card(el) {
        cardSeen = false;
        if (!el || !window.IntersectionObserver) return;
        const o = new IntersectionObserver(([e]) => { cardSeen = e.isIntersecting; paint(); });
        o.observe(el);
        P.keep(o);
        P.add(() => { cardSeen = false; paint(); });
      },
      mount() { if (bar && !bar.isConnected) document.body.appendChild(bar); cardSeen = false; paint(); }
    };
    audio.addEventListener("play", () => { session(); emit(); });
    audio.addEventListener("pause", () => { save(); emit(); });
    audio.addEventListener("ended", () => { saved = 0; try { audio.currentTime = 0; } catch (e) { /* niente */ } audio.pause(); save(); emit(); });
    audio.addEventListener("timeupdate", () => {
      const now = Date.now();
      if (now - lastSave > 4000) { lastSave = now; save(); }
      if (Math.abs(audio.currentTime - lastPos) >= 0.25) { lastPos = audio.currentTime; emit(); }
      if ("mediaSession" in navigator && navigator.mediaSession.setPositionState && audio.duration) {
        try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate }); } catch (e) { /* niente */ }
      }
    });
    window.addEventListener("pagehide", save);

    // la barra in basso, uguale su tutte le pagine
    const ICON = '<svg class="i-play" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M4.5 2.6v10.8L13.2 8z" fill="currentColor"/></svg>' +
      '<svg class="i-pause" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M5 3v10M11 3v10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
    const build = () => {
      bar = document.createElement("div");
      bar.className = "gp";
      bar.id = "gp";
      bar.setAttribute("role", "region");
      bar.setAttribute("aria-label", G.L("Riepilogo a voce", "Audio briefing"));
      bar.hidden = true;
      bar.innerHTML = '<button type="button" class="gp-play" aria-label="' + G.L("Ascolta il riepilogo", "Listen to the briefing") + '">' + ICON + "</button>" +
        '<div class="gp-txt"><p class="gp-t"></p><p class="gp-s"></p></div>' +
        '<button type="button" class="gp-sk" data-d="-15" aria-label="' + G.L("Indietro di 15 secondi", "Back 15 seconds") + '">−15</button>' +
        '<button type="button" class="gp-sk" data-d="15" aria-label="' + G.L("Avanti di 15 secondi", "Forward 15 seconds") + '">+15</button>' +
        '<button type="button" class="gp-x" aria-label="' + G.L("Chiudi il riepilogo", "Close the briefing") + '"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
        '<span class="gp-bar" aria-hidden="true"><i></i></span>';
      bar.querySelector(".gp-play").addEventListener("click", () => api.toggle());
      bar.querySelectorAll(".gp-sk").forEach((b) => b.addEventListener("click", () => api.seek(Number(b.dataset.d))));
      bar.querySelector(".gp-x").addEventListener("click", () => api.close());
      document.body.appendChild(bar);
    };
    function paint() {
      if (!bar) { if (!document.body) return; build(); }
      const show = started() && !closed && !cardSeen;
      if (bar.hidden === show) bar.hidden = !show;
      document.documentElement.classList.toggle("gp-on", show);
      if (!show) return;
      const on = !audio.paused, d = dur();
      bar.classList.toggle("playing", on);
      bar.querySelector(".gp-play").setAttribute("aria-label", on ? G.L("Metti in pausa il riepilogo", "Pause the briefing") : G.L("Riprendi il riepilogo", "Resume the briefing"));
      bar.querySelector(".gp-t").textContent = title();
      bar.querySelector(".gp-s").textContent = d ? (on ? G.L("Mancano ", "Left ") : G.L("In pausa · mancano ", "Paused · left ")) + mmss(Math.max(0, d - pos())) : "";
      bar.querySelector(".gp-bar i").style.transform = "scaleX(" + (d ? Math.min(1, pos() / d) : 0).toFixed(4) + ")";
    }
    return api;
  })();
  // dopo un ricaricamento, se il riepilogo era a metà, la barra lo ripropone da dove eri
  try {
    if (sessionStorage.getItem("gerico.audio")) G.load("audio").then((au) => { if (au && au.src && G.hoursAgo(au.asOf) < 30) G.player.set(au); });
  } catch (e) { /* niente */ }

  // ---------- barra in basso a pillola (grafica nuova, 7 novembre) ----------
  // Notizie, Terminal, il riepilogo a voce e il menu, a portata di pollice. Sul telefono prende il posto
  // dell'interruttore e del menu in alto (li nasconde il CSS); sul computer non c'è. Come la barra del riepilogo
  // resta nella pagina da un passaggio all'altro: cambia solo la voce accesa
  G.tabbar = (() => {
    let bar = null, asked = false;
    const svg = (body, cls) => '<svg' + (cls ? ' class="' + cls + '"' : "") + ' aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>";
    const ICON = {
      notizie: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5"/>'),
      terminal: svg('<path d="M3.5 17l5.2-5.6 3.8 3.3 7.5-8.2"/><path d="M15.2 6.5h4.8v4.8"/>'),
      ascolta: svg('<path d="M4.5 16.5V12a7.5 7.5 0 0 1 15 0v4.5"/><rect x="3.5" y="13.5" width="4.5" height="7" rx="2"/><rect x="16" y="13.5" width="4.5" height="7" rx="2"/>', "pb-ear") +
        '<svg class="pb-eq" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="3" height="14" rx="1.5"/><rect x="10.5" y="5" width="3" height="14" rx="1.5"/><rect x="16" y="5" width="3" height="14" rx="1.5"/></svg>',
      menu: svg('<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>')
    };
    const paint = () => {
      if (!bar) return;
      const b = bar.querySelector('[data-k="ascolta"]'), ok = !!G.player.info(), playing = ok && G.player.playing();
      if (b.hidden === ok) b.hidden = !ok;
      b.classList.toggle("playing", playing);
      b.setAttribute("aria-pressed", String(playing));
      b.setAttribute("aria-label", playing ? G.L("Metti in pausa il riepilogo", "Pause the briefing") : G.L("Ascolta il riepilogo", "Listen to the briefing"));
    };
    const build = () => {
      bar = document.createElement("nav");
      bar.className = "pb";
      bar.id = "pb";
      bar.setAttribute("aria-label", G.L("Navigazione", "Navigation"));
      bar.innerHTML = '<a class="pb-i" href="./" data-reveal data-k="notizie">' + ICON.notizie + "<span>" + G.L("Notizie", "News") + "</span></a>" +
        '<a class="pb-i" href="terminal" data-reveal data-k="terminal">' + ICON.terminal + "<span>Terminal</span></a>" +
        '<button class="pb-i" type="button" data-k="ascolta" aria-pressed="false" hidden>' + ICON.ascolta + "<span>" + G.L("Ascolta", "Listen") + "</span></button>" +
        '<button class="pb-i" type="button" data-k="menu" aria-haspopup="dialog" aria-controls="menu">' + ICON.menu + "<span>Menu</span></button>";
      bar.querySelector('[data-k="ascolta"]').addEventListener("click", () => G.player.toggle());
      // il menu è quello della pagina: lo apre il suo pulsante, che sul telefono in alto è nascosto
      bar.querySelector('[data-k="menu"]').addEventListener("click", () => { const b = document.querySelector(".top .menu-btn"); if (b) b.click(); });
      G.player.on(paint);
      document.body.appendChild(bar);
    };
    return {
      mount() {
        if (!document.documentElement.classList.contains("nuova") || !document.body) return;
        if (!bar) build(); else if (!bar.isConnected) document.body.appendChild(bar);
        const k = G.current === "terminal" ? "terminal" : G.current === "home" || G.current === "story" ? "notizie" : "";
        bar.querySelectorAll("a.pb-i").forEach((a) => {
          if (a.dataset.k !== k) a.removeAttribute("aria-current");
          else a.setAttribute("aria-current", G.current === "story" ? "true" : "page");
        });
        // la voce del riepilogo compare quando c'è quello del giorno
        if (!asked) {
          asked = true;
          G.load("audio").then((au) => { if (au && au.src && G.hoursAgo(au.asOf) <= 30 && !G.player.info()) G.player.set(au); paint(); }).catch(() => {});
        }
        paint();
      }
    };
  })();

  // i link alla prova della grafica (?prova=1, 7 novembre) portano alla grafica di tutti: l'indirizzo si pulisce
  if (/[?&]prova=/.test(location.search)) {
    try { const u = new URL(location.href); u.searchParams.delete("prova"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); sessionStorage.removeItem("gerico.prova"); } catch (e) { /* niente */ }
  }

  // ---------- navigazione senza ricaricare la pagina ----------
  // I link interni scaricano la pagina nuova e ne prendono il contenuto: l'audio continua e il passaggio è animato
  // (avanti da destra, indietro da sinistra, tra Notizie e Terminal un cerchio dal punto toccato).
  // Se qualcosa non va, il link si apre come sempre.
  const PAGE_RE = /^\/(?:index|storia|terminal|come-funziona|privacy)?(?:\.html)?$/;
  const SCRIPT_PAGE = { "home.js": "home", "story.js": "story", "terminal.js": "terminal", "info.js": "info" };
  const htmlEl = document.documentElement;
  const soft = !!(window.fetch && window.DOMParser && history.pushState && window.Promise);
  const MY = (() => { const s = document.querySelector('script[src*="assets/js/common.js"]'); return s ? s.getAttribute("src") : ""; })();
  const pages = new Map();
  // la pagina (solo l'involucro: i contenuti arrivano dai dati) si tiene per dieci minuti; dopo si usa ancora quella in
  // mano e intanto si chiede quella nuova: il tocco non aspetta la rete. Se nel frattempo il sito è cambiato, la pagina
  // nuova ha script di un'altra versione e si carica da capo (vedi G.go)
  const fetchPage = (url) => {
    const key = url.split("#")[0].split("?")[0];
    const hit = pages.get(key);
    if (hit && Date.now() - hit.t < 600000) return hit.p;
    const get = () => fetch(key, { credentials: "same-origin" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
    if (hit && hit.ok) {
      if (!hit.next) hit.next = get().then((text) => { if (pages.get(key) === hit) pages.set(key, { p: Promise.resolve(text), t: Date.now(), ok: true }); }, () => { hit.next = null; });
      return hit.p;
    }
    const p = get(), entry = { p, t: Date.now(), ok: false };
    pages.set(key, entry);
    p.then(() => { entry.ok = true; }, () => { if (pages.get(key) === entry) pages.delete(key); });
    return p;
  };
  const pageOf = (doc) => {
    for (const s of doc.querySelectorAll("script[src]")) {
      const m = (s.getAttribute("src") || "").match(/assets\/js\/([a-z]+\.js)/);
      if (m && SCRIPT_PAGE[m[1]]) return { name: SCRIPT_PAGE[m[1]], src: s.getAttribute("src") };
    }
    return { name: "plain", src: "" };
  };
  const loaded = new Set();
  const loadScript = (src) => new Promise((res, rej) => {
    if (loaded.has(src)) return res();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => { loaded.add(src); res(); };
    s.onerror = rej;
    document.head.appendChild(s);
  });
  document.querySelectorAll('script[src*="assets/js/"]').forEach((s) => loaded.add(s.getAttribute("src")));
  // la stessa pagina con due nomi: «/» e «/index.html», «/terminal» e «/terminal.html»
  const normPath = (p) => p.replace(/\.html$/, "").replace(/\/index$/, "/");
  const samePath = (a, b) => normPath(a.pathname) === normPath(b.pathname) && a.search === b.search;
  const isPageLink = (a) => {
    if (!a || !a.href || a.target || a.hasAttribute("download") || a.dataset.full !== undefined) return null;
    let u;
    try { u = new URL(a.href, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin || !PAGE_RE.test(u.pathname)) return null;
    return u;
  };
  // il contenuto della pagina nuova prende il posto di quello vecchio; restano la barra del riepilogo e l'html con le preferenze
  const apply = (doc, name) => {
    document.title = doc.title;
    ["description"].forEach((n) => {
      const a = document.querySelector('meta[name="' + n + '"]'), b = doc.querySelector('meta[name="' + n + '"]');
      if (a && b) a.setAttribute("content", b.getAttribute("content"));
    });
    const cA = document.querySelector('link[rel="canonical"]'), cB = doc.querySelector('link[rel="canonical"]');
    if (cA && cB) cA.setAttribute("href", cB.getAttribute("href")); else if (cA && !cB) cA.remove(); else if (!cA && cB) document.head.appendChild(cB.cloneNode());
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    doc.querySelectorAll('meta[name="theme-color"]').forEach((m) => document.head.appendChild(m.cloneNode()));
    // come farebbe lo script nell'head della pagina nuova: il Terminal è sempre scuro, le altre pagine seguono il tema scelto
    const theme = name === "terminal" ? null : G.ls.get("gerico.theme", null);
    if (theme) htmlEl.setAttribute("data-theme", theme); else htmlEl.removeAttribute("data-theme");
    htmlEl.classList.remove("intro-run", "intro-open", "intro-go", "menu-open", "scrolled");
    const b = document.body, keep = [document.getElementById("gp"), document.getElementById("pb")].filter(Boolean);
    Array.from(b.attributes).forEach((at) => b.removeAttribute(at.name));
    Array.from(doc.body.attributes).forEach((at) => b.setAttribute(at.name, at.value));
    // la barra del riepilogo e quella in basso non si staccano mai: niente animazione ripetuta a ogni pagina
    Array.from(b.childNodes).forEach((n) => { if (!keep.includes(n)) n.remove(); });
    const frag = document.createDocumentFragment();
    Array.from(doc.body.childNodes).forEach((n) => { if (n.nodeName !== "SCRIPT") frag.appendChild(n); });
    b.insertBefore(frag, b.firstChild);
  };
  let navId = 0, idx = 0, ready = false, shown = location.pathname + location.search;
  // la pagina di ogni passo della cronologia fatto senza ricaricare: dice dove porta «indietro» (G.entryBefore)
  const entries = { 0: shown };
  G.entryBefore = () => entries[idx - 1] || "";
  G.prevUrl = "";
  G.soft = false;
  // dir: "forward" | "back"; mode: passaggio tra Notizie e Terminal; y: scorrimento da ripristinare
  G.go = async (url, opt) => {
    opt = opt || {};
    if (!soft) { location.href = url; return; }
    const id = ++navId;
    let text;
    try { text = await fetchPage(url); } catch (e) { location.href = url; return; }
    if (id !== navId) return;
    const doc = new DOMParser().parseFromString(text, "text/html");
    const common = doc.querySelector('script[src*="assets/js/common.js"]');
    // dopo un aggiornamento del sito gli script cambiano versione: meglio una pagina caricata da capo
    if (!common || common.getAttribute("src") !== MY) { location.href = url; return; }
    const pg = pageOf(doc);
    if (!ready) { ready = true; try { history.scrollRestoration = "manual"; } catch (e) { /* niente */ } }
    if (opt.push !== false) { try { history.replaceState(Object.assign({}, history.state, { g: 1, n: idx, y: scrollY }), ""); } catch (e) { /* niente */ } }
    const from = location.href;
    const swap = async () => {
      // è partito un altro passaggio prima di questo: la pagina la cambia lui, questo non tocca niente
      if (id !== navId) return;
      stopPage();
      apply(doc, pg.name);
      if (opt.push !== false) { idx += 1; history.pushState({ g: 1, n: idx, y: 0 }, "", url); }
      entries[idx] = location.pathname + location.search;
      shown = location.pathname + location.search;
      G.prevUrl = from;
      G.soft = true;
      G.current = pg.name;
      if (G.pages[pg.name]) startPage(pg.name);
      else if (pg.src) { try { await loadScript(pg.src); } catch (e) { location.href = url; return; } }
      else { G.initPrefs(); P.done = Promise.resolve(); }
      G.player.mount();
      // la transizione fotografa la pagina nuova quando ha disegnato il contenuto principale (al massimo 400 ms)
      await Promise.race([P.done, new Promise((r) => setTimeout(r, 400))]);
      const h = new URL(url, location.href).hash;
      const target = h && document.getElementById(decodeURIComponent(h.slice(1)));
      // un salto, mai uno scorrimento morbido: la transizione fotografa la pagina già al suo posto
      window.scrollTo({ top: target ? target.getBoundingClientRect().top + scrollY - 70 : opt.y || 0, behavior: "instant" });
    };
    const finish = () => {
      G.warmData();
      // per chi usa un lettore di schermo: il fuoco va all'inizio della pagina nuova e il titolo si annuncia
      const main = document.getElementById("main") || document.querySelector("main");
      if (main) { if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1"); main.focus({ preventScroll: true }); }
      let live = document.getElementById("nav-live");
      if (!live) { live = document.createElement("p"); live.id = "nav-live"; live.className = "sr-only"; live.setAttribute("aria-live", "polite"); document.body.appendChild(live); }
      live.textContent = document.title;
    };
    const animate = document.startViewTransition && !G.reduced() && !opt.instant;
    if (!animate) { await swap(); finish(); return; }
    htmlEl.dataset.vt = opt.dir === "back" ? "back" : "forward";
    if (opt.swipe) {
      htmlEl.dataset.swipe = "1";
      // dopo uno swipe la pagina riparte da dove l'ha lasciata il dito, alla sua velocità (CSS: --sx, --sdur, --sease)
      htmlEl.style.setProperty("--sx", (opt.sx || 0).toFixed(1) + "px");
      if (opt.anim) { htmlEl.style.setProperty("--sdur", opt.anim.D + "ms"); htmlEl.style.setProperty("--sease", opt.anim.ease); }
    }
    // tra Notizie e Terminal cambia anche il tema: la barra in alto sfuma da un colore all'altro e la pillola dell'interruttore scivola
    if (opt.mode) htmlEl.dataset.mode = "1";
    const t = document.startViewTransition(swap);
    window.gericoVT = t;
    t.finished.then(finish, finish).finally(() => {
      // un passaggio partito dopo questo ha già messo i suoi segni (verso, swipe, interruttore): restano suoi
      if (window.gericoVT !== t) return;
      window.gericoVT = null;
      delete htmlEl.dataset.vt; delete htmlEl.dataset.swipe; delete htmlEl.dataset.mode;
      ["--sx", "--sdur", "--sease"].forEach((k) => htmlEl.style.removeProperty(k));
    });
  };
  if (soft) {
    try { history.replaceState(Object.assign({}, history.state, { g: 1, n: 0 }), ""); } catch (e) { /* niente */ }
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a[href]");
      const u = isPageLink(a);
      if (!u) return;
      // un link alla stessa pagina con solo un'ancora (le sezioni della prima pagina) lo gestisce la pagina
      const same = samePath(u, location);
      if (same && u.hash) return;
      e.preventDefault();
      // toccare la pagina in cui sei già (anche «./» per «index.html», o «Notizie» da una sezione) non la rifà da capo:
      // la pagina decide (la prima pagina torna a Tutte), altrimenti si torna in cima, come le schede delle app
      if (same) {
        if (G.samePage && G.samePage(a)) return;
        window.scrollTo({ top: 0, behavior: G.reduced() ? "auto" : "smooth" });
        return;
      }
      if (a.hasAttribute("data-reveal")) {
        const toTerm = /terminal/.test(u.pathname);
        if (!toTerm && G.modeBack && G.modeBack()) return;
        G.go(u.href, { dir: toTerm ? "forward" : "back", mode: true });
      }
      else G.go(u.href, { dir: a.dataset.dir || "forward" });
    });
    // a pagina ferma si preparano le pagine dove si va più spesso (una storia e il Terminal) e i loro script:
    // al primo tocco il passaggio parte subito, senza aspettare la rete. Con il risparmio dati attivo no
    const preload = () => {
      G.warmData();
      if (navigator.connection && navigator.connection.saveData) return;
      ["storia.html", "terminal"].forEach((u) => {
        const url = new URL(u, location.href);
        if (url.pathname === location.pathname) return;
        fetchPage(url.href).then((text) => {
          const doc = new DOMParser().parseFromString(text, "text/html"), pg = pageOf(doc);
          if (pg.src && !loaded.has(pg.src)) fetch(new URL(pg.src, url).href, { credentials: "same-origin" }).catch(() => {});
        }).catch(() => {});
      });
    };
    const idle = () => G.afterIntro(() => (window.requestIdleCallback ? requestIdleCallback(preload, { timeout: 3000 }) : setTimeout(preload, 1500)));
    if (document.readyState === "complete") idle(); else window.addEventListener("load", idle, { once: true });
    // il dito si appoggia su un link: la pagina si scarica già, al tocco è pronta
    const warm = (e) => { const u = isPageLink(e.target.closest && e.target.closest("a[href]")); if (u && u.href.split("#")[0] !== location.href.split("#")[0]) fetchPage(u.href).catch(() => {}); };
    document.addEventListener("touchstart", warm, { passive: true });
    let edgeAt = 0, modeBack = false;
    document.addEventListener("touchstart", (e) => { const x = e.touches[0] && e.touches[0].clientX; if (x < 24 || x > innerWidth - 24) edgeAt = Date.now(); }, { passive: true });
    // dal Terminal alle Notizie, se si arrivava dalle Notizie, si torna indietro: stessa sezione e stesso punto della pagina,
    // con il passaggio dell'interruttore (le due pagine che si spingono intere)
    G.modeBack = () => {
      let prev = null;
      try { prev = G.prevUrl ? new URL(G.prevUrl) : null; } catch (e) { prev = null; }
      if (!(idx > 0 && prev && prev.origin === location.origin && /^\/(index(\.html)?)?$/.test(prev.pathname))) return false;
      modeBack = true;
      history.back();
      return true;
    };
    document.addEventListener("mouseover", warm, { passive: true });
    window.addEventListener("popstate", (e) => {
      // è cambiata solo l'ancora (le sezioni della prima pagina): ci pensa la pagina
      if (location.pathname + location.search === shown) return;
      const st = e.state || {};
      const n = typeof st.n === "number" ? st.n : idx - 1;
      const back = n < idx;
      idx = n;
      // se il browser ha già animato il ritorno (il gesto dal bordo su iOS), niente seconda animazione
      const mode = modeBack;
      modeBack = false;
      G.go(location.href, { push: false, y: st.y || 0, dir: back ? "back" : "forward", mode, instant: !mode && (!!e.hasUAVisualTransition || Date.now() - edgeAt < 1500) });
    });
  }

  // ---------- swipe: scorrere di lato per passare alla sezione, al gruppo o alla storia vicina ----------
  // Il contenuto sta attaccato al dito e quello vicino entra dal lato, intero e alla stessa velocità, come due pagine
  // affiancate. Al rilascio la pagina prosegue con la velocità del dito e si posa piano, senza rimbalzi; dove oltre non
  // c'è niente il contenuto fa resistenza, come su iOS. Basta un colpo deciso o una pagina portata oltre un terzo.
  // I bordi dello schermo restano a iOS (indietro e avanti); gli elementi che scorrono da soli (fasce, controlli, tabelle)
  // e i campi di testo non lo fanno partire. Pulsanti e schede restano: è una scorciatoia.
  // opt: canNext(), canPrev(); follow: l'elemento (o gli elementi) che si spostano;
  //   peek(d): il contenuto vicino (d = 1 dopo, -1 prima), già nella pagina e messo sopra quello di adesso;
  //   commit(d): il cambio vero, senza animazioni, quando la pagina vicina è arrivata al suo posto;
  //   progress(p, d, anim): per l'indicatore delle schede (p da 0 a 1 verso la scheda vicina);
  //   senza peek, next(reset, off, anim) e prev(...): la storia vicina arriva con la transizione di pagina.
  const NOSWIPE = "input, textarea, select, [contenteditable], .ultim, [data-noswipe]";
  const SWIPE_GAP = 28;
  // Il passaggio dopo il rilascio è una molla senza rimbalzo: parte alla velocità del dito (v in px/ms verso l'arrivo),
  // accelera o rallenta in modo continuo e si posa piano. La curva è scritta a punti con linear(); dove il browser non la
  // conosce, una cubic-bezier simile. Più è veloce il colpo, più è breve.
  const LINEAR = typeof CSS !== "undefined" && !!CSS.supports && CSS.supports("animation-timing-function", "linear(0, 0.5, 1)");
  G.swipeAnim = (v, dist) => {
    const d = Math.max(dist, 1), vn = Math.max(0, v) / d;     // velocità in frazioni della corsa al ms
    const w = Math.max(4.6 / 330, vn);                          // a riposo: 95% della corsa in circa 330 ms
    const B = w - vn;                                           // con w ≥ vn la molla non supera mai l'arrivo
    const left = (t) => (1 + B * t) * Math.exp(-w * t);        // quanto manca (1 all'inizio, 0 all'arrivo)
    let D = 260;
    while (D < 760 && left(D) > 0.004) D += 10;
    if (!LINEAR) {
      const y1 = Math.min(0.9, (vn * D) * 0.25);
      return { D, ease: "cubic-bezier(0.25, " + y1.toFixed(3) + ", 0.25, 1)" };
    }
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push(i === 24 ? "1" : (1 - left((D * i) / 24)).toFixed(4));
    return { D, ease: "linear(" + pts.join(", ") + ")" };
  };
  // la resistenza oltre l'ultima pagina: più tiri, meno si sposta (la formula dei bordi di iOS)
  const rubber = (x, w) => Math.sign(x) * (1 - 1 / (Math.abs(x) * 0.55 / w + 1)) * w * 0.55;
  const tx = (x) => (x ? "translate3d(" + x.toFixed(1) + "px,0,0)" : "none");
  G.swipe = (area, opt) => {
    if (!area || !("ontouchstart" in window)) return;
    const follows = () => [].concat(typeof opt.follow === "function" ? opt.follow() : (opt.follow || area)).filter(Boolean);
    const can = (d) => (d > 0 ? opt.canNext() : opt.canPrev());
    let x0 = 0, y0 = 0, t0 = 0, mode = "", track = [], peeks = {}, W = 0, side = 0, lock = 0, x = 0, busy = null, anims = [], raf = 0;
    const drop = (el) => (opt.drop ? opt.drop(el) : el.remove());
    // dentro un elemento che scorre di lato (schede lunghe, tabelle larghe) il gesto è suo
    const scrollsX = (el) => {
      for (let n = el; n && n !== area && n !== document.body; n = n.parentElement) {
        if (n.scrollWidth > n.clientWidth + 2) { const o = getComputedStyle(n).overflowX; if (o === "auto" || o === "scroll") return true; }
      }
      return false;
    };
    const place = () => {
      raf = 0;
      follows().forEach((el) => { el.style.transform = tx(x); });
      [1, -1].forEach((d) => { if (peeks[d]) peeks[d].style.transform = tx(x + d * W); });
      if (opt.progress && side && can(side)) opt.progress(Math.min(1, Math.abs(x) / W), side);
    };
    // il dito manda più eventi di quanti fotogrammi ci sono: si scrive una volta per fotogramma, sempre l'ultima posizione
    const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };
    const flush = () => { if (raf) { cancelAnimationFrame(raf); place(); } };
    const clear = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      anims.forEach((a) => a.cancel());
      anims = [];
      follows().forEach((el) => { el.style.transform = ""; el.style.willChange = ""; });
      [1, -1].forEach((d) => { if (peeks[d]) drop(peeks[d]); });
      peeks = {}; x = 0; side = 0;
    };
    // compatibilità con le pagine senza peek: reset(true) torna al posto con un'animazione
    const reset = (smooth) => {
      if (!smooth || G.reduced()) { clear(); return; }
      settle(0, 0, () => {});
    };
    const settle = (to, v, done, d) => {
      flush();
      const from = x, dist = Math.abs(to - from);
      const toward = to === from ? 0 : Math.max(0, v * Math.sign(to - from));
      const anim = G.swipeAnim(toward, dist);
      if (opt.progress && side) opt.progress(to ? 1 : 0, side, anim);
      if (G.reduced() || dist < 1) { done(); clear(); return; }
      const all = [];
      const move = (el, a, b) => all.push(el.animate([{ transform: tx(a) }, { transform: tx(b) }], { duration: anim.D, easing: anim.ease, fill: "forwards" }));
      follows().forEach((el) => move(el, from, to));
      [1, -1].forEach((k) => { if (peeks[k]) move(peeks[k], from + k * W, to + k * W); });
      anims = all;
      const job = { done, keep: to ? peeks[d] : null };
      busy = job;
      Promise.all(all.map((a) => a.finished)).then(() => { if (busy === job) finishBusy(); }, () => {});
    };
    // a pagina arrivata il cambio vero e la pulizia stanno nello stesso fotogramma. La pagina accanto (coprente) resta
    // sopra ancora due fotogrammi, finché quella vera sotto è disegnata: così le scritte non compaiono dal nulla
    const finishBusy = () => {
      const job = busy;
      busy = null;
      if (!job) return;
      job.done();
      const keep = job.keep && peeks[side] === job.keep ? job.keep : null;
      if (keep) { keep.getAnimations().forEach((a) => a.cancel()); keep.style.transform = "none"; anims = anims.filter((a) => a.effect && a.effect.target !== keep); delete peeks[side]; }
      const still = follows();
      clear();
      if (keep) {
        still.forEach((el) => { el.style.willChange = "transform"; });
        requestAnimationFrame(() => requestAnimationFrame(() => { drop(keep); still.forEach((el) => { if (!el.style.transform) el.style.willChange = ""; }); }));
      }
    };
    P.on(area, "touchstart", (e) => {
      // un tocco mentre la pagina si posa la fa arrivare subito: si riparte da lì
      if (busy) finishBusy();
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; t0 = performance.now(); track = []; x = 0; side = 0; lock = 0;
      mode = e.touches.length > 1 || x0 < 24 || x0 > innerWidth - 24 || (e.target.closest && e.target.closest(NOSWIPE)) || scrollsX(e.target) ? "no" : "";
    }, { passive: true });
    P.on(area, "touchmove", (e) => {
      if (mode === "no") return;
      const t = e.touches[0], ddx = t.clientX - x0, ddy = t.clientY - y0;
      if (!mode) {
        if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
        mode = Math.abs(ddx) > Math.abs(ddy) * 1.3 ? "x" : "no";
        if (mode === "no") return;
        // da qui il contenuto segue il dito: si toglie solo la soglia, così un colpo rapido (pochi eventi) non si perde
        x0 += Math.sign(ddx) * 8;
        lock = ddx < 0 ? 1 : -1;
        // la velocità conta anche il tratto prima del blocco: un colpo breve arriva in pochi eventi
        track = [[t0, t.clientX - ddx]];
        x = 0;
        const f = follows()[0];
        W = (f ? f.getBoundingClientRect().width : innerWidth) + SWIPE_GAP;
        follows().forEach((el) => { el.style.willChange = "transform"; });
      }
      // gesto di lato: la pagina non scorre su e giù intanto. touch-action: pan-y non basta su iOS, che con il dito un po' in
      // diagonale faceva scorrere la pagina insieme allo swipe (la sezione nuova poi compariva più in basso): qui si ferma
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      track.push([now, t.clientX]);
      while (track.length > 2 && now - track[0][0] > 100) track.shift();
      if (track.length > 12) track.shift();
      const dx = t.clientX - x0, d = dx < 0 ? 1 : dx > 0 ? -1 : lock, still = G.reduced();
      if (d !== side) {
        if (side && opt.progress && !still && can(side)) opt.progress(0, side);
        side = d;
        if (opt.peek && can(d) && !peeks[d] && !still) {
          const p = opt.peek(d);
          if (p) { p.style.willChange = "transform"; peeks[d] = p; }
        }
      }
      // con una pagina accanto si segue il dito uno a uno; oltre l'ultima, resistenza
      x = can(d) ? (Math.abs(dx) <= W ? dx : Math.sign(dx) * (W + rubber(Math.abs(dx) - W, W))) : rubber(dx, W);
      if (still) return;
      schedule();
    }, { passive: false });
    // un tocco finito dopo uno swipe non apre la notizia su cui si è alzato il dito
    let swiped = 0;
    P.on(area, "click", (e) => { if (performance.now() - swiped < 400) { e.preventDefault(); e.stopPropagation(); } }, { capture: true });
    const release = (cancelled) => {
      if (mode !== "x") { mode = ""; return; }
      mode = "";
      swiped = performance.now();
      flush();
      const now = performance.now();
      let v = 0;
      // la velocità del dito negli ultimi 60 ms; se si era fermato prima di alzarsi, zero
      if (!cancelled && track.length > 1 && now - track[track.length - 1][0] < 80) {
        const b = track[track.length - 1];
        let a = track[0];
        for (let i = track.length - 2; i >= 0; i--) { a = track[i]; if (b[0] - a[0] >= 60) break; }
        v = (b[1] - a[1]) / Math.max(8, b[0] - a[0]);
      }
      const d = side;
      // dove arriverebbe la pagina lasciata andare con questa velocità: oltre un terzo abbondante, si passa
      const proj = x + v * 220;
      const go = !cancelled && d && can(d) && -d * x > 6 && -d * proj > W * 0.32;
      if (G.reduced()) {
        clear();
        if (go) { if (opt.commit) opt.commit(d); else (d > 0 ? opt.next : opt.prev)(reset, 0); }
        return;
      }
      if (go && opt.peek && peeks[d]) { settle(-d * W, v, () => opt.commit(d), d); return; }
      if (go && !opt.peek) {
        // la pagina vicina arriva con la transizione: parte da dove l'ha lasciata il dito, alla sua velocità
        const anim = G.swipeAnim(Math.max(0, -d * v), Math.max(1, W - Math.abs(x)));
        (d > 0 ? opt.next : opt.prev)(reset, x, anim);
        return;
      }
      if (go && opt.commit) { clear(); opt.commit(d); return; }
      settle(0, v, () => {});
    };
    P.on(area, "touchend", () => release(false), { passive: true });
    P.on(area, "touchcancel", () => release(true), { passive: true });
    // un tocco su una scheda fa lo stesso passaggio dello swipe: la pagina accanto (k: quale, anche non vicina) entra già
    // pronta, con la spinta di un colpo deciso del dito, e si posa con la stessa molla
    return {
      go(d, k) {
        if (busy) finishBusy();
        if (mode === "x" || !opt.peek || !opt.commit || G.reduced()) return false;
        clear();
        const f = follows()[0];
        W = (f ? f.getBoundingClientRect().width : innerWidth) + SWIPE_GAP;
        const p = opt.peek(d, k);
        if (!p) return false;
        p.style.willChange = "transform";
        peeks[d] = p; side = d; x = 0;
        follows().forEach((el) => { el.style.willChange = "transform"; });
        place();
        settle(-d * W, -d * 2.2, () => opt.commit(d, k), d);
        return true;
      },
      // un passaggio ancora in corso arriva subito
      finish() { if (busy) finishBusy(); }
    };
  };
  // l'indicatore di un gruppo di schede segue lo swipe: p da 0 a 1 verso la scheda vicina (d = 1 dopo, -1 prima);
  // con anim si posa insieme alla pagina, con la stessa molla. Solo transform: niente ricalcolo della pagina a ogni passo
  G.segFollow = (box, p, d, anim) => {
    const ind = box && box.querySelector(":scope > .seg-ind");
    if (!ind) return;
    let g = ind._g;
    if (!g || g.d !== d || !g.at || g.at + 1500 < performance.now()) {
      const btns = Array.from(box.querySelectorAll(":scope > button, :scope > a"));
      const on = btns.findIndex((b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-current") === "page" || b.getAttribute("aria-current") === "true");
      const a = btns[on], b = btns[on + d];
      if (!a || !b) return;
      g = ind._g = { d, xa: a.offsetLeft, wa: a.offsetWidth, xb: b.offsetLeft, wb: b.offsetWidth, at: 0,
        roll: box.scrollWidth > box.clientWidth + 1, sa: box.scrollLeft, sb: segCenter(box, b.offsetLeft, b.offsetWidth),
        a, b, ca: rgb(getComputedStyle(a).color), cb: rgb(getComputedStyle(b).color) };
      ind.style.width = g.wa + "px";
    }
    // anche il colore dei due nomi passa dall'uno all'altro con il dito (all'arrivo G.seg lascia fare al CSS)
    if (g.ca && g.cb) {
      const q = anim ? (p >= 1 ? 1 : 0) : p, tr = anim ? "color " + anim.D + "ms " + anim.ease : "none";
      g.a.style.transition = tr; g.b.style.transition = tr;
      g.a.style.color = mixRGB(g.ca, g.cb, q); g.b.style.color = mixRGB(g.cb, g.ca, q);
      // tornato indietro: finita la corsa i colori tornano quelli del CSS
      if (anim && p < 1) setTimeout(() => { if (!ind._g) untint(box); }, anim.D + 60);
    }
    // il binario delle schede scorre insieme alla pagina: la scheda di arrivo viene al centro mentre il dito la porta
    if (g.roll) {
      if (anim) box.scrollTo({ left: p >= 1 ? g.sb : g.sa, behavior: G.reduced() ? "auto" : "smooth" });
      else box.scrollLeft = g.sa + (g.sb - g.sa) * p;
    }
    g.at = performance.now();
    const x = g.xa + (g.xb - g.xa) * p, s = (g.wa + (g.wb - g.wa) * p) / g.wa;
    ind._follow = true;
    ind.style.transition = anim ? "transform " + anim.D + "ms " + anim.ease : "none";
    ind.style.transform = "translateX(" + x.toFixed(1) + "px) scaleX(" + s.toFixed(4) + ")";
    if (anim) {
      // a fine corsa G.seg trova l'indicatore già al suo posto e lo fissa senza farlo ripartire
      ind._pos = p >= 1 ? { x: g.xb, w: g.wb } : { x: g.xa, w: g.wa };
      ind._g = null;
    }
  };
  // su iOS lo stato :active (la risposta al tocco) funziona solo se c'è un ascoltatore touchstart
  document.addEventListener("touchstart", () => {}, { passive: true });
  let rz = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => {
      document.querySelectorAll(".seg, .mode").forEach((s) => G.seg(s, true));
      document.querySelectorAll(".chips").forEach((r) => r._fade && r._fade());
    });
  });

  G.initPrefs = () => {
    const html = document.documentElement;
    html.lang = G.lang;
    G.i18nStatic(document.body);
    // lingua: la scelta resta per le visite dopo; la pagina si ricarica nella lingua nuova (i dati tradotti sono altri file)
    document.querySelectorAll("[data-lang-set]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.langSet === G.lang));
      b.addEventListener("click", () => {
        if (b.dataset.langSet === G.lang) return;
        G.ls.set("gerico.lang", b.dataset.langSet);
        const u = new URL(location.href);
        u.searchParams.delete("lang");
        location.replace(u.href);
      });
    });
    G.intro();
    const groups = (sel) => new Set(Array.from(document.querySelectorAll(sel)).map((b) => b.parentElement));
    const applySize = (s) => {
      html.classList.toggle("size-1", s === 1); html.classList.toggle("size-2", s === 2);
      document.querySelectorAll("[data-size-set]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.sizeSet) === s)));
    };
    const applyTheme = () => {
      const dark = G.isDark();
      document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.themeSet === "dark") === dark)));
    };
    applySize(G.ls.get("gerico.size", 0));
    applyTheme();
    // cambio di tema o di dimensione del testo: la pagina vecchia sfuma sopra la nuova (CSS, html.theme-vt)
    const fade = (change) => {
      if (!document.startViewTransition || G.reduced()) { change(); return; }
      document.querySelectorAll("[style*='view-transition-name']").forEach((el) => { el.style.viewTransitionName = ""; });
      html.classList.add("theme-vt");
      const t = document.startViewTransition(change);
      t.finished.finally(() => html.classList.remove("theme-vt"));
    };
    document.querySelectorAll("[data-size-set]").forEach((b) => b.addEventListener("click", () => {
      const s = Number(b.dataset.sizeSet) || 0;
      if (s === (G.ls.get("gerico.size", 0) || 0)) return;
      fade(() => {
        G.ls.set("gerico.size", s); applySize(s);
        groups("[data-size-set]").forEach((g) => G.seg(g, true));
        window.dispatchEvent(new Event("resize"));
      });
    }));
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => {
      const changes = (b.dataset.themeSet === "dark") !== G.isDark();
      const apply = () => {
        G.ls.set("gerico.theme", b.dataset.themeSet);
        html.setAttribute("data-theme", b.dataset.themeSet);
        applyTheme();
        groups("[data-theme-set]").forEach((g) => G.seg(g));
      };
      // cambio di tema: una dissolvenza breve da un tema all'altro, su tutta la pagina
      if (!changes) { apply(); return; }
      fade(apply);
    }));

    // il menu è un dialog: tiene il focus dentro, si chiude con Esc, toccando fuori o con il pulsante
    const btn = document.querySelector(".menu-btn"), menu = document.getElementById("menu");
    if (btn && menu && typeof menu.showModal === "function") {
      const open = () => {
        if (menu.open) return;
        menu.classList.remove("closing");
        document.documentElement.classList.add("menu-open");
        menu.showModal();
        btn.setAttribute("aria-expanded", "true");
        // gli indicatori si misurano solo la prima volta (o dopo un ridimensionamento), nel fotogramma successivo
        requestAnimationFrame(() => menu.querySelectorAll(".seg").forEach((s) => {
          const ind = s.querySelector(":scope > .seg-ind");
          if (!ind || !ind._pos) G.seg(s, true);
        }));
      };
      const close = () => {
        if (!menu.open || menu.classList.contains("closing")) return;
        btn.setAttribute("aria-expanded", "false");
        const done = () => { menu.classList.remove("closing"); menu.close(); document.documentElement.classList.remove("menu-open"); btn.focus({ preventScroll: true }); };
        menu.classList.add("closing");
        const anims = G.reduced() || !menu.getAnimations ? [] : menu.getAnimations();
        if (!anims.length) return done();
        Promise.all(anims.map((a) => a.finished)).then(done, done);
      };
      btn.addEventListener("click", () => (menu.open ? close() : open()));
      menu.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
      // il focus gira dentro il pannello: dall'ultimo elemento si torna al primo e viceversa
      menu.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;
        const f = Array.from(menu.querySelectorAll("a[href], button:not([disabled])")).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const firstEl = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      });
      menu.addEventListener("click", (e) => { if (e.target === menu) close(); });
      menu.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
      // il primo disegno del menu si prepara in anticipo: la prima apertura resta leggera
      let warmed = false;
      const warm = () => {
        if (warmed || menu.open) return;
        warmed = true;
        menu.classList.add("warm");
        void menu.offsetHeight;
        menu.querySelectorAll(".seg").forEach((s) => G.seg(s, true));
        menu.classList.remove("warm");
      };
      // si prepara poco dopo l'apertura della pagina, a browser fermo (Safari non ha requestIdleCallback: un timer);
      // se tocchi il menu prima, si prepara al tocco
      const later = () => G.afterIntro(() => (window.requestIdleCallback ? requestIdleCallback(warm, { timeout: 2500 }) : setTimeout(warm, 1200)));
      if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
      btn.addEventListener("pointerdown", warm, { once: true });
      btn.addEventListener("focus", warm, { once: true });
      // la pagina in cui sei è segnata nel menu
      const clean = (p) => p.replace(/\/index(\.html)?$/, "/").replace(/\.html$/, "");
      menu.querySelectorAll(".menu-links a").forEach((a) => { if (clean(new URL(a.href).pathname) === clean(location.pathname)) a.setAttribute("aria-current", "page"); });
    }

    // interruttore Notizie / Terminal: la pillola va subito al suo posto; tra le due pagine la fa scivolare il passaggio (CSS)
    const mode = document.querySelector(".mode");
    if (mode) G.seg(mode, true);

    document.querySelectorAll(".chips").forEach(G.watchRow);
    G.watchTop();
    G.tabbar.mount();
  };

  // ---------- titoli da seguire: lo stesso blocco in prima pagina e nel Terminal ----------
  // Chi produce le analisi e i conflitti di interesse: la frase la decide chi cura GERICO (vedi come-funziona.html#titoli)
  G.TITOLI_DISC = G.L("A cura di Riccardo Peruzzo, che non ha posizioni sui titoli citati.", "Edited by Riccardo Peruzzo, who holds no positions in the stocks mentioned.");
  G.titoliFresh = (t) => !!(t && Array.isArray(t.items) && G.hoursAgo(t.asOf) < 30);
  G.titoliHTML = (t, h) => {
    const esc = G.esc;
    const row = (x) => {
      const p = typeof x.price === "number" ? G.num(x.price, x.price >= 1000 ? 0 : 2) + (x.market === "Usa" ? " $" : " €") : "";
      const c = typeof x.chg === "number" ? ' <b class="' + (x.chg > 0 ? "up" : x.chg < 0 ? "down" : "") + '">' + G.pct(x.chg) + "</b>" : "";
      return '<li class="tit-i"><p class="tit-top"><span class="tit-n">' + esc(x.name) + '</span><span class="tit-k">' + esc([x.ticker, x.market].filter(Boolean).join(" · ")) + "</span>" +
        (p ? '<span class="tit-p">' + esc(p) + c + "</span>" : "") + "</p>" +
        '<p class="tit-why"><strong>' + G.L("Perché", "Why") + "</strong> " + esc(x.why) + "</p>" +
        (x.signal ? '<p class="tit-sig">' + esc(x.signal) + "</p>" : "") +
        '<p class="tit-risk"><strong>' + G.L("Rischio", "Risk") + "</strong> " + esc(x.risk) + "</p>" +
        '<p class="tit-src">' + G.L("Fonte: ", "Source: ") + (x.sources || []).map((s) => '<a href="' + esc(G.safeUrl(s.url)) + '" target="_blank" rel="noopener">' + esc(s.name || G.L("articolo", "article")) + "</a>" +
          (s.date ? " (" + esc(G.dayOnly(s.date)) + ")" : "")).join(", ") + "</p></li>";
    };
    const s = h && h.summary;
    const rec = s && s.n >= 5 ? '<p class="tit-rec">' + G.L("Gli ultimi ", "The last ") + s.n + ": " + s.better + G.L(" meglio del loro indice dopo 5 sedute", " beat their index after 5 sessions") +
      (typeof s.avgExcess === "number" ? G.L(", in media ", ", on average ") + G.signed(s.avgExcess, 1) + G.L(" punti", " points") : "") + ".</p>" : "";
    const list = t.items.length ? '<ol class="tit-list">' + t.items.map(row).join("") + "</ol>"
      : '<p class="tit-none">' + G.L("Oggi nessun titolo passa i filtri.", "No stock passes the filters today.") + (t.note ? " " + esc(t.note) : "") + "</p>";
    const at = G.isToday(t.asOf) ? G.L("delle ", "at ") + G.hm(t.asOf) : G.L("del " + G.day(t.asOf) + " alle ", "of " + G.day(t.asOf) + " at ") + G.hm(t.asOf);
    return list + rec + '<p class="tit-disc">' + (G.TITOLI_DISC ? esc(G.TITOLI_DISC) + " " : "") + G.L("Analisi automatica di GERICO ", "GERICO automatic analysis ") + esc(at) +
      G.L(": segnali sui prezzi e notizie con data. Non è una consulenza personalizzata: può sbagliare e si può perdere denaro. ", ": price signals and dated news. It is not personalised advice: it can be wrong and you can lose money. ") +
      '<a href="come-funziona.html#' + G.L("titoli", "stocks") + '">' + G.L("Metodo e rischi", "Method and risks") + "</a>.</p>";
  };

  // ---------- mappa a quadrati (treemap squarified) ----------
  G.MARKETS = {
    USA: ["Stati Uniti", "S&P 500"], JPN: ["Giappone", "Nikkei 225"], TWN: ["Taiwan", "Taiex"],
    GBR: ["Regno Unito", "FTSE 100"], CAN: ["Canada", "S&P/TSX"], KOR: ["Corea del Sud", "Kospi"],
    CHN: ["Cina", "CSI 300"], FRA: ["Francia", "CAC 40"], CHE: ["Svizzera", "SMI"], DEU: ["Germania", "DAX"],
    IND: ["India", "Nifty 50"], NLD: ["Paesi Bassi", "AEX"], ITA: ["Italia", "FTSE MIB"], BRA: ["Brasile", "Bovespa"]
  };
  G.NO_DATA = "#4A505C";
  G.BANDS = [
    ["#B3261E", G.L("−1% o meno", "−1% or less")], ["#8C1F1A", G.L("da −1 a −0,5", "−1 to −0.5")], ["#56201C", G.L("da −0,5 a 0", "−0.5 to 0")],
    ["#1B4A33", G.L("da 0 a +0,5", "0 to +0.5")], ["#0D5F32", G.L("da +0,5 a +1", "+0.5 to +1")], ["#0F7A3F", G.L("+1% o più", "+1% or more")]
  ];
  G.band = (c) => (typeof c !== "number" ? G.NO_DATA : c >= 1 ? "#0F7A3F" : c >= 0.5 ? "#0D5F32" : c >= 0 ? "#1B4A33" : c > -0.5 ? "#56201C" : c > -1 ? "#8C1F1A" : "#B3261E");

  G.squarify = (items, W, H) => {
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    const areas = items.map((i) => (i.value * W * H) / total);
    const out = [];
    let x = 0, y = 0, w = W, h = H, row = [], i = 0;
    const worst = (r, side) => {
      const s = r.reduce((a, b) => a + b, 0); let m = 0;
      for (const a of r) m = Math.max(m, (side * side * a) / (s * s), (s * s) / (side * side * a));
      return m;
    };
    const place = (r) => {
      const s = r.reduce((a, b) => a + b, 0);
      if (w >= h) { const cw = s / h; let cy = y; for (const a of r) { const ah = a / cw; out.push({ x, y: cy, w: cw, h: ah }); cy += ah; } x += cw; w -= cw; }
      else { const rh = s / w; let cx = x; for (const a of r) { const aw = a / rh; out.push({ x: cx, y, w: aw, h: rh }); cx += aw; } y += rh; h -= rh; }
    };
    while (i < areas.length) {
      const side = Math.max(Math.min(w, h), 1e-6), a = areas[i];
      if (!row.length || worst(row.concat(a), side) <= worst(row, side)) { row.push(a); i++; }
      else { place(row); row = []; }
    }
    if (row.length) place(row);
    return items.map((it, k) => Object.assign({}, it, out[k]));
  };

  // pesi + variazioni -> quadrati in ordine di peso (solo i 14 Paesi della mappa)
  // una Borsa che manca nella pubblicazione, o che lì ha una chiusura vecchia, prende l'ultima seduta scaricata dal job
  // (Yahoo Finance), se è di pochi giorni fa
  const MAP_SYM = {
    USA: "^GSPC", JPN: "^N225", GBR: "^FTSE", FRA: "^FCHI", DEU: "^GDAXI", ITA: "FTSEMIB.MI", TWN: "^TWII", CAN: "^GSPTSE",
    KOR: "^KS11", CHN: "000300.SS", CHE: "^SSMI", IND: "^NSEI", NLD: "^AEX", BRA: "^BVSP"
  };
  // se l'indice di un Paese manca (Yahoo a volte non dà il Csi 300), ce n'è uno di riserva, con il suo nome
  const MAP_ALT = { CHN: ["000001.SS", "Shanghai Composite"] };
  const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  // la data scritta nella nota («Chiusura del 27 ottobre») come AAAA-MM-GG, "" se non c'è
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const noteDate = (note) => {
    const m = new RegExp("\\b(\\d{1,2}) (" + MESI.concat(MONTHS).join("|") + ")\\b", "i").exec(note || "");
    if (!m) return "";
    const today = G.dayKey(new Date()), y = Number(today.slice(0, 4)), mm = m[2].toLowerCase();
    const key = (yy) => yy + "-" + String((MESI.indexOf(mm) + 1) || (MONTHS.indexOf(mm) + 1)).padStart(2, "0") + "-" + m[1].padStart(2, "0");
    return key(y) > today ? key(y - 1) : key(y);
  };
  const fromQuote = (q) => {
    if (!q || q.stale || typeof q.chg !== "number" || !/^\d{4}-\d{2}-\d{2}$/.test(q.date || "")) return null;
    const age = G.dayAge(q.date + "T12:00:00Z");
    if (age > 4) return null;
    return { chg: q.chg, time: G.hm(q.at), note: G.qNote(q) + "." };
  };
  G.mapItems = (weights, terminal, view, quotes) => {
    const w = (weights && weights[view === "europa" ? "europe" : "world"]) || {};
    const by = {}, qs = {};
    ((terminal && terminal.indices) || []).forEach((x) => { if (x && x.code) by[x.code] = x; });
    ((quotes && quotes.groups) || []).forEach((g) => (g.items || []).forEach((q) => { if (q && q.sym) qs[q.sym] = q; }));
    return Object.keys(w).filter((k) => G.MARKETS[k] && typeof w[k] === "number").map((k) => {
      let q = qs[MAP_SYM[k]], alt = fromQuote(q), index = G.MARKETS[k][1];
      if (!alt && MAP_ALT[k] && fromQuote(qs[MAP_ALT[k][0]])) { q = qs[MAP_ALT[k][0]]; alt = fromQuote(q); index = MAP_ALT[k][1]; }
      const own = by[k];
      // il numero è quello della Borsa scaricato dal job (più fresco, per tutte le Borse); quello della redazione resta
      // solo se dice una seduta più nuova, o se il job non ce l'ha (anche senza numero con una nota: Borsa chiusa per festa)
      const newer = !!(own && alt && noteDate(own.note) && noteDate(own.note) > q.date);
      const d = (alt && !newer ? alt : own && (typeof own.chg === "number" || own.note) ? own : alt) || {};
      // dal job anche i livelli: ultimo, apertura della seduta e chiusura precedente (per il dettaglio)
      const lv = d === alt && q ? { sym: q.sym, last: q.last, open: q.open, prev: q.prev } : {};
      return Object.assign({ code: k, name: G.MARKETS[k][0], index: d === alt ? index : G.MARKETS[k][1], value: w[k], chg: typeof d.chg === "number" ? d.chg : null, time: d.time || "", note: d.note || "", story: (own && own.story) || "" }, lv);
    }).sort((a, b) => b.value - a.value);
  };

  // ---------- prezzi nuovi a pagina aperta ----------
  // Ogni tre minuti, e tornando sulla pagina, si chiede quotes.json al sito: una richiesta piccola, quasi sempre «non
  // cambiato». Se il job ha pubblicato prezzi nuovi la pagina ridisegna i suoi numeri (apply), senza animazioni e mai
  // mentre il dito è sullo schermo o qualcosa si sta muovendo: in quel caso riprova poco dopo
  let touchNow = false;
  document.addEventListener("touchstart", () => { touchNow = true; }, { passive: true, capture: true });
  ["touchend", "touchcancel"].forEach((ev) => document.addEventListener(ev, () => { touchNow = false; }, { passive: true, capture: true }));
  const moving = () => touchNow || !!window.gericoVT || (document.getAnimations ? document.getAnimations() : []).some((a) => {
    if (a.playState !== "running" || !a.effect || !a.effect.getTiming) return false;
    return a.effect.getTiming().iterations !== Infinity;
  });
  G.liveQuotes = (P, asOf, apply) => {
    let last = asOf || "", at = Date.now();
    const run = (q) => {
      if (moving()) { P.later(() => run(q), 1200); return; }
      last = q.asOf;
      try { apply(q); } catch (e) { console.error(e); }
    };
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      at = Date.now();
      const q = await G.load("quotes", true);
      if (!q || !q.asOf || (last && !(Date.parse(q.asOf) > Date.parse(last)))) return;
      run(q);
    };
    P.every(check, 180000);
    P.on(document, "visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - at > 60000) check(); });
  };

  // ---------- prezzi del job dentro i dati della redazione ----------
  // La redazione scrive le chiusure leggendo le testate, con il perché e la storia collegata; il job «Prezzi» prende i
  // numeri dalla Borsa (Yahoo Finance), ogni mezz'ora e per tutti gli strumenti. Per ogni voce che hanno tutti e due vale
  // il dato più recente: quello del job, salvo quando la redazione ha una seduta più nuova. Spiegazioni e storie restano;
  // le voci principali che la redazione non ha (altre valute, oro, argento...) le aggiunge il job.
  const Q_OF = {
    "s&p 500": "^GSPC", "nasdaq": "^IXIC", "nasdaq composite": "^IXIC", "nasdaq 100": "^NDX", "dow jones": "^DJI",
    "euro stoxx 50": "^STOXX50E", "eurostoxx 50": "^STOXX50E", "dax": "^GDAXI", "ftse mib": "FTSEMIB.MI", "cac 40": "^FCHI",
    "ftse 100": "^FTSE", "ibex 35": "^IBEX", "ibex": "^IBEX", "smi": "^SSMI", "aex": "^AEX", "nikkei": "^N225", "nikkei 225": "^N225",
    "hang seng": "^HSI", "shanghai": "000001.SS", "shanghai composite": "000001.SS", "csi 300": "000300.SS", "kospi": "^KS11",
    "taiex": "^TWII", "nifty 50": "^NSEI", "s&p/tsx": "^GSPTSE", "bovespa": "^BVSP",
    "eur/usd": "EURUSD=X", "euro/dollaro": "EURUSD=X", "gbp/usd": "GBPUSD=X", "sterlina/dollaro": "GBPUSD=X", "usd/jpy": "USDJPY=X",
    "dollaro/yen": "USDJPY=X", "eur/gbp": "EURGBP=X", "euro/sterlina": "EURGBP=X", "usd/chf": "USDCHF=X", "dollaro/franco": "USDCHF=X",
    "aud/usd": "AUDUSD=X", "usd/cad": "USDCAD=X", "nzd/usd": "NZDUSD=X", "indice del dollaro": "DX-Y.NYB", "dollar index": "DX-Y.NYB",
    "brent": "BZ=F", "petrolio brent": "BZ=F", "wti": "CL=F", "petrolio wti": "CL=F", "gas ttf": "TTF=F", "gas": "TTF=F",
    "oro": "GC=F", "argento": "SI=F", "rame": "HG=F", "bitcoin": "BTC-USD", "ether": "ETH-USD", "ethereum": "ETH-USD",
    "treasury 10 anni": "^TNX", "treasury usa 10 anni": "^TNX"
  };
  // le voci che ogni classe deve avere, nell'ordine; per gli indici solo se la redazione non ne ha scritto nessuno
  const ENSURE = {
    valute: ["EURUSD=X", "GBPUSD=X", "USDJPY=X", "EURGBP=X", "USDCHF=X"],
    materie: ["BZ=F", "CL=F", "TTF=F", "GC=F", "SI=F", "HG=F"],
    cripto: ["BTC-USD", "ETH-USD"],
    obbligazioni: ["^TNX"]
  };
  const ONLY_IF_EMPTY = { indici: ["^GSPC", "^IXIC", "^DJI", "FTSEMIB.MI", "^GDAXI", "^FCHI", "^FTSE", "^N225"] };
  const CLASS_LABEL = { indici: "Indici", valute: "Valute", materie: "Materie prime", cripto: "Cripto", obbligazioni: "Titoli di Stato" };
  const UNIT = { "BZ=F": " $", "CL=F": " $", "GC=F": " $", "SI=F": " $", "HG=F": " $", "TTF=F": " €/MWh", "BTC-USD": " $", "ETH-USD": " $" };
  const qValue = (q) => (q.sym === "^TNX" ? G.num(q.last, 2) + "%" : /-USD$/.test(q.sym) ? G.num(q.last, 0) : G.price(q.sym, q.last)) + (UNIT[q.sym] || "");
  // quando è il dato. Le Borse hanno sedute: in corso, chiusa oggi a quell'ora, chiusura di un giorno prima. Valute,
  // materie prime, cripto e tassi si scambiano quasi sempre: per loro solo l'ora (o il giorno) del dato
  G.qNote = (q) => {
    const age = G.dayAge(q.date + "T12:00:00Z"), cont = /=X$|=F$|-USD$|^DX-Y|^\^(TNX|IRX|FVX|TYX)$/.test(q.sym || "");
    const today = age === 0 && q.at;
    const head = cont ? (today ? G.L("Dato delle ", "Data at ") + G.hm(q.at) : G.L("Dato del ", "Data of ") + G.dayOnly(q.date))
      : today && q.state === "aperta" ? G.L("Seduta in corso alle ", "Session under way at ") + G.hm(q.at)
      : today && q.state === "chiusa" ? G.L("Chiusura delle ", "Close at ") + G.hm(q.at)
      : today ? G.L("Dato delle ", "Data at ") + G.hm(q.at) : G.L("Chiusura del ", "Close of ") + G.dayOnly(q.date);
    return head + " (Yahoo Finance)";
  };
  const usable = (q) => !!q && !q.stale && typeof q.last === "number" && /^\d{4}-\d{2}-\d{2}$/.test(q.date || "") && G.dayAge(q.date + "T12:00:00Z") <= 4;
  // valore della redazione che non è un numero vero: manca, oppure «sotto 77.000», «sopra 1,34»
  const vague = (v) => !v || /^(—|-|n\.?d\.?)$/i.test(String(v).trim()) || /^(sotto|sopra|circa|oltre)\b/i.test(String(v).trim());
  const fromJob = (base, q) => {
    const out = Object.assign({}, base, { value: qValue(q), note: G.qNote(q), src: "job" });
    if (q.sym === "^TNX") { delete out.chg; out.bp = typeof q.bp === "number" ? q.bp : null; }
    else { delete out.bp; out.chg = typeof q.chg === "number" ? q.chg : null; }
    return out;
  };
  G.withQuotes = (m, quotes) => {
    if (!quotes || !Array.isArray(quotes.groups)) return m;
    const qs = {};
    quotes.groups.forEach((g) => (g.items || []).forEach((q) => { if (q && q.sym) qs[q.sym] = q; }));
    let used = false;
    const classes = ((m && m.classes) || []).map((c) => {
      let fromQ = 0;
      const items = (c.items || []).map((it) => {
        const q = qs[Q_OF[G.shortName(it.name).toLowerCase()]];
        if (!usable(q)) return it;
        const nd = noteDate(it.note);
        if (nd && nd > q.date && !vague(it.value)) return it;
        fromQ += 1;
        return fromJob(it, q);
      });
      const want = ENSURE[c.key] || (!items.length ? ONLY_IF_EMPTY[c.key] : null) || [];
      const have = new Set(items.map((it) => Q_OF[G.shortName(it.name).toLowerCase()]).filter(Boolean));
      let added = 0;
      want.forEach((sym) => { if (!have.has(sym) && usable(qs[sym])) { items.push(fromJob({ name: qs[sym].name }, qs[sym])); added += 1; } });
      if (!fromQ && !added) return c;
      used = true;
      const out = Object.assign({}, c, { items });
      // la nota della classe che diceva cosa mancava, o di quando erano i dati, non vale più
      if (out.note && ((added && /nessun dato|non hanno un dato|mancan|non disponibil/i.test(out.note)) ||
        (fromQ * 2 >= (c.items || []).length && /stamattina|seduta in corso|dati d[ie]l?|chiusur|apertur|livello non indicato/i.test(out.note)))) delete out.note;
      return out;
    });
    // classi intere che la redazione non ha scritto
    Object.keys(Object.assign({}, ENSURE, ONLY_IF_EMPTY)).forEach((key) => {
      if (classes.some((c) => c.key === key)) return;
      const items = (ENSURE[key] || ONLY_IF_EMPTY[key]).filter((sym) => usable(qs[sym])).map((sym) => fromJob({ name: qs[sym].name }, qs[sym]));
      if (items.length) { classes.push({ key, label: CLASS_LABEL[key], items }); used = true; }
    });
    if (!used) return m;
    // l'ora dei dati è quella del più recente dei due; la dicitura della redazione («Chiusura delle Borse europee») vale
    // solo se è lei la più nuova
    const fresher = quotes.asOf && (!m || !m.asOf || Date.parse(quotes.asOf) > Date.parse(m.asOf));
    return Object.assign({}, m || {}, { classes, asOf: fresher ? quotes.asOf : m.asOf, label: fresher ? "" : (m && m.label) || "" });
  };

  G.drawMap = (el, items, opts) => {
    opts = opts || {};
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    const rects = G.squarify(items, W, H);
    el.innerHTML = rects.map((r, k) => {
      const has = typeof r.chg === "number";
      const cg = has ? G.pct(r.chg) : "";
      // la Borsa scelta, se ha i suoi titoli (Terminal, opts.enter): toccandola di nuovo si entra nell'indice
      const go = !!(opts.enter && r.code === opts.selected && opts.enter(r.code));
      const label = G.tn(r.name) + (r.index ? ", " + r.index : "") + ", " + (has ? cg : G.L("nessun dato oggi", "no data today")) + G.L(", peso ", ", weight ") + G.wt(r.value) +
        (go ? G.L(". Tocca di nuovo per vedere i suoi titoli", ". Tap again to see its stocks") : "");
      let size = r.w >= 170 && r.h >= 110 ? "big" : r.w >= 90 && r.h >= 56 ? "med" : r.w >= 40 && r.h >= 30 ? "small" : r.w >= 22 && r.h >= 14 ? "tiny" : "none";
      let inner = "";
      if (!has) {
        // senza dato: grigio con la sola sigla
        inner = size === "none" ? "" : '<span class="a"><span class="nm">' + r.code + "</span></span>";
      } else if (size === "big") {
        inner = '<span class="a"><span class="nm">' + G.esc(G.tn(r.name)) + '</span><span class="ix">' + G.esc(r.index) + '</span></span><span class="b"><span class="cg" data-n="' + r.chg + '" data-f="pct%">' + cg + "</span></span>" +
          (go ? '<span class="go" aria-hidden="true">' + G.L("Titoli", "Stocks") + " ›</span>" : "");
      } else if (size === "med") {
        inner = '<span class="a"><span class="nm">' + G.esc(G.tn(r.name)) + '</span></span><span class="b"><span class="cg" data-n="' + r.chg + '" data-f="pct%">' + cg + "</span></span>";
      } else if (size === "small") {
        inner = '<span class="a"><span class="nm">' + r.code + "</span></span>" + (r.w >= 46 ? '<span class="b"><span class="cg" data-n="' + r.chg + '" data-f="pct%">' + cg + "</span></span>" : "");
      } else if (size === "tiny") {
        inner = '<span class="a"><span class="nm">' + r.code + "</span></span>";
      }
      const style = "left:" + r.x.toFixed(1) + "px;top:" + r.y.toFixed(1) + "px;width:" + r.w.toFixed(1) + "px;height:" + r.h.toFixed(1) + "px;background:" + G.band(r.chg) + ";--k:" + k;
      const cls = "tile " + size + (has ? "" : " nodata");
      if (opts.interactive) {
        return '<button type="button" class="' + cls + '" data-code="' + r.code + '" aria-pressed="' + (r.code === opts.selected) + '" aria-label="' + G.esc(label) + '" style="' + style + '">' + inner + "</button>";
      }
      return '<div class="' + cls + '" style="' + style + '">' + inner + "</div>";
    }).join("");
    return rects;
  };
})();
