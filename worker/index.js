// GERICO: il Worker. Le pagine e i dati del sito restano file statici (cartella site/, serviti da Cloudflare senza
// passare di qui). Il Worker risponde solo sotto /api/ (account, preferenze, conteggi delle visite, errori) e a /admin,
// il gestionale di Riccardo. Niente librerie: WebCrypto, fetch e le API di Cloudflare (D1 nel binding DB).
//
// Segreti (impostazioni del Worker su Cloudflare, mai nel repository):
//   ADMIN_TOKEN  il codice che Riccardo scrive una volta in /admin, dopo l'accesso con la sua passkey: da lì il suo
//                account è l'amministratore e il segreto si può togliere
//   STATS_SALT   la chiave da cui nasce il sale di ogni giorno per contare i visitatori unici (hash dell'IP che non
//                si può rifare il giorno dopo); senza, i visitatori unici non si contano
import SCHEMA from "./schema.sql";
import ADMIN_HTML from "./admin.html";
import { verificaIscrizione, verificaAccesso, ErrorePasskey, ALGORITMI, b64u, casuali, sha256 } from "./webauthn.js";

const COOKIE = "__Host-gerico_s";
const SESSIONE_MS = 60 * 864e5;      // una sessione dura 60 giorni e si rinnova da sola quando ne mancano meno di 30
const SFIDA_MS = 5 * 60 * 1000;       // una sfida delle passkey vale 5 minuti, una volta sola
const enc = new TextEncoder();

class Fallito extends Error {
  constructor(stato, codice) { super(codice); this.stato = stato; this.codice = codice; }
}

// ---------- risposte ----------
const BASE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'"
};
const json = (dati, stato = 200, extra) => {
  const h = new Headers(BASE);
  h.set("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(extra || {})) h.append(k, v);
  return new Response(JSON.stringify(dati), { status: stato, headers: h });
};
const vuota = () => new Response(null, { status: 204, headers: BASE });
const cookieSessione = (tok) => `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSIONE_MS / 1000}`;
const cookieVia = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const leggiCookie = (request, nome) => {
  for (const p of (request.headers.get("Cookie") || "").split(/;\s*/)) {
    const i = p.indexOf("=");
    if (i > 0 && p.slice(0, i) === nome) return p.slice(i + 1);
  }
  return "";
};

// ---------- tempo, hash, testi ----------
const fGiorno = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
const giornoRoma = (t) => fGiorno.format(new Date(t));
// il giorno n giorni prima o dopo («2026-11-10», -1 → «2026-11-09»): conti sulle date, mai sulle ore (l'ora legale)
const spostaGiorno = (g, n) => new Date(Date.parse(g + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sha256hex = async (s) => hex(await sha256(enc.encode(s)));
// un testo che arriva da chi legge: niente caratteri di controllo o invisibili, spazi semplici, lunghezza giusta
const pulisci = (s) => (typeof s === "string" ? s.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g, "").replace(/\s+/g, " ").trim() : "");
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"_]{1,180}\.[A-Za-z]{2,24}$/;

// il sale di oggi per gli hash dell'IP: nasce da STATS_SALT e dalla data, non si salva da nessuna parte e domani è un altro.
// Senza STATS_SALT un sale casuale di questo processo: basta per i limiti dei tentativi, non per contare i visitatori unici
let saleCache = { giorno: "", chiave: null };
let saleProcesso = null; // casuale, fatto alla prima richiesta (fuori da una richiesta i numeri casuali non si possono chiedere)
async function saleDi(env, giorno) {
  if (saleCache.giorno === giorno && saleCache.chiave) return saleCache.chiave;
  if (!env.STATS_SALT && !saleProcesso) saleProcesso = casuali(32);
  const segreto = env.STATS_SALT ? enc.encode(env.STATS_SALT) : saleProcesso;
  const k = await crypto.subtle.importKey("raw", segreto, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sale = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("gerico-" + giorno)));
  saleCache = { giorno, chiave: sale };
  return sale;
}
async function impronta(request, env, giorno, conAgent) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = conAgent ? request.headers.get("User-Agent") || "" : "";
  const sale = await saleDi(env, giorno);
  const resto = enc.encode("|" + ip + "|" + ua.slice(0, 200));
  const dati = new Uint8Array(sale.length + resto.length);
  dati.set(sale, 0);
  dati.set(resto, sale.length);
  return hex(await sha256(dati)).slice(0, 32);
}

