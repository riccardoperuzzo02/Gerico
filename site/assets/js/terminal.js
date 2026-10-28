/* GERICO Terminal: mappa a quadrati, pannelli, scorciatoie da tastiera (F1-F7) e comandi, prezzi in diretta al clic. */
(async function () {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);
  G.initPrefs();

  // ---------- orologio ----------
  const tick = () => { $("clock").textContent = "Roma, " + G.romeNow().hm; };
  tick();
  setInterval(tick, 30000);

  // legenda: una barra sola da −1% a +1%, i colori sono quelli dei quadrati (non dipende dai dati: subito, senza salti)
  const stops = G.BANDS.map(([c], k) => c + " " + ((2 * k + 1) * 100 / 12).toFixed(2) + "%").join(", ");
  $("legend").innerHTML = '<span class="t-grad" aria-hidden="true"><i style="background:linear-gradient(90deg, ' + stops + ')"></i>' +
    '<span class="t-ticks"><span style="left:16.67%">−1%</span><span style="left:50%">0</span><span style="left:83.33%">+1%</span></span></span>' +
    '<span class="t-nd"><i style="background:' + G.NO_DATA + '"></i>nessun dato</span>' +
    '<span class="sr-only">Rosso se la Borsa è scesa, verde se è salita: più è intenso, più è ampia la variazione, fino a 1% o più. Grigio se oggi non c\'è il dato.</span>';

  const [ed, mk, ag, tm, wt] = await Promise.all([G.load("edition"), G.load("markets"), G.load("agenda"), G.load("terminal"), G.load("weights")]);
  const state = {
    view: G.ls.get("gerico.mapView", "mondo") === "europa" ? "europa" : "mondo",
    sel: G.ls.get("gerico.mapSel", "ITA")
  };

  // ---------- mappa ----------

  function linkedStory(code) {
    const stories = (ed && ed.stories) || [];
    const d = ((tm && tm.indices) || []).find((x) => x.code === code);
    if (d && d.story) { const s = stories.find((x) => x.id === d.story); if (s) return s; }
    const country = G.MARKETS[code] && G.MARKETS[code][0];
    return stories.find((s) => (s.tags || []).includes(country)) || null;
  }
  function renderDetail(items) {
    const it = items.find((x) => x.code === state.sel);
    if (!it) { $("detail").innerHTML = "<p>Tocca un quadrato per vedere il dettaglio.</p>"; return; }
    const basis = state.view === "europa" ? "MSCI Europe" : "MSCI ACWI";
    const cg = typeof it.chg === "number"
      ? '<b class="' + (it.chg > 0 ? "t-up" : it.chg < 0 ? "t-down" : "") + '">' + G.pct(it.chg) + "</b>"
      : "nessun dato oggi";
    let html = "<p><b>" + esc(it.name) + "</b>" + (it.index ? ", " + esc(it.index) : "") + ": " + cg + ". Peso " + G.wt(it.value) + " nell'indice " + basis + ".</p>";
    if (it.note) html += "<p>" + esc(it.note) + "</p>";
    else if (it.time) html += "<p>Dato delle " + esc(it.time) + ".</p>";
    const s = linkedStory(it.code);
    if (s) html += '<p>Storia collegata: <a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + "</a></p>";
    $("detail").innerHTML = html;
  }
  // movimento della mappa: i quadrati compaiono con una dissolvenza, cambiando vista scivolano (FLIP), l'anello segue la scelta
  const SPRING = window.CSS && CSS.supports && CSS.supports("animation-timing-function", "linear(0, 1)")
    ? getComputedStyle(document.documentElement).getPropertyValue("--spring").trim() || "ease-out" : "cubic-bezier(0.2, 0.8, 0.2, 1)";
  // le posizioni dei quadrati arrivano dal calcolo della mappa: nessuna lettura dal layout, nessun ricalcolo forzato
  const byCode = (rects) => { const m = {}; (rects || []).forEach((r) => { m[r.code] = r; }); return m; };
  let lastRects = null;
  function flip(before, now) {
    $("map").querySelectorAll(".tile").forEach((el) => {
      const a = before[el.dataset.code], b = now[el.dataset.code];
      if (!b) return;
      if (!a) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" }); return; }
      if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1) return;
      el.animate([
        { transformOrigin: "0 0", transform: "translate(" + (a.x - b.x) + "px, " + (a.y - b.y) + "px) scale(" + (a.w / b.w).toFixed(4) + ", " + (a.h / b.h).toFixed(4) + ")" },
        { transformOrigin: "0 0", transform: "none" }
      ], { duration: 380, easing: SPRING });
    });
  }
  function placeRing(instant, now) {
    const ring = $("ring"), r = now[state.sel];
    if (!ring) return;
    if (!r) { ring.style.opacity = "0"; return; }
    if (instant) ring.classList.remove("ready");
    ring.style.transform = "translate(" + r.x + "px, " + r.y + "px)";
    ring.style.width = r.w + "px";
    ring.style.height = r.h + "px";
    ring.style.opacity = "1";
    ring.parentElement.classList.add("has-ring");
    if (instant) { void ring.offsetWidth; ring.classList.add("ready"); }
  }
  let firstDraw = true;
  // how: "flip" cambiando vista, "select" scegliendo un quadrato, niente al primo disegno e al ridimensionamento
  function drawMap(focusSel, how) {
    if (!wt) {
      $("map-sub").textContent = "I pesi della mappa non sono disponibili in questo momento.";
      $("map").innerHTML = "";
      $("detail").innerHTML = "";
      return;
    }
    const items = G.mapItems(wt, tm, state.view);
    if (!items.some((x) => x.code === state.sel)) state.sel = (items[0] || {}).code || "";
    const before = how === "flip" && !G.reduced() && lastRects ? byCode(lastRects) : null;
    const rects = G.drawMap($("map"), items, { interactive: true, selected: state.sel }) || [];
    lastRects = rects;
    const now = byCode(rects);
    if (firstDraw) {
      firstDraw = false;
      if (!G.reduced()) { $("map").classList.add("tiles-in"); setTimeout(() => $("map").classList.remove("tiles-in"), 1000); }
    }
    if (before) flip(before, now);
    placeRing(!how, now);
    const basis = state.view === "europa" ? "europeo MSCI Europe" : "mondiale MSCI ACWI";
    $("map-sub").textContent = "Ogni quadrato è una Borsa: più è grande, più pesa nell'indice " + basis + ".";
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    requestAnimationFrame(() => G.seg(document.querySelector(".t-seg")));
    renderDetail(items);
    if (focusSel) { const b = $("map").querySelector('[data-code="' + state.sel + '"]'); if (b) b.focus(); }
  }
  function setView(v) { if (v === state.view) return; state.view = v; G.ls.set("gerico.mapView", v); drawMap(false, "flip"); }
  $("map").addEventListener("click", (e) => {
    const b = e.target.closest("[data-code]");
    if (!b) return;
    state.sel = b.dataset.code;
    G.ls.set("gerico.mapSel", state.sel);
    drawMap(true, "select");
  });
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  let size = "";
  if (window.ResizeObserver) {
    let rt;
    new ResizeObserver(() => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const now = $("map").clientWidth + "x" + $("map").clientHeight;
        if (now !== size) { size = now; drawMap(false); }
      }, 100);
    }).observe($("map"));
  }

  // ---------- pannelli ----------
  const cls = (key) => ((mk && mk.classes) || []).find((c) => c.key === key);
  // la nota che si ripete (per esempio «Chiusura 26 ottobre») va una volta sola sotto il titolo
  const head = (note) => String(note || "").split(/[;,]/)[0].trim();
  function commonNote(items) {
    if (items.length < 2 || items.some((it) => !head(it.note))) return "";
    const count = {};
    items.forEach((it) => { count[head(it.note)] = (count[head(it.note)] || 0) + 1; });
    const top = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    return count[top] >= 2 ? top : "";
  }
  const ownNote = (note, common) => {
    if (!common || head(note) !== common) return note || "";
    return G.cap(String(note).slice(String(note).indexOf(common) + common.length).replace(/^[\s;,]+/, ""));
  };
  function table(key, cols, target, extraNote) {
    const c = cls(key);
    if (!mk) { $(target).innerHTML = '<p class="t-na">Dati di mercato non disponibili.</p>'; return; }
    if (!c || !(c.items || []).length) { $(target).innerHTML = '<p class="t-na">' + esc((c && c.note) || "Nessun dato verificato in questo aggiornamento.") + "</p>"; return; }
    const common = commonNote(c.items);
    const notes = c.items.map((it) => ownNote(it.note, common));
    const rows = c.items.map((it, i) => {
      const tone = G.tone(it, key);
      const mv = typeof it.chg === "number" ? G.pctBare(it.chg) : typeof it.bp === "number" ? G.bps(it.bp).replace(" pb", "") : "";
      return '<tr><th scope="row">' + esc(G.shortName(it.name)) + (notes[i] ? "<small>" + esc(notes[i]) + "</small>" : "") + "</th><td>" +
        esc(G.cleanValue(it.value)) + '</td><td class="mv' + (tone ? " t-" + tone : "") + '">' + esc(mv) + "</td></tr>";
    }).join("");
    $(target).innerHTML = (common ? '<p class="t-common">' + esc(common) + (notes.some(Boolean) ? ", salvo dove indicato" : "") + "</p>" : "") + '<table class="t-table"><thead><tr><th scope="col">' + cols[0] + '</th><th scope="col">' + cols[1] + '</th><th scope="col">' + cols[2] +
      "</th></tr></thead><tbody>" + rows + "</tbody></table>" + (c.note ? '<p class="t-note">' + esc(c.note) + "</p>" : "") + (extraNote ? '<p class="t-note">' + extraNote + "</p>" : "");
  }

  function renderAgenda() {
    if (!ag || !(ag.items || []).length) { $("ag").innerHTML = '<p class="t-na">L\'agenda di oggi non è ancora disponibile.</p>'; return; }
    const today = !ag.date || String(ag.date).slice(0, 10) === G.dayKey(new Date());
    const now = G.romeNow().hm;
    const items = ag.items.slice().sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99")));
    const next = today ? items.find((it) => it.impact === "alto" && it.time && it.time >= now) : null;
    // quanto manca al prossimo evento ad alto impatto (si aggiorna ogni 30 secondi)
    let left = "";
    if (next) {
      const [hh, mm] = String(next.time).split(":").map(Number);
      const mins = hh * 60 + mm - G.romeNow().min;
      left = mins <= 0 ? "adesso" : mins < 60 ? "tra " + mins + " min" : "tra " + Math.floor(mins / 60) + " h " + String(mins % 60).padStart(2, "0") + " min";
    }
    $("next").innerHTML = next ? "Prossimo ad alto impatto: <b>" + esc(next.time + " " + (next.currency || "")) + "</b> · " + esc(left) : "";
    $("ag-h").textContent = today ? "Agenda di oggi" : "Agenda del " + G.dayOnly(ag.date);
    $("ag").innerHTML = '<ol class="t-agenda">' + items.map((it) => {
      const past = today && it.time && it.time < now;
      const nums = [it.expected ? "atteso " + it.expected : "", it.previous ? "precedente " + it.previous : "", it.actual ? "effettivo " + it.actual : ""].filter(Boolean).join(" · ");
      const imp = ["alto", "medio", "basso"].includes(it.impact) ? it.impact : "";
      return '<li class="' + (past ? "past " : "") + (imp === "alto" ? "hi" : "") + (it === next ? " next" : "") + '"><span class="tm">' + esc(it.time || "—") + "</span><span>" + esc(it.currency || "") +
        '</span><span class="ev">' + esc(it.event) + (nums ? "<small>" + esc(nums) + "</small>" : "") + '</span><span class="im ' + imp + '">' + esc(G.cap(imp)) + "</span></li>";
    }).join("") + "</ol>" + (ag.note ? '<p class="t-note">' + esc(ag.note) + "</p>" : "");
  }

  // solo le storie legate ai mercati: citate dai dati di mercato o nelle sezioni Mercati ed Economia, al massimo 3
  function renderNews() {
    const ids = new Set();
    ((mk && mk.classes) || []).forEach((c) => (c.items || []).forEach((it) => { if (it.story) ids.add(it.story); }));
    ((tm && tm.indices) || []).forEach((x) => { if (x && x.story) ids.add(x.story); });
    const st = ((ed && ed.stories) || []).filter((s) => ids.has(s.id) || s.section === "mercati" || s.section === "economia")
      .sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 3);
    if (!st.length) {
      $("p-notizie").hidden = true;
      const k = document.querySelector('[data-cmd="NOTIZIE"]');
      if (k) k.hidden = true;
      return;
    }
    $("nw").innerHTML = '<ul class="t-news">' + st.map((s) => {
      const n = (s.sources || []).length, a = G.counts(s.sources).allineata;
      return '<li><a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + '</a><span class="ag">' + a + " su " + n + " concordano</span></li>";
    }).join("") + "</ul>";
  }

  function renderStatus() {
    const asOf = (tm && tm.asOf) || (mk && mk.asOf);
    $("st-line").textContent = (asOf ? "Aggiornato " + G.when(asOf) : "Dati non disponibili") + " · prossimo " + G.nextUpdate();
    if (asOf && G.hoursAgo(asOf) > 30) {
      $("stale").innerHTML = '<p class="t-stale">I dati di mercato sono di ' + esc(G.longDay(asOf)) + ": l'aggiornamento di oggi non è ancora arrivato.</p>";
    }
  }

  // ---------- sezioni, comandi e tasti funzione ----------
  const PANELS = { MAPPA: "map-panel", INDICI: "p-indici", VALUTE: "p-valute", TASSI: "p-tassi", MATERIE: "p-materie", "MATERIE PRIME": "p-materie", AGENDA: "p-agenda", NOTIZIE: "p-notizie" };
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function go(id) {
    const el = $(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
  }
  function run(raw) {
    const c = String(raw || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!c) return;
    let ok = true;
    if (c === "MAPPA EUROPA" || c === "EUROPA") { setView("europa"); go("map-panel"); }
    else if (c === "MAPPA MONDO" || c === "MONDO") { setView("mondo"); go("map-panel"); }
    else if (PANELS[c]) go(PANELS[c]);
    else ok = false;
    $("cmd-help").textContent = ok ? "" : "Non trovato. Prova: mappa mondo, mappa europa, indici, valute, tassi, materie prime, agenda, notizie.";
  }
  $("cmd-form").addEventListener("submit", (e) => { e.preventDefault(); run($("cmd").value); $("cmd").value = ""; });
  document.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => run(b.dataset.cmd)));
  const FKEYS = { F1: "MAPPA", F2: "INDICI", F3: "VALUTE", F4: "TASSI", F5: "MATERIE PRIME", F6: "AGENDA", F7: "NOTIZIE" };
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (FKEYS[e.key]) { e.preventDefault(); run(FKEYS[e.key]); }
  });

  // ---------- prezzi in diretta: widget TradingView, solo dopo un clic ----------
  const TV_SYMBOLS = [
    { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
    { proName: "FOREXCOM:NSXUSD", title: "Nasdaq 100" },
    { proName: "FX_IDC:EURUSD", title: "EUR/USD" },
    { proName: "FX:GBPUSD", title: "GBP/USD" },
    { proName: "FX:USDJPY", title: "USD/JPY" },
    { proName: "OANDA:XAUUSD", title: "Oro" },
    { proName: "TVC:UKOIL", title: "Brent" },
    { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" }
  ];
  function loadTV() {
    const box = $("tv");
    if (box.childElementCount) return;
    const wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    wrap.appendChild(inner);
    const copy = document.createElement("div");
    copy.className = "tradingview-widget-copyright";
    copy.innerHTML = '<a href="https://it.tradingview.com/" rel="noopener nofollow" target="_blank">Prezzi forniti da TradingView</a>';
    wrap.appendChild(copy);
    const sc = document.createElement("script");
    sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    sc.async = true;
    sc.textContent = JSON.stringify({ symbols: TV_SYMBOLS, showSymbolLogo: false, isTransparent: true, displayMode: "adaptive", colorTheme: "dark", locale: "it" });
    wrap.appendChild(sc);
    box.appendChild(wrap);
    $("live-btn").textContent = "Nascondi i prezzi in diretta";
    $("live-btn").setAttribute("aria-expanded", "true");
  }
  function unloadTV() { $("tv").innerHTML = ""; $("live-btn").textContent = "Prezzi in diretta"; $("live-btn").setAttribute("aria-expanded", "false"); }
  $("live-btn").addEventListener("click", () => {
    if ($("tv").childElementCount) { unloadTV(); G.ls.set("gerico.live", false); }
    else { loadTV(); G.ls.set("gerico.live", true); }
  });
  $("live-btn").setAttribute("aria-expanded", "false");
  if (G.ls.get("gerico.live", false)) loadTV();

  // ---------- avvio ----------
  if (location.hash === "#europa") state.view = "europa";
  drawMap(false);
  size = $("map").clientWidth + "x" + $("map").clientHeight;
  table("indici", ["Indice", "Ultimo", "Var. %"], "ix");
  table("valute", ["Coppia", "Ultimo", "Var. %"], "fx");
  table("obbligazioni", ["Titolo", "Rendimento", "Punti base"], "rt", "Rosso: rendimenti in salita, cioè prezzi in calo.");
  table("materie", ["Materia prima", "Ultimo", "Var. %"], "cm");
  renderAgenda();
  setInterval(renderAgenda, 30000);
  renderNews();
  renderStatus();
})();
