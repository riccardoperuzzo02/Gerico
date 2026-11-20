#!/usr/bin/env python3
"""Le pagine delle storie per i motori di ricerca e per chi condivide, la sitemap, il feed RSS.

Uso:
    python3 scripts/share_pages.py site

storia.html si riempie con lo script: un motore di ricerca o un'app di messaggi che non lo esegue vede una pagina vuota
con un titolo generico. Per ogni storia dell'edizione questo script scrive site/s/<id>.html: l'articolo intero in HTML
(titolo, sommario, foto, testo, cosa non si sa, fonti), con i dati strutturati di una notizia (NewsArticle) e i suoi
meta. È l'indirizzo canonico della storia: quello che finisce su Google e quello del pulsante Condividi. Da lì un
link porta alla storia dentro GERICO (storia.html?id=), con mappa, temi e aggiornamenti.
Le pagine delle storie uscite dall'edizione restano com'erano: un link vecchio porta comunque a qualcosa.
Scrive anche:
- site/data/archivio.json, l'indice di tutte le storie uscite (anche quelle già fuori dall'edizione): titolo, sommario,
  sezione, temi, date. Lo usano la ricerca del sito e le pagine qui sotto;
- l'archivio: site/archivio.html (i mesi e i temi) e site/archivio-<anno-mese>.html (le storie del mese, giorno per giorno;
  un file accanto e non una cartella archivio/, che con archivio.html renderebbe ambiguo l'indirizzo /archivio);
- una pagina per tema, site/tema/<nome>.html, con tutte le storie del tema: i temi caldi della redazione e i temi delle
  storie che ne hanno almeno tre;
- site/sitemap.xml, con tutte le storie, l'archivio, i temi e i campi di Google News per le storie delle ultime 48 ore;
- site/feed.xml, il feed RSS delle ultime storie;
- in index.html, tra i segni <!--storie--> e <!--/storie-->, l'elenco dei titoli di oggi per chi non esegue lo script;
- la riga Sitemap di robots.txt.
L'indirizzo del sito lo prende da og:url di index.html (lo scrive set_site_url.py)."""
import html
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime

SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,150}$")
FALLBACK = "https://gerico.financialnews.workers.dev"
PAGES = ["", "terminal", "come-funziona", "glossario", "collabora"]
SEZIONI = {"mondo": "Mondo", "italia": "Italia", "economia": "Economia", "mercati": "Mercati", "tecnologia": "Tecnologia"}
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
MIN_TEMA = 3  # una pagina per un tema delle storie solo da tre storie in su
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$")
E = html.escape

PAGINA = """<!doctype html>
<html lang="it" class="nuova">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} · GERICO</title>
<meta name="description" content="{desc}">
<meta name="robots" content="max-image-preview:large">
<link rel="canonical" href="{base}/s/{id}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="GERICO">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{base}/s/{id}">
<meta property="og:image" content="{image}">
<meta property="og:image:alt" content="{title}">
<meta property="article:published_time" content="{published}">
<meta property="article:modified_time" content="{modified}">
<meta property="article:section" content="{section}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0A1428" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="GERICO" href="/feed.xml">
<link rel="stylesheet" href="/assets/css/gerico.css{v}">
<script type="application/ld+json">{jsonld}</script>
</head>
<body class="pagina-s">
<header class="top no-line"><div class="wrap top-row"><a class="brand" href="/" aria-label="GERICO, prima pagina">GERICO</a></div></header>
<main id="main" class="wrap">
<article class="story-main s-art">
<p class="s-occhiello"><a href="/#{sec_id}">{section}</a> · <time datetime="{modified}">{quando}</time></p>
<h1>{title_full}</h1>
<p class="sum">{summary}</p>
{media}
{byline}
{seguito}
<div class="s-testo">
{article}
</div>
{fonti}
{puntate}
{open}
{temi}
<p class="s-apri"><a class="conto-b primario" href="/storia.html?id={id}">Apri la storia in GERICO</a><span>con la mappa, i temi da seguire e gli aggiornamenti</span></p>
</article>
{altre}
</main>
<footer class="foot"><div class="wrap">
<p class="foot-line"><a href="/">Prima pagina</a><a href="/archivio">Archivio</a><a href="/glossario">Glossario</a><a href="/come-funziona.html">Come funziona</a><a href="/privacy.html">Privacy</a><span>Nessun consiglio di investimento</span><span>Articoli scritti con l'intelligenza artificiale, voce sintetica</span></p>
</div></footer>
</body>
</html>
"""

# l'archivio e i temi: pagine statiche come quelle delle storie, per chi legge e per i motori di ricerca
LISTA = """<!doctype html>
<html lang="it" class="nuova">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} · GERICO</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{base}{path}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="GERICO">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{base}{path}">
<meta property="og:image" content="{base}/assets/img/og-gerico.png">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0A1428" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="GERICO" href="/feed.xml">
<link rel="stylesheet" href="/assets/css/gerico.css{v}">
<script type="application/ld+json">{jsonld}</script>
</head>
<body class="pagina-s pagina-lista">
<header class="top no-line"><div class="wrap top-row"><a class="brand" href="/" aria-label="GERICO, prima pagina">GERICO</a></div></header>
<main id="main" class="wrap">
<div class="lista-in">
<nav class="briciole" aria-label="Dove sei">{briciole}</nav>
<h1>{h1}</h1>
<p class="sum">{intro}</p>
{corpo}
</div>
</main>
<footer class="foot"><div class="wrap">
<p class="foot-line"><a href="/">Prima pagina</a><a href="/archivio">Archivio</a><a href="/glossario">Glossario</a><a href="/come-funziona.html">Come funziona</a><a href="/privacy.html">Privacy</a><span>Nessun consiglio di investimento</span><span>Articoli scritti con l'intelligenza artificiale, voce sintetica</span></p>
</div></footer>
</body>
</html>
"""


