/* GERICO: pagina di una storia (storia.html?id=...). */
(async function () {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);
  G.initPrefs();

  const id = new URLSearchParams(location.search).get("id") || "";
  const [ed, mk] = await Promise.all([G.load("edition"), G.load("markets")]);
  const back = '<a class="back" href="index.html"><span aria-hidden="true">←</span> Prima pagina</a>';
  if (!ed) {
    $("story").innerHTML = back + '<div class="empty"><h1>La storia non si è caricata.</h1><p>Riprova tra qualche minuto.</p></div>';
    return;
  }
  if (ed.lastRun) G.setEdition(ed.lastRun);
  const s = (ed.stories || []).concat(ed.archive || []).find((x) => x.id === id);
  if (!s) {
    $("story").innerHTML = back + '<div class="empty"><h1>Questa storia non c\'è più.</h1><p>GERICO tiene le storie per una settimana. <a href="index.html">Torna alla prima pagina</a>.</p></div>';
    return;
  }
  const title = G.headline(s);
  document.title = title + " · GERICO";
  const md = document.querySelector('meta[name="description"]');
  if (md && s.summary) md.setAttribute("content", s.summary);

  // ---------- testa: una sola riga di informazioni ----------
  const when = s.status === "archived" ? "archiviata" : s.updated ? "aggiornata " + G.when(s.updated) : "";
  const metaLine = '<p class="meta"><span class="sec">' + esc(G.secLabel(s.section)) + "</span>" + (when ? "<span>" + esc(when) + "</span>" : "") + "</p>";
  const upd = G.updatedLabel(s, G.firstRunToday(ed.stories));
  const latest = upd ? '<p class="latest"><strong>' + esc(upd) + ".</strong> " + esc(s.change) + "</p>" : "";
  const nc = (s.notCovered || []).length ? '<p class="nc">Non ne parlano: ' + esc(s.notCovered.join(", ")) + "</p>" : "";
  const wallFig = '<figure class="wallfig">' + G.wall(s.sources, "huge") +
    '<figcaption><span class="agree">' + esc(G.agreeLong(s.sources)) + "</span>" +
    '<span class="legend"><span><i></i>concorda</span><span><i class="p"></i>in parte</span><span><i class="d"></i>diverge</span></span>' + nc + "</figcaption></figure>";

  // ---------- fatti: i 3 riportati da più testate, gli altri a richiesta ----------
  const SHOW = 3;
  const facts = (s.facts || []).slice().sort((a, b) => (b.n || 0) - (a.n || 0));
  const factsHTML = facts.map((f, i) => {
    const n = f.n || 1;
    const who = Array.isArray(f.who) && f.who.length ? f.who.join(", ") : "";
    const by = (n === 1 ? "1 testata" : n + " testate") + (who ? ": " + who : "");
    return "<li" + (i >= SHOW ? ' class="more-hidden"' : "") + '><p class="tx">' + esc(f.text) + '</p><p class="who">' + esc(by) + "</p></li>";
  }).join("");
  const factsBlock = facts.length ? '<section class="block" aria-labelledby="ft-h"><h2 id="ft-h"><span class="bar" aria-hidden="true"></span>Su cosa concordano</h2><ol class="facts" id="facts">' +
    factsHTML + "</ol>" + (facts.length > SHOW ? '<button type="button" class="btn" id="more-facts" aria-expanded="false" aria-controls="facts">Mostra tutti i ' + facts.length + " fatti</button>" : "") + "</section>" : "";

  // ---------- divergenze, parere, cronologia, domande ----------
  const divs = (s.divergences || []).map((d) => '<div class="div-item"><h3>' + esc(d.point) + "</h3><dl>" +
    (d.positions || []).map((p) => "<dt>" + esc((p.who || []).join(", ")) + "</dt><dd>" + esc(p.says) + "</dd>").join("") + "</dl></div>").join("");
  const divBlock = '<section class="block" aria-labelledby="dg-h"><h2 id="dg-h">Dove si dividono</h2>' +
    (divs || '<p class="plain">Le testate lette concordano sui fatti principali.</p>') + "</section>";
  const paras = String(s.view || "").split(/\n\s*\n/).filter((p) => p.trim()).map((p) => "<p>" + esc(p.trim()) + "</p>").join("");
  const viewBlock = paras ? '<section class="view-panel" aria-labelledby="pr-h"><h2 id="pr-h"><img class="logo-light" src="assets/img/gerico-mark.svg" alt=""><img class="logo-dark" src="assets/img/gerico-mark-dark.svg" alt="">Il parere di GERICO</h2>' + paras + "</section>" : "";
  const histList = s.history || [];
  const hist = histList.length >= 2 ? '<section class="block" aria-labelledby="hs-h"><h2 id="hs-h">Come è cambiata</h2><ol class="hist">' +
    histList.map((h) => '<li><span class="at">' + esc(G.day(h.at) + ", " + G.hm(h.at)) + "</span><span>" + esc(h.text) + "</span></li>").join("") + "</ol></section>" : "";
  const open = (s.open || []).length ? '<section class="block" aria-labelledby="op-h"><h2 id="op-h">Domande aperte</h2><ul class="openq">' +
    s.open.map((q) => "<li>" + esc(q) + "</li>").join("") + "</ul></section>" : "";

  // ---------- fonti, mercati collegati, temi ----------
  const stance = { allineata: "concorda", parziale: "in parte", divergente: "diverge" };
  const srcList = '<ul class="srcs">' + (s.sources || []).map((x) => {
    const u = G.safeUrl(x.url);
    const date = x.at ? G.day(x.at) : x.date ? G.dayOnly(x.date) : "";
    const meta = [x.area || x.country, x.kind, date].filter(Boolean).join(" · ");
    return '<li><div class="src-top">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(x.name) + "</a>" : "<strong>" + esc(x.name) + "</strong>") +
      '<span class="st st-' + esc(x.stance || "parziale") + '">' + esc(stance[x.stance] || "in parte") + "</span></div>" + (meta ? '<p class="meta2">' + esc(meta) + "</p>" : "") +
      (x.angle ? '<p class="angle">' + esc(x.angle) + "</p>" : "") + "</li>";
  }).join("") + "</ul>";
  const nSrc = (s.sources || []).length;
  const linked = [];
  ((mk && mk.classes) || []).forEach((c) => (c.items || []).forEach((it) => { if (it.story === s.id) linked.push({ it, c }); }));
  const linkedHTML = linked.length ? '<section class="linked" aria-label="Mercati collegati"><h2>Mercati collegati</h2><table><tbody>' +
    linked.map(({ it, c }) => '<tr><th scope="row">' + esc(G.shortName(it.name)) + "</th><td>" + esc(G.cleanValue(it.value)) +
      '</td><td class="mv ' + G.tone(it, c.key) + '">' + esc(typeof it.bp === "number" ? G.bpsLong(it.bp) : G.move(it)) + "</td></tr>").join("") +
    '</tbody></table><p class="when">' + esc(G.cap(mk.label || "")) + (mk.asOf ? ", " + esc(G.when(mk.asOf)) : "") + '</p><a class="more" href="terminal.html">Tutti i mercati</a></section>' : "";
  const follows = G.follows();
  const tagsHTML = (s.tags || []).length ? '<section class="tagbox" aria-label="Temi"><h2>Segui questi temi</h2><div class="tags">' +
    s.tags.map((t) => '<button type="button" class="tag" data-follow="' + esc(t) + '" aria-pressed="' + follows.includes(t) + '">' + esc(t) + "</button>").join("") +
    '</div><p class="hint">Le storie sui temi che segui finiscono nella sezione Seguiti. La scelta resta in questo browser.</p></section>' : "";

  // sul telefono le fonti stanno nel testo, chiuse; sul computer nella colonna di destra
  const narrow = (nSrc ? '<details class="block srcbox only-narrow"><summary>Le ' + nSrc + " fonti, con i link agli articoli</summary>" + srcList + "</details>" : "") +
    '<div class="only-narrow">' + linkedHTML + tagsHTML + "</div>";

  $("story").innerHTML = back + metaLine + "<h1>" + esc(title) + '</h1><p class="sum">' + esc(s.summary) + "</p>" + latest + wallFig +
    factsBlock + divBlock + viewBlock + narrow + hist + open;
  $("side").innerHTML = (nSrc ? '<section aria-labelledby="sr-h"><h2 id="sr-h">Le fonti</h2>' + srcList + "</section>" : "") + linkedHTML + tagsHTML;

  // ---------- eventi ----------
  const more = $("more-facts");
  if (more) more.addEventListener("click", () => {
    const list = $("facts"), openNow = !list.classList.contains("open");
    list.classList.toggle("open", openNow);
    more.setAttribute("aria-expanded", String(openNow));
    more.textContent = openNow ? "Mostra solo i principali" : "Mostra tutti i " + facts.length + " fatti";
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-follow]");
    if (!b) return;
    const f = G.toggleFollow(b.dataset.follow);
    document.querySelectorAll('[data-follow="' + CSS.escape(b.dataset.follow) + '"]').forEach((x) => x.setAttribute("aria-pressed", String(f.includes(b.dataset.follow))));
  });
})();