// ---------- schema: le migrazioni di schema.sql, applicate una volta ----------
const MIGRAZIONI = (() => {
  const out = [];
  let cur = null;
  for (const riga of SCHEMA.split("\n")) {
    const m = /^--\s*migrazione\s+(\d+)/i.exec(riga);
    if (m) { cur = { n: Number(m[1]), sql: "" }; out.push(cur); continue; }
    if (cur && !/^\s*--/.test(riga)) cur.sql += riga + "\n";
  }
  return out.map((x) => ({ n: x.n, istruzioni: x.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean) }));
})();
let pronto = null;
const prepara = (db) => pronto || (pronto = (async () => {
  await db.prepare("CREATE TABLE IF NOT EXISTS versione (n INTEGER PRIMARY KEY, applicata INTEGER NOT NULL)").run();
  const r = await db.prepare("SELECT MAX(n) AS n FROM versione").first();
  const at = (r && r.n) || 0;
  for (const m of MIGRAZIONI) {
    if (m.n <= at) continue;
    await db.batch([...m.istruzioni.map((s) => db.prepare(s)), db.prepare("INSERT OR IGNORE INTO versione (n, applicata) VALUES (?1, ?2)").bind(m.n, Date.now())]);
  }
})().catch((e) => { pronto = null; throw e; }));

// ---------- contesto di una richiesta ----------
function contesto(request, env, ctx) {
  const url = new URL(request.url);
  const c = {
    request, env, ctx, url, db: env.DB, rpId: url.hostname, origine: url.origin, ora: Date.now(), _s: undefined,
    async corpo(max = 20000) {
      const t = await request.text();
      if (t.length > max) throw new Fallito(413, "troppo-grande");
      try { const v = JSON.parse(t); if (v && typeof v === "object" && !Array.isArray(v)) return v; } catch (e) { /* sotto */ }
      throw new Fallito(400, "json");
    },
    // al massimo n richieste al minuto per questo indirizzo (un hash che dura un minuto, mai l'IP) e per questa azione
    async limite(azione, n, globale) {
      const minuto = Math.floor(c.ora / 60000);
      const chiave = globale ? azione + ":tutti" : azione + ":" + (await impronta(request, env, giornoRoma(c.ora), false));
      const r = await c.db.prepare("INSERT INTO limiti (chiave, minuto, n) VALUES (?1, ?2, 1) ON CONFLICT (chiave, minuto) DO UPDATE SET n = n + 1 RETURNING n").bind(chiave, minuto).first();
      if (r && r.n > n) throw new Fallito(429, "troppi-tentativi");
    },
    async sessione() {
      if (c._s !== undefined) return c._s;
      c._s = null;
      const tok = leggiCookie(request, COOKIE);
      if (!/^[A-Za-z0-9_-]{43}$/.test(tok)) return null;
      const hash = await sha256hex(tok);
      const r = await c.db.prepare("SELECT s.scade, s.creata AS sc, u.* FROM sessioni s JOIN utenti u ON u.id = s.utente WHERE s.hash = ?1").bind(hash).first();
      if (!r) return null;
      if (r.scade < c.ora) { await c.db.prepare("DELETE FROM sessioni WHERE hash = ?1").bind(hash).run(); return null; }
      c._s = { tok, hash, scade: r.scade, utente: r };
      return c._s;
    },
    async serveAccesso() {
      const s = await c.sessione();
      if (!s) throw new Fallito(401, "senza-accesso");
      return s;
    },
    async serveAdmin() {
      const s = await c.sessione();
      if (!s || !s.utente.admin) throw new Fallito(404, "non-trovato");
      return s;
    }
  };
  return c;
}
// le richieste che cambiano dati arrivano solo dalle pagine di GERICO: stessa origine, oppure (browser che non mandano
// Origin) Sec-Fetch-Site uguale a same-origin
const stessaOrigine = (c) => {
  const o = c.request.headers.get("Origin");
  if (o) return o === c.origine;
  return c.request.headers.get("Sec-Fetch-Site") === "same-origin";
};

