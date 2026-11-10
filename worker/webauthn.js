// GERICO: la verifica delle passkey (WebAuthn) sul Worker, senza librerie: CBOR, chiavi COSE, firme ES256 e RS256 con WebCrypto.
// Si controllano sempre: il tipo dell'operazione, la sfida (usata una volta sola), l'origine della pagina, l'hash del
// dominio (rpId), la presenza e la verifica di chi usa il dispositivo (Face ID, impronta, codice). L'attestazione non si
// chiede ("none"): a GERICO non serve sapere che modello di telefono hai.

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

export class ErrorePasskey extends Error {
  constructor(codice) { super(codice); this.codice = codice; }
}
const no = (codice) => { throw new ErrorePasskey(codice); };

// ---------- base64url ----------
export const b64u = (bytes) => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const da64u = (s) => {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) no("base64");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
export const casuali = (n) => crypto.getRandomValues(new Uint8Array(n));
export const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
const uguali = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
};
const unisci = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; };

// ---------- CBOR (RFC 8949): quello che serve a WebAuthn ----------
// Restituisce { v, fine }: il valore e il punto dove finisce, perché nell'authenticatorData dopo la chiave possono
// venire le estensioni. Le mappe diventano Map (le chiavi COSE sono numeri). Niente lunghezze indefinite: WebAuthn
// usa solo la forma canonica.
export function cbor(buf, i = 0, prof = 0) {
  if (prof > 16) no("cbor-profondo");
  if (i >= buf.length) no("cbor-corto");
  const b = buf[i++], tipo = b >> 5, info = b & 31;
  let n;
  if (info < 24) n = info;
  else if (info === 24) { if (i + 1 > buf.length) no("cbor-corto"); n = buf[i]; i += 1; }
  else if (info === 25) { if (i + 2 > buf.length) no("cbor-corto"); n = (buf[i] << 8) | buf[i + 1]; i += 2; }
  else if (info === 26) { if (i + 4 > buf.length) no("cbor-corto"); n = new DataView(buf.buffer, buf.byteOffset + i, 4).getUint32(0); i += 4; }
  else if (info === 27) {
    if (i + 8 > buf.length) no("cbor-corto");
    const v = new DataView(buf.buffer, buf.byteOffset + i, 8).getBigUint64(0);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) no("cbor-numero");
    n = Number(v); i += 8;
  } else no("cbor-indefinito");
  switch (tipo) {
    case 0: return { v: n, fine: i };
    case 1: return { v: -1 - n, fine: i };
    case 2: if (i + n > buf.length) no("cbor-corto"); return { v: buf.slice(i, i + n), fine: i + n };
    case 3: if (i + n > buf.length) no("cbor-corto"); return { v: dec.decode(buf.subarray(i, i + n)), fine: i + n };
    case 4: {
      if (n > 1000) no("cbor-lungo");
      const a = [];
      for (let k = 0; k < n; k++) { const r = cbor(buf, i, prof + 1); a.push(r.v); i = r.fine; }
      return { v: a, fine: i };
    }
    case 5: {
      if (n > 1000) no("cbor-lungo");
      const m = new Map();
      for (let k = 0; k < n; k++) {
        const kk = cbor(buf, i, prof + 1); i = kk.fine;
        const vv = cbor(buf, i, prof + 1); i = vv.fine;
        m.set(kk.v, vv.v);
      }
      return { v: m, fine: i };
    }
    case 6: return cbor(buf, i, prof + 1); // un'etichetta: conta il valore che segue
    default:
      if (info === 20) return { v: false, fine: i };
      if (info === 21) return { v: true, fine: i };
      if (info === 22) return { v: null, fine: i };
      if (info === 23) return { v: undefined, fine: i };
      no("cbor-semplice");
  }
}

// ---------- authenticatorData ----------
export function leggiAuthData(buf) {
  if (!(buf instanceof Uint8Array) || buf.length < 37) no("authdata-corto");
  const flags = buf[32];
  const a = {
    rpIdHash: buf.slice(0, 32), flags,
    up: !!(flags & 0x01), uv: !!(flags & 0x04), be: !!(flags & 0x08), bs: !!(flags & 0x10), at: !!(flags & 0x40), ed: !!(flags & 0x80),
    contatore: new DataView(buf.buffer, buf.byteOffset + 33, 4).getUint32(0)
  };
  if (a.at) {
    if (buf.length < 55) no("authdata-corto");
    const len = (buf[53] << 8) | buf[54];
    if (len < 16 || len > 1023 || 55 + len > buf.length) no("credenziale-lunghezza");
    a.credId = buf.slice(55, 55 + len);
    const r = cbor(buf, 55 + len);
    if (!(r.v instanceof Map)) no("chiave-cose");
    a.cose = r.v;
    if (!a.ed && r.fine !== buf.length) no("authdata-avanzi");
  }
  return a;
}

