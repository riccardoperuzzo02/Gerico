// GERICO: la ricerca dei titoli e i loro prezzi da Yahoo Finance, per il campo «Cerca» del Terminal.
// Il browser chiede al nostro Worker (/api/cerca, /api/titolo) e il Worker chiede a Yahoo: Yahoo non vede chi cerca.
// Niente database e niente registro di quello che si cerca: solo una memoria di pochi minuti nel Worker, che non
// sopravvive a lungo e non dice chi ha chiesto. Se Yahoo risponde 429 (troppe richieste) si aspetta un minuto.

// i tipi che servono al Terminal, con il nome che usa la pagina
const TIPI = { EQUITY: "azione", ETF: "etf", MUTUALFUND: "fondo", INDEX: "indice", CURRENCY: "valuta", CRYPTOCURRENCY: "cripto", FUTURE: "future" };
const MAX_RISULTATI = 8, MAX_PUNTI = 66, MAX_MEMORIA = 300;
const DURATA = { cerca: 600, titolo: 120 };           // secondi: memoria nel Worker e nel browser
const PAUSA_MS = 60000, ATTESA_MS = 4000;
const AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

// un testo che arriva da chi legge: niente caratteri di controllo o invisibili, spazi semplici, al più 60 caratteri
export const testoRicerca = (q) => (typeof q === "string" ? q.normalize("NFC")
  .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g, "")
  .replace(/\s+/g, " ").trim().slice(0, 60).trim() : "");

// i simboli di Yahoo: lettere, cifre e . ^ = - & (ENI.MI, ^GSPC, EURUSD=X, BRK-B, M&M.NS)
export const simboloValido = (s) => typeof s === "string" && /^[A-Za-z0-9^=.\-&]{1,24}$/.test(s);

const testo = (v) => (typeof v === "string" ? v.trim() : "");
const numero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const due = (v) => Math.round(v * 100) / 100;
const variazione = (ora, prima) => (ora != null && prima ? due(((ora - prima) / prima) * 100) : null);

export function leggiRicerca(json) {
  const quotes = json && Array.isArray(json.quotes) ? json.quotes : [], visti = new Set(), out = [];
  for (const q of quotes) {
    if (!q || q.isYahooFinance === false) continue;
    const k = TIPI[q.quoteType], s = testo(q.symbol);
    if (!k || !simboloValido(s) || visti.has(s.toUpperCase())) continue;
    visti.add(s.toUpperCase());
    out.push({ s, n: testo(q.longname) || testo(q.shortname) || s, b: testo(q.exchDisp) || testo(q.exchange), k });
    if (out.length === MAX_RISULTATI) break;
  }
  return out;
}

// il giorno di borsa di un istante, nel fuso della Borsa («2026-11-26»)
const giornoIn = (fuso) => {
  let f;
  try { f = new Intl.DateTimeFormat("en-CA", { timeZone: fuso || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch (e) { f = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }); }
  return (sec) => f.format(new Date(sec * 1000));
};
// al più n punti presi a distanza uguale, sempre con il primo e l'ultimo
const sfoltisci = (xs, n) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (n - 1))]));
const cifre = (v) => Number(v.toPrecision(6));

export function leggiGrafico(json) {
  const r = json && json.chart && Array.isArray(json.chart.result) ? json.chart.result[0] : null;
  if (!r || !r.meta) return null;
  const m = r.meta, p = numero(m.regularMarketPrice);
  if (p == null) return null;
  const ts = Array.isArray(r.timestamp) ? r.timestamp : [];
  const chiusure = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const barre = ts.map((t, i) => [numero(t), numero(chiusure[i])]).filter(([t, c]) => t != null && c != null);
  const giorno = giornoIn(m.exchangeTimezoneName), adesso = numero(m.regularMarketTime) || (barre.length ? barre[barre.length - 1][0] : null);
  const oggi = adesso != null ? giorno(adesso) : "";
  // le sedute finite prima di quella del prezzo: l'ultima è «ieri», cinque indietro una settimana, ventuno un mese
  const prima = barre.filter(([t]) => giorno(t) < oggi).map(([, c]) => c);
  const ieriGrezzo = prima.length ? prima[prima.length - 1] : numero(m.previousClose), ieri = ieriGrezzo != null ? cifre(ieriGrezzo) : null;
  const dietro = (n) => (prima.length >= n ? prima[prima.length - n] : null);
  const linea = barre.map(([, c]) => c);
  if (!barre.length || giorno(barre[barre.length - 1][0]) < oggi) linea.push(p);
  else linea[linea.length - 1] = p;
  const s = testo(m.symbol);
  return {
    s, n: testo(m.longName) || testo(m.shortName) || s, b: testo(m.fullExchangeName) || testo(m.exchangeName), k: TIPI[m.instrumentType] || "",
    cur: testo(m.currency), p, t: adesso != null ? new Date(adesso * 1000).toISOString() : null,
    prev: ieri, c: variazione(p, ieri), c1w: variazione(p, dietro(5)), c1m: variazione(p, dietro(21)), c3m: variazione(p, prima.length ? prima[0] : null),
    lo: numero(m.regularMarketDayLow), hi: numero(m.regularMarketDayHigh), lo52: numero(m.fiftyTwoWeekLow), hi52: numero(m.fiftyTwoWeekHigh),
    spark: sfoltisci(linea, MAX_PUNTI).map(cifre), url: "https://finance.yahoo.com/quote/" + encodeURIComponent(s)
  };
}