const profilo = (u) => {
  let prefs = {};
  try { prefs = JSON.parse(u.prefs || "{}") || {}; } catch (e) { prefs = {}; }
  return { nome: u.nome, email: u.email || "", creato: u.creato, ultimo: u.ultimo, admin: !!u.admin, prefs };
};
async function nuovaSessione(c, utente) {
  const tok = b64u(casuali(32));
  const st = c.db.prepare("INSERT INTO sessioni (hash, utente, creata, scade) VALUES (?1, ?2, ?3, ?4)").bind(await sha256hex(tok), utente, c.ora, c.ora + SESSIONE_MS);
  return { tok, st };
}
async function prendiSfida(c, id, tipo) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(id)) throw new Fallito(400, "sfida");
  const r = await c.db.prepare("DELETE FROM sfide WHERE id = ?1 RETURNING sfida, tipo, dati, scade").bind(id).first();
  if (!r || r.tipo !== tipo || r.scade < c.ora) throw new Fallito(400, "sfida-scaduta");
  return r;
}
const passkey = async (fn) => {
  try { return await fn(); } catch (e) { if (e instanceof ErrorePasskey) throw new Fallito(400, "passkey-" + e.codice); throw e; }
};

// ---------- account ----------
const senzaAdmin = async (c) => !!c.env.ADMIN_TOKEN && !(await c.db.prepare("SELECT 1 AS x FROM utenti WHERE admin = 1 LIMIT 1").first());
async function io(c) {
  const s = await c.sessione();
  // «avvio»: c'è ADMIN_TOKEN e ancora nessun amministratore (lo chiede solo il gestionale)
  const avvio = c.url.searchParams.has("admin") ? await senzaAdmin(c) : undefined;
  if (!s) {
    // un cookie che non vale più si toglie
    return json({ attivo: true, utente: null, avvio }, 200, leggiCookie(c.request, COOKIE) ? { "Set-Cookie": cookieVia() } : undefined);
  }
  const extra = {};
  const st = [];
  if (s.scade - c.ora < SESSIONE_MS / 2) {
    st.push(c.db.prepare("UPDATE sessioni SET scade = ?1 WHERE hash = ?2").bind(c.ora + SESSIONE_MS, s.hash));
    extra["Set-Cookie"] = cookieSessione(s.tok);
  }
  if (c.ora - s.utente.ultimo > 3600000) {
    st.push(c.db.prepare("UPDATE utenti SET ultimo = ?1 WHERE id = ?2").bind(c.ora, s.utente.id));
    s.utente.ultimo = c.ora;
  }
  if (st.length) await c.db.batch(st);
  return json({ attivo: true, utente: profilo(s.utente), avvio }, 200, extra);
}

async function registraOpzioni(c) {
  await c.limite("registra", 10);
  const b = await c.corpo(2000);
  const nome = pulisci(b.nome), email = pulisci(b.email || "").toLowerCase();
  if (!nome || nome.length > 40) throw new Fallito(400, "nome");
  if (email && (email.length > 160 || !EMAIL.test(email))) throw new Fallito(400, "email");
  const utente = b64u(casuali(16)), sfida = b64u(casuali(32)), id = b64u(casuali(16));
  await c.db.prepare("INSERT INTO sfide (id, sfida, tipo, dati, scade) VALUES (?1, ?2, 'registra', ?3, ?4)")
    .bind(id, sfida, JSON.stringify({ nome, email, utente }), c.ora + SFIDA_MS).run();
  return json({
    sfida: id,
    publicKey: {
      challenge: sfida,
      rp: { name: "GERICO", id: c.rpId },
      user: { id: utente, name: email || nome, displayName: nome },
      pubKeyCredParams: ALGORITMI.map((alg) => ({ type: "public-key", alg })),
      timeout: SFIDA_MS,
      attestation: "none",
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" }
    }
  });
}

