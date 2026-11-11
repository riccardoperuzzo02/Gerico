#!/usr/bin/env python3
"""Le foto delle notizie, da Wikimedia Commons, tenute sul sito (nessuna richiesta a siti esterni dal browser).

Uso:
    python3 scripts/foto.py <cartella_db> <cartella_sito>

La redazione scrive in una storia il campo photo = {"wiki": "it" | "en", "title": "Casa Bianca"}: il titolo della voce di
Wikipedia di un luogo, un edificio, un'istituzione o un oggetto che identifica la notizia. Mai una persona.
Per ogni storia live con photo lo script prende l'immagine principale di quella voce, solo se sta su Wikimedia Commons con
una licenza libera (CC BY, CC BY-SA, CC0, pubblico dominio), la salva in <sito>/img/foto/<id>.jpg (larga 1280 px) e scrive
accanto <id>.json con autore, licenza e pagina del file: export.py li mette nella storia, il sito li mostra sotto la foto.
Se qualcosa non torna (voce che non c'è, immagine non libera, file troppo piccolo, rete giù) la storia resta con la mappa.
Le foto delle storie che non sono più nel database si cancellano.
"""
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request

UA = "GericoFoto/1.0 (sito di notizie; scripts/foto.py)"
LIBERE = re.compile(r"^(cc[ -]?by(-sa)?([ -]\d(\.\d)?)?( [a-z]{2,3})?|cc[ -]?0( 1\.0)?|cc0|public domain|pd([ -].*)?)$", re.I)
LARGA = 1280


def get(url, raw=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*" if raw else "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read(12 * 1024 * 1024)
    return data if raw else json.loads(data.decode("utf-8"))


def api(host, **params):
    params.update(format="json", formatversion="2")
    return get(f"https://{host}/w/api.php?" + urllib.parse.urlencode(params))


def pulito(s):
    s = re.sub(r"<[^>]+>", "", html.unescape(str(s or "")))
    return re.sub(r"\s+", " ", s).strip()


def trova(wiki, title):
    """(indirizzo dell'immagine a 1280 px, crediti) oppure (None, perché)."""
    host = ("it" if wiki not in ("it", "en") else wiki) + ".wikipedia.org"
    d = api(host, action="query", prop="pageimages|pageprops", piprop="name", ppprop="wikibase_item", titles=title, redirects="1")
    pages = (d.get("query") or {}).get("pages") or []
    nome = pages[0].get("pageimage") if pages and not pages[0].get("missing") else None
    # mai la foto di una persona: se la voce è di un essere umano (Wikidata: istanza di Q5) non si prende niente
    item = ((pages[0].get("pageprops") or {}).get("wikibase_item") if pages else None)
    if not item:
        return None, "la voce non ha una scheda Wikidata: non si può controllare che non sia una persona"
    c = api("www.wikidata.org", action="wbgetclaims", entity=item, property="P31")
    tipi = [((x.get("mainsnak") or {}).get("datavalue") or {}).get("value", {}).get("id") for x in (c.get("claims") or {}).get("P31") or []]
    if "Q5" in tipi:
        return None, "la voce è di una persona: le foto delle persone non si usano"
    if not nome:
        return None, "la voce non c'è o non ha un'immagine principale"
    if not re.search(r"\.(jpe?g|png|webp)$", nome, re.I):
        return None, f"l'immagine principale non è una foto ({nome})"
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
            if json.load(open(side, encoding="utf-8")).get("key") == chiave and os.path.exists(os.path.join(cartella, sid + ".jpg")):
                continue   # già presa
        except (OSError, ValueError):
            pass
        try:
            url, info = trova(ph.get("wiki") or "it", ph["title"].strip())
            if not url:
                saltate.append(f"{sid}: {info}")
                continue
            data = get(url, raw=True)
            if len(data) < 20000 or not (data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[:4] == b"RIFF"):
                saltate.append(f"{sid}: il file scaricato non è un'immagine valida")
                continue
            with open(os.path.join(cartella, sid + ".jpg"), "wb") as f:
                f.write(data)
            info.update(key=chiave, title=ph["title"].strip(), bytes=len(data))
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
