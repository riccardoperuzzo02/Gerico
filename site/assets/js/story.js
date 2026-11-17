/* GERICO: pagina di una storia (storia.html?id=...). */
G.page("story", async function (P) {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);
  G.initPrefs();

  const CHEV = '<svg class="chev" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l4 4 4-4"/></svg>';
  const back = '<a class="back" id="back" href="index.html" data-dir="back"><svg aria-hidden="true" width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 2 8l6 6"/></svg>' + G.L("Prima pagina", "Front page") + "</a>";
  const topBar = '<div class="story-top">' + back + '<button type="button" class="share" id="share">' + G.L("Condividi", "Share") + "</button></div>";
  const id = new URLSearchParams(location.search).get("id") || "";
  const [ed, mk0, qt] = await Promise.all([G.load("edition"), G.load("markets"), G.load("quotes")]);
  // i mercati collegati con i numeri più freschi (job dei prezzi o redazione, G.withQuotes)
  const mk = G.withQuotes(mk0, qt);
  if (!ed) {
    $("story").innerHTML = back + '<div class="empty"><h1>' + G.L("La storia non si è caricata.", "The story did not load.") + "</h1><p>" + G.L("Può essere la connessione. Riprova tra poco.", "It may be the connection. Try again shortly.") + "</p>" +
      '<p><button type="button" class="btn-retry" id="retry">' + G.L("Riprova", "Try again") + "</button></p></div>";
    $("retry").addEventListener("click", () => location.reload());
    return;
  }
  const s = (ed.stories || []).concat(ed.archive || []).find((x) => x.id === id);
  if (!s) {
    // uscita dall'edizione: se è nell'archivio, la sua pagina c'è ancora
    const arch = await G.load("archivio");
    const x = arch && Array.isArray(arch.storie) ? arch.storie.find((y) => y.id === id) : null;
    if (x) {
      document.title = x.t + " · GERICO";
      $("story").innerHTML = back + '<div class="empty arch-vec"><p class="meta">' + esc(G.secLabel(x.sec)) + (x.d ? " · " + esc(G.dayOnly(x.d)) : "") + "</p><h1>" + esc(x.t) + "</h1>" +
        (x.s ? '<p class="sum">' + esc(x.s) + "</p>" : "") + "<p>" + G.L("La storia non è più nell'edizione di oggi: si legge intera nell'archivio.", "The story is no longer in today's edition: you can read it in full in the archive.") + "</p>" +
        '<p><a class="conto-b primario" href="/s/' + esc(x.id) + '">' + G.L("Leggi la storia nell'archivio", "Read the story in the archive") + '</a></p><p><a href="/archivio">' + G.L("Tutto l'archivio", "The whole archive") + "</a></p></div>";
      return;
    }
    $("story").innerHTML = back + '<div class="empty"><h1>' + G.L("Questa storia non c'è più.", "This story is no longer here.") + "</h1><p>" + G.L("Non è nell'edizione di oggi né nell'archivio.", "It's neither in today's edition nor in the archive.") + ' <a href="index.html">' + G.L("Torna alla prima pagina", "Back to the front page") + "</a>.</p></div>";
    return;
  }
  const title = G.headline(s);
  document.title = title + " · GERICO";
  // l'indirizzo canonico della storia è la sua pagina scritta in HTML (/s/<id>): è quella che va nei motori di ricerca
  try {
    let can = document.querySelector('link[rel="canonical"]');
    if (!can) { can = document.createElement("link"); can.rel = "canonical"; document.head.appendChild(can); }
    can.href = location.origin + "/s/" + encodeURIComponent(s.id);
    const md = document.querySelector('meta[name="description"]');
    if (md && s.summary) md.setAttribute("content", String(s.summary).slice(0, 200));
  } catch (e) { /* niente */ }
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
  const when = s.status === "archived" ? G.L("archiviata", "archived") : s.updated ? G.L("aggiornata ", "updated ") + G.when(s.updated) : "";
  const nSrcs = G.srcCount(s.sources);
  const sep = '<span class="sep" aria-hidden="true">·</span>';
  const metaHTML = '<span class="sec">' + esc(G.secLabel(s.section)) + "</span>" + (when ? sep + "<span>" + esc(when) + "</span>" : "") + (nSrcs ? sep + "<span>" + esc(nSrcs) + "</span>" : "") +
    (G.en && s.untranslated ? sep + "<span>in Italian</span>" : "");
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
    return '<li><p class="tx">' + esc(f.text) + "</p>" + (who ? '<p class="who">' + esc(G.L("Fonti: ", "Sources: ") + who) + "</p>" : "") + "</li>";
  }).join("") + "</ul>" : "";
  const divs = art.length ? "" : (s.divergences || []).map((d) => '<div class="div-item"><h3>' + esc(d.point) + '</h3><dl class="pos-list' + ((d.positions || []).length === 2 ? " two" : "") + '">' +
    (d.positions || []).map((p) => '<div class="pos"><dt>' + esc((p.who || []).join(", ")) + "</dt><dd>" + esc(p.says) + "</dd></div>").join("") + "</dl></div>").join("");
  const divBlock = divs ? '<section class="block" aria-labelledby="dg-h"><h2 id="dg-h">' + G.L("Versioni diverse", "Different versions") + "</h2>" + divs + "</section>" : "";

  // ---------- cosa non si sa, parere, cronologia ----------
  const paras = G.paras(s.view).map((p) => "<p>" + esc(p) + "</p>").join("");
  const viewBlock = paras ? '<section class="view-panel" aria-labelledby="pr-h"><h2 id="pr-h">' + G.L("Il parere di GERICO", "GERICO's view") + "</h2>" + paras + "</section>" : "";
  const disclosure = (pid, label, inner, extra) => '<section class="block disc-block' + (extra ? " " + extra : "") + '"><h2><button type="button" class="disc" aria-expanded="false" aria-controls="' + pid + '">' +
    label + CHEV + '</button></h2><div class="collapse" id="' + pid + '" inert><div class="collapse-in">' + inner + "</div></div></section>";
  const histList = s.history || [];
  const hist = histList.length >= 2 ? disclosure("hist", G.L("Come è cambiata", "How it changed"), '<ol class="hist">' +
    histList.map((h) => '<li><span class="at">' + esc(G.day(h.at) + ", " + G.hm(h.at)) + "</span><span>" + esc(h.text) + "</span></li>").join("") + "</ol>") : "";
  const open = (s.open || []).length ? '<section class="block" aria-labelledby="op-h"><h2 id="op-h">' + G.L("Cosa non si sa ancora", "What is not known yet") + '</h2><ul class="openq">' +
    s.open.map((q) => "<li>" + esc(q) + "</li>").join("") + "</ul></section>" : "";

  // ---------- fonti, mercati collegati, temi ----------
  // le fonti in ordine di area: si vede da dove arrivano le voci dell'articolo
  const AREAS = ["Italia", "Europa", "Stati Uniti", "Medio Oriente", "Ucraina e Russia", "Asia"];
  const areaRank = (x) => { const k = AREAS.indexOf(x.area); return k < 0 ? AREAS.length : k; };
  const srcs = (s.sources || []).slice().sort((a, b) => areaRank(a) - areaRank(b));
  const srcList = '<ul class="srcs">' + srcs.map((x) => {
    const u = G.safeUrl(x.url);
    const date = x.at ? G.day(x.at) : x.date ? G.dayOnly(x.date) : "";
    const meta = [G.tn(x.area || x.country), G.tn(x.kind), date].filter(Boolean).join(" · ");
    // un link a una prima pagina non prova il fatto: domani quella pagina dirà altro
    const front = u && G.isFrontPage(u) ? '<span class="fp">' + G.L("pagina principale", "home page") + "</span>" : "";
    return '<li><div class="src-top">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(x.name) + "</a>" : "<strong>" + esc(x.name) + "</strong>") + front +
      "</div>" + (meta ? '<p class="meta2">' + esc(meta) + "</p>" : "") + (x.angle ? '<p class="angle">' + esc(x.angle) + "</p>" : "") + "</li>";
  }).join("") + "</ul>";
  const areas = AREAS.filter((a) => srcs.some((x) => x.area === a));
  const srcIntro = areas.length > 1 ? '<p class="src-areas">' + G.L("Da ", "From ") + areas.length + G.L(" aree: ", " areas: ") + esc(areas.map(G.tn).join(", ")) + ".</p>" : "";
  // le testate si contano una volta; se di una testata ci sono più articoli, il titolo lo dice
  const nSrc = (s.sources || []).length, nOut = G.outlets(s.sources).length;
  const srcTitle = G.en ? (nSrc === 1 ? "The source" : nOut === nSrc ? "The " + nSrc + " sources" : "The " + nOut + " outlets, " + nSrc + " articles")
    : nSrc === 1 ? "La fonte" : nOut === nSrc ? "Le " + nSrc + " fonti" : "Le " + nOut + " testate, " + nSrc + " articoli";
  const linked = [];
  ((mk && mk.classes) || []).forEach((c) => (c.items || []).forEach((it) => { if (it.story === s.id) linked.push({ it, c }); }));
  const linkedHTML = linked.length ? '<section class="linked" aria-label="' + G.L("Mercati collegati", "Related markets") + '"><h2>' + G.L("Mercati collegati", "Related markets") + "</h2><table><tbody>" +
    linked.map(({ it, c }) => '<tr><th scope="row">' + esc(G.tn(G.shortName(it.name))) + "</th><td>" + esc(G.cleanValue(it.value)) +
      '</td><td class="mv ' + G.tone(it, c.key) + '">' + esc(typeof it.bp === "number" ? G.bpsLong(it.bp) : G.move(it)) + "</td></tr>").join("") +
    '</tbody></table><p class="when">' + esc(G.mkWhen(mk)) + '</p><a class="more" href="terminal.html">' + G.L("Tutti i mercati", "All markets") + "</a></section>" : "";
  // i temi della storia: un tocco li segue («+ Tema» diventa «✓ Tema»)
  const seguito = (t) => G.follows().some((f) => f.toLowerCase() === String(t).toLowerCase());
  const tagsHTML = (s.tags || []).length ? '<section class="tagbox" aria-label="' + G.L("Temi", "Topics") + '"><h2>' + G.L("Segui i temi di questa storia", "Follow this story's topics") + "</h2>" +
    '<p class="fol-note">' + G.L("Le notizie dei temi che segui le trovi nei Seguiti, in prima pagina.", "News on the topics you follow is in Following, on the front page.") + '</p><div class="tags">' +
    s.tags.map((t) => '<button type="button" class="tag" data-follow="' + esc(t) + '" aria-pressed="' + seguito(t) + '">' + esc(G.tn(t)) + "</button>").join("") +
    "</div></section>" : "";

  // sul telefono le fonti stanno nel testo, chiuse; sul computer nella colonna di destra
  const narrow = (nSrc ? disclosure("srcs-n", srcTitle, srcIntro + srcList, "srcbox only-narrow") : "") + '<div class="only-narrow">' + linkedHTML + tagsHTML + "</div>";
  // in due tempi: prima quello che sta nello schermo, il resto al fotogramma dopo (l'arrivo sulla pagina resta leggero)
  // in fondo la notizia successiva dell'edizione, così si legge di fila senza tornare indietro
  // le notizie nazionali di un altro paese (scope "paese") non entrano nella fila, salvo quella che stai leggendo
  const mioPaese = G.paese();
  const order = (ed.stories || []).filter((x) => x.scope !== "paese" || x.country === mioPaese || x.id === s.id).sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const at = order.findIndex((x) => x.id === s.id);
  const nx = at >= 0 ? order[at + 1] : null;
  const pv = at > 0 ? order[at - 1] : null;
  const nextHTML = nx
    ? '<nav class="next" aria-label="' + G.L("Prossima notizia", "Next story") + '"><a href="' + G.storyUrl(nx) + '" data-id="' + esc(nx.id) + '" data-sec="' + esc(G.secLabel(nx.section)) + '">' +
      '<span class="next-l">' + G.L("Prossima notizia", "Next story") + '</span><span class="next-t">' + esc(G.headline(nx)) + '</span><span class="next-m">' +
      esc([G.secLabel(nx.section), G.srcCount(nx.sources)].filter(Boolean).join(" · ")) + "</span></a></nav>"
    : at >= 0 ? '<nav class="next" aria-label="' + G.L("Fine dell'edizione", "End of the edition") + '"><a href="index.html"><span class="next-l">' + G.L("Fine dell'edizione", "End of the edition") + '</span><span class="next-t">' + G.L("Torna alla prima pagina", "Back to the front page") + "</span></a></nav>" : "";
  // prima i fatti (l'articolo), poi cosa non si sa, poi il parere, dichiarato, e le fonti
  // la firma: «A cura di R.P.» (che gli articoli li scrive l'intelligenza artificiale lo dice il piede della pagina)
  const byline = '<p class="byline">' + esc(G.CURA) + ' <span class="by">' + esc(G.FIRMA) + "</span></p>";
  // l'immagine sotto il sommario, come nei quotidiani: la mappa del luogo della notizia
  const body = '<p class="sum">' + esc(s.summary) + "</p>" + G.storyImg(s, { cls: "st-media", eager: true, credito: true }) + byline + latest + (articleHTML || factsHTML);
  // sotto la prossima notizia, altre quattro da leggere: prima quelle della stessa sezione, poi le più importanti
  const altre = order.filter((x) => x.id !== s.id && (!nx || x.id !== nx.id)).sort((a, b) => (b.section === s.section) - (a.section === s.section) || (a.rank || 99) - (b.rank || 99)).slice(0, 4);
  const altreHTML = altre.length >= 2 ? '<section class="blk altre" aria-labelledby="altre-h"><h2 class="blk-h" id="altre-h">' + G.L("Potrebbe interessarti anche", "You might also like") + '</h2><ol class="altre-l">' +
    altre.map((x, i) => '<li><a href="' + G.storyUrl(x) + '"><span class="altre-n" aria-hidden="true">' + String(i + 1).padStart(2, "0") + '</span><span class="altre-c"><span class="altre-k">' + esc(G.secLabel(x.section)) +
      '</span><span class="altre-t">' + esc(G.headline(x)) + "</span></span></a></li>").join("") + "</ol></section>" : "";
  // un errore nella storia: chi legge lo dice in due righe, arriva nel gestionale
  const segnalaHTML = '<p class="segnala"><button type="button" class="btn-text" id="segnala">' + G.L("Hai trovato un errore? Segnalalo", "Spotted a mistake? Report it") + "</button></p>";
  const rest = divBlock + open + viewBlock + narrow + hist + segnalaHTML + nextHTML + altreHTML;

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
  G.showImgs($("st-body"));
  // le parole del glossario nell'articolo: la prima volta che compaiono, al massimo sei
  G.load("glossario").then((gl) => {
    const a = gl && $("st-body") && $("st-body").querySelector(".article");
    if (a && !a.querySelector(".gl-w")) G.glossario.collega(a, gl, 6);
  });
  // il resto della storia (sotto lo schermo) arriva a passaggio animato finito: mentre il titolo vola, la pagina non ha altro da fare
  const fill = () => {
    $("st-body").insertAdjacentHTML("beforeend", rest);
    $("side").innerHTML = (nSrc ? '<section aria-labelledby="sr-h"><h2 id="sr-h">' + srcTitle + "</h2>" + srcIntro + srcList + "</section>" : "") + linkedHTML + tagsHTML;
  };
  // quello che arriva a passaggio finito (computer: la colonna delle fonti, il resto sotto) compare con una dissolvenza
  const late = () => {
    const had = $("st-body").children.length;
    fill();
    if (G.reduced()) return;
    // solo i pezzi appena arrivati: quello che c'era già non deve lampeggiare
    [$("side")].concat(Array.from($("st-body").children).slice(had)).forEach((el) => {
      if (el && el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
    });
  };
  const afterPass = () => requestAnimationFrame(() => setTimeout(late, 0));
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
    try { await navigator.clipboard.writeText(url); G.toast(G.L("Link copiato", "Link copied")); } catch (err) { G.toast(G.L("Copia il link dalla barra degli indirizzi", "Copy the link from the address bar")); }
  }
  // passaggio verso la notizia successiva: il titolo della scheda diventa il titolo della pagina dopo
  const handoff = (toNext) => {
    const h = $("st-title"), nt = document.querySelector(".next-t");
    if (h) h.style.viewTransitionName = toNext ? "none" : "";
    if (nt) nt.style.viewTransitionName = toNext ? "story-title" : "";
    // l'immagine di questa storia non diventa quella della prossima: sono due notizie diverse
    const im = document.querySelector(".st-media");
    if (im) im.style.viewTransitionName = toNext ? "none" : "";
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
  // il foglio della segnalazione: solo il testo, niente account e niente dati di chi la manda
  function segnala() {
    const L = G.L;
    const f = G.conto.foglio(L("Segnala un errore", "Report a mistake"),
      '<p class="conto-p">' + L("Cosa non torna in questa storia? Un numero, un nome, una data, una frase che le fonti non dicono. Se puoi, scrivi anche dove l'hai letto giusto.",
        "What's wrong in this story? A number, a name, a date, a sentence the sources don't say. If you can, also say where you read it right.") + "</p>" +
      '<form class="conto-form segnala-f" novalidate><label class="conto-campo"><span>' + L("La tua segnalazione", "Your report") + '</span><textarea name="t" rows="5" maxlength="1000" required spellcheck="true"></textarea></label>' +
      '<p class="conto-nota">' + L("Arriva solo a Riccardo, che cura GERICO, e si cancella dopo sei mesi. Non serve l'account e non salviamo chi la manda: non scrivere dati personali.",
        "It reaches only Riccardo, who edits GERICO, and is deleted after six months. You don't need an account and we don't store who sends it: don't write personal data.") + "</p>" +
      '<button type="submit" class="conto-b primario">' + L("Manda la segnalazione", "Send the report") + '</button><p class="conto-err" role="alert"></p></form>');
    const form = f.d.querySelector(".segnala-f"), err = f.d.querySelector(".conto-err");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = form.t.value.trim();
      err.textContent = "";
      if (t.length < 5) { err.textContent = L("Scrivi cosa non torna, almeno qualche parola.", "Say what's wrong, at least a few words."); form.t.focus(); return; }
      const b = form.querySelector("[type=submit]");
      b.disabled = true;
      try {
        await G.conto.api("segnala", { s: id, t, l: G.lang });
        f.d.querySelector(".conto-in").innerHTML = '<p class="conto-ok">' + L("Grazie, la segnalazione è arrivata.", "Thanks, the report has arrived.") + "</p>" +
          '<p class="conto-p">' + L("Riccardo la legge e, se c'è un errore, la storia si corregge.", "Riccardo reads it and, if there is a mistake, the story gets corrected.") + "</p>" +
          '<button type="button" class="conto-b primario" data-chiudi>' + L("Chiudi", "Close") + "</button>";
        f.d.querySelector("[data-chiudi].conto-b").focus({ preventScroll: true });
      } catch (x) {
        if (err.isConnected) err.textContent = x && x.message === "testo" ? L("Scrivi cosa non torna, tra qualche parola e mille caratteri.", "Say what's wrong, between a few words and a thousand characters.") : G.conto.spiega(x);
      } finally { if (b.isConnected) b.disabled = false; }
    });
  }
  P.on(document, "click", (e) => {
    if (e.target.closest("#share")) { share(); return; }
    if (e.target.closest("#segnala")) { segnala(); return; }
    const na = e.target.closest(".next a[data-id]");
    if (na) {
      handoff(true);
      try { sessionStorage.setItem("gerico.vt", JSON.stringify({ id: na.dataset.id, title: na.querySelector(".next-t").textContent, sec: na.dataset.sec })); } catch (err) { /* niente */ }
      return;
    }
    const t = e.target.closest(".disc");
    if (t) { G.toggle(t); return; }
    const b = e.target.closest(".tagbox [data-follow]");
    if (!b) return;
    G.toggleFollow(b.dataset.follow);
  });
  // seguito o lasciato da qui o dal menu: i temi in fondo alla storia si aggiornano
  P.on(document, "gerico:follows", () => {
    document.querySelectorAll(".tagbox [data-follow]").forEach((x) => x.setAttribute("aria-pressed", String(seguito(x.dataset.follow))));
  });
});
