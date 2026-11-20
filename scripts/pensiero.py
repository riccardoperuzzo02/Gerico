#!/usr/bin/env python3
"""«Il pensiero del giorno»: dal database della redazione alle pagine del sito.

Uso:
    python3 scripts/pensiero.py <cartella_db> <cartella_sito>

Legge <db>/pensiero/AAAA-MM-GG.json (li scrive il giro «pensiero», redazione/pensiero.md) e scrive:
- <sito>/pensiero/AAAA-MM-GG.html, la pagina di ogni pensiero (statica, per chi legge e per i motori di ricerca);
- <sito>/pensiero.html, l'elenco dei pensieri dal più recente;
- <sito>/data/pensiero.json, l'ultimo pensiero e l'elenco breve, che la prima pagina legge per il suo riquadro.
I file si riscrivono solo se cambiano. Un pensiero senza titolo o senza testo non si pubblica."""
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from share_pages import site_base, versione, short, giorno_lungo, scrivi_se_cambia  # noqa: E402

E = html.escape
DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")

TESTA = """<!doctype html>
<html lang="it" class="nuova">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} · GERICO</title>
<meta name="description" content="{desc}">
<meta name="robots" content="max-image-preview:large">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{ogtype}">
<meta property="og:site_name" content="GERICO">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{base}/assets/img/og-gerico.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0A1428" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="GERICO" href="/feed.xml">
<link rel="stylesheet" href="/assets/css/gerico.css{v}">
{jsonld}
</head>
<body class="pagina-s">
<header class="top no-line"><div class="wrap top-row"><a class="brand" href="/" aria-label="GERICO, prima pagina">GERICO</a></div></header>
<main id="main" class="wrap">
"""
PIEDE = """</main>
<footer class="foot"><div class="wrap">
<p class="foot-line"><a href="/">Prima pagina</a><a href="/pensiero">Il pensiero del giorno</a><a href="/archivio">Archivio</a><a href="/come-funziona.html">Come funziona</a><a href="/privacy.html">Privacy</a><span>Nessun consiglio di investimento</span><span>Articoli scritti con l'intelligenza artificiale, voce sintetica</span></p>
</div></footer>
</body>
</html>
"""


