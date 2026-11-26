// Prove di worker/yahoo.js: la ricerca e i prezzi di Yahoo Finance che il Worker dà al Terminal.
// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { testoRicerca, simboloValido, leggiRicerca, leggiGrafico, creaYahoo } from "../worker/yahoo.js";

// ---------- dati finti con la forma delle risposte di Yahoo ----------
const RICERCA = {
  quotes: [
    { exchange: "MIL", shortname: "ENI", quoteType: "EQUITY", symbol: "ENI.MI", longname: "Eni S.p.A.", exchDisp: "Milan", isYahooFinance: true },
    { exchange: "NYQ", shortname: "E", quoteType: "EQUITY", symbol: "E", longname: "Eni S.p.A.", exchDisp: "NYSE", isYahooFinance: true },
    { exchange: "OPR", shortname: "ENI Call", quoteType: "OPTION", symbol: "E261218C00030000", isYahooFinance: true },
    { exchange: "MIL", shortname: "ENI", quoteType: "EQUITY", symbol: "ENI.MI", isYahooFinance: true },
    { exchange: "PCX", shortname: "iShares Global Energy ETF", quoteType: "ETF", symbol: "IXC", exchDisp: "NYSEArca", isYahooFinance: true },
    { exchange: "CCC", shortname: "Bitcoin USD", quoteType: "CRYPTOCURRENCY", symbol: "BTC-USD", exchDisp: "CCC", isYahooFinance: true },
    { exchange: "FRA", shortname: "Fondo Esempio", quoteType: "MUTUALFUND", symbol: "0P0000XYZ.F", isYahooFinance: true },
    { exchange: "XX", shortname: "Non finanza", quoteType: "EQUITY", symbol: "NOFIN", isYahooFinance: false }
  ],
  news: []
};

// 30 sedute alle 9 di Roma (8 UTC): chiusure 12,0 12,1 … 14,8, l'ultima è oggi (26 novembre) a 15
const GIORNO = 864e5, OGGI = Date.UTC(2026, 10, 26, 8) / 1000;
const barre = (n, oggiIncluso = true) => {
  const ts = [], close = [];
  for (let i = 0; i < n; i++) { ts.push(OGGI - (n - 1 - i) * GIORNO / 1000); close.push(+(12 + i * 0.1).toFixed(2)); }
  if (oggiIncluso) close[n - 1] = 15;
  else { ts.pop(); close.pop(); }
  return { ts, close };
};
const grafico = (b, meta) => ({
  chart: { result: [{ meta: Object.assign({ currency: "EUR", symbol: "ENI.MI", exchangeName: "MIL", fullExchangeName: "Milan", instrumentType: "EQUITY",
    regularMarketTime: Date.UTC(2026, 10, 26, 14, 30) / 1000, exchangeTimezoneName: "Europe/Rome", regularMarketPrice: 15,
    fiftyTwoWeekHigh: 16, fiftyTwoWeekLow: 11, regularMarketDayHigh: 15.2, regularMarketDayLow: 14.8, longName: "Eni S.p.A.", shortName: "ENI", chartPreviousClose: 13 }, meta || {}),
    timestamp: b.ts, indicators: { quote: [{ close: b.close }] } }], error: null }
});

// ---------- testo e simbolo ----------
test("testoRicerca toglie spazi e caratteri di controllo e taglia a 60", () => {
  assert.equal(testoRicerca("  eni  "), "eni");
  assert.equal(testoRicerca("e\u0000n​i"), "eni");
  assert.equal(testoRicerca("x".repeat(70)).length, 60);
  assert.equal(testoRicerca(""), "");
  assert.equal(testoRicerca(null), "");
});

test("simboloValido accetta i simboli di Yahoo e rifiuta il resto", () => {
  for (const s of ["ENI.MI", "^GSPC", "EURUSD=X", "BRK-B", "M&M.NS"]) assert.equal(simboloValido(s), true, s);
  for (const s of ["../x", "", "A".repeat(25), "ENI MI", null]) assert.equal(simboloValido(s), false, String(s));
});

// ---------- ricerca ----------
test("leggiRicerca tiene i tipi utili, scarta opzioni, doppioni e voci non finanziarie", () => {
  assert.deepEqual(leggiRicerca(RICERCA).map((r) => r.s), ["ENI.MI", "E", "IXC", "BTC-USD", "0P0000XYZ.F"]);
});

