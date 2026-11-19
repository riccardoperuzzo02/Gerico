#!/usr/bin/env python3
"""Le immagini delle storie: una mappa del luogo della notizia, disegnata da GERICO.

Uso (per provare una mappa):
    python3 scripts/mappe.py <file.svg> PL [IR SA ...] [--citta Cracovia 50.06 19.94]

I confini sono quelli di Natural Earth (pubblico dominio), nel pacchetto world-atlas (licenza ISC): stanno in scripts/mappe
con la tabella dei paesi (sigla ISO a due lettere, numero ISO, nome italiano e inglese). Niente foto di agenzia: hanno i
diritti d'autore, e caricarle da un altro sito farebbe sapere a terzi chi legge GERICO.

Ogni storia può avere:
    places  le sigle dei paesi della notizia, il primo è quello principale (["YE", "SA", "IR"]); "EU" vale i 27 dell'Unione
    city    il luogo preciso, {"name": "Cracovia", "lat": 50.06, "lon": 19.94}: il punto si disegna solo se cade dentro
            il paese principale (una coordinata sbagliata non finisce sulla mappa)
Senza places i paesi si cercano nell'occhiello del titolo («Polonia: ...», «Iran-Usa: ...»); senza niente, il mondo
senza paesi evidenziati. La mappa è sempre la stessa per gli stessi dati: il file cambia solo se cambia la notizia."""
import hashlib
import json
import math
import os
import re
import sys

QUI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mappe")
W, H = 640, 360
R_KM = 6371.0
UE = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
      "NL", "PL", "PT", "RO", "SE", "SI", "SK"]
# colori: notte blu navy come il marchio, il paese della notizia in crema, quelli coinvolti in azzurro, il luogo in rosso.
# Una sola versione per il tema chiaro e scuro: sulla pagina sta come una foto
MARE_C, MARE_B = "#21376A", "#13244A"
TERRA, CONFINE = "#2C4477", "#4A659E"
ALTRI, ALTRI_B = "#6C86BC", "#9DB1DA"
PRIMO, PRIMO_B = "#F2E9D8", "#FFFFFF"
PUNTO = "#E5484D"

# altri nomi, nei titoli italiani, per i paesi della tabella
ALIAS = {
    "usa": "US", "stati uniti": "US", "america": "US", "wall street": "US", "washington": "US", "casa bianca": "US",
    "uk": "GB", "gran bretagna": "GB", "inghilterra": "GB", "scozia": "GB", "londra": "GB",
    "cisgiordania": "PS", "gaza": "PS", "striscia di gaza": "PS", "hebron": "PS", "palestinesi": "PS",
    "italia": "IT", "piazza affari": "IT", "roma": "IT", "btp": "IT", "vaticano": "VA", "santa sede": "VA",
    "russia": "RU", "mosca": "RU", "cremlino": "RU", "cina": "CN", "pechino": "CN", "corea del sud": "KR", "seul": "KR",
    "corea del nord": "KP", "taiwan": "TW", "iran": "IR", "teheran": "IR", "israele": "IL", "ucraina": "UA", "kiev": "UA",
    "germania": "DE", "berlino": "DE", "francia": "FR", "parigi": "FR", "spagna": "ES", "madrid": "ES", "giappone": "JP",
    "tokyo": "JP", "olanda": "NL", "paesi bassi": "NL", "repubblica ceca": "CZ", "cechia": "CZ", "turchia": "TR",
    "birmania": "MM", "myanmar": "MM", "siria": "SY", "kosovo": "XK", "ue": "EU", "unione europea": "EU", "europa": "EU",
    "bruxelles": "EU", "bce": "EU", "eurozona": "EU", "emirati": "AE", "arabia saudita": "SA", "riad": "SA",
}

_PAESI = None
_FORME = None


