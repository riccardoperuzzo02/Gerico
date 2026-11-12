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
- site/sitemap.xml, con le storie e i campi di Google News per quelle delle ultime 48 ore;
- site/feed.xml, il feed RSS delle ultime storie;
- in index.html, tra i segni <!--storie--> e <!--/storie-->, l'elenco dei titoli di oggi per chi non esegue lo script;
- la riga Sitemap di robots.txt.
L'indirizzo del sito lo prende da og:url di index.html (lo scrive set_site_url.py)."""
import html
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime

SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,150}$")
FALLBACK = "https://gerico.financialnews.workers.dev"
PAGES = ["", "terminal", "come-funziona"]
SEZIONI = {"mondo": "Mondo", "italia": "Italia", "economia": "Economia", "mercati": "Mercati", "tecnologia": "Tecnologia"}
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
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
<meta property="article:published_time" content="{published}">
<meta property="article:modified_time" content="{modified}">
<meta property="article:section" content="{section}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0A1428" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
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
<p class="byline">A cura di <span class="by">R.P.</span></p>
<div class="s-testo">
{article}
</div>
{open}
{fonti}
<p class="s-apri"><a class="conto-b primario" href="/storia.html?id={id}">Apri la storia in GERICO</a><span>con la mappa, i temi da seguire e gli aggiornamenti</span></p>
</article>
{altre}
</main>
<footer class="foot"><div class="wrap">
<p class="foot-line"><a href="/">Prima pagina</a><a href="/come-funziona.html">Come funziona</a><a href="/privacy.html">Privacy</a><span>Nessun consiglio di investimento</span><span>Articoli scritti con l'intelligenza artificiale</span></p>
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


def pagina(s, base, v, altre):
    sid = s["id"]
    titolo = " ".join(str(s["title"]).split())
    sezione = SEZIONI.get(s.get("section"), "Notizie")
    pub = s.get("firstSeen") if ISO.match(str(s.get("firstSeen") or "")) else ""
    mod = s.get("updated") if ISO.match(str(s.get("updated") or "")) else pub
    ph = s.get("photo") if isinstance(s.get("photo"), dict) else None
    fig = s.get("figure") if isinstance(s.get("figure"), dict) else None
    foto = ph and re.match(r"^img/foto/[\w.-]+\.jpg(\?v=\w+)?$", str(ph.get("src") or ""))
    immagine = f"{base}/{ph['src']}" if foto else f"{base}/assets/img/og-gerico.png"
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
    articolo = "\n".join(f"<p>{E(' '.join(p.split()))}</p>" for p in re.split(r"\n\s*\n", testo) if p.strip())
    aperte = [x for x in (s.get("open") or []) if isinstance(x, str) and x.strip()]
    open_html = ('<section class="blk"><h2 class="blk-h">Cosa non si sa ancora</h2><ul class="s-lista">' + "".join(f"<li>{E(x)}</li>" for x in aperte) + "</ul></section>") if aperte else ""
    fonti = [x for x in (s.get("sources") or []) if isinstance(x, dict) and x.get("name")]
    righe = []
    for x in fonti:
        u = url_ok(x.get("url"))
        nome = f'<a href="{E(u)}" rel="noopener">{E(str(x["name"]))}</a>' if u else E(str(x["name"]))
        righe.append(f"<li><b>{nome}</b>" + (f"<span>{E(str(x['angle']))}</span>" if x.get("angle") else "") + "</li>")
    fonti_html = (f'<section class="blk"><h2 class="blk-h">Le {len(fonti)} fonti</h2><ul class="s-fonti">' + "".join(righe) + "</ul></section>") if len(fonti) > 1 else \
        ('<section class="blk"><h2 class="blk-h">La fonte</h2><ul class="s-fonti">' + "".join(righe) + "</ul></section>" if fonti else "")
    altre_html = ('<section class="blk altre"><h2 class="blk-h">Le altre notizie di oggi</h2><ol class="altre-l">' +
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
    return PAGINA.format(title=E(short(titolo, 120)), title_full=E(titolo), desc=E(short(s.get("summary"))), summary=E(" ".join(str(s.get("summary") or "").split())),
                         base=base, id=sid, image=E(immagine), published=E(pub or ""), modified=E(mod or ""), section=E(sezione), sec_id=E(str(s.get("section") or "")),
                         quando=E(quando(mod) or ""), v=v, media=media, article=articolo, open=open_html, fonti=fonti_html, altre=altre_html,
                         jsonld=json.dumps(ld, ensure_ascii=False).replace("</", "<\\/"))


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
    written = 0
    for s in buone:
        altre = [a for a in prime if a["id"] != s["id"]][:6]
        written += scrivi_se_cambia(os.path.join(out, s["id"] + ".html"), pagina(s, base, v, altre))

    # ---------- sitemap, con i campi di Google News per le storie delle ultime 48 ore ----------
    when = ed.get("generatedAt") or ""
    adesso = datetime.now(timezone.utc)
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">']
    for p in PAGES:
        mod = when if p == "" and ISO.match(when) else ""
        lines.append(f"<url><loc>{E(base + '/' + p)}</loc>" + (f"<lastmod>{mod}</lastmod>" if mod else "") + "</url>")
    n_urls = len(PAGES)
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