// ---------- chiavi: COSE → JWK ----------
const ES256 = -7, RS256 = -257;
export const ALGORITMI = [ES256, RS256];
export function coseJwk(m) {
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && alg === ES256) {
    const x = m.get(-2), y = m.get(-3);
    if (m.get(-1) !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) no("chiave-ec");
    return { alg: ES256, jwk: { kty: "EC", crv: "P-256", x: b64u(x), y: b64u(y) } };
  }
  if (kty === 3 && alg === RS256) {
    const n = m.get(-1), e = m.get(-2);
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length < 256 || n.length > 512 || e.length > 8) no("chiave-rsa");
    return { alg: RS256, jwk: { kty: "RSA", n: b64u(n), e: b64u(e), alg: "RS256" } };
  }
  no("algoritmo");
}
const importa = (jwk, alg) => crypto.subtle.importKey("jwk", jwk,
  alg === ES256 ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);

// la firma ES256 arriva in DER (SEQUENCE di due INTEGER); WebCrypto la vuole grezza: r e s, 32 byte ciascuno
export function derGrezza(der) {
  let i = 0;
  if (der[i++] !== 0x30) no("firma-der");
  let len = der[i++];
  if (len === 0x81) len = der[i++];
  else if (len & 0x80) no("firma-der");
  if (i + len !== der.length) no("firma-der");
  const intero = () => {
    if (der[i++] !== 0x02) no("firma-der");
    const l = der[i++];
    if (!l || l > 33 || i + l > der.length) no("firma-der");
    let v = der.subarray(i, i + l);
    i += l;
    while (v.length > 32 && v[0] === 0) v = v.subarray(1);
    if (v.length > 32) no("firma-der");
    const o = new Uint8Array(32);
    o.set(v, 32 - v.length);
    return o;
  };
  const r = intero(), s = intero();
  if (i !== der.length) no("firma-der");
  return unisci(r, s);
}

// ---------- clientDataJSON ----------
function leggiClient(b64, tipo, sfida, origine) {
  const bytes = da64u(b64);
  if (bytes.length > 4096) no("client-lungo");
  let c;
  try { c = JSON.parse(dec.decode(bytes)); } catch (e) { no("client-json"); }
  if (!c || c.type !== tipo) no("client-tipo");
  if (typeof c.challenge !== "string" || !uguali(enc.encode(c.challenge), enc.encode(sfida))) no("client-sfida");
  if (c.origin !== origine) no("client-origine");
  if (c.crossOrigin === true) no("client-cross");
  return bytes;
}
const controllaDominio = async (a, rpId) => {
  if (!uguali(a.rpIdHash, await sha256(enc.encode(rpId)))) no("rpid");
  if (!a.up) no("presenza");
  if (!a.uv) no("verifica-utente");
};

// iscrizione: navigator.credentials.create() → la chiave pubblica da salvare
export async function verificaIscrizione(cred, { sfida, origine, rpId }) {
  if (!cred || cred.type !== "public-key" || !cred.response) no("credenziale");
  leggiClient(cred.response.clientDataJSON, "webauthn.create", sfida, origine);
  const att = cbor(da64u(cred.response.attestationObject)).v;
  if (!(att instanceof Map) || !(att.get("authData") instanceof Uint8Array) || typeof att.get("fmt") !== "string") no("attestazione");
  const a = leggiAuthData(att.get("authData"));
  await controllaDominio(a, rpId);
  if (!a.at) no("senza-chiave");
  if (!uguali(da64u(cred.rawId || cred.id), a.credId)) no("id-diverso");
  const { alg, jwk } = coseJwk(a.cose);
  await importa(jwk, alg); // una chiave che WebCrypto non accetta non si salva
  const tr = Array.isArray(cred.response.transports) ? cred.response.transports.filter((t) => typeof t === "string" && /^[a-z-]{2,16}$/.test(t)).slice(0, 6) : [];
  return { id: b64u(a.credId), alg, jwk, contatore: a.contatore, trasporti: tr, sincronizzata: a.be };
}

// accesso: navigator.credentials.get() → firma controllata con la chiave salvata all'iscrizione
export async function verificaAccesso(cred, { sfida, origine, rpId, chiave }) {
  if (!cred || cred.type !== "public-key" || !cred.response) no("credenziale");
  const client = leggiClient(cred.response.clientDataJSON, "webauthn.get", sfida, origine);
  const ad = da64u(cred.response.authenticatorData);
  const a = leggiAuthData(ad);
  await controllaDominio(a, rpId);
  let firma = da64u(cred.response.signature);
  if (chiave.alg === ES256) firma = derGrezza(firma);
  const k = await importa(chiave.jwk, chiave.alg);
  const dati = unisci(ad, await sha256(client));
  const ok = await crypto.subtle.verify(chiave.alg === ES256 ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" }, k, firma, dati);
  if (!ok) no("firma");
  return { contatore: a.contatore };
}
