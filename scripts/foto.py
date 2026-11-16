#!/usr/bin/env python3
"""Le foto delle notizie, da Wikimedia Commons, tenute sul sito (nessuna richiesta a siti esterni dal browser).

Uso:
    python3 scripts/foto.py <cartella_db> <cartella_sito>

La redazione scrive in una storia il campo photo = {"wiki": "it", "title": "Casa Bianca", "alt": ["Washington"]}: il
titolo della voce di Wikipedia di un luogo, un edificio, un'istituzione o un oggetto che identifica la notizia, nella lingua
della voce ("it", "en", "fr", "es", "de"...). Mai una persona. alt, facoltativo, sono voci di riserva (di solito la città),
come titoli nella stessa lingua oppure {"wiki", "title"}; dopo di loro si prova anche city.name della storia.
Per ogni storia live con photo lo script prende la foto della voce: l'immagine principale, se è una foto, poi quella di
Wikidata (P18), poi l'immagine principale della stessa voce su Wikipedia in inglese, italiano, francese, spagnolo e tedesco.
Vale la prima che sta su Wikimedia Commons con una licenza libera (CC BY, CC BY-SA, CC0, pubblico dominio, sola
attribuzione) ed è grande abbastanza; la salva in <sito>/img/foto/<id>.jpg (larga 1280 px) e scrive accanto <id>.json con
autore, licenza e pagina del file: export.py li mette nella storia, il sito li mostra sotto la foto.
Se nessuna voce va bene (voce che non c'è, solo stemmi o loghi, immagine non libera o troppo piccola, rete giù) la storia
resta con la mappa.
Le foto delle storie che non sono più nel database si cancellano.
"""
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "GericoFoto/1.0 (https://gerico.financialnews.workers.dev/come-funziona.html; foto dei luoghi delle notizie) python-urllib"
LIBERE = re.compile(r"^(cc[ -]?by(-sa)?([ -]\d(\.\d)?)?([ -][a-z]{2,3})?([ -]migrated)?|cc[ -]?0( 1\.0)?|cc0|public domain( mark)?|pd([ -].*)?"
                    r"|attribution|copyrighted free use|no restrictions)$", re.I)
LINGUA = re.compile(r"^[a-z]{2,3}$")
# dove cercare la stessa voce quando quella scelta non ha una foto
ALTRE = ["en", "it", "fr", "es", "de"]
LARGA = 1280
FOTO = re.compile(r"\.(jpe?g|png|webp)$", re.I)


