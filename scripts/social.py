#!/usr/bin/env python3
"""L'immagine del giorno per Instagram (1080x1350) con le tre notizie principali, e la didascalia da copiare.

    python3 scripts/social.py site

Scrive site/img/social/AAAA-MM-GG.png e site/data/social.json ({immagine, didascalia, giorno, quando, storie}),
che il gestionale mostra nella sezione «Per Instagram»: Riccardo scarica l'immagine e copia il testo.
Solo testo, nessuna foto: i caratteri sono quelli del sito (Newsreader e Atkinson Hyperlegible Next, licenza OFL,
in scripts/social). L'immagine si rifà solo quando cambiano le tre notizie o il giorno, e se ne tengono sette giorni.
Didascalia senza lineette lunghe e senza due punti (scelta di Riccardo).
Non blocca mai la pubblicazione: senza Pillow, o con un errore, lo dice e finisce.
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    ROMA = ZoneInfo("Europe/Rome")
except Exception:  # senza il database dei fusi: l'ora italiana d'inverno
    ROMA = timezone(timedelta(hours=1))

QUI = os.path.dirname(os.path.abspath(__file__))
CARATTERI = os.path.join(QUI, "social")
W, H = 1080, 1350
MARGINE = 84
NAVY, INCHIOSTRO, GRIGIO, FILO, FONDO = (27, 47, 91), (15, 27, 51), (92, 102, 122), (214, 219, 228), (255, 255, 255)
GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
SEZIONI = {"mondo": "Mondo", "italia": "Italia", "economia": "Economia", "mercati": "Mercati", "tecnologia": "Tecnologia"}
TIENI = 7


def adesso():
    return datetime.now(ROMA)


def data_lunga(d):
    return f"{GIORNI[d.weekday()]} {d.day} {MESI[d.month - 1]}"


def recente(iso, ore=30):
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return datetime.now(timezone.utc) - t < timedelta(hours=ore)
    except ValueError:
        return False


def tre(ed):
    """le tre notizie: per importanza, prima quelle aggiornate nelle ultime 30 ore, poi le altre"""
    storie = [s for s in (ed.get("stories") or []) if isinstance(s, dict) and s.get("title") and s.get("id") and s.get("scope") != "paese"]
    storie.sort(key=lambda s: s.get("rank") or 99)
    fresche = [s for s in storie if recente(s.get("updated") or s.get("firstSeen"))]
    scelte = fresche[:3]
    for s in storie:
        if len(scelte) >= 3:
            break
        if s not in scelte:
            scelte.append(s)
    return scelte


def pulito(t):
    """niente lineette lunghe e niente due punti: una virgola al loro posto; le ore con il punto (14.30)"""
    t = " ".join(str(t or "").split())
    t = re.sub(r"(\d{1,2}):(\d{2})", r"\1.\2", t)
    t = re.sub(r"\s*[—–]\s*", ", ", t)
    t = re.sub(r"\s*:\s*", ", ", t)
    return re.sub(r",\s*,", ",", t).strip(" ,")


def parti(s):
    """l'occhiello e il titolo: «Iran-Usa: terza portaerei…» diventa IRAN-USA sopra e il resto sotto"""
    t = " ".join(str(s.get("title") or "").split())
    m = re.match(r"^([^:]{2,32}):\s+(.+)$", t)
    if m:
        resto = m.group(2)
        return m.group(1), pulito(resto[:1].upper() + resto[1:])
    return SEZIONI.get(s.get("section"), "Notizie"), pulito(t)


def didascalia(scelte, giorno):
    righe = [f"Le tre notizie di oggi, {data_lunga(giorno)}.", ""]
    for i, s in enumerate(scelte, 1):
        # «Iran-Usa: terza portaerei…» diventa «Iran-Usa. Terza portaerei…»
        t = " ".join(str(s.get("title") or "").split())
        m = re.match(r"^([^:]{2,32}):\s+(.+)$", t)
        righe.append(f"{i}. " + (pulito(m.group(1)) + ". " + pulito(m.group(2)[:1].upper() + m.group(2)[1:]) if m else pulito(t)))
    righe += ["", "Le storie intere, con tutte le fonti, su GERICO. Il link è nella bio.", "",
              "#notizie #attualità #mondo #economia #GERICO"]
    return pulito_righe("\n".join(righe))


def pulito_righe(t):
    return "\n".join(pulito(r) if r.strip() else "" for r in t.split("\n"))


def a_capo(testo, font, largo):
    righe, riga = [], ""
    for parola in testo.split():
        prova = (riga + " " + parola).strip()
        if font.getlength(prova) <= largo or not riga:
            riga = prova
        else:
            righe.append(riga)
            riga = parola
    if riga:
        righe.append(riga)
    return righe