test("leggiRicerca usa il nome lungo, poi quello corto, la Borsa e il tipo in italiano", () => {
  const r = leggiRicerca(RICERCA);
  assert.deepEqual(r[0], { s: "ENI.MI", n: "Eni S.p.A.", b: "Milan", k: "azione" });
  assert.equal(r[2].n, "iShares Global Energy ETF");
  assert.equal(r[2].k, "etf");
  assert.equal(r[3].k, "cripto");
  assert.equal(r[4].k, "fondo");
  assert.equal(r[4].b, "FRA");
});

test("leggiRicerca dà al massimo 8 risultati e niente con dati strani", () => {
  const tanti = { quotes: Array.from({ length: 12 }, (_, i) => ({ quoteType: "EQUITY", symbol: "T" + i, shortname: "T" + i })) };
  assert.equal(leggiRicerca(tanti).length, 8);
  assert.deepEqual(leggiRicerca(null), []);
  assert.deepEqual(leggiRicerca({ quotes: "x" }), []);
});

// ---------- prezzi ----------
test("leggiGrafico: prezzo, chiusura di ieri e variazioni", () => {
  const g = leggiGrafico(grafico(barre(30)));
  assert.equal(g.p, 15);
  assert.equal(g.prev, 14.8);
  assert.equal(g.c, 1.35);
  assert.equal(g.c1w, 4.17);
  assert.equal(g.c1m, 17.19);
  assert.equal(g.c3m, 25);
  assert.equal(g.n, "Eni S.p.A.");
  assert.equal(g.b, "Milan");
  assert.equal(g.k, "azione");
  assert.equal(g.cur, "EUR");
  assert.equal(g.lo52, 11);
  assert.equal(g.hi52, 16);
  assert.equal(g.url, "https://finance.yahoo.com/quote/ENI.MI");
});

test("leggiGrafico: senza la barra di oggi la chiusura di ieri è l'ultima barra", () => {
  const g = leggiGrafico(grafico(barre(30, false)));
  assert.equal(g.prev, 14.8);
  assert.equal(g.c, 1.35);
});

test("leggiGrafico: il giorno si conta nel fuso della Borsa", () => {
  // una barra alle 23:30 UTC del 25 è già il 26 a Roma: non è «ieri»
  const b = barre(30, false);
  b.ts.push(Date.UTC(2026, 10, 25, 23, 30) / 1000); b.close.push(14.9);
  assert.equal(leggiGrafico(grafico(b)).prev, 14.8);
});

test("leggiGrafico: la chiusura di ieri senza i decimali sporchi di Yahoo", () => {
  const b = barre(30);
  b.close[28] = 14.799999771118164;
  assert.equal(leggiGrafico(grafico(b)).prev, 14.8);
});

test("leggiGrafico: il grafico ha al massimo 66 punti e finisce sul prezzo di adesso", () => {
  const g = leggiGrafico(grafico(barre(100)));
  assert.ok(g.spark.length <= 66);
  assert.equal(g.spark[g.spark.length - 1], 15);
  const h = leggiGrafico(grafico(barre(30, false)));
  assert.equal(h.spark[h.spark.length - 1], 15);
});

test("leggiGrafico: niente prezzo, niente scheda", () => {
  assert.equal(leggiGrafico(grafico(barre(30), { regularMarketPrice: null })), null);
  assert.equal(leggiGrafico({}), null);
  assert.equal(leggiGrafico({ chart: { result: null, error: { code: "Not Found" } } }), null);
});

// ---------- le risposte del Worker ----------
const risposta = (stato, corpo) => new Response(JSON.stringify(corpo), { status: stato, headers: { "Content-Type": "application/json" } });
const finto = (fn) => { const f = async (url, init) => { f.chiamate.push({ url: String(url), init }); return fn(url, init); }; f.chiamate = []; return f; };
const chiedi = (y, percorso, headers) => y.rispondi(new Request("https://gerico.example" + percorso, { headers }));

