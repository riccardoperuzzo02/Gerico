/* GERICO: pagina di una storia (storia.html?id=...). */
G.page("story", async function (P) {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);
  G.initPrefs();

  const CHEV = '<svg class="chev" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4"/></svg>';
  const back = '<a class="back" id="back" href="index.html" data-dir="back"><svg aria-hidden="true" width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 2 8l6 6"/></svg>Prima pagina</a>';
  const topBar = '<div class="story-top">' + back + '<button type="button" class="share" id="share">Condividi</button></div>';
  const id = new URLSearchParams(location.search).get("id") || "";
  const [ed, mk0, qt] = await Promise.all([G.load("edition"), G.load("markets"), G.load("quotes")]);
  // i mercati collegati con i numeri più freschi (job dei prezzi o redazione, G.withQuotes)
  const mk = G.withQuotes(mk0, qt);
  if (!ed) {
    $("story").innerHTML = back + '<div class="empty"><h1>La storia non si è caricata.</h1><p>Può essere la connessione. Riprova tra poco.</p>' +
      '<p><button type="button" class="btn-retry" id="retry">Riprova</button></p></div>';
    $("retry").addEventListener("click", () => location.reload());
    return;
  }
  const s = (ed.stories || []).concat(ed.archive || []).find((x) => x.id === id);
  if (!s) {
    $("story").innerHTML = back + '<div class="empty"><h1>Questa storia non c\'è più.</h1><p>GERICO tiene le storie per una settimana. <a href="index.html">Torna alla prima pagina</a>.</p></div>';
    return;
  }
  const title = G.headline(s);
  document.title = title + " · GERICO";
  const md = document.querySelector('meta[name="description"]');
  if (md && s.summary) md.setAttribute("content", s.summary);
  // dati strutturati per i motori di ricerca, che leggono anche quello che scrive lo script
  try {
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    const img = document.querySelector('meta[property="og:image"]');
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "NewsArticle", headline: title.slice(0, 110), description: s.summary || "", articleBody: s.article || undefined,
      datePublished: s.firstSeen || s.updated || undefined, dateModified: s.updated || s.firstSeen || undefined,
      image: img ? [img.content] : undefined, mainEntityOfPage: location.origin + location.pathname + "?id=" + encodeURIComponent(id),
      author: { "@type": "Organization", name: "GERICO" }, publisher: { "@type": "Organization", name: "GERICO" }
    });
    document.head.appendChild(ld);
  } catch (err) { /* niente */ }

  // ---------- testa: sezione, ora e fonti, titolo, sommario ----------
  const when = s.status === "archived" ? "archiviata" : s.updated ? "aggiornata " + G.when(s.updated) : "";
  const nSrcs = G.srcCount(s.sources);
  const sep = '<span class="sep" aria-hidden="true">·</span>';
  const metaHTML = '<span class="sec">' + esc(G.secLabel(s.section)) + "</span>" + (when ? sep + "<span>" + esc(when) + "</span>" : "") + (nSrcs ? sep + "<span>" + esc(nSrcs) + "</span>" : "");
  const upd = G.updatedLabel(s, G.firstRunToday(ed.stories));
  const latest = upd ? '<p class="latest"><strong>' + esc(upd) + ".</strong> " + esc(s.change) + "</p>" : "";

  // ---------- l'articolo di GERICO, scritto su tutte le fonti ----------
  const art = G.paras(s.article);
  const articleHTML = art.length ? '<div class="article">' + art.map((p) => "<p>" + esc(p) + "</p>").join("") + "</div>" : "";
  // le storie scritte prima del formato nuovo non hanno l'articolo: i fatti in fila, ognuno con le sue fonti,
  // e le versioni diverse quando ci sono
  const facts = art.length ? [] : s.facts || [];
  const factsHTML = facts.length ? '<ul class="facts">' + facts.map((f) => {
    const who = Array.isArray(f.who) && f.who.length ? f.who.join(", ") : "";
    return '<li><p class="tx">' + esc(f.text) + "</p>" + (who ? '<p class="who">' + esc("Fonti: " + who) + "</p>" : "") + "</li>";
  }).join("") + "</ul>" : "";
  const divs = art.length ? "" : (s.divergences || []).map((d) => '<div class="div-item"><h3>' + esc(d.point) + '</h3><dl class="pos-list' + ((d.positions || []).length === 2 ? " two" : "") + '">' +
    (d.positions || []).map((p) => '<div class="pos"><dt>' + esc((p.who || []).join(", ")) + "</dt><dd>" + esc(p.says) + "</dd></div>").join("") + "</dl></div>").join("");
  const divBlock = divs ? '<section class="block" aria-labelledby="dg-h"><h2 id="dg-h">Versioni diverse</h2>' + divs + "</section>" : "";

  // ---------- cosa non si sa, parere, cronologia ----------
  const paras = G.paras(s.view).map((p) => "<p>" + esc(p) + "</p>").join("");
  const viewBlock = paras ? '<section class="view-panel" aria-labelledby="pr-h"><h2 id="pr-h">Il parere di GERICO</h2>' + paras + "</section>" : "";
  const disclosure = (pid, label, inner, extra) => '<section class="block disc-block' + (extra ? " " + extra : "") + '"><h2><button type="button" class="disc" aria-expanded="false" aria-controls="' + pid + '">' +
    label + CHEV + '</button></h2><div class="collapse" id="' + pid + '" inert><div class="collapse-in">' + inner + "</div></div></section>";
  const histList = s.history || [];
  const hist = histList.length >= 2 ? disclosure("hist", "Come è cambiata", '<ol class="hist">' +
    histList.map((h) => '<li><span class="at">' + esc(G.day(h.at) + ", " + G.hm(h.at)) + "</span><span>" + esc(h.text) + "</span></li>").join("") + "</ol>") : "";
  const open = (s.open || []).length ? '<section class="block" aria-labelledby="op-h"><h2 id="op-h">Cosa non si sa ancora</h2><ul class="openq">' +
    s.open.map((q) => "<li>" + esc(q) + "</li>").join("") + "</ul></section>" : "";

  // ---------- fonti, mercati collegati, temi ----------
  // le fonti in ordine di area: si vede da dove arrivano le voci dell'articolo
  const AREAS = ["Italia", "Europa", "Stati Uniti", "Medio Oriente", "Ucraina e Russia", "Asia"];
  const areaRank = (x) => { const k = AREAS.indexOf(x.area); return k < 0 ? AREAS.length : k; };
  const srcs = (s.sources || []).slice().sort((a, b) => areaRank(a) - areaRank(b));
  const srcList = '<ul class="srcs">' + srcs.map((x) => {
    const u = G.safeUrl(x.url);
    const date = x.at ? G.day(x.at) : x.date ? G.dayOnly(x.date) : "";
    const meta = [x.area || x.country, x.kind, date].filter(Boolean).join(" · ");
    // un link a una prima pagina non prova il fatto: domani quella pagina dirà altro
    const front = u && G.isFrontPage(u) ? '<span class="fp">pagina principale</span>' : "";
    return '<li><div class="src-top">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(x.name) + "</a>" : "<strong>" + esc(x.name) + "</strong>") + front +
      "</div>" + (meta ? '<p class="meta2">' + esc(meta) + "</p>" : "") + (x.angle ? '<p class="angle">' + esc(x.angle) + "</p>" : "") + "</li>";
  }).join("") + "</ul>";
  const areas = AREAS.filter((a) => srcs.some((x) => x.area === a));
  const srcIntro = areas.length > 1 ? '<p class="src-areas">Da ' + areas.length + " aree: " + esc(areas.join(", ")) + ".</p>" : "";
  // le testate si contano una volta; se di una testata ci sono più articoli, il titolo lo dice
  const nSrc = (s.sources || []).length, nOut = G.outlets(s.sources).length;
  const srcTitle = nSrc === 1 ? "La fonte" : nOut === nSrc ? "Le " + nSrc + " fonti" : "Le " + nOut + " testate, " + nSrc + " articoli";
  const linked = [];
  ((mk && mk.classes) || []).forEach((c) => (c.items || []).forEach((it) => { if (it.story === s.id) linked.push({ it, c }); }));
  const linkedHTML = linked.length ? '<section class="linked" aria-label="Mercati collegati"><h2>Mercati collegati</h2><table><tbody>' +
    linked.map(({ it, c }) => '<tr><th scope="row">' + esc(G.shortName(it.name)) + "</th><td>" + esc(G.cleanValue(it.value)) +
      '</td><td class="mv ' + G.tone(it, c.key) + '">' + esc(typeof it.bp === "number" ? G.bpsLong(it.bp) : G.move(it)) + "</td></tr>").join("") +
    '</tbody></table><p class="when">' + esc(G.mkWhen(mk)) + '</p><a class="more" href="terminal.html">Tutti i mercati</a></section>' : "";
  const follows = G.follows();
  const tagsHTML = (s.tags || []).length ? '<section class="tagbox" aria-label="Temi"><h2>Segui questi temi</h2><div class="tags">' +
    s.tags.map((t) => '<button type="button" class="tag" data-follow="' + esc(t) + '" aria-pressed="' + follows.includes(t) + '">' + esc(t) + "</button>").join("") + "</div></section>" : "";

  // sul telefono le fonti stanno nel testo, chiuse; sul computer nella colonna di destra
  const narrow = (nSrc ? disclosure("srcs-n", srcTitle, srcIntro + srcList, "srcbox only-narrow") : "") + '<div class="only-narrow">' + linkedHTML + tagsHTML + "</div>";
  // in due tempi: prima quello che sta nello schermo, il resto al fotogramma dopo (l'arrivo sulla pagina resta leggero)
  // in fondo la notizia successiva dell'edizione, così si legge di fila senza tornare indietro
  const order = (ed.stories || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const at = order.findIndex((x) => x.id === s.id);
  const nx = at >= 0 ? order[at + 1] : null;
  const pv = at > 0 ? order[at - 1] : null;
  const nextHTML = nx
    ? '<nav class="next" aria-label="Prossima notizia"><a href="' + G.storyUrl(nx) + '" data-id="' + esc(nx.id) + '" data-sec="' + esc(G.secLabel(nx.section)) + '">' +
      '<span class="next-l">Prossima notizia</span><span class="next-t">' + esc(G.headline(nx)) + '</span><span class="next-m">' +
      esc([G.secLabel(nx.section), G.srcCount(nx.sources)].filter(Boolean).join(" · ")) + "</span></a></nav>"
    : at >= 0 ? '<nav class="next" aria-label="Fine dell\'edizione"><a href="index.html"><span class="next-l">Fine dell\'edizione</span><span class="next-t">Torna alla prima pagina</span></a></nav>' : "";
  // prima i fatti (l'articolo), poi cosa non si sa, poi il parere, dichiarato, e le fonti
  const body = '<p class="sum">' + esc(s.summary) + "</p>" + latest + (articleHTML || factsHTML);
  const rest = divBlock + open + viewBlock + narrow + hist + nextHTML;

  // se il titolo è già al suo posto (arrivo dalla prima pagina) resta lo stesso elemento
  const h1 = $("st-title");
  if (h1 && h1.textContent === title && $("st-body")) {
    $("st-meta").innerHTML = metaHTML;
    $("st-body").innerHTML = body;
    if (!G.soft) $("st-body").classList.add("reveal");
    if ($("share")) $("share").hidden = false;
  } else {
    $("story").innerHTML = topBar + '<p class="meta" id="st-meta">' + metaHTML + '</p><h1 id="st-title">' + esc(title) + '</h1><div id="st-body"' + (G.soft ? "" : ' class="reveal"') + ">" + body + "</div>";
  }
  // il resto della storia (sotto lo schermo) arriva a passaggio animato finito: mentre il titolo vola, la pagina non ha altro da fare
  const fill = () => {
    $("st-body").insertAdjacentHTML("beforeend", rest);
    $("side").innerHTML = (nSrc ? '<section aria-labelledby="sr-h"><h2 id="sr-h">' + srcTitle + "</h2>" + srcIntro + srcList + "</section>" : "") + linkedHTML + tagsHTML;
  };
  const afterPass = () => requestAnimationFrame(() => setTimeout(fill, 0));
  const pass = window.gericoVT;
  // con lo swipe e sul telefono la pagina entra intera e scorre tutta insieme: il resto deve già esserci nella fotografia
  // della transizione, così nessuna scritta compare dopo. Sul computer il titolo vola e il resto arriva a passaggio finito
  const whole = !!document.documentElement.dataset.swipe || matchMedia("(max-width: 759px)").matches;
  if (pass && pass.finished && whole) fill();
  else if (pass && pass.finished) pass.finished.then(afterPass, afterPass);
  else afterPass();

  // ---------- eventi ----------
  // arrivati dalla prima pagina, «Prima pagina» torna indietro: stessa posizione e titolo che rifà il percorso
  let fromHome = false;
  try {
    const vt = JSON.parse(sessionStorage.getItem("gerico.vt") || "null");
    const ref = G.prevUrl ? new URL(G.prevUrl) : document.referrer ? new URL(document.referrer) : null;
    fromHome = !!(vt && vt.id === id && ref && ref.origin === location.origin && /^\/(index(\.html)?)?$/.test(ref.pathname) && history.length > 1);
    // anche dopo essere passati da una storia all'altra e tornati indietro: se il passo prima è la prima pagina, si torna lì
    if (!fromHome && G.entryBefore && /^\/(index(\.html)?)?$/.test(G.entryBefore().split("?")[0])) fromHome = true;
  } catch (err) { /* niente */ }
  // condividere: il foglio di condivisione del telefono, altrimenti il link copiato
  // si condivide la pagina /s/<id>: ha titolo e sintesi nei meta, così l'anteprima su WhatsApp e simili è quella della storia
  async function share() {
    const url = /^[a-z0-9][a-z0-9-]{0,150}$/.test(id) ? new URL("s/" + id, location.href).href : location.href;
    if (navigator.share) { try { await navigator.share({ title: title + " · GERICO", url }); } catch (err) { /* annullato */ } return; }
    try { await navigator.clipboard.writeText(url); G.toast("Link copiato"); } catch (err) { G.toast("Copia il link dalla barra degli indirizzi"); }
  }
  // passaggio verso la notizia successiva: il titolo della scheda diventa il titolo della pagina dopo
  const handoff = (toNext) => {
    const h = $("st-title"), nt = document.querySelector(".next-t");
    if (h) h.style.viewTransitionName = toNext ? "none" : "";
    if (nt) nt.style.viewTransitionName = toNext ? "story-title" : "";
  };
  P.on(window, "pageswap", (e) => {
    const nt = document.querySelector(".next a[data-id]");
    let toNext = false;
    try {
      const u = e.activation && e.activation.entry && e.activation.entry.url ? new URL(e.activation.entry.url) : null;
      toNext = !!(u && nt && u.searchParams.get("id") === nt.dataset.id);
    } catch (err) { /* niente */ }
    handoff(toNext);
  });
  // swipe: a sinistra la notizia successiva dell'edizione, a destra quella prima. La pagina segue il dito e, lasciata,
  // prosegue da lì alla stessa velocità mentre la storia vicina entra attaccata (transizione di pagina con lo scarto del dito)
  G.swipe($("story"), {
    canNext: () => !!nx, canPrev: () => !!pv,
    next: (reset, off, anim) => { reset(false); G.go(G.storyUrl(nx), { dir: "forward", swipe: true, sx: off, anim }); },
    prev: (reset, off, anim) => { reset(false); G.go(G.storyUrl(pv), { dir: "back", swipe: true, sx: off, anim }); }
  });
  // prima del passaggio di pagina di common.js (fase di cattura): un solo passaggio, quello indietro. Prima partivano
  // tutti e due, la pagina si rifaceva due volte e la cronologia si sporcava
  P.on(document, "click", (e) => {
    if (fromHome && e.target.closest("#back") && !e.button && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); history.back(); }
  }, { capture: true });
  P.on(document, "click", (e) => {
    if (e.target.closest("#share")) { share(); return; }
    const na = e.target.closest(".next a[data-id]");
    if (na) {
      handoff(true);
      try { sessionStorage.setItem("gerico.vt", JSON.stringify({ id: na.dataset.id, title: na.querySelector(".next-t").textContent, sec: na.dataset.sec })); } catch (err) { /* niente */ }
      return;
    }
    const t = e.target.closest(".disc");
    if (t) { G.toggle(t); return; }
    const b = e.target.closest("[data-follow]");
    if (!b) return;
    const f = G.toggleFollow(b.dataset.follow);
    document.querySelectorAll('[data-follow="' + CSS.escape(b.dataset.follow) + '"]').forEach((x) => x.setAttribute("aria-pressed", String(f.includes(b.dataset.follow))));
  });
});