def paesi():
    global _PAESI
    if _PAESI is None:
        with open(os.path.join(QUI, "paesi.json"), encoding="utf-8") as f:
            _PAESI = json.load(f)
    return _PAESI


def forme():
    """I paesi della mappa: {chiave: [poligoni]}, ogni poligono una lista di anelli (il primo il bordo, poi i buchi),
    ogni anello una lista di (lon, lat). La chiave è il numero ISO o, per chi non lo ha (Kosovo), il nome."""
    global _FORME
    if _FORME is None:
        with open(os.path.join(QUI, "countries-50m.json"), encoding="utf-8") as f:
            t = json.load(f)
        (sx, sy), (tx, ty) = t["transform"]["scale"], t["transform"]["translate"]
        archi = []
        for a in t["arcs"]:
            x = y = 0
            pts = []
            for dx, dy in a:
                x += dx
                y += dy
                pts.append((x * sx + tx, y * sy + ty))
            archi.append(pts)

        def anello(idx):
            out = []
            for i in idx:
                pts = archi[i] if i >= 0 else archi[~i][::-1]
                out.extend(pts if not out else pts[1:])
            # continuo anche dove passa l'antimeridiano (la Russia arriva a 190 gradi invece di saltare a -170)
            for j in range(1, len(out)):
                d = out[j][0] - out[j - 1][0]
                if d > 180 or d < -180:
                    k = 360 * round(d / 360)
                    out[j] = (out[j][0] - k, out[j][1])
            return out
        _FORME = {}
        for g in t["objects"]["countries"]["geometries"]:
            if g["type"] == "Polygon":
                polys = [[anello(r) for r in g["arcs"]]]
            elif g["type"] == "MultiPolygon":
                polys = [[anello(r) for r in p] for p in g["arcs"]]
            else:
                continue
            # l'Antartide e le isole vicine non servono e girano intorno al polo: fuori
            polys = [p for p in polys if p and p[0] and min(q[1] for q in p[0]) > -60]
            if polys:
                _FORME[g.get("id") or g["properties"]["name"]] = polys
    return _FORME


def chiave(sigla):
    p = paesi().get(sigla)
    if not p:
        return None
    k = p.get("n") or p.get("ne")
    return k if k in forme() else None


def nome(sigla, lingua="it"):
    p = paesi().get(sigla)
    return p[lingua] if p else sigla


# ---------- geometria ----------
def area(r):
    """Area dell'anello in gradi quadrati corretti per la latitudine (basta per confrontare)."""
    if len(r) < 3:
        return 0.0
    lat = sum(p[1] for p in r) / len(r)
    k = math.cos(math.radians(lat))
    s = 0.0
    for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]):
        s += (x0 * k) * y1 - (x1 * k) * y0
    return abs(s) / 2