def disegna(scelte, giorno, path):
    from PIL import Image, ImageDraw, ImageFont

    def f(nome, size):
        return ImageFont.truetype(os.path.join(CARATTERI, nome), size)

    img = Image.new("RGB", (W, H), FONDO)
    d = ImageDraw.Draw(img)
    largo = W - 2 * MARGINE
    # la testata: «Gerico.» e il giorno
    marchio = f("Newsreader-Display-ExtraBold.ttf", 112)
    d.text((MARGINE - 4, 70), "Gerico.", font=marchio, fill=NAVY)
    occhio = f("AtkinsonNext-ExtraBold.ttf", 28)
    d.text((MARGINE, 222), "LE TRE NOTIZIE DI OGGI", font=occhio, fill=NAVY)
    data = f("AtkinsonNext-Medium.ttf", 30)
    testo_data = data_lunga(giorno).capitalize()
    d.text((W - MARGINE - data.getlength(testo_data), 220), testo_data, font=data, fill=GRIGIO)
    alto, basso = 290, H - 190
    d.line([(MARGINE, alto - 10), (W - MARGINE, alto - 10)], fill=NAVY, width=4)
    # i titoli: il carattere più grande che fa stare le tre notizie nello spazio (al massimo quattro righe l'una)
    kicker = f("AtkinsonNext-ExtraBold.ttf", 26)
    for size in range(62, 37, -2):
        tf = f("Newsreader-Display-SemiBold.ttf", size)
        blocchi = [(k, a_capo(t, tf, largo - 70)) for k, t in (parti(s) for s in scelte)]
        # oltre quattro righe il titolo si taglia (succede solo con il carattere più piccolo)
        blocchi = [(k, r if len(r) <= 4 else r[:3] + [r[3].rstrip(",;.") + "…"]) for k, r in blocchi]
        passo = int(size * 1.14)
        tot = sum(46 + len(r) * passo for _, r in blocchi) + 60 * (len(blocchi) - 1)
        if tot <= basso - alto - 40 and all(len(r) <= 4 for _, r in blocchi):
            break
    spazio = (basso - alto - tot) / 2
    y = alto + max(20, spazio)
    numero = f("Newsreader-Display-ExtraBold.ttf", 58)
    for i, (k, righe) in enumerate(blocchi):
        if i:
            d.line([(MARGINE + 70, y - 32), (W - MARGINE, y - 32)], fill=FILO, width=2)
        d.text((MARGINE, y - 8), str(i + 1), font=numero, fill=NAVY)
        d.text((MARGINE + 70, y), k.upper(), font=kicker, fill=GRIGIO)
        y += 46
        for r in righe:
            d.text((MARGINE + 70, y), r, font=tf, fill=INCHIOSTRO)
            y += passo
        y += 60
    # il piede: dove leggere e le due note di sempre
    d.line([(MARGINE, H - 170), (W - MARGINE, H - 170)], fill=FILO, width=2)
    piede = f("AtkinsonNext-ExtraBold.ttf", 32)
    d.text((MARGINE, H - 142), "Le storie intere, con tutte le fonti, su GERICO", font=piede, fill=NAVY)
    nota = f("AtkinsonNext-Medium.ttf", 24)
    d.text((MARGINE, H - 88), "Articoli scritti con l'intelligenza artificiale · Nessun consiglio di investimento", font=nota, fill=GRIGIO)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # pochi colori: il file pesa poco
    img.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(path, optimize=True)


def main(site):
    try:
        ed = json.load(open(os.path.join(site, "data", "edition.json"), encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"social: edizione non letta ({e}), niente immagine")
        return
    scelte = tre(ed)
    if len(scelte) < 3:
        print("social: meno di tre notizie, niente immagine")
        return
    giorno = adesso()
    g = giorno.date().isoformat()
    dati_path = os.path.join(site, "data", "social.json")
    try:
        prima = json.load(open(dati_path, encoding="utf-8"))
    except (OSError, ValueError):
        prima = {}
    firma = [[s["id"], s.get("title")] for s in scelte]
    rel = f"img/social/{g}.png"
    png = os.path.join(site, rel)
    if prima.get("giorno") == g and prima.get("firma") == firma and os.path.exists(png):
        print("social: le tre notizie sono le stesse, l'immagine resta")
    else:
        try:
            disegna(scelte, giorno, png)
        except ImportError:
            print("social: Pillow non c'è, niente immagine")
            return
        dati = {"immagine": rel, "didascalia": didascalia(scelte, giorno), "giorno": g, "quando": giorno.isoformat(timespec="seconds"),
                "storie": [s["id"] for s in scelte], "firma": firma}
        with open(dati_path, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(dati, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"social: {rel} ({os.path.getsize(png) // 1024} kB)")
    # le immagini più vecchie di una settimana se ne vanno
    cartella = os.path.join(site, "img", "social")
    limite = (giorno.date() - timedelta(days=TIENI)).isoformat()
    for nome in sorted(os.listdir(cartella)) if os.path.isdir(cartella) else []:
        if re.match(r"^\d{4}-\d{2}-\d{2}\.png$", nome) and nome[:10] < limite:
            os.remove(os.path.join(cartella, nome))


if __name__ == "__main__":
    try:
        main(sys.argv[1] if len(sys.argv) > 1 else "site")
    except Exception as e:  # l'immagine non deve mai fermare la pubblicazione
        print(f"social: errore {type(e).__name__}: {e}")
