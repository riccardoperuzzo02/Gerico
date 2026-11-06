/* GERICO: prima pagina. Una notizia in evidenza, le altre in elenco, i mercati in un riquadro piccolo. */
G.page("home", async function (P) {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);

  G.initPrefs();

  const [ed, mk, qt, br, au, tit, tsh, ff, ag] = await Promise.all([G.load("edition"), G.load("markets"), G.load("quotes"), G.load("brevi"), G.load("audio"),
    G.load("titoli"), G.load("titoli-storico"), G.load("calendario"), G.load("agenda")]);
  if (!ed || !Array.isArray(ed.stories)) {
    $("feed").innerHTML = '<div class="empty"><h2>L\'edizione non si è caricata.</h2><p>Può essere la connessione. Riprova tra poco.</p>' +
      '<p><button type="button" class="btn-retry" id="retry">Riprova</button></p></div>';
    $("retry").addEventListener("click", () => location.reload());
    $("side").innerHTML = "";
    $("ticker").hidden = true;
    $("listen").hidden = true;
    return;
  }
  const stories = ed.stories.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const lastRun = ed.lastRun;
  const firstRun = G.firstRunToday(stories);
  const state = { section: "tutte", follows: G.follows() };
  // le brevi valgono per il giorno in cui sono uscite: più vecchie di 30 ore non si mostrano
  const brevi = br && Array.isArray(br.items) && G.hoursAgo(br.asOf) < 30 ? br.items.filter((b) => b && b.title && G.safeUrl(b.url)) : [];
  const live = new Set(stories.map((s) => s.id));
  const archive = (Array.isArray(ed.archive) ? ed.archive : []).filter((s) => s && s.id && s.title && !live.has(s.id));

  // ---------- edizione ----------
  if (lastRun) {
    G.setEdition(lastRun);
    const edl = document.querySelector("#edition-line .ed-l");
    // «Mercoledì 28 ottobre · ore 7:23»: sta in una riga anche sul telefono
    if (edl) edl.textContent = edl.textContent.replace(" · edizione delle ", " · ore ");
    // «Oggi» solo sopra l'edizione di oggi; per le altre il giorno (la data e l'ora sono nella riga accanto)
    const age = G.dayAge(lastRun);
    if (age > 0) {
      const name = age === 1 ? "Ieri" : age < 7 ? G.cap(G.weekday(lastRun)) : "Ultima edizione";
      $("large-title").textContent = name;
      const tt = document.querySelector(".top-title");
      if (tt) tt.textContent = name;
    }
  }

  // ---------- sezioni (senza numeri) ----------
  // le schede della prima pagina, in quest'ordine dopo Tutte; Economia comprende anche le storie dei mercati
  const TABS = [["economia", ["economia", "mercati"]], ["mondo", ["mondo"]], ["italia", ["italia"]], ["tecnologia", ["tecnologia"]]];
  const TAB_OF = {};
  TABS.forEach(([k, secs]) => secs.forEach((x) => { TAB_OF[x] = k; }));
  const inTab = (sec) => TAB_OF[sec] === state.section;
  const sectionFromHash = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    return h === "seguiti" ? h : TAB_OF[h] || "tutte";
  };
  const follows = (s) => (s.tags || []).some((t) => state.follows.includes(t));
  const followed = () => stories.filter(follows);
  const visible = () => {
    if (state.section === "tutte") return stories;
    if (state.section === "seguiti") return followed();
    return stories.filter((s) => inTab(s.section));
  };
  // le brevi non hanno temi: nei Seguiti non compaiono
  const visibleBrevi = () => (state.section === "seguiti" ? [] : brevi.filter((b) => state.section === "tutte" || inTab(b.section))).slice(0, 15);
  const visiblePast = () => (state.section === "tutte" ? archive : archive.filter((s) => (state.section === "seguiti" ? follows(s) : inTab(s.section)))).slice(0, 8);
  function buildNav() {
    const items = [["tutte", "Tutte"]];
    const has = (secs) => stories.some((s) => secs.includes(s.section)) || brevi.some((b) => secs.includes(b.section));
    TABS.forEach(([k, secs]) => { if (has(secs)) items.push([k, G.SECTIONS[k]]); });
    if (state.follows.length) items.push(["seguiti", "Seguiti"]);
    $("sections").innerHTML = items.map(([k, label]) => '<a href="' + (k === "tutte" ? "#" : "#" + k) + '" data-sec="' + k + '">' + esc(label) + "</a>").join("");
  }
  // quiet: indicatore e binario li sta già muovendo lo swipe (G.segFollow)
  function markNav(k, quiet) {
    const on = k || state.section, box = $("sections");
    box.querySelectorAll("a").forEach((a) => { if (a.dataset.sec === on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (!quiet && G.seg) G.seg(box);
  }

  // ---------- notizie: occhiello sopra il titolo, come nei siti all-news ----------
  // sezione in maiuscolo e ora dell'ultimo aggiornamento; «Aggiornata» in rosso quando la storia è cambiata oggi
  const ago = (iso) => (G.isToday(iso) ? G.hm(iso) : G.dayAge(iso) === 1 ? "ieri" : G.day(iso));
  function kicker(s, showSection) {
    const parts = [];
    if (showSection) parts.push('<span class="k-sec">' + esc(G.secLabel(s.section)) + "</span>");
    const upd = G.updatedLabel(s, firstRun);
    if (upd) parts.push('<span class="k-live">' + esc(upd) + "</span>");
    else if (s.updated) parts.push('<span class="k-time">' + esc(ago(s.updated)) + "</span>");
    return parts.length ? '<p class="kick">' + parts.join("") + "</p>" : "";
  }
  // sotto il titolo: il muro delle testate e quante concordano
  function line(s) {
    return '<p class="line"><span class="agr">' + G.miniWall(s.sources) + '<span class="agr-t">' + esc(G.agreeLine(s.sources)) + "</span></span>" +
      (G.counts(s.sources).divergente ? '<span class="badge">Versioni diverse</span>' : "") + "</p>";
  }
  const link = (s) => '<a href="' + G.storyUrl(s) + '" data-id="' + esc(s.id) + '" data-sec="' + esc(G.secLabel(s.section)) + '">' + esc(G.headline(s)) + "</a>";
  // al primo caricamento le notizie entrano una dopo l'altra (le prime 8); cambiando sezione solo una dissolvenza
  // arrivando da un'altra pagina del sito c'è già la transizione: niente entrata a cascata
  let first = !G.soft;
  function leadHTML(s, showSection) {
    return '<article class="lead' + (first ? " reveal" : "") + '" style="--i:0">' + kicker(s, showSection) + "<h2>" + link(s) + "</h2>" +
      '<p class="sum">' + esc(G.firstSentences(s.summary, 220)) + "</p>" + line(s) + "</article>";
  }
  function itemHTML(s, showSection, i) {
    return '<li class="item' + (first && i < 8 ? " reveal" : "") + '" style="--i:' + Math.min(i, 8) + '">' + kicker(s, showSection) + "<h2>" + link(s) + "</h2>" + line(s) + "</li>";
  }
  // brevi: l'ora a sinistra e la notizia in una riga, con il link all'articolo, da una sola testata
  function breviHTML(items, showSection) {
    if (!items.length) return "";
    return '<section class="blk" aria-labelledby="brevi-h"><h2 class="blk-h" id="brevi-h">In breve</h2>' +
      '<p class="blk-sub">Notizie lette su una sola testata: GERICO non le ha ancora confrontate.</p><ul class="brevi">' +
      items.map((b) => {
        const meta = [showSection ? G.secLabel(b.section) : "", b.source].filter(Boolean).map(esc).join(" · ");
        return '<li><span class="b-time' + (G.isToday(b.at) ? "" : " old") + '">' + esc(b.at ? ago(b.at) : "") + '</span><div class="b-body">' +
          '<a href="' + esc(G.safeUrl(b.url)) + '" target="_blank" rel="noopener">' + esc(b.title) + '<span class="sr-only"> (si apre il sito della testata)</span></a>' +
          (meta ? '<p class="b-m">' + meta + "</p>" : "") + "</div></li>";
      }).join("") + "</ul></section>";
  }
  // storie dei giorni scorsi: archiviate, ancora leggibili
  function pastHTML(items, showSection) {
    if (!items.length) return "";
    return '<section class="blk" aria-labelledby="past-h"><h2 class="blk-h" id="past-h">Nei giorni scorsi</h2><ul class="brevi past">' +
      items.map((s) => {
        const meta = [showSection ? G.secLabel(s.section) : "", s.updated ? G.cap(G.weekday(s.updated)) + " " + G.day(s.updated) : ""].filter(Boolean).map(esc).join(" · ");
        return '<li><a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + "</a>" + (meta ? '<p class="b-m">' + meta + "</p>" : "") + "</li>";
      }).join("") + "</ul></section>";
  }
  // titoli da seguire: un segnale sui prezzi e una notizia; in Tutte, Economia e Mercati
  function titoliHTML() {
    if (!G.titoliFresh(tit) || !["tutte", "economia", "mercati"].includes(state.section)) return "";
    return '<section class="blk tit" aria-labelledby="tit-h"><h2 class="blk-h" id="tit-h">Titoli da seguire</h2>' +
      '<p class="blk-sub">Un segnale sui prezzi e una notizia che possono muoverli nei prossimi giorni.</p>' + G.titoliHTML(tit, tsh) + "</section>";
  }
  // versione dell'elenco e sezioni accanto preparate per lo swipe (vedi prepareSoon)
  // alive: la prima pagina è ancora quella sullo schermo (i momenti liberi del browser non si spengono con la pagina)
  let feedVer = 0, prepTimer = 0, alive = true;
  const prepared = {};
  function renderFeed(viaTransition) {
    const feed = $("feed");
    feed.classList.remove("swap");
    if (!first && !viaTransition) { void feed.offsetWidth; feed.classList.add("swap"); }
    feed.innerHTML = feedMarkup();
    first = false;
    feedVer += 1;
    prepareSoon();
  }
  // il contenuto di un'altra sezione, uguale a quello che disegnerebbe renderFeed: la pagina accanto durante lo swipe
  function feedMarkupFor(sec) {
    const was = state.section, f = first;
    state.section = sec; first = false;
    try { return feedMarkup(); } finally { state.section = was; first = f; }
  }
  function feedMarkup() {
    const list = visible(), bl = visibleBrevi(), past = visiblePast();
    if (!list.length && !bl.length) {
      return (state.section === "seguiti"
        ? '<div class="empty"><h2>Nessuna storia sui temi che segui.</h2><p>I temi si seguono dalla pagina di ogni storia.</p></div>'
        : '<div class="empty"><h2>Nessuna storia in questa sezione.</h2><p><a href="#">Torna a tutte le notizie</a>.</p></div>') + pastHTML(past, true);
    }
    const all = state.section === "tutte" || state.section === "seguiti";
    // l'edizione ha una fine: si sa quando arrivano le prossime notizie
    const end = '<p class="end"><strong>' + (state.section === "tutte" ? "Fine dell'edizione." : "Fine della sezione.") + "</strong> Prossimo aggiornamento delle notizie " + esc(G.nextUpdate(true)) + ".</p>";
    const top = list.length
      ? leadHTML(list[0], all) + (list.length > 1 ? '<ol class="list">' + list.slice(1).map((s, i) => itemHTML(s, all, i + 1)).join("") + "</ol>" : "")
      : '<p class="none">Oggi in questa sezione non ci sono storie confrontate, solo brevi.</p>';
    return top + breviHTML(bl, all) + titoliHTML() + pastHTML(past, all) + end;
  }

  // ---------- ultim'ora: le notizie delle ultime ore scorrono in una fascia, come nei canali all-news ----------
  // brevi con l'ora e storie nuove o aggiornate delle ultime 18 ore; se sono poche, le più recenti comunque: la fascia c'è sempre
  function renderUltim() {
    const items = [];
    const ok = (iso) => !!iso && G.hoursAgo(iso) >= 0;
    brevi.forEach((b) => { if (ok(b.at)) items.push({ at: b.at, title: b.title, url: G.safeUrl(b.url), ext: true }); });
    stories.forEach((s) => {
      const at = G.realChange(s) ? s.updated : s.firstSeen;
      if (ok(at)) items.push({ at, title: G.headline(s), url: G.storyUrl(s) });
    });
    items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const recent = items.filter((it) => G.hoursAgo(it.at) < 18);
    const list = (recent.length >= 4 ? recent : items).slice(0, 12);
    // la fascia è nella pagina da subito, per non spingere giù le notizie quando arriva: senza notizie si toglie
    if (!list.length) { $("ultim").hidden = true; return; }
    const when = (iso) => { const a = G.dayAge(iso); return (a === 0 ? "" : a === 1 ? "ieri " : G.day(iso) + " ") + G.hm(iso); };
    const copy = (dup) => list.map((it) => '<a href="' + esc(it.url) + '"' + (it.ext ? ' target="_blank" rel="noopener"' : "") + (dup ? ' tabindex="-1"' : "") +
      "><b>" + esc(when(it.at)) + "</b>" + esc(it.title) + "</a>").join("");
    const t = $("ultim-t");
    t.innerHTML = '<span class="ultim-s">' + copy(false) + '</span><span class="ultim-s dup" aria-hidden="true">' + copy(true) + "</span>";
    $("ultim").hidden = false;
    // velocità costante, circa 60 pixel al secondo, qualunque sia la lunghezza della fascia
    requestAnimationFrame(() => t.style.setProperty("--dur", Math.max(25, Math.round(t.scrollWidth / 2 / 60)) + "s"));
    $("ultim-p").addEventListener("click", () => {
      const p = $("ultim").classList.toggle("paused");
      $("ultim-p").setAttribute("aria-pressed", String(p));
    });
  }

  // ---------- riepilogo a voce: il bollettino del mattino, letto da una voce sintetica ----------
  // l'audio si scarica solo quando lo chiedi; con il telefono bloccato si comanda dalla schermata di blocco
  // il lettore è uno solo per tutto il sito (G.player): qui la scheda lo comanda e ne mostra l'avanzamento
  function renderListen() {
    const box = $("listen");
    if (!au || !au.src || G.hoursAgo(au.asOf) > 30) { box.hidden = true; return; }
    const pl = G.player, btn = $("ls-btn");
    pl.set(au);
    const when = au.source || au.asOf;
    $("ls-t").textContent = pl.title();
    const mins = Math.max(1, Math.round((au.duration || 60) / 60));
    $("ls-s").textContent = "Notizie e mercati in " + (mins === 1 ? "un minuto" : mins + " minuti") + ", con l'aggiornamento delle " + G.hm(when);
    box.classList.remove("wait");
    btn.disabled = false;
    btn.addEventListener("click", () => pl.toggle());
    const paint = () => {
      const on = pl.playing(), d = pl.dur(), p = pl.pos();
      box.classList.toggle("playing", on);
      btn.setAttribute("aria-label", on ? "Metti in pausa il riepilogo" : p > 0 ? "Riprendi il riepilogo" : "Ascolta il riepilogo");
      $("ls-prog").style.transform = "scaleX(" + (d ? Math.min(1, p / d) : 0).toFixed(4) + ")";
      $("ls-time").textContent = d ? pl.mmss(Math.max(0, d - p)) : "";
    };
    P.add(pl.on(paint));
    paint();
    pl.card(box);
  }

  // ---------- striscia dei mercati: quattro numeri (sei sul computer), tocchi e si apre il Terminal ----------
  const QPICK = [["indici", "FTSEMIB.MI"], ["indici", "^GSPC"], ["valute", "EURUSD=X"], ["materie", "BZ=F"], ["materie", "GC=F"], ["cripto", "BTC-USD"]];
  function renderTicker() {
    const cells = [];
    let when = "";
    if (qt && Array.isArray(qt.groups) && G.hoursAgo(qt.asOf) < 30) {
      QPICK.forEach(([g, sym]) => {
        const grp = qt.groups.find((x) => x.key === g), it = grp && (grp.items || []).find((x) => x.sym === sym);
        if (!it || typeof it.last !== "number") return;
        cells.push({ name: it.name, value: G.price(it.sym, it.last, true), mv: typeof it.chg === "number" ? G.pct(it.chg) : "", tone: G.tone(it) });
      });
      when = G.when(qt.asOf);
    }
    if (cells.length < 4 && mk) {
      cells.length = 0;
      pick().forEach(({ it, key }) => cells.push({ name: G.shortName(it.name), value: G.cleanValue(it.value), mv: G.move(it).replace(" pb", ""), tone: G.tone(it, key) }));
      when = mk.asOf ? G.when(mk.asOf) : "";
    }
    if (!cells.length) { $("ticker").hidden = true; return; }
    $("tk-w").textContent = when ? " · " + when : "";
    $("tk-row").innerHTML = cells.slice(0, 6).map((c) => '<span class="tk"><span class="tk-n">' + esc(c.name) + '</span><span class="tk-v">' + esc(c.value) +
      '</span><span class="tk-c ' + (c.tone || "") + '">' + esc(c.mv || "—") + "</span></span>").join("");
    $("ticker").classList.remove("sk-tk");
  }

  // ---------- il prossimo dato ad alto impatto, in fondo al riquadro dei mercati ----------
  // da Forex Factory (orari già in ora italiana) e dall'agenda di GERICO: il primo che deve ancora uscire, oggi o nei giorni dopo
  function renderNext() {
    const el = $("tk-ev");
    if (!el) return;
    const day = G.dayKey(new Date()), now = G.romeNow().hm, list = [];
    if (ff && Array.isArray(ff.items) && G.hoursAgo(ff.asOf) < 8 * 24) {
      ff.items.forEach((it) => { if (it.impact === "alto" && (it.date > day || (it.date === day && it.time >= now))) list.push({ date: it.date, time: it.time, cur: it.currency, ev: it.title }); });
    }
    if (ag && Array.isArray(ag.items) && String(ag.date || "").slice(0, 10) === day) {
      ag.items.forEach((it) => { if (it.impact === "alto" && it.time && it.time >= now) list.push({ date: day, time: it.time, cur: it.currency || "", ev: it.event || "" }); });
    }
    list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const n = list[0];
    if (!n) { el.innerHTML = '<span class="tk-ev-l">Calendario</span> nessun dato ad alto impatto in arrivo questa settimana'; return; }
    let when = n.time;
    if (n.date !== day) when = G.weekday(n.date + "T12:00:00Z") + " " + n.time;
    else {
      const [hh, mm] = n.time.split(":").map(Number), mins = hh * 60 + mm - G.romeNow().min;
      if (mins < 60) when = n.time + " (" + (mins <= 0 ? "adesso" : "tra " + mins + " min") + ")";
    }
    el.innerHTML = '<span class="tk-ev-l">Alto impatto</span> <b>' + esc(when + " " + n.cur) + "</b> " + esc(n.ev);
  }

  // ---------- mercati: un riquadro con 5 numeri ----------
  const WANT = [
    ["indici", /ftse\s*mib/i], ["obbligazioni", /spread/i], ["valute", /eur.?\/?.?usd|euro.?dollaro/i],
    ["materie", /brent/i], ["indici", /s&p\s*500/i]
  ];
  const BACKUP = [["indici", /\bdax\b/i], ["obbligazioni", /btp/i], ["materie", /\boro\b|gold/i], ["indici", /dow/i], ["materie", /wti/i]];
  function pick() {
    const out = [], used = new Set();
    const find = ([key, re]) => {
      const c = ((mk && mk.classes) || []).find((x) => x.key === key);
      const it = c && (c.items || []).find((x) => re.test(x.name) && (G.cleanValue(x.value) || G.move(x)));
      if (it && !used.has(it.name)) { used.add(it.name); out.push({ it, key }); }
    };
    WANT.forEach(find);
    for (const b of BACKUP) { if (out.length >= 5) break; find(b); }
    return out.slice(0, 5);
  }
  function renderSide() {
    const rows = pick();
    if (!rows.length) { $("side").innerHTML = ""; return; }
    const tr = rows.map(({ it, key }) => {
      const mv = typeof it.bp === "number" ? G.bpsLong(it.bp) : G.move(it);
      return '<tr><th scope="row">' + esc(G.shortName(it.name)) + "</th><td>" + esc(G.cleanValue(it.value)) +
        '</td><td class="mv ' + G.tone(it, key) + '">' + esc(mv) + "</td></tr>";
    }).join("");
    $("side").innerHTML = '<section class="mk-box reveal" style="--i:3" aria-labelledby="mk-h"><h2 id="mk-h">Mercati</h2>' +
      '<p class="when">' + esc(G.mkWhen(mk)) + "</p>" +
      '<table><tbody>' + tr + "</tbody></table>" + gapNote() + '<a class="more" href="terminal.html">Tutti i mercati e l\'agenda</a></section>';
  }
  // una classe intera senza dati si dice, invece di lasciare il riquadro più corto senza spiegazione
  function gapNote() {
    const want = { obbligazioni: "i titoli di Stato", valute: "le valute", materie: "le materie prime" };
    const miss = Object.keys(want).filter((k) => { const c = (mk.classes || []).find((x) => x.key === k); return !c || !(c.items || []).length; }).map((k) => want[k]);
    if (!miss.length) return "";
    return '<p class="mk-gap">In questo aggiornamento mancano ' + esc(miss.length > 1 ? miss.slice(0, -1).join(", ") + " e " + miss[miss.length - 1] : miss[0]) + ".</p>";
  }

  // ---------- eventi ----------
  // Le sezioni cambiano l'indirizzo con pushState: niente navigazione ad ancora, che con «#» (Tutte) faceva salire la
  // pagina in cima o rifaceva tutta la pagina. Toccando una scheda l'elenco scorre di lato; indietro e avanti del
  // browser fanno lo stesso, tranne quando il telefono ha già animato il gesto dal bordo (allora cambia e basta)
  const order = () => Array.from($("sections").querySelectorAll("a")).map((a) => a.dataset.sec);
  // tapK: la sezione toccata mentre entra; noPush: l'indirizzo è già cambiato (indietro e avanti del browser)
  // peekTop: dove sta sullo schermo la sezione accanto mostrata dallo swipe
  let swiper = null, tapK = null, noPush = false, peekTop = null;
  // cambiare sezione. Sul telefono la sezione nuova entra di lato come con lo swipe, già pronta (preparata a pagina ferma
  // se è quella vicina); altrove, o con il movimento ridotto, l'elenco scorre o cambia e basta.
  // fromHist: viene da indietro/avanti; instant: il telefono ha già animato il gesto dal bordo
  function toSection(k, fromHist, instant) {
    if (swiper) swiper.finish();
    if (!k || k === state.section) return;
    const o = order(), d = o.indexOf(k) >= o.indexOf(state.section) ? 1 : -1;
    if (!instant && swiper && !G.reduced()) {
      tapK = k; noPush = !!fromHist;
      if (swiper.go(d, k)) {
        // la scheda toccata si accende subito; l'indicatore va verso la vicina con la molla, verso le altre da sé
        markNav(k, k === step(d));
        return;
      }
      tapK = null; noPush = false;
    }
    if (!fromHist) goSec(k);
    state.section = k;
    markNav();
    if (instant) { const st = sectionTop(), y0 = scrollY; renderFeed(true); scrollKeep(st.scroll !== null ? st.scroll : y0); }
    else slideFeed(d);
    announce(k);
  }
  P.on($("sections"), "click", (e) => {
    const a = e.target.closest("a[data-sec]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // la scheda in cui sei già: si torna all'inizio della sezione
    if (a.dataset.sec === state.section && !tapK) {
      const st = sectionTop();
      if (st.scroll !== null) window.scrollTo({ top: st.scroll, behavior: G.reduced() ? "auto" : "smooth" });
      return;
    }
    toSection(a.dataset.sec);
  });
  // «Torna a tutte le notizie» nella sezione vuota
  P.on($("feed"), "click", (e) => {
    const a = e.target.closest('a[href="#"]');
    if (!a) return;
    e.preventDefault();
    toSection("tutte");
  });
  // dove stava la pagina in ogni passo della cronologia delle sezioni: col gesto dal bordo il telefono mostra la foto
  // della sezione com'era lasciata, e la pagina deve fermarsi proprio lì
  const ys = {};
  const entry = () => (history.state && history.state.k) || "0";
  P.on(window, "scroll", () => { ys[entry()] = scrollY; }, { passive: true });
  let edgeAt = 0;
  P.on(document, "touchstart", (e) => { const x = e.touches[0] && e.touches[0].clientX; if (x < 24 || x > innerWidth - 24) edgeAt = Date.now(); }, { passive: true });
  const here = location.pathname + location.search;
  const fromHistory = (e) => {
    // indietro verso un'altra pagina: ci pensa il passaggio di pagina, questa non deve muoversi
    if (location.pathname + location.search !== here) return;
    const k = sectionFromHash();
    if (k === state.section && !tapK) return;
    if (e && e.hasUAVisualTransition || Date.now() - edgeAt < 1500) {
      toSection(k, true, true);
      const y = ys[entry()];
      if (typeof y === "number") window.scrollTo({ top: y, behavior: "instant" });
    } else toSection(k, true);
  };
  P.on(window, "popstate", fromHistory);
  P.on(window, "hashchange", fromHistory);
  // il logo o «Notizie» toccati sulla prima pagina: si torna a Tutte (se si è già lì, in cima: lo fa common.js)
  const onSame = () => { if (state.section === "tutte" && !tapK) return false; toSection("tutte"); return true; };
  G.samePage = onSame;
  P.keep({ disconnect: () => { if (G.samePage === onSame) G.samePage = null; } });
  // per chi usa un lettore di schermo: la lista cambia, la riga di stato lo dice
  function announce(sec) {
    const n = visible().length, st = $("sec-status");
    if (st) st.textContent = (sec === "tutte" ? "Tutte le notizie" : sec === "seguiti" ? "Temi seguiti" : G.SECTIONS[sec]) + ": " + n + (n === 1 ? " notizia" : " notizie");
  }
  // porta la pagina a «y» dopo aver cambiato sezione. Se la sezione nuova è troppo corta per arrivarci, l'elenco si
  // allunga di quel che manca (spazio vuoto in fondo): altrimenti il browser fermerebbe la pagina più in alto e tutto
  // scenderebbe di colpo
  function scrollKeep(y) {
    const feed = $("feed");
    feed.style.minHeight = "";
    const max = document.documentElement.scrollHeight - innerHeight;
    if (y > max + 1) feed.style.minHeight = Math.ceil(feed.offsetHeight + (y - max)) + "px";
    window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
  }
  // dove comincia una sezione sullo schermo: dove sta adesso l'elenco o, se la pagina è già scesa oltre il suo inizio,
  // subito sotto la barra delle sezioni ferma in alto (scroll: dove portare la pagina). Cambiando sezione si riparte
  // dall'inizio della nuova, come in un'app.
  function sectionTop() {
    const feed = $("feed"), nav = document.querySelector(".home .sec-nav"), fr = feed.getBoundingClientRect();
    if (!nav) return { top: fr.top, scroll: null };
    // dove starebbe la barra senza lo scorrimento: subito sotto l'elemento che la precede (che non è mai fermo in alto),
    // con il margine più grande dei due. Solo letture: niente ricalcolo della pagina
    let el = nav.previousElementSibling;
    while (el && !el.offsetHeight) el = el.previousElementSibling;
    if (!el) return { top: fr.top, scroll: null };
    const gap = Math.max(parseFloat(getComputedStyle(el).marginBottom) || 0, parseFloat(getComputedStyle(nav).marginTop) || 0);
    const natural = el.getBoundingClientRect().bottom + gap + scrollY;
    const s = Math.max(0, Math.round(natural - (parseFloat(getComputedStyle(nav).top) || 0)));
    return scrollY > s + 1 ? { top: fr.top + (scrollY - s), scroll: s } : { top: fr.top, scroll: null };
  }
  // toccando una sezione l'elenco vecchio esce da un lato mentre il nuovo entra dall'altro, attaccati come le pagine
  // di un libro e interi: una copia del vecchio sopra il nuovo, solo transform
  function slideFeed(sgn) {
    // lo scorrimento si rimette sempre a mano: quando l'elenco cambia, il browser (scroll anchoring) lo sposterebbe da sé
    const feed = $("feed"), st = sectionTop(), y0 = scrollY, target = st.scroll !== null ? st.scroll : y0;
    if (G.reduced() || !feed.animate) { renderFeed(); scrollKeep(target); return; }
    const ghost = feed.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.className = "feed-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.querySelectorAll(".reveal").forEach((el) => el.classList.remove("reveal"));
    ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    // della copia basta la parte sullo schermo: meno da disegnare mentre si muove
    const bottom = innerHeight + 40;
    Array.from(feed.children).forEach((c, i) => { if (c.getBoundingClientRect().top > bottom && ghost.children[i]) ghost.children[i].dataset.cut = "1"; });
    ghost.querySelectorAll(":scope > [data-cut]").forEach((c) => c.remove());
    // posizione al decimale di pixel: offsetTop arrotonda e la copia partirebbe con un piccolo scatto
    const box = feed.parentElement, fr = feed.getBoundingClientRect(), br = box.getBoundingClientRect();
    let top = fr.top - br.top - box.clientTop;
    ghost.style.left = (fr.left - br.left - box.clientLeft) + "px";
    ghost.style.width = fr.width + "px";
    renderFeed(true);
    // la sezione nuova comincia dall'inizio: la pagina sale, la copia resta dov'era sullo schermo
    top -= y0 - target;
    scrollKeep(target);
    ghost.style.top = top + "px";
    feed.parentElement.appendChild(ghost);
    // alta quanto la parte del vecchio elenco che si vedeva, anche se il nuovo è più corto
    ghost.style.height = Math.max(0, Math.min(fr.height, innerHeight - fr.top + 40)) + "px";
    const W = fr.width + 28, D = 440, E = "cubic-bezier(0.32, 0.72, 0, 1)";
    ghost.animate([{ transform: "none" }, { transform: "translate3d(" + (-sgn * W) + "px,0,0)" }], { duration: D, easing: E, fill: "forwards" })
      .finished.then(() => ghost.remove(), () => ghost.remove());
    feed.animate([{ transform: "translate3d(" + (sgn * W) + "px,0,0)" }, { transform: "none" }], { duration: D, easing: E });
  }
  // passaggio animato verso la storia: il titolo toccato diventa il titolo della pagina successiva.
  // Il nome resta finché non tocchi altro, così tornando indietro il titolo rifà il percorso al contrario.
  P.on(document, "click", (e) => {
    document.querySelectorAll(".lead h2, .item h2").forEach((h) => { h.style.viewTransitionName = ""; });
    const a = e.target.closest("#feed a[data-id]");
    if (!a) return;
    a.closest("h2").style.viewTransitionName = "story-title";
    try { sessionStorage.setItem("gerico.vt", JSON.stringify({ id: a.dataset.id, title: a.textContent, sec: a.dataset.sec })); } catch (err) { /* niente */ }
  });

  state.section = sectionFromHash();
  if (state.section === "seguiti" && !state.follows.length) state.section = "tutte";
  buildNav(); markNav(); renderFeed(true); renderSide(); renderTicker(); renderNext(); renderUltim(); renderListen();
  P.every(renderNext, 30000);

  // ---------- swipe tra le sezioni: a sinistra la sezione dopo, a destra quella prima ----------
  const step = (d) => { const o = Array.from($("sections").querySelectorAll("a")).map((a) => a.dataset.sec); return o[o.indexOf(state.section) + d]; };
  const goSec = (k) => {
    const url = location.pathname + location.search + (k === "tutte" ? "" : "#" + k);
    // lo scorrimento delle sezioni lo decide la pagina: il browser non deve rimettere la sua posizione dopo
    try { history.scrollRestoration = "manual"; } catch (e) { /* niente */ }
    try { history.pushState(Object.assign({}, history.state, { k: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }), "", url); }
    catch (e) { location.hash = k === "tutte" ? "" : k; }
  };
  // la sezione vicina sta accanto, intera, e arriva con il dito; l'indicatore delle sezioni la segue.
  // Arrivata al suo posto diventa la pagina vera, nello stesso fotogramma: niente scatti
  // la sezione accanto, già disegnata: una cornice fissa (nascosta finché non serve) con dentro la lista e, sul telefono,
  // il riquadro dei mercati dove starà davvero
  function buildPeek(d, k) {
    k = k || step(d);
    if (!k) return null;
    const feed = $("feed"), side = $("side"), st = sectionTop(), fr = feed.getBoundingClientRect();
    const h = Math.max(0, innerHeight - st.top + 40);
    const frame = document.createElement("div");
    frame.className = "peek-frame";
    frame.style.visibility = "hidden";
    frame.style.top = st.top.toFixed(1) + "px";
    frame.style.height = h + "px";
    const p = document.createElement("div");
    p.className = "feed-ghost feed-peek";
    p.setAttribute("aria-hidden", "true");
    p.style.top = "0px";
    p.style.left = fr.left.toFixed(1) + "px";
    p.style.width = fr.width + "px";
    p.style.height = h + "px";
    p.style.transform = "translate3d(" + (d * (fr.width + 28)) + "px,0,0)";
    // come #feed (flow-root): stessi margini dentro, stesse altezze
    const list = document.createElement("div");
    list.style.display = "flow-root";
    list.innerHTML = feedMarkupFor(k);
    p.appendChild(list);
    frame.appendChild(p);
    document.body.appendChild(frame);
    if (stacked()) {
      const sr = side.getBoundingClientRect(), c = side.cloneNode(true);
      c.style.cssText = "position:absolute;margin:0;left:" + (sr.left - fr.left).toFixed(1) + "px;width:" + sr.width.toFixed(1) + "px;top:" + (list.offsetHeight + sr.top - fr.bottom).toFixed(1) + "px";
      p.appendChild(c);
    }
    p.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    return { frame, p, key: k, ver: feedVer, w: fr.width };
  }
  // a pagina ferma si preparano le due sezioni accanto: così il primo movimento del dito non costruisce niente
  // mai mentre il dito è sullo schermo, e una sezione per volta: ogni pezzo di lavoro sta in un momento libero
  let touching = false;
  P.on(document, "touchstart", () => { touching = true; }, { passive: true, capture: true });
  P.on(document, "touchend", () => { touching = false; }, { passive: true, capture: true });
  P.on(document, "touchcancel", () => { touching = false; }, { passive: true, capture: true });
  function prepareSoon() {
    if (!alive || !("ontouchstart" in window) || G.reduced()) return;
    clearTimeout(prepTimer);
    const one = (d) => {
      const r = prepared[d], k = step(d);
      if (r && r.key === k && r.ver === feedVer) return false;
      if (r) { r.frame.remove(); delete prepared[d]; }
      if (k) prepared[d] = buildPeek(d);
      return !!k;
    };
    const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 60));
    const go = (sides) => {
      if (!alive || !sides.length) return;
      if (touching || window.gericoVT) { prepTimer = P.later(() => go(sides), 400); return; }
      one(sides[0]);
      if (sides.length > 1) idle(() => go(sides.slice(1)));
    };
    prepTimer = P.later(() => idle(() => go([1, -1])), window.gericoVT ? 700 : 300);
  }
  P.keep({ disconnect: () => { alive = false; clearTimeout(prepTimer); [1, -1].forEach((d) => { if (prepared[d]) prepared[d].frame.remove(); }); } });
  // sul telefono i mercati e il piede stanno sotto l'elenco: fanno parte della pagina e si spostano con lui
  const stacked = () => { const s = $("side"); return !!s && s.getBoundingClientRect().top >= $("feed").getBoundingClientRect().bottom - 1; };
  swiper = G.swipe($("main") || $("feed").parentElement, {
    follow: () => (stacked() ? [$("feed"), $("side"), document.querySelector(".foot > .wrap")] : [$("feed")]),
    canNext: () => !!step(1), canPrev: () => !!step(-1),
    // la sezione accanto è ferma rispetto allo schermo (in una cornice fissa che la ritaglia ai lati): se alla fine la
    // pagina deve risalire all'inizio della sezione, lei non si muove. Ha il fondo della pagina e copre quello che c'è sotto.
    // Di solito è già pronta (preparata a pagina ferma): al primo movimento del dito c'è solo da metterla al suo posto
    peek: (d, k) => {
      k = k || step(d);
      if (!k) return null;
      let r = prepared[d];
      delete prepared[d];
      const fw = $("feed").getBoundingClientRect().width;
      if (!r || r.key !== k || r.ver !== feedVer || Math.abs(r.w - fw) > 0.5) { if (r) r.frame.remove(); r = buildPeek(d, k); }
      if (!r) return null;
      const st = sectionTop(), h = Math.max(0, innerHeight - st.top + 40);
      r.frame.style.top = st.top.toFixed(1) + "px";
      peekTop = st.top;
      r.frame.style.height = h + "px";
      r.p.style.height = h + "px";
      r.frame.style.visibility = "";
      return r.p;
    },
    drop: (p) => { (p.parentElement && p.parentElement.classList.contains("peek-frame") ? p.parentElement : p).remove(); prepareSoon(); },
    commit: (d, k) => {
      k = k || step(d);
      const push = !noPush;
      tapK = null; noPush = false;
      if (!k) return;
      const st = sectionTop(), y = scrollY, top = $("feed").getBoundingClientRect().top, shown = peekTop;
      peekTop = null;
      state.section = k;
      // l'indirizzo cambia per il tasto indietro (pushState: niente scorrimenti del browser); da indietro/avanti è già cambiato
      if (push) goSec(k);
      renderFeed(true);
      // subito, e con l'elenco vero esattamente dove stava la pagina accanto che lo copriva: niente salti in su o in giù,
      // anche se intanto la pagina si è mossa
      scrollKeep(shown !== null ? Math.round(top + y - shown) : st.scroll !== null ? st.scroll : y);
      markNav();
      announce(k);
    },
    // l'indicatore segue verso la scheda vicina; per una scheda più lontana toccata si muove da sé (markNav)
    progress: (p, d, anim) => { if (!tapK || tapK === step(d)) G.segFollow($("sections"), p, d, anim); }
  });
  // alla prima visita, su un telefono, l'elenco accenna un movimento di lato: si capisce che si può scorrere
  if (!G.soft && !G.reduced() && "ontouchstart" in window && !G.ls.get("gerico.swipeHint", false)) {
    G.ls.set("gerico.swipeHint", true);
    P.later(() => {
      const f = $("feed");
      if (f && f.animate) f.animate([{ transform: "none" }, { transform: "translateX(-26px)", offset: 0.4 }, { transform: "none" }], { duration: 900, easing: "cubic-bezier(0.3, 0, 0.2, 1)" });
    }, 1600);
  }

  // la pagina resta aperta nel telefono: tornandoci dopo un po', se è uscita un'edizione nuova lo si dice con un pulsante
  let checked = Date.now();
  P.on(document, "visibilitychange", async () => {
    if (document.visibilityState !== "visible" || Date.now() - checked < 3 * 60000 || $("fresh")) return;
    checked = Date.now();
    const now = await G.load("edition", true);
    if (!now || !now.lastRun || now.lastRun === ed.lastRun) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "fresh"; btn.className = "fresh";
    btn.textContent = "Edizione nuova delle " + G.hm(now.lastRun) + " · Aggiorna";
    btn.addEventListener("click", () => location.reload());
    document.body.appendChild(btn);
  });
});
