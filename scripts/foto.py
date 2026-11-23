#!/usr/bin/env python3
"""Le foto delle notizie, da Wikimedia Commons, tenute sul sito (nessuna richiesta a siti esterni dal browser).

Uso:
    python3 scripts/foto.py <cartella_db> <cartella_sito>

La redazione scrive in una storia il campo photo = {"wiki": "it", "title": "Casa Bianca", "alt": ["Washington"]}: il
titolo della voce di Wikipedia di un luogo, un edificio, un'istituzione o un oggetto che identifica la notizia, nella lingua
della voce ("it", "en", "fr", "es", "de"...). Mai una persona. alt, facoltativo, sono voci di riserva (un'altra cosa
precisa), come titoli nella stessa lingua oppure {"wiki", "title"}.
Mai nemmeno una città, una regione o un paese: la loro foto è un panorama che non dice niente della notizia. Lì la
copertina della storia è la mappa che GERICO disegna (scripts/mappe.py), con il luogo segnato.
Per ogni storia live con photo lo script prende la foto della voce: l'immagine principale, se è una foto, poi quella di
Wikidata (P18), poi l'immagine principale della stessa voce su Wikipedia in inglese, italiano, francese, spagnolo e tedesco.
Vale la prima che sta su Wikimedia Commons con una licenza libera (CC BY, CC BY-SA, CC0, pubblico dominio, sola
attribuzione) ed è grande abbastanza; la salva in <sito>/img/foto/<id>.jpg (larga 1280 px) e scrive accanto <id>.json con
autore, licenza e pagina del file: export.py li mette nella storia, il sito li mostra sotto la foto.
Se nessuna voce va bene (voce che non c'è, voce di un territorio, solo stemmi o loghi, immagine non libera o troppo
piccola) la storia resta con la mappa.
Con Pillow (il workflow lo installa prima della pubblicazione) ogni foto si alleggerisce: una foto verticale diventa il
quadrato centrale (il sito le mostra sempre larghe o quadrate, con il centro in vista), la grande è larga al massimo
1200 px e accanto c'è <id>-s.jpg, larga 480 px, per le miniature: sul telefono si scarica quella. Le foto già prese si
alleggeriscono alla prima pubblicazione, senza riscaricarle.
Una foto non si ripete per tre settimane (site/img/foto-storico.json): per lo stesso luogo si prende un'altra foto
dalla sua categoria di Wikimedia Commons, orizzontale e recente. Una foto vale per una storia sola: se due storie chiedono la stessa, la tiene la più importante e l'altra prova le
voci di riserva (se non trova un'altra foto resta con la mappa).
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
                    r"|attribution|copyrighted free use|no restrictions|ogl( v?\d(\.\d)?)?)$", re.I)
LINGUA = re.compile(r"^[a-z]{2,3}$")
# dove cercare la stessa voce quando quella scelta non ha una foto
ALTRE = ["en", "it", "fr", "es", "de"]
LARGA = 1600
FOTO = re.compile(r"\.(jpe?g|png|webp)$", re.I)
GRANDE, PICCOLA, OTT = 1400, 520, 3   # OTT: la versione dell'alleggerimento (cambiandola si rifanno tutte)
# le foto usate nelle ultime settimane: non si ripetono, così lo stesso palazzo ha ogni volta uno scatto diverso
STORICO_GIORNI = 21
CATEGORIA_MAX = 40   # quante foto della categoria di Commons guardare, dalle più recenti
# le foto della categoria con persone o eventi nel nome non si prendono (discorsi, visite, cortei, ritratti...)
EVENTI = re.compile(r"\b(speech|speaks|speaking|discorso|discours|rede|discurso|president[ea]?|präsident|minist(er|ro|re)|premier|chancellor|cancelliere|kanzler|"
                    r"senator|senatore|deputy|deputato|mayor|sindaco|king|queen|re|regina|pope|papa|prince|principe|visit[ae]?|besuch|"
                    r"meeting|incontro|réunion|treffen|reuni[oó]n|portrait|ritratto|selfie|conference|conferenza|ceremony|cerimonia|"
                    r"delegation|delegazione|signing|firma|protest[ae]?|demonstration|manifestazione|parade|parata|march|corteo|run|race|"
                    r"marathon|maratona|wedding|funeral|funerale|crowd|folla|people|persone|leute|gente|staff|soldiers|soldati|"
                    r"students|studenti|award|premiazione|inauguration|insediamento|swearing|giuramento|rally|comizio|celebration|"
                    r"festival|concert|concerto|archive|archivio|archiv|establishment|government|governo|cabinet|session|seduta|"
                    r"vote|voto|mit|with|con|and|und|y|et|1[89]\d\d)\b", re.I)
# le foto premiate dalla comunità di Commons: si guardano prima delle altre
PREMIATE = ("Featured_pictures_on_Wikimedia_Commons", "Quality_images")
FORMATO = 16 / 9   # il formato della foto nella notizia (e nella prima pagina, che la taglia ai lati se serve)
REGOLA = 5   # la regola con cui si scelgono le foto: quando cambia, quelle già prese si ricontrollano una volta
# I tipi di Wikidata (P31) delle voci di un territorio. Non serve l'elenco completo: una voce che ha una popolazione
# (P1082) è comunque un territorio, e sono quasi tutte
LUOGHI = {"Q515", "Q5119", "Q1549591", "Q486972", "Q747074", "Q6256", "Q3624078", "Q35657", "Q10864048", "Q16110", "Q484170",
          "Q1093829", "Q200250", "Q174844", "Q208511", "Q22865", "Q2074737", "Q3957", "Q532", "Q15284"}


def alleggerisci(path):
    """La foto in `path` diventa leggera (tagliata in 16:9, larga al massimo GRANDE, appena più nitida, JPEG progressivo) e
    accanto si scrive la piccola (-s.jpg, larga PICCOLA). Torna le misure {w, h, sw, sh, bytes, sbytes}, oppure None se
    Pillow non c'è o il file non si legge (allora la foto resta com'è e il sito usa solo quella)."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return None
    try:
        im = Image.open(path)
        im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception:  # noqa: BLE001
        return None
    from PIL import ImageFilter
    w, h = im.size
    # tutte nel formato della notizia, 16:9: una foto più alta si taglia sopra e sotto tenendo il centro un po' in alto
    # (dove di solito sta il soggetto, non il marciapiede); una molto larga si taglia ai lati
    if w / h < FORMATO:
        nh = round(w / FORMATO)
        t = round((h - nh) * 0.42)
        im = im.crop((0, t, w, t + nh))
    elif w / h > 2.1:
        nw = round(h * 2.1)
        sx = (w - nw) // 2
        im = im.crop((sx, 0, sx + nw, h))
    w, h = im.size
    nitida = lambda x: x.filter(ImageFilter.UnsharpMask(radius=1.0, percent=55, threshold=2))
    grande = nitida(im.resize((GRANDE, round(h * GRANDE / w)), Image.LANCZOS)) if w > GRANDE else im
    piccola = nitida(im.resize((PICCOLA, round(h * PICCOLA / w)), Image.LANCZOS)) if w > PICCOLA else im
    base = path[:-4]
    grande.save(base + ".tmp.jpg", "JPEG", quality=80, optimize=True, progressive=True, subsampling="4:2:0")
    piccola.save(base + "-s.tmp.jpg", "JPEG", quality=78, optimize=True, progressive=True)
    os.replace(base + ".tmp.jpg", base + ".jpg")
    os.replace(base + "-s.tmp.jpg", base + "-s.jpg")
    return {"w": grande.size[0], "h": grande.size[1], "sw": piccola.size[0], "sh": piccola.size[1],
            "bytes": os.path.getsize(base + ".jpg"), "sbytes": os.path.getsize(base + "-s.jpg"), "ott": OTT}


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
    w0, h0 = ii.get("width") or 0, ii.get("height") or 0
    if w0 < 1280 or h0 < 720:
        return None, "immagine troppo piccola per stare bene in grande"
    if w0 < 1.2 * h0:
        return None, "foto verticale o quadrata: nel formato della notizia perderebbe troppo"
    anno = re.search(r"\b(1[89]\d\d|20\d\d)\b", pulito((meta.get("DateTimeOriginal") or meta.get("DateTime") or {}).get("value")))
    if anno and int(anno.group(1)) < 2005:
        return None, f"foto del {anno.group(1)}: troppo vecchia per una notizia di oggi"
    autore = pulito((meta.get("Artist") or {}).get("value"))[:80] or "autore non indicato"
    return ii.get("thumburl") or ii.get("url"), {"author": autore, "license": licenza, "page": ii.get("descriptionurl") or "", "file": nome,
                                                 "w": ii.get("thumbwidth") or ii.get("width"), "h": ii.get("thumbheight") or ii.get("height")}