def site_base(site):
    try:
        page = open(os.path.join(site, "index.html"), encoding="utf-8").read()
        m = re.search(r'<meta property="og:url" content="(https://[^"]+)"', page)
        if m:
            return m.group(1).rstrip("/")
    except OSError:
        pass
    return FALLBACK


def versione(site):
    try:
        m = re.search(r'gerico\.css(\?v=[\w-]+)', open(os.path.join(site, "index.html"), encoding="utf-8").read())
        return m.group(1) if m else ""
    except OSError:
        return ""


def short(text, limit=200):
    text = " ".join(str(text or "").split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "…"


def quando(iso):
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return f"{t.day} {MESI[t.month - 1]} {t.year}, ore {t.hour}:{t.minute:02d}"
    except ValueError:
        return ""


def url_ok(u):
    u = str(u or "")
    return u if u.startswith("https://") or u.startswith("http://") else ""


# ---------------------------------------------------------------- glossario

def carica_glossario(site):
    try:
        gl = json.load(open(os.path.join(site, "data", "glossario.json"), encoding="utf-8"))
        return gl if isinstance(gl.get("voci"), list) else None
    except (OSError, ValueError, AttributeError):
        return None


def forme_glossario(gl):
    """per ogni voce: l'id, l'espressione che trova le sue forme negli articoli in italiano, le frasi da lasciare stare"""
    out = []
    for v in (gl or {}).get("voci") or []:
        x = v.get("it") if isinstance(v, dict) else None
        # negli articoli solo le parole davvero tecniche (tec), in grassetto con la loro nota
        if not x or not x.get("t") or not v.get("tec") or not SLUG.match(str(v.get("id") or "")):
            continue
        forme = x.get("m") if isinstance(x.get("m"), list) else [x["t"]] + list(x.get("alt") or [])
        forme = sorted({f for f in forme if isinstance(f, str) and f}, key=len, reverse=True)
        if forme:
            rx = re.compile(r"(?<![\w])(" + "|".join(re.escape(f) for f in forme) + r")(?![\w])", 0 if v.get("cs") else re.IGNORECASE)
            out.append((v["id"], rx, [str(n).lower() for n in x.get("no") or []], " ".join(str(x.get("d") or "").split())))
    return out


def collega_glossario(paragrafi, forme, quanti=6):
    """i paragrafi in HTML, con la prima volta di ogni parola del glossario che porta alla sua voce (al massimo «quanti»)"""
    trovati = []
    definizioni = {f[0]: f[3] for f in forme}
    for gid, rx, no, _d in forme:
        fatto = False
        for pi, t in enumerate(paragrafi):
            for m in rx.finditer(t):
                giro = t[max(0, m.start() - 25):m.end() + 25].lower()
                if not any(n in giro for n in no):
                    trovati.append((pi, m.start(), m.end(), gid))
                    fatto = True
                    break
            if fatto:
                break
    trovati.sort()
    scelti = []
    for x in trovati:
        if len(scelti) >= quanti:
            break
        if not any(y[0] == x[0] and x[1] < y[2] and y[1] < x[2] for y in scelti):
            scelti.append(x)
    out = []
    for pi, t in enumerate(paragrafi):
        pezzi, da = [], 0
        for _, a, b, gid in sorted(y for y in scelti if y[0] == pi):
            pezzi.append(E(t[da:a]) + f'<a class="gl-a" href="/glossario#{gid}" data-d="{E(definizioni.get(gid, ""))}">{E(t[a:b])}</a>')
            da = b
        out.append("".join(pezzi) + E(t[da:]))
    return out


def pagina_glossario(site, base, gl):
    """la pagina del glossario: le voci in italiano e in inglese (si vede la lingua scelta), a gruppi, in ordine alfabetico"""
    path = os.path.join(site, "glossario.html")
    try:
        pag = open(path, encoding="utf-8").read()
    except OSError:
        return
    if not gl or "<!--glossario-->" not in pag:
        return
    gruppi = gl.get("gruppi") or {}
    voci = [v for v in gl.get("voci") or [] if isinstance(v, dict) and SLUG.match(str(v.get("id") or "")) and (v.get("it") or {}).get("t") and (v.get("en") or {}).get("t")]
    chiave = lambda v: unicodedata.normalize("NFD", v["it"]["t"]).encode("ascii", "ignore").decode().lower()
    parti = ['<div class="prose gl">',
             '<h1><span data-only="it">Glossario</span><span data-only="en">Glossary</span></h1>',
             '<p class="sum" data-only="it">Le parole dell\'economia, dei mercati e della politica che tornano più spesso nelle notizie, spiegate in poche righe. '
             'Negli articoli le più tecniche sono in grassetto: passandoci sopra si legge la spiegazione, cliccandoci si arriva qui.</p>',
             '<p class="sum" data-only="en">The words of economics, markets and politics that keep coming back in the news, explained in a few lines. '
             'In the articles the most technical ones are in bold: hover over one to read the explanation, click it to come here.</p>']
    nav = []
    for k, (n_it, n_en) in gruppi.items():
        if any(v.get("g") == k for v in voci):
            nav.append(f'<a href="#gruppo-{E(k)}"><span data-only="it">{E(n_it)}</span><span data-only="en">{E(n_en)}</span></a>')
    if nav:
        parti.append('<nav class="gl-ind" aria-label="Gruppi">' + "".join(nav) + "</nav>")
    ld = {"@context": "https://schema.org", "@type": "DefinedTermSet", "name": "Il glossario di GERICO", "url": base + "/glossario", "inLanguage": "it", "hasDefinedTerm": []}
    for k, (n_it, n_en) in gruppi.items():
        lista = sorted((v for v in voci if v.get("g") == k), key=chiave)
        if not lista:
            continue
        # in inglese le voci si rimettono in ordine alfabetico con il loro nome inglese (order di CSS)
        ordine_en = {v["id"]: i for i, v in enumerate(sorted(lista, key=lambda v: v["en"]["t"].lower()))}
        parti.append(f'<section class="gl-g" aria-labelledby="gruppo-{E(k)}"><h2 id="gruppo-{E(k)}"><span data-only="it">{E(n_it)}</span><span data-only="en">{E(n_en)}</span></h2><dl class="gl-l">')
        for v in lista:
            it, en = v["it"], v["en"]
            parti.append(f'<div class="gl-v" id="{E(v["id"])}" style="--en:{ordine_en[v["id"]]}"><dt><span data-only="it">{E(it["t"])}</span><span data-only="en" lang="en">{E(en["t"])}</span></dt>'
                         f'<dd><span data-only="it">{E(it["d"])}</span><span data-only="en" lang="en">{E(en["d"])}</span></dd></div>')
            ld["hasDefinedTerm"].append({"@type": "DefinedTerm", "name": it["t"], "description": it["d"], "url": f'{base}/glossario#{v["id"]}'})
        parti.append("</dl></section>")
    parti.append('<p class="gl-piede" data-only="it">Manca una parola? Scrivila nella segnalazione sotto una storia.</p>'
                 '<p class="gl-piede" data-only="en">Missing a word? Write it in the report form under any story.</p>')
    parti.append("</div>")
    parti.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("</", "<\\/") + "</script>")
    blocco = "<!--glossario-->\n" + "\n".join(parti) + "\n<!--/glossario-->"
    nuova = re.sub(r"<!--glossario-->.*?<!--/glossario-->", lambda _: blocco, pag, flags=re.S)
    scrivi_se_cambia(path, nuova)


