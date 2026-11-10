#!/usr/bin/env python3
"""Le brevi dei paesi: per ogni paese della scelta in alto, i titoli delle ultime 24 ore delle sue testate.

Uso:
    python3 scripts/paesi.py site/data

Legge i feed RSS e Atom di scripts/fonti_paesi.json e scrive site/data/paesi/<SIGLA>.json, uno per paese:
al massimo 15 voci delle ultime 24 ore, le più nuove prima, con titolo originale, titolo in italiano e in inglese,
testata, link e ora; più site/data/paesi/indice.json con lo stato di ogni feed. Niente sport, gossip e pubblicità;
due titoli sullo stesso fatto diventano una voce; al massimo 6 voci per testata, perché si sentano tutte.
Un feed che non risponde tiene le sue voci di prima (finché hanno meno di 24 ore); un paese senza voci da 48 ore
lo dice (silent). I titoli li traduce Gemini, come il job «Traduzione» (chiave GEMINI_API_KEY): solo quelli nuovi,
gli altri vengono dal file di prima; senza chiave o a quota finita restano nella lingua originale.
Le testate le legge solo questo job: il browser di chi legge non le chiama mai. Non usa crediti Claude."""
import concurrent.futures
import gzip
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

sys.stdout.reconfigure(line_buffering=True)
QUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, QUI)
import traduci  # noqa: E402  la stessa via verso Gemini del job «Traduzione»

UA = "Mozilla/5.0 (compatible; GERICO/1.0; +https://gerico.financialnews.workers.dev/come-funziona.html)"
MAX_VOCI, MAX_TESTATA, ORE, SILENZIO = 15, 6, 24, 48
ADESSO = datetime.now(timezone.utc)

# sport, gossip, spettacolo, oroscopo, ricette e pubblicità: le sezioni del sito nel percorso dell'articolo (solo le
# cartelle, non il titolo nel link: «five-people-killed» resta) e le categorie del feed; nel titolo poche parole sicure
SEZIONI_FUORI = re.compile(
    r"(sports?|sport\w*|calcio|football|fussball|fu(ss|ß)ball|f(u|ú)tbol|soccer|tennis|formula-?1|f1|motogp|ciclismo|"
    r"cycling|rugby|cricket|basket\w*|nba|nfl|nhl|mlb|olymp\w*|deportes?|desporto|urheilu|idrott|sportas|"
    r"gossip|vip|people|celeb\w*|promi\w*|stars?|entertainment|spettacol\w*|showbiz|royals?|"
    r"oroscop\w*|horoscop\w*|horoskop\w*|ricett\w*|recipes?|rezepte?|recetas?|lifestyle|"
    r"sponsor\w*|advertorial|anzeige|publireportage|partner-?content|brand-?studio|promo\w*|shopping|deals?)", re.I)
TITOLO_FUORI = re.compile(r"\b(oroscopo|horoscope|horoskop|sponsored|advertorial|anzeige|gewinnspiel|gossip)\b", re.I)

ISTRUZIONI_IT = (
    "Traduci in italiano titoli di notizie scritti in varie lingue. L'input è un oggetto JSON {id: titolo}; rispondi solo "
    "con un oggetto JSON con gli stessi id e i titoli in italiano. Traduzione fedele e breve, italiano semplice da "
    "notiziario, senza aggiunte né commenti. Nomi di persone, luoghi, partiti e testate restano come sono; sigle e "
    "istituzioni con il nome italiano usuale (EU: Ue, NATO: Nato). Numeri in formato italiano.")
ISTRUZIONI_EN = (
    "Translate news headlines written in various languages into English. The input is a JSON object {id: headline}; "
    "reply only with a JSON object with the same ids and the English headlines. Faithful, short, plain news English "
    "(British spelling), nothing added, no comments. Keep names of people, places, parties and outlets as they are.")
traduci.ISTRUZIONI["titoli-it"], traduci.ISTRUZIONI["titoli-en"] = ISTRUZIONI_IT, ISTRUZIONI_EN


def carica(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def scrivi(path, dato):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dato, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def scarica(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip, deflate",
                                               "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read(4_000_000)
        enc = (r.headers.get("Content-Encoding") or "").lower()
    if enc == "gzip" or data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    elif enc == "deflate":
        data = zlib.decompress(data, -zlib.MAX_WBITS)
    return data


def nome(tag):
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def testo_di(el):
    return "".join(el.itertext()).strip() if el is not None else ""


def pulisci(t):
    t = html.unescape(html.unescape(t or ""))
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip(" -|· ")


def data_di(s):
    s = (s or "").strip()
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError, IndexError):
        d = None
    if d is None:
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def link_pulito(u):
    """Il link all'articolo senza i parametri di tracciamento (utm_ e simili)."""
    try:
        p = urlparse(u.strip())
    except ValueError:
        return ""
    if p.scheme not in ("http", "https") or not p.netloc:
        return ""
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not re.match(r"(utm_|at_|xtor|ns_|cmpid|ito|fbclid|gclid)", k, re.I)]
    return urlunparse(p._replace(query=urlencode(q), fragment=""))


