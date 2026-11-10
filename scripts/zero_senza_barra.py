"""Atkinson Hyperlegible Next con lo zero senza barra.

Lo zero del carattere ha tre contorni: il bordo esterno e due vani interni separati dalla barra in diagonale.
Qui i due vani diventano uno solo: si tengono i loro archi (tutti i punti, con le variazioni di peso) e la barra
sparisce; dove c'era, l'arco si chiude con un punto di controllo nell'incrocio delle due tangenti, calcolato per
ogni peso (default e ogni variazione), così la curva resta liscia a tutti i pesi.
Uso: python3 scripts/zero_senza_barra.py entrata.woff2 uscita.woff2 (il file di entrata è il carattere originale di Fontsource)
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.iup import iup_delta

src, dst = sys.argv[1], sys.argv[2]
# il woff2 si apre come TrueType semplice: le tabelle trasformate del woff2 non si riscrivono bene dopo una modifica
import io
buf = io.BytesIO(); t0 = TTFont(src); t0.flavor = None; t0.save(buf); buf.seek(0)
f = TTFont(buf)
glyf, gvar = f["glyf"], f["gvar"]
g = glyf["zero"]
coords = [tuple(p) for p in g.coordinates]
flags = list(g.flags)
ends = list(g.endPtsOfContours)
assert len(ends) == 3, "lo zero non ha tre contorni: forse non è barrato"
n = len(coords)

def contours(ends):
    s, out = 0, []
    for e in ends:
        out.append(list(range(s, e + 1))); s = e + 1
    return out

C = contours(ends)
area = lambda idx: (max(coords[i][0] for i in idx) - min(coords[i][0] for i in idx)) * (max(coords[i][1] for i in idx) - min(coords[i][1] for i in idx))
outer = max(C, key=area)
inner = [c for c in C if c is not outer]

def arc(idx):
    """l'arco del vano: dal punto dopo il lato della barra al punto prima (il lato è il segmento dritto più lungo)"""
    m = len(idx); best = None
    for k in range(m):
        a, b = idx[k], idx[(k + 1) % m]
        if flags[a] & 1 and flags[b] & 1:
            dx, dy = coords[b][0] - coords[a][0], coords[b][1] - coords[a][1]
            L = (dx * dx + dy * dy) ** 0.5
            if abs(dx) > 40 and abs(dy) > 40 and (best is None or L > best[0]): best = (L, k)
    assert best, "nessun lato diagonale dritto nel vano"
    k = best[1]
    return [idx[(k + 1 + j) % m] for j in range(m)]

A1, A2 = arc(inner[0]), arc(inner[1])
# i due archi girano nello stesso verso: la fine del primo sta vicino all'inizio del secondo, e viceversa
P = lambda i, cs: cs[i]
d = lambda p, q: ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) ** 0.5
assert d(coords[A1[-1]], coords[A2[0]]) < 150 and d(coords[A2[-1]], coords[A1[0]]) < 150, "gli archi non si toccano dove c'era la barra"

def ctrl(cs, before, e, s, after):
    """punto di controllo tra la fine e di un arco e l'inizio s dell'altro: incrocio delle tangenti"""
    (x1, y1), (x2, y2) = cs[e], cs[s]
    ux, uy = x1 - cs[before][0], y1 - cs[before][1]          # direzione d'arrivo in e
    vx, vy = cs[after][0] - x2, cs[after][1] - y2           # direzione di partenza da s
    det = ux * (-vy) - uy * (-vx)
    if abs(det) < 1e-6: return ((x1 + x2) / 2, (y1 + y2) / 2)
    t = ((x2 - x1) * (-vy) - (y2 - y1) * (-vx)) / det
    q = (x1 + t * ux, y1 + t * uy)
    # se l'incrocio esce troppo dalla corda (tangenti quasi parallele), basta il punto medio
    if d(q, ((x1 + x2) / 2, (y1 + y2) / 2)) > d(cs[e], cs[s]): return ((x1 + x2) / 2, (y1 + y2) / 2)
    return q

def build(cs):
    q1 = ctrl(cs, A1[-2], A1[-1], A2[0], A2[1])
    q2 = ctrl(cs, A2[-2], A2[-1], A1[0], A1[1])
    return q1, q2

# il nuovo ordine dei punti: il bordo esterno com'è, poi il vano unico (arco 1, controllo, arco 2, controllo)
order = outer + A1 + [None] + A2 + [None]
q1, q2 = build(coords)
new_coords, new_flags = [], []
for i in order:
    if i is None:
        q = q1 if not new_coords or len([x for x in order[:len(new_coords)] if x is None]) == 0 else q2
        new_coords.append((round(q[0]), round(q[1]))); new_flags.append(0)
    else:
        new_coords.append(coords[i]); new_flags.append(flags[i])
new_ends = [len(outer) - 1, len(order) - 1]

# le variazioni: deltas pieni (anche quelli sottintesi), nel nuovo ordine; per i due punti nuovi, il controllo
# calcolato sul disegno di quel peso meno quello del default
tvs = gvar.variations.get("zero", [])
for tv in tvs:
    dl = tv.coordinates
    full = iup_delta(dl[:n], coords, ends) if any(x is None for x in dl[:n]) else list(dl[:n])
    master = [(coords[i][0] + full[i][0], coords[i][1] + full[i][1]) for i in range(n)]
    m1, m2 = build(master)
    nd, k = [], 0
    for i in order:
        if i is None:
            m, q = (m1, q1) if k == 0 else (m2, q2); k += 1
            nd.append((round(m[0]) - round(q[0]), round(m[1]) - round(q[1])))
        else:
            nd.append(tuple(full[i]))
    tv.coordinates = nd + list(dl[n:])   # i quattro punti fantasma restano com'erano

from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
g.coordinates = GlyphCoordinates(new_coords)
g.flags = bytearray(new_flags) if isinstance(g.flags, bytearray) else type(g.flags)(new_flags)
g.endPtsOfContours = new_ends
g.numberOfContours = len(new_ends)
g.recalcBounds(glyf)
f.flavor = "woff2"
f.save(dst)
print(dst, ": zero da", n, "punti e 3 contorni a", len(new_coords), "punti e 2 contorni;", len(tvs), "variazioni")
