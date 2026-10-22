/* GERICO: pagina di una storia (storia.html?id=...). */
(async function () {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);
  const short = (n) => String(n || "").replace(/\s*\([^)]*\)/g, "").trim();
  G.initPrefs();

  const id = new URLSearchParams(location.search).get("id") || "";
  const [ed, mk] = await Promise.all([G.load("edition"), G.load("markets")]);
  if (!ed) {
    $("story").innerHTML = '<div class="empty"><h1>La storia non si è caricata.</h1><p>Riprova tra qualche minuto.</p></div>';
    return;
  }
  const s = (ed.stories || []).concat(ed.archive || []).find((x) => x.id === id);
  if (!s) {
    $("story").innerHTML = '<div class="empty"><h1>Questa storia non c\'è più.</h1><p>GERICO tiene le storie per una settimana. <a href="index.html">Torna alla prima pagina</a>.</p></div>';
    return;
  }
  document.title = s.title + " · GERICO";
  const md = document.querySelector('meta[name="description"]');
  if (md && s.summary) md.setAttribute("content", s.summary);

  // ---------- testa ----------
  const f0 = s.status === "archived" ? "Archiviata" : G.flag(s, ed.lastRun);
  const flag = f0 === "Aggiornata" ? "" : f0; // l'orario sotto dice già «Aggiornata»
  const upd = s.updated ? (G.isToday(s.updated) ? "oggi alle " + G.hm(s.updated) : "il " + G.day(s.updated) + " alle " + G.hm(s.updated)) : "";
  const kicker = '<p class="kicker">' + (flag ? '<span class="upd">' + flag + "</span>" : "") +
    (upd ? '<span class="time">Aggiornata ' + esc(upd) + "</span>" : "") +
    (s.firstSeen ? '<span class="time">Seguita dal ' + esc(G.day(s.firstSeen)) + "</span>" : "") + "</p>";
  const nc = (s.notCovered || []).length ? '<p class="nc"><strong>Non ne parlano:</strong> ' + esc(s.notCovered.join(", ")) + "</p>" : "";
  const wallFig = '<figure class="wallfig">' + G.wall(s.sources, "huge") +
    '<figcaption><span class="agree">' + esc(G.agreeLong(s.sources)) + "</span>" +
    '<span class="legend"><span><i></i>concorda</span><span><i class="p"></i>in parte</span><span><i class="d"></i>diverge</span></span>' + nc + "</figcaption></figure>";

  // ---------- fatti ----------
  const SHOW = 6;
  const facts = (s.facts || []).slice().sort((a, b) => (b.n || 0) - (a.n || 0));
  const factsHTML = facts.map((f, i) => "<li" + (i >= SHOW ? ' class="more-hidden"' : "") + '><span class="tx">' + esc(f.text) +
    '</span><span class="n">' + (f.n || 1) + (f.n > 1 ? " testate" : " testata") + "</span></li>").join("");
  const factsBlock = facts.length ? '<section class="block" aria-labelledby="ft-h"><h2 id="ft-h"><span class="bar" aria-hidden="true"></span>Fatti condivisi</h2><ol class="facts" id="facts">' +
    factsHTML + "</ol>" + (facts.length > SHOW ? '<button type="button" class="btn" id="more-facts" aria-expanded="false" aria-controls="facts">Mostra gli altri ' + (facts.length - SHOW) + " fatti</button>" : "") + "</section>" : "";

  // ---------- divergenze, parere, cronologia, domande ----------
  const divs = (s.divergences || []).map((d) => '<div class="div-item"><h3>' + esc(d.point) + "</h3><dl>" +
    (d.positions || []).map((p) => "<dt>" + esc((p.who || []).join(", ")) + "</dt><dd>" + esc(p.says) + "</dd>").join("") + "</dl></div>").join("");
  const divBlock = '<section class="block" aria-labelledby="dg-h"><h2 id="dg-h">Dove divergono</h2>' +
    (divs || '<p style="margin-top:10px">Le testate lette concordano sui fatti principali.</p>') + "</section>";
  const paras = String(s.view || "").split(/\n\s*\n/).filter((p) => p.trim()).map((p) => "<p>" + esc(p.trim()) + "</p>").join("");
  const viewBlock = paras ? '<section class="view-panel" aria-labelledby="pr-h"><h2 id="pr-h"><img class="logo-light" src="assets/img/gerico-mark.svg" alt=""><img class="logo-dark" src="assets/img/gerico-mark-dark.svg" alt="">Il parere di GERICO</h2>' + paras + "</section>" : "";
  const hist = (s.history || []).map((h) => '<li><span class="at">' + esc(G.day(h.at) + ", " + G.hm(h.at)) + "</span><span>" + esc(h.text) + "</span></li>").join("");
  const open = (s.open || []).map((q) => "<li>" + esc(q) + "</li>").join("");

  $("story").innerHTML = '<p class="crumbs"><a href="index.html">Prima pagina</a> · ' + esc(G.secLabel(s.section)) + "</p>" + kicker +
    "<h1>" + esc(s.title) + '</h1><p class="sum">' + esc(s.summary) + "</p>" + wallFig +
    (s.change ? '<p class="latest"><strong>Ultima novità.</strong> ' + esc(s.change) + "</p>" : "") +
    factsBlock + divBlock + viewBlock +
    (hist ? '<section class="block" aria-labelledby="hs-h"><h2 id="hs-h">Come si è evoluta</h2><ol class="hist">' + hist + "</ol></section>" : "") +
    (open ? '<section class="block" aria-labelledby="op-h"><h2 id="op-h">Ancora da chiarire</h2><ul class="openq">' + open + "</ul></section>" : "");

  // ---------- colonna: fonti, mercati collegati, temi ----------
  const stance = { allineata: "concorda", parziale: "in parte", divergente: "diverge" };
  const srcs = (s.sources || []).map((x) => {
    const u = G.safeUrl(x.url);
    const date = x.at ? G.day(x.at) : x.date ? G.dayOnly(x.date) : "";
    const meta = [x.area || x.country, x.kind, date].filter(Boolean).join(" · ");
    return '<li><div class="top">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(x.name) + "</a>" : "<strong>" + esc(x.name) + "</strong>") +
      '<span class="st">' + esc(stance[x.stance] || "in parte") + "</span></div>" + (meta ? '<p class="meta">' + esc(meta) + "</p>" : "") +
      (x.angle ? '<p class="angle">' + esc(x.angle) + "</p>" : "") + "</li>";
  }).join("");
  const linked = [];
  ((mk && mk.classes) || []).forEach((c) => (c.items || []).forEach((it) => { if (it.story === s.id) linked.push({ it, c }); }));
  const linkedHTML = linked.length ? '<div class="linked"><h2>MERCATI COLLEGATI</h2><table><tbody>' +
    linked.map(({ it, c }) => '<tr><th scope="row">' + esc(short(it.name)) + "</th><td>" + esc(G.cleanValue(it.value)) +
      (G.move(it) ? ' <span class="' + G.tone(it, c.key) + '">' + esc(G.move(it)) + "</span>" : "") + "</td></tr>").join("") +
    "</tbody></table><p>" + esc(mk.label || "") + (mk.asOf ? ", " + esc(G.when(mk.asOf)) : "") + '</p><a href="terminal.html">Apri nel Terminal</a></div>' : "";
  const follows = G.follows();
  const tags = (s.tags || []).length ? '<section aria-labelledby="tt-h"><h2 id="tt-h">Temi da seguire</h2><div class="tags">' +
    s.tags.map((t) => '<button type="button" class="tag" data-follow="' + esc(t) + '" aria-pressed="' + follows.includes(t) + '">' + esc(t) + "</button>").join("") +
    '</div><p class="hint">I temi seguiti finiscono nella sezione Seguiti della prima pagina.</p></section>' : "";
  $("rail").innerHTML = (srcs ? '<section aria-labelledby="sr-h"><h2 id="sr-h">Le fonti</h2><ul class="srcs">' + srcs + "</ul></section>" : "") + linkedHTML + tags;

  // ---------- eventi ----------
  const more = $("more-facts");
  if (more) more.addEventListener("click", () => {
    const list = $("facts"), openNow = !list.classList.contains("open");
    list.classList.toggle("open", openNow);
    more.setAttribute("aria-expanded", String(openNow));
    more.textContent = openNow ? "Mostra meno fatti" : "Mostra gli altri " + (facts.length - SHOW) + " fatti";
  });
  $("rail").addEventListener("click", (e) => {
    const b = e.target.closest("[data-follow]");
    if (!b) return;
    const f = G.toggleFollow(b.dataset.follow);
    b.setAttribute("aria-pressed", String(f.includes(b.dataset.follow)));
  });
})();