const INTESTAZIONI = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" };
const rispondiJson = (dati, stato, secondi) => new Response(JSON.stringify(dati), {
  status: stato, headers: Object.assign({}, INTESTAZIONI, { "Cache-Control": secondi ? "private, max-age=" + secondi : "no-store" })
});

// una per Worker: la memoria e la pausa valgono per tutte le richieste che passano da lì
export function creaYahoo(opz) {
  const o = opz || {}, prendi = o.fetch || ((u, i) => fetch(u, i)), ora = o.ora || Date.now, attesa = o.attesa || ATTESA_MS;
  const memoria = new Map();
  let pausaFino = 0;
  const ricorda = (k, dati, secondi) => {
    memoria.delete(k);
    memoria.set(k, { dati, scade: ora() + secondi * 1000 });
    while (memoria.size > MAX_MEMORIA) memoria.delete(memoria.keys().next().value);
  };
  const ricordato = (k) => {
    const v = memoria.get(k);
    if (!v) return null;
    if (v.scade <= ora()) { memoria.delete(k); return null; }
    return v.dati;
  };
  // la chiamata a Yahoo: { stato, json } oppure un errore (rete, tempo scaduto, risposta che non è JSON)
  const chiama = async (url) => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), attesa);
    try {
      const r = await prendi(url, { headers: { "User-Agent": AGENTE, Accept: "application/json" }, signal: ctl.signal });
      let json = null;
      try { json = await r.json(); } catch (e) { json = null; }
      return { stato: r.status, json };
    } finally { clearTimeout(timer); }
  };
  const daYahoo = async (url, leggi) => {
    if (ora() < pausaFino) return { errore: "pausa", stato: 503 };
    let r;
    try { r = await chiama(url); } catch (e) { return { errore: "yahoo", stato: 502 }; }
    if (r.stato === 429) { pausaFino = ora() + PAUSA_MS; return { errore: "pausa", stato: 503 }; }
    const dati = r.json ? leggi(r.json) : null;
    if (r.stato === 404 || (r.stato === 200 && r.json && dati == null)) return { errore: "non-trovato", stato: 404 };
    if (r.stato !== 200 || dati == null) return { errore: "yahoo", stato: 502 };
    return { dati };
  };
  async function rispondi(request) {
    // dal browser solo il nostro sito: un altro sito non usa la nostra ricerca con i visitatori suoi
    const sito = request.headers.get("Sec-Fetch-Site");
    if (sito && sito !== "same-origin" && sito !== "none") return rispondiJson({ errore: "origine" }, 403);
    const u = new URL(request.url), via = u.pathname.replace(/\/+$/, "");
    if (via === "/api/cerca") {
      const q = testoRicerca(u.searchParams.get("q"));
      if (!q) return rispondiJson({ errore: "testo" }, 400);
      const k = "c:" + q.toLowerCase(), m = ricordato(k);
      if (m) return rispondiJson(m, 200, DURATA.cerca);
      const r = await daYahoo("https://query2.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(q) +
        "&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query", (j) => leggiRicerca(j));
      if (r.errore) return rispondiJson({ errore: r.errore === "non-trovato" ? "yahoo" : r.errore }, r.errore === "non-trovato" ? 502 : r.stato);
      const dati = { q, risultati: r.dati };
      ricorda(k, dati, DURATA.cerca);
      return rispondiJson(dati, 200, DURATA.cerca);
    }
    if (via === "/api/titolo") {
      const s = u.searchParams.get("s");
      if (!simboloValido(s)) return rispondiJson({ errore: "simbolo" }, 400);
      const k = "t:" + s.toUpperCase(), m = ricordato(k);
      if (m) return rispondiJson(m, 200, DURATA.titolo);
      const r = await daYahoo("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(s) + "?range=3mo&interval=1d&includePrePost=false", leggiGrafico);
      if (r.errore) return rispondiJson({ errore: r.errore }, r.stato);
      ricorda(k, r.dati, DURATA.titolo);
      return rispondiJson(r.dati, 200, DURATA.titolo);
    }
    return rispondiJson({ errore: "non-trovato" }, 404);
  }
  return { rispondi };
}