async function registraVerifica(c) {
  await c.limite("registra-ok", 10);
  const b = await c.corpo(60000);
  const s = await prendiSfida(c, b.sfida, "registra");
  const v = await passkey(() => verificaIscrizione(b.credenziale, { sfida: s.sfida, origine: c.origine, rpId: c.rpId }));
  if (await c.db.prepare("SELECT 1 AS x FROM credenziali WHERE id = ?1").bind(v.id).first()) throw new Fallito(409, "passkey-esiste");
  const d = JSON.parse(s.dati);
  const { tok, st } = await nuovaSessione(c, d.utente);
  await c.db.batch([
    c.db.prepare("INSERT INTO utenti (id, nome, email, admin, creato, ultimo, prefs) VALUES (?1, ?2, ?3, 0, ?4, ?4, '{}')").bind(d.utente, d.nome, d.email || null, c.ora),
    c.db.prepare("INSERT INTO credenziali (id, utente, chiave, alg, contatore, trasporti, sincronizzata, creata, usata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)")
      .bind(v.id, d.utente, JSON.stringify(v.jwk), v.alg, v.contatore, JSON.stringify(v.trasporti), v.sincronizzata ? 1 : 0, c.ora),
    st
  ]);
  const u = await c.db.prepare("SELECT * FROM utenti WHERE id = ?1").bind(d.utente).first();
  return json({ utente: profilo(u), nuovo: true }, 200, { "Set-Cookie": cookieSessione(tok) });
}

async function accediOpzioni(c) {
  await c.limite("accedi", 20);
  const sfida = b64u(casuali(32)), id = b64u(casuali(16));
  await c.db.prepare("INSERT INTO sfide (id, sfida, tipo, dati, scade) VALUES (?1, ?2, 'accedi', '{}', ?3)").bind(id, sfida, c.ora + SFIDA_MS).run();
  return json({ sfida: id, publicKey: { challenge: sfida, rpId: c.rpId, timeout: SFIDA_MS, userVerification: "required", allowCredentials: [] } });
}

async function accediVerifica(c) {
  await c.limite("accedi-ok", 20);
  const b = await c.corpo(20000);
  const s = await prendiSfida(c, b.sfida, "accedi");
  const cred = b.credenziale || {};
  if (typeof cred.id !== "string" || !/^[A-Za-z0-9_-]{16,1400}$/.test(cred.id)) throw new Fallito(400, "passkey-credenziale");
  const k = await c.db.prepare("SELECT id, utente, chiave, alg, contatore FROM credenziali WHERE id = ?1").bind(cred.id).first();
  if (!k) throw new Fallito(404, "passkey-sconosciuta");
  const uh = cred.response && cred.response.userHandle;
  if (uh && uh !== k.utente) throw new Fallito(400, "passkey-utente");
  const v = await passkey(() => verificaAccesso(cred, { sfida: s.sfida, origine: c.origine, rpId: c.rpId, chiave: { alg: k.alg, jwk: JSON.parse(k.chiave) } }));
  // il contatore delle firme: le passkey sincronizzate (iCloud, Google) tengono sempre 0; le chiavi fisiche salgono a ogni
  // uso. Si tiene il più alto visto, senza bloccare chi ha un dispositivo che lo azzera: un account di un sito di notizie
  // non vale il rischio di lasciare fuori qualcuno per sempre
  const { tok, st } = await nuovaSessione(c, k.utente);
  await c.db.batch([
    c.db.prepare("UPDATE credenziali SET contatore = MAX(contatore, ?1), usata = ?2 WHERE id = ?3").bind(v.contatore, c.ora, k.id),
    c.db.prepare("UPDATE utenti SET ultimo = ?1 WHERE id = ?2").bind(c.ora, k.utente),
    st
  ]);
  const u = await c.db.prepare("SELECT * FROM utenti WHERE id = ?1").bind(k.utente).first();
  return json({ utente: profilo(u) }, 200, { "Set-Cookie": cookieSessione(tok) });
}

async function esci(c) {
  const s = await c.sessione();
  if (s) await c.db.prepare("DELETE FROM sessioni WHERE hash = ?1").bind(s.hash).run();
  return json({ uscito: true }, 200, { "Set-Cookie": cookieVia() });
}

// cancellare l'account cancella tutto, subito: l'account, le sue passkey (le chiavi pubbliche), le sessioni, le preferenze
async function cancella(c) {
  const s = await c.serveAccesso();
  const id = s.utente.id;
  const creds = (await c.db.prepare("SELECT id FROM credenziali WHERE utente = ?1").bind(id).all()).results || [];
  await c.db.batch([
    c.db.prepare("DELETE FROM credenziali WHERE utente = ?1").bind(id),
    c.db.prepare("DELETE FROM sessioni WHERE utente = ?1").bind(id),
    c.db.prepare("DELETE FROM utenti WHERE id = ?1").bind(id)
  ]);
  return json({ cancellato: true, passkey: creds.map((r) => r.id) }, 200, { "Set-Cookie": cookieVia() });
}

