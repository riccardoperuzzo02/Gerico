// Prove del motore della ricerca del Terminal (site/assets/js/ricerca.js), caricato come nel browser con un G finto.
// node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const CODICE = fs.readFileSync(new URL("../site/assets/js/ricerca.js", import.meta.url), "utf8");
// come G.cerca.norm di common.js: senza accenti, minuscolo
const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const carica = () => {
  const G = { L: (it) => it, en: false, tn: (x) => x, cerca: { norm }, dayOnly: (d) => d };
  const ctx = vm.createContext({ window: { G }, console });
  vm.runInContext(CODICE, ctx);
  return G;
};

const titolo = (s, t, n, w, p = 10, c = 0.5) => ({ s, t, n, w, p, c, x: "Energy" });
const DATI = {
  indici: {
    ITA: { index: "FTSE MIB", cur: "EUR", items: [titolo("ENEL.MI", "ENEL", "Enel", 9), titolo("ENI.MI", "ENI", "Eni", 5.1), titolo("G.MI", "G", "Generali", 4)] },
    USA: { index: "S&P 500", cur: "USD", items: [titolo("AAPL", "AAPL", "Apple", 8.3), titolo("V", "V", "Visa", 1), titolo("PHX", "PHX", "Phoenix Corp", 0.1), titolo("TD", "TD", "Toronto Bank", 0.2)] },
    FRA: { index: "CAC 40", cur: "EUR", items: [titolo("GLE.PA", "GLE", "Société Générale", 1.2)] }
  },
  quotes: { groups: [
    { key: "indici", label: "Indici", items: [{ sym: "^GSPC", name: "S&P 500", last: 7182, chg: -0.25 }] },
    { key: "valute", label: "Valute", items: [{ sym: "EURUSD=X", name: "EUR/USD", last: 1.098, chg: 0.19 }] },
    { key: "materie", label: "Materie prime", items: [{ sym: "GC=F", name: "Oro", last: 3900, chg: -0.5 }] },
    { key: "tassi", label: "Rendimenti Usa", items: [{ sym: "^TNX", name: "Treasury 10 anni", last: 4.3, bp: -2 }] }
  ] },
  societari: { items: [{ kind: "cedole", date: "2026-12-03", sym: "ENI.MI", name: "Eni", code: "ITA", index: "FTSE MIB" }] },
  agenda: [{ ev: "Fiducia dei consumatori Gfk", cur: "EUR", date: "2026-11-26", time: "08:00", imp: "basso" }],
  glossario: { voci: [{ id: "spread", it: { t: "Spread", d: "La differenza tra i rendimenti.", alt: ["spread Btp-Bund"] }, en: { t: "Spread", d: "The difference." } }] }
};
// gli oggetti fatti nel vm hanno i prototipi di un altro mondo: si confrontano dopo un giro in JSON
const cerca = (q, dati = DATI) => { const G = carica(); return JSON.parse(JSON.stringify(G.ricercaTrova(G.ricercaIndice(dati), q))); };

test("«eni»: Eni del FTSE MIB in cima, con prezzo, variazione e punteggio", () => {
  const r = cerca("eni");
  assert.deepEqual(r.titoli[0].rif, { code: "ITA", sym: "ENI.MI" });
  assert.match(r.titoli[0].sotto, /ENI · FTSE MIB/);
  assert.equal(r.titoli[0].valore, 10);
  assert.equal(r.titoli[0].cambio, 0.5);
  assert.equal(r.titoli[0].p, 1000); // il ticker di Eni è proprio ENI
  assert.equal(r.titoli.some((x) => x.nome === "Enel"), false);
});

test("fino a tre lettere niente pezzi in mezzo alle parole, da quattro sì", () => {
  assert.equal(cerca("eni").titoli.some((x) => x.nome === "Phoenix Corp"), false);
  const o = cerca("oro");
  assert.equal(o.titoli.length, 0);
  assert.equal(o.strumenti[0].rif.sym, "GC=F");
  assert.ok(o.strumenti[0].p >= 300);
  assert.ok(cerca("enix").titoli.some((x) => x.nome === "Phoenix Corp"));
  assert.equal(cerca("toro").titoli[0].nome, "Toronto Bank");
});

