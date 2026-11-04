/* GERICO: prima pagina. Una notizia in evidenza, le altre in elenco, i mercati in un riquadro piccolo. */
G.page("home", async function (P) {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);

  G.initPrefs();
  // la frase che spiega GERICO compare solo alla prima visita (la classe first-visit la mette lo script nell'head)
  if (!G.ls.get("gerico.introSeen", false)) G.ls.set("gerico.introSeen", true);

  const [ed, mk, qt, br, au, tit, tsh] = await Promise.all([G.load("edition"), G.load("markets"), G.load("quotes"), G.load("brevi"), G.load("audio"),
    G.load("titoli"), G.load("titoli-storico")]);
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
    // «Mercoledì 28 ottobre · 8 notizie · ore 7:23»: sta in una riga anche sul telefono
    if (edl) edl.textContent = edl.textContent.replace(" · edizione delle ", " · " + stories.length + (stories.length === 1 ? " notizia" : " notizie") + " · ore ");
    // «Oggi» solo sopra l'edizione di oggi. L'edizione del mattino esce alle 7:45: dalle 8:15 (o se ne manca più di una) lo si dice subito
    const age = G.dayAge(lastRun);
    if (age > 0) {
      const name = age === 1 ? "Ieri" : age < 7 ? G.cap(G.weekday(lastRun)) : "Ultima edizione";
      $("large-title").textContent = name;
      const tt = document.querySelector(".top-title");
      if (tt) tt.textContent = name;
      if (age > 1 || G.romeNow().min >= 495) {
        $("notice").innerHTML = '<p class="notice">Questa è l\'edizione di ' + esc(G.longDay(lastRun)) + " alle " + esc(G.hm(lastRun)) + ". Quella di oggi non è ancora uscita.</p>";
      }
    }
  }

  // ---------- sezioni (senza numeri) ----------
  const sectionFromHash = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    return h === "seguiti" || G.SECTIONS[h] ? h : "tutte";
  };
  const follows = (s) => (s.tags || []).some((t) => state.follows.includes(t));
  const followed = () => stories.filter(follows);
  const visible = () => {
    if (state.section === "tutte") return stories;
    if (state.section === "seguiti") return followed();
    return stories.filter((s) => s.section === state.section);
  };
  // le brevi non hanno temi: nei Seguiti non compaiono
  const visibleBrevi = () => (state.section === "seguiti" ? [] : brevi.filter((b) => state.section === "tutte" || b.section === state.section)).slice(0, 15);
  const visiblePast = () => (state.section === "tutte" ? archive : archive.filter((s) => (state.section === "seguiti" ? follows(s) : s.section === state.section))).slice(0, 8);
  function buildNav() {
    const items = [["tutte", "Tutte"]];
    Object.keys(G.SECTIONS).forEach((k) => { if (stories.some((s) => s.section === k) || brevi.some((b) => b.section === k)) items.push([k, G.SECTIONS[k]]); });
    if (state.follows.length) items.push(["seguiti", "Seguiti"]);
    $("sections").innerHTML = items.map(([k, label]) => '<a href="' + (k === "tutte" ? "#" : "#" + k) + '" data-sec="' + k + '">' + esc(label) + "</a>").join("");
  }
  function markNav() {
    $("sections").querySelectorAll("a").forEach((a) => { if (a.dataset.sec === state.section) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (G.seg) G.seg($("sections"));
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
  function renderFeed(viaTransition) {
    const feed = $("feed");
    feed.classList.remove("swap");
    if (!first && !viaTransition) { void feed.offsetWidth; feed.classList.add("swap"); }
    const list = visible(), bl = visibleBrevi(), past = visiblePast();
    if (!list.length && !bl.length) {
      $("feed").innerHTML = (state.section === "seguiti"
        ? '<div class="empty"><h2>Nessuna storia sui temi che segui.</h2><p>I temi si seguono dalla pagina di ogni storia.</p></div>'
        : '<div class="empty"><h2>Nessuna storia in questa sezione.</h2><p><a href="#">Torna a tutte le notizie</a>.</p></div>') + pastHTML(past, true);
      return;
    }
    const all = state.section === "tutte" || state.section === "seguiti";
    // l'edizione ha una fine: si sa quando arrivano le prossime notizie
    const end = '<p class="end"><strong>' + (state.section === "tutte" ? "Fine dell'edizione." : "Fine della sezione.") + "</strong> Prossimo aggiornamento delle notizie " + esc(G.nextUpdate(true)) + ".</p>";
    const top = list.length
      ? leadHTML(list[0], all) + (list.length > 1 ? '<ol class="list">' + list.slice(1).map((s, i) => itemHTML(s, all, i + 1)).join("") + "</ol>" : "")
      : '<p class="none">Oggi in questa sezione non ci sono storie confrontate, solo brevi.</p>';
    feed.innerHTML = top + breviHTML(bl, all) + titoliHTML() + pastHTML(past, all) + end;
    first = false;
  }

  // ---------- ultim'ora: le notizie delle ultime ore scorrono in una fascia, come nei canali all-news ----------
  // brevi con l'ora e storie nuove o aggiornate; sotto le due voci la fascia non compare
  function renderUltim() {
    const recent = (iso) => !!iso && G.hoursAgo(iso) >= 0 && G.hoursAgo(iso) < 18;
    const items = [];
    brevi.forEach((b) => { if (recent(b.at)) items.push({ at: b.at, title: b.title, url: G.safeUrl(b.url), ext: true }); });
    stories.forEach((s) => {
      const at = G.realChange(s) ? s.updated : s.firstSeen;
      if (recent(at)) items.push({ at, title: G.headline(s), url: G.storyUrl(s) });
    });
    items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const list = items.slice(0, 12);
    // la fascia è nella pagina da subito, per non spingere giù le notizie quando arriva: senza almeno due voci si toglie
    if (list.length < 2) { $("ultim").hidden = true; return; }
    const copy = (dup) => list.map((it) => '<a href="' + esc(it.url) + '"' + (it.ext ? ' target="_blank" rel="noopener"' : "") + (dup ? ' tabindex="-1"' : "") +
      "><b>" + esc((G.isToday(it.at) ? "" : "ieri ") + G.hm(it.at)) + "</b>" + esc(it.title) + "</a>").join("");
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
  // cambiando sezione l'elenco scorre di lato, nel verso della sezione scelta (dove il browser non lo sa fare, dissolvenza)
  P.on(window, "hashchange", () => {
    const prev = state.section, next = sectionFromHash();
    if (next === prev) return;
    const order = Array.from($("sections").querySelectorAll("a")).map((a) => a.dataset.sec);
    const dir = order.indexOf(next) >= order.indexOf(prev) ? "dir-next" : "dir-prev";
    state.section = next;
    markNav();
    slideFeed(dir === "dir-next" ? 1 : -1);
    // per chi usa un lettore di schermo: la lista cambia, la riga di stato lo dice
    const n = visible().length, st = $("sec-status");
    if (st) st.textContent = (next === "tutte" ? "Tutte le notizie" : next === "seguiti" ? "Temi seguiti" : G.SECTIONS[next]) + ": " + n + (n === 1 ? " notizia" : " notizie");
  });
  // l'elenco vecchio esce da un lato mentre il nuovo entra dall'altro: una copia del vecchio sopra il nuovo, solo transform e opacity
  function slideFeed(sgn) {
    const feed = $("feed");
    if (G.reduced() || !feed.animate) { renderFeed(); return; }
    const ghost = feed.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.className = "feed-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.querySelectorAll(".reveal").forEach((el) => el.classList.remove("reveal"));
    // posizione al decimale di pixel: offsetTop arrotonda e la copia partirebbe con un piccolo scatto
    const box = feed.parentElement, fr = feed.getBoundingClientRect(), br = box.getBoundingClientRect();
    ghost.style.top = (fr.top - br.top - box.clientTop) + "px";
    ghost.style.left = (fr.left - br.left - box.clientLeft) + "px";
    ghost.style.width = fr.width + "px";
    renderFeed(true);
    feed.parentElement.appendChild(ghost);
    ghost.style.height = feed.offsetHeight + "px";
    const E = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    ghost.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(" + -18 * sgn + "%)" }], { duration: 240, easing: E, fill: "forwards" })
      .finished.then(() => ghost.remove(), () => ghost.remove());
    feed.animate([{ opacity: 0, transform: "translateX(" + 18 * sgn + "%)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: E });
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
  buildNav(); markNav(); renderFeed(); renderSide(); renderTicker(); renderUltim(); renderListen();

  // ---------- swipe tra le sezioni: a sinistra la sezione dopo, a destra quella prima ----------
  const step = (d) => { const o = Array.from($("sections").querySelectorAll("a")).map((a) => a.dataset.sec); return o[o.indexOf(state.section) + d]; };
  const goSec = (k) => { location.hash = k === "tutte" ? "" : k; };
  G.swipe($("main") || $("feed").parentElement, {
    follow: $("feed"),
    canNext: () => !!step(1), canPrev: () => !!step(-1),
    next: (reset) => { const k = step(1); reset(false); goSec(k); },
    prev: (reset) => { const k = step(-1); reset(false); goSec(k); }
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
