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
  G.load = async (name) => {
    try {
      const r = await fetch("data/" + name + ".json", { cache: "no-cache" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
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
  G.romeNow = () => {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), min: (Number(p.hour) % 24) * 60 + Number(p.minute), hm: (p.hour % 24).toString().padStart(2, "0") + ":" + p.minute };
  };
  // il sito si aggiorna alle 7:45 tutti i giorni e alle 18:45 nei giorni feriali
  G.nextUpdate = () => {
    const now = G.romeNow();
    const names = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
    const slots = (d) => (d === 0 || d === 6 ? [465] : [465, 1125]);
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

  // ---------- accordo tra le testate ----------
  G.counts = (src) => {
    const c = { allineata: 0, parziale: 0, divergente: 0 };
    (src || []).forEach((s) => { if (c[s.stance] !== undefined) c[s.stance]++; else c.parziale++; });
    return c;
  };
  G.wall = (src, cls) => {
    const c = G.counts(src);
    return '<div class="wall ' + (cls || "") + '" aria-hidden="true">' + "<i></i>".repeat(c.allineata) +
      '<i class="p"></i>'.repeat(c.parziale) + '<i class="d"></i>'.repeat(c.divergente) + "</div>";
  };
  // la frase breve delle schede: «5 testate su 6 concordano»
  G.agreeLine = (src) => {
    const c = G.counts(src), n = (src || []).length;
    if (!n) return "";
    if (n === 1) return "Una sola testata";
    return c.allineata + (c.allineata === 1 ? " testata su " + n + " concorda" : " testate su " + n + " concordano");
  };
  const tail = (c) => (c.parziale ? ", " + c.parziale + " in parte" : "") + (c.divergente ? ", " + c.divergente + (c.divergente === 1 ? " diverge" : " divergono") : "");
  G.agreeShort = (src) => { const c = G.counts(src), n = (src || []).length; return c.allineata + " su " + n + " concordano" + tail(c); };
  G.agreeLong = (src) => {
    const c = G.counts(src), n = (src || []).length;
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
  G.initPrefs = () => {
    const html = document.documentElement;
    const SIZES = ["normale", "grande", "molto grande"];
    const applySize = (s) => {
      html.classList.toggle("size-1", s === 1); html.classList.toggle("size-2", s === 2);
      document.querySelectorAll("[data-size-set]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.sizeSet) === s)));
      document.querySelectorAll("[data-size]").forEach((b) => b.setAttribute("aria-label", "Dimensione del testo: " + SIZES[s]));
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
      window.dispatchEvent(new Event("resize"));
    }));
    document.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
      const s = (G.ls.get("gerico.size", 0) + 1) % 3;
      G.ls.set("gerico.size", s); applySize(s);
      window.dispatchEvent(new Event("resize"));
    }));
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => {
      G.ls.set("gerico.theme", b.dataset.themeSet);
      html.setAttribute("data-theme", b.dataset.themeSet);
      applyTheme();
    }));

    // menu dell'intestazione
    const btn = document.querySelector(".menu-btn"), menu = document.getElementById("menu");
    if (btn && menu) {
      const set = (open) => {
        menu.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
      };
      btn.addEventListener("click", () => set(menu.hidden));
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { set(false); btn.focus(); } });
      document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) set(false); });
    }

    // sezioni che scorrono: sfumatura a destra solo se c'è altro da vedere
    document.querySelectorAll(".sections").forEach((nav) => {
      const upd = () => nav.classList.toggle("has-more", nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 4);
      nav.addEventListener("scroll", upd, { passive: true });
      window.addEventListener("resize", upd);
      G.watchSections = upd;
      upd();
    });
  };

  // ---------- mappa a quadrati (treemap squarified) ----------
  G.MARKETS = {
    USA: ["Stati Uniti", "S&P 500"], JPN: ["Giappone", "Nikkei 225"], TWN: ["Taiwan", "Taiex"],
    GBR: ["Regno Unito", "FTSE 100"], CAN: ["Canada", "S&P/TSX"], KOR: ["Corea del Sud", "Kospi"],
    CHN: ["Cina", "CSI 300"], FRA: ["Francia", "CAC 40"], CHE: ["Svizzera", "SMI"], DEU: ["Germania", "DAX"],
    IND: ["India", "Nifty 50"], NLD: ["Paesi Bassi", "AEX"], ITA: ["Italia", "FTSE MIB"], BRA: ["Brasile", "Bovespa"]
  };
  G.NO_DATA = "#4A5350";
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
  G.mapItems = (weights, terminal, view) => {
    const w = (weights && weights[view === "europa" ? "europe" : "world"]) || {};
    const by = {};
    ((terminal && terminal.indices) || []).forEach((x) => { if (x && x.code) by[x.code] = x; });
    return Object.keys(w).filter((k) => G.MARKETS[k] && typeof w[k] === "number").map((k) => {
      const d = by[k] || {};
      return { code: k, name: G.MARKETS[k][0], index: G.MARKETS[k][1], value: w[k], chg: typeof d.chg === "number" ? d.chg : null, time: d.time || "", note: d.note || "", story: d.story || "" };
    }).sort((a, b) => b.value - a.value);
  };

  G.drawMap = (el, items, opts) => {
    opts = opts || {};
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    const rects = G.squarify(items, W, H);
    el.innerHTML = rects.map((r) => {
      const has = typeof r.chg === "number";
      const cg = has ? G.pct(r.chg) : "";
      const label = r.name + (r.index ? ", " + r.index : "") + ", " + (has ? cg : "nessun dato oggi") + ", peso " + G.wt(r.value);
      let size = r.w >= 170 && r.h >= 110 ? "big" : r.w >= 90 && r.h >= 56 ? "med" : r.w >= 40 && r.h >= 30 ? "small" : r.w >= 22 && r.h >= 14 ? "tiny" : "none";
      let inner = "";
      if (!has) {
        // senza dato: grigio con la sola sigla
        inner = size === "none" ? "" : '<span class="a"><span class="nm">' + r.code + "</span></span>";
      } else if (size === "big") {
        inner = '<span class="a"><span class="nm">' + G.esc(r.name) + '</span><span class="ix">' + G.esc(r.index) + '</span></span><span class="b"><span class="cg">' + cg + "</span></span>";
      } else if (size === "med") {
        inner = '<span class="a"><span class="nm">' + G.esc(r.name) + '</span></span><span class="b"><span class="cg">' + cg + "</span></span>";
      } else if (size === "small") {
        inner = '<span class="a"><span class="nm">' + r.code + "</span></span>" + (r.w >= 46 ? '<span class="b"><span class="cg">' + cg + "</span></span>" : "");
      } else if (size === "tiny") {
        inner = '<span class="a"><span class="nm">' + r.code + "</span></span>";
      }
      const style = "left:" + r.x.toFixed(1) + "px;top:" + r.y.toFixed(1) + "px;width:" + r.w.toFixed(1) + "px;height:" + r.h.toFixed(1) + "px;background:" + G.band(r.chg);
      const cls = "tile " + size + (has ? "" : " nodata");
      if (opts.interactive) {
        return '<button type="button" class="' + cls + '" data-code="' + r.code + '" aria-pressed="' + (r.code === opts.selected) + '" aria-label="' + G.esc(label) + '" style="' + style + '">' + inner + "</button>";
      }
      return '<div class="' + cls + '" style="' + style + '">' + inner + "</div>";
    }).join("");
  };
})();
