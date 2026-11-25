// GERICO: il service worker del sito installabile. Tiene sul dispositivo una copia di quello che si è già letto, per
// riaprirlo senza connessione. Non manda niente a nessuno e non tocca mai gli account (/api) né il gestionale (/admin).
//  - pagine: prima la rete, la copia solo se la rete non c'è (o non risponde in pochi secondi e una copia c'è)
//  - dati (/data): prima la rete, poi la copia
//  - file del sito con la versione (?v=) e caratteri: la copia, che non cambia mai (una versione nuova ha un indirizzo nuovo)
//  - immagini: la copia se c'è, altrimenti la rete (e se ne tiene un numero limitato)
const V = "20261125-1";
const STATICI = "gerico-statici-" + V, CARATTERI = "gerico-caratteri", PAGINE = "gerico-pagine", DATI = "gerico-dati", IMMAGINI = "gerico-immagini";
const TENUTE = [STATICI, CARATTERI, PAGINE, DATI, IMMAGINI];
const PRIMA = ["/", "/storia", "/offline.html", "/assets/css/gerico.css?v=" + V, "/assets/js/common.js?v=" + V, "/assets/js/home.js?v=" + V, "/assets/js/story.js?v=" + V];
// le pagine dell'app sono gusci: la storia è nell'indirizzo (?id=), il contenuto nei dati
const GUSCI = new Set(["/", "/storia", "/terminal", "/come-funziona", "/privacy", "/glossario", "/collabora"]);
const MAX = { [PAGINE]: 80, [IMMAGINI]: 150 };

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATICI).then((c) => Promise.all(PRIMA.map((u) =>
    fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? c.put(chiave(new URL(u, self.location.origin)), r) : null)).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("gerico-") && !TENUTE.includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// l'indirizzo con cui si tiene una pagina: senza .html, senza index, e per i gusci senza la parte dopo il ?
function chiave(u) {
  let p = u.pathname.replace(/\/index(\.html)?$/, "/").replace(/\.html$/, "");
  if (p === "") p = "/";
  if (GUSCI.has(p)) return new Request(u.origin + p);
  return new Request(u.origin + p + (u.pathname.startsWith("/data/") ? "" : u.search));
}

async function tieni(nome, req, res) {
  try {
    const c = await caches.open(nome);
    await c.put(req, res);
    const max = MAX[nome];
    if (max) {
      const ks = await c.keys();
      for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]);
    }
  } catch (e) { /* lo spazio è finito o la copia non si può fare: si va avanti senza */ }
}

const buona = (r) => r && r.ok && r.type === "basic" && r.status === 200;

async function rete(req, attesa) {
  if (!attesa) return fetch(req);
  let t;
  const tempo = new Promise((_, no) => { t = setTimeout(() => no(new Error("tempo")), attesa); });
  try { return await Promise.race([fetch(req), tempo]); } finally { clearTimeout(t); }
}

async function pagina(e, u) {
  const k = chiave(u);
  const copia = await caches.match(k);
  try {
    const r = await rete(e.request, copia ? 4000 : 0);
    if (buona(r) && !r.redirected) e.waitUntil(tieni(PAGINE, k, r.clone()));
    return r;
  } catch (err) {
    if (copia) return copia;
    return (await caches.match(new Request(u.origin + "/offline"))) || Response.error();
  }
}

async function dati(e, u) {
  const k = chiave(u);
  try {
    const copia = await caches.match(k);
    const r = await rete(e.request, copia ? 6000 : 0);
    if (buona(r)) e.waitUntil(tieni(DATI, k, r.clone()));
    return r;
  } catch (err) {
    return (await caches.match(k)) || Response.error();
  }
}

async function fisso(e, nome) {
  const c = await caches.match(e.request);
  if (c) return c;
  const r = await fetch(e.request);
  if (buona(r)) e.waitUntil(tieni(nome, e.request, r.clone()));
  return r;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  const p = u.pathname;
  if (p.startsWith("/api/") || p === "/admin" || p.startsWith("/admin/") || p.startsWith("/audio/") || p === "/sw.js" || req.headers.has("range")) return;
  if (req.mode === "navigate" || req.destination === "document" || p.endsWith(".html") || p.startsWith("/s/") || p.startsWith("/tema/") || GUSCI.has(p) || /^\/(archivio|glossario)/.test(p)) {
    e.respondWith(pagina(e, u));
    return;
  }
  if (p.startsWith("/data/")) { e.respondWith(dati(e, u)); return; }
  if (p.startsWith("/assets/fonts/")) { e.respondWith(fisso(e, CARATTERI)); return; }
  if (p.startsWith("/assets/") && u.searchParams.has("v")) { e.respondWith(fisso(e, STATICI)); return; }
  // l'immagine del giorno per Instagram cambia durante il giorno: sempre dalla rete
  if ((p.startsWith("/img/") && !p.startsWith("/img/social/")) || p.startsWith("/assets/img/")) e.respondWith(fisso(e, IMMAGINI));
});
