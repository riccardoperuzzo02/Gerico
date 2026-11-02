/* GERICO: prima pagina. Una notizia in evidenza, le altre in elenco, i mercati in un riquadro piccolo. */
(async function () {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);

  G.initPrefs();
  // la frase che spiega GERICO compare solo alla prima visita (la classe first-visit la mette lo script nell'head)
  if (!G.ls.get("gerico.introSeen", false)) G.ls.set("gerico.introSeen", true);

  const [ed, mk, qt, br] = await Promise.all([G.load("edition"), G.load("markets"), G.load("quotes"), G.load("brevi")]);
  if (!ed || !Array.isArray(ed.stories)) {
    $("feed").innerHTML = '<div class="empty"><h2>L\'edizione non si è caricata.</h2><p>Può essere la connessione. Riprova tra poco.</p>' +
      '<p><button type="button" class="btn-retry" id="retry">Riprova</button></p></div>';
    $("retry").addEventListener("click", () => location.reload());
    $("side").innerHTML = "";
    $("ticker").hidden = true;
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

  // ---------- notizie: titolo e una riga grigia ----------
  // il punto separatore sta dentro la parte che segue: va a capo con lei e non resta da solo a fine riga
  const SEP = '<span class="sep" aria-hidden="true">·</span>';
  function line(s, showSection) {
    const parts = [];
    if (showSection) parts.push(["sec", esc(G.secLabel(s.section))]);
    const upd = G.updatedLabel(s, firstRun);
    if (upd) parts.push(["upd", esc(upd)]);
    parts.push(["agr", G.miniWall(s.sources) + '<span class="agr-t">' + esc(G.agreeLine(s.sources)) + "</span>"]);
    // «Versioni diverse» solo quando almeno una testata racconta i fatti in modo diverso
    return '<p class="line">' + parts.map(([c, h], i) => '<span class="' + c + '">' + (i ? SEP : "") + h + "</span>").join("") +
      (G.counts(s.sources).divergente ? '<span class="badge">Versioni diverse</span>' : "") + "</p>";
  }
  const link = (s) => '<a href="' + G.storyUrl(s) + '" data-id="' + esc(s.id) + '" data-sec="' + esc(G.secLabel(s.section)) + '">' + esc(G.headline(s)) + "</a>";
  // al primo caricamento le notizie entrano una dopo l'altra (le prime 8); cambiando sezione solo una dissolvenza
  let first = true;
  function leadHTML(s, showSection) {
    return '<article class="lead' + (first ? " reveal" : "") + '" style="--i:0"><h2>' + link(s) + "</h2>" +
      '<p class="sum">' + esc(G.firstSentences(s.summary, 220)) + "</p>" + line(s, showSection) + "</article>";
  }
  function itemHTML(s, showSection, i) {
    return '<li class="item' + (first && i < 8 ? " reveal" : "") + '" style="--i:' + Math.min(i, 8) + '"><h2>' + link(s) + "</h2>" + line(s, showSection) + "</li>";
  }
  // brevi: una riga e il link all'articolo, da una sola testata
  function breviHTML(items, showSection) {
    if (!items.length) return "";
    return '<section class="blk" aria-labelledby="brevi-h"><h2 class="blk-h" id="brevi-h">In breve</h2>' +
      '<p class="blk-sub">Notizie lette su una sola testata: GERICO non le ha ancora confrontate.</p><ul class="brevi">' +
      items.map((b) => {
        const t = G.isToday(b.at) ? G.hm(b.at) : b.at ? G.when(b.at) : "";
        const meta = [showSection ? G.secLabel(b.section) : "", b.source, t].filter(Boolean).map(esc).join(" · ");
        return '<li><a href="' + esc(G.safeUrl(b.url)) + '" target="_blank" rel="noopener">' + esc(b.title) +
          '<span class="sr-only"> (si apre il sito della testata)</span></a>' + (meta ? '<p class="b-m">' + meta + "</p>" : "") + "</li>";
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
    feed.innerHTML = top + breviHTML(bl, all) + pastHTML(past, all) + end;
    first = false;
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
  window.addEventListener("hashchange", () => {
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
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".lead h2, .item h2").forEach((h) => { h.style.viewTransitionName = ""; });
    const a = e.target.closest("#feed a[data-id]");
    if (!a) return;
    a.closest("h2").style.viewTransitionName = "story-title";
    try { sessionStorage.setItem("gerico.vt", JSON.stringify({ id: a.dataset.id, title: a.textContent, sec: a.dataset.sec })); } catch (err) { /* niente */ }
  });

  state.section = sectionFromHash();
  if (state.section === "seguiti" && !state.follows.length) state.section = "tutte";
  buildNav(); markNav(); renderFeed(); renderSide(); renderTicker();

  // la pagina resta aperta nel telefono: tornandoci dopo un po', se è uscita un'edizione nuova lo si dice con un pulsante
  let checked = Date.now();
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || Date.now() - checked < 3 * 60000 || $("fresh")) return;
    checked = Date.now();
    const now = await G.load("edition");
    if (!now || !now.lastRun || now.lastRun === ed.lastRun) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "fresh"; btn.className = "fresh";
    btn.textContent = "Edizione nuova delle " + G.hm(now.lastRun) + " · Aggiorna";
    btn.addEventListener("click", () => location.reload());
    document.body.appendChild(btn);
  });
})();