def centro(r):
    """Il centro dell'anello (baricentro piano in lon/lat: i poligoni di Natural Earth non passano l'antimeridiano)."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if abs(a) < 1e-12:
        return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)
    return cx / (3 * a), cy / (3 * a)


def vettore(lon, lat):
    l, p = math.radians(lon), math.radians(lat)
    return (math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p))


def lonlat(v):
    x, y, z = v
    n = math.sqrt(x * x + y * y + z * z) or 1
    return math.degrees(math.atan2(y, x)), math.degrees(math.asin(max(-1, min(1, z / n))))


def km(a, b):
    va, vb = vettore(*a), vettore(*b)
    d = max(-1.0, min(1.0, sum(x * y for x, y in zip(va, vb))))
    return math.acos(d) * R_KM


def dentro(pt, polys):
    """Il punto (lon, lat) sta dentro uno dei poligoni (e non in un suo buco)?"""
    x, y = pt

    def in_anello(r):
        nonlocal x
        c = False
        for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]):
            if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
                c = not c
        return c
    for sh in (0, 360, -360):
        x = pt[0] + sh
        if any(in_anello(p[0]) and not any(in_anello(h) for h in p[1:]) for p in polys):
            return True
    return False


def vicino(pt, polys, limite_km):
    """Il punto è a meno di limite_km da un vertice del confine? (Per le città sulla costa e per le isole troppo piccole
    per essere disegnate: i confini sono semplificati.)"""
    dlat = limite_km / 111.0 + 0.1
    dlon = limite_km / (111.0 * max(0.2, math.cos(math.radians(pt[1])))) + 0.1
    for p in polys:
        for r in p:
            for v in r:
                if abs(v[1] - pt[1]) < dlat and min(abs(v[0] - pt[0] - sh) for sh in (0, 360, -360)) < dlon and km(v, pt) < limite_km:
                    return True
    return False


def luogo_valido(pt, k, tutte):
    """Il luogo sta nel paese principale: dentro i suoi confini, sulla costa, o su una sua isola troppo piccola per la
    mappa (Lampedusa): in mare o comunque fuori dagli altri paesi, a meno di 350 km dal paese. Una coordinata sbagliata
    (latitudine e longitudine scambiate, un altro paese) non passa."""
    if not (-180 <= pt[0] <= 180 and -90 <= pt[1] <= 90):
        return False
    if dentro(pt, tutte[k]) or vicino(pt, tutte[k], 25):
        return True
    return vicino(pt, tutte[k], 350) and not any(dentro(pt, polys) for kk, polys in tutte.items() if kk != k)


def nucleo(polys):
    """I poligoni che fanno il paese sulla mappa: il più grande e quelli vicini non troppo piccoli (il Giappone con le
    sue isole, gli Stati Uniti senza Alaska e Hawaii, la Francia senza la Guyana)."""
    if not polys:
        return []
    big = max(polys, key=lambda p: area(p[0]))
    a0, c0 = area(big[0]), centro(big[0])
    return [p for p in polys if p is big or (area(p[0]) >= 0.1 * a0 and km(centro(p[0]), c0) < 2500)]


class Laea:
    """Proiezione azimutale equivalente di Lambert, centrata sulla notizia: vista dall'alto, come un mappamondo."""

    def __init__(self, lon0, lat0):
        self.l0 = math.radians(lon0)
        self.s0, self.c0 = math.sin(math.radians(lat0)), math.cos(math.radians(lat0))

    def cosc(self, lon, lat):
        p = math.radians(lat)
        return self.s0 * math.sin(p) + self.c0 * math.cos(p) * math.cos(math.radians(lon) - self.l0)

    def __call__(self, lon, lat):
        l, p = math.radians(lon) - self.l0, math.radians(lat)
        cp, sp, cl = math.cos(p), math.sin(p), math.cos(l)
        cc = self.s0 * sp + self.c0 * cp * cl
        k = math.sqrt(2 / (1 + cc)) if cc > -0.999 else 45.0
        return k * cp * math.sin(l), k * (self.c0 * sp - self.s0 * cp * cl)


    def pezzi(self, r):
        """L'anello da disegnare: niente se passa vicino al punto opposto al centro (lì la proiezione si strappa)."""
        return [] if any(self.cosc(lon, lat) < -0.866 for lon, lat in r) else [r]


