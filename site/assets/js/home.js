/* GERICO: prima pagina. Una notizia in evidenza, le altre in elenco, i mercati in un riquadro piccolo. */
(async function () {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);

  G.initPrefs();
  const [ed, mk] = await Promise.all([G.load("edition"), G.load("markets")]);
  if (!ed || !Array.isArray(ed.stories)) {
    $("feed").innerHTML = '<div class="empty"><h2>L\'edizione non si è caricata.</h2><p>Riprova tra qualche minuto.</p></div>';
    return;
  }
  const stories = ed.stories.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const lastRun = ed.lastRun;
  const firstRun = G.firstRunToday(stories);
  const state = { section: "tutte", follows: G.follows() };

  // ---------- edizione e piede ----------
  if (lastRun) {
    G.setEdition(lastRun);
    if (G.hoursAgo(lastRun) > 30) {
      $("notice").innerHTML = '<p class="notice">Questa edizione è di ' + esc(G.longDay(lastRun)) + " alle " + esc(G.hm(lastRun)) + ": l'aggiornamento di oggi non è ancora arrivato.</p>";
    }
  }
  if ((ed.outlets || []).length) $("foot-outlets").textContent = "Testate lette in questa edizione: " + ed.outlets.join(", ") + ".";

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
  function renderNav() {
    const items = [["tutte", "Tutte"]];
    Object.keys(G.SECTIONS).forEach((k) => { if (stories.some((s) => s.section === k)) items.push([k, G.SECTIONS[k]]); });
    if (state.follows.length) items.push(["seguiti", "Seguiti"]);
    $("sections").innerHTML = items.map(([k, label]) =>
      '<a href="' + (k === "tutte" ? "#" : "#" + k) + '"' + (state.section === k ? ' aria-current="page"' : "") + ">" + esc(label) + "</a>").join("");
    if (G.watchSections) G.watchSections();
  }

  // ---------- notizie ----------
  function meta(s, showSection) {
    const upd = G.updatedLabel(s, firstRun);
    if (!showSection && !upd) return "";
    return '<p class="meta">' + (showSection ? '<span class="sec">' + esc(G.secLabel(s.section)) + "</span>" : "") +
      (upd ? '<span class="upd">' + esc(upd) + "</span>" : "") + "</p>";
  }
  function agree(s) {
    const d = (s.divergences || [])[0];
    return '<p class="agree"><span class="ok">' + esc(G.agreeLine(s.sources)) + "</span>" +
      (d ? '<span class="split">Si dividono: ' + esc(d.point) + "</span>" : "") + "</p>";
  }
  function leadHTML(s, showSection) {
    return '<article class="lead">' + meta(s, showSection) +
      '<h1><a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + "</a></h1>" +
      '<p class="sum">' + esc(G.firstSentences(s.summary, 220)) + "</p>" + agree(s) + "</article>";
  }
  function itemHTML(s, showSection) {
    return '<li class="item">' + meta(s, showSection) +
      '<h2><a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + "</a></h2>" +
      '<p class="sum">' + esc(G.firstSentences(s.summary, 160)) + "</p>" + agree(s) + "</li>";
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
      (list.length > 1 ? '<ol class="list">' + list.slice(1).map((s) => itemHTML(s, all)).join("") + "</ol>" : "");
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
  window.addEventListener("hashchange", () => { state.section = sectionFromHash(); renderNav(); renderFeed(); });

  state.section = sectionFromHash();
  if (state.section === "seguiti" && !state.follows.length) state.section = "tutte";
  renderNav(); renderFeed(); renderSide();
})();