def leggi_feed(data):
    """Le voci di un feed RSS 2.0, RSS 1.0 (RDF) o Atom: titolo, link, ora, categorie."""
    data = data.lstrip(b"\xef\xbb\xbf \r\n\t")
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        # le & non scritte come entità sono l'errore più comune: si corregge e si riprova
        root = ET.fromstring(re.sub(rb"&(?!#?\w+;)", b"&amp;", data))
    voci = []
    for el in root.iter():
        t = nome(el.tag)
        if t not in ("item", "entry"):
            continue
        titolo, link, quando, cat = "", "", None, []
        for c in el:
            n = nome(c.tag)
            if n == "title":
                titolo = pulisci(testo_di(c))
            elif n == "link":
                href = c.get("href")
                if href and (c.get("rel") in (None, "alternate")):
                    link = link or href
                elif not href and testo_di(c):
                    link = link or testo_di(c)
            elif n in ("pubdate", "published", "updated", "date", "issued") and quando is None:
                quando = data_di(testo_di(c))
            elif n == "category":
                cat.append((c.get("term") or testo_di(c) or "").lower())
            elif n == "guid" and not link and (c.get("isPermaLink") or "true").lower() != "false" and testo_di(c).startswith("http"):
                link = testo_di(c)
        link = link_pulito(link)
        if titolo and link:
            voci.append({"title": titolo[:220], "url": link, "at": quando, "cat": cat})
    return voci


def fuori(v):
    """Sport, gossip, pubblicità: le cartelle del link (non l'ultima parte, che è il titolo), le categorie, poche parole
    del titolo."""
    cartelle = [x for x in urlparse(v["url"]).path.lower().split("/") if x][:-1]
    if any(SEZIONI_FUORI.fullmatch(x) for x in cartelle):
        return True
    if any(SEZIONI_FUORI.fullmatch(re.sub(r"\s+", "-", c.strip())) for c in v["cat"] if c):
        return True
    return bool(TITOLO_FUORI.search(v["title"]))


def parole(t):
    return {w for w in re.findall(r"\w+", t.lower()) if len(w) >= 4}


def simili(a, b):
    """Due titoli sullo stesso fatto: almeno metà delle parole lunghe in comune."""
    pa, pb = parole(a), parole(b)
    if len(pa) < 3 or len(pb) < 3:
        return False
    return len(pa & pb) / min(len(pa), len(pb)) >= 0.5


def modelli_titoli():
    """Per i titoli bastano i modelli «lite» (più richieste gratuite al giorno): prima quelli, poi gli altri."""
    m = traduci.modelli() if traduci.KEY else []
    return sorted(m, key=lambda n: (0 if "lite" in n else 1))


def traduci_titoli(da_fare, lingua, elenco):
    """{id: titolo} tradotti in `lingua` ("it" o "en") a lotti; quello che non si riesce resta fuori."""
    fatto = {}
    for lotto in traduci.lotti(da_fare, limite=3500):
        if not elenco or time.time() - traduci.INIZIO > traduci.BUDGET:
            break
        for modello in list(elenco):
            try:
                fatto.update(traduci.traduci_lotto(lotto, "titoli-" + lingua, modello))
                break
            except traduci.QuotaFinita:
                print(f"  {modello}: quota del giorno finita")
                elenco.remove(modello)
            except traduci.Occupato as e:
                print(f"  {modello}: lento o sovraccarico ({e})")
                elenco.remove(modello)
                elenco.append(modello)
                break
            except urllib.error.HTTPError as e:
                print(f"  {modello}: errore {e.code}")
                elenco.remove(modello)
        time.sleep(2)
    return fatto