test("rispondi: testo vuoto o simbolo sbagliato, 400 senza chiamare Yahoo", async () => {
  const f = finto(() => risposta(200, RICERCA)), y = creaYahoo({ fetch: f });
  const a = await chiedi(y, "/api/cerca?q=");
  assert.equal(a.status, 400);
  assert.deepEqual(await a.json(), { errore: "testo" });
  const b = await chiedi(y, "/api/titolo?s=..%2Fx");
  assert.equal(b.status, 400);
  assert.deepEqual(await b.json(), { errore: "simbolo" });
  assert.equal(f.chiamate.length, 0);
});

test("rispondi: la ricerca arriva da Yahoo con un User-Agent e si tiene in memoria", async () => {
  const f = finto(() => risposta(200, RICERCA)), y = creaYahoo({ fetch: f });
  const a = await chiedi(y, "/api/cerca?q=eni");
  assert.equal(a.status, 200);
  assert.equal(a.headers.get("Cache-Control"), "private, max-age=600");
  const d = await a.json();
  assert.equal(d.q, "eni");
  assert.equal(d.risultati[0].s, "ENI.MI");
  assert.match(f.chiamate[0].url, /^https:\/\/query[12]\.finance\.yahoo\.com\/v1\/finance\/search\?.*q=eni/);
  assert.ok(new Headers(f.chiamate[0].init.headers).get("User-Agent"));
  await chiedi(y, "/api/cerca?q=ENI");
  assert.equal(f.chiamate.length, 1);
});

test("rispondi: dopo un 429 di Yahoo si aspetta un minuto", async () => {
  let t = 1e12;
  const f = finto(() => risposta(429, {})), y = creaYahoo({ fetch: f, ora: () => t });
  const a = await chiedi(y, "/api/cerca?q=eni");
  assert.equal(a.status, 503);
  assert.deepEqual(await a.json(), { errore: "pausa" });
  const b = await chiedi(y, "/api/titolo?s=ENI.MI");
  assert.equal(b.status, 503);
  assert.equal(f.chiamate.length, 1);
  t += 61000;
  await chiedi(y, "/api/cerca?q=enel");
  assert.equal(f.chiamate.length, 2);
});

test("rispondi: Yahoo che sbaglia, non risponde o tarda dà 502", async () => {
  const rotto = creaYahoo({ fetch: finto(() => { throw new Error("rete"); }) });
  assert.equal((await chiedi(rotto, "/api/cerca?q=eni")).status, 502);
  const errore = creaYahoo({ fetch: finto(() => risposta(500, {})) });
  const e = await chiedi(errore, "/api/cerca?q=eni");
  assert.equal(e.status, 502);
  assert.deepEqual(await e.json(), { errore: "yahoo" });
  const lento = creaYahoo({ attesa: 50, fetch: finto((url, init) => new Promise((_, no) => init.signal.addEventListener("abort", () => no(new Error("tardi"))))) });
  assert.equal((await chiedi(lento, "/api/cerca?q=eni")).status, 502);
});

test("rispondi: i prezzi di un titolo, e 404 se Yahoo non lo conosce", async () => {
  const y = creaYahoo({ fetch: finto(() => risposta(200, grafico(barre(30)))) });
  const a = await chiedi(y, "/api/titolo?s=ENI.MI");
  assert.equal(a.status, 200);
  assert.equal(a.headers.get("Cache-Control"), "private, max-age=120");
  const d = await a.json();
  assert.equal(d.p, 15);
  assert.equal(d.c, 1.35);
  const z = creaYahoo({ fetch: finto(() => risposta(404, { chart: { result: null, error: { code: "Not Found" } } })) });
  const b = await chiedi(z, "/api/titolo?s=NONC");
  assert.equal(b.status, 404);
  assert.deepEqual(await b.json(), { errore: "non-trovato" });
});

test("rispondi: un altro sito non può usare la ricerca dal browser", async () => {
  const f = finto(() => risposta(200, RICERCA)), y = creaYahoo({ fetch: f });
  const a = await chiedi(y, "/api/cerca?q=eni", { "Sec-Fetch-Site": "cross-site" });
  assert.equal(a.status, 403);
  assert.equal(f.chiamate.length, 0);
  assert.equal((await chiedi(y, "/api/cerca?q=eni", { "Sec-Fetch-Site": "same-origin" })).status, 200);
});
