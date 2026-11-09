/* GERICO Terminal: mappa a quadrati, pannelli, scorciatoie da tastiera (F1-F9) e comandi, prezzi in diretta al clic. */
G.page("terminal", async function (P) {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);
  G.initPrefs();

  // ---------- orologio ----------
  const tick = () => { $("clock").textContent = "Roma, " + G.romeNow().hm; };
  tick();
  P.every(tick, 30000);

  // legenda: una barra sola da −1% a +1%, i colori sono quelli dei quadrati (non dipende dai dati: subito, senza salti)
  const stops = G.BANDS.map(([c], k) => c + " " + ((2 * k + 1) * 100 / 12).toFixed(2) + "%").join(", ");
  $("legend").innerHTML = '<span class="t-grad" aria-hidden="true"><i style="background:linear-gradient(90deg, ' + stops + ')"></i>' +
    '<span class="t-ticks"><span style="left:16.67%">−1%</span><span style="left:50%">0</span><span style="left:83.33%">+1%</span></span></span>' +
    '<span class="t-nd"><i style="background:' + G.NO_DATA + '"></i>nessun dato</span>' +
    '<span class="sr-only">Rosso se la Borsa è scesa, verde se è salita: più è intenso, più è ampia la variazione, fino a 1% o più. Grigio se oggi non c\'è il dato.</span>';

  // la colonna di lato compare con i dati (più sotto); se qualcosa si rompe prima, compare comunque
  const showSide = () => { const side = document.querySelector(".t-side"); if (side) side.classList.add("ready"); };
  P.later(showSide, 2000);
  // anche le quotazioni del job: alla mappa servono per le Borse che mancano nella pubblicazione (è un file piccolo)
  const [ed, mk0, ag, tm, wt, qtFirst, ff] = await Promise.all([G.load("edition"), G.load("markets"), G.load("agenda"), G.load("terminal"), G.load("weights"), G.load("quotes"), G.load("calendario")]);
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
  function renderDetail(items) { $("detail").innerHTML = detailHTML(items, state.sel, state.view); }
  function detailHTML(items, sel, view) {
    const it = items.find((x) => x.code === sel);
    if (!it) return "<p>Tocca un quadrato per vedere il dettaglio.</p>";
    const basis = view === "europa" ? "MSCI Europe" : "MSCI ACWI";
    const cg = typeof it.chg === "number"
      ? '<b class="' + (it.chg > 0 ? "t-up" : it.chg < 0 ? "t-down" : "") + '">' + G.pct(it.chg) + "</b>"
      : "nessun dato oggi";
    let html = "<p><b>" + esc(it.name) + "</b>" + (it.index ? ", " + esc(it.index) : "") + ": " + cg + ". Peso " + G.wt(it.value) + " nell'indice " + basis + ".</p>";
    if (typeof it.last === "number") {
      const lv = ["ultimo " + G.price(it.sym, it.last)].concat(typeof it.open === "number" ? ["apertura " + G.price(it.sym, it.open)] : [], typeof it.prev === "number" ? ["chiusura precedente " + G.price(it.sym, it.prev)] : []);
      html += "<p>" + esc(G.cap(lv.join(" · "))) + ".</p>";
    }
    if (it.note) html += "<p>" + esc(it.note) + "</p>";
    else if (it.time) html += "<p>Dato delle " + esc(it.time) + ".</p>";
    const s = linkedStory(it.code);
    if (s) html += '<p>Storia collegata: <a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + "</a></p>";
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
  const subText = (view) => "Ogni quadrato è una Borsa: più è grande, più pesa nell'indice " + (view === "europa" ? "europeo MSCI Europe" : "mondiale MSCI ACWI") + ".";
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
      $("map-sub").textContent = "I pesi della mappa non sono disponibili in questo momento.";
      $("map").innerHTML = "";
      $("detail").innerHTML = "";
      return;
    }
    const items = G.mapItems(wt, tm, state.view, qt0);
    state.sel = selIn(items, state.sel);
    const before = how === "flip" && !G.reduced() && lastRects ? byCode(lastRects) : null;
    const rects = G.drawMap($("map"), items, { interactive: true, selected: state.sel }) || [];
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
    $("map-sub").textContent = subText(state.view);
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
    const mv = $("mapview"), h0 = mv.offsetHeight;
    state.sel = b.dataset.code;
    G.ls.set("gerico.mapSel", state.sel);
    drawMap(e.currentTarget.id === "map", "select");
    easeHeight(mv, h0, 300);
  };
  $("map").addEventListener("click", pickTile);
  $("vals").addEventListener("click", pickTile);
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
    if (!mk) { $(target).innerHTML = '<p class="t-na">Dati di mercato non disponibili.</p>'; return; }
    const items = c ? (c.items || []).filter((it) => !(skip && skip(it))) : [];
    if (!items.length) { $(target).innerHTML = '<p class="t-na t-warn">' + esc((c && c.note) || "Nessun dato verificato in questo aggiornamento.") + "</p>"; return; }
    const common = commonNote(items);
    const notes = items.map((it) => ownNote(it.note, common));
    const rows = items.map((it, i) => {
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

  // Tassi a 10 anni: Btp, Bund e spread. Il Treasury a 10 anni sta in «Prezzi e grafici» (Tassi Usa), con il grafico:
  // qui non si ripete. Se resta solo lui, il pannello sparisce e il tasto Tassi apre i Tassi Usa
  const tnxIn = () => !!(qt0 && (qt0.groups || []).some((g) => (g.items || []).some((it) => it.sym === "^TNX" && typeof it.last === "number")));
  const treasury = (it) => /treasury/i.test(it.name || "") && tnxIn();
  function rates() {
    table("obbligazioni", ["Titolo", "Rendimento", "Punti base"], "rt", "Rosso: rendimenti in salita, cioè prezzi in calo.", treasury);
    const c = cls("obbligazioni"), all = c ? (c.items || []) : [];
    $("p-tassi").hidden = all.length > 0 && all.every(treasury);
  }

  // una riga dell'agenda: ora, valuta, evento con i numeri sotto, impatto
  function agendaRow(o) {
    const cls = [o.past ? "past" : "", o.imp === "alto" ? "hi" : "", o.next ? "next" + (o.soon ? " soon" : "") : ""].filter(Boolean).join(" ");
    return '<li' + (cls ? ' class="' + cls + '"' : "") + '><span class="tm">' + esc(o.time || "—") + "</span><span>" + esc(o.cur || "") +
      '</span><span class="ev">' + esc(o.ev) + (o.nums ? "<small>" + esc(o.nums) + "</small>" : "") + '</span><span class="im ' + (o.imp || "") + '">' + esc(G.cap(o.imp || "")) + "</span></li>";
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
      nums: [it.expected ? "atteso " + it.expected : "", it.previous ? "precedente " + it.previous : "", it.actual ? "effettivo " + it.actual : ""].filter(Boolean).join(" · "),
      imp: ["alto", "medio", "basso"].includes(it.impact) ? it.impact : "" }));
    const own = rows.length;
    ffToday.forEach((it) => {
      const m = hmMin(it.time), nums = [it.forecast ? "previsione " + it.forecast : "", it.previous ? "precedente " + it.previous : ""].filter(Boolean).join(" · ");
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
      left = mins <= 0 ? "adesso" : mins < 60 ? "tra " + mins + " min" : "tra " + Math.floor(mins / 60) + " h " + String(mins % 60).padStart(2, "0") + " min";
    }
    $("next").classList.toggle("soon", soon);
    $("next").innerHTML = next ? "Prossimo ad alto impatto: <b>" + esc(next.time + " " + next.cur) + "</b> · " + esc(left) : "";
    $("ag-h").textContent = "Agenda di oggi";
    // un'agenda che manca o è troppo corta si dice in chiaro: chi la usa per i dati ad alto impatto deve saperlo
    const wd = G.romeNow().wd;
    const warn = hasAg && !today ? "L'agenda di GERICO di oggi non è ancora arrivata."
      : !ffOk && wd >= 1 && wd <= 5 && own < 3 ? "Agenda forse incompleta: controlla gli orari dei dati ad alto impatto su un calendario economico." : "";
    let html = warn ? '<p class="t-na t-warn">' + esc(warn) + "</p>" : "";
    html += rows.length ? '<ol class="t-agenda">' + rows.map((r) => agendaRow(Object.assign({}, r, { past: !!r.time && r.time < now, next: r === next, soon }))).join("") + "</ol>"
      : '<p class="t-na">' + (ffOk || today ? "Oggi nessun evento ad alto o medio impatto." : "L'agenda di oggi non è ancora disponibile.") + "</p>";
    if (ffWeek.length) {
      const nums = (it) => [it.forecast ? "previsione " + it.forecast : "", it.previous ? "precedente " + it.previous : ""].filter(Boolean).join(" · ");
      // la tendina dei giorni dopo resta aperta o chiusa come l'ha lasciata chi legge, anche quando l'agenda si aggiorna
      const open = !!document.querySelector("#ag .t-ff-week[open]");
      let last = "";
      const week = ffWeek.map((it) => {
        let day = "";
        if (it.date !== last) { last = it.date; day = '<li class="t-day">' + esc(G.cap(G.weekday(it.date + "T12:00:00Z")) + " " + G.dayOnly(it.date)) + "</li>"; }
        return day + agendaRow({ time: it.time, cur: it.currency, ev: it.title, nums: nums(it), imp: it.impact });
      }).join("");
      html += '<details class="t-ff-week"' + (open ? " open" : "") + "><summary>Prossimi giorni, impatto alto (" + ffWeek.length + ')</summary><ol class="t-agenda">' + week + "</ol></details>";
    }
    // da dove viene: una nota sola per le due fonti
    const srcs = (today ? (ag.sources || []).filter((x) => x && x.url).slice(0, 2).map((x) => ext(x.url, String(x.name || "").split(",")[0])) : [])
      .concat(ffOk ? [ext("https://www.forexfactory.com/calendar", "Forex Factory") + " (letto " + esc(G.when(ff.asOf)) + ")"] : []);
    html += '<p class="t-note">' + (srcs.length ? "Fonti: " + srcs.join(", ") + ". " : "") + "Orari in ora italiana" + (ffOk ? "; da Forex Factory solo impatto alto e medio" : "") + "." +
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
    $("st-line").textContent = !asOf ? "Dati non disponibili"
      : qt0 && asOf === qt0.asOf ? "Prezzi aggiornati " + G.when(asOf) + ", ogni mezz'ora nelle ore di Borsa"
      : "Aggiornato " + G.when(asOf) + " · prossimo " + G.nextUpdate();
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
  let quotes = null, grKey = G.ls.get("gerico.grGroup", "valute"), grPrep = null, grVer = 0;
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
      '<dl class="q-stats">' +
      (typeof it.open === "number" ? "<div><dt>Apertura</dt><dd>" + (rates ? G.num(it.open, 2) + "%" : G.price(it.sym, it.open)) + "</dd></div>" : "") +
      (typeof it.prev === "number" ? "<div><dt>Chiusura prima</dt><dd>" + (rates ? G.num(it.prev, 2) + "%" : G.price(it.sym, it.prev)) + "</dd></div>" : "") +
      '<div><dt>1 settimana</dt><dd>' + per("1w") + "</dd></div><div><dt>1 mese</dt><dd>" + per("1m") + "</dd></div><div><dt>3 mesi</dt><dd>" + per("3m") + "</dd></div>" +
      "<div><dt>Massimo</dt><dd>" + (typeof it.hi === "number" ? (rates ? G.num(it.hi, 2) + "%" : G.price(it.sym, it.hi)) : "n.d.") + "</dd></div>" +
      "<div><dt>Minimo</dt><dd>" + (typeof it.lo === "number" ? (rates ? G.num(it.lo, 2) + "%" : G.price(it.sym, it.lo)) : "n.d.") + "</dd></div></dl>" +
      '<p class="t-note">' + (it.at ? "Ultimo prezzo " + esc(G.when(it.at)) + ". " : "") + ext(it.url, "Vedi su Yahoo Finance") + "</p></div>";
    return '<li class="q" data-sym="' + esc(it.sym) + '">' + opener("q-row",
      '<span class="q-n">' + esc(it.name) + (it.stale ? "<small>fermo al " + esc(G.dayOnly(it.date)) + "</small>" : "") + '</span><span class="q-sp ' + tr + '">' + G.spark(it.spark, 72, 24, "sp") + "</span>" +
      '<span class="q-v">' + esc(val) + '</span><span class="q-c ' + (good > 0 ? "t-up" : good < 0 ? "t-down" : "") + '">' + esc(mv) + "</span>", big) + "</li>";
  }
  // un gruppo di strumenti: lo stesso elenco per la pagina e per il gruppo accanto durante lo swipe
  function groupMarkup(key) {
    const g = quotes.groups.find((x) => x.key === key) || quotes.groups[0];
    const rates = g.key === "tassi";
    return '<p class="q-head" aria-hidden="true"><span>Strumento</span><span>3 mesi</span><span>Ultimo</span><span>Oggi</span></p><ul class="q-list">' +
      g.items.map((it) => quoteRow(it, rates)).join("") + "</ul>" +
      (rates ? '<p class="t-note">Rendimenti dei titoli di Stato Usa. Rosso: rendimenti in salita, cioè prezzi in calo.</p>' : "");
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
    srcLine("gr-src", qt, "Yahoo Finance, tramite yfinance. Grafici di tre mesi, una chiusura al giorno");
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
    srcLine("gr-src", qt, "Yahoo Finance, tramite yfinance. Grafici di tre mesi, una chiusura al giorno");
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
  // doppioni: il Treasury a 10 anni e il dollaro stanno già in «Prezzi e grafici», con il dato del giorno e il grafico
  const MACRO_DUP = { DGS10: "^TNX", DTWEXBGS: "DX-Y.NYB" };
  const inCharts = (sym) => !!(quotes && quotes.groups.some((g) => (g.items || []).some((it) => it.sym === sym && typeof it.last === "number")));
  function renderMacro(mc) {
    const ss = ((mc && mc.series) || []).filter((s) => !(MACRO_DUP[s.id] && inCharts(MACRO_DUP[s.id])));
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
  P.on(document, "click", (e) => {
    const b = e.target.closest(".q-row, .s-row");
    if (b) G.toggle(b);
  });

  // ---------- sezioni, comandi e tasti funzione ----------
  // indici, valute e materie prime stanno in «Prezzi e grafici»: il tasto apre il pannello sul gruppo giusto
  const GROUP_CMD = { INDICI: "indici", VALUTE: "valute", CAMBI: "valute", MATERIE: "materie", "MATERIE PRIME": "materie", CRIPTO: "cripto", "TASSI USA": "tassi" };
  const PANELS = { MAPPA: "map-panel", TASSI: "p-tassi", AGENDA: "p-agenda", CALENDARIO: "p-agenda", FOREX: "p-agenda", "FOREX FACTORY": "p-agenda", FF: "p-agenda", NOTIZIE: "p-notizie",
    GRAFICI: "p-grafici", PREZZI: "p-grafici", MACRO: "p-macro", FRED: "p-macro", SENTIMENT: "p-sentiment", FINBERT: "p-sentiment", TONO: "p-sentiment", SEC: "p-sec", EDGAR: "p-sec", TITOLI: "p-titoli", IDEE: "p-titoli" };
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
    if (c === "MAPPA EUROPA" || c === "EUROPA") { setView("europa"); go("map-panel"); }
    else if (c === "MAPPA MONDO" || c === "MONDO") { setView("mondo"); go("map-panel"); }
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
    $("cmd-help").textContent = ok ? "" : "Non trovato. Prova: mappa europa, valute, agenda, grafici, macro, sentiment, sec, oppure un simbolo come eurusd, oro, bitcoin.";
  }
  $("cmd-form").addEventListener("submit", (e) => { e.preventDefault(); run($("cmd").value); $("cmd").value = ""; });
  document.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => run(b.dataset.cmd)));
  const FKEYS = { F1: "MAPPA", F2: "INDICI", F3: "VALUTE", F4: "TASSI", F5: "MATERIE PRIME", F6: "AGENDA", F7: "NOTIZIE", F8: "MACRO", F9: "SENTIMENT" };
  P.on(document, "keydown", (e) => {
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
  rates();
  // la colonna di lato compare quando ha i dati (CSS .t-side.ready): le tabelle non spingono giù i pannelli sotto
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
