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

  // ---------- dati ----------
  // passando da una pagina all'altra senza ricaricare, gli stessi dati servono di nuovo: per un minuto si riusano.
  // fresh = true li riscarica comunque (per esempio per vedere se è uscita un'edizione nuova)
  const memo = {};
  G.load = (name, fresh) => {
    const hit = memo[name];
    if (!fresh && hit && Date.now() - hit.t < 60000) return hit.p;
    const p = (async () => {
      try {
        const r = await fetch("data/" + name + ".json", { cache: "no-cache" });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    })();
    memo[name] = { p, t: Date.now() };
    p.then((d) => { if (d === null && memo[name] && memo[name].p === p) delete memo[name]; });
    return p;
  };

  // ---------- date e ore, sempre a Roma ----------
  const TZ = "Europe/Rome";
  const fHM = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
  const fDay = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: TZ });
  const fDayLong = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: TZ });
  const fWeek = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  const fLong = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
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
  const fWd = new Intl.DateTimeFormat("it-IT", { weekday: "long", timeZone: TZ });
  G.weekday = (iso) => { const d = valid(iso); return d ? fWd.format(d) : ""; };
  G.hoursAgo = (iso) => { const d = valid(iso); return d ? (Date.now() - d.getTime()) / 3600000 : Infinity; };
  G.dayOnly = (ymd) => { const d = valid(String(ymd).slice(0, 10) + "T12:00:00Z"); return d ? fDay.format(d).replace(".", "") : ""; };
  G.when = (iso) => {
    const d = valid(iso); if (!d) return "";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "adesso";
    if (mins < 60) return mins + " min fa";
    if (G.isToday(iso)) return "alle " + G.hm(iso);
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (G.dayKey(d) === G.dayKey(y)) return "ieri alle " + G.hm(iso);
    return "il " + G.day(iso) + " alle " + G.hm(iso);
  };
  // etichetta dei dati di mercato: «ieri», «stamattina» o «venerdì» valgono solo se i dati sono di oggi
  const RELATIVE = /ieri|oggi|stamattina|stasera|metà giornata|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica/i;
  G.mkWhen = (m) => {
    const label = G.cap((m && m.label) || ""), asOf = m && m.asOf;
    if (!asOf || !valid(asOf)) return label;
    if (G.isToday(asOf) || !RELATIVE.test(label)) return (label ? label + ", " : "Dati ") + G.when(asOf);
    return "Dati " + (G.dayAge(asOf) === 1 ? "di ieri" : "del " + G.day(asOf)) + ", ore " + G.hm(asOf);
  };
  G.romeNow = () => {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), min: (Number(p.hour) % 24) * 60 + Number(p.minute), hm: (p.hour % 24).toString().padStart(2, "0") + ":" + p.minute };
  };
  // il sito si aggiorna alle 7:45 e alle 13:45 (notizie e mercati) e alle 18:45 nei giorni feriali (solo i mercati).
  // newsOnly: il prossimo aggiornamento delle notizie
  G.nextUpdate = (newsOnly) => {
    const now = G.romeNow();
    const names = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
    const slots = (d) => (newsOnly || d === 0 || d === 6 ? [465, 825] : [465, 825, 1125]);
    for (let k = 0; k < 8; k++) {
      const d = (now.wd + k) % 7;
      for (const m of slots(d)) {
        if (k === 0 && m <= now.min) continue;
        const label = k === 0 ? "oggi" : k === 1 ? "domani" : names[d];
        return label + " alle " + Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
      }
    }
    return "";
  };

  // riga dell'edizione nell'intestazione: lunga sul computer, corta sul telefono
  G.setEdition = (iso) => {
    const el = document.getElementById("edition-line");
    const d = valid(iso);
    if (!el || !d) return;
    el.innerHTML = '<span class="ed-l">' + G.esc(G.cap(fWeek.format(d))) + " · edizione delle " + G.esc(G.hm(iso)) + "</span>" +
      '<span class="ed-s">' + G.esc(fDayLong.format(d)) + ", ore " + G.esc(G.hm(iso)) + "</span>";
  };

  // ---------- numeri ----------
  const nf2 = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");
  G.pct = (v) => sign(v) + nf2.format(Math.abs(v)) + "%";
  G.pctBare = (v) => sign(v) + nf2.format(Math.abs(v));
  G.bps = (v) => sign(v) + String(Math.abs(v)).replace(".", ",") + " pb";
  G.bpsLong = (v) => sign(v) + String(Math.abs(v)).replace(".", ",") + (Math.abs(v) === 1 ? " punto base" : " punti base");
  G.wt = (v) => nf2.format(v) + "%";
  G.move = (it) => (typeof it.chg === "number" ? G.pct(it.chg) : typeof it.bp === "number" ? G.bps(it.bp) : "");
  // per i titoli di Stato un rendimento che sale è un prezzo che scende: va in rosso
  G.tone = (it, cls) => {
    const v = typeof it.bp === "number" ? (cls === "obbligazioni" ? -it.bp : it.bp) : it.chg;
    return typeof v !== "number" || v === 0 ? "" : v > 0 ? "up" : "down";
  };
  G.size = (it) => (typeof it.chg === "number" ? Math.abs(it.chg) : typeof it.bp === "number" ? Math.abs(it.bp) / 10 : -1);
  G.cleanValue = (v) => (v && v !== "—" && v !== "-" ? v : "");
  G.shortName = (n) => String(n || "").replace(/\s*\([^)]*\)/g, "").trim();
  // numeri con un numero fisso di decimali; i prezzi dei cambi con 4 (lo yen con 2), i numeri grandi in forma corta senza decimali
  const nfd = {};
  G.num = (v, d) => (nfd[d] || (nfd[d] = new Intl.NumberFormat("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
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
  G.counts = (src) => {
    const c = { allineata: 0, parziale: 0, divergente: 0 };
    G.outlets(src).forEach((s) => { if (c[s.stance] !== undefined) c[s.stance]++; else c.parziale++; });
    return c;
  };
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
  G.wall = (src, cls) => {
    const c = G.counts(src);
    return '<div class="wall ' + (cls || "") + '" aria-hidden="true">' + "<i></i>".repeat(c.allineata) +
      '<i class="p"></i>'.repeat(c.parziale) + '<i class="d"></i>'.repeat(c.divergente) + "</div>";
  };
  // il muro in miniatura dell'elenco: un mattoncino per testata, dentro una riga di testo (quindi span, non div)
  G.miniWall = (src) => {
    const c = G.counts(src);
    return '<span class="mw" aria-hidden="true">' + "<i></i>".repeat(c.allineata) + '<i class="p"></i>'.repeat(c.parziale) + '<i class="d"></i>'.repeat(c.divergente) + "</span>";
  };
  // la frase breve delle schede: «5 testate su 6 concordano»
  G.agreeLine = (src) => {
    const c = G.counts(src), n = G.outlets(src).length;
    if (!n) return "";
    if (n === 1) return "Una sola testata";
    return c.allineata + (c.allineata === 1 ? " testata su " + n + " concorda" : " testate su " + n + " concordano");
  };
  const tail = (c) => (c.parziale ? ", " + c.parziale + " in parte" : "") + (c.divergente ? ", " + c.divergente + (c.divergente === 1 ? " diverge" : " divergono") : "");
  G.agreeShort = (src) => { const c = G.counts(src), n = G.outlets(src).length; return c.allineata + " su " + n + " concordano" + tail(c); };
  G.agreeLong = (src) => {
    const c = G.counts(src), n = G.outlets(src).length;
    if (n === 1) return c.allineata ? "Una sola testata riporta questi fatti." : "Una sola testata, che li riporta in parte.";
    return c.allineata + (c.allineata === 1 ? " testata su " + n + " concorda" : " testate su " + n + " concordano") + " sui fatti" + tail(c) + ".";
  };

  // ---------- storie ----------
  G.SECTIONS = { mondo: "Mondo", italia: "Italia", economia: "Economia", mercati: "Mercati", tecnologia: "Tecnologia" };
  G.secLabel = (k) => G.SECTIONS[k] || "Notizie";
  G.storyUrl = (s) => "storia.html?id=" + encodeURIComponent(s.id);

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
    return new Date(s.updated).getTime() - firstRun > 60 * 60000 ? "Aggiornata alle " + G.hm(s.updated) : "";
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
    const x = on.offsetLeft, w = on.offsetWidth, prev = ind._pos;
    ind.style.opacity = "";
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
    // se il binario scorre, la scelta attiva resta in vista
    if (box.scrollWidth > box.clientWidth + 1) {
      const behavior = instant || G.reduced() ? "auto" : "smooth";
      if (x - 12 < box.scrollLeft) box.scrollTo({ left: x - 12, behavior });
      else if (x + w + 12 > box.scrollLeft + box.clientWidth) box.scrollTo({ left: x + w + 12 - box.clientWidth, behavior });
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
  // entrata: una volta al giorno il nome GERICO compare al centro, il tratto dell'evidenziatore lo attraversa,
  // il nome va al suo posto in alto e le notizie salgono a cascata, in poco più di un secondo; un tocco o uno
  // scorrimento la saltano. Nelle altre aperture solo il tratto che passa sul nome in alto (classe intro-mini).
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
    try { sessionStorage.setItem("gerico.intro", "1"); localStorage.setItem("gerico.introDay", JSON.stringify(G.today())); } catch (e) { /* niente */ }
    if (!scr || !word || !brand || !word.animate) return end();
    // tempi in millisecondi: il nome compare (IN) mentre il tratto lo attraversa (SWEEP), resta un attimo (HOLD),
    // viaggia al suo posto (MOVE) e lascia il posto al nome vero (OUT)
    const IN = 160, SWEEP = 340, HOLD = 110, MOVE = 540, OUT = 110;
    const base = "translate(-50%, -50%)";
    // si parte con il carattere già caricato: niente cambio di carattere a metà e arrivo esatto
    const go = () => {
      if (ended) return;
      const T = SWEEP + HOLD + MOVE + OUT;
      const tn = Array.from(brand.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
      const range = document.createRange();
      range.selectNodeContents(tn || brand);
      const b = range.getBoundingClientRect(), w = word.getBoundingClientRect();
      const s = parseFloat(getComputedStyle(brand).fontSize) / parseFloat(getComputedStyle(word).fontSize);
      const dx = b.left + b.width / 2 - (w.left + w.width / 2), dy = b.top + b.height / 2 - (w.top + w.height / 2);
      const there = base + " translate(" + dx.toFixed(2) + "px, " + dy.toFixed(2) + "px) scale(" + s.toFixed(4) + ")";
      // il tratto parte con il nome (animazione CSS di ::before, classe intro-go)
      html.classList.add("intro-go");
      word.animate([
        { offset: 0, opacity: 0, transform: base, easing: "linear" },
        { offset: IN / T, opacity: 1, transform: base },
        { offset: (SWEEP + HOLD) / T, opacity: 1, transform: base, easing: "cubic-bezier(0.5, 0, 0.1, 1)" },
        { offset: (SWEEP + HOLD + MOVE) / T, opacity: 1, transform: there, easing: "linear" },
        { offset: 1, opacity: 0, transform: there }
      ], { duration: T, fill: "both" }).finished.then(end, end);
      // il nome vero compare sotto quello in viaggio nell'istante in cui arriva: nessuno scatto
      const k = (SWEEP + HOLD + MOVE) / T;
      brand.getAnimations().forEach((a) => a.cancel());
      brand.animate([{ opacity: 0 }, { opacity: 0, offset: k }, { opacity: 1, offset: k }, { opacity: 1 }], { duration: T, fill: "both" });
      // lo schermo si apre mentre il nome parte: le notizie salgono sotto di lui
      scr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: SWEEP + HOLD, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" });
      setTimeout(open, SWEEP + HOLD);
      setTimeout(end, T + 1200);
    };
    const font = document.fonts && document.fonts.load ? document.fonts.load('800 48px "Atkinson Hyperlegible Next"') : Promise.resolve();
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
    const title = () => (info ? (G.isToday(when()) ? "Il riepilogo di oggi" : "Il riepilogo di " + G.weekday(when())) : "");
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
      bar.setAttribute("aria-label", "Riepilogo a voce");
      bar.hidden = true;
      bar.innerHTML = '<button type="button" class="gp-play" aria-label="Ascolta il riepilogo">' + ICON + "</button>" +
        '<div class="gp-txt"><p class="gp-t"></p><p class="gp-s"></p></div>' +
        '<button type="button" class="gp-sk" data-d="-15" aria-label="Indietro di 15 secondi">−15</button>' +
        '<button type="button" class="gp-sk" data-d="15" aria-label="Avanti di 15 secondi">+15</button>' +
        '<button type="button" class="gp-x" aria-label="Chiudi il riepilogo"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
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
      bar.querySelector(".gp-play").setAttribute("aria-label", on ? "Metti in pausa il riepilogo" : "Riprendi il riepilogo");
      bar.querySelector(".gp-t").textContent = title();
      bar.querySelector(".gp-s").textContent = d ? (on ? "Mancano " : "In pausa · mancano ") + mmss(Math.max(0, d - pos())) : "";
      bar.querySelector(".gp-bar i").style.transform = "scaleX(" + (d ? Math.min(1, pos() / d) : 0).toFixed(4) + ")";
    }
    return api;
  })();
  // dopo un ricaricamento, se il riepilogo era a metà, la barra lo ripropone da dove eri
  try {
    if (sessionStorage.getItem("gerico.audio")) G.load("audio").then((au) => { if (au && au.src && G.hoursAgo(au.asOf) < 30) G.player.set(au); });
  } catch (e) { /* niente */ }

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
  const fetchPage = (url) => {
    const key = url.split("#")[0];
    const hit = pages.get(key);
    if (hit && Date.now() - hit.t < 60000) return hit.p;
    const p = fetch(key, { credentials: "same-origin" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
    pages.set(key, { p, t: Date.now() });
    p.catch(() => pages.delete(key));
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
    htmlEl.classList.remove("intro-run", "intro-open", "first-visit", "menu-open", "scrolled", "vt-reveal");
    const b = document.body, keep = document.getElementById("gp");
    Array.from(b.attributes).forEach((at) => b.removeAttribute(at.name));
    Array.from(doc.body.attributes).forEach((at) => b.setAttribute(at.name, at.value));
    // la barra del riepilogo non si stacca mai: niente animazione ripetuta a ogni pagina
    Array.from(b.childNodes).forEach((n) => { if (n !== keep) n.remove(); });
    const frag = document.createDocumentFragment();
    Array.from(doc.body.childNodes).forEach((n) => { if (n.nodeName !== "SCRIPT") frag.appendChild(n); });
    b.insertBefore(frag, keep || null);
  };
  let navId = 0, idx = 0, ready = false, shown = location.pathname + location.search;
  G.prevUrl = "";
  G.soft = false;
  // dir: "forward" | "back" | "reveal"; at: punto toccato per il cerchio; y: scorrimento da ripristinare
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
      stopPage();
      apply(doc, pg.name);
      if (opt.push !== false) { idx += 1; history.pushState({ g: 1, n: idx, y: 0 }, "", url); }
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
      window.scrollTo(0, target ? target.getBoundingClientRect().top + scrollY - 70 : opt.y || 0);
    };
    const finish = () => {
      // per chi usa un lettore di schermo: il fuoco va all'inizio della pagina nuova e il titolo si annuncia
      const main = document.getElementById("main") || document.querySelector("main");
      if (main) { if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1"); main.focus({ preventScroll: true }); }
      let live = document.getElementById("nav-live");
      if (!live) { live = document.createElement("p"); live.id = "nav-live"; live.className = "sr-only"; live.setAttribute("aria-live", "polite"); document.body.appendChild(live); }
      live.textContent = document.title;
    };
    const animate = document.startViewTransition && !G.reduced() && !opt.instant;
    if (!animate) { await swap(); finish(); return; }
    htmlEl.dataset.vt = opt.dir || "forward";
    if (opt.swipe) htmlEl.dataset.swipe = "1";
    const t = document.startViewTransition(swap);
    window.gericoVT = t;
    if (opt.dir === "reveal" && opt.at) {
      const { x, y } = opt.at, rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      t.ready.then(() => htmlEl.animate({ clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + rad.toFixed(0) + "px at " + x + "px " + y + "px)"] },
        { duration: 560, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
    }
    t.finished.then(finish, finish).finally(() => { delete htmlEl.dataset.vt; delete htmlEl.dataset.swipe; if (window.gericoVT === t) window.gericoVT = null; });
  };
  if (soft) {
    try { history.replaceState(Object.assign({}, history.state, { g: 1, n: 0 }), ""); } catch (e) { /* niente */ }
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a[href]");
      const u = isPageLink(a);
      if (!u) return;
      // un link alla stessa pagina con solo un'ancora (le sezioni della prima pagina) lo gestisce la pagina
      if (u.pathname === location.pathname && u.search === location.search && u.hash) return;
      e.preventDefault();
      // toccare la pagina in cui sei già riporta in cima, come le schede delle app
      if (u.href === location.href) { window.scrollTo({ top: 0, behavior: G.reduced() ? "auto" : "smooth" }); return; }
      if (a.hasAttribute("data-reveal")) {
        const r = a.getBoundingClientRect();
        G.go(u.href, { dir: "reveal", at: { x: e.clientX || r.left + r.width / 2, y: e.clientY || r.top + r.height / 2 } });
      } else G.go(u.href, { dir: a.dataset.dir || "forward" });
    });
    // il dito si appoggia su un link: la pagina si scarica già, al tocco è pronta
    const warm = (e) => { const u = isPageLink(e.target.closest && e.target.closest("a[href]")); if (u && u.href.split("#")[0] !== location.href.split("#")[0]) fetchPage(u.href).catch(() => {}); };
    document.addEventListener("touchstart", warm, { passive: true });
    let edgeAt = 0;
    document.addEventListener("touchstart", (e) => { const x = e.touches[0] && e.touches[0].clientX; if (x < 24 || x > innerWidth - 24) edgeAt = Date.now(); }, { passive: true });
    document.addEventListener("mouseover", warm, { passive: true });
    window.addEventListener("popstate", (e) => {
      // è cambiata solo l'ancora (le sezioni della prima pagina): ci pensa la pagina
      if (location.pathname + location.search === shown) return;
      const st = e.state || {};
      const n = typeof st.n === "number" ? st.n : idx - 1;
      const back = n < idx;
      idx = n;
      // se il browser ha già animato il ritorno (il gesto dal bordo su iOS), niente seconda animazione
      G.go(location.href, { push: false, y: st.y || 0, dir: back ? "back" : "forward", instant: !!e.hasUAVisualTransition || Date.now() - edgeAt < 1500 });
    });
  }

  // ---------- swipe: scorrere di lato per passare alla sezione, al gruppo o alla storia vicina ----------
  // Conta solo un gesto orizzontale e deciso. I bordi dello schermo restano a iOS (indietro e avanti);
  // gli elementi che scorrono da soli (fasce, controlli, tabelle) e i campi di testo non lo fanno partire.
  // Lo scorrimento verticale non si blocca mai: gli ascoltatori sono passivi. Pulsanti e schede restano: è una scorciatoia.
  const NOSWIPE = "input, textarea, select, [contenteditable], .ultim, [data-noswipe]";
  G.swipe = (area, opt) => {
    if (!area || !("ontouchstart" in window)) return;
    const follow = opt.follow || area;
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, mode = "";
    // dentro un elemento che scorre di lato (schede lunghe, tabelle larghe) il gesto è suo
    const scrollsX = (el) => {
      for (let n = el; n && n !== area && n !== document.body; n = n.parentElement) {
        if (n.scrollWidth > n.clientWidth + 2) { const o = getComputedStyle(n).overflowX; if (o === "auto" || o === "scroll") return true; }
      }
      return false;
    };
    const reset = (smooth) => {
      if (!smooth || G.reduced()) { follow.style.transition = ""; follow.style.transform = ""; return; }
      follow.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      follow.style.transform = "";
      P.later(() => { follow.style.transition = ""; }, 240);
    };
    P.on(area, "touchstart", (e) => {
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); dx = 0;
      mode = e.touches.length > 1 || x0 < 24 || x0 > innerWidth - 24 || (e.target.closest && e.target.closest(NOSWIPE)) || scrollsX(e.target) ? "no" : "";
    }, { passive: true });
    P.on(area, "touchmove", (e) => {
      if (mode === "no") return;
      const t = e.touches[0], dy = t.clientY - y0;
      dx = t.clientX - x0;
      if (!mode) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        mode = Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "no";
        if (mode === "no") return;
      }
      // il contenuto segue il dito con resistenza; dove oltre non c'è niente resta quasi fermo
      const can = dx < 0 ? opt.canNext() : opt.canPrev();
      if (!G.reduced()) follow.style.transform = "translateX(" + (dx * (can ? 0.35 : 0.08)).toFixed(1) + "px)";
    }, { passive: true });
    P.on(area, "touchend", () => {
      if (mode !== "x") { mode = ""; return; }
      mode = "";
      const v = Math.abs(dx) / Math.max(1, Date.now() - t0);
      const ok = Math.abs(dx) > 56 || (Math.abs(dx) > 28 && v > 0.45);
      if (ok && dx < 0 && opt.canNext()) opt.next(reset);
      else if (ok && dx > 0 && opt.canPrev()) opt.prev(reset);
      else reset(true);
    }, { passive: true });
    P.on(area, "touchcancel", () => { mode = ""; reset(true); }, { passive: true });
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
    document.querySelectorAll("[data-size-set]").forEach((b) => b.addEventListener("click", () => {
      const s = Number(b.dataset.sizeSet) || 0;
      G.ls.set("gerico.size", s); applySize(s);
      requestAnimationFrame(() => groups("[data-size-set]").forEach((g) => G.seg(g)));
      window.dispatchEvent(new Event("resize"));
    }));
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => {
      const changes = (b.dataset.themeSet === "dark") !== G.isDark();
      const apply = () => {
        G.ls.set("gerico.theme", b.dataset.themeSet);
        html.setAttribute("data-theme", b.dataset.themeSet);
        applyTheme();
        groups("[data-theme-set]").forEach((g) => G.seg(g));
      };
      // cambio di tema: il nuovo colore si allarga a cerchio dal pulsante toccato
      if (!changes || !document.startViewTransition || G.reduced()) { apply(); return; }
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      document.querySelectorAll("[style*='view-transition-name']").forEach((el) => { el.style.viewTransitionName = ""; });
      html.classList.add("theme-vt");
      const t = document.startViewTransition(apply);
      t.ready.then(() => html.animate({ clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + rad.toFixed(0) + "px at " + x + "px " + y + "px)"] },
        { duration: 480, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
      t.finished.finally(() => html.classList.remove("theme-vt"));
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

    // interruttore Notizie / Terminal: arrivando dall'altra pagina l'indicatore parte da dove l'hai toccato e scivola qui
    const mode = document.querySelector(".mode");
    if (mode) {
      const on = mode.querySelector("[aria-current]");
      const other = Array.from(mode.querySelectorAll("a")).find((a) => a !== on);
      if ((html.classList.contains("vt-reveal") || html.dataset.vt === "reveal") && on && other && !G.reduced()) {
        const cur = on.getAttribute("aria-current");
        on.removeAttribute("aria-current"); other.setAttribute("aria-current", cur);
        G.seg(mode, true);
        other.removeAttribute("aria-current"); on.setAttribute("aria-current", cur);
        requestAnimationFrame(() => requestAnimationFrame(() => G.seg(mode)));
      } else G.seg(mode, true);
    }
    // la classe del passaggio a cerchio serve solo durante il passaggio: poi non deve toccare gli altri (cambio di tema)
    if (html.classList.contains("vt-reveal")) setTimeout(() => html.classList.remove("vt-reveal"), 1500);

    document.querySelectorAll(".chips").forEach(G.watchRow);
    G.watchTop();
  };

  // ---------- titoli da seguire: lo stesso blocco in prima pagina e nel Terminal ----------
  // Chi produce le analisi e i conflitti di interesse: la frase la decide chi cura GERICO (vedi come-funziona.html#titoli)
  G.TITOLI_DISC = "A cura di Riccardo Peruzzo, che non ha posizioni sui titoli citati.";
  G.titoliFresh = (t) => !!(t && Array.isArray(t.items) && G.hoursAgo(t.asOf) < 30);
  G.titoliHTML = (t, h) => {
    const esc = G.esc;
    const row = (x) => {
      const p = typeof x.price === "number" ? G.num(x.price, x.price >= 1000 ? 0 : 2) + (x.market === "Usa" ? " $" : " €") : "";
      const c = typeof x.chg === "number" ? ' <b class="' + (x.chg > 0 ? "up" : x.chg < 0 ? "down" : "") + '">' + G.pct(x.chg) + "</b>" : "";
      return '<li class="tit-i"><p class="tit-top"><span class="tit-n">' + esc(x.name) + '</span><span class="tit-k">' + esc([x.ticker, x.market].filter(Boolean).join(" · ")) + "</span>" +
        (p ? '<span class="tit-p">' + esc(p) + c + "</span>" : "") + "</p>" +
        '<p class="tit-why"><strong>Perché</strong> ' + esc(x.why) + "</p>" +
        (x.signal ? '<p class="tit-sig">' + esc(x.signal) + "</p>" : "") +
        '<p class="tit-risk"><strong>Rischio</strong> ' + esc(x.risk) + "</p>" +
        '<p class="tit-src">Fonte: ' + (x.sources || []).map((s) => '<a href="' + esc(G.safeUrl(s.url)) + '" target="_blank" rel="noopener">' + esc(s.name || "articolo") + "</a>" +
          (s.date ? " (" + esc(G.dayOnly(s.date)) + ")" : "")).join(", ") + "</p></li>";
    };
    const s = h && h.summary;
    const rec = s && s.n >= 5 ? '<p class="tit-rec">Gli ultimi ' + s.n + ": " + s.better + " meglio del loro indice dopo 5 sedute" +
      (typeof s.avgExcess === "number" ? ", in media " + G.signed(s.avgExcess, 1) + " punti" : "") + ".</p>" : "";
    const list = t.items.length ? '<ol class="tit-list">' + t.items.map(row).join("") + "</ol>"
      : '<p class="tit-none">Oggi nessun titolo passa i filtri.' + (t.note ? " " + esc(t.note) : "") + "</p>";
    return list + rec + '<p class="tit-disc">' + (G.TITOLI_DISC ? esc(G.TITOLI_DISC) + " " : "") + "Analisi automatica di GERICO " + esc(G.isToday(t.asOf) ? "delle " + G.hm(t.asOf) : "del " + G.day(t.asOf) + " alle " + G.hm(t.asOf)) +
      ": segnali sui prezzi e notizie con data. Non è una consulenza personalizzata: può sbagliare e si può perdere denaro. " +
      '<a href="come-funziona.html#titoli">Metodo e rischi</a>.</p>';
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
    ["#B3261E", "−1% o meno"], ["#8C1F1A", "da −1 a −0,5"], ["#56201C", "da −0,5 a 0"],
    ["#1B4A33", "da 0 a +0,5"], ["#0D5F32", "da +0,5 a +1"], ["#0F7A3F", "+1% o più"]
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
  const MAP_SYM = { USA: "^GSPC", JPN: "^N225", GBR: "^FTSE", FRA: "^FCHI", DEU: "^GDAXI", ITA: "FTSEMIB.MI" };
  const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  // la data scritta nella nota («Chiusura del 27 ottobre») come AAAA-MM-GG, "" se non c'è
  const noteDate = (note) => {
    const m = new RegExp("\\b(\\d{1,2}) (" + MESI.join("|") + ")\\b", "i").exec(note || "");
    if (!m) return "";
    const today = G.dayKey(new Date()), y = Number(today.slice(0, 4));
    const key = (yy) => yy + "-" + String(MESI.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0") + "-" + m[1].padStart(2, "0");
    return key(y) > today ? key(y - 1) : key(y);
  };
  const fromQuote = (q) => {
    if (!q || q.stale || typeof q.chg !== "number" || !/^\d{4}-\d{2}-\d{2}$/.test(q.date || "")) return null;
    const age = G.dayAge(q.date + "T12:00:00Z");
    if (age > 4) return null;
    return { chg: q.chg, time: G.hm(q.at), note: (age === 0 && q.at ? "Dato delle " + G.hm(q.at) : "Chiusura del " + G.dayOnly(q.date)) + ", da Yahoo Finance." };
  };
  G.mapItems = (weights, terminal, view, quotes) => {
    const w = (weights && weights[view === "europa" ? "europe" : "world"]) || {};
    const by = {}, qs = {};
    ((terminal && terminal.indices) || []).forEach((x) => { if (x && x.code) by[x.code] = x; });
    ((quotes && quotes.groups) || []).forEach((g) => (g.items || []).forEach((q) => { if (q && q.sym) qs[q.sym] = q; }));
    return Object.keys(w).filter((k) => G.MARKETS[k] && typeof w[k] === "number").map((k) => {
      const own = by[k], q = qs[MAP_SYM[k]], alt = fromQuote(q);
      // la voce della pubblicazione resta, anche senza numero se ha una nota (per esempio Borsa chiusa per festa),
      // salvo quando la sua nota dice che è una chiusura più vecchia di quella del job
      const old = !!(own && alt && noteDate(own.note) && noteDate(own.note) < q.date);
      const d = (own && !old && (typeof own.chg === "number" || own.note) ? own : alt) || own || {};
      return { code: k, name: G.MARKETS[k][0], index: G.MARKETS[k][1], value: w[k], chg: typeof d.chg === "number" ? d.chg : null, time: d.time || "", note: d.note || "", story: d.story || "" };
    }).sort((a, b) => b.value - a.value);
  };

  G.drawMap = (el, items, opts) => {
    opts = opts || {};
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    const rects = G.squarify(items, W, H);
    el.innerHTML = rects.map((r, k) => {
      const has = typeof r.chg === "number";
      const cg = has ? G.pct(r.chg) : "";
      const label = r.name + (r.index ? ", " + r.index : "") + ", " + (has ? cg : "nessun dato oggi") + ", peso " + G.wt(r.value);
      let size = r.w >= 170 && r.h >= 110 ? "big" : r.w >= 90 && r.h >= 56 ? "med" : r.w >= 40 && r.h >= 30 ? "small" : r.w >= 22 && r.h >= 14 ? "tiny" : "none";
      let inner = "";
      if (!has) {
        // senza dato: grigio con la sola sigla
        inner = size === "none" ? "" : '<span class="a"><span class="nm">' + r.code + "</span></span>";
      } else if (size === "big") {
        inner = '<span class="a"><span class="nm">' + G.esc(r.name) + '</span><span class="ix">' + G.esc(r.index) + '</span></span><span class="b"><span class="cg" data-n="' + r.chg + '" data-f="pct%">' + cg + "</span></span>";
      } else if (size === "med") {
        inner = '<span class="a"><span class="nm">' + G.esc(r.name) + '</span></span><span class="b"><span class="cg" data-n="' + r.chg + '" data-f="pct%">' + cg + "</span></span>";
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