test("il ticker esatto va in cima", () => {
  assert.equal(cerca("AAPL").titoli[0].nome, "Apple");
});

test("senza accenti si trova anche Société Générale", () => {
  assert.equal(cerca("societe generale").titoli[0].nome, "Société Générale");
});

test("eurusd ed eur/usd trovano il cambio, oro l'oro", () => {
  assert.equal(cerca("eurusd").strumenti[0].rif.sym, "EURUSD=X");
  assert.equal(cerca("eur/usd").strumenti[0].rif.sym, "EURUSD=X");
  assert.equal(cerca("oro").strumenti[0].rif.sym, "GC=F");
});

test("i tassi dicono la variazione in punti base", () => {
  const r = cerca("treasury");
  assert.equal(r.strumenti[0].rif.sym, "^TNX");
  assert.equal(r.strumenti[0].bp, true);
  assert.equal(r.strumenti[0].cambio, -2);
});

test("sezioni, glossario, cedole e agenda", () => {
  assert.equal(cerca("agenda").sezioni[0].rif.cmd, "AGENDA");
  assert.equal(cerca("spread").glossario[0].rif.gl, "spread");
  const e = cerca("eni");
  assert.deepEqual(e.societa[0].rif, { so: "cedole", sym: "ENI.MI" });
  assert.equal(cerca("gfk").agenda[0].nome, "Fiducia dei consumatori Gfk");
});

test("ogni parola deve esserci", () => {
  assert.equal(cerca("eni generali").titoli.length, 0);
});

test("al massimo 6 titoli e 4 per gli altri gruppi", () => {
  const molti = JSON.parse(JSON.stringify(DATI));
  molti.indici.ITA.items = Array.from({ length: 10 }, (_, i) => titolo("ALF" + i + ".MI", "ALF" + i, "Alfa " + i, 10 - i));
  molti.glossario.voci = Array.from({ length: 6 }, (_, i) => ({ id: "alfa" + i, it: { t: "Alfa " + i, d: "." }, en: { t: "Alfa " + i, d: "." } }));
  const r = cerca("alfa", molti);
  assert.equal(r.titoli.length, 6);
  assert.equal(r.glossario.length, 4);
  assert.equal(r.titoli[0].nome, "Alfa 0");
});

test("con una lettera sola solo i ticker esatti", () => {
  const v = cerca("V");
  assert.deepEqual(v.titoli.map((x) => x.nome), ["Visa"]);
  assert.equal(v.strumenti.length + v.glossario.length + v.sezioni.length + v.societa.length + v.agenda.length, 0);
  assert.equal(cerca("e").titoli.length, 0);
});

test("le parole cercate tornano indietro per segnarle", () => {
  assert.deepEqual(cerca("Société  Générale").ws, ["societe", "generale"]);
});

test("notizie: fino a tre lettere solo parole che cominciano così, nel titolo o nei temi", () => {
  const G = carica();
  const storie = [
    { r: { t: "gas: descalzi teme difficolta in inverno", g: "eni energia", s: "" } },
    { r: { t: "l'aquila: respinto il ricorso dei genitori", g: "italia", s: "" } },
    { r: { t: "francia: macron valuta una «regola d'oro»", g: "francia", s: "" } },
    { r: { t: "spagna: sanchez annuncia la proroga", g: "spagna", s: "" } }
  ];
  const tieni = (q) => JSON.parse(JSON.stringify(G.ricercaNotizie(storie, q))).map((h) => h.r.t.slice(0, 6));
  assert.deepEqual(tieni("eni"), ["gas: d"]);
  assert.deepEqual(tieni("oro"), ["franci"]);
  assert.deepEqual(tieni("genitori"), ["l'aqui"]);
});