def puntate(sid, indice):
    """(le puntate precedenti della vicenda, dalla più recente; la puntata che viene dopo, o None) dall'indice dell'archivio."""
    prima, visti, cur = [], {sid}, (indice.get(sid) or {}).get("prev")
    while cur and cur not in visti and cur in indice and len(prima) < 8:
        visti.add(cur)
        prima.append(indice[cur])
        cur = indice[cur].get("prev")
    dopo = sorted([x for x in indice.values() if x.get("prev") == sid], key=lambda x: x.get("d") or "", reverse=True)
    return prima, (dopo[0] if dopo else None)


def pagina(s, base, v, altre, temi=None, altre_titolo="Le altre notizie di oggi", gloss=None, og=None, indice=None):
    sid = s["id"]
    titolo = " ".join(str(s["title"]).split())
    sezione = SEZIONI.get(s.get("section"), "Notizie")
    pub = s.get("firstSeen") if ISO.match(str(s.get("firstSeen") or "")) else ""
    mod = s.get("updated") if ISO.match(str(s.get("updated") or "")) else pub
    ph = s.get("photo") if isinstance(s.get("photo"), dict) else None
    fig = s.get("figure") if isinstance(s.get("figure"), dict) else None
    foto = ph and re.match(r"^img/foto/[\w.-]+\.jpg(\?v=\w+)?$", str(ph.get("src") or ""))
    # senza foto, l'anteprima disegnata da GERICO (scripts/anteprime.py): titolo e mappa o numero
    immagine = f"{base}/{ph['src']}" if foto else f"{base}/{og}" if og else f"{base}/assets/img/og-gerico.png"
    if foto:
        cred = "Foto: " + str(ph.get("author") or "") + (", " + ph["license"] if ph.get("license") else "") + ", da Wikimedia Commons"
        pag = url_ok(ph.get("page"))
        media = (f'<figure class="media foto st-media"><img class="in" src="/{E(ph["src"])}" alt="{E(str(ph.get("alt") or ""))}" width="{int(ph.get("w") or 1280)}" height="{int(ph.get("h") or 720)}" fetchpriority="high">'
                 f'<figcaption class="m-cred">' + (f'<a href="{E(pag)}" rel="noopener">{E(cred)}</a>' if pag else E(cred)) + "</figcaption></figure>")
    elif fig and isinstance(fig.get("value"), str) and isinstance(fig.get("label"), str):
        media = f'<figure class="media cifra st-media"><div class="cf-in"><b class="cf-v{" lungo" if len(fig["value"]) > 8 else ""}">{E(fig["value"])}</b><span class="cf-l">{E(fig["label"])}</span></div></figure>'
    else:
        media = ""
    testo = str(s.get("article") or "").strip() or str(s.get("summary") or "")
    paragrafi = [" ".join(p.split()) for p in re.split(r"\n\s*\n", testo) if p.strip()]
    articolo = "\n".join(f"<p>{p}</p>" for p in (collega_glossario(paragrafi, gloss) if gloss and s.get("article") else [E(p) for p in paragrafi]))
    aperte = [x for x in (s.get("open") or []) if isinstance(x, str) and x.strip()]
    open_html = ('<section class="blk"><h2 class="blk-h">Cosa non si sa ancora</h2><ul class="s-lista">' + "".join(f"<li>{E(x)}</li>" for x in aperte) + "</ul></section>") if aperte else ""
    fonti = [x for x in (s.get("sources") or []) if isinstance(x, dict) and x.get("name")]
    righe = []
    for x in fonti:
        u = url_ok(x.get("url"))
        nome = f'<a href="{E(u)}" rel="noopener">{E(str(x["name"]))}</a>' if u else E(str(x["name"]))
        righe.append(f"<li><b>{nome}</b>" + (f"<span>{E(str(x['angle']))}</span>" if x.get("angle") else "") + "</li>")
    # le testate non stanno nel testo: sono il piè di pagina dell'articolo, come in un quotidiano
    fonti_html = ('<section class="blk s-piede-fonti"><h2 class="blk-h">Fonti</h2><ul class="s-fonti">' + "".join(righe) + "</ul></section>") if fonti else ""
    # la vicenda a puntate: un articolo per giorno, legati da prev
    prima, dopo = puntate(sid, indice or {})
    seguito_html = (f'<p class="s-seguito">La vicenda è andata avanti: <a href="/s/{E(dopo["id"])}">{E(dopo.get("t") or "")}</a>'
                    + (f' <span>({E(quando(dopo.get("d")) or "")})</span>' if dopo.get("d") else "") + "</p>") if dopo else ""
    puntate_html = ('<section class="blk"><h2 class="blk-h">Le puntate precedenti</h2><ol class="s-puntate">' +
                    "".join(f'<li><a href="/s/{E(x["id"])}"><time datetime="{E(x.get("d") or "")}">{E(giorno_lungo(giorno_di(x.get("d"))) if x.get("d") else "")}</time>'
                            f'<span>{E(x.get("t") or "")}</span></a></li>' for x in prima) + "</ol></section>") if prima else ""
    altre_html = ('<section class="blk altre"><h2 class="blk-h">' + E(altre_titolo) + '</h2><ol class="altre-l">' +
                  "".join(f'<li><a href="/s/{E(a["id"])}"><span class="altre-n" aria-hidden="true">{i + 1:02d}</span><span class="altre-c"><span class="altre-k">{E(SEZIONI.get(a.get("section"), "Notizie"))}</span>'
                          f'<span class="altre-t">{E(" ".join(str(a["title"]).split()))}</span></span></a></li>' for i, a in enumerate(altre)) + "</ol></section>") if altre else ""
    ld = {"@context": "https://schema.org", "@type": "NewsArticle", "headline": titolo[:110], "description": short(s.get("summary"), 300),
          "image": [immagine], "articleSection": sezione, "inLanguage": "it", "isAccessibleForFree": True,
          "mainEntityOfPage": {"@type": "WebPage", "@id": f"{base}/s/{sid}"},
          "author": {"@type": "Organization", "name": "GERICO", "url": base + "/"},
          "publisher": {"@type": "Organization", "name": "GERICO", "url": base + "/", "logo": {"@type": "ImageObject", "url": base + "/assets/img/apple-touch-icon.png"}}}
    if pub:
        ld["datePublished"] = pub
    if mod:
        ld["dateModified"] = mod
    if fonti:
        ld["citation"] = [url_ok(x.get("url")) for x in fonti if url_ok(x.get("url"))][:12]
    if prima:
        ld["isBasedOn"] = f"{base}/s/{prima[0]['id']}"
    return PAGINA.format(title=E(short(titolo, 120)), title_full=E(titolo), desc=E(short(s.get("summary"))), summary=E(" ".join(str(s.get("summary") or "").split())),
                         base=base, id=sid, image=E(immagine), published=E(pub or ""), modified=E(mod or ""), section=E(sezione), sec_id=E(str(s.get("section") or "")),
                         quando=E(quando(mod) or ""), v=v, media=media, article=articolo, open=open_html, fonti=fonti_html, altre=altre_html,
                         temi=temi_storia(s, temi or {}), byline=BYLINE, seguito=seguito_html, puntate=puntate_html,
                         jsonld=json.dumps(ld, ensure_ascii=False).replace("</", "<\\/"))