class EqualEarth:
    """Il mondo intero (Equal Earth, Šavrič, Patterson e Jenny 2018), per le notizie con paesi lontani tra loro."""
    A1, A2, A3, A4, M = 1.340264, -0.081106, 0.000893, 0.003796, math.sqrt(3) / 2

    def __init__(self, lon0):
        self.lon0 = lon0

    def cosc(self, lon, lat):
        return 1.0

    def __call__(self, lon, lat):
        lam, p = math.radians(lon - self.lon0), math.radians(lat)
        t = math.asin(self.M * math.sin(p))
        t2 = t * t
        t6 = t2 * t2 * t2
        return (lam * math.cos(t) / (self.M * (self.A1 + 3 * self.A2 * t2 + t6 * (7 * self.A3 + 9 * self.A4 * t2))),
                t * (self.A1 + self.A2 * t2 + t6 * (self.A3 + self.A4 * t2)))

    def pezzi(self, r):
        """L'anello tagliato all'antimeridiano della mappa: i pezzi stanno tra lon0-180 e lon0+180."""
        pts = [(lon - self.lon0, lat) for lon, lat in r]
        k = 360 * round(sum(q[0] for q in pts) / len(pts) / 360)
        pts = [(x - k, y) for x, y in pts]
        if min(q[0] for q in pts) >= -180 and max(q[0] for q in pts) <= 180:
            return [[(x + self.lon0, y) for x, y in pts]]
        out = []
        for sh in (-360, 0, 360):
            c = taglia([(x + sh, y) for x, y in pts], -180, -90, 180, 90)
            if len(c) >= 3:
                out.append([(x + self.lon0, y) for x, y in c])
        return out


def taglia(pts, x0, y0, x1, y1):
    """Sutherland-Hodgman: il poligono ritagliato nel rettangolo."""
    def lato(pts, fuori, punto):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            fa, fb = fuori(a), fuori(b)
            if not fb:
                if fa:
                    out.append(punto(a, b))
                out.append(b)
            elif not fa:
                out.append(punto(a, b))
        return out

    def ix(a, b, x):
        t = (x - a[0]) / (b[0] - a[0])
        return (x, a[1] + t * (b[1] - a[1]))

    def iy(a, b, y):
        t = (y - a[1]) / (b[1] - a[1])
        return (a[0] + t * (b[0] - a[0]), y)
    for fuori, punto in ((lambda p: p[0] < x0, lambda a, b: ix(a, b, x0)), (lambda p: p[0] > x1, lambda a, b: ix(a, b, x1)),
                         (lambda p: p[1] < y0, lambda a, b: iy(a, b, y0)), (lambda p: p[1] > y1, lambda a, b: iy(a, b, y1))):
        if not pts:
            break
        pts = lato(pts, fuori, punto)
    return pts


def num(v):
    s = "%.1f" % v
    return s[:-2] if s.endswith(".0") else s