// le preferenze che seguono l'account: temi seguiti, paese, interessi (profilo della parte 5)
const SLUG = /^[a-z0-9-]{1,32}$/;
const INTERESSI = { sezioni: 12, temi: 40, mercati: 12, lettura: 6, terminal: 4 };
function validaPreferenze(b) {
  const out = {};
  if ("temi" in b) {
    if (!Array.isArray(b.temi) || b.temi.length > 300) throw new Fallito(400, "temi");
    const visti = new Set();
    out.temi = [];
    for (const t of b.temi) {
      const x = pulisci(t);
      if (!x || x.length > 80) throw new Fallito(400, "temi");
      if (!visti.has(x)) { visti.add(x); out.temi.push(x); }
    }
  }
  if ("paese" in b) {
    if (typeof b.paese !== "string" || !/^[A-Z]{2}$/.test(b.paese)) throw new Fallito(400, "paese");
    out.paese = b.paese;
  }
  if ("interessi" in b) {
    const i = b.interessi;
    if (!i || typeof i !== "object" || Array.isArray(i)) throw new Fallito(400, "interessi");
    const o = {};
    for (const [k, v] of Object.entries(i)) {
      if (k === "fatto") { o.fatto = v === true; continue; }
      if (!(k in INTERESSI)) throw new Fallito(400, "interessi");
      if (!Array.isArray(v) || v.length > INTERESSI[k]) throw new Fallito(400, "interessi");
      const lista = k === "temi" ? v.map((t) => pulisci(t)).filter((t) => t && t.length <= 80) : v.filter((x) => typeof x === "string" && SLUG.test(x));
      if (lista.length !== v.length) throw new Fallito(400, "interessi");
      o[k] = Array.from(new Set(lista));
    }
    out.interessi = o;
  }
  return out;
}
async function preferenze(c) {
  const s = await c.serveAccesso();
  const nuove = validaPreferenze(await c.corpo(30000));
  const prefs = Object.assign(profilo(s.utente).prefs, nuove, { aggiornate: c.ora });
  const testo = JSON.stringify(prefs);
  if (testo.length > 30000) throw new Fallito(413, "troppo-grande");
  await c.db.prepare("UPDATE utenti SET prefs = ?1 WHERE id = ?2").bind(testo, s.utente.id).run();
  return json({ prefs });
}

// i tuoi dati, tutti: per vederli nel menu (?vedi=1) o scaricarli in un file
async function mieiDati(c) {
  const s = await c.serveAccesso();
  const u = s.utente, p = profilo(u);
  const [cr, se] = await c.db.batch([
    c.db.prepare("SELECT alg, sincronizzata, trasporti, creata, usata, chiave FROM credenziali WHERE utente = ?1 ORDER BY creata").bind(u.id),
    c.db.prepare("SELECT creata, scade FROM sessioni WHERE utente = ?1 AND scade > ?2 ORDER BY creata").bind(u.id, c.ora)
  ]);
  const iso = (t) => (t ? new Date(t).toISOString() : null);
  const dati = {
    sito: c.origine,
    scaricati: iso(c.ora),
    account: { nome: p.nome, email: p.email || null, iscritto: iso(p.creato), ultimoAccesso: iso(p.ultimo) },
    preferenze: { temiSeguiti: p.prefs.temi || [], paese: p.prefs.paese || null, interessi: p.prefs.interessi || null, aggiornate: iso(p.prefs.aggiornate) },
    passkey: (cr.results || []).map((r) => {
      let tr = [];
      try { tr = JSON.parse(r.trasporti); } catch (e) { tr = []; }
      return { creata: iso(r.creata), usata: iso(r.usata), algoritmo: r.alg === -7 ? "ES256" : "RS256", sincronizzata: !!r.sincronizzata, trasporti: tr, chiavePubblica: JSON.parse(r.chiave) };
    }),
    sessioni: (se.results || []).map((r) => ({ iniziata: iso(r.creata), scade: iso(r.scade) })),
    nota: "Sono tutti i dati che GERICO conserva sul tuo account. Le visite e gli errori delle pagine si contano senza legarli a te."
  };
  const extra = c.url.searchParams.get("vedi") ? undefined : { "Content-Disposition": 'attachment; filename="gerico-i-miei-dati.json"' };
  return json(dati, 200, extra);
}