def slug(testo):
    """«Intelligenza artificiale» → «intelligenza-artificiale»: il nome di un tema nell'indirizzo della sua pagina"""
    t = unicodedata.normalize("NFKD", str(testo)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:60]


def giorno_di(iso):
    """la data (a Roma, com'è scritta nella storia) di un'ora ISO: «2026-11-17»"""
    return str(iso or "")[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", str(iso or "")) else ""


def giorno_lungo(g):
    try:
        d = datetime.strptime(g, "%Y-%m-%d")
        return f"{GIORNI[d.weekday()]} {d.day} {MESI[d.month - 1]} {d.year}"
    except ValueError:
        return g


def voce(s):
    """una storia nell'indice dell'archivio: quello che serve alla ricerca, all'archivio e alle pagine dei temi"""
    pub = s.get("firstSeen") if ISO.match(str(s.get("firstSeen") or "")) else ""
    mod = s.get("updated") if ISO.match(str(s.get("updated") or "")) else pub
    v = {"id": s["id"], "t": " ".join(str(s["title"]).split()), "s": short(s.get("summary"), 220), "sec": str(s.get("section") or ""),
         "d": pub or mod, "u": mod or pub}
    tags = [" ".join(t.split()) for t in (s.get("tags") or []) if isinstance(t, str) and t.strip()][:8]
    if tags:
        v["tags"] = tags
    th = [t for t in (s.get("themes") or []) if isinstance(t, str) and SLUG.match(t)][:4]
    if th:
        v["th"] = th
    if s.get("scope") == "paese" and re.match(r"^[A-Z]{2}$", str(s.get("country") or "")):
        v["p"] = s["country"]
    if SAFE_ID.match(str(s.get("prev") or "")):
        v["prev"] = s["prev"]
    return v


def temi_pagine(indice):
    """i temi che hanno una pagina: {slug: (nome, [storie])}. I temi caldi della redazione (per id) e i temi delle
    storie con almeno MIN_TEMA storie; un tema delle storie con lo stesso nome di un tema caldo si unisce a lui"""
    storie = indice.get("storie") or []
    out = {}
    for tid, nome in (indice.get("temi") or {}).items():
        lista = [x for x in storie if tid in (x.get("th") or [])]
        if lista and SLUG.match(tid):
            out[tid] = (nome, lista)
    # un tema delle storie con lo stesso nome di un tema caldo («Israele» e il tema caldo «Israele») è lo stesso tema
    per_nome = {slug(n): k for k, (n, _l) in out.items()}
    conta = {}
    for x in storie:
        for t in x.get("tags") or []:
            k = per_nome.get(slug(t), slug(t))
            if x not in conta.setdefault(k, (t, []))[1]:
                conta[k][1].append(x)
    for sl, (nome, lista) in conta.items():
        if not SLUG.match(sl) or len(lista) < MIN_TEMA:
            continue
        if sl in out:
            ids = {x["id"] for x in out[sl][1]}
            out[sl] = (out[sl][0], out[sl][1] + [x for x in lista if x["id"] not in ids])
        else:
            out[sl] = (nome, lista)
    return {k: (n, sorted(l, key=lambda x: x.get("d") or "", reverse=True)) for k, (n, l) in out.items()}


def temi_storia(s, temi):
    """sotto una storia: i link alle pagine dei suoi temi"""
    voci = []
    for k in [t for t in (s.get("themes") or []) if isinstance(t, str)] + [slug(t) for t in (s.get("tags") or []) if isinstance(t, str)]:
        if k in temi and k not in [x[0] for x in voci]:
            voci.append((k, temi[k][0]))
    if not voci:
        return ""
    return ('<nav class="s-temi" aria-label="Temi della storia"><span>Tutte le storie su</span>' +
            "".join(f'<a href="/tema/{E(k)}">{E(n)}</a>' for k, n in voci[:6]) + "</nav>")


def aggiorna_archivio(site, buone, themes):
    """l'indice di tutte le storie: quelle dell'edizione si aggiornano, quelle uscite restano come erano"""
    path = os.path.join(site, "data", "archivio.json")
    try:
        prima = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        prima = {}
    per_id = {x["id"]: x for x in (prima.get("storie") or []) if isinstance(x, dict) and SAFE_ID.match(str(x.get("id") or ""))}
    for s in buone:
        per_id[s["id"]] = voce(s)
    temi = dict(prima.get("temi") or {})
    for t in themes or []:
        if isinstance(t, dict) and SLUG.match(str(t.get("id") or "")) and t.get("label"):
            temi[t["id"]] = " ".join(str(t["label"]).split())
    # solo le storie che hanno la loro pagina: un link dell'archivio non porta mai a una pagina che non c'è
    storie = sorted([x for x in per_id.values() if os.path.exists(os.path.join(site, "s", x["id"] + ".html"))],
                    key=lambda x: (x.get("d") or "", x["id"]), reverse=True)
    indice = {"temi": dict(sorted(temi.items())), "storie": storie}
    corpo = json.dumps(indice, ensure_ascii=False, separators=(",", ":"))
    if json.dumps({"temi": prima.get("temi") or {}, "storie": prima.get("storie") or []}, ensure_ascii=False, separators=(",", ":")) != corpo:
        with open(path, "w", encoding="utf-8") as f:
            f.write(json.dumps(dict(indice, aggiornato=datetime.now(timezone.utc).isoformat(timespec="seconds")), ensure_ascii=False, separators=(",", ":")) + "\n")
    return indice


def riga_lista(x, con_giorno=True):
    sez = SEZIONI.get(x.get("sec"), "Notizie")
    g = giorno_di(x.get("d"))
    meta = (E(giorno_lungo(g)) + " · " if con_giorno and g else "") + E(sez)
    return (f'<li><a href="/s/{E(x["id"])}"><span class="arch-k">{meta}</span><span class="arch-t">{E(x["t"])}</span>' +
            (f'<span class="arch-s">{E(x["s"])}</span>' if x.get("s") else "") + "</a></li>")


def pagina_lista(base, v, path, title, desc, h1, intro, corpo, briciole, elenco):
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": title, "description": desc, "url": base + path, "inLanguage": "it",
          "isPartOf": {"@type": "WebSite", "name": "GERICO", "url": base + "/"},
          "mainEntity": {"@type": "ItemList", "numberOfItems": len(elenco),
                         "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{base}/s/{x['id']}"} for i, x in enumerate(elenco[:100])]}}
    bric = "".join(f'<a href="{E(u)}">{E(n)}</a>' if u else f'<span aria-current="page">{E(n)}</span>' for n, u in briciole)
    return LISTA.format(title=E(title), desc=E(desc), base=base, path=path, v=v, h1=E(h1), intro=E(intro), corpo=corpo, briciole=bric,
                        jsonld=json.dumps(ld, ensure_ascii=False).replace("</", "<\\/"))


