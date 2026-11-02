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
  // curva con un filo di rimbalzo, cubic-bezier: Safari la anima da solo, senza il thread della pagina (con linear() no)
  const SNAP = "cubic-bezier(0.3, 1.2, 0.5, 1)";
  // l'origine si fissa sull'elemento per la durata dell'animazione: nei fotogrammi si muovono solo transform e opacity
  const withOrigin = (el, origin, a) => {
    el.style.transformOrigin = origin;
    const clear = () => { el.style.transformOrigin = ""; };
    a.finished.then(clear, clear);
  };
  // le posizioni dei quadrati arrivano dal calcolo della mappa: nessuna lettura dal layout, nessun ricalcolo forzato
  const byCode = (rects) => { const m = {}; (rects || []).forEach((r) => { m[r.code] = r; }); return m; };
  let lastRects = null;
  function flip(before, now) {
    $("map").querySelectorAll(".tile").forEach((el) => {
      const a = before[el.dataset.code], b = now[el.dataset.code];
      if (!b) return;
      if (!a) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" }); return; }
      if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1) return;
      withOrigin(el, "0 0", el.animate([
        { transform: "translate(" + (a.x - b.x) + "px, " + (a.y - b.y) + "px) scale(" + (a.w / b.w).toFixed(4) + ", " + (a.h / b.h).toFixed(4) + ")" },
        { transform: "none" }
      ], { duration: 420, easing: SNAP }));
    });
  }
  function placeRing(instant, now) {
    const ring = $("ring"), r = now[state.sel];
    if (!ring) return;
    if (!r) { ring.style.opacity = "0"; return; }
    if (instant) ring.classList.remove("ready");
    ring.style.left = r.x + "px";
    ring.style.top = r.y + "px";
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
      // la mappa cresce dal centro: ogni quadrato parte rimpicciolito verso il centro, prima quelli vicini (al massimo 240 ms di scarto)
      if (!G.reduced() && rects.length) {
        const map = $("map"), cx = map.clientWidth / 2, cy = map.clientHeight / 2, far = Math.hypot(cx, cy) || 1;
        G.afterIntro(() => {
          map.querySelectorAll(".tile").forEach((el) => {
            const r = now[el.dataset.code];
            if (!r) return;
            const d = Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy) / far;
            withOrigin(el, (cx - r.x).toFixed(1) + "px " + (cy - r.y).toFixed(1) + "px",
              el.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }], { duration: 560, delay: Math.round(d * 240), easing: SNAP, fill: "backwards" }));
          });
          if ($("ring")) $("ring").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 520, fill: "backwards" });
        });
      }
    }
    if (before) flip(before, now);
    placeRing(!how, now);
    const basis = state.view === "europa" ? "europeo MSCI Europe" : "mondiale MSCI ACWI";
    $("map-sub").textContent = "Ogni quadrato è una Borsa: più è grande, più pesa nell'indice " + basis + ".";
    // sotto la mappa tutte le variazioni in chiaro, con un'area da toccare comoda anche per i quadrati piccoli.
    // Per i lettori di schermo bastano i quadrati, che hanno già nome e variazione: qui niente doppioni.
    $("vals").innerHTML = items.map((it) => {
      const has = typeof it.chg === "number";
      return '<button type="button" tabindex="-1" data-code="' + it.code + '" aria-pressed="' + (it.code === state.sel) + '"><span class="c">' + it.code + "</span>" +
        '<span class="v' + (has ? (it.chg > 0 ? " t-up" : it.chg < 0 ? " t-down" : "") : " nd") + '">' + (has ? G.pct(it.chg) : "n.d.") + "</span></button>";
    }).join("");
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    requestAnimationFrame(() => G.seg(document.querySelector(".t-seg")));
    renderDetail(items);
    if (focusSel) { const b = $("map").querySelector('[data-code="' + state.sel + '"]'); if (b) b.focus(); }
  }
  function setView(v) { if (v === state.view) return; state.view = v; G.ls.set("gerico.mapView", v); drawMap(false, "flip"); }
  const pickTile = (e) => {
    const b = e.target.closest("[data-code]");
    if (!b) return;
    state.sel = b.dataset.code;
    G.ls.set("gerico.mapSel", state.sel);
    drawMap(e.currentTarget.id === "map", "select");
  };
  $("map").addEventListener("click", pickTile);
  $("vals").addEventListener("click", pickTile);
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

  // le percentuali delle tabelle contano fino al valore, una volta sola all'apertura (le cifre hanno tutte la stessa larghezza).
  // Nella mappa no: i quadrati stanno già crescendo, e cambiare testo a ogni fotogramma li ridisegnerebbe tutti.
  function countUp(root) {
    if (G.reduced()) return;
    const els = Array.from(root.querySelectorAll("[data-n]")).filter((el) => isFinite(Number(el.dataset.n)) && !el.closest("#map"));
    if (!els.length) return;
    const final = els.map((el) => el.textContent);
    const fmt = { pct: (v) => G.pctBare(v), "pct%": (v) => G.pct(v), bp: (v) => G.bps(Math.round(v)).replace(" pb", "") };
    const t0 = performance.now(), D = 700;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3);
      els.forEach((el, i) => { el.textContent = p < 1 ? (fmt[el.dataset.f] || String)(Number(el.dataset.n) * e) : final[i]; });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
    if (!c || !(c.items || []).length) { $(target).innerHTML = '<p class="t-na t-warn">' + esc((c && c.note) || "Nessun dato verificato in questo aggiornamento.") + "</p>"; return; }
    const common = commonNote(c.items);
    const notes = c.items.map((it) => ownNote(it.note, common));
    const rows = c.items.map((it, i) => {
      const tone = G.tone(it, key);
      const mv = typeof it.chg === "number" ? G.pctBare(it.chg) : typeof it.bp === "number" ? G.bps(it.bp).replace(" pb", "") : "";
      const num = typeof it.chg === "number" ? ' data-n="' + it.chg + '" data-f="pct"' : typeof it.bp === "number" ? ' data-n="' + it.bp + '" data-f="bp"' : "";
      return '<tr><th scope="row">' + esc(G.shortName(it.name)) + (notes[i] ? "<small>" + esc(notes[i]) + "</small>" : "") + "</th><td>" +
        esc(G.cleanValue(it.value)) + '</td><td class="mv' + (tone ? " t-" + tone : "") + '"' + num + ">" + esc(mv) + "</td></tr>";
    }).join("");
    // con il testo molto grande la tabella scorre di lato da sola, la pagina no
    $(target).innerHTML = (common ? '<p class="t-common">' + esc(common) + (notes.some(Boolean) ? ", salvo dove indicato" : "") + "</p>" : "") + '<div class="t-scroll"><table class="t-table"><thead><tr><th scope="col">' + cols[0] + '</th><th scope="col">' + cols[1] + '</th><th scope="col">' + cols[2] +
      "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" + (c.note ? '<p class="t-note">' + esc(c.note) + "</p>" : "") + (extraNote ? '<p class="t-note">' + extraNote + "</p>" : "");
  }

  function renderAgenda() {
    if (!ag || !(ag.items || []).length) { $("ag").innerHTML = '<p class="t-na">L\'agenda di oggi non è ancora disponibile.</p>'; return; }
    const today = !ag.date || String(ag.date).slice(0, 10) === G.dayKey(new Date());
    const now = G.romeNow().hm;
    const items = ag.items.slice().sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99")));
    const next = today ? items.find((it) => it.impact === "alto" && it.time && it.time >= now) : null;
    // quanto manca al prossimo evento ad alto impatto (si aggiorna ogni 30 secondi)
    let left = "", soon = false;
    if (next) {
      const [hh, mm] = String(next.time).split(":").map(Number);
      const mins = hh * 60 + mm - G.romeNow().min;
      soon = mins <= 15;
      left = mins <= 0 ? "adesso" : mins < 60 ? "tra " + mins + " min" : "tra " + Math.floor(mins / 60) + " h " + String(mins % 60).padStart(2, "0") + " min";
    }
    $("next").classList.toggle("soon", soon);
    $("next").innerHTML = next ? "Prossimo ad alto impatto: <b>" + esc(next.time + " " + (next.currency || "")) + "</b> · " + esc(left) : "";
    $("ag-h").textContent = today ? "Agenda di oggi" : "Agenda del " + G.dayOnly(ag.date);
    // un'agenda vecchia o troppo corta si dice in chiaro: chi la usa per i dati ad alto impatto deve saperlo
    const wd = G.romeNow().wd;
    const warn = !today ? "L'agenda di oggi non è ancora arrivata: questa è quella del " + G.dayOnly(ag.date) + "."
      : wd >= 1 && wd <= 5 && items.length < 3 ? "Agenda forse incompleta: oggi ha " + (items.length === 1 ? "una voce sola" : "solo " + items.length + " voci") + ". Controlla gli orari dei dati ad alto impatto su un calendario economico." : "";
    $("ag").innerHTML = (warn ? '<p class="t-na t-warn">' + esc(warn) + "</p>" : "") + '<ol class="t-agenda">' + items.map((it) => {
      const past = today && it.time && it.time < now;
      const nums = [it.expected ? "atteso " + it.expected : "", it.previous ? "precedente " + it.previous : "", it.actual ? "effettivo " + it.actual : ""].filter(Boolean).join(" · ");
      const imp = ["alto", "medio", "basso"].includes(it.impact) ? it.impact : "";
      return '<li class="' + (past ? "past " : "") + (imp === "alto" ? "hi" : "") + (it === next ? " next" + (soon ? " soon" : "") : "") + '"><span class="tm">' + esc(it.time || "—") + "</span><span>" + esc(it.currency || "") +
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
      const n = G.outlets(s.sources).length, a = G.counts(s.sources).allineata;
      return '<li><a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + '</a><span class="ag">' + a + " su " + n + " concordano</span></li>";
    }).join("") + "</ul>";
  }

  function renderStatus() {
    const asOf = (tm && tm.asOf) || (mk && mk.asOf);
    $("st-line").textContent = (asOf ? "Aggiornato " + G.when(asOf) : "Dati non disponibili") + " · prossimo " + G.nextUpdate();
    // la data dei dati sta sotto la mappa, in una riga già riservata: nessun salto quando arriva
    if (asOf) {
      const stale = G.hoursAgo(asOf) > 30, w = G.when(asOf);
      $("asof").textContent = stale ? "Dati del " + G.day(asOf) + ", non ancora aggiornati"
        : /^alle /.test(w) ? "Dati delle " + w.slice(5) : /^il /.test(w) ? "Dati del " + w.slice(3) : "Dati di " + w;
      $("asof").classList.toggle("stale", stale);
    }
  }

  // ---------- dati del job «Dati del Terminal»: prezzi e grafici (yfinance), macro (FRED), tono delle notizie (FinBERT), SEC ----------
  // pannello senza dati: sparisce, con il suo tasto
  const hide = (panel, cmd) => {
    $(panel).hidden = true;
    const k = document.querySelector('[data-cmd="' + cmd + '"]');
    if (k) k.hidden = true;
  };
  // da dove vengono i dati e quando: se l'ultimo aggiornamento non è riuscito si dice, con l'ora dei dati che restano
  function srcLine(id, d, label) {
    const stale = G.hoursAgo(d.asOf) > 30;
    let t = label + (d.asOf ? " · " + (stale ? "dati del " + G.day(d.asOf) : "aggiornato " + G.when(d.asOf)) : "");
    if (d.lastError && d.lastError.at) t += ". L'ultimo aggiornamento, " + G.when(d.lastError.at) + ", non è riuscito: restano i dati di prima.";
    $(id).textContent = t;
    $(id).classList.toggle("stale", stale || !!d.lastError);
  }
  const ext = (url, text) => '<a href="' + esc(G.safeUrl(url)) + '" target="_blank" rel="noopener">' + esc(text) + '<span class="sr-only"> (si apre in un\'altra scheda)</span></a>';
  let uid = 0;
  // riga che si apre: un pulsante e un pannello sotto (stessa animazione delle schede della storia)
  const opener = (cls, inner, body) => {
    const id = "x" + ++uid;
    return '<button type="button" class="' + cls + '" aria-expanded="false" aria-controls="' + id + '">' + inner + "</button>" +
      '<div class="collapse" id="' + id + '" inert>' + body + "</div>";
  };

  // prezzi e grafici: un gruppo alla volta, ogni riga si apre sul grafico grande di tre mesi
  const GROUP = { indici: "Indici", valute: "Valute", tassi: "Tassi Usa", materie: "Materie prime", cripto: "Cripto" };
  let quotes = null, grKey = G.ls.get("gerico.grGroup", "valute");
  function quoteRow(it, rates) {
    const d = rates ? it.bp : it.chg;
    const good = typeof d === "number" ? (rates ? -d : d) : 0;
    const first = (it.spark || [])[0];
    const trend = typeof first === "number" ? (rates ? first - it.last : it.last - first) : 0;
    const tr = trend > 0 ? "t-up" : trend < 0 ? "t-down" : "";
    const mv = typeof d !== "number" ? "n.d." : rates ? G.signed(d, 1) + " pb" : G.pct(d);
    const val = typeof it.last !== "number" ? "n.d." : rates ? G.num(it.last, 2) + "%" : G.price(it.sym, it.last);
    const per = (k) => { const v = it[(rates ? "bp" : "chg") + k]; return typeof v !== "number" ? "n.d." : rates ? G.signed(v, 1) + " pb" : G.pct(v); };
    const big = '<div class="q-more"><span class="' + tr + '">' + G.spark(it.spark, 320, 112, "sp-big", true) + "</span>" +
      '<p class="q-range"><span>' + esc(G.dayOnly(it.sparkFrom)) + "</span><span>" + esc(G.dayOnly(it.date)) + "</span></p>" +
      '<dl class="q-stats"><div><dt>1 settimana</dt><dd>' + per("1w") + "</dd></div><div><dt>1 mese</dt><dd>" + per("1m") + "</dd></div><div><dt>3 mesi</dt><dd>" + per("3m") + "</dd></div>" +
      "<div><dt>Massimo</dt><dd>" + (typeof it.hi === "number" ? (rates ? G.num(it.hi, 2) + "%" : G.price(it.sym, it.hi)) : "n.d.") + "</dd></div>" +
      "<div><dt>Minimo</dt><dd>" + (typeof it.lo === "number" ? (rates ? G.num(it.lo, 2) + "%" : G.price(it.sym, it.lo)) : "n.d.") + "</dd></div></dl>" +
      '<p class="t-note">' + (it.at ? "Ultimo prezzo " + esc(G.when(it.at)) + ". " : "") + ext(it.url, "Vedi su Yahoo Finance") + "</p></div>";
    return '<li class="q" data-sym="' + esc(it.sym) + '">' + opener("q-row",
      '<span class="q-n">' + esc(it.name) + (it.stale ? "<small>fermo al " + esc(G.dayOnly(it.date)) + "</small>" : "") + '</span><span class="q-sp ' + tr + '">' + G.spark(it.spark, 72, 24, "sp") + "</span>" +
      '<span class="q-v">' + esc(val) + '</span><span class="q-c ' + (good > 0 ? "t-up" : good < 0 ? "t-down" : "") + '">' + esc(mv) + "</span>", big) + "</li>";
  }
  function drawGroup(openSym) {
    const g = quotes.groups.find((x) => x.key === grKey) || quotes.groups[0];
    const rates = g.key === "tassi";
    $("gr").innerHTML = '<p class="q-head" aria-hidden="true"><span>Strumento</span><span>3 mesi</span><span>Ultimo</span><span>Oggi</span></p><ul class="q-list">' +
      g.items.map((it) => quoteRow(it, rates)).join("") + "</ul>" +
      (rates ? '<p class="t-note">Rendimenti dei titoli di Stato Usa. Rosso: rendimenti in salita, cioè prezzi in calo.</p>' : "");
    if (openSym) {
      const li = $("gr").querySelector('[data-sym="' + CSS.escape(openSym) + '"] .q-row');
      if (li) G.toggle(li, true);
    }
  }
  function renderQuotes(qt) {
    const groups = ((qt && qt.groups) || []).filter((g) => (g.items || []).length);
    if (!groups.length) return hide("p-grafici", "GRAFICI");
    quotes = { groups };
    if (!groups.some((g) => g.key === grKey)) grKey = groups[0].key;
    srcLine("gr-src", qt, "Yahoo Finance, tramite yfinance. Grafici di tre mesi, una chiusura al giorno");
    $("gr-tabs").innerHTML = groups.map((g) => '<button type="button" data-g="' + g.key + '" aria-pressed="' + (g.key === grKey) + '">' + esc(GROUP[g.key] || g.label) + "</button>").join("");
    G.seg($("gr-tabs"), true);
    drawGroup();
    $("gr-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (!b || b.dataset.g === grKey) return;
      grKey = b.dataset.g;
      G.ls.set("gerico.grGroup", grKey);
      $("gr-tabs").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      G.seg($("gr-tabs"));
      drawGroup();
    });
  }
  // un nome o un simbolo scritto nel campo dei comandi («eurusd», «oro», «s&p 500») apre il suo grafico
  const norm = (s) => String(s || "").toUpperCase().replace(/=X$/, "").replace(/[^A-Z0-9]/g, "");
  function findQuote(c) {
    if (!quotes) return null;
    const k = norm(c);
    if (k.length < 2) return null;
    for (const g of quotes.groups) for (const it of g.items) if (norm(it.sym) === k || norm(it.name) === k) return { g: g.key, it };
    return null;
  }

  // macro: le serie della Fed di St. Louis, ognuna con il dato, la data e il grafico; il riquadro porta alla serie su FRED
  const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const macroDate = (s) => {
    const d = String(s || "");
    return /^\d{4}-\d{2}/.test(d) ? MONTHS[Number(d.slice(5, 7)) - 1] + " " + d.slice(0, 4) : "";
  };
  function macroVal(s, v) {
    if (typeof v !== "number") return "n.d.";
    if (s.unit === "%") return G.num(v, s.freq === "m" ? 1 : 2) + "%";
    if (s.unit === "pp") return G.signed(v, 2) + " punti";
    if (s.unit === "mila") return (s.id === "PAYEMS" ? G.signed(v, 0) : G.num(v, 0)) + " mila";
    return G.num(v, 2);
  }
  function renderMacro(mc) {
    const ss = (mc && mc.series) || [];
    if (!ss.length) return hide("p-macro", "MACRO");
    srcLine("mc-src", mc, "FRED, Fed di St. Louis");
    $("mc").innerHTML = '<div class="m-grid">' + ss.map((s) => {
      const when = s.freq === "m" ? "dato di " + macroDate(s.date) : s.freq === "s" ? "settimana al " + G.dayOnly(s.date) : G.dayOnly(s.date);
      return '<a class="m-card" href="' + esc(G.safeUrl(s.url)) + '" target="_blank" rel="noopener"><span class="m-n">' + esc(s.name) + "</span>" +
        '<span class="m-v">' + esc(macroVal(s, s.last)) + '</span><span class="m-d">' + esc(when) + " · prima " + esc(macroVal(s, s.prev)) + "</span>" +
        '<span class="m-sp">' + G.spark(s.spark, 120, 28, "sp") + '</span><span class="sr-only"> (apre la serie ' + esc(s.id) + " su FRED)</span></a>";
    }).join("") + '</div><p class="t-note">Inflazione: variazione sullo stesso mese dell\'anno prima. Posti di lavoro: nuovi posti nel mese, in migliaia.</p>';
  }

  // tono delle notizie: per ogni mercato quanti titoli FinBERT legge come positivi, neutri o negativi
  const LAB = { positive: ["positivo", "l-pos"], negative: ["negativo", "l-neg"], neutral: ["neutro", "l-neu"] };
  function renderSentiment(se) {
    const as = ((se && se.assets) || []).filter((a) => a && a.n);
    if (!as.length) return hide("p-sentiment", "SENTIMENT");
    srcLine("se-src", se, "Titoli di Yahoo Finance delle ultime " + (se.hours || 72) + " ore, tono calcolato da FinBERT");
    $("se").innerHTML = '<ul class="s-list">' + as.map((a) => {
      const pp = (a.pos / a.n) * 100, ng = (a.neg / a.n) * 100;
      const tone = a.score > 0.15 ? ["più positivo", "t-up"] : a.score < -0.15 ? ["più negativo", "t-down"] : ["misto", ""];
      const news = (a.news || []).map((n) => {
        const l = LAB[n.label] || LAB.neutral;
        return '<li><span class="s-lab ' + l[1] + '">' + l[0] + "</span>" + ext(n.url, n.title) + "<small>" + esc([n.publisher, G.when(n.at)].filter(Boolean).join(" · ")) + "</small></li>";
      }).join("");
      return "<li>" + opener("s-row",
        '<span class="s-n">' + esc(a.name) + "<small>" + a.n + (a.n === 1 ? " titolo" : " titoli") + "</small></span>" +
        '<span class="s-bar" aria-hidden="true"><i class="b-pos" style="width:' + pp.toFixed(1) + '%"></i><i class="b-neu" style="width:' + (100 - pp - ng).toFixed(1) + '%"></i><i class="b-neg" style="width:' + ng.toFixed(1) + '%"></i></span>' +
        '<span class="s-t ' + tone[1] + '">' + tone[0] + '</span><span class="sr-only">: ' + a.pos + " positivi, " + a.neu + " neutri, " + a.neg + " negativi</span>",
        '<ul class="s-news">' + news + "</ul>") + "</li>";
    }).join("") + '</ul><p class="t-note">Verde i titoli positivi, grigio i neutri, rosso i negativi. FinBERT è un modello per testi finanziari in inglese: legge solo il titolo e sbaglia con ironia, domande e titoli acchiappaclic. Dice il tono delle notizie, non dove andrà il prezzo.</p>';
  }

  // documenti SEC: gli ultimi depositati da un gruppo di grandi società Usa
  function renderSec(sc) {
    if (!sc || !Array.isArray(sc.filings)) return hide("p-sec", "SEC");
    srcLine("sc-src", sc, "SEC EDGAR, ultimi " + (sc.days || 30) + " giorni, " + ((sc.companies || []).length || "alcune") + " grandi società Usa");
    $("sc").innerHTML = sc.filings.length ? '<ol class="sec-list">' + sc.filings.slice(0, 25).map((f) =>
      '<li><span class="sec-d">' + esc(G.dayOnly(f.date)) + '</span><span class="sec-k">' + esc(f.ticker) + "</span>" +
      '<span class="sec-b">' + ext(f.url, f.company + ": " + f.what) + "<small>" + esc(f.form) + "</small></span></li>").join("") + "</ol>"
      : '<p class="t-na">Nessun documento negli ultimi giorni.</p>';
  }
  // le righe che si aprono, in tutti i pannelli nuovi
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".q-row, .s-row");
    if (b) G.toggle(b);
  });

  // ---------- sezioni, comandi e tasti funzione ----------
  const PANELS = { MAPPA: "map-panel", INDICI: "p-indici", VALUTE: "p-valute", TASSI: "p-tassi", MATERIE: "p-materie", "MATERIE PRIME": "p-materie", AGENDA: "p-agenda", NOTIZIE: "p-notizie",
    GRAFICI: "p-grafici", PREZZI: "p-grafici", MACRO: "p-macro", FRED: "p-macro", SENTIMENT: "p-sentiment", FINBERT: "p-sentiment", TONO: "p-sentiment", SEC: "p-sec", EDGAR: "p-sec" };
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
    else if (PANELS[c] && !$(PANELS[c]).hidden) go(PANELS[c]);
    else {
      const q = findQuote(c);
      if (q) {
        if (q.g !== grKey) { grKey = q.g; $("gr-tabs").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.g === grKey))); G.seg($("gr-tabs"), true); }
        drawGroup(q.it.sym);
        go("p-grafici");
      } else ok = false;
    }
    $("cmd-help").textContent = ok ? "" : "Non trovato. Prova: mappa europa, valute, agenda, grafici, macro, sentiment, sec, oppure un simbolo come eurusd, oro, bitcoin.";
  }
  $("cmd-form").addEventListener("submit", (e) => { e.preventDefault(); run($("cmd").value); $("cmd").value = ""; });
  document.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => run(b.dataset.cmd)));
  const FKEYS = { F1: "MAPPA", F2: "INDICI", F3: "VALUTE", F4: "TASSI", F5: "MATERIE PRIME", F6: "AGENDA", F7: "NOTIZIE", F8: "GRAFICI", F9: "MACRO", F10: "SENTIMENT" };
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
  // i dati del job arrivano dopo: stanno più in basso e non devono ritardare la mappa
  Promise.all([G.load("quotes"), G.load("macro"), G.load("sentiment"), G.load("sec")]).then(([qt, mc, se, sc]) => {
    [[renderQuotes, qt], [renderMacro, mc], [renderSentiment, se], [renderSec, sc]].forEach(([fn, d]) => {
      try { fn(d); } catch (e) { /* un pannello rotto non ferma gli altri */ }
    });
  });
  renderStatus();
  G.afterIntro(() => countUp(document.body));
})();