def _d(n):
    """Decimi interi in testo corto: 15 -> 1.5, -5 -> -.5, 20 -> 2."""
    s = str(abs(n) // 10) if n % 10 == 0 else "%d.%d" % (abs(n) // 10, abs(n) % 10)
    if s.startswith("0."):
        s = s[1:]
    return ("-" + s) if n < 0 else s


def _unisci(nums):
    out = ""
    for t in nums:
        out += t if (not out or t.startswith("-")) else " " + t
    return out


def percorso(pts, chiuso):
    """Il percorso SVG: il primo punto assoluto, gli altri relativi, in decimi di pixel."""
    q = [(int(round(x * 10)), int(round(y * 10))) for x, y in pts]
    out = [q[0]]
    for p in q[1:]:
        if p != out[-1]:
            out.append(p)
    if len(out) < (3 if chiuso else 2):
        return ""
    rel = []
    for (x0, y0), (x1, y1) in zip(out, out[1:]):
        rel += [_d(x1 - x0), _d(y1 - y0)]
    return "M" + _unisci([_d(out[0][0]), _d(out[0][1])]) + "l" + _unisci(rel) + ("z" if chiuso else "")


def semplifica(pts, eps):
    """Douglas-Peucker: via i punti che si scostano meno di eps pixel dalla linea."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    pila = [(0, len(pts) - 1)]
    e2 = eps * eps
    while pila:
        a, b = pila.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px_, py_ = pts[i]
            if L == 0:
                d = (px_ - ax) ** 2 + (py_ - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px_ - ax) * dx + (py_ - ay) * dy) / L))
                d = (ax + t * dx - px_) ** 2 + (ay + t * dy - py_) ** 2
            if d > best:
                best, bi = d, i
        if best > e2:
            keep[bi] = True
            pila += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


# ---------- la mappa ----------
GRANDE_KM2 = 4.0e6     # Russia, Canada, Stati Uniti, Cina, Brasile, Australia
VICINO_KM = 1800       # di un paese grandissimo accanto alla notizia si guarda solo la parte vicina
LONTANO_KM = 6000      # paesi più lontani di così tra loro: il mondo intero


def km2(r):
    """Area dell'anello in km² (approssimata: basta per dire se un paese è grandissimo)."""
    return area(r) * (math.pi / 180 * R_KM) ** 2


def disegna(sigle, city=None):
    """L'SVG della mappa, il punto del luogo usato (o None) e il fuoco: dove sta il luogo della notizia nel riquadro,
    in percentuale (x, y), oppure None. sigle: il primo paese è il principale."""
    sigle = [s for s in sigle if s]
    if "EU" in sigle:
        i = sigle.index("EU")
        sigle = sigle[:i] + [s for s in UE if s not in sigle] + sigle[i + 1:]
    tutte = forme()
    chiavi = []
    for s in sigle:
        k = chiave(s)
        if k and k not in chiavi:
            chiavi.append(k)
    eu = len(chiavi) > 10
    primi = set(chiavi[:1]) if not eu else set(chiavi)
    altri = set(chiavi[1:]) - primi
    punto = None
    if city and chiavi and isinstance(city.get("lat"), (int, float)) and isinstance(city.get("lon"), (int, float)):
        pt = (float(city["lon"]), float(city["lat"]))
        if luogo_valido(pt, chiavi[0], tutte):
            punto = pt
    # dove guardare: il paese principale intero; degli altri tutto, ma dei grandissimi (la Russia accanto all'Ucraina)
    # solo la parte vicina. Se un paese è lontano (gli Stati Uniti per una notizia sull'Iran), il mondo intero
    focus, mondo = [], not chiavi
    if chiavi:
        n0 = nucleo(tutte[chiavi[0]])
        c0 = centro(max(n0, key=lambda p: area(p[0]))[0])
        for p in n0:
            focus.append(p[0])
        for k in chiavi[1:]:
            nk = nucleo(tutte[k])
            grande = sum(km2(p[0]) for p in nk) > GRANDE_KM2
            if eu or not grande:
                if not eu and km(centro(max(nk, key=lambda p: area(p[0]))[0]), c0) > LONTANO_KM:
                    mondo = True
                focus += [p[0] for p in nk]
            else:
                vic = [q for p in nk for q in p[0] if km(q, c0) < VICINO_KM]
                if len(vic) >= 3:
                    focus.append(vic)
                else:
                    mondo = True
        if mondo:
            focus = [p[0] for k in chiavi for p in nucleo(tutte[k])]
    if punto:
        focus.append([punto])
    if mondo:
        if focus:
            vs = [vettore(*centro(r)) for r in focus if len(r) >= 3]
            lon0 = lonlat([sum(v[i] for v in vs) for i in range(3)])[0] if vs else 10.0
        else:
            lon0 = 10.0
        pr = EqualEarth(lon0)
    else:
        pts = [q for r in focus for q in r]
        step = max(1, len(pts) // 4000)
        m = [0.0, 0.0, 0.0]
        for q in pts[::step]:
            v = vettore(*q)
            m = [m[i] + v[i] for i in range(3)]
        lon0, lat0 = lonlat(m)
        pr = Laea(lon0, lat0)
    # la cornice: i paesi della notizia occupano circa due terzi del riquadro (quattro quinti se sono più d'uno);
    # almeno 1.000 km di larghezza, per vedere i vicini anche intorno a un paese piccolo. Il mondo: almeno metà
    if focus:
        xs, ys = [], []
        for r in focus:
            for piece in pr.pezzi(r) if len(r) >= 3 else [r]:
                for lon, lat in piece:
                    x, y = pr(lon, lat)
                    xs.append(x)
                    ys.append(y)
        bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
        # il paese principale non sta mai sul bordo (né sotto la didascalia): intorno a lui un margine di un terzo
        if len(chiavi) > 1 and not eu:
            mx, my = [], []
            for p in nucleo(tutte[chiavi[0]]):
                for piece in pr.pezzi(p[0]):
                    for lon, lat in piece:
                        x, y = pr(lon, lat)
                        mx.append(x)
                        my.append(y)
            if mx:
                d = 0.35 * max(max(mx) - min(mx), max(my) - min(my), 300 / R_KM)
                bx0, bx1 = min(bx0, min(mx) - d), max(bx1, max(mx) + d)
                by0, by1 = min(by0, min(my) - 1.4 * d), max(by1, max(my) + d)
        riemp = 0.62 if len(chiavi) == 1 else 0.8
        wf = max(bx1 - bx0, (by1 - by0) * W / H) / riemp
        wf = max(wf, 2.6 if mondo else 1000 / R_KM)
        cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    else:
        x1, _ = pr(lon0 + 180, 0)
        _, ytop = pr(lon0, 84)
        _, ybot = pr(lon0, -58)
        wf, cx, cy = 2 * x1 * 1.02, 0.0, (ytop + ybot) / 2
    hf = wf * H / W
    if mondo:
        # niente cielo vuoto sopra il Polo Nord o sotto i -58 gradi: la cornice resta dentro la terra
        _, ytop = pr(lon0, 84)
        _, ybot = pr(lon0, -58)
        if hf >= ytop - ybot:
            cy = (ytop + ybot) / 2
        else:
            cy = min(max(cy, ybot + hf / 2), ytop - hf / 2)
    sc = W / wf
    left, top = cx - wf / 2, cy + hf / 2

    def px(lon, lat):
        x, y = pr(lon, lat)
        return ((x - left) * sc, (top - y) * sc)
    M = 6

    def anelli(polys, eps):
        d = []
        for p in polys:
            for r0 in p:
                for r in pr.pezzi(r0):
                    pts = [px(lon, lat) for lon, lat in r]
                    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
                    # fuori dal riquadro, o un'isola più piccola di un pixel e mezzo
                    if max(xs) < -M or min(xs) > W + M or max(ys) < -M or min(ys) > H + M:
                        continue
                    if max(xs) - min(xs) < 1.5 and max(ys) - min(ys) < 1.5:
                        continue
                    pts = semplifica(pts, eps)
                    pts = taglia(pts, -M, -M, W + M, H + M)
                    if len(pts) < 3:
                        continue
                    d.append(percorso(pts, True))
        return "".join(d)
    # il reticolo dei meridiani e dei paralleli, appena visibile
    gradi = math.degrees(wf)
    passo = 5 if gradi < 30 else 10 if gradi < 90 else 20 if gradi < 200 else 30
    linee = []

    def linea(punti):
        seg = []
        for lon, lat in punti:
            if pr.cosc(lon, lat) < 0.2:
                if len(seg) > 1:
                    linee.append(seg)
                seg = []
                continue
            q = px(lon, lat)
            if -40 <= q[0] <= W + 40 and -40 <= q[1] <= H + 40:
                seg.append(q)
            else:
                if len(seg) > 1:
                    linee.append(seg)
                seg = []
        if len(seg) > 1:
            linee.append(seg)
    if mondo:
        base = math.ceil((lon0 - 180) / passo) * passo
        for lon in range(int(base), int(lon0 + 180) + 1, passo):
            if lon - lon0 < 179.9:
                linea([(lon, lat / 2) for lat in range(-116, 169)])
        for lat in range(-50, 81, passo):
            linea([(lon0 - 180 + t / 2, lat) for t in range(0, 721)])
    else:
        for lon in range(-180, 180, passo):
            linea([(lon, lat / 2) for lat in range(-160, 161)])
        for lat in range(-80, 81, passo):
            linea([(lon / 2, lat) for lon in range(-360, 361)])
    reticolo = "".join(percorso(semplifica(s, 0.4), False) for s in linee)
    # più la mappa è grande (il mondo, due continenti), più si semplifica: il file resta sotto i 60 kB circa
    for eps in (0.45, 0.7, 1.0, 1.4):
        fondo = anelli([p for k, polys in tutte.items() if k not in primi and k not in altri for p in polys], eps)
        coinvolti = anelli([p for k in altri for p in tutte[k]], eps)
        principale = anelli([p for k in primi for p in tutte[k]], min(eps, 0.6))
        if len(fondo) + len(coinvolti) + 2 * len(principale) < 52000:
            break
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H),
           '<defs><radialGradient id="g" cx="50%" cy="42%" r="80%"><stop offset="0" stop-color="' + MARE_C + '"/>'
           '<stop offset="1" stop-color="' + MARE_B + '"/></radialGradient></defs>',
           '<rect width="%d" height="%d" fill="url(#g)"/>' % (W, H)]
    if reticolo:
        out.append('<path d="' + reticolo + '" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width=".7"/>')
    if fondo:
        out.append('<path d="' + fondo + '" fill="' + TERRA + '" fill-rule="evenodd" stroke="' + CONFINE + '" stroke-width=".7" stroke-linejoin="round"/>')
    if coinvolti:
        out.append('<path d="' + coinvolti + '" fill="' + ALTRI + '" fill-rule="evenodd" stroke="' + ALTRI_B + '" stroke-width=".8" stroke-linejoin="round"/>')
    if principale:
        out.append('<path d="' + principale + '" fill="none" stroke="' + PRIMO + '" stroke-opacity=".18" stroke-width="7" stroke-linejoin="round"/>')
        out.append('<path d="' + principale + '" fill="' + PRIMO + '" fill-rule="evenodd" stroke="' + PRIMO_B + '" stroke-width=".9" stroke-linejoin="round"/>')
    # un paese troppo piccolo per vedersi (Israele sulla mappa del mondo): un anello intorno
    for k in chiavi if not eu else []:
        xs, ys = [], []
        for p in nucleo(tutte[k]):
            for piece in pr.pezzi(p[0]):
                for lon, lat in piece:
                    x, y = px(lon, lat)
                    xs.append(x)
                    ys.append(y)
        if not xs:
            continue
        bw, bh = max(xs) - min(xs), max(ys) - min(ys)
        if max(bw, bh) >= 9 and bw * bh >= 70:
            continue
        x, y = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        if -4 <= x <= W + 4 and -4 <= y <= H + 4 and not (punto and k == chiavi[0]):
            out.append('<circle cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-width="2"/>' % (
                num(x), num(y), num(max(8, max(bw, bh) / 2 + 5)), PRIMO if k in primi else ALTRI_B))
    if punto:
        x, y = px(*punto)
        out.append('<circle cx="%s" cy="%s" r="13" fill="%s" fill-opacity=".28"/>' % (num(x), num(y), PUNTO))
        out.append('<circle cx="%s" cy="%s" r="5.5" fill="%s" stroke="#fff" stroke-width="2"/>' % (num(x), num(y), PUNTO))
    out.append("</svg>")
    # il fuoco: il luogo preciso se c'è, altrimenti il centro del paese principale. Il sito ritaglia la mappa (quadrata
    # nelle miniature, larga e bassa in apertura) tenendo in vista questo punto
    fuoco = None
    if punto:
        fuoco = px(*punto)
    elif chiavi and not eu:
        xs, ys = [], []
        for p in nucleo(tutte[chiavi[0]]):
            for piece in pr.pezzi(p[0]):
                for lon, lat in piece:
                    x, y = px(lon, lat)
                    xs.append(x)
                    ys.append(y)
        if xs:
            fuoco = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    if fuoco:
        fuoco = (round(100 * min(max(fuoco[0] / W, 0), 1)), round(100 * min(max(fuoco[1] / H, 0), 1)))
    return "".join(out), punto, fuoco