def carica(db):
    cartella = os.path.join(db, "pensiero")
    out = []
    for f in sorted(os.listdir(cartella)) if os.path.isdir(cartella) else []:
        if not (f.endswith(".json") and DATA.match(f[:-5])):
            continue
        try:
            p = json.load(open(os.path.join(cartella, f), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if str(p.get("title") or "").strip() and str(p.get("text") or "").strip():
            p["date"] = f[:-5]
            out.append(p)
    return sorted(out, key=lambda p: p["date"], reverse=True)


def pagina(p, base, v, storie, prima, dopo):
    url = f"{base}/pensiero/{p['date']}"
    titolo = " ".join(str(p["title"]).split())
    desc = short(p.get("summary") or p["text"], 200)
    par = [" ".join(x.split()) for x in re.split(r"\n\s*\n", str(p["text"])) if x.strip()]
    ld = {"@context": "https://schema.org", "@type": "OpinionNewsArticle", "headline": titolo[:110], "description": desc,
          "datePublished": p.get("asOf") or p["date"], "dateModified": p.get("asOf") or p["date"], "inLanguage": "it",
          "mainEntityOfPage": {"@type": "WebPage", "@id": url}, "image": [f"{base}/assets/img/og-gerico.png"],
          "author": {"@type": "Organization", "name": "GERICO", "url": base + "/"},
          "publisher": {"@type": "Organization", "name": "GERICO", "url": base + "/", "logo": {"@type": "ImageObject", "url": base + "/assets/img/apple-touch-icon.png"}}}
    collegate = [s for s in storie if s.get("id") in (p.get("stories") or [])]
    fonti = [x for x in p.get("sources") or [] if isinstance(x, dict) and x.get("name") and re.match(r"^https?://", str(x.get("url") or ""))]
    corpo = ['<article class="story-main s-art pensiero">',
             f'<p class="s-occhiello"><a href="/pensiero">Il pensiero del giorno</a> · <time datetime="{E(p["date"])}">{E(giorno_lungo(p["date"]))}</time></p>',
             (f'<p class="pz-tema">{E(str(p.get("tema") or ""))}</p>' if p.get("tema") else ""),
             f"<h1>{E(titolo)}</h1>",
             (f'<p class="sum">{E(str(p.get("summary") or ""))}</p>' if p.get("summary") else ""),
             '<p class="byline">Di <span class="by">GERICO</span><span class="sep" aria-hidden="true">·</span><span>Opinione</span></p>',
             '<div class="s-testo">' + "\n".join(f"<p>{E(x)}</p>" for x in par) + "</div>",
             '<p class="pz-nota">Il pensiero del giorno è il commento di GERICO: un\'opinione, distinta dagli articoli. I fatti vengono dalle notizie collegate qui sotto.</p>']
    if collegate:
        corpo.append('<section class="blk"><h2 class="blk-h">Le notizie da cui parte</h2><ol class="s-puntate">' + "".join(
            f'<li><a href="/s/{E(s["id"])}"><time>{E((s.get("section") or "").capitalize())}</time><span>{E(" ".join(str(s["title"]).split()))}</span></a></li>' for s in collegate) + "</ol></section>")
    if fonti:
        corpo.append('<section class="blk s-piede-fonti"><h2 class="blk-h">Fonti</h2><ul class="s-fonti">' + "".join(
            f'<li><b><a href="{E(x["url"])}" rel="noopener">{E(x["name"])}</a></b></li>' for x in fonti) + "</ul></section>")
    nav = []
    if prima:
        nav.append(f'<a href="/pensiero/{E(prima["date"])}"><span class="next-l">Il pensiero precedente</span><span class="next-t">{E(prima["title"])}</span></a>')
    if dopo:
        nav.append(f'<a href="/pensiero/{E(dopo["date"])}"><span class="next-l">Il pensiero dopo</span><span class="next-t">{E(dopo["title"])}</span></a>')
    if nav:
        corpo.append('<nav class="next pz-nav" aria-label="Altri pensieri">' + "".join(nav) + "</nav>")
    corpo.append("</article>")
    return TESTA.format(title=E(short(titolo, 120)), desc=E(desc), url=url, base=base, v=v, ogtype="article",
                        jsonld='<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("</", "<\\/") + "</script>") + "\n".join(x for x in corpo if x) + "\n" + PIEDE


def elenco(pensieri, base, v):
    righe = "".join(f'<li><a href="/pensiero/{E(p["date"])}"><time datetime="{E(p["date"])}">{E(giorno_lungo(p["date"]))}</time>'
                    f'<span>{E(" ".join(str(p["title"]).split()))}</span></a></li>' for p in pensieri)
    return TESTA.format(title="Il pensiero del giorno", desc="Ogni mattina GERICO sceglie un tema tra le notizie e dice come la pensa.",
                        url=f"{base}/pensiero", base=base, v=v, ogtype="website", jsonld="") + \
        ('<article class="story-main s-art pensiero"><h1>Il pensiero del giorno</h1><p class="sum">Ogni mattina GERICO sceglie un tema tra le notizie e dice come la pensa. '
         "È un'opinione, distinta dagli articoli.</p>" + (f'<ol class="s-puntate">{righe}</ol>' if righe else "<p>Il primo pensiero arriva domattina.</p>") + "</article>\n") + PIEDE


def main(db, site):
    pensieri = carica(db)
    base, v = site_base(site), versione(site)
    try:
        ed = json.load(open(os.path.join(site, "data", "edition.json"), encoding="utf-8"))
    except (OSError, ValueError):
        ed = {}
    storie = [s for s in (ed.get("stories") or []) + (ed.get("archive") or []) if isinstance(s, dict) and s.get("id") and s.get("title")]
    os.makedirs(os.path.join(site, "pensiero"), exist_ok=True)
    scritte = 0
    for i, p in enumerate(pensieri):
        dopo = pensieri[i - 1] if i > 0 else None
        prima = pensieri[i + 1] if i + 1 < len(pensieri) else None
        scritte += scrivi_se_cambia(os.path.join(site, "pensiero", p["date"] + ".html"), pagina(p, base, v, storie, prima, dopo))
    scritte += scrivi_se_cambia(os.path.join(site, "pensiero.html"), elenco(pensieri, base, v))
    dati = {"ultimo": None, "elenco": [{"date": p["date"], "title": p["title"]} for p in pensieri[:30]]}
    if pensieri:
        p = pensieri[0]
        dati["ultimo"] = {"date": p["date"], "asOf": p.get("asOf") or "", "title": p["title"], "tema": p.get("tema") or "",
                          "summary": p.get("summary") or "", "url": f"pensiero/{p['date']}"}
    scrivi_se_cambia(os.path.join(site, "data", "pensiero.json"), json.dumps(dati, ensure_ascii=False, separators=(",", ":")))
    print(f"  pensiero: {len(pensieri)} pensieri, {scritte} pagine scritte o cambiate")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