def stesso(nome):
    """Il nome di un file di Commons scritto sempre allo stesso modo (spazi, non trattini bassi), per i confronti."""
    return str(nome or "").replace("_", " ").strip()


def senza_persone(pageid, nome=None):
    """False se il file di Commons dichiara di ritrarre una persona (dati strutturati: «raffigura», P180, un essere
    umano). Senza dati strutturati, o se il controllo non riesce, vale il filtro sul nome del file."""
    try:
        if not pageid and nome:
            d = api("commons.wikimedia.org", action="query", titles="File:" + nome)
            pageid = (((d.get("query") or {}).get("pages") or [{}])[0]).get("pageid")
        if not pageid:
            return True
        d = api("commons.wikimedia.org", action="wbgetentities", ids=f"M{pageid}", props="claims")
        ent = ((d.get("entities") or {}).get(f"M{pageid}") or {})
        stm = ent.get("statements") or ent.get("claims") or {}
        raff = [((x.get("mainsnak") or {}).get("datavalue") or {}).get("value", {}).get("id") for x in stm.get("P180") or []][:4]
        for q in raff:
            if not q:
                continue
            c = api("www.wikidata.org", action="wbgetclaims", entity=q, property="P31")
            tipi = [((x.get("mainsnak") or {}).get("datavalue") or {}).get("value", {}).get("id") for x in (c.get("claims") or {}).get("P31") or []]
            if "Q5" in tipi:
                return False
    except Exception:  # noqa: BLE001
        return True
    return True