def get(url, raw=False):
    """Con calma: una richiesta ogni secondo e mezzo; se Wikimedia dice «troppe richieste» si aspetta e si riprova."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*" if raw else "application/json"})
    for prova in range(4):
        time.sleep(1.5)
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                data = r.read(12 * 1024 * 1024)
            return data if raw else json.loads(data.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or prova == 3:
                raise
            try:
                attesa = int(e.headers.get("Retry-After") or 0)
            except ValueError:
                attesa = 0
            time.sleep(min(60, max(attesa, 8 * (prova + 1))))


def api(host, **params):
    params.update(format="json", formatversion="2")
    return get(f"https://{host}/w/api.php?" + urllib.parse.urlencode(params))


def pulito(s):
    s = re.sub(r"<[^>]+>", "", html.unescape(str(s or "")))
    return re.sub(r"\s+", " ", s).strip()


def file_ok(nome):
    """(indirizzo a 1280 px, crediti) del file di Commons se è libero e grande abbastanza, altrimenti (None, perché)."""
    d = api("commons.wikimedia.org", action="query", prop="imageinfo", iiprop="url|size|mime|extmetadata", iiurlwidth=str(LARGA), titles="File:" + nome)
    pages = (d.get("query") or {}).get("pages") or []
    if not pages or pages[0].get("missing") or not pages[0].get("imageinfo"):
        return None, "il file non è su Wikimedia Commons (può non essere libero)"
    ii = pages[0]["imageinfo"][0]
    meta = ii.get("extmetadata") or {}
    licenza = pulito((meta.get("LicenseShortName") or {}).get("value"))
    if not LIBERE.match(licenza):
        return None, f"licenza non libera o non riconosciuta («{licenza}»)"
    if (ii.get("width") or 0) < 800 or (ii.get("height") or 0) < 450:
        return None, "immagine troppo piccola"
    autore = pulito((meta.get("Artist") or {}).get("value"))[:80] or "autore non indicato"
    return ii.get("thumburl") or ii.get("url"), {"author": autore, "license": licenza, "page": ii.get("descriptionurl") or "", "file": nome,
                                                 "w": ii.get("thumbwidth") or ii.get("width"), "h": ii.get("thumbheight") or ii.get("height")}


def trova(wiki, title):
    """(indirizzo dell'immagine a 1280 px, crediti) oppure (None, perché)."""
    host = (wiki if isinstance(wiki, str) and LINGUA.match(wiki) else "it") + ".wikipedia.org"
    d = api(host, action="query", prop="pageimages|pageprops", piprop="name", ppprop="wikibase_item", titles=title, redirects="1")
    pages = (d.get("query") or {}).get("pages") or []
    if not pages or pages[0].get("missing"):
        return None, f"la voce non c'è su {host}"
    # mai la foto di una persona: se la voce è di un essere umano (Wikidata: istanza di Q5) non si prende niente
    item = (pages[0].get("pageprops") or {}).get("wikibase_item")
    if not item:
        return None, "la voce non ha una scheda Wikidata: non si può controllare che non sia una persona"
    c = api("www.wikidata.org", action="wbgetclaims", entity=item, property="P31")
    tipi = [((x.get("mainsnak") or {}).get("datavalue") or {}).get("value", {}).get("id") for x in (c.get("claims") or {}).get("P31") or []]
    if "Q5" in tipi:
        return None, "la voce è di una persona: le foto delle persone non si usano"
    # le foto candidate, in ordine: l'immagine principale della voce se è una foto (non uno stemma, una bandiera o un logo),
    # quella di Wikidata (P18), poi l'immagine principale della stessa voce nelle altre Wikipedia
    nomi, visti, perche = [], set(), "nessuna foto"
    principale = pages[0].get("pageimage")
    if principale and FOTO.search(principale):
        nomi.append(principale)
    c = api("www.wikidata.org", action="wbgetclaims", entity=item, property="P18")
    nomi += [((x.get("mainsnak") or {}).get("datavalue") or {}).get("value") for x in (c.get("claims") or {}).get("P18") or []]

    def prova(lista):
        nonlocal perche
        for nome in lista:
            if not isinstance(nome, str) or not FOTO.search(nome) or nome in visti:
                continue
            visti.add(nome)
            url, info = file_ok(nome)
            if url:
                return url, info
            perche = f"{nome}: {info}"
        return None

    r = prova(nomi)
    if r:
        return r
    e = api("www.wikidata.org", action="wbgetentities", ids=item, props="sitelinks")
    links = (((e.get("entities") or {}).get(item) or {}).get("sitelinks") or {})
    for lang in ALTRE:
        t = (links.get(lang + "wiki") or {}).get("title")
        if not t or (lang + ".wikipedia.org" == host):
            continue
        d = api(lang + ".wikipedia.org", action="query", prop="pageimages", piprop="name", titles=t)
        pp = (d.get("query") or {}).get("pages") or []
        r = prova([pp[0].get("pageimage")] if pp else [])
        if r:
            return r
    return None, f"la voce non ha una foto utilizzabile (immagine principale: {principale or 'nessuna'}; ultima prova: {perche})"


def voci(s, ph):
    """Le voci da provare per una storia, in ordine: photo, poi photo.alt, poi la città della storia (city.name)."""
    wiki = ph.get("wiki") if isinstance(ph.get("wiki"), str) and LINGUA.match(ph.get("wiki")) else "it"
    out = [(wiki, ph["title"].strip())]
    alt = ph.get("alt")
    for a in (alt if isinstance(alt, list) else [alt] if alt else []):
        if isinstance(a, str) and a.strip():
            out.append((wiki, a.strip()))
        elif isinstance(a, dict) and isinstance(a.get("title"), str) and a["title"].strip():
            w = a.get("wiki") if isinstance(a.get("wiki"), str) and LINGUA.match(a.get("wiki")) else wiki
            out.append((w, a["title"].strip()))
    city = s.get("city")
    if isinstance(city, dict) and isinstance(city.get("name"), str) and city["name"].strip():
        out.append(("it", city["name"].strip()))
    uniche = []
    for v in out:
        if v not in uniche:
            uniche.append(v)
    return uniche


def main(db, site):
    cartella = os.path.join(site, "img", "foto")
    os.makedirs(cartella, exist_ok=True)
    vive, fatte, saltate = set(), 0, []
    sdir = os.path.join(db, "stories")
    for name in sorted(os.listdir(sdir)) if os.path.isdir(sdir) else []:
        if not name.endswith(".json"):
            continue
        sid = name[:-5]
        try:
            s = json.load(open(os.path.join(sdir, name), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        ph = s.get("photo")
        if not (isinstance(ph, dict) and isinstance(ph.get("title"), str) and ph["title"].strip()) or not re.fullmatch(r"[\w.-]+", sid):
            continue
        vive.add(sid)
        chiave = (ph.get("wiki") or "it") + ":" + ph["title"].strip()
        side = os.path.join(cartella, sid + ".json")
        try:
            prima = json.load(open(side, encoding="utf-8"))
            if prima.get("key") == chiave and os.path.exists(os.path.join(cartella, sid + ".jpg")):
                continue   # già presa
            # già cercata da poco senza trovare niente: si riprova dopo 12 ore, non a ogni pubblicazione
            if prima.get("key") == chiave and prima.get("miss") and time.time() - float(prima.get("at") or 0) < 12 * 3600:
                saltate.append(f"{sid}: già cercata alle {time.strftime('%H:%M', time.gmtime(float(prima['at'])))} UTC senza trovare una foto")
                continue
        except (OSError, ValueError, TypeError):
            pass
        try:
            url, info, motivi = None, None, []
            for wiki, titolo in voci(s, ph):
                url, info = trova(wiki, titolo)
                if url:
                    break
                motivi.append(f"{wiki}:{titolo} → {info}")
            if not url:
                saltate.append(f"{sid}: " + " | ".join(motivi))
                with open(side, "w", encoding="utf-8") as f:
                    json.dump({"key": chiave, "miss": True, "at": int(time.time()), "why": motivi[-1:]}, f, ensure_ascii=False)
                    f.write("\n")
                continue
            data = get(url, raw=True)
            if len(data) < 20000 or not (data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[:4] == b"RIFF"):
                saltate.append(f"{sid}: il file scaricato non è un'immagine valida")
                continue
            with open(os.path.join(cartella, sid + ".jpg"), "wb") as f:
                f.write(data)
            info.update(key=chiave, title=titolo, bytes=len(data))
            with open(side, "w", encoding="utf-8") as f:
                json.dump(info, f, ensure_ascii=False, indent=1)
                f.write("\n")
            fatte += 1
        except Exception as e:  # la rete o Wikimedia non rispondono: la storia resta con la mappa
            saltate.append(f"{sid}: {str(e)[:120]}")
    tolte = 0
    for f in os.listdir(cartella):
        if f.rsplit(".", 1)[0] not in vive:
            os.remove(os.path.join(cartella, f))
            tolte += 1
    print(f"foto: {fatte} nuove, {len(vive)} storie con la foto chiesta, {tolte} file tolti")
    for x in saltate:
        print("  senza foto " + x)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
