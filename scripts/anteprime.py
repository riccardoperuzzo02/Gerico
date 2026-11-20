#!/usr/bin/env python3
"""L'anteprima di ogni storia quando la si condivide (WhatsApp, Telegram, social) e per Google Discover: 1200x630.

La usa share_pages.py come og:image delle pagine /s/<id> delle storie senza foto. Le storie con la foto usano la foto.
- Storie con la mappa: la mappa di GERICO (scripts/mappe.py) a tutta pagina, con il luogo della notizia a destra; a
  sinistra, su una sfumatura blu notte, il marchio, la sezione, il titolo e il luogo.
- Storie con il numero (figure): il titolo e, in grande, il numero con quello che misura.
Caratteri del sito (Newsreader e Atkinson Hyperlegible Next, licenza OFL, in scripts/social). La mappa si converte da SVG
con cairosvg; se non c'è, l'anteprima resta senza mappa ma con il resto. Si rifà solo quando cambia quello che mostra
(titolo, sezione, luogo, numero o mappa); le immagini delle storie uscite da più di 30 giorni si cancellano e le pagine
tornano all'immagine di GERICO (share_pages.ripara_foto).
"""
import hashlib
import io
import json
import os
import re

QUI = os.path.dirname(os.path.abspath(__file__))
CARATTERI = os.path.join(QUI, "social")
W, H = 1200, 630
M = 72
VERSIONE = 1   # cambiandola si rifanno tutte
NOTTE, NOTTE_2 = (10, 20, 40), (19, 36, 74)
BIANCO, CREMA, AZZURRO, GRIGIO, ROSSO = (255, 255, 255), (242, 233, 216), (169, 189, 235), (176, 188, 212), (229, 72, 77)
SEZIONI = {"mondo": "Mondo", "italia": "Italia", "economia": "Economia", "mercati": "Mercati", "tecnologia": "Tecnologia"}
SAFE = re.compile(r"^[a-z0-9][a-z0-9-]{0,150}$")


def _f(nome, size):
    from PIL import ImageFont
    return ImageFont.truetype(os.path.join(CARATTERI, nome), size)


def a_capo(testo, font, largo):
    righe, riga = [], ""
    for w in testo.split():
        prova = (riga + " " + w).strip()
        if riga and font.getlength(prova) > largo:
            righe.append(riga)
            riga = w
        else:
            riga = prova
    if riga:
        righe.append(riga)
    return righe


def mappa(site, img):
    """La mappa della storia come immagine 1200x630, con il luogo della notizia verso destra; None se non si può."""
    src = str((img or {}).get("src") or "").split("?")[0]
    if not re.match(r"^img/storie/[\w.-]+\.svg$", src) or not os.path.exists(os.path.join(site, src)):
        return None
    try:
        import cairosvg
        from PIL import Image
        png = cairosvg.svg2png(url=os.path.join(site, src), output_width=1600, output_height=900)
        m = Image.open(io.BytesIO(png)).convert("RGB")
    except Exception:  # noqa: BLE001  senza cairosvg (o con un SVG che non si legge) niente mappa
        return None
    fx, fy = (img.get("fx"), img.get("fy")) if isinstance(img.get("fx"), (int, float)) else (50, 50)
    # il luogo della notizia cade a quattro quinti della larghezza, lontano dal testo. Se è troppo a sinistra nella mappa,
    # a sinistra si allunga il blu notte (lì c'è comunque la sfumatura con il testo)
    largo = Image.new("RGB", (W + 1600, 900), NOTTE)
    largo.paste(m, (W, 0))
    x0 = int(min(max(W + fx / 100 * 1600 - 0.8 * W, 0), W + 1600 - W))
    y0 = int(min(max(fy / 100 * 900 - 0.5 * H, 0), 900 - H))
    return largo.crop((x0, y0, x0 + W, y0 + H))


def chiave(s, img):
    fig = s.get("figure") if isinstance(s.get("figure"), dict) else {}
    return hashlib.sha1(json.dumps([VERSIONE, s.get("title"), s.get("section"), (img or {}).get("src"), (img or {}).get("label"),
                                    fig.get("value"), fig.get("label")], ensure_ascii=False).encode()).hexdigest()[:12]


