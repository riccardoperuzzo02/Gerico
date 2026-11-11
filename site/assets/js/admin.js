/* GERICO: il gestionale di Riccardo. La pagina la manda il Worker (/admin) solo all'amministratore (e, finché un
   amministratore non c'è, a chi ha il codice ADMIN_TOKEN); i numeri arrivano da /api/admin/dati, che controlla la
   sessione a ogni richiesta. I grafici sono fatti qui, senza librerie: una serie per grafico, i valori nel riquadro
   che compare toccando una barra (o con le frecce della tastiera) e nella tabella sotto ogni grafico. */
G.page("admin", async function (P) {
  "use strict";
  G.initPrefs();
  const $ = (id) => document.getElementById(id), esc = G.esc, L = G.L;
  const box = $("ad"), sub = $("ad-sub");
  if (!box) return;
  const LOC = G.en ? "en-GB" : "it-IT";
  const nf = new Intl.NumberFormat(LOC);
  const fGiorno = new Intl.DateTimeFormat(LOC, { day: "numeric", month: "short", timeZone: "UTC" });
  const fGiornoL = new Intl.DateTimeFormat(LOC, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const fQuando = new Intl.DateTimeFormat(LOC, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const giornoTxt = (g, lungo) => (lungo ? fGiornoL : fGiorno).format(new Date(g + "T12:00:00Z")).replace(".", "");
  const quando = (t) => (t ? fQuando.format(new Date(t)).replace(".", "") : "—");
  const n = (v) => nf.format(v || 0);
  const PERIODI = [7, 30, 90];
  let giorni = G.ls.get("gerico.admin.giorni", 30);
  if (!PERIODI.includes(giorni)) giorni = 30;
  let turno = 0;

  const PAGINA = { "prima-pagina": L("Prima pagina", "Front page"), storia: L("Storie", "Stories"), terminal: "Terminal", "come-funziona": L("Come funziona", "How it works"), privacy: "Privacy" };
  const LINGUA = { it: "Italiano", en: "English" };
  const DISP = { telefono: L("Telefono", "Phone"), tablet: "Tablet", computer: L("Computer", "Computer") };
  const ERR = {
    "troppi-tentativi": L("Troppi tentativi: riprova tra un minuto.", "Too many attempts: try again in a minute."),
    codice: L("Il codice non è quello giusto.", "That code isn't right."),
    "non-attivi": L("Il database degli account non è ancora collegato al Worker.", "The accounts database isn't connected to the Worker yet.")
  };
  const messaggio = (e) => ERR[e && e.message] || (G.conto && G.conto.spiega ? G.conto.spiega(e) : L("Qualcosa non è andato: riprova.", "Something went wrong: try again."));

  // ---------- chi sei ----------
  const vista = async () => {
    turno += 1;
    box.classList.remove("ad-on");
    let st = null;
    try { st = await G.conto.io({ admin: true }); } catch (e) { st = { errore: e }; }
    if (!st || st.errore) {
      box.innerHTML = '<section class="ad-card"><h2>' + L("Il Worker non risponde", "The Worker isn't answering") + "</h2><p>" + esc(messaggio(st && st.errore)) + '</p><button type="button" class="btn-retry" id="ad-riprova">' + L("Riprova", "Try again") + "</button></section>";
      $("ad-riprova").addEventListener("click", vista);
      sub.textContent = "";
      return;
    }
    if (!st.utente) return accesso();
    if (!st.utente.admin) return st.avvio ? codice(st.utente) : nonAdmin(st.utente);
    return pannello();
  };

  const accesso = () => {
    sub.textContent = L("Serve la passkey dell'amministratore", "The administrator's passkey is needed");
    box.innerHTML = '<section class="ad-card"><h2>' + L("Accedi", "Sign in") + "</h2><p>" +
      L("Il gestionale si apre con la passkey del tuo account GERICO: Face ID, Touch ID, l'impronta o il codice del telefono.", "The dashboard opens with your GERICO account's passkey: Face ID, Touch ID, fingerprint or your phone's passcode.") + "</p>" +
      '<button type="button" class="conto-b primario" id="ad-accedi">' + L("Accedi con la passkey", "Sign in with a passkey") + "</button>" +
      '<p class="ad-nota">' + L("Non hai ancora un account?", "No account yet?") + ' <button type="button" class="btn-text ad-inline" id="ad-nuovo">' + L("Crealo adesso", "Create one now") + "</button>" +
      L(", poi scrivi qui il codice.", ", then type the code here.") + '</p><p class="conto-err" role="alert" id="ad-err"></p></section>';
    $("ad-accedi").addEventListener("click", async () => {
      const b = $("ad-accedi");
      b.disabled = true;
      $("ad-err").textContent = "";
      try { await G.conto.accedi(); }
      catch (e) { const err = $("ad-err"); if (err) err.textContent = messaggio(e); }
      finally { if (b.isConnected) b.disabled = false; }
    });
    $("ad-nuovo").addEventListener("click", () => G.conto.apri("nuovo"));
  };

  const codice = (u) => {
    sub.textContent = L("Primo accesso al gestionale", "First visit to the dashboard");
    box.innerHTML = '<section class="ad-card"><h2>' + L("Diventa l'amministratore", "Become the administrator") + "</h2><p>" +
      L("Sei entrato come ", "You're signed in as ") + "<b>" + esc(u.nome) + "</b>. " +
      L("Scrivi il codice che hai messo nel segreto ADMIN_TOKEN su Cloudflare. Basta una volta: da lì il gestionale si apre solo con questo account e il segreto si può togliere.",
        "Type the code you put in the ADMIN_TOKEN secret on Cloudflare. Once is enough: from then on the dashboard opens only with this account and the secret can be removed.") + "</p>" +
      '<form id="ad-form" class="ad-form" autocomplete="off"><label class="conto-campo"><span>' + L("Codice", "Code") + '</span><input type="password" id="ad-codice" required maxlength="200" autocomplete="off" spellcheck="false"></label>' +
      '<button type="submit" class="conto-b primario">' + L("Conferma", "Confirm") + '</button></form><p class="conto-err" role="alert" id="ad-err"></p></section>';
    $("ad-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button");
      b.disabled = true;
      $("ad-err").textContent = "";
      try { await G.conto.api("admin/attiva", { codice: $("ad-codice").value }); await vista(); }
      catch (err) { const el = $("ad-err"); if (el) el.textContent = messaggio(err); }
      finally { if (b.isConnected) b.disabled = false; }
    });
  };

  const nonAdmin = (u) => {
    sub.textContent = "";
    box.innerHTML = '<section class="ad-card"><h2>' + L("Questo account non è l'amministratore", "This account isn't the administrator") + "</h2><p>" +
      L("Sei entrato come ", "You're signed in as ") + "<b>" + esc(u.nome) + "</b>. " + L("Esci dal menu ed entra con l'account dell'amministratore.", "Sign out from the menu and sign in with the administrator's account.") + "</p></section>";
  };

  // ---------- il pannello ----------
  const pannello = async () => {
    box.classList.add("ad-on");
    box.innerHTML = '<div class="ad-filtri"><div class="seg" id="ad-periodo" role="group" aria-label="' + L("Periodo", "Period") + '">' +
      PERIODI.map((g) => '<button type="button" data-giorni="' + g + '" aria-pressed="' + (g === giorni) + '">' + g + L(" giorni", " days") + "</button>").join("") +
      '</div><button type="button" class="btn-text" id="ad-agg">' + L("Aggiorna", "Refresh") + '</button></div><div id="ad-corpo" class="ad-corpo"></div>';
    G.seg($("ad-periodo"), true);
    $("ad-periodo").addEventListener("click", (e) => {
      const b = e.target.closest("[data-giorni]");
      if (!b || Number(b.dataset.giorni) === giorni) return;
      giorni = Number(b.dataset.giorni);
      G.ls.set("gerico.admin.giorni", giorni);
      $("ad-periodo").querySelectorAll("[data-giorni]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.giorni) === giorni)));
      G.seg($("ad-periodo"));
      aggiorna();
    });
    $("ad-agg").addEventListener("click", aggiorna);
    await aggiorna();
  };

  const aggiorna = async () => {
    const corpo = $("ad-corpo");
    if (!corpo) return;
    const mio = ++turno;
    corpo.classList.add("ad-carico");
    corpo.setAttribute("aria-busy", "true");
    let d, stato;
    try {
      [d, stato] = await Promise.all([
        G.conto.api("admin/dati?giorni=" + giorni),
        fetch("data/stato.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ]);
    } catch (e) {
      if (mio !== turno) return;
      if (e.stato === 401 || e.stato === 404) { vista(); return; }
      corpo.classList.remove("ad-carico");
      corpo.removeAttribute("aria-busy");
      corpo.innerHTML = '<p class="ad-nota">' + esc(messaggio(e)) + "</p>";
      return;
    }
    if (mio !== turno) return;
    corpo.innerHTML = disegna(d, stato);
    corpo.classList.remove("ad-carico");
    corpo.removeAttribute("aria-busy");
    corpo.querySelectorAll(".ad-cols").forEach(grafico);
    const cerca = $("ad-cerca");
    if (cerca) cerca.addEventListener("input", () => filtra(cerca.value));
    sub.textContent = L("Aggiornato alle ", "Updated at ") + new Intl.DateTimeFormat(LOC, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(d.ora)) +
      L(" · ultimi ", " · last ") + d.giorni + L(" giorni", " days");
  };

  // ---------- pezzi del pannello ----------
  const tessera = (etichetta, valore, nota) => '<div class="ad-t"><p class="ad-t-l">' + esc(etichetta) + '</p><p class="ad-t-v">' + esc(valore) + "</p>" + (nota ? '<p class="ad-t-n">' + esc(nota) + "</p>" : "") + "</div>";

  // un grafico a colonne: una serie, i giorni in fila, la scala con numeri tondi
  // la cima della scala: un numero tondo e pari, così anche la riga a metà è un numero intero
  const tondo = (max) => {
    if (max <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    for (const k of [1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10]) { const t = Math.round(k * p); if (t >= max && t % 2 === 0) return t; }
    return 10 * p;
  };
  const colonne = (serie, campo, titolo, unita) => {
    const vals = serie.map((x) => x[campo] || 0), tot = vals.reduce((a, b) => a + b, 0), max = Math.max(0, ...vals), top = tondo(max);
    const iMax = vals.indexOf(max);
    const desc = titolo + L(", ultimi ", ", last ") + serie.length + L(" giorni: in tutto ", " days: ") + n(tot) + (tot && max ? L(", il giorno con più ", ", the busiest day ") + giornoTxt(serie[iMax].giorno) + L(" con ", " with ") + n(max) : "");
    return '<figure class="ad-fig"><figcaption class="ad-fig-t">' + esc(titolo) + '<span class="ad-fig-s">' + n(tot) + L(" in tutto", " in total") + "</span></figcaption>" +
      '<div class="ad-cols' + (serie.length > 45 ? " fitto" : "") + '" tabindex="0" role="img" aria-label="' + esc(desc) + '" data-unita="' + esc(unita) + '" data-vals="' + vals.join(",") + '" data-giorni="' + serie.map((x) => x.giorno).join(",") + '">' +
      '<div class="ad-y" aria-hidden="true"><span>' + n(top) + "</span><span>" + n(top / 2) + "</span><span>0</span></div>" +
      '<div class="ad-plot" aria-hidden="true"><i class="ad-g" style="bottom:100%"></i><i class="ad-g" style="bottom:50%"></i><i class="ad-g ad-g0" style="bottom:0"></i>' +
      vals.map((v, i) => '<span class="ad-col" data-i="' + i + '" style="height:' + (top ? (100 * v / top).toFixed(2) : 0) + '%"></span>').join("") +
      '</div><div class="ad-x" aria-hidden="true"><span>' + esc(giornoTxt(serie[0].giorno)) + "</span><span>" + esc(giornoTxt(serie[serie.length - 1].giorno)) + "</span></div>" +
      '<div class="ad-tip" hidden></div></div>' +
      '<details class="ad-tab"><summary>' + L("I numeri giorno per giorno", "The numbers day by day") + "</summary><table><thead><tr><th scope=\"col\">" + L("Giorno", "Day") + '</th><th scope="col">' + esc(G.cap(unita)) + "</th></tr></thead><tbody>" +
      serie.slice().reverse().map((x) => "<tr><td>" + esc(giornoTxt(x.giorno, true)) + "</td><td>" + n(x[campo]) + "</td></tr>").join("") + "</tbody></table></details></figure>";
  };
  // il riquadro con il valore: segue il dito o il mouse sulla colonna più vicina; con la tastiera le frecce
  const grafico = (el) => {
    const plot = el.querySelector(".ad-plot"), tip = el.querySelector(".ad-tip"), cols = Array.from(el.querySelectorAll(".ad-col"));
    const vals = el.dataset.vals.split(",").map(Number), giorniG = el.dataset.giorni.split(","), unita = el.dataset.unita;
    let cur = -1;
    const mostra = (i) => {
      if (i < 0 || i >= cols.length) return;
      if (cur >= 0) cols[cur].classList.remove("on");
      cur = i;
      cols[i].classList.add("on");
      tip.innerHTML = "<b>" + n(vals[i]) + "</b> <span>" + esc(unita) + "</span><br><span>" + esc(giornoTxt(giorniG[i], true)) + "</span>";
      tip.hidden = false;
      const r = cols[i].getBoundingClientRect(), b = el.getBoundingClientRect();
      const w = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(b.width - w, r.left - b.left + r.width / 2 - w / 2)) + "px";
    };
    const nascondi = () => { if (cur >= 0) cols[cur].classList.remove("on"); cur = -1; tip.hidden = true; };
    const vicina = (x) => {
      let best = 0, d = Infinity;
      cols.forEach((c, i) => { const r = c.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - x); if (dd < d) { d = dd; best = i; } });
      return best;
    };
    plot.addEventListener("pointermove", (e) => mostra(vicina(e.clientX)));
    plot.addEventListener("pointerdown", (e) => mostra(vicina(e.clientX)));
    plot.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") nascondi(); });
    el.addEventListener("focus", () => mostra(cur >= 0 ? cur : cols.length - 1));
    el.addEventListener("blur", nascondi);
    el.addEventListener("keydown", (e) => {
      const k = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (k) { e.preventDefault(); mostra(Math.max(0, Math.min(cols.length - 1, (cur < 0 ? cols.length - 1 : cur) + k))); }
      else if (e.key === "Home") { e.preventDefault(); mostra(0); }
      else if (e.key === "End") { e.preventDefault(); mostra(cols.length - 1); }
      else if (e.key === "Escape") nascondi();
    });
  };

  // una classifica: righe con il nome, il numero e una barra sottile, la più lunga in cima
  const classifica = (titolo, righe, nome) => {
    const tot = righe.reduce((a, r) => a + r.n, 0), max = Math.max(1, ...righe.map((r) => r.n));
    return '<div class="ad-rank"><h3>' + esc(titolo) + "</h3>" + (righe.length ? '<ol class="ad-rl">' + righe.slice(0, 12).map((r) => '<li><span class="ad-rk">' + nome(r.k) + '</span><span class="ad-rv">' + n(r.n) +
      ' <small>' + Math.round(100 * r.n / (tot || 1)) + '%</small></span><span class="ad-rb" aria-hidden="true"><i style="width:' + (100 * r.n / max).toFixed(1) + '%"></i></span></li>').join("") + "</ol>"
      : '<p class="ad-nota">' + L("Ancora nessuna visita.", "No visits yet.") + "</p>") + "</div>";
  };

  const interessiTxt = (i, paese) => (i && G.interessi ? G.interessi.testo(i, paese || "IT") : "");
  const iscritto = (u) => '<li data-q="' + esc((u.nome + " " + u.email).toLowerCase()) + '"><p class="ad-u-n">' + esc(u.nome) + (u.admin ? ' <span class="ad-badge">' + L("amministratore", "administrator") + "</span>" : "") + "</p>" +
    '<p class="ad-u-e">' + (u.email ? esc(u.email) : L("senza email", "no email")) + "</p>" +
    '<p class="ad-u-m">' + L("Iscritto ", "Joined ") + esc(quando(u.creato)) + " · " + L("ultimo accesso ", "last seen ") + esc(quando(u.ultimo)) +
    (u.paese ? " · " + G.flag(u.paese) + " " + esc(G.paeseNome(u.paese)) : "") + " · " + n(u.temi) + (u.temi === 1 ? L(" tema", " topic") : L(" temi", " topics")) +
    " · " + n(u.passkey) + " passkey</p>" + (interessiTxt(u.interessi, u.paese) ? '<p class="ad-u-m">' + esc(interessiTxt(u.interessi, u.paese)) + "</p>" : "") + "</li>";
  const filtra = (q) => {
    q = q.trim().toLowerCase();
    let k = 0;
    document.querySelectorAll(".ad-users > li").forEach((li) => { const on = !q || li.dataset.q.includes(q); li.hidden = !on; if (on) k += 1; });
    const none = $("ad-nessuno");
    if (none) none.hidden = k > 0;
  };

  const errori = (lista, vuoto) => (lista.length ? '<ul class="ad-errs">' + lista.map((e) => '<li><p class="ad-e-m">' + esc(e.messaggio) + "</p>" +
    '<p class="ad-e-w">' + (e.file ? esc(e.file) + (e.riga ? ":" + e.riga : "") + " · " : "") + (e.pagina ? esc(PAGINA[e.pagina] || e.pagina) + " · " : "") +
    "<b>" + n(e.n) + (e.n === 1 ? L(" volta", " time") : L(" volte", " times")) + "</b> · " + L("l'ultima ", "last ") + esc(quando(e.ultimo)) + (e.n > 1 ? L(", la prima ", ", first ") + esc(quando(e.primo)) : "") + "</p></li>").join("") + "</ul>"
    : '<p class="ad-nota">' + esc(vuoto) + "</p>");

  const disegna = (d, stato) => {
    const oggi = d.serie[d.serie.length - 1] || {}, periodo = d.serie.reduce((a, x) => a + x.visite, 0);
    const nuovi = d.serie.reduce((a, x) => a + x.iscritti, 0);
    const js = d.errori.filter((e) => e.tipo === "js"), wk = d.errori.filter((e) => e.tipo !== "js");
    const recenti = d.errori.filter((e) => d.ora - e.ultimo < 864e5).length;
    const avvisi = [];
    if (d.segreti.adminToken) avvisi.push(L("Il segreto ADMIN_TOKEN è ancora impostato: il tuo account è già l'amministratore, quindi puoi toglierlo (Cloudflare, Workers e Pages, gerico, Settings, Variables and Secrets).",
      "The ADMIN_TOKEN secret is still set: your account is already the administrator, so you can remove it (Cloudflare, Workers & Pages, gerico, Settings, Variables and Secrets)."));
    if (d.segreti.githubAvvio === false) avvisi.push(L("Manca il segreto GITHUB_AVVIO: gli orari dei giri dipendono da GitHub, che a volte parte in ritardo o non parte.", "The GITHUB_AVVIO secret is missing: run times depend on GitHub, which sometimes starts late or not at all."));
    if (!d.segreti.statsSalt) avvisi.push(L("Manca il segreto STATS_SALT: le visite si contano, i visitatori unici no.", "The STATS_SALT secret is missing: visits are counted, unique visitors aren't."));
    const pubbl = stato && Array.isArray(stato.problemi) ? stato.problemi.slice().reverse() : [];
    let h = avvisi.map((a) => '<p class="ad-avviso">' + esc(a) + "</p>").join("");
    h += '<div class="ad-tiles">' +
      tessera(L("Iscritti", "Members"), n(d.iscritti.totale), nuovi ? "+" + n(nuovi) + L(" negli ultimi ", " in the last ") + d.giorni + L(" giorni", " days") : L("nessuno nuovo nel periodo", "none new in the period")) +
      tessera(L("Visite oggi", "Visits today"), n(oggi.visite), n(periodo) + L(" nel periodo", " in the period")) +
      tessera(L("Visitatori unici oggi", "Unique visitors today"), oggi.unici === null || oggi.unici === undefined ? "—" : n(oggi.unici), oggi.unici === null || oggi.unici === undefined ? L("serve STATS_SALT", "needs STATS_SALT") : L("persone diverse, più o meno", "different people, roughly")) +
      tessera(L("Problemi nelle ultime 24 ore", "Problems in the last 24 hours"), n(recenti), recenti ? L("errori diversi", "distinct errors") : L("nessun errore", "no errors")) + "</div>";
    h += '<section class="ad-sec" aria-labelledby="ad-h-aff"><h2 id="ad-h-aff">' + L("Affluenza", "Traffic") + "</h2>" +
      colonne(d.serie, "visite", L("Visite al giorno", "Visits per day"), L("visite", "visits")) +
      (d.segreti.statsSalt ? colonne(d.serie, "unici", L("Visitatori unici al giorno", "Unique visitors per day"), L("visitatori", "visitors")) : "") +
      '<div class="ad-ranks">' +
      classifica(L("Pagine", "Pages"), d.pagine, (k) => esc(PAGINA[k] || k)) +
      classifica(L("Paese scelto", "Chosen country"), d.paesi, (k) => G.flag(k) + " " + esc(G.paeseNome(k))) +
      classifica(L("Lingua", "Language"), d.lingue, (k) => esc(LINGUA[k] || k)) +
      classifica(L("Dispositivo", "Device"), d.dispositivi, (k) => esc(DISP[k] || k)) +
      '</div><p class="ad-nota">' + L("Le visite si contano senza cookie e senza salvare indirizzi IP; i visitatori unici con un hash che cambia ogni giorno.", "Visits are counted without cookies and without storing IP addresses; unique visitors with a hash that changes every day.") + "</p></section>";
    h += '<section class="ad-sec" aria-labelledby="ad-h-isc"><h2 id="ad-h-isc">' + L("Iscritti", "Members") + "</h2>" +
      colonne(d.serie, "iscritti", L("Nuovi iscritti al giorno", "New members per day"), L("iscritti", "members")) +
      (d.iscritti.elenco.length > 8 ? '<input class="paesi-q ad-cerca" id="ad-cerca" type="search" autocomplete="off" spellcheck="false" placeholder="' + L("Cerca per nome o email", "Search by name or email") + '" aria-label="' + L("Cerca per nome o email", "Search by name or email") + '">' : "") +
      (d.iscritti.elenco.length ? '<ul class="ad-users">' + d.iscritti.elenco.map(iscritto).join("") + '</ul><p class="ad-nota" id="ad-nessuno" hidden>' + L("Nessun iscritto con questo nome.", "No member with this name.") + "</p>"
        : '<p class="ad-nota">' + L("Ancora nessun iscritto.", "No members yet.") + "</p>") + "</section>";
    h += '<section class="ad-sec" aria-labelledby="ad-h-pro"><h2 id="ad-h-pro">' + L("Problemi", "Problems") + "</h2>" +
      "<h3>" + L("Errori nelle pagine", "Errors in the pages") + "</h3>" + errori(js, L("Nessun errore di JavaScript negli ultimi 30 giorni.", "No JavaScript errors in the last 30 days.")) +
      "<h3>" + L("Errori del Worker", "Worker errors") + "</h3>" + errori(wk, L("Nessun errore del Worker negli ultimi 30 giorni.", "No Worker errors in the last 30 days.")) +
      "<h3>" + L("Pubblicazioni della redazione non riuscite", "Failed newsroom publications") + "</h3>" +
      (pubbl.length ? '<ul class="ad-errs">' + pubbl.map((p) => '<li><p class="ad-e-m">' + esc(p.message || "") + '</p><p class="ad-e-w">' + esc(quando(Date.parse(p.at))) + "</p></li>").join("") + "</ul>"
        : '<p class="ad-nota">' + L("Nessuna pubblicazione non riuscita.", "No failed publications.") + "</p>") + "</section>";
    return h;
  };

  // accesso o uscita (da qui o dal menu): la pagina si rifà per chi è entrato
  P.on(document, "gerico:conto", () => vista());
  await vista();
});