# ---------- dalla storia ----------
def _indice():
    idx = {}
    for s, p in paesi().items():
        for n in (p.get("it"), p.get("en")):
            if n:
                idx[n.lower()] = s
    idx.update(ALIAS)
    return idx


def dal_titolo(title):
    """I paesi dell'occhiello: «Iran-Usa: ...» dà IR e US, «Polonia: ...» PL; niente se l'occhiello non è un luogo."""
    if ":" not in (title or ""):
        return []
    occ = title.split(":", 1)[0].strip().lower()
    idx = _indice()
    if occ in idx:
        return [idx[occ]]
    out = []
    for parte in re.split(r"\s*[-/,]\s*|\s+e\s+", occ):
        if parte in idx and idx[parte] not in out:
            out.append(idx[parte])
    return out


def sigle_storia(s):
    pl = s.get("places")
    sigle = [str(c).strip().upper() for c in pl if isinstance(c, str)] if isinstance(pl, list) else []
    sigle = [c for c in sigle if c == "EU" or c in paesi()]
    return sigle or dal_titolo(s.get("title", ""))


def didascalia(sigle, punto, city):
    """«Cracovia, Polonia»; «Iran e Stati Uniti»; «Yemen, Arabia Saudita e Iran»; l'Unione europea per nome."""
    if not sigle:
        return ""
    if sigle[0] == "EU":
        return "Unione europea"
    if punto and city and isinstance(city.get("name"), str) and city["name"].strip():
        n, paese = city["name"].strip(), nome(sigle[0])
        return n if n.lower() == paese.lower() else n + ", " + paese
    nomi = ["Unione europea" if s == "EU" else nome(s) for s in sigle[:3]]
    return nomi[0] if len(nomi) == 1 else ", ".join(nomi[:-1]) + " e " + nomi[-1]


