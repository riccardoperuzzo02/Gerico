/* GERICO Terminal: mappa a quadrati, pannelli, scorciatoie da tastiera (F1-F7) e comandi, prezzi in diretta al clic. */
(async function () {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);
  const lowFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : "");
  G.initPrefs();

  // ---------- orologio ----------
  const tick = () => { $("clock").textContent = "Roma, " + G.romeNow().hm; };
  tick();
  setInterval(tick, 30000);

  const [ed, mk, ag, tm, wt] = await Promise.all([G.load("edition"), G.load("markets"), G.load("agenda"), G.load("terminal"), G.load("weights")]);
  const state = {
    view: G.ls.get("gerico.mapView", "mondo") === "europa" ? "europa" : "mondo",
    sel: G.ls.get("gerico.mapSel", "ITA")
  };

  // ---------- mappa ----------
  $("legend").innerHTML = G.BANDS.map(([c, l]) => '<span><i style="background:' + c + '"></i>' + esc(l) + "</span>").join("") +
    '<span><i style="background:' + G.NO_DATA + '"></i>grigio: nessun dato oggi</span>';

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
  function drawMap(focusSel) {
    if (!wt) {
      $("map-sub").textContent = "I pesi della mappa non sono disponibili in questo momento.";
      $("map").innerHTML = "";
      $("detail").innerHTML = "";
      return;
    }
    const items = G.mapItems(wt, tm, state.view);
    if (!items.some((x) => x.code === state.sel)) state.sel = (items[0] || {}).code || "";
    G.drawMap($("map"), items, { interactive: true, selected: state.sel });
    const basis = state.view === "europa" ? "europeo MSCI Europe" : "mondiale MSCI ACWI";
    const when = tm && tm.asOf ? " Dati: " + (tm.label ? lowFirst(tm.label) + ", " : "") + G.when(tm.asOf) + "." : "";
    $("map-sub").textContent = "Ogni quadrato è una Borsa: più è grande, più pesa nell'indice " + basis + ". Verde se l'ultima seduta è salita, rosso se è scesa." + when;
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    renderDetail(items);
    if (focusSel) { const b = $("map").querySelector('[data-code="' + state.sel + '"]'); if (b) b.focus(); }
  }
  function setView(v) { state.view = v; G.ls.set("gerico.mapView", v); drawMap(); }
  $("map").addEventListener("click", (e) => {
    const b = e.target.closest("[data-code]");
    if (!b) return;
    state.sel = b.dataset.code;
    G.ls.set("gerico.mapSel", state.sel);
    drawMap(true);
  });
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  if (window.ResizeObserver) {
    let rt;
    new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => drawMap(false), 100); }).observe($("map"));
  }

  // ---------- pannelli ----------
  const cls = (key) => ((mk && mk.classes) || []).find((c) => c.key === key);
  function table(key, cols, target, extraNote) {
    const c = cls(key);
    if (!mk) { $(target).innerHTML = '<p class="t-na">Dati di mercato non disponibili.</p>'; return; }
    if (!c || !(c.items || []).length) { $(target).innerHTML = '<p class="t-na">' + esc((c && c.note) || "Nessun dato verificato in questo aggiornamento.") + "</p>"; return; }
    const rows = c.items.map((it) => {
      const tone = G.tone(it, key);
      const mv = typeof it.chg === "number" ? G.pctBare(it.chg) : typeof it.bp === "number" ? G.bps(it.bp).replace(" pb", "") : "";
      return '<tr><th scope="row">' + esc(G.shortName(it.name)) + (it.note ? "<small>" + esc(it.note) + "</small>" : "") + "</th><td>" +
        esc(G.cleanValue(it.value)) + '</td><td class="mv' + (tone ? " t-" + tone : "") + '">' + esc(mv) + "</td></tr>";
    }).join("");
    $(target).innerHTML = '<table class="t-table"><thead><tr><th scope="col">' + cols[0] + '</th><th scope="col">' + cols[1] + '</th><th scope="col">' + cols[2] +
      "</th></tr></thead><tbody>" + rows + "</tbody></table>" + (c.note ? '<p class="t-note">' + esc(c.note) + "</p>" : "") + (extraNote ? '<p class="t-note">' + extraNote + "</p>" : "");
  }

  function renderAgenda() {
    if (!ag || !(ag.items || []).length) { $("ag").innerHTML = '<p class="t-na">L\'agenda di oggi non è ancora disponibile.</p>'; return; }
    const today = !ag.date || String(ag.date).slice(0, 10) === G.dayKey(new Date());
    const now = G.romeNow().hm;
    const items = ag.items.slice().sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99")));
    const next = today ? items.find((it) => it.impact === "alto" && it.time && it.time >= now) : null;
    $("next").innerHTML = next ? "Prossimo ad alto impatto: <b>" + esc(next.time + " " + (next.currency || "")) + "</b>" : "";
    $("ag-h").textContent = today ? "Agenda di oggi" : "Agenda del " + G.dayOnly(ag.date);
    $("ag").innerHTML = '<ol class="t-agenda">' + items.map((it) => {
      const past = today && it.time && it.time < now;
      const nums = [it.expected ? "atteso " + it.expected : "", it.previous ? "precedente " + it.previous : "", it.actual ? "effettivo " + it.actual : ""].filter(Boolean).join(" · ");
      const imp = ["alto", "medio", "basso"].includes(it.impact) ? it.impact : "";
      return '<li class="' + (past ? "past " : "") + (imp === "alto" ? "hi" : "") + '"><span class="tm">' + esc(it.time || "—") + "</span><span>" + esc(it.currency || "") +
        '</span><span class="ev">' + esc(it.event) + (nums ? "<small>" + esc(nums) + "</small>" : "") + '</span><span class="im ' + imp + '">' + esc(G.cap(imp)) + "</span></li>";
    }).join("") + "</ol>" + (ag.note ? '<p class="t-note">' + esc(ag.note) + "</p>" : "");
  }

  function renderNews() {
    const st = ((ed && ed.stories) || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 8);
    if (!st.length) { $("nw").innerHTML = '<p class="t-na">Nessuna notizia disponibile.</p>'; return; }
    $("nw").innerHTML = '<ul class="t-news">' + st.map((s) => {
      const n = (s.sources || []).length, a = G.counts(s.sources).allineata;
      return '<li><a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + '</a><span class="ag">' + a + " su " + n + " concordano</span></li>";
    }).join("") + "</ul>";
  }

  function renderStatus() {
    const asOf = (tm && tm.asOf) || (mk && mk.asOf);
    $("st-data").textContent = asOf ? "Dati di mercato: " + (mk && mk.label ? lowFirst(mk.label) + ", " : "") + G.when(asOf) : "Dati di mercato non disponibili";
    $("st-next").textContent = "Prossimo aggiornamento: " + G.nextUpdate();
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
  table("indici", ["Indice", "Ultimo", "Var. %"], "ix");
  table("valute", ["Coppia", "Ultimo", "Var. %"], "fx");
  table("obbligazioni", ["Titolo", "Rendimento", "Punti base"], "rt", "Rosso: rendimenti in salita, cioè prezzi in calo.");
  table("materie", ["Materia prima", "Ultimo", "Var. %"], "cm");
  renderAgenda();
  renderNews();
  renderStatus();
})();