def trova(wiki, title, escluse=()):
    """(indirizzo dell'immagine a 1280 px, crediti) oppure (None, perché). `escluse`: i file già usati da un'altra
    storia, che non si riprendono (due notizie con la stessa foto sembrano la stessa notizia)."""
    host = (wiki if isinstance(wiki, str) and LINGUA.match(wiki) else "it") + ".wikipedia.org"
    d = api(host, action="query", prop="pageimages|pageprops", piprop="name", ppprop="wikibase_item|disambiguation", titles=title, redirects="1")
    pages = (d.get("query") or {}).get("pages") or []
    if not pages or pages[0].get("missing"):
        return None, f"la voce non c'è su {host}"
    if "disambiguation" in (pages[0].get("pageprops") or {}):
        return None, f"su {host} è una pagina di disambiguazione: serve il titolo preciso"
    # mai la foto di una persona: se la voce è di un essere umano (Wikidata: istanza di Q5) non si prende niente
    item = (pages[0].get("pageprops") or {}).get("wikibase_item")
    if not item:
        return None, "la voce non ha una scheda Wikidata: non si può controllare che non sia una persona"
    claims = api("www.wikidata.org", action="wbgetclaims", entity=item).get("claims") or {}
    tipi = [((x.get("mainsnak") or {}).get("datavalue") or {}).get("value", {}).get("id") for x in claims.get("P31") or []]
    if "Q5" in tipi:
        return None, "la voce è di una persona: le foto delle persone non si usano"
    # mai il panorama di una città, di una regione o di un paese: lì la copertina è la mappa
    if LUOGHI.intersection(tipi) or claims.get("P1082"):
        return None, "la voce è di una città, una regione o un paese: lì la copertina è la mappa"
    # le foto candidate, in ordine: l'immagine principale della voce se è una foto (non uno stemma, una bandiera o un logo),
    # quella di Wikidata (P18), poi l'immagine principale della stessa voce nelle altre Wikipedia
    nomi, visti, perche = [], set(), "nessuna foto"
    principale = pages[0].get("pageimage")
    cat = [((x.get("mainsnak") or {}).get("datavalue") or {}).get("value") for x in claims.get("P373") or []]
    cat = cat[0] if cat and isinstance(cat[0], str) else None
    # prima le foto più belle del luogo: quelle che la comunità di Commons ha premiato (vetrina e foto di qualità),
    # nella sua categoria e in quelle sotto
    premiate = []
    if cat:
        for premio in PREMIATE:
            for cerca in (f'deepcategory:"{cat}" incategory:{premio}', f'incategory:"{cat}" incategory:{premio}'):
                try:
                    d = api("commons.wikimedia.org", action="query", list="search", srnamespace="6", srlimit="15", srsearch=cerca)
                    trovati = [x["title"].split(":", 1)[1] for x in (d.get("query") or {}).get("search") or []]
                    premiate += [n for n in trovati if n not in premiate and not EVENTI.search(n.replace("_", " "))]
                    break
                except Exception:  # noqa: BLE001  deepcategory a volte non risponde: si prova la categoria sola
                    continue
    if principale and FOTO.search(principale):
        nomi.append(principale)
    nomi += [((x.get("mainsnak") or {}).get("datavalue") or {}).get("value") for x in claims.get("P18") or []]

    def prova(lista, controllo=None):
        nonlocal perche
        for nome in lista:
            if not isinstance(nome, str) or not FOTO.search(nome) or nome in visti:
                continue
            visti.add(nome)
            if stesso(nome) in escluse:
                perche = f"{nome}: è già la foto di un'altra storia"
                continue
            url, info = file_ok(nome)
            if url and controllo and not controllo(nome):
                perche = f"{nome}: ritrae una persona"
                continue
            if url:
                return url, info
            perche = f"{nome}: {info}"
        return None

    r = prova(premiate[:10], controllo=lambda n: senza_persone(None, n)) if premiate else None
    if r:
        return r
    r = prova(nomi)
    if r:
        return r
    # altre foto dello stesso luogo: la categoria di Wikimedia Commons della voce (P373), dalle più recenti, solo
    # orizzontali (interni, altre angolazioni, altri momenti). Così un palazzo che torna spesso ha ogni volta un'altra foto
    if cat:
        try:
            d = api("commons.wikimedia.org", action="query", generator="categorymembers", gcmtitle="Category:" + cat, gcmtype="file",
                    gcmsort="timestamp", gcmdir="desc", gcmlimit=str(CATEGORIA_MAX), prop="imageinfo|info", iiprop="size|mime")
            altre, ids = [], {}
            for pg in (d.get("query") or {}).get("pages") or []:
                ii = (pg.get("imageinfo") or [{}])[0]
                w, h = ii.get("width") or 0, ii.get("height") or 0
                nome = pg["title"].split(":", 1)[1]
                if ii.get("mime") == "image/jpeg" and w >= 1200 and w >= 1.3 * h and not EVENTI.search(nome.replace("_", " ")):
                    altre.append(nome)
                    ids[nome] = pg.get("pageid")
            # il controllo delle persone (dati strutturati) solo sulle candidate, una alla volta, al massimo 8
            r = prova(altre[:8], controllo=lambda n: senza_persone(ids.get(n)))
            if r:
                return r
        except Exception:  # noqa: BLE001  la categoria è un di più: senza, si prova il resto
            pass
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
    """Le voci da provare per una storia, in ordine: photo, poi photo.alt. La città della storia non si prova più:
    la sua foto sarebbe un panorama, e al suo posto c'è la mappa."""
    wiki = ph.get("wiki") if isinstance(ph.get("wiki"), str) and LINGUA.match(ph.get("wiki")) else "it"
    out = [(wiki, ph["title"].strip())]
    alt = ph.get("alt")
    for a in (alt if isinstance(alt, list) else [alt] if alt else []):
        if isinstance(a, str) and a.strip():
            out.append((wiki, a.strip()))
            if wiki != "it":
                out.append(("it", a.strip()))   # la riserva è spesso il nome italiano della città
        elif isinstance(a, dict) and isinstance(a.get("title"), str) and a["title"].strip():
            w = a.get("wiki") if isinstance(a.get("wiki"), str) and LINGUA.match(a.get("wiki")) else wiki
            out.append((w, a["title"].strip()))
    uniche = []
    for v in out:
        if v not in uniche:
            uniche.append(v)
    return uniche


