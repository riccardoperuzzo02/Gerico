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
  // una copia di un pezzo di pagina che serve solo da immagine durante un passaggio (la lista che esce, la sezione
  // accanto): niente id doppi nella pagina e niente rimandi a id che nella copia non ci sono più
  G.inertCopy = (root) => {
    root.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    root.querySelectorAll("[aria-labelledby], [aria-controls], [aria-describedby], label[for]").forEach((el) => {
      ["aria-labelledby", "aria-controls", "aria-describedby", "for"].forEach((a) => el.removeAttribute(a));
    });
    return root;
  };
  // con la tastiera il fuoco non resta mai nascosto sotto una barra ferma (l'intestazione, le sezioni, la barra in basso):
  // se l'elemento che ha preso il fuoco è coperto da una barra, la pagina scorre di quel che serve per scoprirlo
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!el || !el.matches || !el.matches(":focus-visible") || el.closest("dialog, header, .pb, .sec-nav, .ultim")) return;
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || !r.width) return;
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
      const bar = (y) => {
        const t = document.elementFromPoint(x, Math.min(innerHeight - 1, Math.max(0, y)));
        if (!t || t === el || el.contains(t) || t.contains(el)) return null;
        for (let n = t; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === "sticky" || p === "fixed") return n; }
        return null;
      };
      const up = bar(r.top + Math.min(r.height / 2, 14)), down = bar(r.bottom - Math.min(r.height / 2, 14));
      if (up && up.getBoundingClientRect().top < innerHeight / 2) window.scrollBy({ top: r.top - up.getBoundingClientRect().bottom - 12, behavior: "instant" });
      else if (down && down.getBoundingClientRect().top >= innerHeight / 2) window.scrollBy({ top: r.bottom - down.getBoundingClientRect().top + 12, behavior: "instant" });
    });
  });
  // la parte dopo # di un indirizzo, decodificata; vuota se l'indirizzo è scritto male (%E0%A4 da solo fa cadere decodeURIComponent)
  G.unhash = (h) => { try { return decodeURIComponent(String(h || "").replace(/^#/, "")); } catch (e) { return ""; } };

  // ---------- lingua: italiano o inglese ----------
  // si sceglie nel menu (o con ?lang=en nell'indirizzo) e resta per le visite dopo. I testi dell'interfaccia stanno nelle
  // chiamate G.L(italiano, inglese) e, per le pagine e i nomi fissi, nel dizionario EN qui sotto. I contenuti arrivano
  // tradotti da scripts/traduci.py (data/tr/en.json e data/tr/it.json), applicati in G.load
  G.lang = (() => {
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q === "en" || q === "it") {
        localStorage.setItem("gerico.lang", JSON.stringify(q));
        // la scelta è salvata: l'indirizzo torna pulito (resta l'ancora, come #seguiti)
        const u = new URL(location.href);
        u.searchParams.delete("lang");
        history.replaceState(history.state, "", u.pathname + u.search + u.hash);
      }
      // arrivo da un cambio di lingua in un browser senza transizioni tra pagine: la pagina entra sfumando
      if (sessionStorage.getItem("gerico.cambioLingua") === "1" && !("onpageswap" in window)) document.documentElement.classList.add("lingua-entra");
      sessionStorage.removeItem("gerico.cambioLingua");
    } catch (e) { /* niente */ }
    return G.ls.get("gerico.lang", "it") === "en" ? "en" : "it";
  })();
  G.en = G.lang === "en";
  // la pagina di nuovo, nella lingua appena scelta: si va allo stesso indirizzo con ?lang= (un indirizzo nuovo carica
  // davvero la pagina anche con un'ancora come #mondo, e lo script nell'head mette subito la lingua giusta; poi
  // l'indirizzo torna pulito). Dove il browser sa fare le transizioni tra pagine, la pagina vecchia sfuma in quella
  // nuova (solo per il cambio di lingua: vedi pageswap); altrove la pagina sfuma prima di ricaricarsi
  G.ricarica = (lingua) => {
    const u = new URL(location.href);
    u.searchParams.set("lang", lingua || (G.ls.get("gerico.lang", "it") === "en" ? "en" : "it"));
    try { sessionStorage.setItem("gerico.cambioLingua", "1"); } catch (e) { /* niente */ }
    const vai = () => location.replace(u.href);
    if ("onpageswap" in window || G.reduced()) { vai(); return; }
    document.documentElement.classList.add("lingua-esce");
    setTimeout(vai, 180);
  };
  // le transizioni tra pagine intere (CSS @view-transition) servono solo al cambio di lingua: gli altri passaggi tra
  // pagine li fa già G.go, e una pagina statica (archivio, /s/) si apre come sempre
  window.addEventListener("pageswap", (e) => {
    if (!e.viewTransition) return;
    let lingua = false;
    try { lingua = sessionStorage.getItem("gerico.cambioLingua") === "1"; } catch (x) { /* niente */ }
    if (!lingua || G.reduced()) e.viewTransition.skipTransition();
  });
  G.L = (it, en) => (G.en ? en : it);
  document.documentElement.lang = G.lang;
  const EN = {
    // pagine
    "GERICO · Le notizie del giorno, scritte su tutte le fonti": "GERICO · The day's news, written from every source",
    "GERICO Terminal · I mercati a colpo d'occhio": "GERICO Terminal · Markets at a glance",
    "Una storia · GERICO": "A story · GERICO", "Come funziona · GERICO": "How it works · GERICO", "Privacy · GERICO": "Privacy · GERICO", "Glossario · GERICO": "Glossary · GERICO", "Collabora · GERICO": "Collaborate · GERICO",
    "Pagina non trovata · GERICO": "Page not found · GERICO",
    "Vai alle notizie": "Skip to the news", "Vai alla storia": "Skip to the story", "Vai alla mappa": "Skip to the map", "Vai al testo": "Skip to the text",
    "GERICO, prima pagina": "GERICO, front page", "Oggi": "Today", "Notizie o Terminal": "News or Terminal", "Notizie": "News",
    "Menu": "Menu", "Ultim'ora": "Latest", "Ferma lo scorrimento": "Pause the ticker", "Chiudi il menu": "Close the menu", "Pagine": "Pages",
    "Come funziona": "How it works", "Collabora": "Collaborate", "Archivio": "Archive", "Glossario": "Glossary", "Tema": "Theme", "Chiaro": "Light", "Scuro": "Dark", "Testo": "Text", "Normale": "Normal",
    "Grande": "Large", "Molto grande": "Very large", "Lingua": "Language", "Ascolta il riepilogo": "Listen to the briefing",
    "Il riepilogo di oggi": "Today's briefing", "Notizie e mercati, con l'aggiornamento di oggi": "News and markets, from today's update",
    "Mercati": "Markets", "Apri il Terminal": "Open the Terminal", "Gruppi di mercati": "Market groups", "Sezioni": "Sections", "Carico l'edizione…": "Loading the edition…",
    "Nessun consiglio di investimento": "Not investment advice", "Prima pagina": "Front page", "Condividi": "Share",
    "Articoli scritti con l'intelligenza artificiale, voce sintetica": "Articles written with artificial intelligence, synthetic voice",
    "Carico la storia…": "Loading the story…", "Fonti e temi": "Sources and topics", "Sezioni del Terminal": "Terminal sections",
    "Mappa": "Map", "Indici": "Indices", "Valute": "Currencies", "Tassi": "Rates", "Materie prime": "Commodities", "Agenda": "Calendar",
    "Macro": "Macro", "Sentiment": "Sentiment", "Titoli": "Stocks", "Vai a": "Go to", "Vai": "Go",
    "mappa europa, eurusd, oro, macro…": "europe map, eurusd, gold, macro…",
    "GERICO Terminal: mercati e agenda": "GERICO Terminal: markets and calendar", "Mappa dei mercati": "Market map",
    "Vista della mappa": "Map view", "Mondo": "World", "Europa": "Europe",
    "Ogni quadrato è una Borsa: più è grande, più pesa nell'indice mondiale MSCI ACWI.": "Each square is a stock market: the bigger it is, the more it weighs in the MSCI ACWI world index.",
    "Tocca un quadrato per vedere il dettaglio.": "Tap a square to see the details.", "Tassi a 10 anni": "10-year yields",
    "Agenda di oggi": "Today's calendar", "Prezzi e grafici": "Prices and charts", "Gruppo di strumenti": "Instrument group",
    "Prezzi in diretta": "Live prices", "Notizie sui mercati": "Market news", "Tono delle notizie": "News tone", "Titoli da seguire": "Stocks to watch",
    "Un segnale sui prezzi e una notizia che possono muoverli nei prossimi giorni.": "A price signal and a news item that could move them in the coming days.",
    "Macro: Stati Uniti ed eurozona": "Macro: United States and euro area", "Documenti SEC": "SEC filings",
    "Trimestrali e cedole": "Earnings and dividends", "Trimestrali": "Earnings", "Cedole": "Dividends", "Cosa mostrare": "What to show",
    "Questa pagina non c'è.": "This page doesn't exist.", "Forse la storia è stata archiviata.": "The story may have been archived.",
    "Torna alla prima pagina": "Back to the front page", "Navigazione": "Navigation", "Ascolta": "Listen",
    "Gestionale · GERICO": "Dashboard · GERICO", "Gestionale": "Dashboard", "Carico…": "Loading…",
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
    "Spread Btp-Bund": "BTP-Bund spread", "Borsa Usa": "US stocks", "Dollaro": "Dollar", "Nikkei 225 (Tokyo)": "Nikkei 225 (Tokyo)",
    "Future Usa": "US futures", "Future S&P 500": "S&P 500 futures", "Future Nasdaq 100": "Nasdaq 100 futures", "Future Dow Jones": "Dow Jones futures"
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
      titoli: ["why", "risk", "signal", "note"], archivio: ["t", "s"]
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
    // i temi caldi tengono anche il nome italiano: è quello che si salva tra i temi seguiti, in ogni lingua
    if (out && Array.isArray(out.themes) && Array.isArray(data.themes)) out.themes.forEach((t, i) => { if (t && data.themes[i]) t.labelIt = data.themes[i].label; });
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
  // «sabato 7 novembre»: il giorno della settimana e la data, senza l'anno
  G.weekDay = (iso) => { const d = valid(iso); return d ? fWeek.format(d) : ""; };
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
  // ---------- aggiornamenti in ritardo ----------
  // Le notizie escono dopo i giri delle 7:18 e delle 13:18, i prezzi ogni mezz'ora nei giorni di Borsa. Quando uno
  // atteso non è arrivato, accanto all'ora compare un'etichetta discreta («in ritardo»); toccandola si legge perché.
  const giroDi = (now, min, ieri) => new Date(Date.now() - ((now.min - min) + (ieri ? 1440 : 0)) * 60000);
  const hhmm = (m) => Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
  // l'ora del giro che manca («13:18»), o null: un giro conta un'ora dopo la partenza (la pubblicazione ne vuole una ventina di minuti)
  G.ritardoNotizie = (iso) => {
    const d = valid(iso), now = G.romeNow();
    if (!d) return null;
    for (const [m, ieri] of [[798, false], [438, false], [798, true]]) {
      if (!ieri && now.min < m + 60) continue;
      return d < giroDi(now, m, ieri) ? hhmm(m) : null;
    }
    return null;
  };
  // i prezzi: nei giorni feriali dalle 8:30 alle 22:45, più di 75 minuti senza un aggiornamento
  G.ritardoPrezzi = (iso) => {
    const d = valid(iso), now = G.romeNow();
    return !!d && now.wd >= 1 && now.wd <= 5 && now.min >= 510 && now.min <= 1365 && Date.now() - d > 75 * 60000;
  };
  G.ritardoHTML = (nota) => '<button type="button" class="ritardo" aria-expanded="false" data-nota="' + G.esc(nota) + '">' +
    '<i aria-hidden="true"></i><span>' + G.L("in ritardo", "delayed") + "</span></button>";
  G.ritardoNotiziePill = (iso) => {
    const giro = G.ritardoNotizie(iso);
    return giro ? G.ritardoHTML(G.L("L'aggiornamento delle " + giro + " non è ancora uscito: qui trovi l'ultima edizione pubblicata. Appena arriva, lo vedi ricaricando la pagina.",
      "The " + giro + " update has not come out yet: this is the latest edition published. Once it arrives, reload the page to see it.")) : "";
  };
  G.ritardoPrezziPill = (iso) => G.ritardoPrezzi(iso) ? G.ritardoHTML(G.L("I prezzi arrivano ogni mezz'ora nelle ore di Borsa, ma l'ultimo aggiornamento è " + G.when(iso) + ". Quando arriva il prossimo, la pagina lo mostra da sola.",
    "Prices come every half hour during market hours, but the latest update is " + G.when(iso) + ". When the next one arrives, the page shows it by itself.")) : "";
  // toccando l'etichetta, sotto la riga si apre (e si richiude) la spiegazione
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".ritardo");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const riga = b.closest("p, h2, .tk-top, .t-asofrow") || b.parentElement;
    let n = riga.nextElementSibling;
    if (n && n.classList.contains("ritardo-nota")) {
      b.setAttribute("aria-expanded", "false");
      n.remove();
      return;
    }
    n = document.createElement("p");
    n.className = "ritardo-nota";
    n.id = "rn-" + Math.random().toString(36).slice(2, 8);
    n.textContent = b.dataset.nota;
    riga.after(n);
    b.setAttribute("aria-controls", n.id);
    b.setAttribute("aria-expanded", "true");
  }, true);
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
  // la firma di tutti gli articoli: «A cura di R.P.». Che sono scritti con l'intelligenza artificiale (e che la voce del
  // riepilogo è sintetica) lo dice il piede di ogni pagina: scelta di Riccardo, niente dicitura nella firma
  G.FIRMA = "R.P.";
  G.CURA = G.L("A cura di", "Edited by");
  G.desk = () => G.CURA + " " + G.FIRMA;
  G.cardBy = () => '<p class="c-by"><span class="c-desk"><span class="c-cura">' + G.esc(G.CURA) + "</span> " + G.esc(G.FIRMA) + "</span></p>";
  // l'immagine della storia: la mappa del luogo, disegnata da GERICO (scripts/mappe.py), con il luogo scritto sopra.
  // Solo file del sito (img/storie/...): niente immagini da altri siti
  const PIN = '<svg aria-hidden="true" width="10" height="13" viewBox="0 0 10 13"><path d="M5 0a5 5 0 0 0-5 5c0 3.6 5 8 5 8s5-4.4 5-8a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor"/></svg>';
  const imgSeen = new Set();
  G.storyImg = (s, o) => {
    // economia, mercati e tecnologia: se la redazione ha scritto il numero della notizia, l'immagine è quel numero
    const f = s && s.figure;
    if (f && typeof f.value === "string" && typeof f.label === "string" && ["economia", "mercati", "tecnologia"].includes(s.section)) {
      return '<figure class="media cifra' + (o && o.cls ? " " + o.cls : "") + '"><div class="cf-in"><b class="cf-v' + (f.value.length > 8 ? " lungo" : "") + '">' + G.esc(f.value) + '</b><span class="cf-l">' + G.esc(G.tn ? G.tn(f.label) : f.label) + "</span></div></figure>";
    }
    // la foto del luogo della notizia, da Wikimedia Commons, tenuta sul sito; sotto, autore e licenza
    const ph = s && s.photo;
    if (ph && typeof ph.src === "string" && /^img\/foto\/[\w.-]+\.jpg(\?v=\w+)?$/.test(ph.src)) {
      o = o || {};
      const visto = imgSeen.has(ph.src), pagina = G.safeUrl ? G.safeUrl(ph.page) : "";
      const cred = G.L("Foto: ", "Photo: ") + (ph.author || "") + (ph.license ? ", " + ph.license : "") + G.L(", da Wikimedia Commons", ", via Wikimedia Commons");
      // la versione piccola (480 px) per le miniature: il browser sceglie quella che basta per lo spazio e lo schermo
      const piccola = typeof ph.s === "string" && /^img\/foto\/[\w.-]+-s\.jpg(\?v=\w+)?$/.test(ph.s) ? ph.s : "";
      const set = piccola ? ' srcset="' + G.esc(piccola) + " " + (Number(ph.sw) || 480) + "w, " + G.esc(ph.src) + " " + (Number(ph.w) || 1200) + 'w" sizes="' +
        (o.sizes || (o.eager ? "(max-width: 759px) 100vw, 720px" : "(max-width: 759px) 88px, 340px")) + '"' : "";
      return '<figure class="media foto' + (o.cls ? " " + o.cls : "") + '"><img' + (visto ? ' class="in"' : "") + ' src="' + G.esc(ph.src) + '"' + set + ' alt="' + G.esc(ph.alt || "") + '" width="' + (Number(ph.w) || 1280) + '" height="' + (Number(ph.h) || 720) +
        '" decoding="' + (visto ? "sync" : "async") + '"' + (o.eager ? ' fetchpriority="high"' : visto ? "" : ' loading="lazy"') + ">" +
        (o.credito ? '<figcaption class="m-cred">' + (pagina ? '<a href="' + G.esc(pagina) + '" target="_blank" rel="noopener noreferrer">' + G.esc(cred) + "</a>" : G.esc(cred)) + "</figcaption>" : "") + "</figure>";
    }
    const im = s && s.img;
    if (!im || typeof im.src !== "string" || !/^img\/storie\/[\w.-]+\.svg(\?v=\w+)?$/.test(im.src)) return "";
    o = o || {};
    // un'immagine già arrivata in questa visita c'è subito, senza dissolvenza: tornando a una pagina la si ritrova com'era
    const seen = imgSeen.has(im.src);
    return '<figure class="media' + (o.cls ? " " + o.cls : "") + '"><img' + (seen ? ' class="in"' : "") + ' src="' + G.esc(im.src) + '" alt="" width="640" height="360" decoding="' + (seen ? "sync" : "async") + '"' +
      (o.eager ? ' fetchpriority="high"' : seen ? "" : ' loading="lazy"') + ">" +
      (o.cap !== false && im.label ? '<figcaption class="m-cap">' + PIN + "<span>" + G.esc(im.label) + "</span></figcaption>" : "") + "</figure>";
  };
  // le immagini compaiono con una dissolvenza quando sono arrivate (quelle già pronte subito)
  G.showImgs = (root) => {
    (root || document).querySelectorAll(".media img:not(.in)").forEach((img) => {
      const ok = () => { img.classList.add("in"); imgSeen.add(img.getAttribute("src")); };
      if (img.complete && img.naturalWidth) ok();
      else img.addEventListener("load", ok, { once: true });
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
  // un avviso breve in basso; con `azione` ({ label, fn }) ha anche un tasto (per esempio «Annulla») e resta di più
  G.toast = (msg, azione) => {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = "";
    const m = document.createElement("span");
    m.textContent = msg;
    t.appendChild(m);
    t.classList.toggle("az", !!(azione && azione.fn));
    if (azione && azione.fn) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "toast-b";
      b.textContent = azione.label;
      b.addEventListener("click", () => { clearTimeout(t._h); t.classList.remove("on"); azione.fn(); });
      t.appendChild(b);
    }
    requestAnimationFrame(() => t.classList.add("on"));
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("on"), azione && azione.fn ? 6000 : 2200);
  };

  // ---------- temi seguiti ----------
  // restano nel browser (gerico.follows); ogni cambio lo sanno la pagina e il menu (evento gerico:follows)
  G.follows = () => { const f = G.ls.get("gerico.follows", []); return Array.isArray(f) ? f.filter((x, i) => typeof x === "string" && x && f.indexOf(x) === i) : []; };
  // `nome`, se c'è, è come il tema si chiama sulla pagina (un tema caldo nel sito in inglese)
  G.toggleFollow = (t, nome) => {
    const f = G.follows(), k = String(t).toLowerCase();
    // «iran» e «Iran» sono lo stesso tema
    const i = f.findIndex((x) => x.toLowerCase() === k), on = i < 0;
    const n = on ? f.concat(t) : f.filter((x) => x.toLowerCase() !== k);
    G.ls.set("gerico.follows", n);
    // smettere di seguire si può annullare: il tema torna al suo posto
    const annulla = on ? null : { label: G.L("Annulla", "Undo"), fn: () => {
      const g = G.follows();
      if (g.some((x) => x.toLowerCase() === k)) return;
      g.splice(Math.min(i, g.length), 0, f[i]);
      G.ls.set("gerico.follows", g);
      G.toast(G.L("Segui di nuovo «", "Following “") + (nome || G.tn(f[i])) + G.L("»", "” again"));
      document.dispatchEvent(new CustomEvent("gerico:follows", { detail: { tag: f[i], on: true, annullato: true } }));
    } };
    G.toast(on ? G.L("Ora segui «", "Now following “") + (nome || G.tn(t)) + (location.hash === "#seguiti" ? G.L("»", "”") : G.L("»: lo trovi nei Seguiti", "”: find it in Following")) : G.L("Non segui più «", "No longer following “") + (nome || G.tn(f[i])) + G.L("»", "”"), annulla);
    document.dispatchEvent(new CustomEvent("gerico:follows", { detail: { tag: t, on } }));
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

  // righe che scorrono di lato (mercati, temi dei Seguiti): i bordi sfumano con una maschera, solo dal lato dove c'è altro
  // da vedere (classi piu-sx e piu-dx, CSS .bordi). Si rifà quando la riga scorre, cambia larghezza o cambia contenuto
  G.bordi = (el) => {
    if (!el) return;
    if (el._bordi) { el._bordi(); return; }
    el.classList.add("bordi");
    el._bordi = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle("piu-sx", max > 2 && el.scrollLeft > 4);
      el.classList.toggle("piu-dx", max > 2 && max - el.scrollLeft > 4);
    };
    el.addEventListener("scroll", el._bordi, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(el._bordi).observe(el);
    if ("MutationObserver" in window) new MutationObserver(el._bordi).observe(el, { childList: true });
    el._bordi();
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

  // ---------- tutto ci sta, o è un menu a tendina ----------
  // Una fila di pulsanti (schede, scorciatoie) sta tutta su una riga: niente scorrimento di lato, niente nomi tagliati.
  // Se non ci sta, si prova a stringerla (le classi di `gradi`, una dopo l'altra); se ancora non ci sta, al suo posto c'è
  // un menu a tendina con le stesse scelte, e sceglierne una tocca il pulsante vero: il resto funziona come prima.
  // `invito`: per le file che portano altrove (nessuna scelta accesa), la voce che il menu mostra prima di scegliere.
  // Si rifà il conto quando cambia la larghezza (telefono girato) o quando compaiono e spariscono pulsanti.
  const nomeDi = (b) => Array.from(b.childNodes)
    .filter((n) => !(n.classList && (n.classList.contains("fk") || n.classList.contains("sr-only"))))
    .map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
  G.adatta = (box, opt) => {
    if (!box) return;
    if (box._adatta) { box._adatta(); return; }
    opt = opt || {};
    const gradi = opt.gradi || [];
    const wrap = document.createElement("div");
    wrap.className = "tendina" + (opt.classe ? " " + opt.classe : "");
    wrap.hidden = true;
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", opt.etichetta || box.getAttribute("aria-label") || "");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");
    // il menu che si vede: un pulsante largo quanto la sua scritta e un elenco disegnato come il resto del sito (il
    // select resta sotto, invisibile, e tiene la scelta)
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tendina-b";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    const lista = document.createElement("ul");
    lista.className = "tendina-l";
    lista.setAttribute("role", "listbox");
    lista.setAttribute("aria-label", sel.getAttribute("aria-label"));
    lista.hidden = true;
    wrap.appendChild(sel);
    wrap.appendChild(btn);
    wrap.appendChild(lista);
    box.after(wrap);
    const chiudi = (fuoco) => {
      if (lista.hidden) return;
      lista.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", fuori, true);
      if (fuoco) btn.focus({ preventScroll: true });
    };
    const fuori = (e) => { if (!wrap.contains(e.target)) chiudi(false); };
    const apri = () => {
      lista.hidden = false;
      lista.classList.remove("a-destra");
      btn.setAttribute("aria-expanded", "true");
      if (lista.getBoundingClientRect().right > document.documentElement.clientWidth - 8) lista.classList.add("a-destra");
      document.addEventListener("pointerdown", fuori, true);
      const on = lista.querySelector('[aria-selected="true"]') || lista.querySelector("button");
      if (on) on.focus({ preventScroll: true });
    };
    btn.addEventListener("click", () => (lista.hidden ? apri() : chiudi(true)));
    lista.addEventListener("click", (e) => {
      const o = e.target.closest("button[data-i]");
      if (!o) return;
      chiudi(true);
      sel.value = o.dataset.i;
      sel.dispatchEvent(new Event("change"));
    });
    wrap.addEventListener("keydown", (e) => {
      if (lista.hidden) { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.target === btn) { e.preventDefault(); apri(); } return; }
      const os = Array.from(lista.querySelectorAll("button")), i = os.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); chiudi(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); (os[i + 1] || os[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (os[i - 1] || os[os.length - 1]).focus(); }
      else if (e.key === "Home") { e.preventDefault(); os[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); os[os.length - 1].focus(); }
      else if (e.key === "Tab") chiudi(false);
    });
    const scelte = () => Array.from(box.querySelectorAll(":scope > a, :scope > button")).filter((b) => !b.hidden);
    const accesa = (b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-current") === "page" || b.getAttribute("aria-current") === "true";
    const riempi = () => {
      const bs = scelte();
      const html = (opt.invito ? '<option value="" disabled>' + G.esc(opt.invito) + "</option>" : "") +
        bs.map((b, i) => '<option value="' + i + '">' + G.esc(nomeDi(b)) + "</option>").join("");
      if (sel._html !== html) { sel.innerHTML = html; sel._html = html; }
      const on = bs.findIndex(accesa);
      sel.value = on >= 0 ? String(on) : "";
      const scritta = on >= 0 && !opt.invito ? nomeDi(bs[on]) : (opt.invito || (on >= 0 ? nomeDi(bs[on]) : ""));
      const bh = '<span>' + G.esc(scritta) + '</span><svg aria-hidden="true" width="12" height="8" viewBox="0 0 12 8"><path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      if (btn._html !== bh) { btn.innerHTML = bh; btn._html = bh; }
      const lh = bs.map((b, i) => '<li role="presentation"><button type="button" role="option" data-i="' + i + '" aria-selected="' + (i === on) + '">' + G.esc(nomeDi(b)) + "</button></li>").join("");
      if (lista._html !== lh) { lista.innerHTML = lh; lista._html = lh; }
      lista.classList.toggle("due", bs.length >= 7);
    };
    const prova = () => {
      box.classList.remove("in-tendina", ...gradi);
      const ci_sta = () => box.scrollWidth <= box.clientWidth + 1;
      let ok = ci_sta();
      for (let i = 0; !ok && i < gradi.length; i++) { box.classList.add(gradi[i]); ok = ci_sta(); }
      if (!ok) box.classList.add("in-tendina");
      wrap.hidden = ok;
      if (ok) chiudi(false);
      if (!ok) riempi();
      if (ok && box.classList.contains("seg")) G.seg(box, true);
    };
    sel.addEventListener("change", () => {
      const b = scelte()[+sel.value];
      if (opt.invito) sel.value = "";
      if (b) b.click();
    });
    // cambia solo la scelta accesa (o arriva l'indicatore di G.seg): basta il menu; altrimenti (pulsanti nuovi, nascosti,
    // nomi tradotti) si rifà anche il conto della larghezza
    const indicatore = (m) => m.type === "childList" && Array.from(m.addedNodes).concat(Array.from(m.removedNodes))
      .every((n) => n.nodeType === 1 && n.classList.contains("seg-ind"));
    new MutationObserver((ms) => {
      if (ms.every((m) => (m.type === "attributes" && m.attributeName !== "hidden") || indicatore(m))) { if (!wrap.hidden) riempi(); }
      else prova();
    }).observe(box, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "aria-pressed", "aria-current"] });
    // la larghezza che conta è quella del contenitore: cambia con lo schermo, non con quello che si mostra dentro
    let largo = box.parentElement.clientWidth;
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        const w = box.parentElement.clientWidth;
        if (w !== largo) { largo = w; requestAnimationFrame(prova); }
      }).observe(box.parentElement);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(prova));
    box._adatta = prova;
    prova();
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
  // il riepilogo nella lingua del sito: in inglese, se c'è la versione inglese dello stesso riepilogo; se no l'italiano
  G.audioInfo = (au) => (G.en && au && au.en && au.en.src && au.en.source === au.source ? Object.assign({ lang: "en" }, au.en) : au);
  G.player = (() => {
    const audio = new Audio();
    audio.preload = "none";
    const KEY = "gerico.audio";
    let info = null, saved = 0, closed = false, cardSeen = false, lastSave = 0, lastPos = 0, bar = null;
    const subs = new Set();
    const emit = () => { subs.forEach((f) => { try { f(); } catch (e) { /* niente */ } }); paint(); };
    const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    const when = () => info && (info.source || info.asOf);
    const ita = () => (info && info.lang === "en" ? "" : " (in Italian)");
    const title = () => (info ? (G.isToday(when()) ? G.L("Il riepilogo di oggi", "Today's briefing" + ita()) : G.L("Il riepilogo di ", "Briefing of ") + G.weekday(when()) + G.L("", ita())) : "");
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
      // a un punto preciso (secondi). Prima di aver premuto ascolta il punto si ricorda soltanto: l'audio partirà da lì
      to(t) {
        if (!info) return;
        closed = false;
        t = Math.max(0, Math.min(dur() || t, t));
        if (audio.readyState >= 1) { try { audio.currentTime = t; } catch (e) { /* niente */ } }
        else {
          saved = t;
          if (audio.getAttribute("src")) audio.addEventListener("loadedmetadata", () => { try { audio.currentTime = saved; } catch (e) { /* niente */ } }, { once: true });
        }
        save();
        emit();
      },
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
      mount() { if (bar && !bar.isConnected) document.body.appendChild(bar); cardSeen = false; paint(); },
      // una riga del tempo che si tocca e si trascina, liberamente avanti e indietro: la riga segue il dito, sopra c'è il
      // minuto a cui si arriva, e l'audio salta lì quando si lascia. Con la tastiera le frecce (10 secondi), Inizio e Fine
      scorri(el, prog) {
        if (!el || !prog || el._scorri) return;
        el._scorri = true;
        el.removeAttribute("aria-hidden");
        el.setAttribute("role", "slider");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", G.L("Posizione nel riepilogo", "Position in the briefing"));
        el.setAttribute("aria-valuemin", "0");
        el.setAttribute("data-noswipe", "");
        const bolla = document.createElement("span");
        bolla.className = "tempo-bolla";
        bolla.setAttribute("aria-hidden", "true");
        const pomello = document.createElement("span");
        pomello.className = "pomello";
        pomello.setAttribute("aria-hidden", "true");
        el.append(pomello, bolla);
        let giu = false, f = 0;
        const dove = (e) => { const r = el.getBoundingClientRect(); return r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0; };
        const segui = () => {
          prog.style.transform = "scaleX(" + f.toFixed(4) + ")";
          pomello.style.left = (f * 100).toFixed(2) + "%";
          bolla.textContent = mmss(f * dur());
          // il minuto resta dentro la riga anche ai due capi
          const w = el.clientWidth, mezza = bolla.offsetWidth / 2;
          bolla.style.left = Math.round(Math.max(mezza, Math.min(w - mezza, f * w))) + "px";
        };
        el.addEventListener("pointerdown", (e) => {
          if (!info || !dur() || (e.pointerType === "mouse" && e.button)) return;
          giu = true;
          el.classList.add("presa");
          try { el.setPointerCapture(e.pointerId); } catch (x) { /* niente */ }
          f = dove(e);
          segui();
          e.preventDefault();
          e.stopPropagation();
        });
        el.addEventListener("pointermove", (e) => { if (giu) { f = dove(e); segui(); } });
        const lascia = (vai) => {
          if (!giu) return;
          giu = false;
          el.classList.remove("presa");
          if (vai) api.to(f * dur()); else emit();
        };
        el.addEventListener("pointerup", () => lascia(true));
        el.addEventListener("pointercancel", () => lascia(false));
        el.addEventListener("lostpointercapture", () => lascia(true));
        el.addEventListener("keydown", (e) => {
          const d = dur(), p = pos();
          if (!d) return;
          const t = e.key === "ArrowRight" || e.key === "ArrowUp" ? p + 10 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? p - 10 : e.key === "Home" ? 0 : e.key === "End" ? d - 1 : null;
          if (t === null) return;
          e.preventDefault();
          api.to(Math.max(0, Math.min(d, t)));
        });
        const valori = () => {
          const d = dur(), p = pos();
          if (!giu) pomello.style.left = (d ? Math.min(1, p / d) * 100 : 0).toFixed(2) + "%";
          el.setAttribute("aria-valuemax", String(Math.round(d || 0)));
          el.setAttribute("aria-valuenow", String(Math.round(p)));
          el.setAttribute("aria-valuetext", mmss(p) + G.L(" di ", " of ") + mmss(d || 0));
        };
        valori();
        return api.on(valori);
      }
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
      api.scorri(bar.querySelector(".gp-bar"), bar.querySelector(".gp-bar i"));
      bar.querySelector(".gp-play").addEventListener("click", () => api.toggle());
      bar.querySelectorAll(".gp-sk").forEach((b) => b.addEventListener("click", () => api.seek(Number(b.dataset.d))));
      bar.querySelector(".gp-x").addEventListener("click", () => api.close());
      document.body.appendChild(bar);
    };
    // la barra entra salendo e esce scendendo (prima compariva e spariva di colpo); durante un passaggio di pagina no:
    // lì è la transizione della pagina a portarla
    let barShown = false, barAnim = null;
    function showBar(show) {
      if (show === barShown) return;
      barShown = show;
      if (barAnim) { barAnim.cancel(); barAnim = null; }
      const move = !!bar.animate && !G.reduced() && !window.gericoVT && bar.isConnected;
      if (show) {
        bar.hidden = false;
        if (move) barAnim = bar.animate([{ opacity: 0, transform: "translateY(14px) scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
      } else if (move && !bar.hidden) {
        const a = barAnim = bar.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px) scale(0.98)" }], { duration: 170, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
        a.finished.then(() => { if (barAnim === a) { bar.hidden = true; a.cancel(); barAnim = null; } }, () => {});
      } else bar.hidden = true;
    }
    function paint() {
      if (!bar) { if (!document.body) return; build(); }
      const show = started() && !closed && !cardSeen;
      showBar(show);
      document.documentElement.classList.toggle("gp-on", show);
      if (!show) return;
      const on = !audio.paused, d = dur();
      bar.classList.toggle("playing", on);
      bar.querySelector(".gp-play").setAttribute("aria-label", on ? G.L("Metti in pausa il riepilogo", "Pause the briefing") : G.L("Riprendi il riepilogo", "Resume the briefing"));
      bar.querySelector(".gp-t").textContent = title();
      bar.querySelector(".gp-s").textContent = d ? (on ? G.L("Mancano ", "Left ") : G.L("In pausa · mancano ", "Paused · left ")) + mmss(Math.max(0, d - pos())) : "";
      // mentre si trascina la riga la posizione è quella del dito
      if (!bar.querySelector(".gp-bar.presa")) bar.querySelector(".gp-bar i").style.transform = "scaleX(" + (d ? Math.min(1, pos() / d) : 0).toFixed(4) + ")";
    }
    return api;
  })();
  // dopo un ricaricamento, se il riepilogo era a metà, la barra lo ripropone da dove eri
  try {
    if (sessionStorage.getItem("gerico.audio")) G.load("audio").then((a) => { const au = G.audioInfo(a); if (au && au.src && G.hoursAgo(au.asOf) < 30) G.player.set(au); });
  } catch (e) { /* niente */ }

  // ---------- barra in basso a pillola (grafica nuova, 7 novembre) ----------
  // Notizie, Terminal, il riepilogo a voce e il menu, a portata di pollice. Sul telefono prende il posto
  // dell'interruttore e del menu in alto (li nasconde il CSS); sul computer non c'è. Come la barra del riepilogo
  // resta nella pagina da un passaggio all'altro: cambia solo la voce accesa
  G.tabbar = (() => {
    let bar = null, asked = false;
    const svg = (body, cls) => '<svg' + (cls ? ' class="' + cls + '"' : "") + ' aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>";
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
          G.load("audio").then((a) => { const au = G.audioInfo(a); if (au && au.src && G.hoursAgo(au.asOf) <= 30 && !G.player.info()) G.player.set(au); paint(); }).catch(() => {});
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
  const SCRIPT_PAGE = { "home.js": "home", "story.js": "story", "terminal.js": "terminal", "info.js": "info", "admin.js": "admin" };
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
  // gli altri script di una pagina, prima del suo (nel Terminal eventi.js, con le spiegazioni dell'agenda): un passaggio
  // senza ricaricare deve caricarli tutti, o la pagina si ferma a metà
  const extraScripts = (doc, main) => Array.from(doc.querySelectorAll("script[src]")).map((s) => s.getAttribute("src") || "")
    .filter((src) => /assets\/js\/[a-z]+\.js/.test(src) && src !== main && src !== MY && !/assets\/js\/common\.js/.test(src));
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
  // la pagina che c'era sullo schermo prima di questa (percorso e ricerca), anche dopo «indietro» e «avanti» del browser:
  // lì G.prevUrl è già l'indirizzo nuovo, perché il browser lo cambia prima di avvisare
  G.shownBefore = "";
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
    const from = location.href, was = shown;
    const swap = async () => {
      // è partito un altro passaggio prima di questo: la pagina la cambia lui, questo non tocca niente
      if (id !== navId) return;
      stopPage();
      apply(doc, pg.name);
      if (opt.push !== false) { idx += 1; history.pushState({ g: 1, n: idx, y: 0 }, "", url); }
      entries[idx] = location.pathname + location.search;
      shown = location.pathname + location.search;
      G.prevUrl = from;
      G.shownBefore = was;
      G.soft = true;
      G.current = pg.name;
      for (const src of extraScripts(doc, pg.src)) { try { await loadScript(src); } catch (e) { location.href = url; return; } }
      if (G.pages[pg.name]) startPage(pg.name);
      else if (pg.src) { try { await loadScript(pg.src); } catch (e) { location.href = url; return; } }
      else { G.initPrefs(); P.done = Promise.resolve(); }
      G.player.mount();
      // la transizione fotografa la pagina nuova quando ha disegnato il contenuto principale (al massimo 400 ms)
      await Promise.race([P.done, new Promise((r) => setTimeout(r, 400))]);
      const h = new URL(url, location.href).hash;
      const target = h && document.getElementById(G.unhash(h));
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
          [pg.src].concat(extraScripts(doc, pg.src)).forEach((src) => { if (src && !loaded.has(src)) fetch(new URL(src, url).href, { credentials: "same-origin" }).catch(() => {}); });
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
  const NOSWIPE = "input, textarea, select, [contenteditable], .ultim, [data-noswipe], .gp";
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
    // le schede diventate un menu a tendina (G.adatta) non si vedono: lo swipe cambia il gruppo, il menu lo segue da sé
    if (!ind || !box.offsetWidth) return;
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

  // in fondo a ogni pagina: i nomi delle testate citate negli articoli di questi giorni, che scorrono in una fascia.
  // Sono nomi scritti con il carattere di GERICO, non i loro marchi: dicono da dove vengono le notizie, non una società.
  G.fontiPiede = async () => {
    const foot = document.querySelector(".foot");
    if (!foot || foot.querySelector(".fonti")) return;
    let ed = null;
    try { ed = await G.load("edition"); } catch (e) { return; }
    const n = {};
    ((ed && ed.stories) || []).concat((ed && ed.archive) || []).forEach((st) => (st.sources || []).forEach((x) => { if (x && x.name) n[x.name] = (n[x.name] || 0) + 1; }));
    const nomi = Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b)).slice(0, 28);
    if (nomi.length < 5 || !foot.isConnected || foot.querySelector(".fonti")) return;
    const riga = nomi.map((x) => "<li>" + G.esc(x) + "</li>").join("");
    const box = document.createElement("section");
    box.className = "fonti";
    box.setAttribute("aria-label", G.L("Le testate citate negli articoli di questi giorni", "The outlets cited in recent articles"));
    box.innerHTML = '<p class="fonti-t wrap">' + G.L("Le testate citate in questi giorni", "Outlets cited in recent days") + '</p><div class="fonti-v" style="--n:' + nomi.length + '"><ul class="fonti-l">' + riga +
      '</ul><ul class="fonti-l" aria-hidden="true">' + riga + "</ul></div>";
    foot.prepend(box);
  };

  G.initPrefs = () => {
    G.fontiPiede();
    const html = document.documentElement;
    html.lang = G.lang;
    G.i18nStatic(document.body);
    // lingua: la scelta resta per le visite dopo; la pagina si ricarica nella lingua nuova (i dati tradotti sono altri file)
    document.querySelectorAll("[data-lang-set]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.langSet === G.lang));
      b.addEventListener("click", () => {
        if (b.dataset.langSet === G.lang) return;
        G.ls.set("gerico.lang", b.dataset.langSet);
        G.ricarica(b.dataset.langSet);
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
      // un link del menu verso la pagina in cui sei (i Seguiti dalla prima pagina): il menu si chiude, la pagina fa il resto
      menu.addEventListener("click", (e) => {
        const a = e.target.closest("a[href]");
        if (a && clean(new URL(a.href, location.href).pathname) === clean(location.pathname)) close();
      });
      // i Seguiti nel menu: una voce sola, in cima alle pagine. Porta alla scheda Seguiti della prima pagina, su «I tuoi
      // temi», con tutti i temi (non quello scelto l'ultima volta) e senza la modifica aperta
      const links = menu.querySelector("nav.menu-links");
      if (links && !menu.querySelector("[data-seguiti]")) {
        const a = document.createElement("a");
        a.href = "./#seguiti";
        a.dataset.seguiti = "1";
        a.textContent = G.L("Seguiti", "Following");
        links.prepend(a);
        a.addEventListener("click", () => {
          try { sessionStorage.removeItem("gerico.seguitiFiltro"); sessionStorage.removeItem("gerico.seguitiGest"); sessionStorage.setItem("gerico.seguitiVai", "1"); } catch (err) { /* niente */ }
          document.dispatchEvent(new CustomEvent("gerico:seguiti-tema", { detail: { tema: "", gest: false, vai: true } }));
        });
        G.conto.menu(menu, links);
        // la ricerca in cima al menu: ha l'aspetto di un campo e apre il foglio della ricerca
        const head = menu.querySelector(".menu-head");
        if (head && !menu.querySelector(".cerca-menu")) {
          const c = document.createElement("div");
          c.className = "opt cerca-menu";
          c.innerHTML = '<button type="button" class="cerca-b" data-cerca><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg><span>' +
            G.L("Cerca tra le notizie", "Search the news") + "</span></button>";
          head.after(c);
          c.addEventListener("click", (e) => { if (e.target.closest("[data-cerca]")) { e.stopPropagation(); G.cerca.apri(); } });
        }
        // «Installa GERICO» in fondo alle pagine del menu, solo se il browser lo permette e il sito non è già installato
        if (!links.querySelector("[data-app]")) {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.app = "1";
          b.textContent = G.L("Installa GERICO", "Install GERICO");
          const vedi = () => { b.hidden = !G.app.puo(); };
          vedi();
          links.appendChild(b);
          P.on(document, "gerico:app", vedi);
          b.addEventListener("click", (e) => { e.stopPropagation(); G.app.installa(); });
        }
        // l'ordine del menu: cercare; leggere (Seguiti, Archivio, Glossario); le tue scelte (paese, interessi); l'account;
        // come si vede il sito (lingua, tema, testo); in fondo GERICO (come funziona, collabora, privacy, l'app)
        const inner = menu.querySelector(".menu-in");
        if (inner && !inner.querySelector(".menu-leggi")) {
          const gruppo = (cls, id, titolo, nav) => {
            const d = document.createElement("div");
            d.className = "opt " + cls;
            const p = document.createElement("p");
            p.className = "opt-l";
            p.id = id;
            p.textContent = titolo;
            nav.removeAttribute("aria-label");
            nav.setAttribute("aria-labelledby", id);
            d.append(p, nav);
            return d;
          };
          const nl = document.createElement("nav");
          nl.className = "menu-links";
          [links.querySelector("[data-seguiti]"), links.querySelector('a[href="archivio"]'), links.querySelector('a[href="glossario"]')].forEach((x) => { if (x) nl.appendChild(x); });
          const leggi = gruppo("menu-leggi", "opt-leggi", G.L("Leggi", "Read"), nl);
          [links.querySelector('a[href="come-funziona.html"]'), links.querySelector('a[href="collabora"]'), links.querySelector('a[href="privacy.html"]'), links.querySelector("[data-app]")]
            .forEach((x) => { if (x) links.appendChild(x); });
          const info = gruppo("menu-info", "opt-gerico", "GERICO", links);
          const opz = (sel) => { const x = inner.querySelector(sel); return x ? x.closest(".opt") : null; };
          const ordine = [inner.querySelector(":scope > .grab"), inner.querySelector(":scope > .menu-head"), inner.querySelector(":scope > .cerca-menu"), leggi,
            inner.querySelector(":scope > .paese-menu"), inner.querySelector(":scope > .interessi-menu"), inner.querySelector(":scope > .conto-menu"),
            opz("[data-lang-set]"), opz("[data-theme-set]"), opz("[data-size-set]"), info].filter(Boolean);
          const altri = Array.from(inner.children).filter((x) => !ordine.includes(x));
          ordine.concat(altri).forEach((x) => inner.appendChild(x));
        }
      }
    }

    // pagina Privacy: togliere il consenso ai prezzi in diretta di TradingView (lo si dà nel Terminal, con «Mostra i prezzi»)
    document.querySelectorAll("[data-tv-revoca]").forEach((b) => {
      const stato = b.parentElement.querySelector("[data-tv-stato]");
      b.hidden = G.ls.get("gerico.tv", false) !== true;
      if (b.hidden && stato) stato.textContent = G.L("Non hai dato il consenso: il nastro di TradingView non si carica.", "You haven't given consent: the TradingView tape doesn't load.");
      b.addEventListener("click", () => {
        try { localStorage.removeItem("gerico.tv"); } catch (e) { /* storage non disponibile */ }
        b.hidden = true;
        if (stato) { stato.textContent = G.L("Fatto: il nastro di TradingView non si carica più, finché non premi di nuovo «Mostra i prezzi» nel Terminal.", "Done: the TradingView tape won't load again until you press «Show prices» in the Terminal again."); stato.setAttribute("role", "status"); }
      });
    });

    // interruttore Notizie / Terminal: la pillola va subito al suo posto; tra le due pagine la fa scivolare il passaggio (CSS)
    const mode = document.querySelector(".mode");
    if (mode) G.seg(mode, true);

    document.querySelectorAll(".chips").forEach(G.watchRow);
    G.watchTop();
    G.tabbar.mount();
    G.conto.pagina();
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
  // i colori dei quadrati, costruiti in OKLCH: a ogni gradino rosso e verde hanno la stessa luminosità e quasi la stessa
  // intensità, così un −0,7% e un +0,7% pesano uguale a occhio. Dove OKLCH non c'è, gli stessi gradini in esadecimale
  const OKLCH = !!(window.CSS && CSS.supports && CSS.supports("color", "oklch(0.5 0.1 150)"));
  const col = (ok, hex) => (OKLCH ? ok : hex);
  G.NO_DATA = col("oklch(0.43 0.02 260)", "#4A505C");
  const B = [col("oklch(0.52 0.18 27)", "#B3261E"), col("oklch(0.43 0.145 26)", "#8C1F1A"), col("oklch(0.34 0.095 25)", "#56201C"),
    col("oklch(0.34 0.08 152)", "#1B4A33"), col("oklch(0.43 0.115 152)", "#0D5F32"), col("oklch(0.52 0.145 150)", "#0F7A3F")];
  G.BANDS = [
    [B[0], G.L("−1% o meno", "−1% or less")], [B[1], G.L("da −1 a −0,5", "−1 to −0.5")], [B[2], G.L("da −0,5 a 0", "−0.5 to 0")],
    [B[3], G.L("da 0 a +0,5", "0 to +0.5")], [B[4], G.L("da +0,5 a +1", "+0.5 to +1")], [B[5], G.L("+1% o più", "+1% or more")]
  ];
  G.band = (c) => (typeof c !== "number" ? G.NO_DATA : c >= 1 ? B[5] : c >= 0.5 ? B[4] : c >= 0 ? B[3] : c > -0.5 ? B[2] : c > -1 ? B[1] : B[0]);

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
      return Object.assign({ code: k, name: G.MARKETS[k][0], index: d === alt ? index : G.MARKETS[k][1], value: w[k], chg: typeof d.chg === "number" ? d.chg : null, time: d.time || "", note: d.note || "", story: (own && own.story) || "",
        // l'ora della redazione è senza giorno: il giorno è quello del suo aggiornamento (serve quando non è oggi)
        day: d === own && d.time ? (terminal && terminal.asOf) || "" : "" }, lv);
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

  // ---------- cosa sta scritto in un quadrato della mappa ----------
  // Si misura con il carattere vero (un canvas), alla grandezza del testo scelta nel menu: un nome o una variazione che
  // non ci stanno interi non si scrivono (niente puntini, niente numeri tagliati dal bordo, niente righe una sull'altra).
  const meas = document.createElement("canvas").getContext("2d");
  // Nella mappa le cifre hanno tutte la stessa larghezza (tabular-nums), e il canvas non lo sa: si misurano come zeri,
  // la cifra più larga, così un «+1,11%» non risulta più stretto di com'è disegnato
  G.fitText = (texts, px, room, weight, fam) => texts.find((t) => {
    if (!t) return false;
    meas.font = (weight || 700) + " " + px + "px " + (fam || "sans-serif");
    return meas.measureText(String(t).replace(/\d/g, "0")).width <= room;
  }) || "";
  // l'altezza che serve a un quadrato per avere il nome in alto e la variazione in basso senza toccarsi, e per il solo
  // nome (rem: i pixel di 1rem). I numeri sono quelli del CSS di .tmap .tile: margini, grandezze, interlinea 1,15
  G.tileNeed = (size, rem) => (size === "big" ? 9 + 1.15 * rem + 2 + 0.8625 * rem + 6 + 2 * rem + 9 + 2
    : size === "med" ? 7 + 1.00625 * rem + 3 + 1.29375 * rem + 7 + 2
    : size === "small" ? 5 + 0.8625 * rem + 2 + 0.8625 * rem + 5 + 2
    : size === "small1" ? 5 + 0.8625 * rem + 5 + 2 : 3 + 0.71875 * rem + 3 + 2);
  G.drawMap = (el, items, opts) => {
    opts = opts || {};
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    const rects = G.squarify(items, W, H);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, fam = getComputedStyle(el).fontFamily;
    const fit = (texts, em, room, weight) => G.fitText(texts, em * rem, room, weight, fam);
    el.innerHTML = rects.map((r, k) => {
      const has = typeof r.chg === "number";
      const cg = has ? G.pct(r.chg) : "", name = G.tn(r.name);
      // la Borsa scelta, se ha i suoi titoli (Terminal, opts.enter): toccandola di nuovo si entra nell'indice
      const go = !!(opts.enter && r.code === opts.selected && opts.enter(r.code));
      const label = name + (r.index ? ", " + r.index : "") + ", " + (has ? cg : G.L("nessun dato oggi", "no data today")) + G.L(", peso ", ", weight ") + G.wt(r.value) +
        (go ? G.L(". Tocca di nuovo per vedere i suoi titoli", ". Tap again to see its stocks") : "");
      // la grandezza più grande in cui nome e variazione stanno interi: se no si scende di una, fino al quadrato muto
      // (la variazione che non sta nel quadrato la mostra il Terminal sotto la mappa: r.shown dice se c'è)
      const nmHTML = (t, ix) => '<span class="a"><span class="nm">' + G.esc(t) + "</span>" + (ix ? '<span class="ix">' + G.esc(ix) + "</span>" : "") + "</span>";
      const cgHTML = '<span class="b"><span class="cg" data-n="' + r.chg + '" data-f="pct%">' + cg + "</span></span>";
      let size = "none", inner = "";
      r.shown = false;
      const start = r.w >= 170 && r.h >= 110 ? 0 : r.w >= 90 && r.h >= 56 ? 1 : r.w >= 40 && r.h >= 30 ? 2 : r.w >= 22 && r.h >= 14 ? 3 : 4;
      if (start <= 0 && r.h >= G.tileNeed("big", rem) && (!has || fit([cg], 2, r.w - 14, 750))) {
        size = "big";
        inner = nmHTML(fit([name, r.code], 1, r.w - 20), has ? fit([r.index], 0.75, r.w - 20, 400) : "") + (has ? cgHTML : "") +
          (has && go ? '<span class="go" aria-hidden="true">' + G.L("Titoli", "Stocks") + " ›</span>" : "");
        r.shown = has;
      } else if (start <= 1 && r.h >= G.tileNeed("med", rem) && (!has || fit([cg], 1.125, r.w - 12, 750)) && fit([name, r.code], 0.875, r.w - 18)) {
        size = "med";
        inner = nmHTML(fit([name, r.code], 0.875, r.w - 18)) + (has ? cgHTML : "");
        r.shown = has;
      } else if (start <= 2 && r.h >= G.tileNeed("small1", rem) && fit([r.code], 0.75, r.w - 12)) {
        size = "small";
        r.shown = has && r.h >= G.tileNeed("small", rem) && !!fit([cg], 0.75, r.w - 10, 750);
        inner = nmHTML(r.code) + (r.shown ? cgHTML : "");
      } else if (start <= 3 && r.h >= G.tileNeed("tiny", rem) && fit([r.code], 0.625, r.w - 8)) {
        size = "tiny";
        inner = nmHTML(r.code);
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
  // ---------- il paese di chi legge: i paesi della scelta in alto, le bandiere disegnate qui, il foglio per sceglierli ----------
  // «da» con l'articolo giusto, per le frasi in italiano («Oggi nessuna notizia dalla Francia»)
  const DA_PAESE = { IT: "dall'Italia", US: "dagli Stati Uniti", GB: "dal Regno Unito", FR: "dalla Francia", DE: "dalla Germania", ES: "dalla Spagna", AT: "dall'Austria", BE: "dal Belgio", BG: "dalla Bulgaria", HR: "dalla Croazia", CY: "da Cipro", CZ: "dalla Repubblica Ceca", DK: "dalla Danimarca", EE: "dall'Estonia", FI: "dalla Finlandia", GR: "dalla Grecia", HU: "dall'Ungheria", IE: "dall'Irlanda", LV: "dalla Lettonia", LT: "dalla Lituania", LU: "dal Lussemburgo", MT: "da Malta", NL: "dai Paesi Bassi", PL: "dalla Polonia", PT: "dal Portogallo", RO: "dalla Romania", SK: "dalla Slovacchia", SI: "dalla Slovenia", SE: "dalla Svezia", CH: "dalla Svizzera", NO: "dalla Norvegia", IS: "dall'Islanda", AL: "dall'Albania", BA: "dalla Bosnia ed Erzegovina", XK: "dal Kosovo", ME: "dal Montenegro", MK: "dalla Macedonia del Nord", RS: "dalla Serbia", UA: "dall'Ucraina", MD: "dalla Moldavia", RU: "dalla Russia", BY: "dalla Bielorussia", AD: "da Andorra", LI: "dal Liechtenstein", MC: "da Monaco", SM: "da San Marino", VA: "dalla Città del Vaticano", CA: "dal Canada", AU: "dall'Australia", NZ: "dalla Nuova Zelanda" };
  // sigla, nome italiano, nome inglese, livello (1: articoli e brevi ogni giorno; 2: le brevi delle testate), nome nell'indirizzo
  G.PAESI = [
    ["IT", "Italia", "Italy", 1, "italia"], ["US", "Stati Uniti", "United States", 1, "stati-uniti"], ["GB", "Regno Unito", "United Kingdom", 1, "regno-unito"],
    ["FR", "Francia", "France", 1, "francia"], ["DE", "Germania", "Germany", 1, "germania"], ["ES", "Spagna", "Spain", 1, "spagna"],
    ["AT", "Austria", "Austria", 2, "austria"], ["BE", "Belgio", "Belgium", 2, "belgio"], ["BG", "Bulgaria", "Bulgaria", 2, "bulgaria"],
    ["HR", "Croazia", "Croatia", 2, "croazia"], ["CY", "Cipro", "Cyprus", 2, "cipro"], ["CZ", "Repubblica Ceca", "Czech Republic", 2, "repubblica-ceca"],
    ["DK", "Danimarca", "Denmark", 2, "danimarca"], ["EE", "Estonia", "Estonia", 2, "estonia"], ["FI", "Finlandia", "Finland", 2, "finlandia"],
    ["GR", "Grecia", "Greece", 2, "grecia"], ["HU", "Ungheria", "Hungary", 2, "ungheria"], ["IE", "Irlanda", "Ireland", 2, "irlanda"],
    ["LV", "Lettonia", "Latvia", 2, "lettonia"], ["LT", "Lituania", "Lithuania", 2, "lituania"], ["LU", "Lussemburgo", "Luxembourg", 2, "lussemburgo"],
    ["MT", "Malta", "Malta", 2, "malta"], ["NL", "Paesi Bassi", "Netherlands", 2, "paesi-bassi"], ["PL", "Polonia", "Poland", 2, "polonia"],
    ["PT", "Portogallo", "Portugal", 2, "portogallo"], ["RO", "Romania", "Romania", 2, "romania"], ["SK", "Slovacchia", "Slovakia", 2, "slovacchia"],
    ["SI", "Slovenia", "Slovenia", 2, "slovenia"], ["SE", "Svezia", "Sweden", 2, "svezia"], ["CH", "Svizzera", "Switzerland", 2, "svizzera"],
    ["NO", "Norvegia", "Norway", 2, "norvegia"], ["IS", "Islanda", "Iceland", 2, "islanda"], ["AL", "Albania", "Albania", 2, "albania"],
    ["BA", "Bosnia ed Erzegovina", "Bosnia and Herzegovina", 2, "bosnia-ed-erzegovina"], ["XK", "Kosovo", "Kosovo", 2, "kosovo"],
    ["ME", "Montenegro", "Montenegro", 2, "montenegro"], ["MK", "Macedonia del Nord", "North Macedonia", 2, "macedonia-del-nord"],
    ["RS", "Serbia", "Serbia", 2, "serbia"], ["UA", "Ucraina", "Ukraine", 2, "ucraina"], ["MD", "Moldavia", "Moldova", 2, "moldavia"],
    ["RU", "Russia", "Russia", 2, "russia"], ["BY", "Bielorussia", "Belarus", 2, "bielorussia"], ["AD", "Andorra", "Andorra", 2, "andorra"],
    ["LI", "Liechtenstein", "Liechtenstein", 2, "liechtenstein"], ["MC", "Monaco", "Monaco", 2, "monaco"], ["SM", "San Marino", "San Marino", 2, "san-marino"],
    ["VA", "Città del Vaticano", "Vatican City", 2, "vaticano"], ["CA", "Canada", "Canada", 2, "canada"], ["AU", "Australia", "Australia", 2, "australia"],
    ["NZ", "Nuova Zelanda", "New Zealand", 2, "nuova-zelanda"]
  ].map(([code, it, en, level, slug]) => ({ code, it, en, level, slug, da: DA_PAESE[code] }));
  const PAESE_DI = {};
  G.PAESI.forEach((p) => { PAESE_DI[p.code] = p; });
  G.paeseInfo = (code) => PAESE_DI[code] || PAESE_DI.IT;
  G.paeseNome = (code) => { const p = G.paeseInfo(code); return G.en ? p.en : p.it; };
  // «dalla Francia» / «from France»
  G.paeseDa = (code) => { const p = G.paeseInfo(code); return G.en ? "from " + (["US", "GB", "NL", "CZ"].includes(code) ? "the " : "") + p.en : p.da; };
  G.paeseDaSlug = (slug) => G.PAESI.find((p) => p.slug === slug) || null;
  // il paese scelto resta nel browser (gerico.paese); l'Italia è quello di partenza
  G.paese = () => { const c = G.ls.get("gerico.paese", "IT"); return PAESE_DI[c] ? c : "IT"; };
  // la lingua segue il paese: italiano per l'Italia, San Marino e il Vaticano, inglese per tutti gli altri (dal menu si
  // può sempre cambiare)
  G.linguaDi = (code) => (["IT", "SM", "VA"].includes(code) ? "it" : "en");
  // sync: il cambio arriva dall'account (un altro dispositivo), non da un tocco qui: allora la lingua di questo
  // dispositivo non cambia
  G.setPaese = (code, sync) => {
    if (!PAESE_DI[code]) return;
    G.ls.set("gerico.paese", code);
    document.dispatchEvent(new CustomEvent("gerico:paese", { detail: { code, sync: !!sync } }));
    const lingua = G.linguaDi(code);
    if (sync || lingua === G.lang) return;
    G.ls.set("gerico.lang", lingua);
    // i testi tradotti sono altri file: la pagina si rifà nella lingua nuova appena si chiudono i fogli aperti (la
    // scelta del paese, le domande del percorso); il menu sotto di loro no, si chiude con la pagina
    const rifai = () => {
      if (document.querySelector("dialog[open]:not(#menu)")) { setTimeout(rifai, 200); return; }
      G.ricarica(lingua);
    };
    setTimeout(rifai, 50);
  };

  // le bandiere: disegni semplici, 30 x 20, fatti qui (nessuna immagine di altri siti). Gli stemmi sono ridotti a forme
  // essenziali: a 20 pixel si riconosce la bandiera, non il dettaglio
  const fr = (x, y, w, h, c) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>';
  const fh = (...c) => c.map((col, i) => fr(0, +(20 / c.length * i).toFixed(3), 30, +(20 / c.length + 0.05).toFixed(3), col)).join("");
  const fv = (...c) => c.map((col, i) => fr(+(30 / c.length * i).toFixed(3), 0, +(30 / c.length + 0.05).toFixed(3), 20, col)).join("");
  const nord = (bg, a, b) => fr(0, 0, 30, 20, bg) + (b ? fr(8, 0, 6, 20, a) + fr(0, 7, 30, 6, a) + fr(9.5, 0, 3, 20, b) + fr(0, 8.5, 30, 3, b) : fr(9, 0, 4, 20, a) + fr(0, 8, 30, 4, a));
  const stella = (cx, cy, R, c, n, extra) => {
    n = n || 5;
    const ri = R * (n === 5 ? 0.382 : 0.45), p = [];
    for (let i = 0; i < 2 * n; i++) { const a = -Math.PI / 2 + i * Math.PI / n, q = i % 2 ? ri : R; p.push((cx + q * Math.cos(a)).toFixed(2) + "," + (cy + q * Math.sin(a)).toFixed(2)); }
    return '<polygon points="' + p.join(" ") + '" fill="' + c + '"' + (extra || "") + "/>";
  };
  const UJ = fr(0, 0, 30, 20, "#012169") + '<path d="M0 0L30 20M30 0L0 20" stroke="#FFF" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.4"/>' +
    '<path d="M15 0V20M0 10H30" stroke="#FFF" stroke-width="6.6"/><path d="M15 0V20M0 10H30" stroke="#C8102E" stroke-width="4"/>';
  const CANTONE = '<svg x="0" y="0" width="15" height="10" viewBox="0 0 30 20">' + UJ + "</svg>";
  const AQUILA = "M15 4.6l1.1 1.2 1.6-1.3.2 1.6 1.7-.9.1 1.4 1.8-.3-.6 1.5 1.6.4-1.3 1.2 1.2.9-1.7.6.6 1.4-1.8-.2-.4 1.6-1.4-1-.6 2.6-1.3 1.8-1.3-1.8-.6-2.6-1.4 1-.4-1.6-1.8.2.6-1.4-1.7-.6 1.2-.9-1.3-1.2 1.6-.4-.6-1.5 1.8.3.1-1.4 1.7.9.2-1.6 1.6 1.3z";
  const scudo = (x, y, w, h, c, bordo, sw) => '<path d="M' + x + " " + y + "h" + w + "v" + (h * 0.55).toFixed(2) + "c0 " + (h * 0.3).toFixed(2) + " -" + (w * 0.3).toFixed(2) + " " + (h * 0.38).toFixed(2) + " -" + (w / 2).toFixed(2) + " " + (h * 0.45).toFixed(2) +
    "c-" + (w * 0.2).toFixed(2) + " -" + (h * 0.07).toFixed(2) + " -" + (w / 2).toFixed(2) + " -" + (h * 0.15).toFixed(2) + " -" + (w / 2).toFixed(2) + " -" + (h * 0.45).toFixed(2) + 'z" fill="' + c + '"' + (bordo ? ' stroke="' + bordo + '" stroke-width="' + (sw || 0.4) + '"' : "") + "/>";
  const FOGLIA = [[0, -4.6], [0.95, -2.7], [2.2, -3.2], [1.7, -0.7], [3.8, -1.7], [3.3, -0.5], [4.5, 0.1], [2.1, 1.6], [2.4, 2.5], [0.35, 2.1], [0.35, 4.4], [-0.35, 4.4], [-0.35, 2.1],
    [-2.4, 2.5], [-2.1, 1.6], [-4.5, 0.1], [-3.3, -0.5], [-3.8, -1.7], [-1.7, -0.7], [-2.2, -3.2], [-0.95, -2.7]].map(([x, y]) => (15 + x * 1.15).toFixed(2) + "," + (10.3 + y * 1.15).toFixed(2)).join(" ");
  const BANDIERE = {
    IT: () => fv("#009246", "#FFFFFF", "#CE2B37"),
    US: () => {
      let s = "";
      for (let i = 0; i < 13; i++) s += fr(0, +(i * 20 / 13).toFixed(3), 30, +(20 / 13 + 0.05).toFixed(3), i % 2 ? "#FFFFFF" : "#B22234");
      s += fr(0, 0, 12, 10.77, "#3C3B6E");
      for (let rr = 0; rr < 5; rr++) for (let c = 0; c < 6; c++) s += '<circle cx="' + (1.05 + c * 1.95).toFixed(2) + '" cy="' + (1.1 + rr * 2.1).toFixed(2) + '" r=".42" fill="#FFF"/>';
      return s;
    },
    GB: () => UJ,
    FR: () => fv("#002395", "#FFFFFF", "#ED2939"),
    DE: () => fh("#000000", "#DD0000", "#FFCE00"),
    ES: () => fr(0, 0, 30, 20, "#AA151B") + fr(0, 5, 30, 10, "#F1BF00") + scudo(7, 7.4, 4.2, 5.2, "#AA151B", "#C49A00") + fr(7.3, 6.1, 3.6, 0.9, "#C49A00"),
    AT: () => fh("#ED2939", "#FFFFFF", "#ED2939"),
    BE: () => fv("#000000", "#FDDA24", "#EF3340"),
    BG: () => fh("#FFFFFF", "#00966E", "#D62612"),
    HR: () => {
      let s = fh("#FF0000", "#FFFFFF", "#171796") + fr(12.6, 5.6, 4.8, 6, "#FFFFFF");
      for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) if ((i + j) % 2 === 0) s += fr(+(12.6 + i * 0.96).toFixed(2), 5.6 + j, 0.96, 1, "#FF0000");
      return s + '<path d="M12.6 5.6h4.8v6c0 1.3-1.2 2.2-2.4 2.6-1.2-.4-2.4-1.3-2.4-2.6z" fill="none" stroke="#171796" stroke-width=".35"/>';
    },
    CY: () => fr(0, 0, 30, 20, "#FFFFFF") + '<path d="M7.5 9.6c1.4-.9 3.4-1 5-1.6 1.7-.6 3.2-1.6 5.2-1.7 1.4-.1 2.8-.6 4-1.6.2 1-.4 1.9-1.3 2.4-1.2.7-2.5 1-3.4 1.9-.9.9-2.1 1.4-3.4 1.6-1.6.3-3.3.1-4.6-.2-.6-.2-1.2-.4-1.5-.8z" fill="#D57800"/>' +
      '<path d="M10.5 13.2c1.6 1.4 3 1.9 4.5 1.9M19.5 13.2c-1.6 1.4-3 1.9-4.5 1.9" stroke="#4E5B31" stroke-width=".9" fill="none"/>',
    CZ: () => fh("#FFFFFF", "#D7141A") + '<path d="M0 0L15 10L0 20z" fill="#11457E"/>',
    DK: () => nord("#C8102E", "#FFFFFF"),
    EE: () => fh("#0072CE", "#000000", "#FFFFFF"),
    FI: () => nord("#FFFFFF", "#002F6C"),
    GR: () => {
      let s = "";
      for (let i = 0; i < 9; i++) s += fr(0, +(i * 20 / 9).toFixed(3), 30, +(20 / 9 + 0.05).toFixed(3), i % 2 ? "#FFFFFF" : "#0D5EAF");
      return s + fr(0, 0, 11.11, 11.11, "#0D5EAF") + fr(4.44, 0, 2.22, 11.11, "#FFFFFF") + fr(0, 4.44, 11.11, 2.22, "#FFFFFF");
    },
    HU: () => fh("#CE2939", "#FFFFFF", "#477050"),
    IE: () => fv("#169B62", "#FFFFFF", "#FF883E"),
    LV: () => fr(0, 0, 30, 20, "#9E3039") + fr(0, 8, 30, 4, "#FFFFFF"),
    LT: () => fh("#FDB913", "#006A44", "#C1272D"),
    LU: () => fh("#EA141D", "#FFFFFF", "#51ADDA"),
    MT: () => fv("#FFFFFF", "#CF142B") + '<rect x="2" y="2" width="4.4" height="4.4" fill="#C3C3C3" stroke="#9E1B32" stroke-width=".35"/>' + fr(3.9, 2.4, 0.6, 3.6, "#EDEDED") + fr(2.4, 3.9, 3.6, 0.6, "#EDEDED"),
    NL: () => fh("#AE1C28", "#FFFFFF", "#21468B"),
    PL: () => fh("#FFFFFF", "#DC143C"),
    PT: () => fr(0, 0, 12, 20, "#006600") + fr(12, 0, 18, 20, "#FF0000") + '<circle cx="12" cy="10" r="4.2" fill="none" stroke="#FFE900" stroke-width="1.2"/>' + scudo(10.3, 7.8, 3.4, 4.6, "#FFFFFF", "#FF0000", 0.55),
    RO: () => fv("#002B7F", "#FCD116", "#CE1126"),
    SK: () => fh("#FFFFFF", "#0B4EA2", "#EE1C25") + scudo(6.6, 4.4, 7.4, 11.6, "#EE1C25", "#FFFFFF", 0.7) +
      '<path d="M10.3 6.3v6.8M8.7 8.1h3.2M8.2 10.1h4.2" stroke="#FFF" stroke-width=".9"/><path d="M7.6 13.2c.9-1.2 1.8-1.2 2.7 0 .9-1.2 1.8-1.2 2.7 0-.6 1-1.5 1.7-2.7 2.3-1.2-.6-2.1-1.3-2.7-2.3z" fill="#0B4EA2"/>',
    SI: () => fh("#FFFFFF", "#005DA4", "#ED1C24") + scudo(6.4, 3.2, 5.2, 7.6, "#005DA4", "#ED1C24", 0.5) + '<path d="M7.2 8.1l1.2-1.8.8 1 .8-1 1.2 1.8z" fill="#FFF"/>' +
      '<circle cx="8" cy="4.6" r=".35" fill="#FFDD00"/><circle cx="9" cy="4.2" r=".35" fill="#FFDD00"/><circle cx="10" cy="4.6" r=".35" fill="#FFDD00"/>',
    SE: () => nord("#006AA7", "#FECC00"),
    CH: () => fr(0, 0, 30, 20, "#DA291C") + fr(13.2, 4, 3.6, 12, "#FFFFFF") + fr(9, 8.2, 12, 3.6, "#FFFFFF"),
    NO: () => nord("#BA0C2F", "#FFFFFF", "#00205B"),
    IS: () => nord("#02529C", "#FFFFFF", "#DC1E35"),
    AL: () => fr(0, 0, 30, 20, "#E41E20") + '<path d="' + AQUILA + '" fill="#000"/>',
    BA: () => {
      let s = fr(0, 0, 30, 20, "#002395") + '<path d="M8.5 0H23.5V15z" fill="#FECB00"/>';
      for (let t = 0; t < 8; t++) s += stella(5.4 + 2.3 * t, 0.9 + 2.3 * t, 0.95, "#FFFFFF");
      return s;
    },
    XK: () => fr(0, 0, 30, 20, "#244AA5") + '<path d="M12.2 9.4l1.6-1.6 2.2.3 1.9-.8 1.4 1.2-.3 1.8 1 1.5-1.2 1.7-1.9.4-1.4 1.3-1.8-.6-.8-1.6-1.3-.9z" fill="#D0A650"/>' +
      [[9.6, 6.9], [11.9, 5.8], [14.3, 5.3], [16.7, 5.3], [19.1, 5.8], [21.4, 6.9]].map(([x, y]) => stella(x, y, 0.85, "#FFFFFF")).join(""),
    ME: () => fr(0, 0, 30, 20, "#C40308") + '<rect x=".6" y=".6" width="28.8" height="18.8" fill="none" stroke="#D3AE3B" stroke-width="1.2"/>' +
      '<path d="' + AQUILA + '" fill="#D3AE3B" transform="translate(15 10) scale(.82) translate(-15 -10)"/>',
    MK: () => fr(0, 0, 30, 20, "#D20000") +
      '<path d="M15 10L13.6 0H16.4zM15 10L13.6 20H16.4zM15 10L0 8.6V11.4zM15 10L30 8.6V11.4zM15 10L0 1.8V0H2.7zM15 10L30 1.8V0H27.3zM15 10L0 18.2V20H2.7zM15 10L30 18.2V20H27.3z" fill="#FFE600"/>' +
      '<circle cx="15" cy="10" r="3.3" fill="#D20000"/><circle cx="15" cy="10" r="2.6" fill="#FFE600"/>',
    RS: () => fh("#C6363C", "#0C4076", "#FFFFFF") + scudo(7.2, 5.4, 4.6, 8.4, "#C6363C", "#EDB92E") + '<path d="M9.5 6.6v6M7.9 9h3.2" stroke="#FFF" stroke-width=".8"/>' + fr(7.6, 4.3, 3.8, 1, "#EDB92E"),
    UA: () => fh("#0057B7", "#FFD700"),
    MD: () => fv("#003DA5", "#FFD200", "#CC092F") + '<path d="M15 5.6l1 1.4 2.2-.8-.6 1.8 1.6.4-1.6 1 .6 1.8-2-.6-.4 2.6h-1.6l-.4-2.6-2 .6.6-1.8-1.6-1 1.6-.4-.6-1.8 2.2.8z" fill="#B07E2C"/>' + fr(14.2, 9.6, 1.6, 2, "#CC092F"),
    RU: () => fh("#FFFFFF", "#0039A6", "#D52B1E"),
    BY: () => {
      let s = fr(0, 0, 30, 13.33, "#C8313E") + fr(0, 13.33, 30, 6.67, "#4AA657") + fr(0, 0, 3.6, 20, "#FFFFFF");
      for (let k = 0; k < 6; k++) s += '<path d="M1.8 ' + (k * 3.4 + 0.3).toFixed(1) + 'l1.1 1.4-1.1 1.4-1.1-1.4z" fill="#C8313E"/>';
      return s;
    },
    AD: () => fr(0, 0, 9.6, 20, "#10069F") + fr(9.6, 0, 10.8, 20, "#FEDF00") + fr(20.4, 0, 9.6, 20, "#D50032") + scudo(13, 6.5, 4, 7.4, "#C7B37F", "#B6202B", 0.35) +
      fr(13.4, 6.9, 1.5, 1.9, "#FEDF00") + fr(15.1, 6.9, 1.5, 1.9, "#D50032"),
    LI: () => fh("#002B7F", "#CE1126") + '<path d="M4.2 7.4l.4-3 1.4 1.4 1.4-2.2 1.4 2.2 1.4-1.4.4 3z" fill="#FFD83D"/>',
    MC: () => fh("#CE1126", "#FFFFFF"),
    SM: () => fh("#FFFFFF", "#5EB6E4") + scudo(13.2, 6.5, 3.6, 6.6, "#5EB6E4", "#C9A227") + fr(13.7, 7.4, 0.6, 1.6, "#FFFFFF") + fr(14.7, 7, 0.6, 2, "#FFFFFF") + fr(15.7, 7.4, 0.6, 1.6, "#FFFFFF"),
    VA: () => fv("#FFE000", "#FFFFFF") + '<path d="M19.2 13.6l5.4-6.2" stroke="#C9A227" stroke-width=".9"/><path d="M24.6 13.6l-5.4-6.2" stroke="#B5B5B5" stroke-width=".9"/>' +
      '<path d="M20.4 7.2c0-1.7.8-2.8 1.5-2.8s1.5 1.1 1.5 2.8z" fill="#FFE000" stroke="#C9A227" stroke-width=".3"/>',
    CA: () => fr(0, 0, 30, 20, "#FFFFFF") + fr(0, 0, 7.5, 20, "#D80621") + fr(22.5, 0, 7.5, 20, "#D80621") + '<polygon points="' + FOGLIA + '" fill="#D80621"/>',
    AU: () => fr(0, 0, 30, 20, "#012169") + CANTONE + stella(7.5, 15, 2.4, "#FFFFFF", 7) +
      [[22.5, 16.3, 1.25], [22.5, 4.2, 1.25], [19, 9, 1.25], [26, 8, 1.25]].map(([x, y, s]) => stella(x, y, s, "#FFFFFF", 7)).join("") + stella(24.2, 11.2, 0.7, "#FFFFFF"),
    NZ: () => fr(0, 0, 30, 20, "#012169") + CANTONE +
      [[22.5, 15.6, 1.45], [22.5, 4.6, 1.3], [19.2, 9.2, 1.3], [25.8, 8.4, 1.15]].map(([x, y, s]) => stella(x, y, s, "#C8102E", 5, ' stroke="#FFF" stroke-width=".45"')).join("")
  };
  G.flag = (code) => '<svg class="flag" viewBox="0 0 30 20" width="30" height="20" aria-hidden="true" focusable="false">' + (BANDIERE[code] || BANDIERE.IT)() + "</svg>";

  // il foglio per scegliere il paese: l'Italia e i paesi con gli articoli ogni giorno, poi gli altri in ordine alfabetico, con la ricerca
  const senzaAccenti = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let ritornoPaesi = null;
  G.apriPaesi = (opt) => {
    ritornoPaesi = (opt && opt.ritorno) || null;
    let d = document.getElementById("paesi");
    if (!d) {
      d = document.createElement("dialog");
      d.className = "menu paesi";
      d.id = "paesi";
      d.setAttribute("aria-labelledby", "paesi-t");
      document.body.appendChild(d);
    }
    const scelto = G.paese(), coll = new Intl.Collator(G.en ? "en" : "it");
    const primi = G.PAESI.filter((p) => p.level === 1), altri = G.PAESI.filter((p) => p.level !== 1).sort((a, b) => coll.compare(G.paeseNome(a.code), G.paeseNome(b.code)));
    const riga = (p) => '<li><button type="button" data-paese="' + p.code + '" aria-pressed="' + (p.code === scelto) + '" data-q="' + G.esc(senzaAccenti(p.it + " " + p.en)) + '">' +
      G.flag(p.code) + '<span class="pn">' + G.esc(G.paeseNome(p.code)) + "</span></button></li>";
    d.innerHTML = '<div class="menu-in"><div class="grab" aria-hidden="true"></div>' +
      '<div class="menu-head"><h2 class="menu-t" id="paesi-t">' + G.L("Il tuo paese", "Your country") + '</h2><button class="menu-x" type="button" data-close aria-label="' + G.L("Chiudi", "Close") + '">' +
      '<svg aria-hidden="true" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="15" fill="currentColor" opacity=".1"/><path d="M10.5 10.5l9 9m0-9-9 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>' +
      '<p class="paesi-sub">' + G.L("In prima pagina la scheda del tuo paese prende il posto di Italia, con le sue notizie principali. La lingua segue il paese: italiano per l'Italia, inglese per gli altri.", "On the front page your country's tab takes the place of Italy, with its main news. The language follows the country: Italian for Italy, English for the others.") + "</p>" +
      '<input class="paesi-q" type="search" autocomplete="off" spellcheck="false" placeholder="' + G.L("Cerca un paese", "Search for a country") + '" aria-label="' + G.L("Cerca un paese", "Search for a country") + '">' +
      '<p class="opt-l paesi-g">' + G.L("Articoli e brevi ogni giorno", "Articles and briefs every day") + '</p><ul class="paesi-l">' + primi.map(riga).join("") + "</ul>" +
      '<p class="opt-l paesi-g">' + G.L("Le brevi delle testate del paese", "Briefs from the country's outlets") + '</p><ul class="paesi-l">' + altri.map(riga).join("") + "</ul>" +
      '<p class="paesi-none" hidden>' + G.L("Nessun paese con questo nome.", "No country with this name.") + "</p></div>";
    const close = () => {
      if (!d.open || d.classList.contains("closing")) return;
      const done = () => {
        d.classList.remove("closing"); d.close();
        if (!document.querySelector("dialog[open]")) document.documentElement.classList.remove("menu-open");
        const b = ritornoPaesi && ritornoPaesi.isConnected ? ritornoPaesi : document.getElementById("paese-btn");
        if (b) b.focus({ preventScroll: true });
      };
      d.classList.add("closing");
      const anims = G.reduced() || !d.getAnimations ? [] : d.getAnimations();
      if (!anims.length) return done();
      Promise.all(anims.map((a) => a.finished)).then(done, done);
    };
    if (!d._wired) {
      d._wired = true;
      d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
      d.addEventListener("click", (e) => {
        if (e.target === d || e.target.closest("[data-close]")) { close(); return; }
        const b = e.target.closest("[data-paese]");
        if (!b) return;
        e.stopPropagation();
        if (b.dataset.paese !== G.paese()) G.setPaese(b.dataset.paese);
        close();
      });
      d.addEventListener("input", (e) => {
        if (!e.target.matches(".paesi-q")) return;
        const q = senzaAccenti(e.target.value.trim());
        let n = 0;
        d.querySelectorAll(".paesi-l li").forEach((li) => { const on = !q || li.firstChild.dataset.q.includes(q); li.hidden = !on; if (on) n += 1; });
        d.querySelectorAll(".paesi-l").forEach((ul) => { const vis = Array.from(ul.children).some((li) => !li.hidden); ul.hidden = !vis; ul.previousElementSibling.hidden = !vis; });
        d.querySelector(".paesi-none").hidden = n > 0;
      });
    }
    d.classList.remove("closing");
    document.documentElement.classList.add("menu-open");
    d.showModal();
    // il fuoco sul paese scelto (non sulla ricerca: sul telefono aprirebbe la tastiera)
    const cur = d.querySelector('[data-paese="' + scelto + '"]');
    if (cur) { cur.focus({ preventScroll: true }); cur.scrollIntoView({ block: "center" }); }
  };

  // ---------- i Principali: la prima scheda dei mercati in prima pagina, con i mercati scelti da chi legge (fino a sei,
  // nell'ordine in cui li ha scelti). Restano nel browser (gerico.principali) e, con l'account, nell'account. Senza una
  // scelta la scheda la fa GERICO (con i mercati dei tuoi interessi). Ogni cambio manda l'evento gerico:principali ----------
  G.principali = (() => {
    const K = "gerico.principali", OK = /^[A-Za-z0-9^=.\-]{1,20}$/;
    const pulito = (v) => (Array.isArray(v) ? Array.from(new Set(v.filter((x) => typeof x === "string" && OK.test(x)))).slice(0, 6) : []);
    const leggi = () => { const v = pulito(G.ls.get(K, null)); return v.length ? v : null; };
    const scrivi = (v, sync) => {
      const x = pulito(v);
      G.ls.set(K, x.length ? x : null);
      document.dispatchEvent(new CustomEvent("gerico:principali", { detail: { sync: !!sync } }));
    };
    return { leggi, scrivi, pulito, MAX: 6 };
  })();

  // ---------- i tuoi interessi: sezioni, mercati, come leggi (e i temi da seguire) ----------
  // Restano nel browser (gerico.interessi) e, con l'account, nell'account. Cambiano il sito in modo che si veda: le sezioni
  // scelte vengono prima nella barra; in Tutte, a parità di importanza, prima le storie delle sezioni e dei temi che ti
  // interessano (la notizia più importante del giorno resta in cima per tutti); i mercati scelti in prima pagina; la vista
  // e il gruppo da cui parte il Terminal; con le brevi scelte, in Tutte arrivano subito dopo la prima notizia.
  // I temi della domanda sono i temi seguiti (gerico.follows). Ogni cambio manda l'evento gerico:interessi.
  G.interessi = (() => {
    const K = "gerico.interessi";
    const L = G.L;
    const SEZ = ["economia", "mondo", "paese", "tecnologia"];
    const MERC = ["italia", "europa", "usa", "asia", "valute", "materie-prime", "cripto"];
    const LETT = ["articoli", "brevi", "ascolto"];
    const leggi = () => { const v = G.ls.get(K, null); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; };
    const lista = (v, k, ok) => (Array.isArray(v[k]) ? ok.filter((x) => v[k].includes(x)) : []);
    const pulito = (v) => ({ sezioni: lista(v, "sezioni", SEZ), mercati: lista(v, "mercati", MERC.concat("nessuno")), lettura: lista(v, "lettura", LETT), fatto: v.fatto === true });
    const sezioni = () => pulito(leggi()).sezioni;
    const mercati = () => pulito(leggi()).mercati.filter((x) => x !== "nessuno");
    const lettura = () => pulito(leggi()).lettura;
    // il Terminal parte dai mercati scelti: la vista della mappa, la Borsa segnata, il gruppo dei grafici
    const terminal = (m) => {
      const ha = (x) => m.includes(x), borse = ["italia", "europa", "usa", "asia"].some(ha);
      if (borse) {
        G.ls.set("gerico.mapView", (ha("italia") || ha("europa")) && !ha("usa") && !ha("asia") ? "europa" : "mondo");
        G.ls.set("gerico.mapSel", ha("italia") ? "ITA" : ha("europa") ? "DEU" : ha("usa") ? "USA" : "JPN");
      }
      const g = ha("valute") ? "valute" : ha("materie-prime") ? "materie" : ha("cripto") ? "cripto" : borse ? "indici" : "";
      if (g) G.ls.set("gerico.grGroup", g);
    };
    // sync: arrivano dall'account (un altro dispositivo); il Terminal si riallinea solo se i mercati sono cambiati
    const scrivi = (v, sync) => {
      const prima = pulito(leggi()), nuovo = pulito(Object.assign({}, prima, v));
      G.ls.set(K, nuovo);
      if (prima.mercati.join() !== nuovo.mercati.join()) terminal(nuovo.mercati);
      document.dispatchEvent(new CustomEvent("gerico:interessi", { detail: { sync: !!sync } }));
    };
    const NOMI = {
      economia: () => L("Economia e mercati", "Economy and markets"), mondo: () => L("Mondo", "World"), paese: () => G.paeseNome(G.paese()), tecnologia: () => L("Tecnologia", "Technology"),
      italia: () => L("Italia", "Italy"), europa: () => L("Europa", "Europe"), usa: () => L("Stati Uniti", "United States"), asia: () => "Asia",
      valute: () => L("Valute", "Currencies"), "materie-prime": () => L("Materie prime", "Commodities"), cripto: () => L("Cripto", "Crypto"), nessuno: () => L("Non seguo i mercati", "I don't follow the markets"),
      articoli: () => L("Articoli completi", "Full articles"), brevi: () => L("Brevi", "News in brief"), ascolto: () => L("Il riepilogo da ascoltare", "The audio briefing")
    };
    const nome = (k) => (NOMI[k] ? NOMI[k]() : k);
    // in una riga: «Economia e mercati, Tecnologia · mercati: Italia, Cripto · legge: brevi»; paese: di chi sono gli
    // interessi (nel gestionale, quello dell'iscritto), se no quello scelto qui
    const testo = (v, paese) => {
      const x = pulito(v || leggi()), parti = [];
      if (x.sezioni.length) parti.push(x.sezioni.map((k) => (k === "paese" && paese ? G.paeseNome(paese) : nome(k))).join(", "));
      if (x.mercati.length) parti.push(x.mercati.includes("nessuno") ? nome("nessuno") : L("mercati: ", "markets: ") + x.mercati.map(nome).join(", "));
      if (x.lettura.length) parti.push(L("legge: ", "reads: ") + x.lettura.map((k) => nome(k).toLowerCase()).join(", "));
      return parti.join(" · ");
    };

    // i temi da proporre: i temi caldi, poi i più frequenti nelle storie di questi giorni (oggi contano doppio), poi quelli
    // che segui già
    const temiSettimana = async () => {
      let ed = null;
      try { ed = await G.load("edition"); } catch (e) { ed = null; }
      const out = [], visti = new Set();
      const add = (t, caldo, vis) => { const k = String(t).toLowerCase(); if (t && !visti.has(k) && out.length < 14) { visti.add(k); out.push([t, caldo, vis]); } };
      if (ed) {
        (ed.themes || []).slice(0, 3).forEach((t) => t && t.label && add(t.labelIt || t.label, true, t.label));
        const live = new Set((ed.stories || []).map((s) => s.id)), n = {};
        (ed.stories || []).concat(ed.archive || []).forEach((s) => s && s.scope !== "paese" && (s.tags || []).forEach((t) => { if (typeof t === "string" && t) n[t] = (n[t] || 0) + (live.has(s.id) ? 2 : 1); }));
        Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b)).slice(0, 9).forEach((t) => add(t, false));
      }
      G.follows().forEach((t) => add(t, false));
      return out;
    };

    const DOMANDE = [
      { k: "sezioni", t: () => L("Quali sezioni ti interessano di più?", "Which sections interest you most?"), s: () => L("Vengono prima nella barra delle sezioni, e le loro storie prima in Tutte.", "They come first in the section bar, and their stories first in All."), o: () => SEZ },
      { k: "temi", t: () => L("Quali temi vuoi seguire?", "Which topics do you want to follow?"), s: () => L("I temi di questi giorni. Le loro storie le trovi nei Seguiti, e in Tutte vengono prima.", "This week's topics. Their stories are in Following, and come first in All.") },
      { k: "mercati", t: () => L("Segui i mercati? Quali?", "Do you follow the markets? Which ones?"), s: () => L("Li trovi in prima pagina, e il Terminal parte da lì.", "You'll see them on the front page, and the Terminal starts there."), o: () => MERC.concat("nessuno"), solo: "nessuno" },
      { k: "lettura", t: () => L("Come preferisci leggere?", "How do you like to read?"), s: () => L("Con le brevi scelte, in Tutte le trovi subito dopo la prima notizia.", "If you pick news in brief, in All it comes right after the top story."), o: () => LETT }
    ];
    // le risposte di una domanda: bottoni da toccare (scelte multiple; «Non seguo i mercati» esclude le altre)
    const scelte = async (q, attive) => {
      if (q.k === "temi") {
        const temi = await temiSettimana(), f = G.follows();
        if (!temi.length) return '<p class="conto-nota">' + L("Oggi non ci sono temi da proporre: li segui in fondo a ogni storia.", "No topics to suggest today: follow them at the bottom of any story.") + "</p>";
        return '<div class="tags int-tags" role="group" aria-label="' + G.esc(q.t()) + '">' + temi.map(([t, caldo, vis]) => '<button type="button" class="tag" data-tema="' + G.esc(t) + '" data-nome="' + G.esc(vis || G.tn(t)) + '" aria-pressed="' + f.includes(t) + '">' +
          (caldo ? '<span class="hot-dot" aria-hidden="true"></span>' : "") + G.esc(vis || G.tn(t)) + (caldo ? '<span class="sr-only">' + L(", tema caldo", ", hot topic") + "</span>" : "") + "</button>").join("") + "</div>";
      }
      return '<div class="tags int-tags" role="group" aria-label="' + G.esc(q.t()) + '">' + q.o().map((x) => '<button type="button" class="tag' + (x === q.solo ? " int-solo" : "") + '" data-int="' + q.k + '" data-v="' + x + '" aria-pressed="' + attive.includes(x) + '">' +
        (q.k === "sezioni" && x === "paese" ? G.flag(G.paese()) : "") + G.esc(nome(x)) + "</button>").join("") + "</div>";
    };
    // un tocco su una risposta: subito nel browser (e nell'account), con l'effetto sulla pagina
    const tocca = (b) => {
      if (b.dataset.tema) {
        G.toggleFollow(b.dataset.tema, b.dataset.nome);
        b.setAttribute("aria-pressed", String(G.follows().includes(b.dataset.tema)));
        return;
      }
      const k = b.dataset.int, v = b.dataset.v, q = DOMANDE.find((x) => x.k === k), cur = pulito(leggi())[k];
      let nuovo = cur.includes(v) ? cur.filter((x) => x !== v) : cur.concat(v);
      if (q.solo) nuovo = v === q.solo ? (nuovo.includes(v) ? [v] : []) : nuovo.filter((x) => x !== q.solo);
      scrivi({ [k]: nuovo });
      b.closest(".int-tags").querySelectorAll("[data-int]").forEach((x) => x.setAttribute("aria-pressed", String(nuovo.includes(x.dataset.v))));
    };

    return { leggi, scrivi, pulito, sezioni, mercati, lettura, testo, nome, domande: DOMANDE, scelte, tocca,
      apri: () => G.percorso.apri("indice"), dopoIscrizione: (u) => G.percorso.apri("dopo", { nome: u.nome }) };
  })();

  // ---------- account: passkey, preferenze su ogni dispositivo, i tuoi dati ----------
  // Il Worker di GERICO (/api/, database D1 su Cloudflare) tiene gli account. Senza account tutto resta nel browser come
  // prima. Con l'account il browser tiene solo un promemoria (gerico.conto: il nome, per disegnare il menu senza aspettare
  // la rete); chi sei lo dice il cookie tecnico del Worker, che lo script non vede (HttpOnly). Temi seguiti, paese e
  // interessi seguono l'account: al primo accesso su un dispositivo quelli del browser si uniscono a quelli dell'account,
  // poi vale l'account. Le visite e gli errori delle pagine si contano senza cookie e senza legarli a nessuno.
  G.CONTI = true;
  G.conto = (() => {
    const K = "gerico.conto", PROP = "gerico.proposta", SOSPESO = "gerico.conto.salva";
    // GIA: su questo dispositivo qualcuno è già entrato con un account (resta anche dopo l'uscita)
    const GIA = "gerico.giaEntrato";
    let io = null, primo = null, applico = false;
    const passkeyOk = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && window.isSecureContext);
    const L = G.L;

    const api = async (via, corpo) => {
      const opt = corpo === undefined ? { credentials: "same-origin", cache: "no-store" }
        : { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) };
      const r = await fetch("/api/" + via, opt);
      let d = null;
      try { d = await r.json(); } catch (e) { d = null; }
      if (!r.ok) { const e = new Error((d && d.errore) || "http-" + r.status); e.stato = r.status; throw e; }
      return d;
    };
    const b64u = (buf) => {
      const b = new Uint8Array(buf);
      let t = "";
      for (let i = 0; i < b.length; i++) t += String.fromCharCode(b[i]);
      return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const da64u = (x) => {
      const t = atob(String(x).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((x.length + 3) % 4));
      const o = new Uint8Array(t.length);
      for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i);
      return o;
    };
    // un errore detto in parole semplici
    const spiega = (e) => {
      const c = (e && e.message) || "";
      if (e && e.name === "NotAllowedError") return L("La passkey non è arrivata: annullata o scaduta. Riprova quando vuoi.", "The passkey didn't come through: cancelled or timed out. Try again whenever you like.");
      if (e && e.name === "InvalidStateError") return L("Su questo dispositivo c'è già una passkey di GERICO: usa «Accedi».", "This device already has a GERICO passkey: use “Sign in”.");
      if (e && e.name === "SecurityError") return L("Le passkey funzionano solo sull'indirizzo del sito.", "Passkeys only work on the site's own address.");
      if (e && e.name === "NotSupportedError") return L("Questo dispositivo non sa creare la passkey che serve.", "This device can't create the passkey that's needed.");
      const m = {
        "troppi-tentativi": L("Troppi tentativi in poco tempo: riprova tra un minuto.", "Too many attempts in a short time: try again in a minute."),
        "passkey-sconosciuta": L("Questa passkey non è legata a nessun account GERICO: forse l'account è stato cancellato.", "This passkey isn't linked to any GERICO account: the account may have been deleted."),
        "sfida-scaduta": L("È passato troppo tempo: riprova.", "Too much time went by: try again."),
        nome: L("Scrivi il nome da mostrare, al massimo 40 caratteri.", "Type a display name, up to 40 characters."),
        email: L("L'email non sembra giusta: controllala, o lasciala vuota.", "The email doesn't look right: check it, or leave it empty."),
        "non-attivi": L("Gli account non sono ancora attivi.", "Accounts aren't switched on yet."),
        "senza-accesso": L("La sessione è scaduta: rientra dal menu.", "Your session has expired: sign in again from the menu.")
      };
      if (m[c]) return m[c];
      if (/^passkey-/.test(c)) return L("La passkey non è stata accettata: riprova.", "The passkey wasn't accepted: try again.");
      if (e && e.stato >= 500) return L("Il server ha avuto un problema: riprova tra poco.", "The server had a problem: try again shortly.");
      if (e instanceof TypeError) return L("Non c'è connessione: riprova quando torna la rete.", "No connection: try again when you're back online.");
      return L("Qualcosa non è andato: riprova.", "Something went wrong: try again.");
    };

    const avvisa = () => document.dispatchEvent(new CustomEvent("gerico:conto", { detail: { utente: io } }));
    const via = () => {
      io = null;
      try { localStorage.removeItem(K); localStorage.removeItem(SOSPESO); } catch (e) { /* niente */ }
    };

    // ---------- preferenze: dal browser all'account e ritorno ----------
    let attesa = {}, timer = 0;
    const manda = async (keep) => {
      clearTimeout(timer);
      const corpo = attesa;
      attesa = {};
      if (!io || !Object.keys(corpo).length) return;
      try {
        if (keep) { fetch("/api/preferenze", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => {}); return; }
        const d = await api("preferenze", corpo);
        io.prefs = d.prefs;
        if (!Object.keys(attesa).length) G.ls.set(SOSPESO, false);
      } catch (e) {
        if (e.stato === 401) { via(); avvisa(); }
      }
    };
    const salva = (parte) => {
      if (!io) return;
      Object.assign(attesa, parte);
      G.ls.set(SOSPESO, true);
      clearTimeout(timer);
      timer = setTimeout(manda, 700);
    };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && Object.keys(attesa).length) manda(true); });
    // una scelta fatta qui va all'account; fatta mentre la pagina chiede ancora all'account chi sei, si segna come in sospeso:
    // così la risposta dell'account non la cancella (vedi applica)
    const cambio = (e, parte) => {
      if (applico || (e.detail && e.detail.sync)) return;
      if (io) salva(parte());
      else if (G.ls.get(K, null)) G.ls.set(SOSPESO, true);
    };
    document.addEventListener("gerico:follows", (e) => cambio(e, () => ({ temi: G.follows() })));
    document.addEventListener("gerico:paese", (e) => cambio(e, () => ({ paese: G.paese() })));
    document.addEventListener("gerico:interessi", (e) => cambio(e, () => ({ interessi: G.interessi.leggi() })));
    document.addEventListener("gerico:principali", (e) => cambio(e, () => ({ principali: G.principali.leggi() || [] })));
    const uguali = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    // primo: primo accesso su questo dispositivo, i temi del browser si aggiungono a quelli dell'account
    const unisci = (p, primoQui) => {
      const loc = G.follows(), srv = Array.isArray(p.temi) ? p.temi : null;
      const temi = srv === null ? loc : primoQui ? srv.concat(loc.filter((t) => !srv.includes(t))) : srv;
      applico = true;
      try {
        if (!uguali(temi, loc)) {
          G.ls.set("gerico.follows", temi);
          document.dispatchEvent(new CustomEvent("gerico:follows", { detail: { sync: true } }));
        }
        if (p.paese && p.paese !== G.paese()) G.setPaese(p.paese, true);
        if (p.interessi && JSON.stringify(G.interessi.pulito(p.interessi)) !== JSON.stringify(G.interessi.pulito(G.interessi.leggi()))) G.interessi.scrivi(p.interessi, true);
        if (Array.isArray(p.principali) && !uguali(G.principali.pulito(p.principali), G.principali.leggi() || [])) G.principali.scrivi(p.principali, true);
      } finally { applico = false; }
      const cambia = {};
      if (srv === null || !uguali(temi, srv)) cambia.temi = temi;
      if (!p.paese) cambia.paese = G.paese();
      const mie = G.interessi.pulito(G.interessi.leggi());
      if (!p.interessi && (mie.fatto || mie.sezioni.length || mie.mercati.length || mie.lettura.length)) cambia.interessi = mie;
      if (!Array.isArray(p.principali) && G.principali.leggi()) cambia.principali = G.principali.leggi();
      if (Object.keys(cambia).length) salva(cambia);
    };
    // la risposta di /api/io: chi sei per il Worker
    const applica = (d, primoQui) => {
      const prima = G.ls.get(K, null);
      if (!d || !d.utente) {
        if (prima || io) {
          via();
          avvisa();
          // l'accesso dura 400 giorni e si rinnova a ogni visita: se non c'è più, di solito l'ha cancellato il browser.
          // Un tocco e si rientra con la passkey
          G.toast(L("Su questo browser non sei più dentro.", "You're no longer signed in on this browser."), { label: L("Rientra", "Sign in"), fn: () => { accedi().catch((e) => G.toast(spiega(e))); } });
        }
        return d;
      }
      // l'evento parte solo se cambia qualcosa per la pagina: un accesso nuovo o un altro nome
      const cambiato = !prima || prima.nome !== d.utente.nome || !!prima.admin !== !!d.utente.admin;
      io = d.utente;
      G.ls.set(K, nota_(io));
      G.ls.set(GIA, true);
      // modifiche fatte qui e non ancora arrivate al server: vince questo browser
      if (G.ls.get(SOSPESO, false)) salva({ temi: G.follows(), paese: G.paese(), interessi: G.interessi.leggi(), principali: G.principali.leggi() || [] });
      else unisci(io.prefs || {}, primoQui);
      if (cambiato) avvisa();
      return d;
    };
    // le preferenze dell'account si applicano quando la pagina ha finito di disegnarsi e ascolta i cambi (al massimo 3 s)
    // il promemoria nel browser: il nome, e se è l'account di Riccardo (per la voce «Gestionale» del menu; chi può
    // aprire /admin lo decide comunque il Worker)
    const nota_ = (u) => (u.admin ? { nome: u.nome, admin: true } : { nome: u.nome });
    const paginaPronta = () => Promise.race([G.P.done, new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
    const chiedi = (opt) => {
      if (opt && opt.admin) return api("io?admin=1").then((d) => applica(d, false));
      if (!primo) primo = api("io").then((d) => paginaPronta().then(() => applica(d, false))).catch((e) => { primo = null; throw e; });
      return primo;
    };
    const entrato = (u) => {
      io = u;
      G.ls.set(K, nota_(u));
      G.ls.set(GIA, true);
      unisci(u.prefs || {}, true);
      primo = Promise.resolve({ attivo: true, utente: u });
      avvisa();
    };

    // ---------- passkey ----------
    const iscriviti = async (nome, email) => {
      const o = await api("registra/opzioni", { nome, email });
      const pk = o.publicKey;
      const cred = await navigator.credentials.create({ publicKey: Object.assign({}, pk, { challenge: da64u(pk.challenge), user: Object.assign({}, pk.user, { id: da64u(pk.user.id) }) }) });
      const r = cred.response;
      const d = await api("registra/verifica", {
        sfida: o.sfida,
        credenziale: { id: cred.id, rawId: b64u(cred.rawId), type: cred.type, response: { clientDataJSON: b64u(r.clientDataJSON), attestationObject: b64u(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] } }
      });
      entrato(d.utente);
      return d.utente;
    };
    const accedi = async () => {
      const o = await api("accedi/opzioni", {});
      const pk = o.publicKey;
      const cred = await navigator.credentials.get({ publicKey: Object.assign({}, pk, { challenge: da64u(pk.challenge) }) });
      const r = cred.response;
      let d;
      try {
        d = await api("accedi/verifica", {
          sfida: o.sfida,
          credenziale: { id: cred.id, rawId: b64u(cred.rawId), type: cred.type, response: { clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature), userHandle: r.userHandle ? b64u(r.userHandle) : null } }
        });
      } catch (e) {
        // la passkey di un account cancellato: il telefono può toglierla dal suo elenco
        if (e.message === "passkey-sconosciuta" && window.PublicKeyCredential && PublicKeyCredential.signalUnknownCredential) PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId: cred.id }).catch(() => {});
        throw e;
      }
      entrato(d.utente);
      G.toast(L("Bentornato, ", "Welcome back, ") + d.utente.nome);
      return d.utente;
    };
    const esci = async () => {
      await api("esci", {});
      via();
      primo = null;
      avvisa();
      G.toast(L("Sei uscito. Temi e paese restano in questo browser.", "You've signed out. Topics and country stay in this browser."));
    };
    const cancella = async () => {
      const d = await api("cancella", {});
      if (window.PublicKeyCredential && PublicKeyCredential.signalUnknownCredential) (d.passkey || []).forEach((id) => PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId: id }).catch(() => {}));
      via();
      primo = null;
      avvisa();
    };

    // ---------- i fogli: proposta e iscrizione, i tuoi dati ----------
    const X = '<svg aria-hidden="true" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="15" fill="currentColor" opacity=".1"/><path d="M10.5 10.5l9 9m0-9-9 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    // un foglio alla volta: se ne è già aperto uno (l'iscrizione che diventa le domande sugli interessi), il contenuto
    // cambia al suo posto, senza chiudere e riaprire
    let corrente = null;
    const foglio = (titolo, corpo, opt) => {
      let d = document.getElementById("conto-d");
      if (!d) {
        d = document.createElement("dialog");
        d.id = "conto-d";
        d.className = "menu conto-d";
        d.setAttribute("aria-labelledby", "conto-t");
        document.body.appendChild(d);
      }
      const html = document.documentElement;
      const giaAperto = d.open && !d.classList.contains("closing") && !!corrente;
      const ritorno = giaAperto ? corrente.ritorno : document.activeElement;
      if (corrente) corrente.chiuso = true;
      if (d.open && !giaAperto) { d.classList.remove("closing"); d.close(); }
      d.innerHTML = '<div class="menu-in"><div class="grab" aria-hidden="true"></div><div class="menu-head"><h2 class="menu-t" id="conto-t" tabindex="-1">' + G.esc(titolo) +
        '</h2><button class="menu-x" type="button" data-chiudi aria-label="' + L("Chiudi", "Close") + '">' + X + '</button></div><div class="conto-in">' + corpo + "</div></div>";
      const stato = { d, chiuso: false, ritorno, chiudi: null };
      corrente = stato;
      const chiudi = (come) => {
        if (stato.chiuso || corrente !== stato || !d.open) return;
        stato.chiuso = true;
        if (opt && opt.chiusa) opt.chiusa(come);
        const fine = () => {
          if (corrente !== stato) return;
          corrente = null;
          d.classList.remove("closing"); d.close();
          if (!document.querySelector("dialog[open]")) html.classList.remove("menu-open");
          if (ritorno && ritorno.isConnected && ritorno.focus) ritorno.focus({ preventScroll: true });
        };
        d.classList.add("closing");
        const an = G.reduced() || !d.getAnimations ? [] : d.getAnimations();
        if (!an.length) return fine();
        Promise.all(an.map((a) => a.finished)).then(fine, fine);
      };
      stato.chiudi = chiudi;
      d.oncancel = (e) => { e.preventDefault(); chiudi("x"); };
      d.onclick = (e) => { if (e.target === d || e.target.closest("[data-chiudi]")) chiudi("x"); };
      if (!giaAperto) {
        d.classList.remove("closing");
        html.classList.add("menu-open");
        d.showModal();
      }
      d.querySelector("#conto-t").focus({ preventScroll: true });
      return stato;
    };

    // proposta: il primo ingresso (con «Non ora»); nuovo: dal menu
    const apri = (tipo, opt) => {
      if (tipo === "dati") return apriDati(opt);
      const proposta = tipo === "proposta";
      if (!passkeyOk()) {
        foglio(L("Un account GERICO", "A GERICO account"), '<p class="conto-p">' + L("Questo browser non sa usare le passkey. Prova con Safari, Chrome, Edge o Firefox aggiornati.", "This browser can't use passkeys. Try an up-to-date Safari, Chrome, Edge or Firefox.") + "</p>");
        return;
      }
      let entrato_ = false;
      const f = foglio(proposta ? L("Un account GERICO, se vuoi", "A GERICO account, if you like") : L("Crea il tuo account", "Create your account"),
        '<p class="conto-p">' + L("Con l'account i temi che segui, il tuo paese e i tuoi interessi valgono su ogni dispositivo. Per leggere non serve.", "With an account, the topics you follow, your country and your interests work on every device. You don't need one to read.") + "</p>" +
        '<form class="conto-form" novalidate>' +
        '<label class="conto-campo"><span>' + L("Il nome da mostrare", "Display name") + '</span><input name="nome" required maxlength="40" autocomplete="nickname" autocapitalize="words" spellcheck="false"></label>' +
        '<label class="conto-campo"><span>' + L("Email", "Email") + " <small>" + L("(facoltativa)", "(optional)") + '</small></span><input name="email" type="email" maxlength="160" autocomplete="email" inputmode="email" spellcheck="false"></label>' +
        '<p class="conto-nota">' + L("L'email la vede solo Riccardo, che cura GERICO, per sapere chi è iscritto. Nessuna newsletter, nessuna email.", "Only Riccardo, who edits GERICO, sees the email, to know who has signed up. No newsletters, no emails.") + "</p>" +
        '<button type="submit" class="conto-b primario">' + L("Crea l'account con una passkey", "Create the account with a passkey") + "</button>" +
        '<p class="conto-err" role="alert"></p></form>' +
        '<p class="conto-nota">' + L("Si entra con Face ID, Touch ID, l'impronta o il codice del telefono: nessuna password. ", "You sign in with Face ID, Touch ID, your fingerprint or your phone's passcode: no password. ") +
        '<a href="privacy.html#' + L("account", "account-en") + '">' + L("Cosa salviamo", "What we store") + "</a></p>" +
        '<div class="conto-az"><button type="button" class="conto-b" data-conto-f="accedi">' + L("Ho già un account", "I already have an account") + "</button>" +
        (proposta ? '<button type="button" class="conto-b" data-conto-f="no">' + L("Non ora", "Not now") + "</button>" : "") + "</div>",
        { chiusa: () => { if (proposta && !entrato_) { const p = G.ls.get(PROP, {}) || {}; G.ls.set(PROP, { ultima: Date.now(), no: (p.no || 0) + 1 }); } } });
      const d = f.d, form = d.querySelector(".conto-form"), err = d.querySelector(".conto-err");
      const fatto = (u) => {
        entrato_ = true;
        if (opt && opt.poi) opt.poi(u);
        // chi non ha ancora risposto alle domande le trova adesso, a tutto schermo
        if (!(opt && opt.senzaDomande) && !G.interessi.pulito(G.interessi.leggi()).fatto) { f.chiudi("ok"); G.interessi.dopoIscrizione(u); return; }
        d.querySelector(".conto-in").innerHTML = '<p class="conto-ok">' + L("Fatto, ", "Done, ") + G.esc(u.nome) + L(": sei dentro.", ": you're in.") + "</p>" +
          '<p class="conto-p">' + L("I temi che segui e il tuo paese ora valgono su ogni dispositivo dove entri con questa passkey. Dal menu vedi, scarichi o cancelli i tuoi dati quando vuoi.",
            "The topics you follow and your country now work on every device where you sign in with this passkey. From the menu you can see, download or delete your data whenever you like.") + "</p>" +
          '<button type="button" class="conto-b primario" data-chiudi>' + L("Inizia a leggere", "Start reading") + "</button>";
        d.querySelector("[data-chiudi].conto-b").focus({ preventScroll: true });
      };
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const nome = form.nome.value.trim(), email = form.email.value.trim();
        err.textContent = "";
        if (!nome) { err.textContent = spiega(new Error("nome")); form.nome.focus(); return; }
        if (email && !form.email.checkValidity()) { err.textContent = spiega(new Error("email")); form.email.focus(); return; }
        const b = form.querySelector("[type=submit]");
        b.disabled = true;
        try { fatto(await iscriviti(nome, email)); }
        catch (x) { if (err.isConnected) err.textContent = spiega(x); }
        finally { if (b.isConnected) b.disabled = false; }
      });
      // l'ascoltatore sta sul contenuto di questo foglio (che il foglio dopo sostituisce), non sul dialog che resta
      d.querySelector(".conto-in").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-conto-f]");
        if (!b) return;
        if (b.dataset.contoF === "no") { f.chiudi("no"); return; }
        b.disabled = true;
        err.textContent = "";
        try { const u = await accedi(); entrato_ = true; if (opt && opt.poi) opt.poi(u); f.chiudi("ok"); }
        catch (x) { if (err.isConnected) err.textContent = spiega(x); }
        finally { if (b.isConnected) b.disabled = false; }
      });
    };

    // i tuoi dati: tutto quello che il Worker tiene su di te, da scaricare o cancellare
    const apriDati = async (opt) => {
      const f = foglio(L("I tuoi dati", "Your data"), '<p class="conto-p" role="status">' + L("Carico…", "Loading…") + "</p>");
      const d = f.d, box = d.querySelector(".conto-in");
      let x;
      try { x = await api("miei-dati?vedi=1"); }
      catch (e) {
        if (e.stato === 401) { via(); avvisa(); }
        box.innerHTML = '<p class="conto-p">' + G.esc(spiega(e)) + "</p>";
        return;
      }
      const fData = new Intl.DateTimeFormat(G.en ? "en-GB" : "it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
      const q = (iso) => (iso ? fData.format(new Date(iso)) : "—");
      const riga = (k, v) => "<div><dt>" + G.esc(k) + "</dt><dd>" + v + "</dd></div>";
      const a = x.account, p = x.preferenze;
      box.innerHTML = '<p class="conto-p">' + L("Questi sono tutti i dati che GERICO conserva sul tuo account. Le visite e gli errori delle pagine si contano senza legarli a te.", "This is all the data GERICO keeps on your account. Page visits and errors are counted without linking them to you.") + "</p>" +
        '<dl class="conto-dl">' + riga(L("Nome", "Name"), G.esc(a.nome)) + riga("Email", a.email ? G.esc(a.email) : L("nessuna", "none")) +
        riga(L("Iscritto", "Joined"), G.esc(q(a.iscritto))) + riga(L("Ultimo accesso", "Last seen"), G.esc(q(a.ultimoAccesso))) +
        riga(L("Temi seguiti", "Followed topics"), p.temiSeguiti.length ? p.temiSeguiti.map((t) => G.esc(G.tn(t))).join(", ") : L("nessuno", "none")) +
        riga(L("Paese", "Country"), p.paese ? G.flag(p.paese) + " " + G.esc(G.paeseNome(p.paese)) : "—") +
        (p.interessi && G.interessi.testo(p.interessi, p.paese) ? riga(L("Interessi", "Interests"), G.esc(G.interessi.testo(p.interessi, p.paese))) : "") +
        (Array.isArray(p.principali) && p.principali.length ? riga(L("I tuoi Principali", "Your key markets"), G.esc(p.principali.join(", "))) : "") +
        riga("Passkey", x.passkey.map((k) => G.esc(L("creata il ", "created ") + q(k.creata) + (k.usata ? L(", usata l'ultima volta il ", ", last used ") + q(k.usata) : "") + (k.sincronizzata ? L(" (sincronizzata tra i tuoi dispositivi)", " (synced across your devices)") : ""))).join("<br>")) +
        riga(L("Accessi aperti", "Open sessions"), String(x.sessioni.length) + " " + G.esc(L("(uno per ogni browser dove sei entrato)", "(one for each browser you've signed in on)"))) + "</dl>" +
        '<div class="conto-az conto-col"><a class="conto-b" href="/api/miei-dati" download="gerico-i-miei-dati.json">' + L("Scarica i tuoi dati", "Download your data") + "</a>" +
        '<button type="button" class="conto-b rischio" data-conto-f="cancella">' + L("Cancella l'account", "Delete the account") + "</button></div>" +
        '<div class="conto-conferma" hidden><p class="conto-p"><b>' + L("Cancelli l'account e tutto quello che GERICO ha salvato con lui", "You delete the account and everything GERICO saved with it") + "</b>: " +
        L("nome, email, passkey, accessi, temi, paese, interessi e mercati scelti. Subito, senza ritorno. In questo browser temi e paese restano, come prima dell'account.", "name, email, passkeys, sessions, topics, country, interests and chosen markets. Right away, for good. In this browser your topics and country stay, as before the account.") + "</p>" +
        '<div class="conto-az"><button type="button" class="conto-b rischio" data-conto-f="si">' + L("Sì, cancella tutto", "Yes, delete everything") + '</button><button type="button" class="conto-b" data-conto-f="annulla">' + L("Annulla", "Cancel") + "</button></div>" +
        '<p class="conto-err" role="alert"></p></div>';
      const conf = box.querySelector(".conto-conferma");
      const chiedi_ = () => { conf.hidden = false; conf.scrollIntoView({ block: "nearest" }); conf.querySelector("[data-conto-f='annulla']").focus({ preventScroll: true }); };
      if (opt && opt.cancella) chiedi_();
      box.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-conto-f]");
        if (!b) return;
        const k = b.dataset.contoF;
        if (k === "cancella") { chiedi_(); return; }
        if (k === "annulla") { conf.hidden = true; box.querySelector("[data-conto-f='cancella']").focus({ preventScroll: true }); return; }
        if (k !== "si") return;
        b.disabled = true;
        try {
          await cancella();
          f.chiudi("ok");
          G.toast(L("Account cancellato: sul server non resta niente.", "Account deleted: nothing is left on the server."));
        } catch (x2) { const er = conf.querySelector(".conto-err"); if (er) er.textContent = spiega(x2); b.disabled = false; }
      });
    };

    // ---------- nel menu: il tuo account in cima, il paese dopo i temi seguiti ----------
    const menu = (m, dopo) => {
      if (!G.CONTI || m.querySelector(".conto-menu")) return;
      const box = document.createElement("div");
      box.className = "opt conto-menu";
      const head = m.querySelector(".menu-head");
      if (head) head.after(box); else m.querySelector(".menu-in").prepend(box);
      const ib = document.createElement("div");
      ib.className = "opt interessi-menu";
      box.after(ib);
      const pa = document.createElement("div");
      pa.className = "opt paese-menu";
      (dopo || ib).after(pa);
      const disegnaInteressi = () => {
        const t = G.interessi.testo();
        ib.innerHTML = '<p class="opt-l" id="opt-int">' + L("I tuoi interessi", "Your interests") + '</p><div class="menu-links"><button type="button" data-conto="interessi" aria-describedby="opt-int"><span class="int-r">' +
          (t ? G.esc(t) : L("Scegli cosa mettere prima", "Choose what comes first")) + "</span></button></div>";
      };
      const disegnaPaese = () => {
        const c = G.paese();
        pa.innerHTML = '<p class="opt-l" id="opt-paese">' + L("Il tuo paese", "Your country") + '</p><div class="menu-links"><button type="button" data-conto="paese" aria-describedby="opt-paese">' +
          G.flag(c) + '<span class="pn">' + G.esc(G.paeseNome(c)) + '</span><span class="sr-only">' + L(": cambialo", ": change it") + "</span></button></div>";
      };
      const disegna = () => {
        const nota = G.ls.get(K, null);
        if (nota && nota.nome) {
          box.innerHTML = '<p class="opt-l" id="opt-conto">' + L("Il tuo account", "Your account") + '</p><div class="menu-links conto-links" role="group" aria-labelledby="opt-conto">' +
            '<div class="conto-chi"><span class="conto-av" aria-hidden="true">' + G.esc((Array.from(String(nota.nome))[0] || "?").toUpperCase()) + "</span><span><b>" + G.esc(nota.nome) + "</b><small>" + L("Entrato con la passkey", "Signed in with a passkey") + "</small></span></div>" +
            (nota.admin ? '<a href="/admin" data-gestionale>' + L("Gestionale", "Dashboard") + "</a>" : "") +
            '<button type="button" data-conto="dati">' + L("I tuoi dati", "Your data") + "</button>" +
            '<a href="/api/miei-dati" download="gerico-i-miei-dati.json">' + L("Scarica i tuoi dati", "Download your data") + "</a>" +
            '<button type="button" data-conto="esci">' + L("Esci", "Sign out") + "</button>" +
            '<button type="button" class="rischio" data-conto="cancella">' + L("Cancella l'account", "Delete the account") + '</button></div><p class="conto-err" role="alert"></p>';
        } else {
          box.innerHTML = '<p class="opt-l" id="opt-conto">' + L("Il tuo account", "Your account") + '</p><div class="conto-cell"><p class="conto-s">' +
            (passkeyOk() ? L("Temi, paese e interessi su ogni dispositivo, con una passkey. Per leggere non serve.", "Topics, country and interests on every device, with a passkey. You don't need it to read.")
              : L("Questo browser non sa usare le passkey: per l'account prova Safari, Chrome, Edge o Firefox aggiornati.", "This browser can't use passkeys: for an account try an up-to-date Safari, Chrome, Edge or Firefox.")) + "</p>" +
            (passkeyOk() ? '<div class="conto-az"><button type="button" class="conto-b primario" data-conto="nuovo">' + L("Crea l'account", "Create an account") + '</button><button type="button" class="conto-b" data-conto="accedi">' + L("Accedi", "Sign in") + "</button></div>" : "") +
            '<p class="conto-err" role="alert"></p></div>';
        }
      };
      disegna();
      disegnaPaese();
      disegnaInteressi();
      P.on(document, "gerico:conto", disegna);
      P.on(document, "gerico:paese", () => { disegnaPaese(); disegnaInteressi(); });
      P.on(document, "gerico:interessi", disegnaInteressi);
      const chiudiMenu = () => { const x = m.querySelector("[data-close]"); if (x) x.click(); };
      const errore = (t) => { const e = box.querySelector(".conto-err"); if (e) e.textContent = t; };
      P.on(m, "click", async (e) => {
        const b = e.target.closest("[data-conto]");
        if (!b) return;
        e.stopPropagation();
        const k = b.dataset.conto;
        errore("");
        if (k === "paese") { G.percorso.apri("paese"); return; }
        if (k === "interessi") { G.interessi.apri(); return; }
        if (k === "nuovo") { apri("nuovo"); return; }
        if (k === "dati" || k === "cancella") { apri("dati", { cancella: k === "cancella" }); return; }
        b.disabled = true;
        try {
          if (k === "accedi") { await accedi(); chiudiMenu(); }
          else if (k === "esci") { await esci(); chiudiMenu(); }
        } catch (x) { errore(spiega(x)); }
        finally { if (b.isConnected) b.disabled = false; }
      });
    };

    // ---------- a ogni pagina: chi sei, la proposta dell'account, il conteggio della visita ----------
    const PAGINE = { "/": "prima-pagina", "/storia": "storia", "/terminal": "terminal", "/come-funziona": "come-funziona", "/privacy": "privacy", "/glossario": "glossario", "/collabora": "collabora", "/admin": "admin" };
    const pagina_ = () => PAGINE[location.pathname.replace(/\.html$/, "").replace(/\/index$/, "/")] || "";
    const dispositivo = () => {
      const tocco = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
      return !tocco ? "computer" : Math.min(screen.width, screen.height) >= 600 ? "tablet" : "telefono";
    };
    // i dispositivi dell'amministratore non si contano: la scelta sta nella pagina admin (gerico.nonContare), e vale
    // anche su ogni dispositivo dove è entrato con l'account dell'amministratore
    // (se nella pagina admin ha scelto «Contale», su quel dispositivo si contano anche da amministratore)
    const nonContare = () => { const v = G.ls.get("gerico.nonContare", null); return v === true || (v === null && !!(G.ls.get("gerico.conto", null) || {}).admin); };
    // con la visita: da dove arriva (solo il nome del sito, solo alla prima pagina della visita in questa scheda) e, nelle
    // storie, quale storia. Niente di chi legge
    const visita = () => {
      const p = pagina_();
      if (!G.CONTI || !p || p === "admin" || !navigator.sendBeacon || nonContare()) return;
      const dati = { p, c: G.paese(), l: G.lang, d: dispositivo() };
      try {
        if (!sessionStorage.getItem("gerico.arrivo")) {
          sessionStorage.setItem("gerico.arrivo", "1");
          let r = "";
          try { const u = new URL(document.referrer); r = u.origin === location.origin ? null : u.hostname; } catch (e) { r = ""; }
          if (r !== null) dati.r = r;
        }
      } catch (e) { /* niente */ }
      if (p === "storia") { const id = new URLSearchParams(location.search).get("id"); if (id && /^[a-z0-9][a-z0-9-]{0,150}$/.test(id)) dati.s = id; }
      try { navigator.sendBeacon("/api/visita", JSON.stringify(dati)); } catch (e) { /* niente */ }
    };
    // gli errori di JavaScript delle pagine di GERICO: solo messaggio, file, riga e pagina, al massimo 10 per visita
    let errori = 0;
    const segnala = (msg, file, riga) => {
      if (!G.CONTI || errori >= 10 || !navigator.sendBeacon) return;
      const m = String(msg || "").slice(0, 300);
      if (!m || /ResizeObserver loop/.test(m)) return;
      let f = "";
      try { const u = new URL(file || location.href, location.href); if (u.origin !== location.origin) return; f = u.pathname; } catch (e) { return; }
      const p = pagina_();
      if (!p) return;
      errori += 1;
      try { navigator.sendBeacon("/api/errore", JSON.stringify({ m, f, r: Number(riga) || 0, p })); } catch (e) { /* niente */ }
    };
    window.addEventListener("error", (e) => { if (e && e.message) segnala(e.message, e.filename, e.lineno); });
    window.addEventListener("unhandledrejection", (e) => {
      const r = e && e.reason, st = r && r.stack ? String(r.stack) : "";
      const at = /(https?:\/\/[^\s)]+?):(\d+):\d+/.exec(st);
      segnala((r && r.message) || String(r), at ? at[1] : "", at ? at[2] : 0);
    });
    // il foglio che propone l'account: solo in prima pagina, mai sopra una storia, una volta sola per dispositivo e solo a
    // chi segue almeno un tema (l'account serve proprio a ritrovarli su ogni dispositivo). Mai a chi su questo dispositivo è
    // già entrato con un account. Chiuso in qualsiasi modo non torna: crearlo o entrare resta sempre nel menu.
    // Non si conta niente di chi legge (prima si contavano i giorni di visita: una memoria nel browser che al sito non
    // serve, e che le regole sui cookie vogliono solo con il consenso); il vecchio conteggio si cancella
    try { localStorage.removeItem("gerico.giorni"); } catch (e) { /* storage non disponibile */ }
    let proposto = false;
    const proponi = () => {
      if (proposto || !passkeyOk() || G.current !== "home" || G.ls.get(K, null) || G.ls.get(GIA, false) || G.ls.get(PROP, null)) return;
      if (!G.follows().length) return;
      proposto = true;
      G.afterIntro(() => setTimeout(async () => {
        if (G.current !== "home" || document.querySelector("dialog[open]") || G.ls.get(K, null)) return;
        let d;
        try { d = await chiedi(); } catch (e) { return; }
        if (!d || !d.attivo || d.utente || G.current !== "home" || document.querySelector("dialog[open]")) return;
        G.ls.set(PROP, { ultima: Date.now(), no: 0 });
        apri("proposta");
      }, 2200));
    };
    // chi comincia a seguire un tema dalla prima pagina: la proposta arriva poco dopo, una volta sola
    document.addEventListener("gerico:follows", (e) => {
      const d = (e && e.detail) || {};
      if (d.on && !d.sync && !d.annullato && G.CONTI && !G.percorso.primaVolta()) proponi();
    });
    const pagina = () => {
      if (!G.CONTI) return;
      visita();
      if (G.ls.get(K, null)) { chiedi().catch(() => {}); return; }
      // senza il promemoria nel browser si chiede lo stesso al server, una volta per scheda: se il cookie dell'accesso c'è
      // ancora, si resta dentro senza rifare l'accesso
      let chiesto = false;
      try { chiesto = sessionStorage.getItem("gerico.chiSei") === "1"; sessionStorage.setItem("gerico.chiSei", "1"); } catch (e) { /* niente */ }
      if (!chiesto) chiedi().catch(() => {});
      if (!G.percorso.primaVolta()) proponi();
    };

    return {
      api, spiega, accedi, iscriviti, esci, cancella, apri, menu, pagina, foglio, passkeyOk,
      entrato: () => !!G.ls.get(K, null),
      rimandata: () => { const p = G.ls.get(PROP, {}) || {}; G.ls.set(PROP, { ultima: Date.now(), no: (p.no || 0) + 1 }); },
      io: chiedi,
      utente: () => io,
      salva
    };
  })();

  // ---------- la ricerca tra le storie: l'indice dell'archivio (data/archivio.json, con l'edizione di oggi), tutto nel
  // browser, senza mandare a nessuno quello che si cerca. Ogni parola deve esserci (nel titolo, nei temi o nel sommario);
  // prima il titolo, poi i temi, poi il sommario, a parità la storia più recente. Anche le voci del glossario ----------
  G.cerca = (() => {
    const L = G.L;
    const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const parole = (q) => norm(q).split(/[^a-z0-9%€$]+/).filter((w) => w.length > 1 || /\d/.test(w)).slice(0, 8);
    // l'inizio di una parola vale più di un pezzo nel mezzo («iran» trova Iran prima di Tirana)
    const dentro = (testo, w) => {
      const i = testo.indexOf(w);
      if (i < 0) return 0;
      if (i === 0 || !/[a-z0-9]/.test(testo[i - 1])) return 2;
      const re = new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      return re.test(testo) ? 2 : 1;
    };
    // le parole trovate si segnano nel titolo: si cerca sul testo senza accenti, si segna sul testo vero
    const segna = (testo, ws) => {
      const orig = String(testo || ""), chars = Array.from(orig);
      let n = "";
      const da = [];
      chars.forEach((c, i) => { const x = norm(c); for (let k = 0; k < x.length; k++) da.push(i); n += x; });
      const su = new Array(chars.length).fill(false);
      ws.forEach((w) => {
        let i = n.indexOf(w);
        while (i >= 0) { for (let k = i; k < i + w.length; k++) su[da[k]] = true; i = n.indexOf(w, i + w.length); }
      });
      let out = "", aperto = false;
      chars.forEach((c, i) => {
        if (su[i] && !aperto) { out += "<mark>"; aperto = true; }
        if (!su[i] && aperto) { out += "</mark>"; aperto = false; }
        out += G.esc(c);
      });
      return out + (aperto ? "</mark>" : "");
    };
    let indice = null;
    const carica = () => indice || (indice = Promise.all([G.load("archivio"), G.load("edition"), G.load("glossario")]).then(([a, ed, gl]) => {
      const oggi = new Set(((ed && ed.stories) || []).map((s) => s && s.id));
      const temi = (a && a.temi) || {};
      const storie = ((a && a.storie) || []).filter((x) => x && x.id && x.t).map((x) => ({
        x, oggi: oggi.has(x.id), t: norm(x.t), s: norm(x.s),
        g: norm((x.tags || []).map((t) => t + " " + G.tn(t)).concat((x.th || []).map((k) => temi[k] || "")).join(" ") + " " + G.secLabel(x.sec))
      }));
      const voci = ((gl && gl.voci) || []).filter((v) => v && v.id && v.it).map((v) => {
        const lato = (G.en && v.en) || v.it;
        return { v: lato, id: v.id, n: norm([lato.t].concat(lato.alt || [], v.it.t, v.it.alt || []).join(" ")) };
      });
      return { storie, voci };
    }, () => { indice = null; return { storie: [], voci: [] }; }));
    const trova = (ix, q) => {
      const ws = parole(q);
      if (!ws.length) return { ws, storie: [], voci: [] };
      const storie = [];
      ix.storie.forEach((r) => {
        let p = 0;
        for (const w of ws) {
          const a = dentro(r.t, w), b = dentro(r.g, w), c = dentro(r.s, w);
          if (!a && !b && !c) return;
          p += a * 5 + b * 3 + c;
        }
        storie.push({ r, p });
      });
      storie.sort((m, n) => n.p - m.p || String(n.r.x.d || "").localeCompare(String(m.r.x.d || "")));
      const voci = ix.voci.filter((v) => ws.every((w) => dentro(v.n, w) === 2)).slice(0, 2);
      return { ws, storie: storie.slice(0, 30), voci };
    };
    const quando = (iso) => (G.isToday(iso) ? L("Oggi", "Today") : G.dayAge(iso) === 1 ? L("Ieri", "Yesterday") : G.day(iso));
    const riga = (h, ws) => {
      const x = h.r.x, url = h.r.oggi ? G.storyUrl(x) : "/s/" + encodeURIComponent(x.id);
      return '<li><a href="' + url + '"><span class="cr-k">' + G.esc(G.secLabel(x.sec)) + (x.d ? " · " + G.esc(quando(x.d)) : "") +
        '</span><span class="cr-t">' + segna(x.t, ws) + "</span></a></li>";
    };
    const apri = () => {
      const f = G.conto.foglio(L("Cerca", "Search"),
        '<form class="cerca-f" role="search" action="#" novalidate><input class="paesi-q cerca-q" type="search" name="q" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="' +
        L("Parole, persone, paesi o temi", "Words, people, countries or topics") + '" aria-label="' + L("Cerca tra le notizie", "Search the news") + '" aria-describedby="cerca-n"></form>' +
        '<p class="cerca-n" id="cerca-n" role="status">' + L("Cerca tra tutte le storie di GERICO, anche quelle dei giorni scorsi.", "Search every GERICO story, including those from past days.") + "</p>" +
        '<div class="cerca-r"></div><p class="cerca-a"><a href="/archivio">' + L("Tutto l'archivio, giorno per giorno", "The whole archive, day by day") + "</a></p>");
      const d = f.d, q = d.querySelector(".cerca-q"), nota = d.querySelector(".cerca-n"), box = d.querySelector(".cerca-r");
      const base = nota.textContent;
      let t = 0, giro = 0;
      const mostra = async () => {
        const mio = ++giro, testo = q.value.trim();
        if (!testo) { box.innerHTML = ""; nota.textContent = base; return; }
        const ix = await carica();
        if (mio !== giro || f.chiuso) return;
        const r = trova(ix, testo);
        if (!r.ws.length) { box.innerHTML = ""; nota.textContent = L("Scrivi almeno due lettere.", "Type at least two letters."); return; }
        const n = r.storie.length;
        nota.textContent = n ? (n === 30 ? L("Le 30 storie più vicine a quello che cerchi.", "The 30 stories closest to your search.") : n === 1 ? L("Una storia.", "One story.") : n + L(" storie.", " stories."))
          : r.voci.length ? L("Nessuna storia, ma c'è nel glossario.", "No stories, but it's in the glossary.") : L("Nessuna storia con queste parole. Prova con meno parole o con un nome.", "No stories with these words. Try fewer words or a name.");
        box.innerHTML = (r.voci.length ? '<ul class="cerca-l cerca-gl">' + r.voci.map((v) => '<li><a href="glossario#' + G.esc(v.id) + '"><span class="cr-k">' + L("Glossario", "Glossary") +
          '</span><span class="cr-t">' + G.esc(v.v.t) + '</span><span class="cr-s">' + G.esc(v.v.d) + "</span></a></li>").join("") + "</ul>" : "") +
          (n ? '<ul class="cerca-l">' + r.storie.map((h) => riga(h, r.ws)).join("") + "</ul>" : "");
      };
      q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(mostra, 120); });
      d.querySelector(".cerca-f").addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(t); mostra(); q.blur(); });
      // un risultato chiude il foglio: la storia di oggi si apre nel sito, le altre nella loro pagina
      box.addEventListener("click", (e) => { if (e.target.closest("a[href]")) f.chiudi("vai"); });
      carica();
      requestAnimationFrame(() => q.focus());
      return f;
    };
    // «/» apre la ricerca dalla tastiera, fuori dai campi di testo
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      apri();
    });
    return { apri, trova, norm };
  })();

  // ---------- il glossario (data/glossario.json): negli articoli la prima volta che compare una parola molto tecnica
  // (le voci con tec) è in grassetto, al massimo sei per articolo. Con il mouse, passandoci sopra si apre una nota sopra la
  // parola che la spiega; un clic porta alla voce del glossario. Sul telefono il primo tocco apre la nota, un tocco sulla
  // nota (o di nuovo sulla parola) porta al glossario. Con la tastiera la nota compare sulla parola che ha il fuoco ----------
  G.glossario = (() => {
    const L = G.L;
    const voci = {};
    const forme = (gl) => {
      const lato = G.en ? "en" : "it";
      return ((gl && gl.voci) || []).map((v) => {
        const x = v && v[lato];
        if (!x || !x.t) return null;
        voci[v.id] = x;
        if (!v.tec) return null;
        const f = (Array.isArray(x.m) ? x.m : [x.t].concat(x.alt || [])).filter((y) => typeof y === "string" && y).sort((a, b) => b.length - a.length);
        if (!f.length) return null;
        const alt = f.map((y) => y.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
        try {
          return { id: v.id, re: new RegExp("(^|[^\\p{L}\\p{N}_])(" + alt + ")(?![\\p{L}\\p{N}_])", "gu" + (v.cs ? "" : "i")), no: (x.no || []).map((n) => String(n).toLowerCase()) };
        } catch (e) { return null; }
      }).filter(Boolean);
    };
    const collega = (root, gl, max) => {
      if (!root || !gl) return 0;
      const ps = Array.from(root.querySelectorAll("p")).filter((p) => p.childNodes.length === 1 && p.firstChild.nodeType === 3);
      const trovati = [];
      forme(gl).forEach((f) => {
        for (let pi = 0; pi < ps.length; pi++) {
          const t = ps[pi].textContent;
          f.re.lastIndex = 0;
          let m;
          while ((m = f.re.exec(t))) {
            const a = m.index + m[1].length, b = a + m[2].length, giro = t.slice(Math.max(0, a - 25), b + 25).toLowerCase();
            if (!f.no.some((n) => giro.includes(n))) { trovati.push({ pi, a, b, id: f.id }); return; }
          }
        }
      });
      trovati.sort((x, y) => x.pi - y.pi || x.a - y.a);
      const scelti = [];
      for (const x of trovati) {
        if (scelti.length >= (max || 6)) break;
        if (!scelti.some((y) => y.pi === x.pi && x.a < y.b && y.a < x.b)) scelti.push(x);
      }
      // in ogni paragrafo da destra a sinistra: il primo pezzo di testo resta quello con le posizioni giuste
      scelti.sort((x, y) => x.pi - y.pi || y.a - x.a).forEach((x) => {
        const node = ps[x.pi].firstChild;
        if (!node || node.nodeType !== 3 || node.length < x.b) return;
        node.splitText(x.b);
        const parola = node.splitText(x.a);
        const a = document.createElement("a");
        a.className = "gl-w";
        a.href = "glossario#" + x.id;
        a.dataset.gl = x.id;
        a.textContent = parola.data;
        parola.replaceWith(a);
      });
      return scelti.length;
    };

    // ---- la nota: una sola, sopra la parola (sotto se sopra non c'è posto), con la freccia verso la parola ----
    let nota = null, su = null, tMostra = 0, tNascondi = 0, tocco = false;
    const crea = () => {
      if (nota && nota.isConnected) return nota;
      nota = document.createElement("div");
      nota.className = "gl-nota";
      nota.id = "gl-nota";
      nota.setAttribute("role", "tooltip");
      nota.hidden = true;
      document.body.appendChild(nota);
      // a nota sparita non resta niente da leggere per chi usa un lettore di schermo
      nota.addEventListener("transitionend", (e) => { if (e.propertyName === "opacity" && !nota.classList.contains("on")) nota.hidden = true; });
      nota.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") clearTimeout(tNascondi); });
      nota.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") nascondi(140); });
      nota.addEventListener("click", () => { if (su) su.click(); });
      return nota;
    };
    const posiziona = (a, x) => {
      const n = crea(), rs = Array.from(a.getClientRects());
      // una parola può andare a capo: la riga sotto il puntatore, se no la prima
      const r = (x != null && rs.find((q) => x >= q.left - 1 && x <= q.right + 1)) || rs[0] || a.getBoundingClientRect();
      const box = (a.closest(".article") || a.parentElement).getBoundingClientRect();
      const sx = Math.max(12, box.left - 8), dx = Math.min(innerWidth - 12, box.right + 8);
      const w = Math.min(340, dx - sx);
      n.style.width = w + "px";
      const cx = x != null ? x : r.left + r.width / 2;
      const left = Math.round(Math.max(sx, Math.min(cx - w / 2, dx - w)));
      const h = n.offsetHeight, alto = (document.querySelector(".top") || {}).offsetHeight || 0;
      const sopra = r.top - h - 14 > alto;
      n.dataset.lato = sopra ? "sopra" : "sotto";
      n.style.left = left + scrollX + "px";
      n.style.top = Math.round((sopra ? r.top - h - 12 : r.bottom + 12) + scrollY) + "px";
      n.style.setProperty("--freccia", Math.round(Math.min(Math.max(cx - left, 18), w - 18)) + "px");
    };
    const mostra = (a, x) => {
      clearTimeout(tNascondi);
      const v = voci[a.dataset.gl];
      if (!v) return;
      const n = crea(), gia = !!su && n.classList.contains("on") && su !== a;
      if (su && su !== a) su.removeAttribute("aria-describedby");
      su = a;
      n.innerHTML = '<b class="gln-t">' + G.esc(v.t) + '</b><span class="gln-d">' + G.esc(v.d) + '</span><span class="gln-a">' +
        (tocco ? L("Tocca la nota per aprire il glossario", "Tap the note to open the glossary") : L("Clicca sulla parola per aprire il glossario", "Click the word to open the glossary")) + "</span>";
      // da una parola all'altra la nota scivola al posto nuovo invece di sparire e ricomparire
      n.classList.toggle("sposta", gia);
      n.hidden = false;
      posiziona(a, x);
      a.setAttribute("aria-describedby", "gl-nota");
      a.classList.add("gl-su");
      if (!n.classList.contains("on")) { void n.offsetWidth; n.classList.add("on"); }
      document.querySelectorAll(".gl-w.gl-su").forEach((y) => { if (y !== a) y.classList.remove("gl-su"); });
    };
    const nascondi = (ms) => {
      clearTimeout(tMostra);
      clearTimeout(tNascondi);
      tNascondi = setTimeout(() => {
        if (!nota) return;
        nota.classList.remove("on", "sposta");
        if (G.reduced()) nota.hidden = true;
        if (su) { su.removeAttribute("aria-describedby"); su.classList.remove("gl-su"); }
        su = null;
      }, ms || 0);
    };
    const parola = (e) => e.target && e.target.closest && e.target.closest("a.gl-w");
    document.addEventListener("pointerdown", (e) => { tocco = e.pointerType !== "mouse"; }, true);
    document.addEventListener("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      const a = parola(e);
      if (!a) return;
      clearTimeout(tNascondi);
      clearTimeout(tMostra);
      tocco = false;
      if (su === a) return;
      const x = e.clientX;
      // un attimo di attesa: passando sopra il testo per caso la nota non lampeggia
      tMostra = setTimeout(() => mostra(a, x), su ? 0 : 160);
    });
    document.addEventListener("pointerout", (e) => {
      if (e.pointerType !== "mouse") return;
      const a = parola(e);
      if (!a || (e.relatedTarget && (a.contains(e.relatedTarget) || (nota && nota.contains(e.relatedTarget))))) return;
      clearTimeout(tMostra);
      if (su) nascondi(140);
    });
    // al tocco: il primo apre la nota, il secondo sulla stessa parola porta al glossario (il passaggio lo fa G.go)
    document.addEventListener("click", (e) => {
      const a = parola(e);
      if (a) {
        if (tocco && su !== a) { e.preventDefault(); mostra(a, null); return; }
        nascondi(0);
        return;
      }
      if (su && !(nota && nota.contains(e.target))) nascondi(0);
    }, true);
    document.addEventListener("focusin", (e) => { const a = parola(e); if (a && a.matches(":focus-visible")) { tocco = false; mostra(a, null); } });
    document.addEventListener("focusout", (e) => { if (parola(e) && su) nascondi(120); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && su) nascondi(0); });
    window.addEventListener("scroll", () => { if (su && tocco) nascondi(0); }, { passive: true });
    window.addEventListener("resize", () => { if (su) nascondi(0); });
    return { collega };
  })();

  // ---------- il sito installabile: il service worker (sw.js) tiene sul dispositivo una copia di quello che si è letto,
  // per riaprirlo senza connessione. «Installa GERICO» sta solo nel menu e solo quando il browser lo permette: nessun
  // invito a schermo ----------
  G.app = (() => {
    const L = G.L;
    let invito = null;
    const avvisa = () => document.dispatchEvent(new CustomEvent("gerico:app"));
    const installata = () => !!((window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // Chrome ed Edge: il loro invito in basso non compare, l'installazione parte solo dal menu
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); invito = e; avvisa(); });
    window.addEventListener("appinstalled", () => { invito = null; avvisa(); });
    const registra = () => {
      if (!("serviceWorker" in navigator) || location.protocol !== "https:" || G.ls.get("gerico.noSW", false)) return;
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    const dopo = () => setTimeout(registra, 2500);
    if (document.readyState === "complete") dopo(); else window.addEventListener("load", dopo, { once: true });
    const puo = () => !installata() && (!!invito || ios);
    const installa = async () => {
      if (invito) {
        const e = invito;
        invito = null;
        try { await e.prompt(); await e.userChoice; } catch (x) { /* niente */ }
        avvisa();
        return;
      }
      // Safari e gli altri browser su iPhone e iPad: si aggiunge dalla condivisione
      G.conto.foglio(L("Installa GERICO", "Install GERICO"),
        '<p class="conto-p">' + L("Su iPhone e iPad GERICO si aggiunge alla schermata Home e si apre come un'app, anche senza connessione per le pagine già lette.", "On iPhone and iPad you can add GERICO to the Home Screen and open it like an app, even offline for pages you've already read.") + "</p>" +
        '<ol class="app-passi"><li>' + L("Tocca il pulsante Condividi del browser (il quadrato con la freccia in su).", "Tap the browser's Share button (the square with the up arrow).") + "</li><li>" +
        L("Scegli «Aggiungi alla schermata Home».", "Choose \u201cAdd to Home Screen\u201d.") + "</li><li>" + L("Tocca «Aggiungi».", "Tap \u201cAdd\u201d.") + "</li></ol>");
    };
    return { puo, installa, installata };
  })();

  // ---------- il percorso: le scelte a tutto schermo, una per schermata ----------
  // Alla prima visita (in prima pagina, dopo l'entrata del nome): benvenuto, paese, sezioni, temi, mercati, come leggi e,
  // alla fine, l'account, che si può rimandare. Chi salta trova il sito di sempre. Dal menu lo stesso percorso si riapre
  // già compilato: «I tuoi interessi» parte dall'elenco delle scelte (se ne cambia una senza rifare le altre), «Il tuo
  // paese» va dritto alla sua schermata. Ogni tocco vale subito, come prima.
  G.percorso = (() => {
    const L = G.L, FATTO = "gerico.percorso";
    const I = G.interessi, C = G.conto;
    const senzaAcc = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    let stato = null;

    const paesi = () => {
      const scelto = G.paese(), coll = new Intl.Collator(G.en ? "en" : "it");
      const primi = G.PAESI.filter((p) => p.level === 1), altri = G.PAESI.filter((p) => p.level !== 1).sort((a, b) => coll.compare(G.paeseNome(a.code), G.paeseNome(b.code)));
      const riga = (p) => '<li><button type="button" class="pc-opz" data-paese="' + p.code + '" aria-pressed="' + (p.code === scelto) + '" data-q="' + G.esc(senzaAcc(p.it + " " + p.en)) + '">' +
        G.flag(p.code) + "<span>" + G.esc(G.paeseNome(p.code)) + "</span></button></li>";
      return '<input class="pc-q" type="search" autocomplete="off" spellcheck="false" placeholder="' + L("Cerca un paese", "Search for a country") + '" aria-label="' + L("Cerca un paese", "Search for a country") + '">' +
        '<p class="pc-g">' + L("Articoli e brevi ogni giorno", "Articles and briefs every day") + '</p><ul class="pc-l">' + primi.map(riga).join("") + "</ul>" +
        '<p class="pc-g">' + L("Le brevi delle testate del paese", "Briefs from the country's outlets") + '</p><ul class="pc-l">' + altri.map(riga).join("") + "</ul>" +
        '<p class="pc-none" hidden>' + L("Nessun paese con questo nome.", "No country with this name.") + "</p>";
    };
    const account = () => '<form class="conto-form pc-form" novalidate>' +
      '<label class="conto-campo"><span>' + L("Il nome da mostrare", "Display name") + '</span><input name="nome" required maxlength="40" autocomplete="nickname" autocapitalize="words" spellcheck="false"></label>' +
      '<label class="conto-campo"><span>' + L("Email", "Email") + " <small>" + L("(facoltativa)", "(optional)") + '</small></span><input name="email" type="email" maxlength="160" autocomplete="email" inputmode="email" spellcheck="false"></label>' +
      '<button type="submit" class="conto-b primario">' + L("Crea l'account con una passkey", "Create the account with a passkey") + "</button>" +
      '<button type="button" class="conto-b" data-pc="accedi">' + L("Ho già un account", "I already have an account") + "</button>" +
      '<p class="conto-err" role="alert"></p>' +
      '<p class="conto-nota">' + L("Si entra con Face ID, Touch ID, l'impronta o il codice del telefono: nessuna password. L'email la vede solo Riccardo, che cura GERICO. ", "You sign in with Face ID, Touch ID, your fingerprint or your phone's passcode: no password. Only Riccardo, who edits GERICO, sees the email. ") +
      '<a href="privacy.html#' + L("account", "account-en") + '">' + L("Cosa salviamo", "What we store") + "</a></p></form>";

    // le schermate: k, titolo, riga di spiegazione, corpo
    const PASSI = {
      benvenuto: { t: () => L("Benvenuto su GERICO", "Welcome to GERICO"), s: () => L("Le notizie del giorno, scritte su tutte le fonti. Poche domande per mettere prima quello che ti interessa: tocca le risposte, o salta.", "The day's news, written from all the sources. A few questions to put what interests you first: tap the answers, or skip."), marchio: true },
      paese: { t: () => L("Da dove leggi?", "Where do you read from?"), s: () => L("In prima pagina trovi la scheda del tuo paese, con le sue notizie. La lingua segue il paese: italiano per l'Italia, inglese per gli altri.", "The front page has a tab for your country, with its news. The language follows the country: Italian for Italy, English for the others."), c: paesi },
      account: { t: () => L("Un account, se vuoi", "An account, if you like"), s: () => L("Le tue scelte valgono su ogni dispositivo. Per leggere non serve.", "Your choices work on every device. You don't need one to read."), c: account },
      fine: { t: () => L("Tutto pronto", "All set"), s: () => L("GERICO adesso mette prima quello che ti interessa. Lo cambi quando vuoi dal menu, in «I tuoi interessi».", "GERICO now puts what interests you first. Change it whenever you like from the menu, under “Your interests”.") }
    };
    I.domande.forEach((q) => { PASSI[q.k] = { t: q.t, s: q.s, q }; });
    const ordine = (modo) => {
      const base = ["paese", "sezioni", "temi", "mercati", "lettura"];
      if (modo === "dopo") return base.concat("fine");
      const conAccount = G.CONTI && C.passkeyOk() && !C.entrato();
      return ["benvenuto"].concat(base, conAccount ? ["account"] : [], "fine");
    };
    // nell'elenco del menu: la risposta di adesso, in una riga
    const adesso = (k) => {
      const v = I.pulito(I.leggi());
      if (k === "paese") return G.paeseNome(G.paese());
      if (k === "temi") { const f = G.follows(); return f.length ? f.map((t) => G.tn(t)).join(", ") : L("Nessuno", "None"); }
      const a = v[k] || [];
      return a.length ? a.map((x) => I.nome(x)).join(", ") : L("Nessuna scelta", "No choice");
    };
    const ETICHETTE = { paese: () => L("Il tuo paese", "Your country"), sezioni: () => L("Sezioni", "Sections"), temi: () => L("Temi seguiti", "Followed topics"), mercati: () => L("Mercati", "Markets"), lettura: () => L("Come leggi", "How you read") };

    const chiudi = () => {
      const st = stato;
      if (!st || st.chiuso) return;
      st.chiuso = true;
      const d = st.d, html = document.documentElement;
      if (st.modo === "primo" || st.modo === "dopo") {
        if (!I.pulito(I.leggi()).fatto) I.scrivi({ fatto: true });
        if (st.modo === "primo" && st.conAccount && !C.entrato()) C.rimandata();
      }
      const fine = () => {
        d.classList.remove("closing"); if (d.open) d.close();
        if (stato === st) stato = null;
        if (!document.querySelector("dialog[open]")) html.classList.remove("menu-open");
        if (st.ritorno && st.ritorno.isConnected && st.ritorno.focus) st.ritorno.focus({ preventScroll: true });
      };
      d.classList.add("closing");
      const an = G.reduced() || !d.getAnimations ? [] : d.getAnimations();
      if (!an.length) return fine();
      Promise.all(an.map((a) => a.finished)).then(fine, fine);
    };

    const disegna = async (verso) => {
      const st = stato, d = st.d, k = st.passo;
      const elenco = k === "elenco", p = PASSI[k], n = st.passi.length, i = st.passi.indexOf(k);
      const percorso = st.modo === "primo" || st.modo === "dopo";
      let corpo = "";
      if (elenco) {
        corpo = '<ul class="pc-elenco">' + Object.keys(ETICHETTE).map((x) => '<li><button type="button" class="pc-voce" data-pc-vai="' + x + '"><span class="pc-voce-k">' + G.esc(ETICHETTE[x]()) + '</span><span class="pc-voce-v">' +
          (x === "paese" ? G.flag(G.paese()) : "") + G.esc(adesso(x)) + '</span><svg aria-hidden="true" width="9" height="16" viewBox="0 0 9 16"><path d="M1.5 1.5 7.5 8l-6 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></li>').join("") + "</ul>" +
          '<div class="pc-extra"><button type="button" class="pc-link" data-pc="rifai">' + L("Rifai il percorso dall'inizio", "Take the tour again") + '</button><button type="button" class="pc-link" data-pc="azzera">' + L("Azzera le scelte", "Clear the choices") + "</button></div>";
      } else if (p.q) corpo = await I.scelte(p.q, I.pulito(I.leggi())[p.q.k] || []);
      else if (p.c) corpo = p.c();
      if (stato !== st || st.passo !== k) return;
      const titolo = elenco ? L("I tuoi interessi", "Your interests") : p.t();
      const sotto = elenco ? L("Tocca una scelta per cambiarla. Vale subito, anche sugli altri dispositivi se hai l'account.", "Tap a choice to change it. It applies right away, on your other devices too if you have an account.") : p.s();
      const ultimo = percorso && k === "fine", primo = percorso && i === 0;
      // in alto: l'avanzamento e «Salta» nel percorso, la chiusura quando si arriva dal menu
      const alto = percorso
        ? '<div class="pc-bar" role="progressbar" aria-valuemin="1" aria-valuemax="' + n + '" aria-valuenow="' + (i + 1) + '" aria-label="' + L("Passo ", "Step ") + (i + 1) + L(" di ", " of ") + n + '"><span style="transform:scaleX(' + ((i + 1) / n).toFixed(4) + ')"></span></div>' +
          (ultimo ? '<span class="pc-salta" aria-hidden="true"></span>' : '<button type="button" class="pc-salta" data-pc="salta">' + L("Salta", "Skip") + "</button>")
        : '<span class="pc-bar pc-vuota" aria-hidden="true"></span><button type="button" class="pc-salta" data-pc="chiudi">' + L("Chiudi", "Close") + "</button>";
      const avanti = ultimo ? L("Inizia a leggere", "Start reading") : primo && k === "benvenuto" ? L("Cominciamo", "Let's start") : k === "account" ? L("Non ora", "Not now") : L("Avanti", "Next");
      const basso = percorso
        ? (i > 0 && !ultimo ? '<button type="button" class="conto-b" data-pc="indietro">' + L("Indietro", "Back") + "</button>" : '<span class="pc-spazio" aria-hidden="true"></span>') +
          '<button type="button" class="conto-b' + (k === "account" ? "" : " primario") + '" data-pc="' + (ultimo ? "chiudi" : "avanti") + '">' + avanti + "</button>"
        : elenco ? '<span class="pc-spazio" aria-hidden="true"></span><button type="button" class="conto-b primario" data-pc="chiudi">' + L("Fatto", "Done") + "</button>"
          : '<span class="pc-spazio" aria-hidden="true"></span><button type="button" class="conto-b primario" data-pc="' + (st.modo === "paese" ? "chiudi" : "elenco") + '">' + L("Fatto", "Done") + "</button>";
      d.innerHTML = '<div class="pc-in"><header class="pc-alto">' + alto + '</header><div class="pc-corpo' + (verso ? " pc-" + verso : "") + '" data-passo="' + k + '">' +
        (!elenco && p.marchio ? '<p class="pc-marchio" aria-hidden="true">GERICO</p>' : "") +
        (percorso && !p.marchio && !ultimo ? '<p class="pc-n" aria-hidden="true">' + String(i + (st.passi[0] === "benvenuto" ? 0 : 1)).padStart(2, "0") + " / " + String(n - (st.passi[0] === "benvenuto" ? 2 : 1)).padStart(2, "0") + "</p>" : "") +
        '<h2 class="pc-t" id="pc-t" tabindex="-1">' + G.esc(titolo) + '</h2><p class="pc-s">' + G.esc(sotto) + "</p>" +
        (corpo ? '<div class="pc-scelte">' + corpo + "</div>" : "") + '</div><footer class="pc-basso">' + basso + "</footer></div>";
      if (k === "paese") { const cur = d.querySelector('[data-paese][aria-pressed="true"]'); if (cur) cur.scrollIntoView({ block: "center" }); }
      d.querySelector("#pc-t").focus({ preventScroll: true });
    };
    const vai = (k, verso) => { stato.passo = k; return disegna(verso); };

    const tocco = async (e) => {
      const st = stato, d = st.d;
      const scelta = e.target.closest("[data-int], [data-tema]");
      if (scelta) { I.tocca(scelta); return; }
      const pa = e.target.closest("[data-paese]");
      if (pa) {
        if (pa.dataset.paese !== G.paese()) G.setPaese(pa.dataset.paese);
        d.querySelectorAll("[data-paese]").forEach((x) => x.setAttribute("aria-pressed", String(x === pa)));
        return;
      }
      const v = e.target.closest("[data-pc-vai]");
      if (v) { vai(v.dataset.pcVai, "avanti"); return; }
      const b = e.target.closest("[data-pc]");
      if (!b) return;
      const k = b.dataset.pc, i = st.passi.indexOf(st.passo);
      if (k === "salta" || k === "chiudi") chiudi();
      else if (k === "avanti") vai(st.passi[Math.min(i + 1, st.passi.length - 1)], "avanti");
      else if (k === "indietro") vai(st.passi[Math.max(i - 1, 0)], "indietro");
      else if (k === "elenco") vai("elenco", "indietro");
      else if (k === "rifai") { st.modo = "primo"; st.passi = ordine("primo"); st.conAccount = false; vai(st.passi[0], "avanti"); }
      else if (k === "azzera") {
        I.scrivi({ sezioni: [], mercati: [], lettura: [] });
        G.toast(L("Scelte azzerate: il sito torna come per tutti.", "Choices cleared: the site is back to the default."));
        vai("elenco");
      } else if (k === "accedi") {
        const err = d.querySelector(".conto-err");
        b.disabled = true;
        try { await C.accedi(); if (stato === st) vai("fine", "avanti"); }
        catch (x) { if (err && err.isConnected) err.textContent = C.spiega(x); }
        finally { if (b.isConnected) b.disabled = false; }
      }
    };
    const invio = async (e) => {
      const form = e.target.closest(".pc-form");
      if (!form) return;
      e.preventDefault();
      const st = stato, err = form.querySelector(".conto-err"), nome = form.nome.value.trim(), email = form.email.value.trim();
      err.textContent = "";
      if (!nome) { err.textContent = C.spiega(new Error("nome")); form.nome.focus(); return; }
      if (email && !form.email.checkValidity()) { err.textContent = C.spiega(new Error("email")); form.email.focus(); return; }
      const b = form.querySelector("[type=submit]");
      b.disabled = true;
      try { await C.iscriviti(nome, email); if (stato === st) vai("fine", "avanti"); }
      catch (x) { if (err.isConnected) err.textContent = C.spiega(x); }
      finally { if (b.isConnected) b.disabled = false; }
    };
    const cerca = (e) => {
      if (!e.target.matches(".pc-q")) return;
      const d = stato.d, q = senzaAcc(e.target.value.trim());
      let n = 0;
      d.querySelectorAll(".pc-l li").forEach((li) => { const on = !q || li.firstChild.dataset.q.includes(q); li.hidden = !on; if (on) n += 1; });
      d.querySelectorAll(".pc-l").forEach((ul) => { const vis = Array.from(ul.children).some((li) => !li.hidden); ul.hidden = !vis; ul.previousElementSibling.hidden = !vis; });
      d.querySelector(".pc-none").hidden = n > 0;
    };

    // modo: primo (la prima visita), dopo (appena iscritto dal menu), indice (dal menu: l'elenco), paese (dal menu)
    const apri = (modo, opt) => {
      let d = document.getElementById("percorso");
      if (!d) {
        d = document.createElement("dialog");
        d.id = "percorso";
        d.className = "percorso";
        d.setAttribute("aria-labelledby", "pc-t");
        document.body.appendChild(d);
        d.addEventListener("cancel", (e) => { e.preventDefault(); chiudi(); });
        d.addEventListener("click", (e) => { if (stato) tocco(e); });
        d.addEventListener("submit", (e) => { if (stato) invio(e); });
        d.addEventListener("input", (e) => { if (stato) cerca(e); });
      }
      if (stato && !stato.chiuso) stato.chiuso = true;
      const passi = modo === "primo" || modo === "dopo" ? ordine(modo) : [];
      stato = { d, modo, passi, passo: modo === "indice" ? "elenco" : modo === "paese" ? "paese" : passi[0], chiuso: false, ritorno: document.activeElement, conAccount: passi.includes("account"), nome: opt && opt.nome };
      G.ls.set(FATTO, true);
      d.classList.remove("closing");
      document.documentElement.classList.add("menu-open");
      if (!d.open) d.showModal();
      return disegna();
    };

    // Le domande non partono mai da sole: arrivano solo a chi crea un account nuovo (subito dopo l'iscrizione) e a chi le
    // apre dal menu. Chi entra con un account che ha già, o legge senza account, non le vede.
    const primaVolta = () => false;

    return { apri, chiudi, primaVolta };
  })();

  // ---------- il sito vivo: quello che entra nello schermo sale appena, il puntatore muove le cose ----------
  // Solo movimento leggero, spento per chi ha chiesto meno movimento. Le immagini che si spostano con il puntatore ci sono
  // solo con il mouse.
  (() => {
    if (G.reduced()) return;
    // 1. entrata: riquadri e notizie che stanno sotto lo schermo salgono di poco quando ci arrivi
    const QUALI = ".list > .item, .blk, .t-panel, .altre-l > li, .story-side > section, .next, .prose h2";
    if (window.IntersectionObserver) {
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          e.target.classList.add("vv-in");
          setTimeout(() => e.target.classList.remove("vv", "vv-in"), 700);
        });
      }, { rootMargin: "0px 0px -6% 0px" });
      let inCoda = false;
      const guarda = () => {
        inCoda = false;
        const H = window.innerHeight;
        document.querySelectorAll(QUALI).forEach((el) => {
          if (el._vv) return;
          el._vv = true;
          // solo quello che sta sotto lo schermo e non è dentro una pagina preparata per lo swipe
          if (el.getBoundingClientRect().top < H || el.closest("[aria-hidden='true'], dialog")) return;
          el.classList.add("vv");
          io.observe(el);
        });
      };
      const chiedi = () => { if (!inCoda) { inCoda = true; requestAnimationFrame(guarda); } };
      new MutationObserver(chiedi).observe(document.body, { childList: true, subtree: true });
      chiedi();
    }
    if (!(window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches)) return;
    // 2. l'immagine della notizia sotto il puntatore si sposta appena verso di lui
    let media = null;
    document.addEventListener("pointermove", (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const t = e.target.closest ? e.target : null;
      const box = t && t.closest(".lead.has-img, .item.has-img, .st-media");
      const m = box ? (box.matches(".media") ? box : box.querySelector(".media")) : null;
      if (media && media !== m) { media.style.removeProperty("--px"); media.style.removeProperty("--py"); media.classList.remove("mossa"); }
      media = m;
      if (m) {
        const r = m.getBoundingClientRect();
        m.classList.add("mossa");
        m.style.setProperty("--px", Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width / 2))).toFixed(3));
        m.style.setProperty("--py", Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height / 2))).toFixed(3));
      }
    }, { passive: true });
  })();
})();
