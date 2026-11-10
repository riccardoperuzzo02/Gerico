/* GERICO: prima pagina. Una notizia in evidenza, le altre in elenco, i mercati in un riquadro piccolo. */
G.page("home", async function (P) {
  "use strict";
  const esc = G.esc;
  const $ = (id) => document.getElementById(id);

  G.initPrefs();

  // il paese di chi legge: la sua scheda prende il posto di Italia. «vista»: un paese aperto dall'indirizzo (#francia)
  // senza sceglierlo; la scelta resta quella salvata
  let paese = G.paese(), vista = null;
  { const h0 = G.paeseDaSlug(G.unhash(location.hash)); if (h0 && h0.code !== paese) vista = h0.code; }
  const paeseOra = () => vista || paese;
  const slugOra = () => G.paeseInfo(paeseOra()).slug;
  const datiPaese = {};
  const caricaPaese = async (code) => { if (!(code in datiPaese)) datiPaese[code] = await G.load("paesi/" + code); return datiPaese[code]; };
  const [ed, mk0, qt0, br, au, tit, tsh, ff, ag] = await Promise.all([G.load("edition"), G.load("markets"), G.load("quotes"), G.load("brevi"), G.load("audio"),
    G.load("titoli"), G.load("titoli-storico"), G.load("calendario"), G.load("agenda"), caricaPaese(paeseOra())]);
  // i numeri dei mercati: quelli del job dei prezzi quando sono più freschi di quelli della redazione (G.withQuotes).
  // Cambiano a pagina aperta quando escono prezzi nuovi (G.liveQuotes, più sotto)
  let qt = qt0, mk = G.withQuotes(mk0, qt);
  if (!ed || !Array.isArray(ed.stories)) {
    $("feed").innerHTML = '<div class="empty"><h2>' + G.L("L'edizione non si è caricata.", "The edition did not load.") + "</h2><p>" + G.L("Può essere la connessione. Riprova tra poco.", "It may be the connection. Try again shortly.") + "</p>" +
      '<p><button type="button" class="btn-retry" id="retry">' + G.L("Riprova", "Try again") + "</button></p></div>";
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
    if (edl) edl.textContent = edl.textContent.replace(" · edizione delle ", " · ore ").replace(" · edition of ", " · ");
    // «Oggi» solo sopra l'edizione di oggi; per le altre il giorno (la data e l'ora sono nella riga accanto)
    const age = G.dayAge(lastRun);
    if (age > 0) {
      const name = age === 1 ? G.L("Ieri", "Yesterday") : age < 7 ? G.cap(G.weekday(lastRun)) : G.L("Ultima edizione", "Latest edition");
      $("large-title").textContent = name;
      const tt = document.querySelector(".top-title");
      if (tt) tt.textContent = name;
      // con il giorno della settimana nel titolo, la riga sotto non lo ripete: «6 novembre · ore 13:23»
      if (age > 1 && age < 7 && edl) edl.textContent = edl.textContent.replace(/^\S+\s+/, "");
    }
  }

  // ---------- sezioni (senza numeri) ----------
  // le schede della prima pagina, in quest'ordine dopo Tutte; Economia comprende anche le storie dei mercati
  const TABS = [["economia", ["economia", "mercati"]], ["mondo", ["mondo"]], ["italia", ["italia"]], ["tecnologia", ["tecnologia"]]];
  const TAB_OF = {};
  TABS.forEach(([k, secs]) => secs.forEach((x) => { TAB_OF[x] = k; }));
  // la sezione della redazione va nella sua scheda; Italia va nella scheda del paese se il paese è l'Italia, altrimenti in Mondo
  const tabDi = (sec) => (sec === "italia" ? (paeseOra() === "IT" ? "italia" : "mondo") : TAB_OF[sec]);
  const inTab = (sec) => tabDi(sec) === state.section;
  // una storia è del paese se il paese è il suo (country: il primo dei suoi luoghi, scritto dall'export) o se il nome
  // del paese è tra i suoi temi; per l'Italia vale anche la sezione Italia
  const nomiDi = (code) => { const p = G.paeseInfo(code); return [p.it, p.en].map((x) => x.toLowerCase()); };
  const delPaese = (s, code) => !!s && (s.country === code || (code === "IT" && s.section === "italia") ||
    (s.tags || []).some((t) => nomiDi(code).includes(String(t).toLowerCase())));
  const inPaese = () => state.section === slugOra();
  // le notizie nazionali di un paese estero (scope "paese", scritte per la sua scheda) si vedono solo da chi ha scelto
  // quel paese: per gli altri non stanno né in Tutte né in Mondo né nei temi
  const perMe = (s) => s.scope !== "paese" || s.country === paeseOra();
  const mie = () => stories.filter(perMe);
  // Mondo, per chi ha scelto un altro paese: anche l'Italia, ma non le storie del suo paese (stanno nella sua scheda)
  const inMondo = (s) => tabDi(s.section) === "mondo" && s.scope !== "paese" && !(paeseOra() !== "IT" && delPaese(s, paeseOra()));
  // le brevi delle testate del paese (scripts/paesi.py), nella forma delle brevi della redazione, con il titolo tradotto
  const breviPaese = () => {
    const d = datiPaese[paeseOra()];
    return (d && Array.isArray(d.items) ? d.items : []).filter((b) => b && b.title && G.safeUrl(b.url))
      .map((b) => ({ title: (G.en ? b.en : b.it) || b.title, url: b.url, source: b.source, at: b.at, ext: true }));
  };
  // i temi caldi: tre vicende che durano (una guerra, un'elezione), scelte dalla redazione; restano finché hanno
  // storie live. Una storia è del tema se lo ha in themes; le storie vecchie, le brevi e i temi ricavati dai tag,
  // per parole chiave (anche radici: «ucrain» trova Ucraina e ucraini)
  const themes = (Array.isArray(ed.themes) ? ed.themes : []).filter((t) => t && t.id && t.label).slice(0, 3);
  const themeOf = (k) => (/^t-/.test(k || "") ? themes.find((t) => "t-" + t.id === k) : null);
  const kwIn = (txt, t) => { const x = String(txt || "").toLowerCase(); return (t.keywords && t.keywords.length ? t.keywords : [t.label]).some((k) => k && x.includes(String(k).toLowerCase())); };
  const inTheme = (s, t) => (Array.isArray(s.themes) && !t.auto ? s.themes.includes(t.id) : kwIn([s.title, s.summary].concat(s.tags || []).join(" "), t));
  // «Seguiti» c'è sempre: senza temi seguiti spiega come si segue e ne propone qualcuno
  const sectionFromHash = () => {
    const h = G.unhash(location.hash);
    if (h === "seguiti") return h;
    // il nome di un paese: la scheda di quel paese (se non è quello scelto, solo per questa visita)
    const ph = G.paeseDaSlug(h);
    if (ph) { vista = ph.code === paese ? null : ph.code; return ph.slug; }
    return themeOf(h) ? h : TAB_OF[h] || "tutte";
  };
  // un tema seguito è un tag delle storie oppure un tema caldo: questo, per le sue parole chiave, vale anche per le brevi
  // e per le storie dei giorni scorsi
  const hotOf = (f) => themes.find((t) => String(t.label).toLowerCase() === String(f).toLowerCase());
  const follows = (s) => state.follows.some((f) => (s.tags || []).includes(f) || (!!hotOf(f) && inTheme(s, hotOf(f))));
  // le storie dei temi seguiti, le più nuove prima (l'ora con il fuso: si confrontano gli istanti, non i testi)
  const when = (s) => Date.parse(s.updated || s.firstSeen || "") || 0;
  const followed = () => mie().filter(follows).sort((a, b) => when(b) - when(a));
  // una breve è di un tema seguito se lo nomina nel titolo (parola intera, maiuscole o no)
  const RX = new Map();
  const wordRx = (t) => { if (!RX.has(t)) RX.set(t, new RegExp("(^|[^\\p{L}\\p{N}])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^\\p{L}\\p{N}])", "iu")); return RX.get(t); };
  const followsBreve = (b) => state.follows.some((f) => (hotOf(f) ? kwIn(b.title, hotOf(f)) : wordRx(f).test(String(b.title || ""))));
  // l'ultima visita ai Seguiti: «Nuovo» sulle storie cambiate dopo. Vale per tutta la visita di adesso
  const seenPrev = G.ls.get("gerico.seguitiVisto", null);
  let seenMarked = false;
  const isNew = (s) => !!seenPrev && when(s) > (Date.parse(seenPrev) || Infinity);
  const visible = () => {
    const th = themeOf(state.section);
    if (th) return mie().filter((s) => inTheme(s, th));
    if (state.section === "tutte") return mie();
    if (state.section === "seguiti") return followed();
    if (inPaese()) return stories.filter((s) => delPaese(s, paeseOra()));
    if (state.section === "mondo") return mie().filter(inMondo);
    return mie().filter((s) => inTab(s.section));
  };
  // le brevi non hanno temi: in un tema caldo quelle con le sue parole nel titolo, nei Seguiti quelle che nominano un tema seguito
  const visibleBrevi = () => {
    const th = themeOf(state.section);
    if (th) return brevi.filter((b) => kwIn(b.title, th)).slice(0, 15);
    if (inPaese()) {
      // le brevi della redazione (per l'Italia) e quelle delle testate del paese, senza doppioni, le più nuove prima
      const visti = new Set(), tutte = (paeseOra() === "IT" ? brevi.filter((b) => b.section === "italia") : []).concat(breviPaese());
      return tutte.filter((b) => { const k = String(b.url).split("#")[0]; if (visti.has(k)) return false; visti.add(k); return true; })
        .sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0)).slice(0, 15);
    }
    return (state.section === "seguiti" ? brevi.filter(followsBreve) : brevi.filter((b) => state.section === "tutte" || inTab(b.section))).slice(0, 15);
  };
  const visiblePast = () => {
    const th = themeOf(state.section);
    if (th) return archive.filter((s) => perMe(s) && inTheme(s, th)).slice(0, 8);
    if (inPaese()) return archive.filter((s) => delPaese(s, paeseOra())).slice(0, 8);
    if (state.section === "mondo") return archive.filter(inMondo).slice(0, 8);
    return archive.filter((s) => perMe(s) && (state.section === "tutte" || (state.section === "seguiti" ? follows(s) : inTab(s.section)))).slice(0, 8);
  };
  function buildNav() {
    const items = [["tutte", G.L("Tutte", "All")], ["seguiti", G.L("Seguiti", "Following")]];
    // dopo Tutte i temi caldi (con un pallino), poi le sezioni
    themes.forEach((t) => { if (mie().some((s) => inTheme(s, t))) items.push(["t-" + t.id, G.tn(t.label), true]); });
    const has = (k) => mie().some((s) => tabDi(s.section) === k) || brevi.some((b) => tabDi(b.section) === k);
    // la scheda del paese c'è sempre, al posto di Italia, con il nome del paese
    TABS.forEach(([k]) => { if (k === "italia") items.push([slugOra(), G.paeseNome(paeseOra())]); else if (has(k)) items.push([k, G.SECTIONS[k]]); });
    $("sections").innerHTML = items.map(([k, label, hot]) => '<a href="' + (k === "tutte" ? "#" : "#" + k) + '" data-sec="' + k + '"' + (hot ? ' class="hot"' : "") + ">" +
      (hot ? '<span class="hot-dot" aria-hidden="true"></span>' : "") + esc(label) + (hot ? '<span class="sr-only">' + G.L(", tema caldo", ", hot topic") + "</span>" : "") + "</a>").join("");
  }
  // quiet: indicatore e binario li sta già muovendo lo swipe (G.segFollow)
  function markNav(k, quiet) {
    const on = k || state.section, box = $("sections");
    box.querySelectorAll("a").forEach((a) => { if (a.dataset.sec === on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (!quiet && G.seg) G.seg(box);
  }

  // ---------- notizie: occhiello sopra il titolo, come nei siti all-news ----------
  // sezione in maiuscolo e ora dell'ultimo aggiornamento; «Aggiornata» in rosso quando la storia è cambiata oggi
  const ago = (iso) => (G.isToday(iso) ? G.hm(iso) : G.dayAge(iso) === 1 ? G.L("ieri", "yesterday") : G.day(iso));
  function kicker(s, showSection) {
    const parts = [];
    if (state.section === "seguiti" && isNew(s)) parts.push('<span class="k-new">' + G.L("Nuovo", "New") + "</span>");
    if (showSection) parts.push('<span class="k-sec">' + esc(G.secLabel(s.section)) + "</span>");
    const upd = G.updatedLabel(s, firstRun);
    if (upd) parts.push('<span class="k-live">' + esc(upd) + "</span>");
    else if (s.updated) parts.push('<span class="k-time">' + esc(ago(s.updated)) + "</span>");
    // quante fonti ha letto GERICO per scrivere l'articolo
    const n = G.srcCount(s.sources);
    if (n) parts.push('<span class="k-src">' + esc(n) + "</span>");
    // nel sito in inglese, una storia non ancora tradotta lo dice
    if (G.en && s.untranslated) parts.push('<span class="k-src">in Italian</span>');
    return parts.length ? '<p class="kick">' + parts.join("") + "</p>" : "";
  }
  const link = (s) => '<a href="' + G.storyUrl(s) + '" data-id="' + esc(s.id) + '" data-sec="' + esc(G.secLabel(s.section)) + '">' + esc(G.headline(s)) + "</a>";
  // al primo caricamento le notizie entrano una dopo l'altra (le prime 8); cambiando sezione solo una dissolvenza
  // arrivando da un'altra pagina del sito c'è già la transizione: niente entrata a cascata
  let first = !G.soft;
  // come nelle prime pagine dei quotidiani: l'immagine (la mappa del luogo), l'occhiello, il titolo, la firma
  function leadHTML(s, showSection) {
    const img = G.storyImg(s, { eager: true });
    return '<article class="lead' + (img ? " has-img" : "") + (first ? " reveal" : "") + '" style="--i:0">' + img + kicker(s, showSection) + "<h2>" + link(s) + "</h2>" +
      '<p class="sum">' + esc(G.firstSentences(s.summary, 220)) + "</p>" + G.cardBy(s) + "</article>";
  }
  function itemHTML(s, showSection, i) {
    const img = G.storyImg(s);
    return '<li class="item' + (img ? " has-img" : "") + (first && i < 8 ? " reveal" : "") + '" style="--i:' + Math.min(i, 8) + '">' + img + kicker(s, showSection) + "<h2>" + link(s) + "</h2></li>";
  }
  // brevi: l'ora a sinistra e la notizia in una riga, con il link all'articolo, da una sola testata
  function breviHTML(items, showSection) {
    if (!items.length) return "";
    // nella scheda di un paese estero: le brevi vengono dalle sue testate, con il titolo tradotto
    const estero = inPaese() && paeseOra() !== "IT";
    const sub = estero ? G.L("Dalle testate del paese, con il titolo tradotto; non ancora verificate da GERICO: il link porta all'articolo originale.",
      "From the country's outlets, with the headline translated; not yet checked by GERICO: the link goes to the original article.")
      : G.L("Da una sola fonte e non ancora verificate da GERICO: il link porta all'articolo.", "From a single source and not yet checked by GERICO: the link goes to the article.");
    return '<section class="blk" aria-labelledby="brevi-h"><h2 class="blk-h" id="brevi-h">' + G.L("In breve", "In brief") + "</h2>" +
      '<p class="blk-sub">' + esc(sub) + '</p><ul class="brevi">' +
      items.map((b) => {
        const meta = [showSection ? G.secLabel(b.section) : "", b.source].filter(Boolean).map(esc).join(" · ");
        return '<li><span class="b-time' + (G.isToday(b.at) ? "" : " old") + '">' + esc(b.at ? ago(b.at) : "") + '</span><div class="b-body">' +
          '<a href="' + esc(G.safeUrl(b.url)) + '" target="_blank" rel="noopener">' + esc(b.title) + '<span class="sr-only"> ' + G.L("(si apre il sito della testata)", "(opens the outlet's site)") + "</span></a>" +
          (meta ? '<p class="b-m">' + meta + "</p>" : "") + "</div></li>";
      }).join("") + "</ul></section>";
  }
  // storie dei giorni scorsi: archiviate, ancora leggibili
  function pastHTML(items, showSection) {
    if (!items.length) return "";
    return '<section class="blk" aria-labelledby="past-h"><h2 class="blk-h" id="past-h">' + G.L("Nei giorni scorsi", "In recent days") + '</h2><ul class="brevi past">' +
      items.map((s) => {
        const meta = [showSection ? G.secLabel(s.section) : "", s.updated ? G.cap(G.weekday(s.updated)) + " " + G.day(s.updated) : ""].filter(Boolean).map(esc).join(" · ");
        return '<li><a href="' + G.storyUrl(s) + '">' + esc(G.headline(s)) + "</a>" + (meta ? '<p class="b-m">' + meta + "</p>" : "") + "</li>";
      }).join("") + "</ul></section>";
  }
  // titoli da seguire: un segnale sui prezzi e una notizia; in Tutte, Economia e Mercati
  function titoliHTML() {
    if (!G.titoliFresh(tit) || !["tutte", "economia", "mercati"].includes(state.section)) return "";
    return '<section class="blk tit" aria-labelledby="tit-h"><h2 class="blk-h" id="tit-h">' + G.L("Titoli da seguire", "Stocks to watch") + "</h2>" +
      '<p class="blk-sub">' + G.L("Un segnale sui prezzi e una notizia che possono muoverli nei prossimi giorni.", "A price signal and a news item that could move them in the coming days.") + "</p>" + G.titoliHTML(tit, tsh) + "</section>";
  }
  // versione dell'elenco e sezioni accanto preparate per lo swipe (vedi prepareSoon)
  // alive: la prima pagina è ancora quella sullo schermo (i momenti liberi del browser non si spengono con la pagina)
  let feedVer = 0, prepTimer = 0, alive = true;
  const prepared = {};
  // il dito è sullo schermo: le sezioni accanto non si preparano in quel momento (prepareSoon). Dichiarato qui, prima
  // del primo disegno dell'elenco, che fa partire il timer che lo legge
  let touching = false;
  P.on(document, "touchstart", () => { touching = true; }, { passive: true, capture: true });
  P.on(document, "touchend", () => { touching = false; }, { passive: true, capture: true });
  P.on(document, "touchcancel", () => { touching = false; }, { passive: true, capture: true });
  // sul computer le brevi stanno nella colonna di destra, sotto i mercati: accanto alle notizie, non dopo
  const wideQ = window.matchMedia ? matchMedia("(min-width: 1000px)") : null;
  const brInSide = () => !!(wideQ && wideQ.matches);
  function renderSideBrevi() {
    const box = $("side-brevi");
    if (!box) return;
    const html = brInSide() ? breviHTML(visibleBrevi(), state.section === "tutte" || state.section === "seguiti" || !!themeOf(state.section)) : "";
    // cambiando sezione sul computer: la lista vecchia sfuma sopra la nuova e il riquadro va alla sua altezza nuova
    const old = box.dataset.shown && box.firstElementChild && box.offsetHeight && !G.reduced() && box.animate ? box.firstElementChild : null;
    const h0 = old ? box.offsetHeight : 0;
    if (old && html === box.dataset.html) return;
    box.innerHTML = html;
    box.dataset.html = html;
    box.dataset.shown = "1";
    $("side").classList.toggle("with-brevi", !!html);
    sideOpen = false;
    fitSide();
    if (!old) return;
    const h1 = box.offsetHeight, ghost = old.cloneNode(true);
    ghost.removeAttribute("aria-labelledby");
    G.inertCopy(ghost);
    ghost.setAttribute("aria-hidden", "true");
    ghost.classList.add("side-ghost");
    box.appendChild(ghost);
    const o = { duration: Math.min(700, 320 + Math.abs(h1 - h0) * 0.25), easing: "cubic-bezier(0.45, 0, 0.2, 1)" };
    box.style.overflow = "hidden";
    const a = box.animate([{ height: h0 + "px" }, { height: h1 + "px" }], o);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" });
    if (box.firstElementChild && box.firstElementChild !== ghost) {
      box.firstElementChild.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: 120, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "backwards" });
    }
    const done = () => { ghost.remove(); box.style.overflow = ""; };
    a.finished.then(done, done);
  }
  // sul computer la colonna di destra finisce dove finisce la sinistra (di solito «Nei giorni scorsi»): le brevi che
  // non ci stanno aspettano sotto «Mostra altre N», e si aprono con un'animazione. Almeno 3 brevi si vedono sempre.
  let sideOpen = false;
  function fitSide() {
    const box = $("side-brevi"), list = box && box.querySelector(".brevi");
    if (!list) return;
    const old = box.querySelector(".more-brevi");
    if (old) old.remove();
    const items = Array.from(list.children), sec = box.querySelector(".blk");
    items.forEach((li) => { li.hidden = false; });
    sec.classList.remove("fitted");
    sec.style.minHeight = "";
    if (sideOpen || !brInSide()) return;
    const blocks = Array.from($("feed").children).filter((el) => !el.classList.contains("end") && !el.classList.contains("sr-only") && el.offsetHeight);
    const last = blocks[blocks.length - 1];
    if (!last) return;
    const end = last.getBoundingClientRect().bottom;
    const pad = sec.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom;
    // lo spazio per il pulsante: circa una riga e mezza
    const btn = 52;
    if (sec.getBoundingClientRect().bottom <= end + 1) return;
    let keep = items.length;
    while (keep > 3 && items[keep - 1].getBoundingClientRect().bottom + pad + btn > end) keep -= 1;
    if (keep >= items.length) return;
    items.slice(keep).forEach((li) => { li.hidden = true; });
    // il riquadro finisce esattamente dove finisce la colonna di sinistra; il pulsante sta in fondo
    sec.classList.add("fitted");
    sec.style.minHeight = Math.max(0, end - sec.getBoundingClientRect().top) + "px";
    const n = items.length - keep;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "more-brevi";
    b.setAttribute("aria-expanded", "false");
    b.textContent = G.L(n === 1 ? "Mostra un'altra breve" : "Mostra altre " + n + " brevi", n === 1 ? "Show one more" : "Show " + n + " more");
    list.after(b);
    b.addEventListener("click", () => {
      const h0 = sec.offsetHeight;
      sideOpen = true;
      sec.classList.remove("fitted");
      sec.style.minHeight = "";
      const shown = items.slice(keep);
      shown.forEach((li) => { li.hidden = false; });
      b.remove();
      if (G.reduced() || !sec.animate) return;
      const h1 = sec.offsetHeight;
      sec.style.overflow = "hidden";
      const a = sec.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: Math.min(900, 300 + (h1 - h0) * 0.4), easing: "cubic-bezier(0.45, 0, 0.2, 1)" });
      shown.forEach((li, k) => li.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: 80 + Math.min(k, 8) * 40, easing: "ease-out", fill: "backwards" }));
      const done = () => { sec.style.overflow = ""; };
      a.finished.then(done, done);
    });
  }
  function renderFeed(viaTransition) {
    const feed = $("feed");
    feed.classList.remove("swap");
    if (!first && !viaTransition) { void feed.offsetWidth; feed.classList.add("swap"); }
    feed.innerHTML = feedMarkup();
    G.showImgs(feed);
    first = false;
    if (state.section === "seguiti" && !seenMarked) { seenMarked = true; G.ls.set("gerico.seguitiVisto", new Date().toISOString()); }
    feedVer += 1;
    renderSideBrevi();
    prepareSoon();
  }
  // il contenuto di un'altra sezione, uguale a quello che disegnerebbe renderFeed: la pagina accanto durante lo swipe
  function feedMarkupFor(sec) {
    const was = state.section, f = first;
    state.section = sec; first = false;
    try { return feedMarkup(); } finally { state.section = was; first = f; }
  }
  // da seguire: i temi caldi, poi i temi più frequenti nelle storie di questi giorni (quelle di oggi contano doppio)
  const isFollowed = (t) => state.follows.some((f) => f.toLowerCase() === String(t).toLowerCase());
  function suggestions() {
    const hot = themes.filter((t) => !isFollowed(t.label)).map((t) => [t.label, true]);
    const n = {};
    mie().concat(archive.filter(perMe)).forEach((s) => (s.tags || []).forEach((t) => { if (typeof t === "string" && t) n[t] = (n[t] || 0) + (live.has(s.id) ? 2 : 1); }));
    const tags = Object.keys(n).filter((t) => !isFollowed(t) && !hotOf(t)).sort((a, b) => n[b] - n[a] || a.localeCompare(b)).slice(0, 8);
    return hot.concat(tags.map((t) => [t, false]));
  }
  const tagBtn = (t, on, hot) => '<button type="button" class="tag" data-follow="' + esc(t) + '" aria-pressed="' + on + '">' +
    (hot ? '<span class="hot-dot" aria-hidden="true"></span>' : "") + esc(G.tn(t)) + (hot ? '<span class="sr-only">' + G.L(", tema caldo", ", hot topic") + "</span>" : "") + "</button>";
  const FEW = 12;
  let folAll = false;
  const moreTags = () => '<div class="tags">' + suggestions().map(([t, hot]) => tagBtn(t, false, hot)).join("") + "</div>";
  // in cima: i temi che segui (un tocco smette); senza temi, come si segue e i temi da seguire
  function followHead() {
    const mine = state.follows, cut = folAll || mine.length <= FEW + 1 ? mine : mine.slice(0, FEW);
    let h = '<section class="blk fol" id="fol-top" aria-labelledby="fol-h"><h2 class="blk-h" id="fol-h">' + (mine.length ? G.L("I temi che segui", "Topics you follow") : G.L("Segui i temi che ti interessano", "Follow the topics you care about")) + "</h2>";
    if (!mine.length) {
      h += '<p class="blk-sub">' + G.L("Qui trovi le notizie dei temi che segui, le più nuove prima. Tocca un tema qui sotto, oppure seguilo in fondo a ogni storia.",
        "Here you find the news on the topics you follow, newest first. Tap a topic below, or follow it at the bottom of any story.") + "</p>";
      if (suggestions().length) h += '<p class="fol-l">' + G.L("Da seguire", "Suggested") + "</p>" + moreTags();
    } else {
      h += '<div class="tags">' + cut.map((t) => tagBtn(t, true)).join("") +
        (cut.length < mine.length ? '<button type="button" class="tag fol-all" data-fol-all>' + G.L("Tutti i " + mine.length + " temi", "All " + mine.length + " topics") + "</button>" : "") +
        '</div><p class="fol-note">' + G.L("Tocca un tema per smettere di seguirlo.", "Tap a topic to stop following it.") + "</p>";
    }
    return h + "</section>";
  }
  // in fondo, quando segui già qualcosa: gli altri temi da seguire (le notizie restano in alto)
  const followMore = () => (state.follows.length && suggestions().length ? '<section class="blk fol" id="fol-more" aria-labelledby="fol-m"><h2 class="blk-h" id="fol-m">' +
    G.L("Altri temi da seguire", "More topics to follow") + "</h2>" + moreTags() + "</section>" : "");
  // il giorno delle notizie più recenti tra queste ore: «di ieri», «di sabato 7 novembre»
  function lastDay(isos) {
    const t = isos.map((x) => Date.parse(x || "")).filter((x) => x > 0);
    if (!t.length) return "";
    const iso = new Date(Math.max.apply(null, t)).toISOString(), age = G.dayAge(iso);
    return age === 1 ? G.L("di ieri", "from yesterday") : G.L("di ", "from ") + G.weekDay(iso);
  }
  function feedMarkup() {
    const list = visible(), bl = visibleBrevi(), past = visiblePast();
    if (state.section === "seguiti") {
      const end = '<p class="end"><strong>' + G.L("Fine della sezione.", "End of the section.") + "</strong> " + G.L("Prossimo aggiornamento delle notizie ", "Next news update ") + esc(G.nextUpdate(true)) + ".</p>";
      if (!state.follows.length) return followHead();
      const top = list.length ? leadHTML(list[0], true) + (list.length > 1 ? '<ol class="list">' + list.slice(1).map((s, i) => itemHTML(s, true, i + 1)).join("") + "</ol>" : "")
        : '<p class="none">' + G.L("Oggi nessuna storia sui temi che segui.", "No stories today on the topics you follow.") + "</p>";
      return followHead() + top + (brInSide() ? "" : breviHTML(bl, true)) + pastHTML(past, true) + followMore() + end;
    }
    const estero = inPaese() && paeseOra() !== "IT";
    if (!list.length && !bl.length && estero) {
      const d = datiPaese[paeseOra()];
      return '<div class="empty"><h2>' + esc(G.L("Oggi nessuna notizia ", "No news ") + G.paeseDa(paeseOra()) + G.L(".", " today.")) + "</h2><p>" +
        (d && d.silent ? G.L("Le testate di questo paese non pubblicano niente da due giorni.", "This country's outlets have published nothing for two days.")
          : d ? G.L("Le sue testate non hanno ancora pubblicato niente oggi.", "Its outlets have published nothing yet today.")
            : G.L("Le notizie di questo paese non si sono caricate. Riprova tra poco.", "This country's news did not load. Try again shortly.")) +
        ' <a href="#">' + G.L("Torna a tutte le notizie", "Back to all the news") + "</a>.</p></div>" + pastHTML(past, true);
    }
    if (!list.length && !bl.length) {
      // niente di oggi né brevi: se ci sono storie dei giorni scorsi, si dice di quando sono le ultime
      const lp = lastDay(past.map((x) => x.updated));
      return '<div class="empty"><h2>' + (lp ? G.L("Oggi nessuna notizia in questa sezione.", "No news in this section today.") : G.L("Nessuna storia in questa sezione.", "No stories in this section.")) + "</h2><p>" +
        (lp ? G.L("Le ultime sono ", "The latest are ") + lp + G.L(": qui sotto, nei giorni scorsi. Oppure ", ": below, in recent days. Or ") : "") + '<a href="#">' + (lp ? G.L("torna a tutte le notizie", "go back to all the news") : G.L("Torna a tutte le notizie", "Back to all the news")) + "</a>.</p></div>" + pastHTML(past, true);
    }
    const all = state.section === "tutte" || state.section === "seguiti" || !!themeOf(state.section);
    // l'edizione ha una fine: si sa quando arrivano le prossime notizie
    const end = '<p class="end"><strong>' + (state.section === "tutte" ? G.L("Fine dell'edizione.", "End of the edition.") : G.L("Fine della sezione.", "End of the section.")) + "</strong> " + G.L("Prossimo aggiornamento delle notizie ", "Next news update ") + esc(G.nextUpdate(true)) + ".</p>";
    const top = list.length
      ? leadHTML(list[0], all) + (list.length > 1 ? '<ol class="list">' + list.slice(1).map((s, i) => itemHTML(s, all, i + 1)).join("") + "</ol>" : "")
      // brevi di oggi, o solo di ieri e di prima: la riga lo dice com'è, con il giorno delle ultime
      : estero ? '<p class="none">' + esc(G.cap(G.paeseDa(paeseOra())) + G.L(", oggi, le brevi delle sue testate. ", ", today: briefs from its outlets. ") + (G.paeseInfo(paeseOra()).level === 1
        ? G.L("Gli articoli di GERICO sul paese compaiono qui quando escono.", "GERICO's articles on the country appear here when they come out.")
        : G.L("GERICO scrive un articolo quando nel paese succede un fatto di rilievo.", "GERICO writes an article when something major happens in the country."))) + "</p>"
      : '<p class="none">' + (bl.some((b) => b && G.isToday(b.at)) ? G.L("Oggi in questa sezione ci sono solo brevi.", "Today this section has only news in brief.")
        : G.L("Oggi in questa sezione non ci sono ancora notizie. Le ultime brevi, qui sotto, sono ", "No news in this section yet today. The latest news in brief, below, are ") + (lastDay(bl.map((b) => b.at)) || G.L("dei giorni scorsi", "from recent days")) + ".") + "</p>";
    return top + (brInSide() ? "" : breviHTML(bl, all)) + titoliHTML() + pastHTML(past, all) + end;
  }

  // ---------- ultim'ora: le notizie delle ultime ore scorrono in una fascia, come nei canali all-news ----------
  // brevi con l'ora e storie nuove o aggiornate delle ultime 18 ore; se sono poche, le più recenti comunque: la fascia c'è sempre
  function renderUltim() {
    const items = [];
    const ok = (iso) => !!iso && G.hoursAgo(iso) >= 0;
    brevi.forEach((b) => { if (ok(b.at)) items.push({ at: b.at, title: b.title, url: G.safeUrl(b.url), ext: true }); });
    mie().forEach((s) => {
      const at = G.realChange(s) ? s.updated : s.firstSeen;
      if (ok(at)) items.push({ at, title: G.headline(s), url: G.storyUrl(s) });
    });
    items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const recent = items.filter((it) => G.hoursAgo(it.at) < 18);
    const list = (recent.length >= 4 ? recent : items).slice(0, 12);
    // la fascia è nella pagina da subito, per non spingere giù le notizie quando arriva: senza notizie si toglie
    if (!list.length) { $("ultim").hidden = true; return; }
    const when = (iso) => { const a = G.dayAge(iso); return (a === 0 ? "" : a === 1 ? G.L("ieri ", "yesterday ") : G.day(iso) + " ") + G.hm(iso); };
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
    // con la tastiera: il titolo che prende il fuoco si porta in vista, a fascia ferma (CSS .ultim.kbd); uscendo riparte
    P.on(t, "focusin", (e) => {
      const a = e.target.closest && e.target.closest("a");
      if (!a || !a.matches(":focus-visible")) return;
      $("ultim").classList.add("kbd");
      a.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
    });
    P.on(t, "focusout", (e) => {
      if (t.contains(e.relatedTarget)) return;
      $("ultim").classList.remove("kbd");
      t.parentElement.scrollLeft = 0;
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
    // la durata sta già a destra (il tempo che manca): qui solo cosa c'è dentro e di quando è
    $("ls-s").textContent = G.L("Notizie e mercati, con l'aggiornamento delle ", "News and markets in Italian, from the update at ") + G.hm(when);
    box.classList.remove("wait");
    btn.disabled = false;
    btn.addEventListener("click", () => pl.toggle());
    const paint = () => {
      const on = pl.playing(), d = pl.dur(), p = pl.pos();
      box.classList.toggle("playing", on);
      btn.setAttribute("aria-label", on ? G.L("Metti in pausa il riepilogo", "Pause the briefing") : p > 0 ? G.L("Riprendi il riepilogo", "Resume the briefing") : G.L("Ascolta il riepilogo", "Listen to the briefing"));
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
      pick().forEach(({ it, key }) => cells.push({ name: G.shortName(it.name), value: G.cleanValue(it.value), mv: G.move(it).replace(/ (pb|bp)$/, ""), tone: G.tone(it, key) }));
      when = mk.asOf ? G.when(mk.asOf) : "";
    }
    if (!cells.length) { $("ticker").hidden = true; return; }
    $("tk-w").textContent = when ? " · " + when : "";
    $("tk-row").innerHTML = cells.slice(0, 6).map((c) => '<span class="tk"><span class="tk-n">' + esc(G.tn(c.name)) + '</span><span class="tk-v">' + esc(c.value) +
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
    if (!n) { el.innerHTML = '<span class="tk-ev-l">' + G.L("Calendario", "Calendar") + "</span> " + G.L("nessun dato ad alto impatto in arrivo questa settimana", "no high-impact release due this week"); return; }
    let when = n.time;
    if (n.date !== day) when = G.weekday(n.date + "T12:00:00Z") + " " + n.time;
    else {
      const [hh, mm] = n.time.split(":").map(Number), mins = hh * 60 + mm - G.romeNow().min;
      if (mins < 60) when = n.time + " (" + (mins <= 0 ? G.L("adesso", "now") : G.L("tra ", "in ") + mins + " min") + ")";
    }
    el.innerHTML = '<span class="tk-ev-l">' + G.L("Alto impatto", "High impact") + "</span> <b>" + esc(when + " " + n.cur) + "</b> " + esc(n.ev);
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
  // live: prezzi nuovi a pagina aperta, il riquadro cambia senza ricomparire
  function renderSide(live) {
    const rows = pick();
    if (!rows.length) { $("side").innerHTML = '<div id="side-brevi"></div>'; renderSideBrevi(); return; }
    const tr = rows.map(({ it, key }) => {
      const mv = typeof it.bp === "number" ? G.bpsLong(it.bp) : G.move(it);
      return '<tr><th scope="row">' + esc(G.tn(G.shortName(it.name))) + "</th><td>" + esc(G.cleanValue(it.value)) +
        '</td><td class="mv ' + G.tone(it, key) + '">' + esc(mv) + "</td></tr>";
    }).join("");
    $("side").innerHTML = '<section class="mk-box' + (live ? "" : " reveal") + '" style="--i:3" aria-labelledby="mk-h"><h2 id="mk-h">' + G.L("Mercati", "Markets") + "</h2>" +
      '<p class="when">' + esc(G.mkWhen(mk)) + "</p>" +
      '<table><tbody>' + tr + "</tbody></table>" + gapNote() + '<a class="more" href="terminal.html">' + G.L("Tutti i mercati e l'agenda", "All markets and the calendar") + "</a></section>" +
      '<div id="side-brevi"></div>';
    renderSideBrevi();
  }
  // una classe intera senza dati si dice, invece di lasciare il riquadro più corto senza spiegazione
  function gapNote() {
    const want = G.en ? { obbligazioni: "government bonds", valute: "currencies", materie: "commodities" } : { obbligazioni: "i titoli di Stato", valute: "le valute", materie: "le materie prime" };
    const miss = Object.keys(want).filter((k) => { const c = (mk.classes || []).find((x) => x.key === k); return !c || !(c.items || []).length; }).map((k) => want[k]);
    if (!miss.length) return "";
    return '<p class="mk-gap">' + G.L("In questo aggiornamento mancano ", "Missing from this update: ") + esc(miss.length > 1 ? miss.slice(0, -1).join(", ") + G.L(" e ", " and ") + miss[miss.length - 1] : miss[0]) + ".</p>";
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
  // ---------- il paese, nella barra in alto: bandiera e nome; si cambia dal foglio, la prima pagina si rifà subito ----------
  const pBtn = $("paese-btn");
  const disegnaPaese = () => {
    if (!pBtn) return;
    pBtn.innerHTML = G.flag(paese) + '<span class="pb-n">' + esc(G.paeseNome(paese)) + '</span><svg class="pb-v" aria-hidden="true" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    pBtn.setAttribute("aria-label", G.L("Il tuo paese: ", "Your country: ") + G.paeseNome(paese) + G.L(". Cambialo", ". Change it"));
    pBtn.hidden = false;
  };
  disegnaPaese();
  if (pBtn) P.on(pBtn, "click", () => G.apriPaesi());
  P.on(document, "gerico:paese", async (e) => {
    const eraQui = inPaese(), eraMondo = state.section === "mondo";
    paese = e.detail.code;
    vista = null;
    disegnaPaese();
    await caricaPaese(paese);
    buildNav();
    if (eraQui) {
      state.section = slugOra();
      try { history.replaceState(history.state, "", location.pathname + location.search + "#" + slugOra()); } catch (err) { /* niente */ }
    }
    markNav();
    // la sezione che si vede cambia subito, con la dissolvenza delle sezioni; le altre si preparano per lo swipe
    if (eraQui || eraMondo) renderFeed();
    else { feedVer += 1; prepareSoon(); }
    announce(state.section);
    G.toast(G.L("Il tuo paese: ", "Your country: ") + G.paeseNome(paese));
  });
  // seguire e smettere di seguire un tema, dai Seguiti, dal menu o da una storia: i Seguiti si rifanno subito,
  // senza dissolvenza, e il fuoco resta sul tema toccato
  let refocus = null;
  P.on($("feed"), "click", (e) => {
    if (e.target.closest("[data-fol-all]")) { folAll = true; renderFeed(true); const b = $("feed").querySelector("#fol-top .tag:nth-child(" + (FEW + 1) + ")"); if (b) b.focus({ preventScroll: true }); return; }
    const b = e.target.closest("[data-follow]");
    if (!b) return;
    const box = b.closest(".fol");
    refocus = box ? { blk: box.id, i: Array.from(box.querySelectorAll("[data-follow]")).indexOf(b) } : null;
    G.toggleFollow(b.dataset.follow);
  });
  P.on(document, "gerico:follows", () => {
    state.follows = G.follows();
    if (state.section !== "seguiti") { feedVer += 1; prepareSoon(); refocus = null; return; }
    // la pagina non salta: il riquadro toccato resta dov'era sullo schermo (le storie del tema nuovo entrano sopra)
    const r = refocus, el0 = r && $(r.blk), a0 = el0 ? el0.getBoundingClientRect().top : null, y0 = scrollY;
    refocus = null;
    renderFeed(true);
    const el1 = r && $(r.blk);
    scrollKeep(el1 && a0 !== null ? y0 + el1.getBoundingClientRect().top - a0 : y0);
    // il fuoco resta nello stesso riquadro, sul tema al posto di quello toccato (o sul primo dei temi seguiti)
    if (!r) return;
    const tags = el1 ? el1.querySelectorAll("[data-follow]") : [];
    const next = tags.length ? tags[Math.min(r.i, tags.length - 1)] : $("feed").querySelector("#fol-top [data-follow], #fol-top .blk-h");
    if (next) { if (!next.matches("button")) next.setAttribute("tabindex", "-1"); next.focus({ preventScroll: true }); }
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
  const fromHistory = async (e) => {
    // indietro verso un'altra pagina: ci pensa il passaggio di pagina, questa non deve muoversi
    if (location.pathname + location.search !== here) return;
    const k = sectionFromHash();
    // l'indirizzo chiede un altro paese: prima le sue notizie, poi la barra delle sezioni con il suo nome. Il browser
    // manda due avvisi (popstate e hashchange): tutti e due aspettano i dati, il primo che arriva cambia la sezione
    if (!(paeseOra() in datiPaese)) await caricaPaese(paeseOra());
    if (!$("sections").querySelector('[data-sec="' + slugOra() + '"]')) {
      buildNav();
      markNav(state.section, true);
      feedVer += 1;
    }
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
    if (st) st.textContent = (sec === "tutte" ? G.L("Tutte le notizie", "All the news") : sec === "seguiti" ? G.L("Temi seguiti", "Followed topics") : sec === slugOra() ? G.paeseNome(paeseOra()) : G.SECTIONS[sec]) + ": " + n + (n === 1 ? G.L(" notizia", " story") : G.L(" notizie", " stories"));
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
  // sul computer, con la colonna di destra accanto, quello che scorre di lato resta dentro la colonna delle notizie
  const clipFeed = (on) => { const f = $("feed").parentElement; if (f) f.classList.toggle("slide-clip", on && !stacked()); };
  function slideFeed(sgn) {
    // lo scorrimento si rimette sempre a mano: quando l'elenco cambia, il browser (scroll anchoring) lo sposterebbe da sé
    const feed = $("feed"), st = sectionTop(), y0 = scrollY, target = st.scroll !== null ? st.scroll : y0;
    if (G.reduced() || !feed.animate) { renderFeed(); scrollKeep(target); return; }
    clipFeed(true);
    const ghost = feed.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.className = "feed-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.querySelectorAll(".reveal").forEach((el) => el.classList.remove("reveal"));
    G.inertCopy(ghost);
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
    const fa = feed.animate([{ transform: "translate3d(" + (sgn * W) + "px,0,0)" }, { transform: "none" }], { duration: D, easing: E });
    fa.finished.then(() => clipFeed(false), () => clipFeed(false));
  }
  // passaggio animato verso la storia: il titolo toccato diventa il titolo della pagina successiva.
  // Il nome resta finché non tocchi altro, così tornando indietro il titolo rifà il percorso al contrario.
  // (computer) anche l'immagine della scheda diventa quella della storia
  const nameCard = (a) => {
    document.querySelectorAll("#feed h2, #feed .media").forEach((el) => { el.style.viewTransitionName = ""; });
    if (!a) return;
    a.closest("h2").style.viewTransitionName = "story-title";
    // sul telefono la pagina entra intera di lato: lì l'immagine resta nella sua pagina
    const md = matchMedia("(min-width: 760px)").matches ? a.closest(".lead, .item").querySelector(".media") : null;
    if (md) md.style.viewTransitionName = "story-img";
  };
  P.on(document, "click", (e) => {
    const a = e.target.closest("#feed a[data-id]");
    nameCard(a);
    if (!a) return;
    try { sessionStorage.setItem("gerico.vt", JSON.stringify({ id: a.dataset.id, title: a.textContent, sec: a.dataset.sec })); } catch (err) { /* niente */ }
  });

  state.section = sectionFromHash();
  buildNav(); markNav(); renderFeed(true); renderSide(); renderTicker(); renderNext(); renderUltim(); renderListen();
  // tornando da una storia, il suo titolo e la sua immagine rifanno il percorso al contrario fino alla scheda
  try {
    const m = G.shownBefore && /\/storia(?:\.html)?\?(?:.*&)?id=([^&#]+)/.exec(G.shownBefore);
    if (m && G.soft) {
      nameCard($("feed").querySelector('a[data-id="' + CSS.escape(decodeURIComponent(m[1])) + '"]'));
      // finito il ritorno i nomi si tolgono: un passaggio verso un'altra pagina non deve portarsi dietro quella scheda
      const pass = window.gericoVT, clear = () => nameCard(null);
      if (pass && pass.finished) pass.finished.then(clear, clear); else P.later(clear, 1200);
    }
  } catch (e) { /* senza la scheda il ritorno è la dissolvenza di sempre */ }
  // passando dal telefono al computer (finestra allargata, tablet girato) le brevi cambiano colonna
  if (wideQ && wideQ.addEventListener) P.on(wideQ, "change", () => renderFeed(true));
  // la colonna di sinistra cambia altezza (caratteri caricati, finestra più larga o più stretta): si rifà il conto
  if (window.ResizeObserver) {
    let fr = 0, lastH = 0;
    P.keep(new ResizeObserver(() => {
      const h = $("feed").offsetHeight;
      if (Math.abs(h - lastH) < 2) return;
      lastH = h;
      cancelAnimationFrame(fr);
      fr = requestAnimationFrame(fitSide);
    })).observe($("feed"));
  }
  P.every(renderNext, 30000);
  // prezzi nuovi a pagina aperta: ticker e riquadro Mercati; le sezioni accanto già pronte per lo swipe (che sul telefono
  // contengono il riquadro) si rifanno
  G.liveQuotes(P, qt0 && qt0.asOf, (q) => {
    qt = q; mk = G.withQuotes(mk0, q);
    renderTicker(); renderSide(true);
    feedVer += 1; prepareSoon();
  });

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
    const side2 = !stacked();
    if (side2) { frame.style.left = fr.left.toFixed(1) + "px"; frame.style.right = "auto"; frame.style.width = fr.width.toFixed(1) + "px"; }
    const p = document.createElement("div");
    p.className = "feed-ghost feed-peek";
    p.setAttribute("aria-hidden", "true");
    p.style.top = "0px";
    p.style.left = (side2 ? 0 : fr.left).toFixed(1) + "px";
    p.style.width = fr.width + "px";
    p.style.height = h + "px";
    p.style.transform = "translate3d(" + (d * (fr.width + 28)) + "px,0,0)";
    // come #feed (flow-root): stessi margini dentro, stesse altezze
    const list = document.createElement("div");
    list.style.display = "flow-root";
    list.innerHTML = feedMarkupFor(k);
    G.showImgs(list);
    p.appendChild(list);
    frame.appendChild(p);
    document.body.appendChild(frame);
    if (stacked()) {
      const sr = side.getBoundingClientRect(), c = side.cloneNode(true);
      c.style.cssText = "position:absolute;margin:0;left:" + (sr.left - fr.left).toFixed(1) + "px;width:" + sr.width.toFixed(1) + "px;top:" + (list.offsetHeight + sr.top - fr.bottom).toFixed(1) + "px";
      p.appendChild(c);
    }
    G.inertCopy(p);
    return { frame, p, key: k, ver: feedVer, w: fr.width };
  }
  // a pagina ferma si preparano le due sezioni accanto: così il primo movimento del dito non costruisce niente
  // mai mentre il dito è sullo schermo, e una sezione per volta: ogni pezzo di lavoro sta in un momento libero
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
      clipFeed(true);
      return r.p;
    },
    drop: (p) => { (p.parentElement && p.parentElement.classList.contains("peek-frame") ? p.parentElement : p).remove(); clipFeed(false); prepareSoon(); },
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
      clipFeed(false);
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
    btn.textContent = G.L("Edizione nuova delle ", "New edition at ") + G.hm(now.lastRun) + G.L(" · Aggiorna", " · Refresh");
    btn.addEventListener("click", () => location.reload());
    document.body.appendChild(btn);
  });
});