// ---------- conteggi: visite e errori delle pagine, senza cookie e senza IP ----------
const PAGINE = new Set(["prima-pagina", "storia", "terminal", "come-funziona", "privacy"]);
const DISPOSITIVI = new Set(["telefono", "tablet", "computer"]);
// un tetto per indirizzo e minuto, tenuto solo nella memoria di questo processo: nessuna scrittura in più nel database
const finestre = new Map();
const tetto = (chiave, n) => {
  const m = Math.floor(Date.now() / 60000);
  if (finestre.size > 5000) finestre.clear();
  const f = finestre.get(chiave);
  if (!f || f.m !== m) { finestre.set(chiave, { m, n: 1 }); return true; }
  f.n += 1;
  return f.n <= n;
};
let ultimaPulizia = 0;
async function visita(c) {
  const b = await c.corpo(1000);
  const p = String(b.p || ""), paese = String(b.c || ""), lingua = String(b.l || ""), disp = String(b.d || "");
  if (!PAGINE.has(p) || !/^[A-Z]{2}$/.test(paese) || !["it", "en"].includes(lingua) || !DISPOSITIVI.has(disp)) throw new Fallito(400, "visita");
  const giorno = giornoRoma(c.ora);
  const chi = await impronta(c.request, c.env, giorno, true);
  if (!tetto("v" + chi, 60)) return vuota();
  const st = [c.db.prepare("INSERT INTO visite (giorno, pagina, paese, lingua, dispositivo, n) VALUES (?1, ?2, ?3, ?4, ?5, 1) ON CONFLICT (giorno, pagina, paese, lingua, dispositivo) DO UPDATE SET n = n + 1")
    .bind(giorno, p, paese, lingua, disp)];
  if (c.env.STATS_SALT) st.push(c.db.prepare("INSERT OR IGNORE INTO unici (giorno, hash) VALUES (?1, ?2)").bind(giorno, chi));
  await c.db.batch(st);
  if (c.ora - ultimaPulizia > 3600000) { ultimaPulizia = c.ora; c.ctx.waitUntil(pulizia(c.env).catch(() => {})); }
  return vuota();
}

async function annotaErrore(db, e, ora) {
  const firma = (await sha256hex([e.tipo, e.messaggio, e.file, e.riga].join("|"))).slice(0, 32);
  await db.prepare("INSERT INTO errori (firma, tipo, messaggio, file, riga, pagina, n, primo, ultimo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7) ON CONFLICT (firma) DO UPDATE SET n = n + 1, ultimo = ?7, pagina = ?6")
    .bind(firma, e.tipo, e.messaggio, e.file, e.riga, e.pagina, ora).run();
}
async function errore(c) {
  const b = await c.corpo(2000);
  const messaggio = pulisci(b.m).slice(0, 300), file = pulisci(b.f).slice(0, 200), riga = Number.isInteger(b.r) && b.r >= 0 && b.r < 1e7 ? b.r : 0, pagina = String(b.p || "");
  if (!messaggio || (file && !/^\/[\w./-]*$/.test(file)) || !(PAGINE.has(pagina) || pagina === "admin")) throw new Fallito(400, "errore");
  const chi = await impronta(c.request, c.env, giornoRoma(c.ora), false);
  if (!tetto("e" + chi, 20)) return vuota();
  await annotaErrore(c.db, { tipo: "js", messaggio, file, riga, pagina }, c.ora);
  return vuota();
}

// ---------- gestionale ----------
async function adminAttiva(c) {
  const s = await c.serveAccesso();
  await c.limite("admin", 5);
  await c.limite("admin", 20, true);
  if (!c.env.ADMIN_TOKEN) throw new Fallito(404, "non-trovato");
  const esiste = await c.db.prepare("SELECT id FROM utenti WHERE admin = 1 LIMIT 1").first();
  if (esiste && esiste.id !== s.utente.id) throw new Fallito(404, "non-trovato");
  const b = await c.corpo(2000);
  const a = await sha256(enc.encode(String(b.codice || ""))), t = await sha256(enc.encode(String(c.env.ADMIN_TOKEN)));
  if (!crypto.subtle.timingSafeEqual(a, t)) throw new Fallito(403, "codice");
  await c.db.prepare("UPDATE utenti SET admin = 1 WHERE id = ?1").bind(s.utente.id).run();
  return json({ admin: true });
}