def main(db, site):
    cartella = os.path.join(site, "img", "foto")
    os.makedirs(cartella, exist_ok=True)
    vive, fatte, saltate, leggere, confermate = set(), 0, [], 0, 0
    sdir = os.path.join(db, "stories")
    storie = []
    for name in sorted(os.listdir(sdir)) if os.path.isdir(sdir) else []:
        if not name.endswith(".json"):
            continue
        try:
            storie.append((name[:-5], json.load(open(os.path.join(sdir, name), encoding="utf-8"))))
        except (OSError, ValueError):
            continue
    # Una foto vale per una storia sola. Le storie si guardano in ordine d'importanza (prima le live, poi per rank):
    # se due chiedono la stessa foto la tiene la più importante, l'altra prova le voci di riserva e, se non trova
    # un'altra foto, resta con la mappa
    storico_path = os.path.join(site, "img", "foto-storico.json")
    try:
        storico = json.load(open(storico_path, encoding="utf-8"))
    except (OSError, ValueError):
        storico = {}
    oggi = time.strftime("%Y-%m-%d")
    limite = time.strftime("%Y-%m-%d", time.gmtime(time.time() - STORICO_GIORNI * 86400))
    storico = {k: v for k, v in storico.items() if isinstance(v, dict) and v.get("d", "") >= limite}

    def segna(f, chi):
        """la foto f usata oggi dalla storia chi (lo storico tiene tutte le storie che l'hanno usata)"""
        prima = storico.get(f) or {}
        storico[f] = {"d": oggi, "ids": sorted(set(prima.get("ids") or []) | {chi})[-10:]}
    storie.sort(key=lambda x: (x[1].get("status") != "live", x[1].get("rank") if isinstance(x[1].get("rank"), (int, float)) else 999, x[0]))
    usate = {}
    for sid, s in storie:
        ph = s.get("photo")
        if not (isinstance(ph, dict) and isinstance(ph.get("title"), str) and ph["title"].strip()) or not re.fullmatch(r"[\w.-]+", sid):
            continue
        vive.add(sid)
        chiave = (ph.get("wiki") or "it") + ":" + ph["title"].strip()
        side = os.path.join(cartella, sid + ".json")
        prima = {}
        try:
            prima = json.load(open(side, encoding="utf-8"))
            doppia = prima.get("key") == chiave and bool(prima.get("file")) and usate.get(stesso(prima["file"]), sid) != sid
            if prima.get("key") == chiave and os.path.exists(os.path.join(cartella, sid + ".jpg")) and not doppia and (prima.get("regola") == REGOLA or s.get("status") != "live"):
                if prima.get("file"):
                    usate[stesso(prima["file"])] = sid
                # già presa: si alleggerisce una volta sola, dal file che c'è (senza riscaricarla)
                if prima.get("ott") != OTT or not os.path.exists(os.path.join(cartella, sid + "-s.jpg")):
                    mis = alleggerisci(os.path.join(cartella, sid + ".jpg"))
                    if mis:
                        prima.update(mis)
                        with open(side, "w", encoding="utf-8") as f:
                            json.dump(prima, f, ensure_ascii=False, indent=1)
                            f.write("\n")
                        leggere += 1
                continue
            # già cercata da poco senza trovare niente: si riprova dopo 12 ore, non a ogni pubblicazione
            if prima.get("key") == chiave and prima.get("miss") and not doppia and time.time() - float(prima.get("at") or 0) < 12 * 3600:
                saltate.append(f"{sid}: già cercata alle {time.strftime('%H:%M', time.gmtime(float(prima['at'])))} UTC senza trovare una foto")
                continue
        except (OSError, ValueError, TypeError):
            pass
        try:
            url, info, motivi = None, None, []
            for wiki, titolo in voci(s, ph):
                # niente foto già usate da un'altra storia viva o, da un'altra storia, nelle ultime settimane
                url, info = trova(wiki, titolo, set(usate) | {f for f, v in storico.items() if set(v.get("ids") or []) - {sid}})
                if url:
                    break
                motivi.append(f"{wiki}:{titolo} → {info}")
            if not url:
                saltate.append(f"{sid}: " + " | ".join(motivi))
                # la foto che aveva era la stessa di un'altra storia: si toglie, la storia resta con la mappa
                for vecchia in (sid + ".jpg", sid + "-s.jpg"):
                    if os.path.exists(os.path.join(cartella, vecchia)):
                        os.remove(os.path.join(cartella, vecchia))
                with open(side, "w", encoding="utf-8") as f:
                    json.dump({"key": chiave, "miss": True, "at": int(time.time()), "why": motivi[-1:]}, f, ensure_ascii=False)
                    f.write("\n")
                continue
            # la stessa foto di prima, ricontrollata con la regola nuova: resta com'è, senza riscaricarla
            if prima.get("key") == chiave and stesso(prima.get("file")) == stesso(info.get("file")) and os.path.exists(os.path.join(cartella, sid + ".jpg")):
                prima["regola"] = REGOLA
                usate[stesso(prima["file"])] = sid
                with open(side, "w", encoding="utf-8") as f:
                    json.dump(prima, f, ensure_ascii=False, indent=1)
                    f.write("\n")
                confermate += 1
                continue
            data = get(url, raw=True)
            if len(data) < 20000 or not (data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[:4] == b"RIFF"):
                saltate.append(f"{sid}: il file scaricato non è un'immagine valida")
                continue
            with open(os.path.join(cartella, sid + ".jpg"), "wb") as f:
                f.write(data)
            info.update(key=chiave, title=titolo, bytes=len(data), regola=REGOLA)
            usate[stesso(info.get("file"))] = sid
            segna(stesso(info.get("file")), sid)
            mis = alleggerisci(os.path.join(cartella, sid + ".jpg"))
            if mis:
                info.update(mis)
            with open(side, "w", encoding="utf-8") as f:
                json.dump(info, f, ensure_ascii=False, indent=1)
                f.write("\n")
            fatte += 1
        except Exception as e:  # la rete o Wikimedia non rispondono: la storia resta con la mappa
            saltate.append(f"{sid}: {str(e)[:120]}")
    # le foto ancora in uso restano nello storico con la data di oggi: si ripetono solo tre settimane dopo l'ultimo uso
    for f, sid_ in usate.items():
        segna(f, sid_)
    with open(storico_path, "w", encoding="utf-8") as fh:
        json.dump(dict(sorted(storico.items())), fh, ensure_ascii=False, indent=0)
        fh.write("\n")
    tolte = 0
    for f in os.listdir(cartella):
        base = f.rsplit(".", 1)[0]
        if base.endswith(".tmp"):
            base = base[:-4]
        if not (base in vive or (base.endswith("-s") and base[:-2] in vive)):
            os.remove(os.path.join(cartella, f))
            tolte += 1
    print(f"foto: {fatte} nuove, {confermate} ricontrollate, {leggere} alleggerite, {len(vive)} storie con la foto chiesta, {tolte} file tolti")
    for x in saltate:
        print("  senza foto " + x)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
