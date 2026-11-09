/* GERICO Terminal: mappa a quadrati, pannelli, scorciatoie da tastiera (F1-F9) e comandi, prezzi in diretta al clic. */
G.page("terminal", async function (P) {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);
  G.initPrefs();

  // ---------- orologio ----------
  const tick = () => { $("clock").textContent = G.L("Roma, ", "Rome, ") + G.romeNow().hm; };
  tick();
  P.every(tick, 30000);

  // legenda: una barra sola da −1% a +1%, i colori sono quelli dei quadrati (non dipende dai dati: subito, senza salti).
  // Dentro un indice i titoli si muovono di più: la stessa barra va da −2% a +2%
  const stops = G.BANDS.map(([c], k) => c + " " + ((2 * k + 1) * 100 / 12).toFixed(2) + "%").join(", ");
  const legendHTML = (k) => '<span class="t-grad" aria-hidden="true"><i style="background:linear-gradient(90deg, ' + stops + ')"></i>' +
    '<span class="t-ticks"><span style="left:16.67%">−' + k + '%</span><span style="left:50%">0</span><span style="left:83.33%">+' + k + "%</span></span></span>" +
    '<span class="t-nd"><i style="background:' + G.NO_DATA + '"></i>' + G.L("nessun dato", "no data") + "</span>" +
    '<span class="sr-only">' + (k === 1 ? G.L("Rosso se la Borsa è scesa, verde se è salita: più è intenso, più è ampia la variazione, fino a 1% o più. Grigio se oggi non c'è il dato.",
      "Red if the market fell, green if it rose: the stronger the colour, the bigger the move, up to 1% or more. Grey if there is no data today.")
      : G.L("Rosso se il titolo è sceso, verde se è salito: più è intenso, più è ampia la variazione, fino a 2% o più. Grigio se non c'è il dato.",
        "Red if the stock fell, green if it rose: the stronger the colour, the bigger the move, up to 2% or more. Grey if there is no data.")) + "</span>";
  $("legend").innerHTML = legendHTML(1);
  $("inlegend").innerHTML = legendHTML(2);

  // ---------- computer: due colonne, ognuna con i suoi pannelli uno sotto l'altro ----------
  // Le righe della griglia sono di 4 pixel (CSS .t-board.packed): ogni pannello ne occupa quante è alto, più lo spazio
  // tra i pannelli, e sta subito sotto quello prima nella sua colonna. Prima di un pannello largo quanto la pagina (la
  // macro) l'ultimo pannello della colonna più corta si allunga fino all'altra, se mancano pochi pixel: nessun buco.
  // Si rifà quando un pannello cambia altezza (dati arrivati, un indice aperto, una riga aperta). Sul telefono i
  // pannelli stanno uno sotto l'altro e non serve.
  const board = $("main"), wideQ = window.matchMedia ? matchMedia("(min-width: 1000px)") : null, U = 4;
  function pack() {
    const on = !!(wideQ && wideQ.matches), ps = Array.from(board.querySelectorAll(":scope > .t-panel")).filter((p) => !p.hidden);
    board.classList.toggle("packed", on);
    // prima tutte le scritture, poi tutte le letture: un solo ricalcolo della pagina
    ps.forEach((p) => { p.style.alignSelf = ""; p.style.marginBottom = ""; if (!on) p.style.gridRowEnd = ""; });
    if (!on) return;
    const gap = parseFloat(getComputedStyle(board).columnGap) || 21;
    const m = ps.map((p) => { const cs = getComputedStyle(p); return { p, rows: Math.max(1, Math.ceil((p.offsetHeight + gap) / U)), c: cs.gridColumnEnd === "-1" ? -1 : cs.gridColumnStart === "2" ? 1 : 0 }; });
    let h = [0, 0], last = [null, null];
    m.forEach((x) => {
      if (x.c >= 0) { h[x.c] += x.rows; last[x.c] = x; return; }
      const s = h[0] < h[1] ? 0 : 1, d = Math.abs(h[0] - h[1]);
      if (d && last[s] && d * U <= 320) { last[s].rows += d; last[s].grow = true; }
      h = [Math.max(h[0], h[1]) + x.rows, Math.max(h[0], h[1]) + x.rows];
      last = [null, null];
    });
    m.forEach((x) => {
      x.p.style.gridRowEnd = "span " + x.rows;
      if (x.grow) { x.p.style.alignSelf = "stretch"; x.p.style.marginBottom = gap + "px"; }
    });
  }
  // nella stessa fase del ridimensionamento: i pannelli sotto si spostano nello stesso fotogramma
  if (window.ResizeObserver) { const ro = P.keep(new ResizeObserver(pack)); board.querySelectorAll(":scope > .t-panel").forEach((p) => ro.observe(p)); }
  if (wideQ && wideQ.addEventListener) P.on(wideQ, "change", pack);
  pack();

  // tassi e agenda compaiono con i dati (più sotto); se qualcosa si rompe prima, compaiono comunque
  const showSide = () => { board.classList.add("ready"); };
  P.later(showSide, 2000);
  // anche le quotazioni del job: alla mappa servono per le Borse che mancano nella pubblicazione (è un file piccolo)
  const [ed, mk0, ag, tm, wt, qtFirst, ff, idxList] = await Promise.all([G.load("edition"), G.load("markets"), G.load("agenda"), G.load("terminal"), G.load("weights"), G.load("quotes"), G.load("calendario"), G.load("indici/elenco")]);
  // i numeri delle tabelle: quelli del job dei prezzi quando sono più freschi di quelli della redazione (G.withQuotes).
  // Cambiano a pagina aperta quando escono prezzi nuovi (G.liveQuotes, in fondo)
  let qt0 = qtFirst, mk = G.withQuotes(mk0, qt0);
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
  // il dettaglio della Borsa scelta: lo stesso markup per la pagina e per la vista accanto durante lo swipe
  function renderDetail(items) {
    $("detail").innerHTML = detailHTML(items, state.sel, state.view);
    const c = state.sel;
    if (ixInfo(c) && !(navigator.connection && navigator.connection.saveData)) P.later(() => { if (state.sel === c && !inside.code) G.load("indici/" + c); }, 700);
  }
  function detailHTML(items, sel, view) {
    const it = items.find((x) => x.code === sel);
    if (!it) return "<p>" + G.L("Tocca un quadrato per vedere il dettaglio.", "Tap a square to see the details.") + "</p>";
    const basis = view === "europa" ? "MSCI Europe" : "MSCI ACWI";
    const cg = typeof it.chg === "number"
      ? '<b class="' + (it.chg > 0 ? "t-up" : it.chg < 0 ? "t-down" : "") + '">' + G.pct(it.chg) + "</b>"
      : G.L("nessun dato oggi", "no data today");
    let html = "<p><b>" + esc(G.tn(it.name)) + "</b>" + (it.index ? ", " + esc(it.index) : "") + ": " + cg + G.L(". Peso ", ". Weight ") + G.wt(it.value) + G.L(" nell'indice ", " in the ") + basis + G.L(".", " index.") + "</p>";
    if (typeof it.last === "number") {
      const lv = [G.L("ultimo ", "last ") + G.price(it.sym, it.last)].concat(typeof it.open === "number" ? [G.L("apertura ", "open ") + G.price(it.sym, it.open)] : [], typeof it.prev === "number" ? [G.L("chiusura precedente ", "previous close ") + G.price(it.sym, it.prev)] : []);
      html += "<p>" + esc(G.cap(lv.join(" · "))) + ".</p>";
    }
    if (it.note) html += "<p>" + esc(it.note) + "</p>";
    else if (it.time) html += "<p>" + G.L("Dato delle ", "Data at ") + esc(it.time) + ".</p>";
    const s = linkedStory(it.code);
    if (s) html += "<p>" + G.L("Storia collegata: ", "Related story: ") + '<a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + "</a></p>";
    const ix = ixInfo(it.code);
    if (ix) {
      html += '<p class="t-inopen"><button type="button" class="t-btn t-inbtn" data-inside="' + it.code + '">' + G.L("Dentro ", "Inside ") + esc(theIx(ix.index)) +
        "<small>" + ix.n + G.L(" titoli", " stocks") + '</small><span class="ar" aria-hidden="true">›</span></button></p>';
    }
    return html;
  }
  // sotto la mappa solo le Borse con il quadrato troppo piccolo per scriverci la variazione (le altre si leggono già nel
  // quadrato), con un'area da toccare comoda. Per i lettori di schermo bastano i quadrati, che hanno nome e variazione.
  // Le soglie sono quelle di G.drawMap: la variazione compare nei quadrati grandi, medi e piccoli larghi almeno 46 px
  const readable = (r) => (r.w >= 90 && r.h >= 56) || (r.w >= 46 && r.h >= 30);
  const valsHTML = (items, sel, rects) => {
    const small = new Set((rects || []).filter((r) => typeof r.chg === "number" && !readable(r)).map((r) => r.code));
    return items.filter((it) => small.has(it.code)).map((it) =>
      '<button type="button" tabindex="-1" data-code="' + it.code + '" aria-pressed="' + (it.code === sel) + '"><span class="c">' + it.code + "</span>" +
      '<span class="v' + (it.chg > 0 ? " t-up" : it.chg < 0 ? " t-down" : "") + '">' + G.pct(it.chg) + "</span></button>").join("");
  };
  const subText = (view) => G.en ? "Each square is a stock market: the bigger it is, the more it weighs in the " + (view === "europa" ? "MSCI Europe index" : "MSCI ACWI world index") + "."
    : "Ogni quadrato è una Borsa: più è grande, più pesa nell'indice " + (view === "europa" ? "europeo MSCI Europe" : "mondiale MSCI ACWI") + ".";
  // la Borsa scelta in una vista: se lì non c'è, la più grande
  const selIn = (items, sel) => (items.some((x) => x.code === sel) ? sel : (items[0] || {}).code || "");
  // movimento della mappa: i quadrati compaiono con una dissolvenza, cambiando vista scivolano (FLIP), l'anello segue la scelta
  // curva che parte svelta e si posa piano, cubic-bezier: Safari la anima da solo, senza il thread della pagina (con linear() no)
  const SNAP = "cubic-bezier(0.32, 0.72, 0, 1)";
  // ---------- altezze che cambiano (vista della mappa, gruppo di grafici, dettaglio) ----------
  // Quello che sta sotto non salta mai: lo spazio passa dall'altezza di prima a quella nuova con un movimento morbido.
  // easeHeight: il contenuto nuovo è già dentro, h0 è l'altezza di prima
  // più è grande il cambio di altezza, più dura (sempre con la stessa curva): un salto di mille pixel non deve sembrare
  // uno scatto
  // con una curva morbida all'inizio e alla fine: lo spazio non ha la spinta del dito
  const hDur = (D, dh) => Math.min(900, Math.max(D, 300 + Math.abs(dh) * 0.4));
  const SOFT = "cubic-bezier(0.45, 0, 0.2, 1)";
  function easeHeight(el, h0, D, ease) {
    if (!el || G.reduced()) return;
    const h1 = el.offsetHeight;
    if (Math.abs(h1 - h0) < 1) return;
    if (el._hA) el._hA.cancel();
    el.style.overflow = "hidden";
    const a = el._hA = el.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: hDur(D || 420, h1 - h0), easing: ease || SOFT });
    const done = () => { if (el._hA === a) { el._hA = null; el.style.overflow = ""; } };
    a.finished.then(done, done);
  }
  // swipe: mentre il dito trascina, la vista accanto è ritagliata all'altezza di quella che esce. Lasciata andare verso
  // l'altra, lo spazio va all'altezza della nuova con la stessa molla del passaggio, e la vista accanto si apre intera:
  // all'arrivo il contenuto vero trova il suo posto già pronto (releaseHeight)
  function swipeHeight(el, peek, going, anim) {
    if (!el || !peek || !anim || !going || G.reduced()) return;
    const h0 = el.offsetHeight;
    peek.style.height = "";
    const h1 = peek.offsetHeight;
    peek.style.height = h0 + "px";
    if (Math.abs(h1 - h0) < 1) return;
    // per i cambi piccoli la stessa molla del passaggio; per quelli grandi più lunga, e finisce dopo l'arrivo (releaseHeight)
    const big = hDur(anim.D, h1 - h0) > anim.D;
    const o = big ? { duration: hDur(anim.D, h1 - h0), easing: SOFT, fill: "forwards" } : { duration: anim.D, easing: anim.ease, fill: "forwards" };
    if (el._hA) el._hA.cancel();
    el.style.overflow = "hidden";
    el._hA = el.animate([{ height: h0 + "px" }, { height: h1 + "px" }], o);
    peek.animate([{ height: h0 + "px" }, { height: h1 + "px" }], o);
  }
  // all'arrivo il contenuto vero è dentro: se lo spazio sta ancora cambiando, finisce il suo movimento e poi torna
  // all'altezza naturale (la stessa)
  function releaseHeight(el) {
    if (!el) return;
    const a = el._hA;
    const done = () => { if (el._hA === a) { if (a) a.cancel(); el._hA = null; el.style.overflow = ""; } };
    if (a && a.playState === "running") a.finished.then(done, done);
    else done();
  }
  // ---------- viste accanto pronte prima dello swipe ----------
  // A pagina ferma (mai mentre il dito è sullo schermo) la vista accanto si disegna nascosta, una per volta nei momenti
  // liberi: al primo movimento del dito c'è solo da metterla al suo posto. Se intanto è cambiato qualcosa (key), si rifà.
  // keyOf(d): che cosa sta da quella parte ("" se niente); build(d): l'elemento; place(el): posizione e altezza di adesso
  let touchingT = false, alive = true;
  P.on(document, "touchstart", () => { touchingT = true; }, { passive: true, capture: true });
  P.on(document, "touchend", () => { touchingT = false; }, { passive: true, capture: true });
  P.on(document, "touchcancel", () => { touchingT = false; }, { passive: true, capture: true });
  P.keep({ disconnect: () => { alive = false; } });
  function preparer(keyOf, build, place) {
    const ready = {};
    let timer = 0;
    const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 80));
    const drop = (d) => { if (ready[d]) { ready[d].el.remove(); delete ready[d]; } };
    const one = (d) => {
      const key = keyOf(d);
      if (ready[d] && ready[d].key === key) return;
      drop(d);
      if (!key) return;
      const el = build(d);
      if (el) { el.style.visibility = "hidden"; ready[d] = { key, el }; }
    };
    const run = (sides) => {
      if (!alive || !sides.length) return;
      if (touchingT || window.gericoVT) { timer = P.later(() => run(sides), 400); return; }
      one(sides[0]);
      if (sides.length > 1) idle(() => run(sides.slice(1)));
    };
    return {
      take(d) {
        const r = ready[d], key = keyOf(d);
        delete ready[d];
        let el = r && r.key === key ? r.el : null;
        if (r && !el) r.el.remove();
        if (!el) el = key ? build(d) : null;
        if (!el) return null;
        place(el);
        el.style.visibility = "";
        return el;
      },
      soon() {
        if (!("ontouchstart" in window) || G.reduced()) return;
        clearTimeout(timer);
        timer = P.later(() => idle(() => run([1, -1])), 500);
      },
      clear() { drop(1); drop(-1); }
    };
  }
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
      $("map-sub").textContent = G.L("I pesi della mappa non sono disponibili in questo momento.", "The map weights are not available right now.");
      $("map").innerHTML = "";
      $("detail").innerHTML = "";
      return;
    }
    const items = G.mapItems(wt, tm, state.view, qt0);
    state.sel = selIn(items, state.sel);
    const before = how === "flip" && !G.reduced() && lastRects ? byCode(lastRects) : null;
    const rects = G.drawMap($("map"), items, { interactive: true, selected: state.sel, enter: ixInfo }) || [];
    lastRects = rects;
    const now = byCode(rects);
    if (firstDraw) {
      firstDraw = false;
      // la mappa cresce dal centro: ogni quadrato parte rimpicciolito verso il centro, prima quelli vicini (al massimo 240 ms di scarto)
      if (!G.reduced() && !G.soft && rects.length) {
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
    if (!inside.code) $("map-sub").textContent = subText(state.view);
    $("vals").innerHTML = valsHTML(items, state.sel, rects);
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    requestAnimationFrame(() => G.seg(document.querySelector(".t-seg")));
    renderDetail(items);
    if (focusSel) { const b = $("map").querySelector('[data-code="' + state.sel + '"]'); if (b) b.focus(); }
    if (mapPrep) mapPrep.soon();
  }
  let mapSwipe = null, mapPrep = null;
  // toccando l'interruttore i quadrati si spostano da una vista all'altra; sotto, valori e dettaglio cambiano altezza piano
  function setView(v) {
    if (inside.code) leave();
    if (v === state.view) return;
    if (mapSwipe) mapSwipe.finish();
    const mv = $("mapview"), h0 = mv.offsetHeight;
    state.view = v; G.ls.set("gerico.mapView", v);
    drawMap(false, "flip");
    easeHeight(mv, h0, 420);
  }
  const pickTile = (e) => {
    const b = e.target.closest("[data-code]");
    if (!b) return;
    if (b.dataset.code === state.sel && ixInfo(b.dataset.code)) { enter(b.dataset.code, { push: true }); return; }
    const mv = $("mapview"), h0 = mv.offsetHeight;
    state.sel = b.dataset.code;
    G.ls.set("gerico.mapSel", state.sel);
    drawMap(e.currentTarget.id === "map", "select");
    easeHeight(mv, h0, 300);
  };
  $("map").addEventListener("click", pickTile);
  $("vals").addEventListener("click", pickTile);
  $("detail").addEventListener("click", (e) => { const b = e.target.closest("[data-inside]"); if (b) enter(b.dataset.inside, { push: true }); });
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  let size = "";
  if (window.ResizeObserver) {
    let rt;
    P.keep(new ResizeObserver(() => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const now = $("map").clientWidth + "x" + $("map").clientHeight;
        if (now !== size) { size = now; drawMap(false); }
      }, 100);
    })).observe($("map"));
  }

  // ---------- dentro l'indice: i titoli, quanto pesano e come vanno ----------
  // Dal dettaglio di una Borsa, o toccando di nuovo il suo quadrato, la mappa entra nell'indice: un quadrato per titolo,
  // grande quanto pesa, colorato come va. Sotto: quanti salgono e quanti scendono, chi ha spinto e chi ha frenato
  // l'indice, l'elenco dei titoli. I dati sono di scripts/indici.py (job «Dati del Terminal», quattro volte al giorno):
  // elenco dei titoli da Wikipedia, flottante e prezzi da Yahoo Finance. L'indirizzo diventa #indice-USA: il tasto
  // indietro, anche il gesto dal bordo di iOS, torna alla mappa delle Borse.
  const inside = { code: "", d: null, sel: "", sort: "peso", all: false, rects: [], mapIndex: "" };
  const mapTitle = $("map-h").textContent;
  const SECTOR_IT = { Technology: "Tecnologia", "Financial Services": "Finanza", Healthcare: "Salute", "Consumer Cyclical": "Consumi ciclici",
    "Communication Services": "Comunicazioni", Industrials: "Industria", "Consumer Defensive": "Consumi di base", Energy: "Energia",
    "Basic Materials": "Materiali", "Real Estate": "Immobiliare", Utilities: "Servizi pubblici" };
  const sectorName = (x) => (G.en ? x : SECTOR_IT[x] || x);
  const CUR = { USD: "$", EUR: "€", GBp: "p", GBX: "p", GBP: "£", JPY: "¥", CHF: "CHF", INR: "₹", CAD: "C$", BRL: "R$", KRW: "₩", TWD: "NT$", CNY: "¥" };
  // «348,59 $» in italiano, «$348.59» in inglese (pence: «1.234 p», «1,234p»)
  const stockPrice = (x, d) => {
    if (typeof x.p !== "number") return "";
    const v = G.num(x.p, x.p >= 1000 ? 0 : 2), c = CUR[x.k || d.cur] || x.k || d.cur || "";
    return !G.en ? v + " " + c : c === "p" ? v + "p" : /^[A-Z]{3}$/.test(c) ? c + " " + v : c + v;
  };
  const hasC = (x) => typeof x.c === "number";
  const upDown = (v) => (v > 0 ? "t-up" : v < 0 ? "t-down" : "");
  // pesi piccoli con tre decimali (0,052%), contributi piccoli anche
  const wtS = (w) => G.num(w, w >= 10 ? 1 : w >= 0.1 ? 2 : 3) + "%";
  const pts = (v) => G.signed(v, Math.abs(v) >= 0.01 ? 2 : 3);
  const ptsLong = (v) => (Math.abs(v) < 0.0005 ? G.L("quasi nullo", "close to zero") : pts(v) + G.L(" punti", " pp"));
  // il nome corto: la prima parola, o le prime due se la prima è corta («Banco BPM»)
  const firstWord = (n) => { const w = String(n || "").split(/\s+/); return w[0].length >= 4 || w.length < 2 ? w[0] : w[0] + " " + w[1]; };
  // nei quadrati piccoli la sigla, o il nome dove la sigla è un numero (Giappone, Corea, Taiwan)
  const stockTag = (x) => (/^\d/.test(x.t || "") ? firstWord(x.n) : x.t || x.s);
  function ixInfo(code) { return (idxList && idxList.indici && idxList.indici[code]) || null; }
  // «l'S&P 500», «il DAX»; «dell'AEX», «del FTSE MIB»
  const vowel = (n) => /^(S&P|SMI|AEX|[AEIOU])/i.test(n);
  function theIx(n) { return G.en ? "the " + n : (vowel(n) ? "l'" : "il ") + n; }
  const ofIx = (n) => (G.en ? "the " + n : (vowel(n) ? "dell'" : "del ") + n);
  const viewName = () => (state.view === "europa" ? G.L("Europa", "Europe") : G.L("Mondo", "World"));
  const isToday = (d) => !!d && d.date === G.dayKey(new Date());
  const quota = (d) => !!d && d.metodo === "quota";
  const weightWord = (d) => (quota(d) ? G.L("quota", "share") : G.L("peso", "weight"));
  const hashCode = () => { const m = /^#ind(?:ice|ex)-([A-Z]{3})$/.exec(location.hash); return m ? m[1] : ""; };

  // il primo testo che ci sta nel quadrato: misurato con il carattere vero (rem: grandezza del testo, room: spazio in pixel)
  const meas = document.createElement("canvas").getContext("2d");
  let REM = 16, FAM = "sans-serif";
  const fit = (texts, rem, room, weight) => texts.find((t) => {
    if (!t) return false;
    meas.font = (weight || 700) + " " + rem * REM + "px " + FAM;
    return meas.measureText(t).width <= room;
  }) || "";
  // i quadrati: tutti i titoli, tranne la coda di quelli che verrebbero più piccoli di 6 × 6 pixel, uniti in uno
  function stockTiles(d, W, H) {
    const xs = d.items;
    let n = xs.length;
    while (n > 10 && (xs[n - 1].w / 100) * W * H < 36) n -= 1;
    const tile = (x) => ({ code: x.s, st: x, value: x.w, chg: hasC(x) ? x.c : null });
    const tiles = xs.slice(0, n).map(tile), rest = xs.slice(n);
    if (rest.length === 1) tiles.push(tile(rest[0]));
    else if (rest.length) {
      const rc = rest.filter(hasC), sw = rc.reduce((a, x) => a + x.w, 0);
      tiles.push({ code: "_altri", rest, value: rest.reduce((a, x) => a + x.w, 0), chg: sw ? rc.reduce((a, x) => a + x.w * x.c, 0) / sw : null });
    }
    return tiles;
  }
  function drawStocks(el, d, sel) {
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return [];
    const rects = G.squarify(stockTiles(d, W, H), W, H), ww = weightWord(d);
    REM = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    FAM = getComputedStyle(el).fontFamily || FAM;
    el.innerHTML = rects.map((r) => {
      const has = typeof r.chg === "number", cg = has ? G.pct(r.chg) : "", x = r.st, rest = r.rest;
      const size = r.w >= 150 && r.h >= 92 ? "big" : r.w >= 80 && r.h >= 50 ? "med" : r.w >= 40 && r.h >= 30 ? "small" : r.w >= 24 && r.h >= 14 ? "tiny" : "none";
      const name = rest ? G.L("Altri ", "Other ") + rest.length : x.n, tag = rest ? G.L("Altri", "Other") : stockTag(x);
      // nei quadrati medi il nome, se ci sta, poi la prima parola, poi la sigla; in quelli piccoli la sigla solo se ci sta intera
      const num = !rest && /^\d/.test(x.t || "");
      const med = rest ? name : fit([x.n, firstWord(x.n), num ? "" : x.t], 0.875, r.w - 18) || (num ? firstWord(x.n) : x.t);
      const nm = (t) => (t ? '<span class="a"><span class="nm">' + esc(t) + "</span></span>" : "");
      // la variazione può arrivare fino al bordo del quadrato (il nome no: ha i puntini)
      const b = (rem, pad) => (has && fit([cg], rem, r.w - pad, 750) ? '<span class="b"><span class="cg">' + cg + "</span></span>" : "");
      const inner = size === "big" ? '<span class="a"><span class="nm">' + esc(name) + '</span><span class="ix">' + esc(rest ? G.L("i più piccoli", "the smallest") : x.t + " · " + wtS(x.w)) + "</span></span>" + b(2, 14)
        : size === "med" ? nm(med) + b(1.125, 12)
        : size === "small" ? nm(fit([tag], 0.75, r.w - 15)) + b(0.75, 9)
        : size === "tiny" ? nm(fit([tag], 0.625, r.w - 13)) : "";
      const label = rest
        ? G.L("Altri ", "Other ") + rest.length + G.L(" titoli, i più piccoli", " stocks, the smallest") + (has ? G.L(", in media ", ", on average ") + cg : "") + ", " + ww + " " + wtS(r.value)
        : x.n + ", " + x.t + ", " + (has ? cg : G.L("nessun dato", "no data")) + ", " + ww + " " + wtS(x.w);
      // i titoli si muovono più delle Borse: la stessa scala di colori, larga il doppio (fino a ±2%)
      const style = "left:" + r.x.toFixed(1) + "px;top:" + r.y.toFixed(1) + "px;width:" + r.w.toFixed(1) + "px;height:" + r.h.toFixed(1) + "px;background:" + G.band(has ? r.chg / 2 : null);
      return '<button type="button" class="tile ' + size + (has ? "" : " nodata") + '" data-code="' + esc(r.code) + '" aria-pressed="' + (r.code === sel) + '" aria-label="' + esc(label) + '" style="' + style + '">' + inner + "</button>";
    }).join("");
    return rects;
  }
  // l'anello sul titolo scelto; se è nella coda dei più piccoli, sul quadrato che li tiene
  function placeInRing(instant) {
    const ring = $("inring"), rs = inside.rects;
    const r = rs.find((t) => t.code === inside.sel) || rs.find((t) => t.rest && t.rest.some((x) => x.s === inside.sel));
    if (!r) { ring.style.opacity = "0"; ring.parentElement.classList.remove("has-ring"); return; }
    if (instant) ring.classList.remove("ready");
    ring.style.left = r.x + "px"; ring.style.top = r.y + "px"; ring.style.width = r.w + "px"; ring.style.height = r.h + "px";
    ring.style.opacity = "1";
    ring.parentElement.classList.add("has-ring");
    if (instant) { void ring.offsetWidth; ring.classList.add("ready"); }
  }
  function stockDetail(d) {
    const r = inside.rects.find((t) => t.code === inside.sel);
    if (r && r.rest) {
      return "<p>" + G.L("Gli altri ", "The other ") + r.rest.length + G.L(" titoli, i più piccoli: insieme ", " stocks, the smallest: together ") + (quota(d) ? G.L("valgono il ", "they make up ") : G.L("pesano il ", "they weigh ")) + wtS(r.value) +
        (typeof r.chg === "number" ? G.L(", in media ", ", on average ") + '<b class="' + upDown(r.chg) + '">' + G.pct(r.chg) + "</b>" : "") + G.L(". Sono tutti nell'elenco qui sotto.", ". They are all in the list below.") + "</p>";
    }
    const x = r ? r.st : d.items.find((s) => s.s === inside.sel);
    if (!x) return "<p>" + G.L("Tocca un quadrato per vedere il titolo: quanto pesa e come va.", "Tap a square to see the stock: its weight and how it is doing.") + "</p>";
    const day = isToday(d) ? G.L("oggi", "today") : G.L("nella seduta del ", "in the session of ") + G.dayOnly(d.date);
    const cg = hasC(x) ? '<b class="' + upDown(x.c) + '">' + G.pct(x.c) + "</b> " + day : G.cap(G.L("nessun dato ", "no data ") + day);
    let html = "<p><b>" + esc(x.n) + "</b> · " + esc(x.t) + (x.x ? " · " + esc(sectorName(x.x)) : "") + "</p>";
    html += "<p>" + cg + " · " + weightWord(d) + " " + wtS(x.w) + (hasC(x) && !quota(d) ? " · " + G.L("contributo all'indice ", "contribution to the index ") + ptsLong((x.w * x.c) / 100) : "") + "</p>";
    const pr = stockPrice(x, d);
    if (pr) html += "<p>" + G.L("Ultimo prezzo ", "Last price ") + esc(pr) + (x.d ? G.L(", del ", ", of ") + esc(G.dayOnly(x.d)) : "") + ".</p>";
    return html;
  }
  // quanti salgono e quanti scendono; chi ha spinto e chi ha frenato l'indice (peso per variazione)
  function insideSummary(d) {
    const wc = d.items.filter(hasC);
    if (!wc.length) return '<p class="t-na">' + G.L("Non ci sono ancora i prezzi dei titoli di questa seduta.", "There are no stock prices for this session yet.") + "</p>";
    const up = wc.filter((x) => x.c > 0).length, dn = wc.filter((x) => x.c < 0).length, fl = wc.length - up - dn, nd = d.items.length - wc.length;
    const bar = (k, n) => (n ? '<i class="' + k + '" style="width:' + ((n / wc.length) * 100).toFixed(2) + '%"></i>' : "");
    let html = '<div class="t-breadth"><p>' + (isToday(d) ? G.L("Oggi: ", "Today: ") : G.L("Seduta del ", "Session of ") + esc(G.dayOnly(d.date)) + ": ") +
      '<b class="t-up">' + up + G.L(" in rialzo", " up") + '</b>, <b class="t-down">' + dn + G.L(" in ribasso", " down") + "</b>" +
      (fl ? ", " + fl + (fl === 1 ? G.L(" invariato", " unchanged") : G.L(" invariati", " unchanged")) : "") + (nd ? ", " + nd + G.L(" senza dato", " without data") : "") + "</p>" +
      '<span class="t-bbar" aria-hidden="true">' + bar("up", up) + bar("fl", fl) + bar("dn", dn) + "</span></div>";
    if (quota(d)) return html;
    const con = wc.map((x) => ({ x, v: (x.w * x.c) / 100 }));
    const top = con.filter((a) => a.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
    const bot = con.filter((a) => a.v < 0).sort((a, b) => a.v - b.v).slice(0, 3);
    const line = (lab, arr) => (!arr.length ? "" : '<div class="t-contrib"><p class="l">' + lab + "</p>" + arr.map((a) =>
      '<button type="button" class="t-pick" data-stock="' + esc(a.x.s) + '"><span>' + esc(a.x.n) + '</span><b class="' + upDown(a.v) + '">' + pts(a.v) + "</b></button>").join("") + "</div>");
    html += line(G.L("Hanno spinto di più l'indice", "Pushed the index up the most"), top) + line(G.L("L'hanno frenato di più", "Held it back the most"), bot);
    if (top.length || bot.length) html += '<p class="t-note">' + G.L("In punti percentuali dell'indice: il peso del titolo per la sua variazione, una stima.", "In percentage points of the index: the stock's weight times its move, an estimate.") + "</p>";
    return html;
  }
  const SORTS = [["peso", G.L("Per peso", "By weight")], ["su", G.L("In rialzo", "Gainers")], ["giu", G.L("In ribasso", "Losers")]];
  function sorted(d) {
    const xs = d.items.slice();
    if (inside.sort === "su") xs.sort((a, b) => (hasC(b) ? b.c : -1e9) - (hasC(a) ? a.c : -1e9));
    else if (inside.sort === "giu") xs.sort((a, b) => (hasC(a) ? a.c : 1e9) - (hasC(b) ? b.c : 1e9));
    return xs;
  }
  function stockRow(x, d) {
    const pr = stockPrice(x, d);
    const stats = [x.x ? [G.L("Settore", "Sector"), sectorName(x.x)] : null, pr ? [G.L("Ultimo prezzo", "Last price"), pr] : null,
      hasC(x) && !quota(d) ? [G.L("Contributo", "Contribution"), ptsLong((x.w * x.c) / 100)] : null].filter(Boolean);
    const body = '<div class="q-more">' + (stats.length ? '<dl class="q-stats">' + stats.map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + esc(v) + "</dd></div>").join("") + "</dl>" : "") +
      '<p class="t-note">' + (x.d ? G.L("Prezzo del ", "Price of ") + esc(G.dayOnly(x.d)) + ". " : "") + ext("https://finance.yahoo.com/quote/" + encodeURIComponent(x.s), G.L("Vedi su Yahoo Finance", "See on Yahoo Finance")) + "</p></div>";
    return '<li class="q" data-stock="' + esc(x.s) + '">' + opener("q-row st", '<span class="q-n">' + esc(x.n) + "<small>" + esc(x.t) + "</small></span>" +
      '<span class="q-v">' + wtS(x.w) + '</span><span class="q-c ' + (hasC(x) ? upDown(x.c) : "") + '">' + (hasC(x) ? G.pct(x.c) : ND) + "</span>", body) + "</li>";
  }
  // venti righe; tutte se l'indice è piccolo o se si chiede
  function rowsHTML(d) {
    const xs = sorted(d), lim = inside.all || xs.length <= 40 ? xs.length : 20;
    return { rows: xs.slice(0, lim).map((x) => stockRow(x, d)).join(""),
      more: lim < xs.length ? '<button type="button" class="t-btn" data-all="1">' + G.L("Mostra tutti i ", "Show all ") + xs.length + G.L(" titoli", " stocks") + "</button>" : "" };
  }
  function methodNote(d) {
    const parts = [];
    if (quota(d)) parts.push(G.L("Il Nikkei 225 pesa i titoli in base al prezzo, con dei fattori di correzione che qui non ci sono: la grandezza dei quadrati è il valore in Borsa del flottante di ogni titolo, non il suo peso ufficiale.",
      "The Nikkei 225 weights stocks by price, with correction factors that are not available here: the size of each square is the stock's free-float market value, not its official weight."));
    else if (d.metodo === "prezzo") parts.push(G.L("Il Nikkei 225 pesa i titoli in base al prezzo: qui il peso è il prezzo per il fattore di correzione di Nikkei, sul totale.", "The Nikkei 225 weights stocks by price: here the weight is the price times Nikkei's adjustment factor, over the total."));
    else {
      parts.push(G.L("Pesi stimati da GERICO: il valore in Borsa " + (d.metodo === "flottante" ? "del flottante (le azioni che si scambiano) " : "") + "di ogni titolo sul totale" + (d.tetto ? ", con il tetto del " + d.tetto + "% per titolo che ha anche l'indice" : "") + ".",
        "Weights estimated by GERICO: each stock's " + (d.metodo === "flottante" ? "free-float " : "") + "market value over the total" + (d.tetto ? ", with the index's own " + d.tetto + "% cap per stock" : "") + "."));
      parts.push(G.L("L'indice ufficiale conta il flottante a modo suo: i pesi veri possono essere un po' diversi.", "The official index counts the free float its own way: the real weights can be slightly different."));
    }
    if (d.top) parts.push(G.L("Qui ci sono " + d.top + " dei titoli più grandi, non tutti: il peso è sul loro totale.", "Only " + d.top + " of the largest stocks are here: the weight is on their total."));
    if (inside.mapIndex && inside.mapIndex !== d.index) parts.push(G.L("La mappa mostra " + theIx(inside.mapIndex) + "; qui ci sono i titoli " + ofIx(d.index) + ", i più grandi.", "The map shows " + theIx(inside.mapIndex) + "; these are the stocks of " + theIx(d.index) + ", the largest ones."));
    parts.push(G.L("Elenco dei titoli: ", "List of stocks: ") + (d.fonte === "Wikipedia" ? "Wikipedia" : G.L("scelto da GERICO", "chosen by GERICO")) + G.L(", aggiornato il ", ", updated ") + G.day(d.pesiAsOf) + G.L(". Prezzi e flottante: Yahoo Finance.", ". Prices and free float: Yahoo Finance."));
    return '<p class="t-note t-inmethod">' + esc(parts.join(" ")) + "</p>";
  }
  const backRow = () => '<p class="t-backrow"><button type="button" class="t-btn" data-leave="1">‹ ' + G.L("Torna alla mappa: ", "Back to the map: ") + viewName() + "</button></p>";
  function insideList(d) {
    const n = d.items.length, r = rowsHTML(d);
    return '<div class="t-headrow t-inhead"><h3>' + (d.top ? G.L(n + " titoli tra i più grandi", n + " of the largest stocks") : G.L("I " + n + " titoli", "The " + n + " stocks")) + "</h3>" +
      '<div class="seg seg-fill t-seg t-sort" role="group" aria-label="' + G.L("Ordine dell'elenco", "List order") + '">' +
      SORTS.map(([k, l]) => '<button type="button" data-sort="' + k + '" aria-pressed="' + (k === inside.sort) + '">' + l + "</button>").join("") + "</div></div>" +
      '<p class="q-head st" aria-hidden="true"><span>' + G.L("Titolo", "Stock") + "</span><span>" + (quota(d) ? G.L("Quota", "Share") : G.L("Peso", "Weight")) + "</span><span>" + (isToday(d) ? G.L("Oggi", "Today") : esc(G.dayOnly(d.date))) + "</span></p>" +
      '<ul class="q-list st" id="inrows">' + r.rows + '</ul><p class="t-morebtn" id="inmore">' + r.more + "</p>" + methodNote(d) + backRow();
  }
  // titolo del pannello, riga sotto e ora dei dati: quelli dell'indice
  function insideHeader(d, code) {
    const ix = d ? d.index : (ixInfo(code) || {}).index || code, country = G.MARKETS[code] ? G.tn(G.MARKETS[code][0]) : "";
    $("map-h").textContent = ix + (country ? " · " + country : "");
    $("map-sub").textContent = !d ? "" : quota(d) ? G.L("Ogni quadrato è un titolo " + ofIx(ix) + ": più è grande, più vale in Borsa.", "Each square is a stock of " + theIx(ix) + ": the bigger it is, the more it is worth.")
      : G.L("Ogni quadrato è un titolo " + ofIx(ix) + ": più è grande, più pesa nell'indice.", "Each square is a stock of " + theIx(ix) + ": the bigger it is, the more it weighs in the index.");
    const a = $("asof");
    if (!d || !d.asOf) { a.innerHTML = "&nbsp;"; a.classList.remove("stale"); return; }
    const stale = G.hoursAgo(d.asOf) > 30, w = G.when(d.asOf);
    a.textContent = stale ? G.L("Prezzi del " + G.day(d.asOf) + ", non ancora aggiornati", "Prices of " + G.day(d.asOf) + ", not yet updated") : G.L("Prezzi aggiornati ", "Prices updated ") + w;
    if (!stale && !isToday(d) && d.date) a.textContent += G.L(", seduta del ", ", session of ") + G.dayOnly(d.date);
    a.classList.toggle("stale", stale);
  }
  function drawInside() {
    const d = inside.d;
    insideHeader(d, inside.code);
    if (!d) {
      $("inmap").parentElement.hidden = true; $("inlegend").hidden = true;
      $("indetail").innerHTML = "<p>" + G.L("I titoli " + ofIx((ixInfo(inside.code) || {}).index || "") + " non sono disponibili in questo momento.", "The stocks of " + theIx((ixInfo(inside.code) || {}).index || "") + " are not available right now.") + "</p>";
      $("insum").innerHTML = ""; $("inlist").innerHTML = backRow();
      return;
    }
    $("inmap").parentElement.hidden = false; $("inlegend").hidden = false;
    inside.rects = drawStocks($("inmap"), d, inside.sel);
    placeInRing(true);
    $("indetail").innerHTML = stockDetail(d);
    $("insum").innerHTML = insideSummary(d);
    $("inlist").innerHTML = insideList(d);
    requestAnimationFrame(() => G.seg($("inlist").querySelector(".t-sort"), true));
  }
  function selectStock(sym) {
    if (!inside.d) return;
    const iv = $("inview"), h0 = iv.offsetHeight;
    inside.sel = sym;
    $("inmap").querySelectorAll(".tile").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.code === sym)));
    placeInRing(false);
    $("indetail").innerHTML = stockDetail(inside.d);
    easeHeight(iv, h0, 300);
  }

  // ---------- entrare e uscire: la mappa dei titoli cresce dal quadrato della Borsa, e ci rientra ----------
  const ZOOM = 520;
  function snapCountry(code) {
    const map = $("map"), tile = map.querySelector('[data-code="' + code + '"]');
    if (!tile || !map.clientWidth) return null;
    return { map: map.getBoundingClientRect(), tile: tile.getBoundingClientRect(), html: map.innerHTML };
  }
  // la copia della mappa che esce, sopra il suo posto di prima
  function ghost(rect, html, clip) {
    const panel = $("map-panel"), b = panel.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "t-ghost" + (clip ? " clip" : "");
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "left:" + (rect.left - b.left - panel.clientLeft) + "px;top:" + (rect.top - b.top - panel.clientTop) + "px;width:" + rect.width + "px;height:" + rect.height + "px";
    const m = document.createElement("div");
    m.className = "tmap t-ghostmap";
    m.innerHTML = html;
    f.appendChild(m);
    panel.appendChild(f);
    return { f, m };
  }
  function animateIn(before) {
    const im = $("inmap"), to = im.getBoundingClientRect(), t = before.tile, mp = before.map;
    if (!to.width || !t.width || !t.height) return;
    const o = { duration: ZOOM, easing: SNAP };
    // le Borse si avvicinano: il quadrato scelto diventa grande quanto la mappa, e sparisce
    const g = ghost(mp, before.html, true), sx = mp.width / t.width, sy = mp.height / t.height;
    g.m.animate([{ transform: "none", opacity: 1 }, { opacity: 0.25, offset: 0.55 }, { transform: "translate(" + ((mp.left - t.left) * sx).toFixed(1) + "px," + ((mp.top - t.top) * sy).toFixed(1) + "px) scale(" + sx.toFixed(4) + "," + sy.toFixed(4) + ")", opacity: 0 }], Object.assign({ fill: "forwards" }, o));
    // i titoli partono dal posto e dalla grandezza di quel quadrato
    withOrigin(im, "0 0", im.animate([{ transform: "translate(" + (t.left - to.left).toFixed(1) + "px," + (t.top - to.top).toFixed(1) + "px) scale(" + (t.width / to.width).toFixed(4) + "," + (t.height / to.height).toFixed(4) + ")", opacity: 0.4 }, { transform: "none", opacity: 1 }], o));
    const ring = $("inring");
    ring.style.visibility = "hidden";
    ["inlegend", "indetail", "insum", "inlist"].forEach((id, k) => $(id).animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 180 + k * 40, easing: SNAP, fill: "backwards" }));
    P.later(() => { g.f.remove(); ring.style.visibility = ""; }, ZOOM + 40);
  }
  function animateOut(before, code) {
    const map = $("map"), tile = map.querySelector('[data-code="' + code + '"]');
    if (!tile) return;
    const to = map.getBoundingClientRect(), tr = tile.getBoundingClientRect(), mp = before.map;
    if (!to.width || !tr.width || !tr.height) return;
    const o = { duration: ZOOM, easing: SNAP };
    // i titoli rientrano nel quadrato della loro Borsa
    const g = ghost(mp, before.html, false);
    g.m.animate([{ transform: "none", opacity: 1 }, { opacity: 0.5, offset: 0.5 }, { transform: "translate(" + (tr.left - mp.left).toFixed(1) + "px," + (tr.top - mp.top).toFixed(1) + "px) scale(" + (tr.width / mp.width).toFixed(4) + "," + (tr.height / mp.height).toFixed(4) + ")", opacity: 0 }], Object.assign({ fill: "forwards" }, o));
    // le Borse tornano da vicino a lontano, dentro il loro riquadro
    const wrap = map.parentElement, ring = $("ring"), sx = to.width / tr.width, sy = to.height / tr.height;
    wrap.classList.add("t-zooming");
    ring.style.visibility = "hidden";
    withOrigin(map, "0 0", map.animate([{ transform: "translate(" + ((to.left - tr.left) * sx).toFixed(1) + "px," + ((to.top - tr.top) * sy).toFixed(1) + "px) scale(" + sx.toFixed(4) + "," + sy.toFixed(4) + ")", opacity: 0 }, { opacity: 1, offset: 0.45 }, { transform: "none", opacity: 1 }], o));
    P.later(() => { g.f.remove(); wrap.classList.remove("t-zooming"); ring.style.visibility = ""; }, ZOOM + 40);
  }
  let inTok = 0;
  async function enter(code, opt) {
    opt = opt || {};
    if (inside.code === code || !ixInfo(code)) return;
    const tok = ++inTok;
    const d = await G.load("indici/" + code);
    if (tok !== inTok) return;
    if (inside.code) leaveInside({ instant: true });
    if (mapSwipe) mapSwipe.finish();
    const panel = $("map-panel"), h0 = panel.offsetHeight;
    const before = !opt.instant && !G.reduced() ? snapCountry(code) : null;
    const items = wt ? G.mapItems(wt, tm, state.view, qt0) : [], mi = items.find((x) => x.code === code);
    const ok = !!(d && Array.isArray(d.items) && d.items.length);
    if (ok) d.items.sort((a, b) => b.w - a.w);
    Object.assign(inside, { code, d: ok ? d : null, sel: "", sort: "peso", all: false, rects: [], mapIndex: mi ? mi.index : "" });
    if (opt.push) { try { history.pushState(Object.assign({}, history.state, { gi: code }), "", location.pathname + location.search + "#indice-" + code); } catch (e) { /* niente */ } }
    state.sel = code;
    G.ls.set("gerico.mapSel", code);
    board.classList.add("inside");
    $("mapview").hidden = true;
    $("inview").hidden = false;
    $("map-seg").hidden = true;
    $("in-back").hidden = false;
    $("in-back").textContent = "‹ " + viewName();
    $("in-back").setAttribute("aria-label", G.L("Torna alla mappa: ", "Back to the map: ") + viewName());
    drawInside();
    if (before) animateIn(before);
    easeHeight(panel, h0, 420);
    if (!opt.instant) {
      $("in-back").focus({ preventScroll: true });
      const top = $("inmap").getBoundingClientRect().top, bar = document.querySelector(".top");
      if (top < (bar ? bar.getBoundingClientRect().bottom : 0) + 8) panel.scrollIntoView({ behavior: G.reduced() ? "auto" : "smooth", block: "start" });
    }
  }
  function leaveInside(opt) {
    opt = opt || {};
    if (!inside.code) return;
    inTok += 1;
    const code = inside.code, panel = $("map-panel"), h0 = panel.offsetHeight, im = $("inmap"), r = im.getBoundingClientRect();
    // se la mappa dei titoli non si vede (si è scesi nell'elenco), niente zoom: si torna in cima alla mappa
    const seen = r.height > 0 && r.bottom > 40 && r.top < innerHeight - 40;
    const before = !opt.instant && !G.reduced() && seen ? { map: r, html: im.innerHTML } : null;
    Object.assign(inside, { code: "", d: null, sel: "", rects: [] });
    board.classList.remove("inside");
    $("inview").hidden = true;
    $("mapview").hidden = false;
    $("map-seg").hidden = false;
    $("in-back").hidden = true;
    $("map-h").textContent = mapTitle;
    ["inmap", "indetail", "insum", "inlist"].forEach((id) => { $(id).innerHTML = ""; });
    state.sel = code;
    drawMap(false);
    renderStatus();
    if (!seen && !opt.instant) panel.scrollIntoView({ block: "start" });
    if (before) animateOut(before, code);
    easeHeight(panel, h0, 420);
    if (!opt.instant) { const b = $("map").querySelector('[data-code="' + code + '"]'); if (b) b.focus({ preventScroll: true }); }
  }
  // indietro: se l'indice si è aperto da questa pagina, con la storia del browser (come il gesto di iOS)
  function leave() {
    if (!inside.code) return;
    if (history.state && history.state.gi === inside.code) { history.back(); return; }
    try { history.replaceState(history.state, "", location.pathname + location.search); } catch (e) { /* niente */ }
    leaveInside();
  }
  function fromHash(e) {
    const want = hashCode();
    if (want === inside.code) return;
    const instant = !!(e && e.hasUAVisualTransition);
    if (want && ixInfo(want)) enter(want, { instant });
    else if (!want) leaveInside({ instant });
  }
  P.on(window, "popstate", fromHash);
  P.on(window, "hashchange", fromHash);
  $("in-back").addEventListener("click", leave);
  $("inview").addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("a")) return;
    const tile = t.closest("#inmap .tile");
    if (tile) { selectStock(tile.dataset.code); return; }
    const so = t.closest("[data-sort]");
    if (so && so.dataset.sort !== inside.sort && inside.d) {
      inside.sort = so.dataset.sort;
      const box = so.parentElement;
      box.querySelectorAll("[data-sort]").forEach((b) => b.setAttribute("aria-pressed", String(b === so)));
      G.seg(box);
      const r = rowsHTML(inside.d);
      $("inrows").innerHTML = r.rows;
      $("inmore").innerHTML = r.more;
      return;
    }
    if (t.closest("[data-all]") && inside.d) { inside.all = true; const r = rowsHTML(inside.d); $("inrows").innerHTML = r.rows; $("inmore").innerHTML = ""; return; }
    if (t.closest("[data-leave]")) { leave(); return; }
    const pick = t.closest("[data-stock]");
    if (pick) selectStock(pick.dataset.stock);
  });
  if (window.ResizeObserver) {
    let rt, sz = "";
    P.keep(new ResizeObserver(() => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const now = $("inmap").clientWidth + "x" + $("inmap").clientHeight;
        if (now === sz) return;
        sz = now;
        if (inside.d) { inside.rects = drawStocks($("inmap"), inside.d, inside.sel); placeInRing(true); }
      }, 100);
    })).observe($("inmap"));
  }

  // le percentuali delle tabelle contano fino al valore, una volta sola all'apertura (le cifre hanno tutte la stessa larghezza).
  // Nella mappa no: i quadrati stanno già crescendo, e cambiare testo a ogni fotogramma li ridisegnerebbe tutti.
  function countUp(root) {
    if (G.reduced() || G.soft) return;
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
  function table(key, cols, target, extraNote, skip) {
    const c = cls(key);
    if (!mk) { $(target).innerHTML = '<p class="t-na">' + G.L("Dati di mercato non disponibili.", "Market data not available.") + "</p>"; return; }
    const items = c ? (c.items || []).filter((it) => !(skip && skip(it))) : [];
    if (!items.length) { $(target).innerHTML = '<p class="t-na t-warn">' + esc((c && c.note) || G.L("Nessun dato verificato in questo aggiornamento.", "No verified data in this update.")) + "</p>"; return; }
    const common = commonNote(items);
    const notes = items.map((it) => ownNote(it.note, common));
    const rows = items.map((it, i) => {
      const tone = G.tone(it, key);
      const mv = typeof it.chg === "number" ? G.pctBare(it.chg) : typeof it.bp === "number" ? G.bps(it.bp).replace(/ (pb|bp)$/, "") : "";
      const num = typeof it.chg === "number" ? ' data-n="' + it.chg + '" data-f="pct"' : typeof it.bp === "number" ? ' data-n="' + it.bp + '" data-f="bp"' : "";
      return '<tr><th scope="row">' + esc(G.tn(G.shortName(it.name))) + (notes[i] ? "<small>" + esc(notes[i]) + "</small>" : "") + "</th><td>" +
        esc(G.cleanValue(it.value)) + '</td><td class="mv' + (tone ? " t-" + tone : "") + '"' + num + ">" + esc(mv) + "</td></tr>";
    }).join("");
    // con il testo molto grande la tabella scorre di lato da sola, la pagina no
    $(target).innerHTML = (common ? '<p class="t-common">' + esc(common) + (notes.some(Boolean) ? G.L(", salvo dove indicato", ", unless stated") : "") + "</p>" : "") + '<div class="t-scroll"><table class="t-table"><thead><tr><th scope="col">' + cols[0] + '</th><th scope="col">' + cols[1] + '</th><th scope="col">' + cols[2] +
      "</th></tr></thead><tbody>" + rows + "</tbody></table></div>" + (c.note ? '<p class="t-note">' + esc(c.note) + "</p>" : "") + (extraNote ? '<p class="t-note">' + extraNote + "</p>" : "");
  }

  // Tassi a 10 anni: Btp, Bund e spread. Il Treasury a 10 anni sta in «Prezzi e grafici» (Tassi Usa), con il grafico:
  // qui non si ripete. Se resta solo lui, il pannello sparisce e il tasto Tassi apre i Tassi Usa
  const tnxIn = () => !!(qt0 && (qt0.groups || []).some((g) => (g.items || []).some((it) => it.sym === "^TNX" && typeof it.last === "number")));
  const treasury = (it) => /treasury/i.test(it.name || "") && tnxIn();
  function rates() {
    table("obbligazioni", G.en ? ["Bond", "Yield", "Basis points"] : ["Titolo", "Rendimento", "Punti base"], "rt", G.L("Rosso: rendimenti in salita, cioè prezzi in calo.", "Red: yields rising, which means prices falling."), treasury);
    const c = cls("obbligazioni"), all = c ? (c.items || []) : [];
    $("p-tassi").hidden = all.length > 0 && all.every(treasury);
  }

  // una riga dell'agenda: ora, valuta, evento con i numeri sotto, impatto
  function agendaRow(o) {
    const cls = [o.past ? "past" : "", o.imp === "alto" ? "hi" : "", o.next ? "next" + (o.soon ? " soon" : "") : ""].filter(Boolean).join(" ");
    const IMP = G.en ? { alto: "High", medio: "Medium", basso: "Low", festivo: "Holiday" } : {};
    return '<li' + (cls ? ' class="' + cls + '"' : "") + '><span class="tm">' + esc(o.time || "—") + "</span><span>" + esc(o.cur || "") +
      '</span><span class="ev">' + esc(o.ev) + (o.nums ? "<small>" + esc(o.nums) + "</small>" : "") + '</span><span class="im ' + (o.imp || "") + '">' + esc(IMP[o.imp] || G.cap(o.imp || "")) + "</span></li>";
  }
  // Forex Factory: oggi impatto alto e medio e festività; dei giorni dopo solo l'impatto alto
  const FF_TODAY = { alto: 1, medio: 1, festivo: 1 };
  const hmMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  function renderAgenda() {
    const now = G.romeNow().hm, dayKey = G.dayKey(new Date());
    const hasAg = !!(ag && (ag.items || []).length);
    const today = hasAg && (!ag.date || String(ag.date).slice(0, 10) === dayKey);
    const ffOk = !!(ff && Array.isArray(ff.items) && G.hoursAgo(ff.asOf) < 8 * 24);
    const ffToday = ffOk ? ff.items.filter((it) => it.date === dayKey && FF_TODAY[it.impact]) : [];
    const ffWeek = ffOk ? ff.items.filter((it) => it.date > dayKey && it.impact === "alto") : [];
    // una lista sola: l'agenda di GERICO (con le notizie della giornata) e il calendario di Forex Factory. Lo stesso dato
    // nelle due (stessa valuta, orario entro 5 minuti) compare una volta, con le parole di GERICO e i numeri che mancano
    const rows = [];
    if (today) ag.items.forEach((it) => rows.push({ time: it.time || "", cur: it.currency || "", ev: it.event,
      nums: [it.expected ? G.L("atteso ", "expected ") + G.numText(it.expected) : "", it.previous ? G.L("precedente ", "previous ") + G.numText(it.previous) : "", it.actual ? G.L("effettivo ", "actual ") + G.numText(it.actual) : ""].filter(Boolean).join(" · "),
      imp: ["alto", "medio", "basso"].includes(it.impact) ? it.impact : "" }));
    const own = rows.length;
    ffToday.forEach((it) => {
      const m = hmMin(it.time), nums = [it.forecast ? G.L("previsione ", "forecast ") + it.forecast : "", it.previous ? G.L("precedente ", "previous ") + it.previous : ""].filter(Boolean).join(" · ");
      const twin = m === null ? null : rows.slice(0, own).find((r) => r.cur === it.currency && hmMin(r.time) !== null && Math.abs(hmMin(r.time) - m) <= 5);
      if (twin) { if (!twin.nums) twin.nums = nums; if (it.impact === "alto") twin.imp = "alto"; return; }
      rows.push({ time: it.time || "", cur: it.currency || "", ev: it.title, nums, imp: it.impact });
    });
    rows.sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99")));
    // il prossimo evento ad alto impatto di oggi (si aggiorna ogni 30 secondi)
    const next = rows.find((r) => r.imp === "alto" && r.time && r.time >= now) || null;
    let left = "", soon = false;
    if (next) {
      const mins = hmMin(next.time) - G.romeNow().min;
      soon = mins <= 15;
      left = mins <= 0 ? G.L("adesso", "now") : mins < 60 ? G.L("tra ", "in ") + mins + " min" : G.L("tra ", "in ") + Math.floor(mins / 60) + " h " + String(mins % 60).padStart(2, "0") + " min";
    }
    $("next").classList.toggle("soon", soon);
    $("next").innerHTML = next ? G.L("Prossimo ad alto impatto: ", "Next high-impact event: ") + "<b>" + esc(next.time + " " + next.cur) + "</b> · " + esc(left) : "";
    $("ag-h").textContent = G.L("Agenda di oggi", "Today's calendar");
    // un'agenda che manca o è troppo corta si dice in chiaro: chi la usa per i dati ad alto impatto deve saperlo
    const wd = G.romeNow().wd;
    const warn = hasAg && !today ? G.L("L'agenda di GERICO di oggi non è ancora arrivata.", "GERICO's calendar for today has not arrived yet.")
      : !ffOk && wd >= 1 && wd <= 5 && own < 3 ? G.L("Agenda forse incompleta: controlla gli orari dei dati ad alto impatto su un calendario economico.", "The calendar may be incomplete: check the times of high-impact releases on an economic calendar.") : "";
    let html = warn ? '<p class="t-na t-warn">' + esc(warn) + "</p>" : "";
    html += rows.length ? '<ol class="t-agenda">' + rows.map((r) => agendaRow(Object.assign({}, r, { past: !!r.time && r.time < now, next: r === next, soon }))).join("") + "</ol>"
      : '<p class="t-na">' + (ffOk || today ? G.L("Oggi nessun evento ad alto o medio impatto.", "No high- or medium-impact events today.") : G.L("L'agenda di oggi non è ancora disponibile.", "Today's calendar is not available yet.")) + "</p>";
    if (ffWeek.length) {
      const nums = (it) => [it.forecast ? G.L("previsione ", "forecast ") + it.forecast : "", it.previous ? G.L("precedente ", "previous ") + it.previous : ""].filter(Boolean).join(" · ");
      // la tendina dei giorni dopo resta aperta o chiusa come l'ha lasciata chi legge, anche quando l'agenda si aggiorna
      const open = !!document.querySelector("#ag .t-ff-week[open]");
      let last = "";
      const week = ffWeek.map((it) => {
        let day = "";
        if (it.date !== last) { last = it.date; day = '<li class="t-day">' + esc(G.cap(G.weekday(it.date + "T12:00:00Z")) + " " + G.dayOnly(it.date)) + "</li>"; }
        return day + agendaRow({ time: it.time, cur: it.currency, ev: it.title, nums: nums(it), imp: it.impact });
      }).join("");
      html += '<details class="t-ff-week"' + (open ? " open" : "") + "><summary>" + G.L("Prossimi giorni, impatto alto (", "Coming days, high impact (") + ffWeek.length + ')</summary><ol class="t-agenda">' + week + "</ol></details>";
    }
    // da dove viene: una nota sola per le due fonti
    const srcs = (today ? (ag.sources || []).filter((x) => x && x.url).slice(0, 2).map((x) => ext(x.url, String(x.name || "").split(",")[0])) : [])
      .concat(ffOk ? [ext("https://www.forexfactory.com/calendar", "Forex Factory") + G.L(" (letto ", " (read ") + esc(G.when(ff.asOf)) + ")"] : []);
    html += '<p class="t-note">' + (srcs.length ? G.L("Fonti: ", "Sources: ") + srcs.join(", ") + ". " : "") + G.L("Orari in ora italiana", "Times are Italian time") + (ffOk ? G.L("; da Forex Factory solo impatto alto e medio", "; from Forex Factory only high and medium impact") : "") + "." +
      (today && ag.note ? " " + esc(ag.note) : "") + "</p>";
    $("ag").innerHTML = html;
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
    $("nw").innerHTML = '<ul class="t-news">' + st.map((s) =>
      '<li><a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + '</a><span class="ag">' + esc([G.secLabel(s.section), G.srcCount(s.sources)].filter(Boolean).join(" · ")) + "</span></li>").join("") + "</ul>";
  }

  function renderStatus() {
    // l'ora dei dati più freschi tra prezzi del job, mappa e chiusure della redazione
    const asOf = [qt0 && qt0.asOf, tm && tm.asOf, mk && mk.asOf].filter((x) => x && !isNaN(Date.parse(x))).sort((a, b) => Date.parse(a) - Date.parse(b)).pop();
    // i prezzi arrivano ogni mezz'ora nelle ore di Borsa; le chiusure della redazione agli orari delle edizioni
    $("st-line").textContent = !asOf ? G.L("Dati non disponibili", "Data not available")
      : qt0 && asOf === qt0.asOf ? G.L("Prezzi aggiornati ", "Prices updated ") + G.when(asOf) + G.L(", ogni mezz'ora nelle ore di Borsa", ", every half hour during market hours")
      : G.L("Aggiornato ", "Updated ") + G.when(asOf) + G.L(" · prossimo ", " · next ") + G.nextUpdate();
    // la data dei dati sta sotto la mappa, in una riga già riservata: nessun salto quando arriva
    if (asOf && !inside.code) {
      const stale = G.hoursAgo(asOf) > 30, w = G.when(asOf);
      $("asof").textContent = G.en ? (stale ? "Data of " + G.day(asOf) + ", not yet updated" : "Data " + w)
        : stale ? "Dati del " + G.day(asOf) + ", non ancora aggiornati"
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
    let t = label + (d.asOf ? " · " + (stale ? G.L("dati del ", "data of ") + G.day(d.asOf) : G.L("aggiornato ", "updated ") + G.when(d.asOf)) : "");
    if (d.lastError && d.lastError.at) t += G.L(". L'ultimo aggiornamento, ", ". The last update, ") + G.when(d.lastError.at) + G.L(", non è riuscito: restano i dati di prima.", ", failed: the previous data remain.");
    $(id).textContent = t;
    $(id).classList.toggle("stale", stale || !!d.lastError);
  }
  const ext = (url, text) => '<a href="' + esc(G.safeUrl(url)) + '" target="_blank" rel="noopener">' + esc(text) + '<span class="sr-only"> ' + G.L("(si apre in un'altra scheda)", "(opens in a new tab)") + "</span></a>";
  let uid = 0;
  // riga che si apre: un pulsante e un pannello sotto (stessa animazione delle schede della storia)
  const opener = (cls, inner, body) => {
    const id = "x" + ++uid;
    return '<button type="button" class="' + cls + '" aria-expanded="false" aria-controls="' + id + '">' + inner + "</button>" +
      '<div class="collapse" id="' + id + '" inert>' + body + "</div>";
  };

  // prezzi e grafici: un gruppo alla volta, ogni riga si apre sul grafico grande di tre mesi
  const GROUP = G.en ? { indici: "Indices", valute: "Currencies", tassi: "US rates", materie: "Commodities", cripto: "Crypto" }
    : { indici: "Indici", valute: "Valute", tassi: "Tassi Usa", materie: "Materie prime", cripto: "Cripto" };
  const ND = G.L("n.d.", "n/a"), BP = G.L(" pb", " bp");
  let quotes = null, grKey = G.ls.get("gerico.grGroup", "valute"), grPrep = null, grVer = 0;
  function quoteRow(it, rates) {
    const d = rates ? it.bp : it.chg;
    const good = typeof d === "number" ? (rates ? -d : d) : 0;
    const first = (it.spark || [])[0];
    const trend = typeof first === "number" ? (rates ? first - it.last : it.last - first) : 0;
    const tr = trend > 0 ? "t-up" : trend < 0 ? "t-down" : "";
    const mv = typeof d !== "number" ? ND : rates ? G.signed(d, 1) + BP : G.pct(d);
    const val = typeof it.last !== "number" ? ND : rates ? G.num(it.last, 2) + "%" : G.price(it.sym, it.last);
    const per = (k) => { const v = it[(rates ? "bp" : "chg") + k]; return typeof v !== "number" ? ND : rates ? G.signed(v, 1) + BP : G.pct(v); };
    const big = '<div class="q-more"><span class="' + tr + '">' + G.spark(it.spark, 320, 112, "sp-big", true) + "</span>" +
      '<p class="q-range"><span>' + esc(G.dayOnly(it.sparkFrom)) + "</span><span>" + esc(G.dayOnly(it.date)) + "</span></p>" +
      '<dl class="q-stats">' +
      (typeof it.open === "number" ? "<div><dt>" + G.L("Apertura", "Open") + "</dt><dd>" + (rates ? G.num(it.open, 2) + "%" : G.price(it.sym, it.open)) + "</dd></div>" : "") +
      (typeof it.prev === "number" ? "<div><dt>" + G.L("Chiusura prima", "Previous close") + "</dt><dd>" + (rates ? G.num(it.prev, 2) + "%" : G.price(it.sym, it.prev)) + "</dd></div>" : "") +
      "<div><dt>" + G.L("1 settimana", "1 week") + "</dt><dd>" + per("1w") + "</dd></div><div><dt>" + G.L("1 mese", "1 month") + "</dt><dd>" + per("1m") + "</dd></div><div><dt>" + G.L("3 mesi", "3 months") + "</dt><dd>" + per("3m") + "</dd></div>" +
      "<div><dt>" + G.L("Massimo", "High") + "</dt><dd>" + (typeof it.hi === "number" ? (rates ? G.num(it.hi, 2) + "%" : G.price(it.sym, it.hi)) : ND) + "</dd></div>" +
      "<div><dt>" + G.L("Minimo", "Low") + "</dt><dd>" + (typeof it.lo === "number" ? (rates ? G.num(it.lo, 2) + "%" : G.price(it.sym, it.lo)) : ND) + "</dd></div></dl>" +
      '<p class="t-note">' + (it.at ? G.L("Ultimo prezzo ", "Last price ") + esc(G.when(it.at)) + ". " : "") + ext(it.url, G.L("Vedi su Yahoo Finance", "See on Yahoo Finance")) + "</p></div>";
    return '<li class="q" data-sym="' + esc(it.sym) + '">' + opener("q-row",
      '<span class="q-n">' + esc(G.tn(it.name)) + (it.stale ? "<small>" + G.L("fermo al ", "stuck at ") + esc(G.dayOnly(it.date)) + "</small>" : "") + '</span><span class="q-sp ' + tr + '">' + G.spark(it.spark, 72, 24, "sp") + "</span>" +
      '<span class="q-v">' + esc(val) + '</span><span class="q-c ' + (good > 0 ? "t-up" : good < 0 ? "t-down" : "") + '">' + esc(mv) + "</span>", big) + "</li>";
  }
  // un gruppo di strumenti: lo stesso elenco per la pagina e per il gruppo accanto durante lo swipe
  function groupMarkup(key) {
    const g = quotes.groups.find((x) => x.key === key) || quotes.groups[0];
    const rates = g.key === "tassi";
    return '<p class="q-head" aria-hidden="true"><span>' + G.L("Strumento", "Instrument") + "</span><span>" + G.L("3 mesi", "3 months") + "</span><span>" + G.L("Ultimo", "Last") + "</span><span>" + G.L("Oggi", "Today") + '</span></p><ul class="q-list">' +
      g.items.map((it) => quoteRow(it, rates)).join("") + "</ul>" +
      (rates ? '<p class="t-note">' + G.L("Rendimenti dei titoli di Stato Usa. Rosso: rendimenti in salita, cioè prezzi in calo.", "US Treasury yields. Red: yields rising, which means prices falling.") + "</p>" : "");
  }
  function drawGroup(openSym, still) {
    $("gr").innerHTML = groupMarkup(grKey);
    if (grPrep) grPrep.soon();
    if (openSym) {
      const li = $("gr").querySelector('[data-sym="' + CSS.escape(openSym) + '"] .q-row');
      if (!li) return;
      if (!still) { G.toggle(li, true); return; }
      // ridisegnato con prezzi nuovi: la riga aperta resta aperta, senza riaprirsi
      const panel = document.getElementById(li.getAttribute("aria-controls"));
      li.setAttribute("aria-expanded", "true");
      if (panel) { panel.style.transition = "none"; panel.classList.add("open"); panel.inert = false; void panel.offsetHeight; panel.style.transition = ""; }
    }
  }
  // prezzi nuovi a pagina aperta: stesso gruppo, stessa riga aperta
  function updateQuotes(qt) {
    const groups = ((qt && qt.groups) || []).filter((g) => (g.items || []).length);
    if (!quotes || !groups.length) return;
    quotes = { groups };
    grVer += 1;
    srcLine("gr-src", qt, G.L("Yahoo Finance, tramite yfinance. Grafici di tre mesi, una chiusura al giorno", "Yahoo Finance, via yfinance. Three-month charts, one close per day"));
    const open = $("gr").querySelector('.q-row[aria-expanded="true"]');
    drawGroup(open && open.closest("[data-sym]") ? open.closest("[data-sym]").dataset.sym : "", true);
  }
  function renderQuotes(qt) {
    const groups = ((qt && qt.groups) || []).filter((g) => (g.items || []).length);
    if (!groups.length) {
      ["INDICI", "VALUTE", "MATERIE PRIME"].forEach((c) => { const k = document.querySelector('[data-cmd="' + c + '"]'); if (k) k.hidden = true; });
      return hide("p-grafici", "GRAFICI");
    }
    quotes = { groups };
    if (!groups.some((g) => g.key === grKey)) grKey = groups[0].key;
    srcLine("gr-src", qt, G.L("Yahoo Finance, tramite yfinance. Grafici di tre mesi, una chiusura al giorno", "Yahoo Finance, via yfinance. Three-month charts, one close per day"));
    $("gr-tabs").innerHTML = groups.map((g) => '<button type="button" data-g="' + g.key + '" aria-pressed="' + (g.key === grKey) + '">' + esc(GROUP[g.key] || g.label) + "</button>").join("");
    G.seg($("gr-tabs"), true);
    drawGroup();
    const keys = groups.map((g) => g.key), near = (d) => keys[keys.indexOf(grKey) + d];
    // la scheda accesa; quiet: l'indicatore lo sta già muovendo lo swipe
    const markGroup = (k, quiet) => {
      $("gr-tabs").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.g === k)));
      if (!quiet) G.seg($("gr-tabs"));
    };
    const setGroup = (k) => { grKey = k; G.ls.set("gerico.grGroup", k); markGroup(k); drawGroup(); };
    // swipe: il gruppo accanto sta di lato, intero e già disegnato, e arriva con il dito; l'indicatore delle schede lo segue.
    // Toccando una scheda succede lo stesso (anche verso un gruppo non vicino). I gruppi hanno altezze diverse: mentre il
    // dito trascina quello accanto è ritagliato all'altezza di quello che esce, all'arrivo lo spazio si adegua con la molla
    let grPeek = null, grTap = null;
    // il gruppo accanto, disegnato come quello vero; place: al suo posto, alto quanto quello che esce
    const buildGroup = (d, k) => {
      k = k || near(d);
      if (!k) return null;
      const gr = $("gr"), p = document.createElement("div");
      p.className = "gr-peek";
      p.setAttribute("aria-hidden", "true");
      p.innerHTML = groupMarkup(k);
      p.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      p.style.width = gr.getBoundingClientRect().width + "px";
      gr.parentElement.appendChild(p);
      return p;
    };
    const placeGroup = (p) => {
      const gr = $("gr"), box = gr.parentElement, r = gr.getBoundingClientRect(), b = box.getBoundingClientRect();
      p.style.top = (r.top - b.top - box.clientTop) + "px";
      p.style.left = (r.left - b.left - box.clientLeft) + "px";
      p.style.width = r.width + "px";
      p.style.height = r.height + "px";
    };
    grPrep = preparer((d) => (near(d) ? [near(d), grVer, $("gr").clientWidth].join("|") : ""), (d) => buildGroup(d), placeGroup);
    const grSwipe = G.swipe($("gr"), {
      canNext: () => !!near(1), canPrev: () => !!near(-1),
      // un gruppo non vicino (tocco su una scheda lontana) si disegna al momento; quelli vicini sono già pronti
      peek: (d, k) => {
        if (k && k !== near(d)) { const p = buildGroup(d, k); if (p) placeGroup(p); return (grPeek = p); }
        return (grPeek = grPrep.take(d));
      },
      drop: (el) => { el.remove(); grPrep.soon(); },
      commit: (d, k) => { grTap = null; setGroup(k || near(d)); releaseHeight($("gr")); },
      progress: (p, d, anim) => {
        if (!grTap || grTap === near(d)) G.segFollow($("gr-tabs"), p, d, anim);
        if (anim) swipeHeight($("gr"), grPeek, p >= 1, anim);
      }
    });
    grPrep.soon();
    $("gr-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (!b) return;
      if (grSwipe) grSwipe.finish();
      const k = b.dataset.g;
      if (k === grKey) return;
      const d = keys.indexOf(k) > keys.indexOf(grKey) ? 1 : -1;
      if (grSwipe && !G.reduced()) {
        grTap = k;
        if (grSwipe.go(d, k)) { markGroup(k, k === near(d)); return; }
        grTap = null;
      }
      const h0 = $("gr").offsetHeight;
      setGroup(k);
      easeHeight($("gr"), h0, 420);
    });
  }
  // un nome o un simbolo scritto nel campo dei comandi («eurusd», «oro», «s&p 500») apre il suo grafico
  const norm = (s) => String(s || "").toUpperCase().replace(/=X$/, "").replace(/[^A-Z0-9]/g, "");
  function findQuote(c) {
    if (!quotes) return null;
    const k = norm(c);
    if (k.length < 2) return null;
    for (const g of quotes.groups) for (const it of g.items) if (norm(it.sym) === k || norm(it.name) === k || norm(G.tn(it.name)) === k) return { g: g.key, it };
    return null;
  }

  // macro: le serie della Fed di St. Louis, ognuna con il dato, la data e il grafico; il riquadro porta alla serie su FRED
  const MONTHS = G.en ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    : ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  // i nomi delle serie FRED in inglese, per id
  const MACRO_EN = {
    DFEDTARU: "Fed: upper bound of the target range", ECBDFR: "ECB: deposit facility rate", DGS2: "2-year Treasury", DGS10: "10-year Treasury",
    T10Y2Y: "US curve: 10-year minus 2-year", T10YIE: "US 10-year expected inflation", DTWEXBGS: "Dollar against other currencies (Fed index)",
    CPIAUCSL: "US inflation", CPILFESL: "US core inflation", PCEPILFE: "Core PCE, the inflation measure the Fed watches", UNRATE: "US unemployment",
    PAYEMS: "US jobs, added in the month", ICSA: "US jobless claims, weekly", CP0000EZ19M086NEST: "Euro area inflation"
  };
  const macroDate = (s) => {
    const d = String(s || "");
    return /^\d{4}-\d{2}/.test(d) ? MONTHS[Number(d.slice(5, 7)) - 1] + " " + d.slice(0, 4) : "";
  };
  function macroVal(s, v) {
    if (typeof v !== "number") return ND;
    if (s.unit === "%") return G.num(v, s.freq === "m" ? 1 : 2) + "%";
    if (s.unit === "pp") return G.signed(v, 2) + G.L(" punti", " points");
    if (s.unit === "mila") return (s.id === "PAYEMS" ? G.signed(v, 0) : G.num(v, 0)) + G.L(" mila", "k");
    return G.num(v, 2);
  }
  // doppioni: il Treasury a 10 anni e il dollaro stanno già in «Prezzi e grafici», con il dato del giorno e il grafico
  const MACRO_DUP = { DGS10: "^TNX", DTWEXBGS: "DX-Y.NYB" };
  const inCharts = (sym) => !!(quotes && quotes.groups.some((g) => (g.items || []).some((it) => it.sym === sym && typeof it.last === "number")));
  function renderMacro(mc) {
    const ss = ((mc && mc.series) || []).filter((s) => !(MACRO_DUP[s.id] && inCharts(MACRO_DUP[s.id])));
    if (!ss.length) return hide("p-macro", "MACRO");
    srcLine("mc-src", mc, G.L("FRED, Fed di St. Louis", "FRED, St. Louis Fed"));
    $("mc").innerHTML = '<div class="m-grid">' + ss.map((s) => {
      const when = s.freq === "m" ? G.L("dato di ", "data for ") + macroDate(s.date) : s.freq === "s" ? G.L("settimana al ", "week to ") + G.dayOnly(s.date) : G.dayOnly(s.date);
      return '<a class="m-card" href="' + esc(G.safeUrl(s.url)) + '" target="_blank" rel="noopener"><span class="m-n">' + esc((G.en && MACRO_EN[s.id]) || s.name) + "</span>" +
        '<span class="m-v">' + esc(macroVal(s, s.last)) + '</span><span class="m-d">' + esc(when) + G.L(" · prima ", " · before ") + esc(macroVal(s, s.prev)) + "</span>" +
        '<span class="m-sp">' + G.spark(s.spark, 120, 28, "sp") + '</span><span class="sr-only"> ' + G.L("(apre la serie ", "(opens the series ") + esc(s.id) + G.L(" su FRED)", " on FRED)") + "</span></a>";
    }).join("") + '</div><p class="t-note">' + G.L("Inflazione: variazione sullo stesso mese dell'anno prima. Posti di lavoro: nuovi posti nel mese, in migliaia.", "Inflation: change on the same month a year earlier. Jobs: new jobs in the month, in thousands.") + "</p>";
  }

  // tono delle notizie: per ogni mercato quanti titoli FinBERT legge come positivi, neutri o negativi
  const LAB = { positive: [G.L("positivo", "positive"), "l-pos"], negative: [G.L("negativo", "negative"), "l-neg"], neutral: [G.L("neutro", "neutral"), "l-neu"] };
  function renderSentiment(se) {
    const as = ((se && se.assets) || []).filter((a) => a && a.n);
    if (!as.length) return hide("p-sentiment", "SENTIMENT");
    srcLine("se-src", se, G.L("Titoli di Yahoo Finance delle ultime ", "Yahoo Finance headlines from the last ") + (se.hours || 72) + G.L(" ore, tono calcolato da FinBERT", " hours, tone scored by FinBERT"));
    $("se").innerHTML = '<ul class="s-list">' + as.map((a) => {
      const pp = (a.pos / a.n) * 100, ng = (a.neg / a.n) * 100;
      const tone = a.score > 0.15 ? [G.L("più positivo", "more positive"), "t-up"] : a.score < -0.15 ? [G.L("più negativo", "more negative"), "t-down"] : [G.L("misto", "mixed"), ""];
      const news = (a.news || []).map((n) => {
        const l = LAB[n.label] || LAB.neutral;
        return '<li><span class="s-lab ' + l[1] + '">' + l[0] + "</span>" + ext(n.url, n.title) + "<small>" + esc([n.publisher, G.when(n.at)].filter(Boolean).join(" · ")) + "</small></li>";
      }).join("");
      return "<li>" + opener("s-row",
        '<span class="s-n">' + esc(G.tn(a.name)) + "<small>" + a.n + (a.n === 1 ? G.L(" titolo", " headline") : G.L(" titoli", " headlines")) + "</small></span>" +
        '<span class="s-bar" aria-hidden="true"><i class="b-pos" style="width:' + pp.toFixed(1) + '%"></i><i class="b-neu" style="width:' + (100 - pp - ng).toFixed(1) + '%"></i><i class="b-neg" style="width:' + ng.toFixed(1) + '%"></i></span>' +
        '<span class="s-t ' + tone[1] + '">' + tone[0] + '</span><span class="sr-only">: ' + a.pos + G.L(" positivi, ", " positive, ") + a.neu + G.L(" neutri, ", " neutral, ") + a.neg + G.L(" negativi", " negative") + "</span>",
        '<ul class="s-news">' + news + "</ul>") + "</li>";
    }).join("") + '</ul><p class="t-note">' + G.L("Verde i titoli positivi, grigio i neutri, rosso i negativi. FinBERT è un modello per testi finanziari in inglese: legge solo il titolo e sbaglia con ironia, domande e titoli acchiappaclic. Dice il tono delle notizie, non dove andrà il prezzo.",
      "Green for positive headlines, grey for neutral, red for negative. FinBERT is a model for financial texts in English: it reads only the headline and gets irony, questions and clickbait wrong. It gives the tone of the news, not where the price will go.") + "</p>";
  }

  // documenti SEC: gli ultimi depositati da un gruppo di grandi società Usa
  function renderSec(sc) {
    if (!sc || !Array.isArray(sc.filings)) return hide("p-sec", "SEC");
    srcLine("sc-src", sc, G.en ? "SEC EDGAR, last " + (sc.days || 30) + " days, " + ((sc.companies || []).length || "some") + " large US companies"
      : "SEC EDGAR, ultimi " + (sc.days || 30) + " giorni, " + ((sc.companies || []).length || "alcune") + " grandi società Usa");
    $("sc").innerHTML = sc.filings.length ? '<ol class="sec-list">' + sc.filings.slice(0, 25).map((f) =>
      '<li><span class="sec-d">' + esc(G.dayOnly(f.date)) + '</span><span class="sec-k">' + esc(f.ticker) + "</span>" +
      '<span class="sec-b">' + ext(f.url, f.company + ": " + f.what) + "<small>" + esc(f.form) + "</small></span></li>").join("") + "</ol>"
      : '<p class="t-na">' + G.L("Nessun documento negli ultimi giorni.", "No filings in recent days.") + "</p>";
  }
  // le righe che si aprono, in tutti i pannelli nuovi
  P.on(document, "click", (e) => {
    const b = e.target.closest(".q-row, .s-row");
    if (b) G.toggle(b);
  });

  // ---------- sezioni, comandi e tasti funzione ----------
  // indici, valute e materie prime stanno in «Prezzi e grafici»: il tasto apre il pannello sul gruppo giusto
  // i comandi valgono in italiano e in inglese
  const GROUP_CMD = { INDICI: "indici", VALUTE: "valute", CAMBI: "valute", MATERIE: "materie", "MATERIE PRIME": "materie", CRIPTO: "cripto", "TASSI USA": "tassi",
    INDICES: "indici", CURRENCIES: "valute", FX: "valute", COMMODITIES: "materie", CRYPTO: "cripto", "US RATES": "tassi" };
  const PANELS = { MAPPA: "map-panel", TASSI: "p-tassi", AGENDA: "p-agenda", CALENDARIO: "p-agenda", FOREX: "p-agenda", "FOREX FACTORY": "p-agenda", FF: "p-agenda", NOTIZIE: "p-notizie",
    GRAFICI: "p-grafici", PREZZI: "p-grafici", MACRO: "p-macro", FRED: "p-macro", SENTIMENT: "p-sentiment", FINBERT: "p-sentiment", TONO: "p-sentiment", SEC: "p-sec", EDGAR: "p-sec", TITOLI: "p-titoli", IDEE: "p-titoli",
    MAP: "map-panel", RATES: "p-tassi", YIELDS: "p-tassi", CALENDAR: "p-agenda", NEWS: "p-notizie", CHARTS: "p-grafici", PRICES: "p-grafici", TONE: "p-sentiment", STOCKS: "p-titoli" };
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function go(id) {
    const el = $(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
  }
  // il gruppo si cambia prima di scorrere: quello che cambia altezza sta sotto il punto d'arrivo e niente si sposta
  function openGroup(k) {
    if (k !== grKey && (!quotes || quotes.groups.some((g) => g.key === k))) {
      grKey = k;
      G.ls.set("gerico.grGroup", k);
      if (quotes) {
        $("gr-tabs").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.g === grKey)));
        G.seg($("gr-tabs"), true);
        drawGroup();
      }
    }
    go("p-grafici");
  }
  function run(raw) {
    const c = String(raw || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!c) return;
    let ok = true;
    if (c === "MAPPA EUROPA" || c === "EUROPA" || c === "EUROPE MAP" || c === "MAP EUROPE" || c === "EUROPE") { setView("europa"); go("map-panel"); }
    else if (c === "MAPPA MONDO" || c === "MONDO" || c === "WORLD MAP" || c === "MAP WORLD" || c === "WORLD") { setView("mondo"); go("map-panel"); }
    else if (GROUP_CMD[c] && !$("p-grafici").hidden) openGroup(GROUP_CMD[c]);
    else if (PANELS[c] && $(PANELS[c]) && !$(PANELS[c]).hidden) go(PANELS[c]);
    else if (c === "TASSI" && !$("p-grafici").hidden) openGroup("tassi");
    else {
      const q = findQuote(c);
      if (q) {
        if (q.g !== grKey) { grKey = q.g; $("gr-tabs").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.g === grKey))); G.seg($("gr-tabs"), true); }
        drawGroup(q.it.sym);
        go("p-grafici");
      } else ok = false;
    }
    $("cmd-help").textContent = ok ? "" : G.L("Non trovato. Prova: mappa europa, valute, agenda, grafici, macro, sentiment, sec, oppure un simbolo come eurusd, oro, bitcoin.",
      "Not found. Try: europe map, currencies, calendar, charts, macro, sentiment, sec, or a symbol such as eurusd, gold, bitcoin.");
  }
  $("cmd-form").addEventListener("submit", (e) => { e.preventDefault(); run($("cmd").value); $("cmd").value = ""; });
  document.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => run(b.dataset.cmd)));
  const FKEYS = { F1: "MAPPA", F2: "INDICI", F3: "VALUTE", F4: "TASSI", F5: "MATERIE PRIME", F6: "AGENDA", F7: "NOTIZIE", F8: "MACRO", F9: "SENTIMENT" };
  P.on(document, "keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape" && inside.code && !document.querySelector("dialog[open]")) { e.preventDefault(); leave(); return; }
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
    copy.innerHTML = '<a href="https://' + G.L("it", "www") + '.tradingview.com/" rel="noopener nofollow" target="_blank">' + G.L("Prezzi forniti da TradingView", "Prices by TradingView") + "</a>";
    wrap.appendChild(copy);
    const sc = document.createElement("script");
    sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    sc.async = true;
    sc.textContent = JSON.stringify({ symbols: TV_SYMBOLS, showSymbolLogo: false, isTransparent: true, displayMode: "adaptive", colorTheme: "dark", locale: G.L("it", "en") });
    wrap.appendChild(sc);
    box.appendChild(wrap);
    $("live-btn").textContent = G.L("Nascondi i prezzi in diretta", "Hide live prices");
    $("live-btn").setAttribute("aria-expanded", "true");
  }
  function unloadTV() { $("tv").innerHTML = ""; $("live-btn").textContent = G.L("Prezzi in diretta", "Live prices"); $("live-btn").setAttribute("aria-expanded", "false"); }
  $("live-btn").addEventListener("click", () => {
    if ($("tv").childElementCount) { unloadTV(); G.ls.set("gerico.live", false); }
    else { loadTV(); G.ls.set("gerico.live", true); }
  });
  $("live-btn").setAttribute("aria-expanded", "false");
  if (G.ls.get("gerico.live", false)) loadTV();

  // ---------- avvio ----------
  if (location.hash === "#europa") state.view = "europa";
  // swipe sulla mappa: la vista intera (mappa con l'anello sulla Borsa scelta, legenda, valori, dettaglio) è una pagina;
  // l'altra vista sta accanto, già disegnata, e arriva con il dito. L'interruttore Mondo/Europa la segue.
  // Toccando l'interruttore invece i quadrati si spostano da una vista all'altra
  let mapPeek = null;
  const otherView = (d) => (d > 0 ? (state.view !== "europa" ? "europa" : "") : state.view === "europa" ? "mondo" : "");
  // la vista accanto: mappa con l'anello sulla Borsa scelta, legenda, valori e dettaglio, disegnati come quelli veri
  const buildView = (d) => {
    const view = otherView(d);
    if (!wt || !view) return null;
    const items = G.mapItems(wt, tm, view, qt0), sel = selIn(items, state.sel), panel = $("map-panel");
    const p = document.createElement("div");
    p.className = "t-view t-peek";
    p.setAttribute("aria-hidden", "true");
    const lg = $("legend").cloneNode(true);
    lg.removeAttribute("id");
    p.innerHTML = '<div class="t-mapwrap has-ring"><div class="t-map tmap"></div><div class="t-ring"></div></div>' + lg.outerHTML +
      '<div class="t-vals"></div><div class="t-detail">' + detailHTML(items, sel, view) + "</div>";
    p.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    p.style.width = $("mapview").getBoundingClientRect().width + "px";
    panel.appendChild(p);
    const drawn = G.drawMap(p.querySelector(".t-map"), items, { interactive: false, selected: sel }) || [];
    p.querySelector(".t-vals").innerHTML = valsHTML(items, sel, drawn);
    const rects = byCode(drawn), s = rects[sel], ring = p.querySelector(".t-ring");
    if (s) { ring.style.left = s.x + "px"; ring.style.top = s.y + "px"; ring.style.width = s.w + "px"; ring.style.height = s.h + "px"; }
    else ring.remove();
    return p;
  };
  // al decimale di pixel, alla stessa altezza della vista che esce (ritagliata finché il dito trascina)
  const placeView = (p) => {
    const mv = $("mapview"), panel = $("map-panel"), r = mv.getBoundingClientRect(), b = panel.getBoundingClientRect();
    p.style.top = (r.top - b.top - panel.clientTop) + "px";
    p.style.left = (r.left - b.left - panel.clientLeft) + "px";
    p.style.width = r.width + "px";
    p.style.height = r.height + "px";
  };
  mapPrep = preparer((d) => { const v = otherView(d); return v ? [v, state.sel, qt0 && qt0.asOf, $("map").clientWidth].join("|") : ""; }, buildView, placeView);
  mapSwipe = G.swipe($("mapview"), {
    follow: () => [$("mapview")],
    canNext: () => state.view !== "europa", canPrev: () => state.view === "europa",
    peek: (d) => (mapPeek = mapPrep.take(d)),
    drop: (el) => { el.remove(); mapPrep.soon(); },
    commit: (d) => {
      const v = d > 0 ? "europa" : "mondo";
      state.view = v; G.ls.set("gerico.mapView", v);
      drawMap(false);
      releaseHeight($("mapview"));
    },
    progress: (p, d, anim) => {
      G.segFollow(document.querySelector("#map-panel .t-seg"), p, d, anim);
      if (anim) swipeHeight($("mapview"), mapPeek, p >= 1, anim);
    }
  });
  drawMap(false);
  size = $("map").clientWidth + "x" + $("map").clientHeight;
  if (hashCode() && ixInfo(hashCode())) enter(hashCode(), { instant: true });
  rates();
  // tassi e agenda compaiono quando hanno i dati (CSS .t-board.ready): le tabelle non spingono giù i pannelli sotto
  showSide();
  renderAgenda();
  P.every(renderAgenda, 30000);
  renderNews();
  // i dati del job arrivano dopo: stanno più in basso e non devono ritardare la mappa
  // arrivando da un'altra pagina, i pannelli sotto (grafici, macro, notizie della SEC) si disegnano a passaggio finito:
  // mentre le pagine si spingono il telefono non ha altro da fare
  const settled = window.gericoVT && window.gericoVT.finished ? window.gericoVT.finished.catch(() => {}) : Promise.resolve();
  Promise.all([G.load("quotes"), G.load("macro"), G.load("sentiment"), G.load("sec"), G.load("titoli"), G.load("titoli-storico"), settled]).then(([qt, mc, se, sc, ti, th]) => {
    if (G.titoliFresh(ti)) {
      $("ti").innerHTML = G.titoliHTML(ti, th);
      $("p-titoli").hidden = false;
      const chip = document.querySelector('[data-cmd="TITOLI"]');
      if (chip) chip.hidden = false;
    }
    [[renderQuotes, qt], [renderMacro, mc], [renderSentiment, se], [renderSec, sc]].forEach(([fn, d]) => {
      try { fn(d); } catch (e) { /* un pannello rotto non ferma gli altri */ }
    });
  });
  renderStatus();
  G.afterIntro(() => countUp(document.body));

  // prezzi nuovi a pagina aperta (job «Prezzi», ogni mezz'ora): mappa, tabelle, grafici e riga dei dati, senza animazioni
  const tables = () => {
    rates();
  };
  G.liveQuotes(P, qt0 && qt0.asOf, (q) => {
    qt0 = q; mk = G.withQuotes(mk0, q);
    drawMap(false);
    tables();
    updateQuotes(q);
    renderStatus();
  });
});
