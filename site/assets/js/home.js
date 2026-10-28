/* GERICO: prima pagina. Una notizia in evidenza, le altre in elenco, i mercati in un riquadro piccolo. */
(async function () {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);

  G.initPrefs();
  // la frase che spiega GERICO compare solo alla prima visita (la classe first-visit la mette lo script nell'head)
  if (!G.ls.get("gerico.introSeen", false)) G.ls.set("gerico.introSeen", true);

  const [ed, mk] = await Promise.all([G.load("edition"), G.load("markets")]);
  if (!ed || !Array.isArray(ed.stories)) {
    $("feed").innerHTML = '<div class="empty"><h2>L\'edizione non si è caricata.</h2><p>Riprova tra qualche minuto.</p></div>';
    return;
  }
  const stories = ed.stories.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const lastRun = ed.lastRun;
  const firstRun = G.firstRunToday(stories);
  const state = { section: "tutte", follows: G.follows() };

  // ---------- edizione ----------
  if (lastRun) {
    G.setEdition(lastRun);
    if (G.hoursAgo(lastRun) > 30) {
      $("large-title").textContent = "Ultima edizione";
      const tt = document.querySelector(".top-title");
      if (tt) tt.textContent = "Ultima edizione";
      $("notice").innerHTML = '<p class="notice">Questa edizione è di ' + esc(G.longDay(lastRun)) + " alle " + esc(G.hm(lastRun)) + ": l'aggiornamento di oggi non è ancora arrivato.</p>";
    }
  }

  // ---------- sezioni (senza numeri) ----------
  const sectionFromHash = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    return h === "seguiti" || G.SECTIONS[h] ? h : "tutte";
  };
  const followed = () => stories.filter((s) => (s.tags || []).some((t) => state.follows.includes(t)));
  const visible = () => {
    if (state.section === "tutte") return stories;
    if (state.section === "seguiti") return followed();
    return stories.filter((s) => s.section === state.section);
  };
  function buildNav() {
    const items = [["tutte", "Tutte"]];
    Object.keys(G.SECTIONS).forEach((k) => { if (stories.some((s) => s.section === k)) items.push([k, G.SECTIONS[k]]); });
    if (state.follows.length) items.push(["seguiti", "Seguiti"]);
    $("sections").innerHTML = items.map(([k, label]) => '<a href="' + (k === "tutte" ? "#" : "#" + k) + '" data-sec="' + k + '">' + esc(label) + "</a>").join("");
  }
  function markNav() {
    $("sections").querySelectorAll("a").forEach((a) => { if (a.dataset.sec === state.section) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (G.seg) G.seg($("sections"));
  }

  // ---------- notizie: titolo e una riga grigia ----------
  function line(s, showSection) {
    const parts = [];
    if (showSection) parts.push('<span class="sec">' + esc(G.secLabel(s.section)) + "</span>");
    const upd = G.updatedLabel(s, firstRun);
    if (upd) parts.push('<span class="upd">' + esc(upd) + "</span>");
    parts.push("<span>" + esc(G.agreeLine(s.sources)) + "</span>");
    return '<p class="line">' + parts.join('<span class="sep" aria-hidden="true">·</span>') +
      ((s.divergences || []).length ? '<span class="badge">Versioni diverse</span>' : "") + "</p>";
  }
  const link = (s) => '<a href="' + G.storyUrl(s) + '" data-id="' + esc(s.id) + '" data-sec="' + esc(G.secLabel(s.section)) + '">' + esc(G.headline(s)) + "</a>";
  function leadHTML(s, showSection) {
    return '<article class="lead reveal" style="--i:0"><h2>' + link(s) + "</h2>" +
      '<p class="sum">' + esc(G.firstSentences(s.summary, 220)) + "</p>" + line(s, showSection) + "</article>";
  }
  function itemHTML(s, showSection, i) {
    return '<li class="item' + (i < 8 ? " reveal" : "") + '" style="--i:' + Math.min(i, 8) + '"><h2>' + link(s) + "</h2>" + line(s, showSection) + "</li>";
  }
  function renderFeed() {
    const list = visible();
    if (!list.length) {
      $("feed").innerHTML = state.section === "seguiti"
        ? '<div class="empty"><h2>Nessuna storia sui temi che segui.</h2><p>I temi si seguono dalla pagina di ogni storia.</p></div>'
        : '<div class="empty"><h2>Nessuna storia in questa sezione.</h2><p><a href="#">Torna a tutte le notizie</a>.</p></div>';
      return;
    }
    const all = state.section === "tutte" || state.section === "seguiti";
    $("feed").innerHTML = leadHTML(list[0], all) +
      (list.length > 1 ? '<ol class="list">' + list.slice(1).map((s, i) => itemHTML(s, all, i + 1)).join("") + "</ol>" : "");
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
    $("side").innerHTML = '<section class="mk-box" aria-labelledby="mk-h"><h2 id="mk-h">Mercati</h2>' +
      '<p class="when">' + esc(G.cap(mk.label || "")) + (mk.asOf ? ", " + esc(G.when(mk.asOf)) : "") + "</p>" +
      '<table><tbody>' + tr + '</tbody></table><a class="more" href="terminal.html">Tutti i mercati e l\'agenda</a></section>';
  }

  // ---------- eventi ----------
  window.addEventListener("hashchange", () => { state.section = sectionFromHash(); markNav(); renderFeed(); });
  // passaggio animato verso la storia: il titolo toccato diventa il titolo della pagina successiva
  $("feed").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-id]");
    if (!a) return;
    document.querySelectorAll(".lead h2, .item h2").forEach((h) => { h.style.viewTransitionName = ""; });
    const h = a.closest("h2");
    if (h) h.style.viewTransitionName = "story-title";
    try { sessionStorage.setItem("gerico.vt", JSON.stringify({ id: a.dataset.id, title: a.textContent, sec: a.dataset.sec })); } catch (err) { /* niente */ }
  });
  window.addEventListener("pageshow", () => document.querySelectorAll(".lead h2, .item h2").forEach((h) => { h.style.viewTransitionName = ""; }));

  state.section = sectionFromHash();
  if (state.section === "seguiti" && !state.follows.length) state.section = "tutte";
  buildNav(); markNav(); renderFeed(); renderSide();
})();