def main(cartella):
    fonti = carica(os.path.join(QUI, "fonti_paesi.json"))["paesi"]
    out = os.path.join(cartella, "paesi")
    os.makedirs(out, exist_ok=True)
    prima = {k: carica(os.path.join(out, k + ".json"), {}) or {} for k in fonti}
    lavori = [(k, f) for k, p in fonti.items() for f in p["feed"]]
    stato, grezze = [], {}
    t0 = time.time()

    def uno(lavoro):
        k, f = lavoro
        try:
            return k, f, leggi_feed(scarica(f["url"])), ""
        except urllib.error.HTTPError as e:
            return k, f, None, f"HTTP {e.code}"
        except (urllib.error.URLError, OSError, ET.ParseError, ValueError, EOFError, zlib.error) as e:
            return k, f, None, f"{type(e).__name__}: {str(e)[:120]}"

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for k, f, voci, errore in ex.map(uno, lavori):
            stato.append({"paese": k, "testata": f["nome"], "url": f["url"], "ok": voci is not None, "voci": len(voci or []), "errore": errore})
            grezze.setdefault(k, []).append((f, voci))
    print(f"feed letti in {time.time() - t0:.0f} s: {sum(1 for s in stato if s['ok'])} su {len(stato)}")

    limite = ADESSO - timedelta(hours=ORE)
    risultati, da_tradurre = {}, {"it": {}, "en": {}}
    for k, p in fonti.items():
        vecchie = {v["url"]: v for v in (prima[k].get("items") or []) if isinstance(v, dict) and v.get("url")}
        tenute = []
        for f, voci in grezze.get(k, []):
            if voci is None:
                # feed muto: restano le sue voci di prima, se sono ancora di oggi
                tenute += [dict(v, _lingua=f.get("lingua", "")) for v in vecchie.values() if v.get("source") == f["nome"]
                           and (data_di(v.get("at")) or limite) >= limite]
                continue
            for v in voci:
                if fuori(v):
                    continue
                # senza ora nel feed: l'ora in cui GERICO l'ha vista la prima volta
                quando = v["at"] or data_di((vecchie.get(v["url"]) or {}).get("at")) or ADESSO
                if quando < limite or quando > ADESSO + timedelta(minutes=10):
                    continue
                tenute.append({"title": v["title"], "source": f["nome"], "url": v["url"],
                               "at": quando.isoformat(timespec="seconds"), "_lingua": f.get("lingua", "")})
        # le più nuove prima; niente doppioni (stesso link o stesso fatto); al massimo MAX_TESTATA per testata
        tenute.sort(key=lambda v: v["at"], reverse=True)
        scelte, per_testata = [], {}
        for v in tenute:
            if any(v["url"] == s["url"] or simili(v["title"], s["title"]) for s in scelte):
                continue
            if per_testata.get(v["source"], 0) >= MAX_TESTATA:
                continue
            per_testata[v["source"]] = per_testata.get(v["source"], 0) + 1
            scelte.append(v)
            if len(scelte) >= MAX_VOCI:
                break
        # le traduzioni di prima per i titoli già visti; le nuove si chiedono tutte insieme
        gia = {v["title"]: v for v in (prima[k].get("items") or []) if isinstance(v, dict)}
        for i, v in enumerate(scelte):
            lingua = v.pop("_lingua")
            for l in ("it", "en"):
                if lingua == l:
                    v[l] = v["title"]
                elif isinstance(gia.get(v["title"], {}).get(l), str):
                    v[l] = gia[v["title"]][l]
                else:
                    da_tradurre[l][f"{k}-{i}"] = v["title"]
        ultima = max([v["at"] for v in scelte] + [prima[k].get("last") or ""])
        risultati[k] = {"code": k, "name": p["it"], "nameEn": p["en"], "level": p["livello"],
                        "asOf": ADESSO.isoformat(timespec="seconds"), "last": ultima, "items": scelte}

    elenco = modelli_titoli()
    for l in ("it", "en"):
        if not da_tradurre[l]:
            continue
        if not elenco:
            print(f"  {l}: {len(da_tradurre[l])} titoli da tradurre, ma Gemini non è disponibile: restano nella lingua originale")
            continue
        fatto = traduci_titoli(da_tradurre[l], l, elenco)
        print(f"  {l}: {len(fatto)} titoli tradotti su {len(da_tradurre[l])}")
        for chiave, testo in fatto.items():
            k, i = chiave.rsplit("-", 1)
            risultati[k]["items"][int(i)][l] = testo

    indice = {"asOf": ADESSO.isoformat(timespec="seconds"), "countries": {}, "feeds": sorted(stato, key=lambda s: (s["paese"], s["testata"]))}
    for k, r in risultati.items():
        last = data_di(r["last"])
        r["silent"] = not r["items"] and (last is None or ADESSO - last > timedelta(hours=SILENZIO))
        scrivi(os.path.join(out, k + ".json"), r)
        indice["countries"][k] = {"n": len(r["items"]), "last": r["last"], "silent": r["silent"]}
    scrivi(os.path.join(out, "indice.json"), indice)
    vuoti = [k for k, r in risultati.items() if not r["items"]]
    print(f"::notice::paesi: {sum(len(r['items']) for r in risultati.values())} voci in {len(risultati)} paesi; "
          f"feed che non rispondono: {sum(1 for s in stato if not s['ok'])}; paesi senza voci: {', '.join(vuoti) or 'nessuno'}")
    for s in stato:
        if not s["ok"]:
            print(f"  {s['paese']} {s['testata']}: {s['errore']}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