def pagine_archivio(site, base, v, indice):
    """l'archivio (mesi e temi), un mese per pagina e una pagina per tema; restituisce gli indirizzi per la sitemap"""
    storie = indice.get("storie") or []
    temi = temi_pagine(indice)
    mesi = {}
    for x in storie:
        g = giorno_di(x.get("d"))
        if g:
            mesi.setdefault(g[:7], []).append(x)
    indirizzi = []
    os.makedirs(os.path.join(site, "tema"), exist_ok=True)
    nome_mese = lambda m: f"{MESI[int(m[5:7]) - 1].capitalize()} {m[:4]}"
    for m, lista in mesi.items():
        giorni = {}
        for x in lista:
            giorni.setdefault(giorno_di(x["d"]), []).append(x)
        corpo = "".join(f'<section class="arch-g"><h2 class="blk-h">{E(giorno_lungo(g).capitalize())}</h2><ul class="arch-l">' +
                        "".join(riga_lista(x, False) for x in giorni[g]) + "</ul></section>" for g in sorted(giorni, reverse=True))
        n = len(lista)
        testo = pagina_lista(base, v, f"/archivio-{m}", f"Archivio di {nome_mese(m).lower()}", f"Le {n} storie di GERICO di {nome_mese(m).lower()}, giorno per giorno.",
                             nome_mese(m), f"Le {n} storie del mese, giorno per giorno, dalla più recente.", corpo,
                             [("Prima pagina", "/"), ("Archivio", "/archivio"), (nome_mese(m), "")], lista)
        scrivi_se_cambia(os.path.join(site, "archivio-" + m + ".html"), testo)
        indirizzi.append(f"/archivio-{m}")
    for k, (nome, lista) in temi.items():
        corpo = '<ul class="arch-l">' + "".join(riga_lista(x) for x in lista) + "</ul>"
        n = len(lista)
        testo = pagina_lista(base, v, f"/tema/{k}", f"{nome}, tutte le storie", f"Le storie di GERICO su {nome}, dalla più recente, ognuna scritta confrontando le testate.",
                             nome, (f"Le {n} storie" if n > 1 else "La storia") + " di GERICO su questo tema, dalla più recente. Ognuna è scritta confrontando quello che dicono le testate.",
                             corpo, [("Prima pagina", "/"), ("Archivio", "/archivio"), (nome, "")], lista)
        scrivi_se_cambia(os.path.join(site, "tema", k + ".html"), testo)
        indirizzi.append(f"/tema/{k}")
    # l'archivio: i mesi, i temi e gli ultimi sette giorni
    ultimi = {}
    for x in storie:
        g = giorno_di(x.get("d"))
        if g and (g in ultimi or len(ultimi) < 7):
            ultimi.setdefault(g, []).append(x)
    temi_ord = sorted(temi.items(), key=lambda kv: (-len(kv[1][1]), kv[1][0].lower()))
    corpo = ('<section class="arch-g"><h2 class="blk-h">I mesi</h2><ul class="arch-mesi">' +
             "".join(f'<li><a href="/archivio-{m}"><b>{E(nome_mese(m))}</b><span>{len(mesi[m])} storie</span></a></li>' for m in sorted(mesi, reverse=True)) + "</ul></section>" +
             ('<section class="arch-g"><h2 class="blk-h">I temi</h2><ul class="arch-temi">' +
              "".join(f'<li><a href="/tema/{E(k)}">{E(n)}<span>{len(l)}</span></a></li>' for k, (n, l) in temi_ord) + "</ul></section>" if temi else "") +
             "".join(f'<section class="arch-g"><h2 class="blk-h">{E(giorno_lungo(g).capitalize())}</h2><ul class="arch-l">' +
                     "".join(riga_lista(x, False) for x in ultimi[g]) + "</ul></section>" for g in sorted(ultimi, reverse=True)))
    testo = pagina_lista(base, v, "/archivio", "Archivio", f"Tutte le {len(storie)} storie di GERICO, mese per mese e tema per tema.", "Archivio",
                         f"Tutte le {len(storie)} storie uscite su GERICO, anche quelle che non sono più in prima pagina: per mese, per tema e, qui sotto, gli ultimi giorni.",
                         corpo, [("Prima pagina", "/"), ("Archivio", "")], storie)
    scrivi_se_cambia(os.path.join(site, "archivio.html"), testo)
    return ["/archivio"] + indirizzi, temi