def disegna(s, site, path):
    from PIL import Image, ImageDraw
    img = s.get("img") if isinstance(s.get("img"), dict) else {}
    fig = s.get("figure") if isinstance(s.get("figure"), dict) and s.get("section") in ("economia", "mercati", "tecnologia") else None
    fondo = None if fig else mappa(site, img)
    if fondo is None:
        fondo = Image.new("RGB", (W, H), NOTTE)
        # un alone appena più chiaro a destra: profondità senza ombre
        alone = Image.radial_gradient("L").resize((W, W)).crop((0, (W - H) // 2, W, (W - H) // 2 + H))
        fondo = Image.composite(fondo, Image.new("RGB", (W, H), NOTTE_2), alone.point(lambda v: min(255, int(v * 1.1))))
    # la sfumatura che porta il testo: piena fino a 560 px, poi si apre dolcemente sulla mappa fino a 1020 px
    riga = []
    for x in range(W):
        t = min(1.0, max(0.0, (x - 560) / 460))
        riga.append(int(255 * (1 - t * t * (3 - 2 * t))))
    maschera = Image.new("L", (W, 1))
    maschera.putdata(riga)
    tela = Image.composite(Image.new("RGB", (W, H), NOTTE), fondo, maschera.resize((W, H)))
    d = ImageDraw.Draw(tela)
    largo = 600 if not fig else 640
    d.text((M - 3, 52), "Gerico.", font=_f("Newsreader-Display-ExtraBold.ttf", 54), fill=BIANCO)
    kicker = SEZIONI.get(s.get("section"), "Notizie").upper()
    d.text((M, 150), kicker, font=_f("AtkinsonNext-ExtraBold.ttf", 24), fill=AZZURRO)
    titolo = " ".join(str(s.get("title") or "").split())
    for size in range(62, 37, -2):
        tf = _f("Newsreader-Display-SemiBold.ttf", size)
        righe = a_capo(titolo, tf, largo)
        if len(righe) <= 4 and len(righe) * size * 1.12 <= 300:
            break
    righe = righe[:4]
    y = 192
    for r in righe:
        d.text((M, y), r, font=tf, fill=BIANCO)
        y += int(size * 1.12)
    piede = _f("AtkinsonNext-Medium.ttf", 26)
    if fig:
        # il numero della notizia, in grande, a destra
        v, lab = str(fig.get("value") or ""), str(fig.get("label") or "")
        for nsize in range(150, 70, -8):
            nf = _f("Newsreader-Display-ExtraBold.ttf", nsize)
            if nf.getlength(v) <= W - 760 - M:
                break
        d.text((W - M - nf.getlength(v), 210), v, font=nf, fill=CREMA)
        lf = _f("AtkinsonNext-Medium.ttf", 24)
        yy = 230 + nsize
        for r in a_capo(lab, lf, W - 760 - M)[:3]:
            d.text((W - M - lf.getlength(r), yy), r, font=lf, fill=GRIGIO)
            yy += 32
    else:
        luogo = str(img.get("label") or "")
        if luogo:
            # il segnaposto, disegnato: un cerchio rosso con il bordo bianco, come sulla mappa
            cy = H - 74
            d.ellipse((M, cy - 9, M + 18, cy + 9), fill=ROSSO, outline=BIANCO, width=3)
            d.text((M + 32, cy - 17), luogo, font=piede, fill=GRIGIO)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tela.save(path, "JPEG", quality=78, optimize=True, progressive=True)


def anteprime(site, storie, tenere):
    """Disegna l'anteprima delle storie senza foto; torna {id: indirizzo relativo con la versione}. `tenere`: gli id
    delle storie i cui file non si cancellano (quelle degli ultimi 30 giorni)."""
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("anteprime: senza Pillow, le pagine usano l'immagine di GERICO")
        return {}
    cartella = os.path.join(site, "img", "og")
    os.makedirs(cartella, exist_ok=True)
    indice_path = os.path.join(cartella, "indice.json")
    try:
        indice = json.load(open(indice_path, encoding="utf-8"))
    except (OSError, ValueError):
        indice = {}
    out, fatte = {}, 0
    for s in storie:
        sid = str(s.get("id") or "")
        if not SAFE.match(sid) or not s.get("title"):
            continue
        ph = s.get("photo") if isinstance(s.get("photo"), dict) else None
        if ph and re.match(r"^img/foto/[\w.-]+\.jpg(\?v=\w+)?$", str(ph.get("src") or "")):
            continue
        k = chiave(s, s.get("img"))
        path = os.path.join(cartella, sid + ".jpg")
        if indice.get(sid) != k or not os.path.exists(path):
            try:
                disegna(s, site, path)
            except Exception as e:  # noqa: BLE001  un'anteprima che non riesce non ferma niente
                print(f"anteprime: {sid}: {type(e).__name__}: {e}")
                continue
            indice[sid] = k
            fatte += 1
        out[sid] = f"img/og/{sid}.jpg?v={k[:8]}"
    tolte = 0
    for f in os.listdir(cartella):
        sid = f.rsplit(".", 1)[0]
        if f.endswith(".jpg") and sid not in tenere and sid not in out:
            os.remove(os.path.join(cartella, f))
            indice.pop(sid, None)
            tolte += 1
    with open(indice_path, "w", encoding="utf-8") as fh:
        json.dump(dict(sorted(indice.items())), fh, ensure_ascii=False, indent=0)
        fh.write("\n")
    print(f"anteprime: {fatte} nuove, {len(out)} storie con l'anteprima, {tolte} tolte")
    return out