async function adminDati(c) {
  await c.serveAdmin();
  const giorni = Math.min(400, Math.max(7, Number(c.url.searchParams.get("giorni")) || 30));
  const oggi = giornoRoma(c.ora), dal = spostaGiorno(oggi, 1 - giorni);
  const q = (sql, ...a) => c.db.prepare(sql).bind(...a);
  const r = await c.db.batch([
    q("SELECT COUNT(*) AS n FROM utenti"),
    q("SELECT u.id, u.nome, u.email, u.admin, u.creato, u.ultimo, u.prefs, (SELECT COUNT(*) FROM credenziali k WHERE k.utente = u.id) AS passkey FROM utenti u ORDER BY u.creato DESC LIMIT 1000"),
    q("SELECT giorno, SUM(n) AS n FROM visite WHERE giorno >= ?1 GROUP BY giorno ORDER BY giorno", dal),
    q("SELECT pagina AS k, SUM(n) AS n FROM visite WHERE giorno >= ?1 GROUP BY pagina ORDER BY n DESC", dal),
    q("SELECT paese AS k, SUM(n) AS n FROM visite WHERE giorno >= ?1 GROUP BY paese ORDER BY n DESC", dal),
    q("SELECT lingua AS k, SUM(n) AS n FROM visite WHERE giorno >= ?1 GROUP BY lingua ORDER BY n DESC", dal),
    q("SELECT dispositivo AS k, SUM(n) AS n FROM visite WHERE giorno >= ?1 GROUP BY dispositivo ORDER BY n DESC", dal),
    q("SELECT giorno, unici FROM giorni WHERE giorno >= ?1", dal),
    q("SELECT COUNT(*) AS n FROM unici WHERE giorno = ?1", oggi),
    q("SELECT tipo, messaggio, file, riga, pagina, n, primo, ultimo FROM errori ORDER BY ultimo DESC LIMIT 200")
  ]);
  const righe = (i) => r[i].results || [];
  const iscrittiGiorno = {};
  const elenco = righe(1).map((u) => {
    const p = profilo(u).prefs;
    const g = giornoRoma(u.creato);
    if (g >= dal) iscrittiGiorno[g] = (iscrittiGiorno[g] || 0) + 1;
    return { nome: u.nome, email: u.email || "", admin: !!u.admin, creato: u.creato, ultimo: u.ultimo, passkey: u.passkey, paese: p.paese || "", temi: (p.temi || []).length, interessi: p.interessi || null };
  });
  const unici = {};
  righe(7).forEach((x) => { unici[x.giorno] = x.unici; });
  if (c.env.STATS_SALT) unici[oggi] = (unici[oggi] || 0) + ((righe(8)[0] || {}).n || 0);
  const visite = {};
  righe(2).forEach((x) => { visite[x.giorno] = x.n; });
  const serie = [];
  for (let i = 1 - giorni; i <= 0; i++) {
    const g = spostaGiorno(oggi, i);
    serie.push({ giorno: g, iscritti: iscrittiGiorno[g] || 0, visite: visite[g] || 0, unici: c.env.STATS_SALT ? unici[g] || 0 : null });
  }
  return json({
    ora: c.ora, oggi, giorni,
    segreti: { adminToken: !!c.env.ADMIN_TOKEN, statsSalt: !!c.env.STATS_SALT },
    iscritti: { totale: (righe(0)[0] || {}).n || 0, elenco },
    serie,
    pagine: righe(3), paesi: righe(4), lingue: righe(5), dispositivi: righe(6),
    errori: righe(9)
  });
}