BYLINE = '<p class="byline">A cura di <span class="by">R.P.</span></p>'
BYLINE_IA = '<p class="byline">A cura di <span class="by">R.P.</span><span class="sep" aria-hidden="true">·</span><span class="ia">Scritto con l\'intelligenza artificiale</span></p>'
PIEDE_IA = "<span>Articoli scritti con l'intelligenza artificiale</span>"
PIEDE = "<span>Articoli scritti con l'intelligenza artificiale, voce sintetica</span>"


def ripara_foto(site, in_edizione, v=""):
    """le pagine delle storie uscite dall'edizione restano, ma la loro foto può essere stata tolta (foto.py tiene solo
    quelle delle storie in corso): via il riquadro della foto e, come immagine dell'anteprima, quella di GERICO.
    Prendono anche la versione del foglio di stile di adesso e il manifest del sito installabile"""
    cartella, base = os.path.join(site, "s"), site_base(site)
    n = 0
    for f in os.listdir(cartella):
        if not f.endswith(".html") or f[:-5] in in_edizione:
            continue
        path = os.path.join(cartella, f)
        t = t2 = open(path, encoding="utf-8").read()
        m = re.search(r'src="/(img/foto/[\w.-]+\.jpg)', t)
        if m and not os.path.exists(os.path.join(site, m.group(1))):
            t2 = re.sub(r'<figure class="media foto st-media">.*?</figure>', "", t2, flags=re.S)
            t2 = re.sub(r'(https?://[^"\s]+)?/img/foto/[\w.-]+\.jpg(\?v=\w+)?', base + "/assets/img/og-gerico.png", t2)
        m = re.search(r'/(img/og/[\w.-]+\.jpg)', t2)
        if m and not os.path.exists(os.path.join(site, m.group(1))):
            t2 = re.sub(r'(https?://[^"\s]+)?/img/og/[\w.-]+\.jpg(\?v=\w+)?', base + "/assets/img/og-gerico.png", t2)
        if v:
            t2 = re.sub(r'(/assets/css/gerico\.css)\?v=[\w-]+', lambda x: x.group(1) + v, t2)
        # la firma resta «A cura di R.P.»: che il testo è scritto con l'intelligenza artificiale lo dice il piede (anche nelle
        # pagine vecchie)
        t2 = t2.replace(BYLINE_IA, BYLINE, 1)
        if PIEDE not in t2:
            t2 = t2.replace(PIEDE_IA, PIEDE)
        if 'rel="manifest"' not in t2 and "noindex" not in t2:
            t2 = t2.replace('<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">\n',
                            '<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">\n<link rel="manifest" href="/manifest.webmanifest">\n', 1)
        if t2 != t:
            n += scrivi_se_cambia(path, t2)
    return n