def immagine(s, cartella, rel):
    """Scrive la mappa della storia in <cartella>/<id>.svg (solo se è cambiata) e dà il campo img per il sito:
    {"src": "<rel>/<id>.svg?v=<impronta>", "label": didascalia, "kind": "map", "fx", "fy": il fuoco in percentuale}."""
    sigle = sigle_storia(s)
    city = s.get("city") if isinstance(s.get("city"), dict) else None
    svg, punto, fuoco = disegna(sigle, city)
    os.makedirs(cartella, exist_ok=True)
    path = os.path.join(cartella, s["id"] + ".svg")
    data = svg.encode("utf-8")
    old = None
    if os.path.exists(path):
        with open(path, "rb") as f:
            old = f.read()
    if old != data:
        with open(path, "wb") as f:
            f.write(data)
    v = hashlib.sha1(data).hexdigest()[:8]
    lab = didascalia(sigle, punto, city)
    img = {"src": rel + "/" + s["id"] + ".svg?v=" + v, "label": lab, "kind": "map"}
    if fuoco:
        img.update(fx=fuoco[0], fy=fuoco[1])
    return img


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    out, sigle, city = argv[1], [], None
    i = 2
    while i < len(argv):
        if argv[i] == "--citta":
            city = {"name": argv[i + 1], "lat": float(argv[i + 2]), "lon": float(argv[i + 3])}
            i += 4
            continue
        sigle.append(argv[i].upper())
        i += 1
    svg, punto, fuoco = disegna(sigle, city)
    with open(out, "w", encoding="utf-8") as f:
        f.write(svg)
    print(out, len(svg), "byte", "punto:", punto, "fuoco:", fuoco, "didascalia:", didascalia(sigle, punto, city))


if __name__ == "__main__":
    main(sys.argv)
