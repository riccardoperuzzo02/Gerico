/* GERICO: prima pagina. */
(async function () {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);
  const short = (n) => String(n || "").replace(/\s*\([^)]*\)/g, "").trim();
  G.initPrefs();

  const [ed, mk, tm, wt] = await Promise.all([G.load("edition"), G.load("markets"), G.load("terminal"), G.load("weights")]);
  if (!ed || !Array.isArray(ed.stories)) {
    $("feed").innerHTML = '<div class="empty"><h2>L\'edizione non si è caricata.</h2><p>Riprova tra qualche minuto.</p></div>';
    return;
  }
  const stories = ed.stories.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const lastRun = ed.lastRun;
  const state = { section: "tutte", follows: G.follows() };

  // ---------- riga dell'edizione, avviso se è vecchia, piede ----------
  if (lastRun) {
    $("edition-line").textContent = G.cap(G.longDay(lastRun)) + " · Edizione delle " + G.hm(lastRun) + " · " + (ed.outlets || []).length + " testate lette";
    if (G.hoursAgo(lastRun) > 30) {
      $("notice").innerHTML = '<p class="notice">Questa edizione è di ' + esc(G.longDay(lastRun)) + " alle " + esc(G.hm(lastRun)) + ": l'aggiornamento di oggi non è ancora arrivato.</p>";
    }
  }
  if ((ed.outlets || []).length) $("foot-outlets").textContent = ed.outlets.join(", ") + ".";
  const q = ed.quality;
  if (q && typeof q.articlesRead === "number") {
    $("foot-quality").textContent = "Ultimo giro: " + q.articlesRead + " articoli letti, " + (q.articlesDiscarded || 0) + " scartati perché vecchi, " + (q.factsChecked || 0) + " fatti ricontrollati" + (q.factsCorrected ? ", " + q.factsCorrected + " corretti" : "") + ".";
  }

  // ---------- sezioni ----------
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
    const items = [["tutte", "Prima pagina", stories.length]];
    Object.keys(G.SECTIONS).forEach((k) => {
      const n = stories.filter((s) => s.section === k).length;
      if (n) items.push([k, G.SECTIONS[k], n]);
    });
    if (state.follows.length) items.push(["seguiti", "Seguiti", followed().length]);
    $("sections").innerHTML = items.map(([k, label, n]) =>
      '<a href="' + (k === "tutte" ? "#" : "#" + k) + '"' + (state.section === k ? ' aria-current="page"' : "") + ">" +
      esc(label) + '<span class="count">' + n + "</span></a>").join("") +
      '<a class="to-terminal" href="terminal.html">Terminal</a>';
  }

  // ---------- storie ----------
  function leadHTML(s) {
    const first = (s.view || "").split(/\n\s*\n/)[0];
    const excerpt = G.firstSentences(first, 340);
    const nc = (s.notCovered || []).length ? '<span class="nc">Non ne parlano: ' + esc(s.notCovered.join(", ")) + "</span>" : "";
    return '<article class="lead">' + G.kicker(s, lastRun) +
      '<h1><a href="' + G.storyUrl(s) + '">' + esc(s.title) + "</a></h1>" +
      '<p class="sum">' + esc(s.summary) + "</p>" +
      '<div class="wallrow">' + G.wall(s.sources, "big") + '<span class="agree">' + esc(G.agreeLong(s.sources)) + "</span>" + nc + "</div>" +
      (s.change ? '<p class="latest"><strong>Ultima novità.</strong> ' + esc(s.change) + "</p>" : "") +
      (excerpt ? '<div class="view-box"><img class="logo-light" src="assets/img/gerico-mark.svg" alt=""><img class="logo-dark" src="assets/img/gerico-mark-dark.svg" alt=""><div><p class="t">Il parere di GERICO</p><p class="v">' +
        esc(excerpt) + '</p><a href="' + G.storyUrl(s) + '">Fatti, divergenze e fonti</a></div></div>' : "") +
      "</article>";
  }
  function cardHTML(s) {
    return '<article class="card">' + G.kicker(s, lastRun) +
      '<h2><a href="' + G.storyUrl(s) + '">' + esc(s.title) + "</a></h2>" +
      '<p class="s">' + esc(G.firstSentences(s.summary, 230)) + "</p>" +
      '<div class="agrow">' + G.wall(s.sources) + "<span>" + esc(G.agreeShort(s.sources)) + "</span></div></article>";
  }
  function renderFeed() {
    const list = visible();
    if (!list.length) {
      $("feed").innerHTML = state.section === "seguiti"
        ? '<div class="empty"><h2>Nessuna storia sui temi che segui.</h2><p>Scegli i temi nella colonna «Temi da seguire» o dentro una storia.</p></div>'
        : '<div class="empty"><h2>Nessuna storia in questa sezione.</h2><p><a href="#">Torna alla prima pagina</a>.</p></div>';
      return;
    }
    $("feed").innerHTML = leadHTML(list[0]) + (list.length > 1 ? '<div class="cards">' + list.slice(1).map(cardHTML).join("") + "</div>" : "");
  }

  // ---------- striscia dei mercati ----------
  function renderStrip() {
    if (!mk || !Array.isArray(mk.classes)) return;
    const parts = [];
    mk.classes.forEach((c) => {
      if (c.key === "azioni" || c.key === "cripto") return;
      (c.items || []).forEach((it) => {
        const v = G.cleanValue(it.value), mv = G.move(it);
        if (!v && !mv) return;
        parts.push("<span>" + esc(short(it.name)) + (v ? ' <span class="mono">' + esc(v) + "</span>" : "") +
          (mv ? ' <b class="' + G.tone(it, c.key) + '">' + esc(mv) + "</b>" : "") + "</span>");
      });
    });
    if (!parts.length) return;
    $("strip-in").innerHTML = '<span class="lab">' + esc(mk.label || "Mercati") + (mk.asOf ? ", " + esc(G.when(mk.asOf)) : "") + "</span>" + parts.join("");
    $("strip").hidden = false;
  }

  // ---------- colonna di destra ----------
  function renderRail() {
    let html = "";
    if (mk && Array.isArray(mk.classes)) {
      const rows = mk.classes.map((c) => {
        const items = c.items || [];
        const head = '<tr><th scope="colgroup" colspan="3">' + esc(c.label) + "</th></tr>";
        if (!items.length) return head + '<tr class="row"><td class="na" colspan="3">' + esc(c.note || "Nessun dato verificato.") + "</td></tr>";
        return head + items.map((it) => '<tr class="row"><th scope="row">' + esc(short(it.name)) + "</th><td>" + esc(G.cleanValue(it.value)) +
          '</td><td class="mv ' + G.tone(it, c.key) + '">' + esc(G.move(it)) + "</td></tr>").join("");
      }).join("");
      html += '<section aria-labelledby="mk-h"><div class="headrow"><h2 id="mk-h">Mercati</h2><span>' + esc(mk.label || "") +
        (mk.asOf ? ", " + esc(G.when(mk.asOf)) : "") + '</span></div><table class="mkt"><tbody>' + rows +
        '</tbody></table><a class="more" href="terminal.html">Tutti i dati e l\'agenda nel Terminal</a></section>';
    }
    if (wt) {
      html += '<a class="teaser" href="terminal.html"><span class="th"><img src="assets/img/gerico-mark-dark.svg" alt=""><span>GERICO TERMINAL</span></span>' +
        '<div class="tmap" id="teaser-map" aria-hidden="true"></div>' +
        "<p>Ogni quadrato è una Borsa, grande quanto il suo peso nell'indice mondiale MSCI ACWI. Verde se l'ultima seduta è salita, rosso se è scesa.</p>" +
        '<span class="go">Apri il Terminal</span></a>';
    }
    const contested = stories.filter((s) => (s.divergences || []).length)
      .map((s) => ({ s, share: G.counts(s.sources).allineata / ((s.sources || []).length || 1) }))
      .sort((a, b) => a.share - b.share).slice(0, 3);
    if (contested.length) {
      html += '<section aria-labelledby="dv-h"><h2 id="dv-h">Dove le testate si dividono</h2><ul class="splits">' +
        contested.map(({ s }) => '<li><a href="' + G.storyUrl(s) + '"><span class="q">' + esc(s.divergences[0].point) + '</span><span class="t">' + esc(s.title) + "</span></a></li>").join("") +
        "</ul></section>";
    }
    const freq = {};
    stories.forEach((s) => (s.tags || []).forEach((t) => { freq[t] = (freq[t] || 0) + 1; }));
    const tags = Object.keys(freq).sort((a, b) => freq[b] - freq[a] || a.localeCompare(b, "it")).slice(0, 14);
    if (tags.length) {
      html += '<section aria-labelledby="tg-h"><h2 id="tg-h">Temi da seguire</h2><div class="tags">' +
        tags.map((t) => '<button type="button" class="tag" data-follow="' + esc(t) + '" aria-pressed="' + state.follows.includes(t) + '">' + esc(t) + "</button>").join("") +
        '</div><p class="hint">I temi seguiti finiscono nella sezione Seguiti. Restano solo in questo browser.</p></section>';
    }
    $("rail").innerHTML = html;
    drawTeaser();
  }
  function drawTeaser() {
    const el = $("teaser-map");
    if (el && wt) G.drawMap(el, G.mapItems(wt, tm, "mondo"), { compact: true });
  }

  // ---------- eventi ----------
  $("rail").addEventListener("click", (e) => {
    const b = e.target.closest("[data-follow]");
    if (!b) return;
    state.follows = G.toggleFollow(b.dataset.follow);
    b.setAttribute("aria-pressed", String(state.follows.includes(b.dataset.follow)));
    if (state.section === "seguiti" && !state.follows.length) state.section = "tutte";
    renderNav(); renderFeed();
  });
  window.addEventListener("hashchange", () => { state.section = sectionFromHash(); renderNav(); renderFeed(); });
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawTeaser, 120); });

  state.section = sectionFromHash();
  if (state.section === "seguiti" && !state.follows.length) state.section = "tutte";
  renderNav(); renderStrip(); renderFeed(); renderRail();
})();