def scrivi_se_cambia(path, testo):
    if os.path.exists(path) and open(path, encoding="utf-8").read() == testo:
        return False
    with open(path, "w", encoding="utf-8") as f:
        f.write(testo)
    return True


def main(site):
    edition_path = os.path.join(site, "data", "edition.json")
    try:
        with open(edition_path, encoding="utf-8") as f:
            ed = json.load(f)
    except (OSError, ValueError) as e:
        sys.exit(f"ERRORE: {edition_path} non si legge ({e})")
    base, v = site_base(site), versione(site)
    out = os.path.join(site, "s")
    os.makedirs(out, exist_ok=True)
    live = [s for s in (ed.get("stories") or []) if isinstance(s, dict)]
    stories = [s for s in live + (ed.get("archive") or []) if isinstance(s, dict)]
    buone = [s for s in stories if SAFE_ID.match(str(s.get("id") or "")) and s.get("title")]
    skipped = [str(s.get("id") or "(senza id)") for s in stories if s not in buone]
    prime = sorted([s for s in live if s in buone and s.get("scope") != "paese"], key=lambda s: s.get("rank") or 99)
    # i temi con una pagina, dall'indice con le storie di adesso: le pagine delle storie hanno i link ai loro temi
    indice = {"temi": {}, "storie": []}
    try:
        indice = json.load(open(os.path.join(site, "data", "archivio.json"), encoding="utf-8"))
    except (OSError, ValueError):
        pass
    per_id = {x["id"]: x for x in (indice.get("storie") or []) if isinstance(x, dict) and x.get("id")}
    per_id.update({s["id"]: voce(s) for s in buone})
    temi_ora = dict(indice.get("temi") or {})
    temi_ora.update({t["id"]: t["label"] for t in (ed.get("themes") or []) if isinstance(t, dict) and t.get("id") and t.get("label")})
    temi_prima = temi_pagine({"temi": temi_ora, "storie": list(per_id.values())})
    gl = carica_glossario(site)
    gloss = forme_glossario(gl)
    pagina_glossario(site, base, gl)
    # le anteprime per chi condivide (scripts/anteprime.py): si tengono quelle delle storie degli ultimi 30 giorni
    limite = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    recenti = {i for i, x in per_id.items() if str(x.get("d") or "") >= limite[:10]} | {s["id"] for s in buone}
    try:
        import anteprime
        og = anteprime.anteprime(site, buone, recenti)
    except Exception as e:  # noqa: BLE001  senza anteprime le pagine usano l'immagine di GERICO
        print(f"anteprime: {type(e).__name__}: {e}")
        og = {}
    written = 0
    for s in buone:
        altre = [a for a in prime if a["id"] != s["id"]][:6]
        written += scrivi_se_cambia(os.path.join(out, s["id"] + ".html"), pagina(s, base, v, altre, temi_prima, gloss=gloss, og=og.get(s["id"]), indice=per_id))
    ripara_foto(site, {s["id"] for s in buone}, v)
    indice = aggiorna_archivio(site, buone, ed.get("themes"))
    extra, _temi = pagine_archivio(site, base, v, indice)

    # ---------- sitemap, con i campi di Google News per le storie delle ultime 48 ore ----------
    when = ed.get("generatedAt") or ""
    adesso = datetime.now(timezone.utc)
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">']
    for p in PAGES:
        mod = when if p == "" and ISO.match(when) else ""
        lines.append(f"<url><loc>{E(base + '/' + p)}</loc>" + (f"<lastmod>{mod}</lastmod>" if mod else "") + "</url>")
    n_urls = len(PAGES)
    for p in extra:
        lines.append(f"<url><loc>{E(base + p)}</loc></url>")
        n_urls += 1
    # il pensiero del giorno: l'elenco e una pagina per giorno (scripts/pensiero.py)
    if os.path.exists(os.path.join(site, "pensiero.html")):
        lines.append(f"<url><loc>{E(base + '/pensiero')}</loc></url>")
        n_urls += 1
    for f in sorted(os.listdir(os.path.join(site, "pensiero"))) if os.path.isdir(os.path.join(site, "pensiero")) else []:
        if re.match(r"^\d{4}-\d{2}-\d{2}\.html$", f):
            lines.append(f"<url><loc>{E(base + '/pensiero/' + f[:-5])}</loc><lastmod>{f[:-5]}</lastmod></url>")
            n_urls += 1
    # le storie uscite dall'edizione restano nella sitemap: la loro pagina c'è ancora (le date dall'indice)
    in_edizione = {s["id"] for s in buone}
    for x in indice.get("storie") or []:
        if x["id"] in in_edizione:
            continue
        mod = str(x.get("u") or "")
        lines.append(f"<url><loc>{E(base + '/s/' + x['id'])}</loc>" + (f"<lastmod>{mod}</lastmod>" if ISO.match(mod) else "") + "</url>")
        n_urls += 1
    for s in buone:
        mod = str(s.get("updated") or "")
        riga = f"<url><loc>{E(base + '/s/' + s['id'])}</loc>" + (f"<lastmod>{mod}</lastmod>" if ISO.match(mod) else "")
        pub = str(s.get("firstSeen") or "")
        try:
            fresca = ISO.match(pub) and adesso - datetime.fromisoformat(pub.replace("Z", "+00:00")) < timedelta(hours=48)
        except ValueError:
            fresca = False
        if fresca:
            riga += ("<news:news><news:publication><news:name>GERICO</news:name><news:language>it</news:language></news:publication>"
                     f"<news:publication_date>{pub}</news:publication_date><news:title>{E(' '.join(str(s['title']).split()))}</news:title></news:news>")
        lines.append(riga + "</url>")
        n_urls += 1
    lines.append("</urlset>")
    scrivi_se_cambia(os.path.join(site, "sitemap.xml"), "\n".join(lines) + "\n")

    # ---------- feed RSS: le ultime 30 storie, dalla più recente ----------
    def tempo(s):
        try:
            return datetime.fromisoformat(str(s.get("updated") or s.get("firstSeen") or "").replace("Z", "+00:00"))
        except ValueError:
            return datetime(2000, 1, 1, tzinfo=timezone.utc)
    voci = sorted([s for s in buone if s.get("scope") != "paese"], key=tempo, reverse=True)[:30]
    feed = ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>',
            "<title>GERICO</title>", f"<link>{E(base)}/</link>", f'<atom:link href="{E(base)}/feed.xml" rel="self" type="application/rss+xml"/>',
            "<description>Le notizie del giorno, scritte su tutte le fonti</description>", "<language>it</language>"]
    for s in voci:
        feed.append(f"<item><title>{E(' '.join(str(s['title']).split()))}</title><link>{E(base)}/s/{s['id']}</link><guid isPermaLink=\"true\">{E(base)}/s/{s['id']}</guid>"
                    f"<pubDate>{format_datetime(tempo(s))}</pubDate><category>{E(SEZIONI.get(s.get('section'), 'Notizie'))}</category>"
                    f"<description>{E(' '.join(str(s.get('summary') or '').split()))}</description></item>")
    feed.append("</channel></rss>")
    scrivi_se_cambia(os.path.join(site, "feed.xml"), "\n".join(feed) + "\n")

    # ---------- in prima pagina, per chi non esegue lo script: i titoli di oggi con il link alla loro pagina ----------
    idx = os.path.join(site, "index.html")
    try:
        page = open(idx, encoding="utf-8").read()
        m = re.search(r"<!--storie-->.*?<!--/storie-->", page, flags=re.S)
        if m:
            elenco = "".join(f'<li><a href="/s/{E(s["id"])}">{E(" ".join(str(s["title"]).split()))}</a></li>' for s in prime)
            nuovo = '<!--storie--><noscript><div class="wrap prose"><h2>Le notizie di oggi</h2><ul>' + elenco + "</ul></div></noscript><!--/storie-->"
            scrivi_se_cambia(idx, page[:m.start()] + nuovo + page[m.end():])
    except OSError:
        pass

    robots_path = os.path.join(site, "robots.txt")
    robots = open(robots_path, encoding="utf-8").read() if os.path.exists(robots_path) else "User-agent: *\nAllow: /\n"
    want = f"Sitemap: {base}/sitemap.xml"
    new = re.sub(r"(?m)^Sitemap:.*\n?", "", robots).rstrip("\n") + "\n\n" + want + "\n"
    if new != robots:
        with open(robots_path, "w", encoding="utf-8") as f:
            f.write(new)

    print(f"Pagine di condivisione: {len(buone)} storie, {written} pagine scritte o cambiate; sitemap con {n_urls} indirizzi.")
    if skipped:
        print("  saltate (id non valido o senza titolo): " + ", ".join(skipped))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