// la pagina del gestionale: solo per l'amministratore, e per tutti finché non c'è (con ADMIN_TOKEN impostato), per
// fare l'accesso e scrivere il codice. Per chiunque altro è una pagina che non c'è, come le altre (il 404 del sito)
let cspAdmin = "";
async function paginaAdmin(request, env) {
  if (!env.DB || !["GET", "HEAD"].includes(request.method)) return env.ASSETS.fetch(request);
  const c = contesto(request, env, null);
  await prepara(env.DB);
  const s = await c.sessione();
  const admin = s && s.utente.admin;
  const avvio = !admin && (await senzaAdmin(c));
  if (!admin && !avvio) return env.ASSETS.fetch(new Request(new URL("/admin", c.url), { method: "GET" }));
  // con la barra in fondo gli indirizzi relativi della pagina (assets/...) non tornerebbero
  if (c.url.pathname !== "/admin") return new Response(null, { status: 302, headers: { Location: "/admin", "Cache-Control": "no-store" } });
  if (!cspAdmin) {
    const hash = [];
    for (const m of ADMIN_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) hash.push("'sha256-" + btoa(String.fromCharCode(...(await sha256(enc.encode(m[1]))))) + "'");
    cspAdmin = "default-src 'self'; script-src 'self' " + hash.join(" ") + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'";
  }
  return new Response(request.method === "HEAD" ? null : ADMIN_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": cspAdmin,
      "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "same-origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
    }
  });
}

// ---------- pulizia: sessioni e sfide scadute, limiti vecchi, visitatori unici dei giorni passati ridotti a un numero ----------
async function pulizia(env) {
  if (!env.DB) return;
  await prepara(env.DB);
  const ora = Date.now(), oggi = giornoRoma(ora), vecchio = spostaGiorno(oggi, -400);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessioni WHERE scade < ?1").bind(ora),
    env.DB.prepare("DELETE FROM sfide WHERE scade < ?1").bind(ora),
    env.DB.prepare("DELETE FROM limiti WHERE minuto < ?1").bind(Math.floor(ora / 60000) - 60),
    env.DB.prepare("INSERT INTO giorni (giorno, unici) SELECT giorno, COUNT(*) FROM unici WHERE giorno < ?1 GROUP BY giorno ON CONFLICT (giorno) DO UPDATE SET unici = giorni.unici + excluded.unici").bind(oggi),
    env.DB.prepare("DELETE FROM unici WHERE giorno < ?1").bind(oggi),
    env.DB.prepare("DELETE FROM errori WHERE ultimo < ?1").bind(ora - 30 * 864e5),
    env.DB.prepare("DELETE FROM visite WHERE giorno < ?1").bind(vecchio),
    env.DB.prepare("DELETE FROM giorni WHERE giorno < ?1").bind(vecchio)
  ]);
}

// ---------- smistamento ----------
const ROTTE = {
  "GET /api/io": io,
  "POST /api/registra/opzioni": registraOpzioni,
  "POST /api/registra/verifica": registraVerifica,
  "POST /api/accedi/opzioni": accediOpzioni,
  "POST /api/accedi/verifica": accediVerifica,
  "POST /api/esci": esci,
  "POST /api/cancella": cancella,
  "POST /api/preferenze": preferenze,
  "GET /api/miei-dati": mieiDati,
  "POST /api/visita": visita,
  "POST /api/errore": errore,
  "POST /api/admin/attiva": adminAttiva,
  "GET /api/admin/dati": adminDati
};
const PERCORSI = new Set(Object.keys(ROTTE).map((k) => k.split(" ")[1]));

async function api(request, env, ctx) {
  const c = contesto(request, env, ctx);
  const via = c.url.pathname.replace(/\/+$/, "");
  const fn = ROTTE[request.method + " " + via];
  if (!fn) return json({ errore: PERCORSI.has(via) ? "metodo" : "non-trovato" }, PERCORSI.has(via) ? 405 : 404);
  if (!env.DB) return json({ errore: "non-attivi" }, 503);
  if (request.method !== "GET" && !stessaOrigine(c)) return json({ errore: "origine" }, 403);
  try {
    await prepara(env.DB);
    return await fn(c);
  } catch (e) {
    if (e instanceof Fallito) return json({ errore: e.codice }, e.stato);
    // un errore del Worker si annota nel gestionale, raggruppato per messaggio, senza dati di chi ha chiesto
    try { await annotaErrore(env.DB, { tipo: "worker", messaggio: String((e && e.message) || e).slice(0, 300), file: via.slice(0, 200), riga: 0, pagina: "api" }, Date.now()); } catch (x) { /* niente */ }
    return json({ errore: "interno" }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname;
    if (p === "/admin" || p === "/admin/" || p === "/admin.html") return paginaAdmin(request, env);
    if (p === "/api" || p.startsWith("/api/")) return api(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pulizia(env));
  }
};
