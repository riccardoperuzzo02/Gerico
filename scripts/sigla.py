#!/usr/bin/env python3
"""La musica del riepilogo da ascoltare: la sigla d'apertura, il tappeto sotto la voce e la chiusura.

È una composizione di GERICO, scritta qui nota per nota (nessun brano di altri). Re minore, 120 battiti al minuto.
- Apertura (5 secondi): il ticchettio di un orologio, due segnali orari e il rullo dei timpani in levare; poi il
  colpo dell'orchestra (ottoni veri ed elettronici, timpani, grancassa, piatto, un colpo sub) e una frase delle
  trombe sopra gli archi che corrono a sedicesimi, con gli accenti a 3+3+2; si chiude con un colpo in levare
  sull'accordo di La, e sulla battuta dopo entra la voce.
- Tappeto (otto battute che si ripetono: Re minore, Si bemolle, Fa, Do, Re minore, Si bemolle, Sol minore, La):
  gli archi a sedicesimi, la pulsazione elettronica del basso, il ticchettio, viole, violini e corni tenuti piano,
  qualche colpo di timpano. Le frequenze della voce restano più libere.
- Chiusura: una battuta di conto alla rovescia sul La (quattro segnali orari, timpani e piatto che crescono, gli
  ottoni che salgono) e il colpo finale sul Re minore, che si spegne in tre secondi.

Archi, ottoni e percussioni sono campioni dell'orchestra VSCO 2 Community Edition di Versilian Studios (registrata da
Sam Gossner e Simon Dalzell), di pubblico dominio (CC0): https://github.com/sgossner/VSCO-2-CE. I suoni elettronici
(ticchettio, segnali orari, pulsazione, ottoni del sintetizzatore, salita, colpo sub) sono calcolati qui.

Il job non rifà la musica: legge le tre parti già pronte in scripts/sigla/ (apertura, tappeto e chiusura in FLAC a
48 kHz) e le monta con la voce (scripts/audio.py). Per rifarle servono numpy, scipy, soundfile e i campioni:
    git clone --depth 1 https://github.com/sgossner/VSCO-2-CE.git /tmp/vsco
    python3 scripts/sigla.py /tmp/vsco [cartella di destinazione]"""
import functools
import os
import sys

import numpy as np

SR = 48000
BPM = 120
BEAT = 60.0 / BPM
BAR = 4 * BEAT
STEP = BEAT / 4
LEVARE = 0.5 * BAR          # l'apertura comincia due battiti prima della prima battuta
TAPPETO = LEVARE + 2 * BAR  # 5 s: nell'apertura, dove comincia il tappeto (la sua prima battuta)
VOCE = TAPPETO + 0.12       # e poco dopo la voce
COLPO = BAR                 # nella chiusura, il colpo finale: dopo la battuta del conto alla rovescia
BATTUTE = 8                 # il giro del tappeto
PARTI = ("apertura", "tappeto", "chiusura")
CARTELLA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sigla")


# ---------- per il montaggio (job): solo numpy e soundfile ----------
def parti(rate=SR):
    """Le tre parti pronte, come array float32 a `rate` Hz: apertura, tappeto (si ripete), chiusura."""
    import soundfile as sf
    out = []
    for nome in PARTI:
        y, sr = sf.read(os.path.join(CARTELLA, nome + ".flac"), dtype="float32", always_2d=False)
        if sr != rate:
            raise ValueError(f"{nome}.flac è a {sr} Hz, il montaggio a {rate} Hz")
        out.append(y)
    return out


def curva(f, alto=None, basso=None, campane=(), acuti=()):
    """Il guadagno di un equalizzatore a ogni frequenza: passa-alto, passa-basso, campane (Hz, ottave, dB) e
    ripiani sugli acuti (Hz, dB)."""
    f = np.maximum(f, 1e-3)
    g = np.ones_like(f)
    if alto:
        g *= 1 / np.sqrt(1 + (alto / f) ** 4)
    if basso:
        g *= 1 / np.sqrt(1 + (f / basso) ** 4)
    for fc, ott, db in campane:
        g *= 10 ** (db / 20 * np.exp(-0.5 * (np.log2(f / fc) / (ott / 2)) ** 2))
    for fc, db in acuti:
        g *= 10 ** (db / 20 * 0.5 * (1 + np.tanh(2 * np.log2(f / fc))))
    return g


def filtra(y, sr, basso=None, alto=None, buchi=()):
    """Filtro nel dominio delle frequenze (circolare): passa-alto, passa-basso e campane."""
    f = np.fft.rfftfreq(len(y), 1 / sr)
    return np.fft.irfft(np.fft.rfft(y) * curva(f, alto=alto, basso=basso, campane=buchi), len(y))


# ---------- la composizione (serve scipy e la cartella dei campioni) ----------
def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def forza_di(y):
    """Il volume di un suono: il massimo del valore efficace su finestre di 50 ms."""
    w = int(0.05 * SR)
    m = len(y) // w
    if not m:
        return float(np.sqrt(np.mean(y ** 2))) if len(y) else 1e-9
    return float(np.max(np.sqrt(np.mean(y[: m * w].reshape(m, w) ** 2, axis=1))))


def a_volume(y, forza=1.0):
    """Lo stesso suono al volume di riferimento (0,1 di valore efficace sui 50 ms più forti) per `forza`."""
    return y * (0.1 * forza / max(1e-9, forza_di(y)))


def coda_dolce(n, coda):
    """n campioni a 1, con gli ultimi `coda` secondi che scendono a zero."""
    e = np.ones(n)
    m = min(n, int(coda * SR))
    if m:
        e[-m:] = np.linspace(1, 0, m) ** 2
    return e


def taglia(y, durata, coda, attacco=0.0):
    """La nota lunga `durata` secondi, poi si spegne in `coda` secondi (e, se serve, entra in `attacco` secondi)."""
    n = int((durata + coda) * SR)
    y = np.array(y[:n], dtype=np.float32)
    if len(y) == n:
        y *= coda_dolce(n, coda).astype(np.float32)
    a = min(len(y), int(attacco * SR))
    if a:
        y[:a] *= np.linspace(0, 1, a, dtype=np.float32)
    return y


NOMI = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
_LETTI, _SPOSTATI = {}, {}


def leggi(p):
    """Un campione: mono, a 48 kHz, dal primo suono (2 ms prima di dove supera -42 dB dal picco)."""
    if p not in _LETTI:
        import math
        import soundfile as sf
        from scipy.signal import resample_poly
        y, sr = sf.read(p, dtype="float32", always_2d=True)
        y = y.mean(axis=1)
        if sr != SR:
            g = math.gcd(SR, sr)
            y = resample_poly(y, SR // g, sr // g).astype(np.float32)
        i = int(np.argmax(np.abs(y) > np.max(np.abs(y)) * 10 ** (-42 / 20)))
        _LETTI[p] = y[max(0, i - int(0.002 * SR)):]
    return _LETTI[p]


def sposta(p, semitoni):
    """Il campione trasposto di `semitoni` (ricampionato: un po' più lungo se scende, più corto se sale)."""
    key = (p, round(semitoni, 3))
    if key not in _SPOSTATI:
        from fractions import Fraction
        from scipy.signal import resample_poly
        y = leggi(p)
        if abs(semitoni) > 1e-3:
            fr = Fraction(2 ** (-semitoni / 12)).limit_denominator(400)
            y = resample_poly(y, fr.numerator, fr.denominator).astype(np.float32)
        _SPOSTATI[key] = y
    return _SPOSTATI[key]


def strato(forza, n):
    """Quale strato di dinamica (0 = il più piano) e quanto si va su o giù dentro lo strato (±3 dB)."""
    j = min(n - 1, max(0, int(np.ceil(forza * n)) - 1))
    frac = min(1.0, max(0.0, forza * n - j))
    return j, 10 ** ((frac - 0.5) * 6 / 20)


class Campioni:
    """Uno strumento della VSCO in un'articolazione: i campioni per nota, dinamica (v1 il più piano) e ripetizione."""

    def __init__(self, cartella, taglio=None, coda=0.12):
        import glob
        import re
        rx = re.compile(r"_([A-G]#?)(-?\d)_v(\d)(?:_r{0,2}(\d))?", re.I)
        self.note = {}
        for p in sorted(glob.glob(os.path.join(cartella, "*.wav"))):
            m = rx.search(os.path.basename(p))
            if m:
                midi = 12 * (int(m.group(2)) + 2) + NOMI[m.group(1).upper()]
                self.note.setdefault(midi, {}).setdefault(int(m.group(3)), []).append(p)
        if not self.note:
            raise FileNotFoundError(f"nessun campione in {cartella}")
        self.taglio, self.coda, self.giro = taglio, coda, {}
        # tutti gli strumenti alla stessa forza: la dinamica più forte di ogni nota, mediana su tutte le note
        self.guadagno = 0.1 / float(np.median([forza_di(leggi(d[max(d)][0])[: 3 * SR]) for d in self.note.values()]))

    def suona(self, midi, forza=0.8, durata=None, coda=None, attacco=0.0):
        m0 = min(self.note, key=lambda m: (abs(m - midi), -m))
        din = sorted(self.note[m0])
        j, g = strato(forza, len(din))
        lista = self.note[m0][din[j]]
        k = self.giro.get((m0, j), 0)
        self.giro[(m0, j)] = k + 1
        y = sposta(lista[k % len(lista)], midi - m0) * np.float32(self.guadagno * g)
        durata = self.taglio if durata is None else durata
        if durata is not None:
            return taglia(y, durata, self.coda if coda is None else coda, attacco)
        return taglia(y, len(y) / SR, 0.0, attacco)


class Timpani:
    """I cinque timpani della VSCO (colpi e rulli); l'altezza di ognuno è misurata sul suo modo principale."""
    ALTEZZE = {1: 41.5, 2: 47.1, 3: 49.6, 4: 51.9, 5: 54.7}

    def __init__(self, cartella):
        import glob
        import re
        self.colpi, self.rulli, self.giro = {}, {}, {}
        for p in sorted(glob.glob(os.path.join(cartella, "**", "*.wav"), recursive=True)):
            m = re.search(r"Timpani(\d)_(Hit|Roll)_v(\d)", os.path.basename(p))
            if m:
                d = self.colpi if m.group(2) == "Hit" else self.rulli
                d.setdefault(int(m.group(1)), {}).setdefault(int(m.group(3)), []).append(p)
        self.guadagno = 0.1 / forza_di(leggi(self.colpi[1][max(self.colpi[1])][0]))

    def _scegli(self, d, midi, forza):
        k = min(d, key=lambda k: abs(self.ALTEZZE[k] - midi))
        din = sorted(d[k])
        j, g = strato(forza, len(din))
        lista = d[k][din[j]]
        r = self.giro.get((id(d), k, j), 0)
        self.giro[(id(d), k, j)] = r + 1
        return sposta(lista[r % len(lista)], midi - self.ALTEZZE[k]) * np.float32(self.guadagno * g)

    def colpo(self, midi, forza=0.8, durata=3.0):
        return taglia(self._scegli(self.colpi, midi, forza), durata, 0.4)

    def rullo(self, midi, durata, da=0.2, a=0.9):
        """Un rullo che cresce da `da` ad `a` (forza) in `durata` secondi e si ferma lì."""
        y = self._scegli(self.rulli, midi, 1.0)[int(0.3 * SR):]  # dopo il primo colpo, il rullo pieno
        n = int(durata * SR)
        if len(y) < n:
            y = np.pad(y, (0, n - len(y)))
        t = np.linspace(0, 1, n)
        return y[:n] * (da + (a - da) * t ** 1.6) * coda_dolce(n, 0.03) * np.minimum(t * n / (0.03 * SR), 1)


class Colpi:
    """Percussioni a un colpo solo (grancassa, piatti, tam-tam): uno strato per dinamica, dal più piano."""

    def __init__(self, cartella, schema, strati):
        import glob
        self.strati = [l for l in (sorted(glob.glob(os.path.join(cartella, schema.format(s)))) for s in strati) if l]
        if not self.strati:
            raise FileNotFoundError(f"nessun campione {schema} in {cartella}")
        self.giro = {}
        self.guadagno = 0.1 / forza_di(leggi(self.strati[-1][0]))

    def suona(self, forza=0.8, durata=None, coda=0.3):
        j, g = strato(forza, len(self.strati))
        r = self.giro.get(j, 0)
        self.giro[j] = r + 1
        y = leggi(self.strati[j][r % len(self.strati[j])]) * np.float32(self.guadagno * g)
        return taglia(y, durata, coda) if durata else y.copy()


class Orchestra:
    def __init__(self, vsco):
        a = lambda *p: os.path.join(vsco, *p)
        self.vln_spic = Campioni(a("Strings", "Violin Section", "Spic"), taglio=0.32, coda=0.1)
        self.vln_sus = Campioni(a("Strings", "Violin Section", "susVib"), coda=0.6)
        self.vla_sus = Campioni(a("Strings", "Viola Section", "susvib"), coda=0.6)
        self.vc_spic = Campioni(a("Strings", "Cello Section", "spic"), taglio=0.42, coda=0.12)
        self.vc_sus = Campioni(a("Strings", "Cello Section", "susvib"), coda=0.6)
        self.cor_stac = Campioni(a("Brass", "F Horn", "stac"))
        self.cor_sus = Campioni(a("Brass", "F Horn", "sus"), coda=0.35)
        self.tr_stac = Campioni(a("Brass", "Trumpet", "stac"))
        self.tr_sus = Campioni(a("Brass", "Trumpet", "sus"), coda=0.3)
        self.trb_stac = Campioni(a("Brass", "Tenor Trombone", "stac"))
        self.trb_sus = Campioni(a("Brass", "Tenor Trombone", "sus"), coda=0.35)
        self.timpani = Timpani(a("Percussion", "Timpani"))
        self.grancassa = Colpi(a("Percussion"), "BDrumNewhit_v{}_rr*_Sum.wav", range(1, 8))
        self.piatto = Colpi(a("Percussion"), "cymbal-crash1_{}_rr*.wav", ("pp", "mp", "mf", "ff"))
        self.tamtam = Colpi(a("Percussion"), "gongHit_{}.wav", ("p", "mf", "f", "fff"))
        self.sospeso = Colpi(a("Percussion"), "susCymb1-cresc-{}_v1.wav", ("Short",))


def fino_al_picco(y, prima):
    """Gli ultimi `prima` secondi di un crescendo, fino al suo punto più forte (dove va messo il colpo)."""
    k = int(np.argmax(np.abs(y)))
    seg = y[max(0, k - int(prima * SR)): k + int(0.02 * SR)] * coda_dolce(k + int(0.02 * SR) - max(0, k - int(prima * SR)), 0.03)
    a = min(len(seg), int(0.12 * SR))
    seg[:a] *= np.linspace(0, 1, a)  # comincia a metà del crescendo: entra piano, senza scatto
    return seg


# ---------- i suoni elettronici ----------
def oscillatore(fr, n, fc, ordine=2):
    """Dente di sega additivo (fase coerente) con un passa-basso che si muove nel tempo: fr e fc in Hz, numeri o array."""
    fr = np.broadcast_to(np.asarray(fr, dtype=float), (n,))
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    fase = 2 * np.pi * np.cumsum(fr) / SR
    y = np.zeros(n)
    f0 = float(np.mean(fr))
    for k in range(1, 400):
        if k * f0 > 15000:
            break
        g = 1 / np.sqrt(1 + (k * fr / fc) ** (2 * ordine))
        if float(np.max(g)) / k < 2e-4:
            break
        y += g / k * np.sin(k * fase)
    return y


@functools.lru_cache(maxsize=None)
def ottone_elettronico(midi, durata, forza=1.0, rilascio=0.2):
    """Gli ottoni del sintetizzatore: tre denti di sega un po' scordati, il filtro che si apre di colpo e si
    richiude piano, l'intonazione che sale di un quarto di semitono nell'attacco."""
    n = int((durata + rilascio) * SR)
    t = np.arange(n) / SR
    blip = 2 ** (-22 * np.exp(-t / 0.025) / 1200)
    fc = 380 + 4600 * forza * (1 - np.exp(-t / 0.01)) * (0.4 + 0.6 * np.exp(-t / 0.22))
    y = sum(a * oscillatore(hz(midi) * 2 ** (c / 1200) * blip, n, fc) for c, a in ((-9, .8), (0, 1.0), (8, .8)))
    y *= np.minimum(t / 0.006, 1) * (0.72 + 0.28 * np.exp(-t / 0.18)) * coda_dolce(n, rilascio)
    y = np.tanh(1.3 * y / max(1e-9, np.max(np.abs(y))))
    return a_volume(y, forza).astype(np.float32)


@functools.lru_cache(maxsize=None)
def pulsazione(midi, durata, accento=False):
    """La pulsazione del basso elettronico: due denti di sega e la fondamentale, il filtro che si chiude in fretta."""
    n = int(durata * SR)
    t = np.arange(n) / SR
    fc = 180 + (2600 if accento else 1300) * np.exp(-t / 0.045)
    y = oscillatore(hz(midi) * 0.998, n, fc) + oscillatore(hz(midi) * 1.0025, n, fc)
    y += 0.9 * np.sin(2 * np.pi * hz(midi) * t)
    y *= np.minimum(t / 0.002, 1) * (0.35 + 0.65 * np.exp(-t / 0.07)) * coda_dolce(n, 0.012)
    return a_volume(y, 1.0 if accento else 0.75).astype(np.float32)


@functools.lru_cache(maxsize=None)
def tic(alto=True):
    """Il ticchettio di un orologio: un colpetto di rumore e tre risonanze metalliche che durano pochi millesimi."""
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    modi = ((3150, .006, 1.0), (4850, .004, .6), (7100, .0025, .4)) if alto else \
           ((2250, .007, 1.0), (3550, .005, .6), (5300, .003, .35))
    y = sum(a * np.exp(-t / tau) * np.sin(2 * np.pi * f * t) for f, tau, a in modi)
    y += 0.4 * np.random.default_rng(5 if alto else 6).standard_normal(n) * np.exp(-t / 0.0006)
    y += 0.25 * np.sin(2 * np.pi * 430 * t) * np.exp(-t / 0.004)
    return (0.3 * y / np.max(np.abs(y))).astype(np.float32)


@functools.lru_cache(maxsize=None)
def segnale(durata=0.1, f=1000.0):
    """Un segnale orario: un tono puro a mille hertz, con attacco e coda di pochi millesimi."""
    n = int(durata * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.035 * np.sin(2 * np.pi * 3 * f * t)
    return a_volume(y * np.minimum(t / 0.003, 1) * coda_dolce(n, 0.004)).astype(np.float32)


def salita(durata, f0=300.0, f1=7500.0, seme=9):
    """Rumore che sale di frequenza e di volume fino al colpo."""
    from scipy.signal import istft, stft
    n = int(durata * SR)
    x = np.random.default_rng(seme).standard_normal(n + 2048)
    f, tt, Z = stft(x, SR, nperseg=1024, noverlap=768)
    fc = f0 * (f1 / f0) ** np.clip(tt / durata, 0, 1)
    Z *= np.exp(-0.5 * (np.log2(np.maximum(f[:, None], 1) / fc[None, :]) / 0.6) ** 2)
    _, y = istft(Z, SR, nperseg=1024, noverlap=768)
    return a_volume(y[:n] * np.linspace(0, 1, n) ** 2.5).astype(np.float32)


def boom(durata=1.4, f0=95.0, f1=40.0):
    """Il colpo sub sotto i colpi d'orchestra: una sinusoide che scende da 95 a 40 Hz."""
    t = np.arange(int(durata * SR)) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.07)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.42) * np.minimum(t / 0.002, 1)
    return a_volume(np.tanh(1.8 * y)).astype(np.float32)


# ---------- il mixer ----------
BUS = ("archi", "ottoni", "elettronica", "percussioni", "segnali")
RIVERBERO = {"archi": 0.32, "ottoni": 0.26, "elettronica": 0.1, "percussioni": 0.22, "segnali": 0.08}
EQ = {"archi": dict(alto=45, campane=((260, 1.2, -2.0),), acuti=((6500, 1.5),)),
      "ottoni": dict(alto=55, campane=((320, 1.0, -1.5), (2600, 1.4, 1.5))),
      "elettronica": dict(alto=32, basso=9000),
      "percussioni": dict(alto=28),
      "segnali": dict(alto=380)}


class Pista:
    """Le voci della partitura, ognuna nel suo bus (archi, ottoni, elettronica, percussioni, segnali)."""

    def __init__(self, durata, seme=1, circolare=False):
        """`circolare`: un giro che si ripete; quello che esce dalla fine rientra dall'inizio, come suonando."""
        self.n = int(round(durata * SR))
        self.voci = {}
        self.rng = np.random.default_rng(seme)
        self.circolare = circolare

    def metti(self, bus, t, y, db=0.0, umano=True, voce=None):
        """Somma un suono all'istante t (secondi), con qualche millesimo e qualche decimo di dB di umanità."""
        if umano:
            t += self.rng.uniform(-0.004, 0.004)
            db += self.rng.uniform(-0.7, 0.7)
        x = self.voci.setdefault((bus, voce or bus), np.zeros(self.n))
        y = y * 10 ** (db / 20)
        i = int(round(t * SR))
        if self.circolare:
            i %= self.n
            while len(y):
                j = min(self.n, i + len(y))
                x[i:j] += y[: j - i]
                y, i = y[j - i:], 0
            return
        if i >= self.n or i + len(y) <= 0:
            return
        a = max(0, -i)
        j = min(self.n, i + len(y))
        x[max(0, i):j] += y[a:j - i]

    def livelli(self, obiettivi, misura=None):
        """Come i cursori di un mixer: ogni voce al suo volume (LUFS) rispetto alla prima di `obiettivi`, che resta
        com'è. `misura` (inizio, fine in secondi) è il tratto su cui si misura."""
        a, b = (int(misura[0] * SR), int(misura[1] * SR)) if misura else (0, self.n)
        voce = {v: k for k in self.voci for v in [k[1]]}
        rif = lufs(self.voci[voce[next(iter(obiettivi))]][a:b])
        for v, db in obiettivi.items():
            if v in voce:
                x = self.voci[voce[v]]
                x *= 10 ** ((rif + db - lufs(x[a:b])) / 20)

    def bus(self, k):
        x = np.zeros(self.n)
        for (b, _), y in self.voci.items():
            if b == k:
                x += y
        return x


def lufs(y):
    """Il volume percepito (BS.1770: filtro K, blocchi di 400 ms, soglie -70 e -10) in LUFS."""
    from scipy.signal import lfilter
    z = lfilter([1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621],
                lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], y))
    z = z ** 2
    w, h = int(0.4 * SR), int(0.1 * SR)
    if len(z) < w:
        return -0.691 + 10 * np.log10(np.mean(z) + 1e-12)
    c = np.concatenate([[0], np.cumsum(z)])
    i = np.arange(0, len(z) - w + 1, h)
    b = -0.691 + 10 * np.log10((c[i + w] - c[i]) / w + 1e-12)
    b = b[b > -70]
    if not len(b):
        return -99.0
    b = b[b > 10 * np.log10(np.mean(10 ** (b / 10))) - 10]
    return float(10 * np.log10(np.mean(10 ** (b / 10))))


def eq_lineare(y, g, circolare=False):
    """Equalizzatore a fase zero sul segnale intero: con il margine che serve a non far tornare le code all'inizio,
    oppure circolare (per il giro che si ripete)."""
    n = len(y)
    N = n if circolare else 1 << int(np.ceil(np.log2(n + SR)))
    f = np.fft.rfftfreq(N, 1 / SR)
    return np.fft.irfft(np.fft.rfft(y, N) * g(f), N)[:n]


def due_volte(f, y, circolare):
    """Un effetto con memoria (compressore, limitatore) su un giro che si ripete: lo si fa passare due volte e si
    tiene il secondo passaggio, che comincia con lo stato giusto."""
    if not circolare:
        return f(y)
    return f(np.concatenate([y, y]))[len(y):]


def sala(rt60=1.9, pre=0.016, seme=3):
    """La risposta di una sala da concerto: una coda di rumore che si spegne prima sugli acuti e un po' dopo sui
    bassi, e poche riflessioni iniziali."""
    rng = np.random.default_rng(seme)
    n = int(SR * rt60 * 1.25)
    t = np.arange(n) / SR
    N = 1 << int(np.ceil(np.log2(n)))
    R = np.fft.rfft(rng.standard_normal(n), N)
    f = np.maximum(np.fft.rfftfreq(N, 1 / SR), 1e-3)
    wb, wa = 1 / (1 + (f / 350) ** 4), 1 / (1 + (4500 / f) ** 4)
    wm = np.clip(1 - wb - wa, 0, 1)
    coda = sum(np.fft.irfft(R * w, N)[:n] * np.exp(-6.91 * t / r) for w, r in ((wb, rt60 * 1.15), (wm, rt60), (wa, rt60 * 0.45)))
    coda *= 1 - np.exp(-t / 0.03)
    p = int(pre * SR)
    ir = np.zeros(p + n)
    ir[p:] = coda / np.sqrt(np.sum(coda ** 2))
    for d, g in ((0.006, .3), (0.011, .22), (0.019, .2), (0.027, .15), (0.038, .12), (0.051, .09)):
        ir[int(d * SR)] += g * rng.choice((-1, 1)) * 0.25
    return ir / np.sqrt(np.sum(ir ** 2))


def comprimi(y, soglia, rapporto, attacco=0.008, rilascio=0.14):
    """Compressore: sopra la soglia (dBFS) il volume cresce `rapporto` volte meno."""
    from scipy.signal import lfilter
    a = np.exp(-1 / (attacco * SR))
    env = np.sqrt(np.maximum(lfilter([1 - a], [1, -a], y ** 2), 0) + 1e-12)
    sopra = 20 * np.log10(env) - soglia
    gr = np.where(sopra > 0, sopra * (1 - 1 / rapporto), 0.0)
    r = np.exp(-1 / (rilascio * SR))
    gr = lfilter([1 - r], [1, -r], gr)
    return y * 10 ** (-gr / 20)


def limita(y, tetto=0.89, anticipo=0.004, rilascio=0.08):
    """Limitatore: guarda 4 ms avanti, abbassa prima del picco e risale piano (`rilascio` secondi); nessun campione
    supera il tetto."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    w = max(1, int(anticipo * SR / 2))
    serve = np.minimum(1.0, tetto / np.maximum(np.abs(y), 1e-9))
    g = uniform_filter1d(minimum_filter1d(serve, 4 * w + 1), 2 * w + 1)
    # la risalita, a blocchi di un millesimo
    b = int(0.001 * SR)
    gb = np.minimum.reduceat(g, np.arange(0, len(g), b))
    r = 1 - np.exp(-0.001 / rilascio)
    lento, cur = np.empty_like(gb), 1.0
    for i, v in enumerate(gb):
        cur = min(v, cur + (1 - cur) * r)
        lento[i] = cur
    g = np.minimum(g, np.interp(np.arange(len(g)), np.arange(len(gb)) * b + b / 2, lento))
    return np.clip(y * g, -tetto, tetto)


def mixa(pista, extra_eq=None):
    """I bus con il loro equalizzatore, il riverbero comune, la compressione sugli ottoni, sulle percussioni e sul
    totale."""
    from scipy.signal import fftconvolve
    c = pista.circolare
    secco = np.zeros(pista.n)
    mandata = np.zeros(pista.n)
    for k in BUS:
        x = eq_lineare(pista.bus(k), lambda f, k=k: curva(f, **EQ[k]), c)
        if k == "ottoni" and np.any(x):
            pk = np.max(np.abs(x))
            x = due_volte(lambda z: comprimi(z, 20 * np.log10(pk) - 9, 2.5, 0.006, 0.12), x, c)
            x = np.tanh(1.2 * x / pk) / np.tanh(1.2) * pk
        if k == "percussioni" and np.any(x):
            pk = np.max(np.abs(x))
            x = due_volte(lambda z: comprimi(z, 20 * np.log10(pk) - 10, 3.0, 0.002, 0.09), x, c)
        secco += x
        mandata += RIVERBERO[k] * x
    ir = sala()
    if c:  # la coda del riverbero rientra dall'inizio del giro
        umido = np.fft.irfft(np.fft.rfft(mandata) * np.fft.rfft(np.pad(ir, (0, pista.n - len(ir)))), pista.n)
    else:
        umido = fftconvolve(mandata, ir)[: pista.n]
    y = secco + umido
    if extra_eq:
        y = eq_lineare(y, extra_eq, c)
    pk = np.max(np.abs(y)) + 1e-9
    return due_volte(lambda z: comprimi(z, 20 * np.log10(pk) - 8, 1.8, 0.02, 0.25), y, c)


# ---------- la partitura ----------
# per ogni accordo: la radice della pulsazione, il basso dei violoncelli, le tre note alte dei violini
ACCORDI = {
    "Re-": {"radice": 38, "basso": 50, "alti": (74, 77, 81)},
    "Sib": {"radice": 34, "basso": 46, "alti": (74, 77, 82)},
    "Fa": {"radice": 41, "basso": 41, "alti": (72, 77, 81)},
    "Do": {"radice": 36, "basso": 48, "alti": (72, 76, 79)},
    "Sol-": {"radice": 43, "basso": 43, "alti": (74, 79, 82)},
    "La": {"radice": 33, "basso": 45, "alti": (73, 76, 81)},
}
GIRO = ("Re-", "Sib", "Fa", "Do", "Re-", "Sib", "Sol-", "La")
# le voci tenute del tappeto, una nota per battuta: viole, violini, corni (due note)
VIOLE = (65, 65, 65, 64, 65, 65, 67, 69)
VIOLINI = (81, 82, 81, 79, 81, 82, 82, 81)
CORNI = ((57, 62), (58, 62), (57, 60), (55, 60), (57, 62), (58, 62), (58, 62), (57, 61))
ACCENTI = (0, 3, 6)  # gli ottavi accentati: 3+3+2
ORDINE = (0, 1, 2, 0, 1, 2, 1, 2)


def archi_a_sedicesimi(p, o, t0, accordo, forza, db=0.0, da=0, a=16, cresc=(0.0, 0.0)):
    """Una battuta di archi: i violini a sedicesimi (note dell'accordo, e il La come pedale nei sedicesimi
    deboli), i violoncelli a ottavi con il basso sugli accenti e l'ottava sopra negli altri."""
    acc = ACCORDI[accordo]
    for s in range(da, a):
        t = t0 + s * STEP
        g = db + cresc[0] + (cresc[1] - cresc[0]) * s / 15
        if s % 2 == 0:
            i = s // 2
            forte = i in ACCENTI
            p.metti("archi", t, o.vln_spic.suona(acc["alti"][ORDINE[i]], forza * (1.0 if forte else 0.7)),
                    g + (0 if forte else -2.5), voce="violini")
            m = acc["basso"] + (0 if forte else 12)
            p.metti("archi", t, o.vc_spic.suona(m, forza * (1.0 if forte else 0.65)), g + (0 if forte else -4), voce="violoncelli")
        else:
            p.metti("archi", t, o.vln_spic.suona(69, forza * 0.5), g - 6, voce="violini")


def pulsazioni(p, t0, accordo, db, da=0, a=16, cresc=(0.0, 0.0)):
    for s in range(da, a):
        g = db + cresc[0] + (cresc[1] - cresc[0]) * s / 15
        p.metti("elettronica", t0 + s * STEP, pulsazione(ACCORDI[accordo]["radice"], STEP * 0.8, s in (0, 6, 12)), g,
                umano=False, voce="pulsazione")


def ticchettio(p, t0, db, da=0, a=16, cresc=(0.0, 0.0)):
    for s in range(da, a):
        g = db + (0 if s % 4 == 0 else -2 if s % 2 == 0 else -10)
        g += cresc[0] + (cresc[1] - cresc[0]) * (s - da) / max(1, a - da - 1)
        p.metti("segnali", t0 + s * STEP, tic(s % 4 != 2), g, umano=False, voce="ticchettio")


def tenuta(p, strum, bus, t0, note, forza, db, coda=0.5, attacco=0.12, voce=None):
    """Note tenute una battuta ciascuna; la stessa nota in battute di fila resta tenuta, senza ripartire (anche
    tra la fine e l'inizio del giro, se la pista è circolare)."""
    note = list(note)
    giro = 0
    if p.circolare:  # si parte dalla prima battuta con una nota diversa da quella prima
        while giro < len(note) and note[giro] == note[giro - 1]:
            giro += 1
        giro %= len(note)
    note = note[giro:] + note[:giro]
    i = 0
    while i < len(note):
        j = i
        while j + 1 < len(note) and note[j + 1] == note[i]:
            j += 1
        y = strum.suona(note[i], forza, durata=(j - i + 1) * BAR + 0.08, coda=coda, attacco=attacco)
        p.metti(bus, t0 + (i + giro) * BAR, y, db, voce=voce)
        i = j + 1


def colpo_ottoni(p, o, t, note, forza, durata=None, db=0.0, elettronici=-12.0):
    """Un accordo degli ottoni: tromboni, corni e trombe (staccato per l'attacco, tenuto per il corpo) e, sotto,
    gli ottoni del sintetizzatore (`elettronici` dB rispetto a quelli veri; None per toglierli)."""
    trb, cor, tr = note
    for st, su, ns, g in ((o.trb_stac, o.trb_sus, trb, 0.0), (o.cor_stac, o.cor_sus, cor, -1.0), (o.tr_stac, o.tr_sus, tr, -0.5)):
        for m in ns:
            p.metti("ottoni", t, st.suona(m, forza), db + g, voce="ottoni")
            if durata:
                p.metti("ottoni", t + 0.01, su.suona(m, forza * 0.9, durata=durata, coda=0.35), db + g - 4, voce="ottoni")
    if elettronici is not None:
        d = round(durata or 0.32, 3)
        for m in sorted(set(trb + cor + tr)):
            p.metti("ottoni", t, ottone_elettronico(m, d, round(forza, 2)), db + elettronici, umano=False, voce="sintetizzatore")


def crescendo_ottoni(p, o, t, note, durata, db, da=0.3):
    """Ottoni tenuti che crescono da `da` (frazione) al pieno in `durata` secondi: le note sono (strumento, midi, dB)."""
    for strum, m, g in note:
        y = strum.suona(m, 0.85, durata=durata, coda=0.05, attacco=0.06)
        p.metti("ottoni", t, y * np.linspace(da, 1.0, len(y)) ** 1.6, db + g, voce="ottoni")


def apertura(o):
    """Il levare (due battiti), la battuta del colpo e quella della frase, poi le code."""
    p = Pista(TAPPETO + 3.0, seme=11)
    T = LEVARE  # la prima battuta
    pos = lambda b, s: T + b * BAR + s * STEP
    # levare: ticchettio che cresce, due segnali orari, rullo di timpano, piatto sospeso e rumore che salgono
    ticchettio(p, pos(-1, 0), -2, da=8, a=16, cresc=(-8, 0))
    for s in (8, 12):
        p.metti("segnali", pos(-1, s), segnale(0.1), -2, umano=False, voce="segnali orari")
    p.metti("percussioni", 0.0, o.timpani.rullo(38, LEVARE, 0.15, 0.8), -2, umano=False, voce="timpani")
    cr = fino_al_picco(o.sospeso.suona(1.0), 1.6)
    p.metti("percussioni", T - len(cr) / SR + 0.02, cr, -8, umano=False, voce="piatti")
    p.metti("elettronica", 0.0, salita(LEVARE), -10, umano=False, voce="salita")
    # il colpo sul Re minore
    re_min = ((50, 53, 57), (62, 65, 69), (74, 81))
    colpo_ottoni(p, o, T, re_min, 1.0, durata=0.4, db=0)
    p.metti("percussioni", T, o.timpani.colpo(38, 1.0), 0, voce="timpani")
    p.metti("percussioni", T, o.grancassa.suona(1.0), -2, voce="grancassa")
    p.metti("percussioni", T, o.piatto.suona(1.0), -6, voce="piatti")
    p.metti("elettronica", T, boom(), -4, umano=False, voce="sub")
    for s, f in ((3, 0.7), (6, 0.85)):
        colpo_ottoni(p, o, pos(0, s), re_min, f, db=-2)
        p.metti("percussioni", pos(0, s), o.timpani.colpo(38, f), -3, voce="timpani")
    # la frase delle trombe (i corni un'ottava sotto): Fa Mi Re | Fa Sol Mi, poi il colpo in levare sul La
    frase = ((0, 8, 77, 3), (0, 11, 76, 3), (0, 14, 74, 2), (1, 0, 77, 6), (1, 6, 79, 2), (1, 8, 76, 6))
    for b, s, m, lung in frase:
        d = lung * STEP
        p.metti("ottoni", pos(b, s), o.tr_stac.suona(m, 0.95), -1, voce="frase")
        p.metti("ottoni", pos(b, s) + 0.01, o.tr_sus.suona(m, 0.9, durata=d, coda=0.12), -3, voce="frase")
        p.metti("ottoni", pos(b, s), o.cor_sus.suona(m - 12, 0.85, durata=d, coda=0.15), -5, voce="frase")
        p.metti("ottoni", pos(b, s), ottone_elettronico(m, round(d * 0.9, 3), 0.8), -14, umano=False, voce="sintetizzatore")
    # seconda battuta: Si bemolle, Do, poi La che cresce e il colpo in levare
    colpo_ottoni(p, o, pos(1, 0), ((46, 50, 53), (58, 62, 65), (74,)), 0.85, durata=0.5, db=-2)
    p.metti("percussioni", pos(1, 0), o.timpani.colpo(46, 0.8), -3, voce="timpani")
    p.metti("percussioni", pos(1, 0), o.grancassa.suona(0.7), -5, voce="grancassa")
    colpo_ottoni(p, o, pos(1, 6), ((48, 52, 55), (60, 64, 67), ()), 0.75, db=-3)
    crescendo_ottoni(p, o, pos(1, 8), ((o.cor_sus, 57, 0), (o.cor_sus, 61, 0), (o.cor_sus, 64, 0),
                                        (o.trb_sus, 45, 0), (o.trb_sus, 52, 0), (o.trb_sus, 57, 0)), 6 * STEP, -6, da=0.45)
    p.metti("percussioni", pos(1, 8), o.timpani.rullo(45, 6 * STEP, 0.2, 0.75), -4, umano=False, voce="timpani")
    colpo_ottoni(p, o, pos(1, 14), ((45, 52, 57), (61, 64, 69), (73, 76, 81)), 1.0, durata=0.18, db=-1)
    p.metti("percussioni", pos(1, 14), o.timpani.colpo(45, 0.95), -1, voce="timpani")
    p.metti("percussioni", pos(1, 14), o.grancassa.suona(0.85), -3, voce="grancassa")
    p.metti("percussioni", pos(1, 14), o.piatto.suona(0.75, durata=0.35, coda=0.25), -8, voce="piatti")
    # archi, pulsazione e ticchettio sotto le due battute
    archi_a_sedicesimi(p, o, pos(0, 0), "Re-", 0.95, db=-3)
    archi_a_sedicesimi(p, o, pos(1, 0), "Sib", 0.9, db=-3, a=6)
    archi_a_sedicesimi(p, o, pos(1, 0), "Do", 0.9, db=-3, da=6, a=8)
    archi_a_sedicesimi(p, o, pos(1, 0), "La", 0.95, db=-3, da=8, a=14)
    p.metti("archi", pos(1, 14), o.vln_spic.suona(81, 1.0), -1, voce="violini")
    p.metti("archi", pos(1, 14), o.vc_spic.suona(45, 1.0), 0, voce="violoncelli")
    p.metti("archi", pos(1, 14), o.vc_spic.suona(57, 1.0), -3, voce="violoncelli")
    pulsazioni(p, pos(0, 0), "Re-", -6)
    pulsazioni(p, pos(1, 0), "Sib", -6, a=6)
    pulsazioni(p, pos(1, 0), "Do", -6, da=6, a=8)
    pulsazioni(p, pos(1, 0), "La", -6, da=8, a=14)
    ticchettio(p, pos(0, 0), -4)
    ticchettio(p, pos(1, 0), -4, a=14)
    p.livelli({"ottoni": 0, "frase": -3, "sintetizzatore": -8, "violini": -9, "violoncelli": -10, "timpani": -6,
               "grancassa": -12, "piatti": -10, "sub": -14, "pulsazione": -12, "salita": -16, "segnali orari": -10,
               "ticchettio": -16})
    y = mixa(p)
    # le code che restano sotto il tappeto e la voce si spengono entro la fine della parte
    y *= np.concatenate([np.ones(int((TAPPETO + 0.5) * SR)), np.linspace(1, 0, len(y) - int((TAPPETO + 0.5) * SR)) ** 2])
    return y, p


def tappeto(o):
    """Il giro di otto battute su una pista circolare: le code della fine (riverbero, note tenute, il piatto che
    cresce verso la prima battuta) rientrano dall'inizio, così il giro ripetuto non ha cuciture."""
    L = BATTUTE * BAR
    p = Pista(L, seme=23, circolare=True)
    for b, acc in enumerate(GIRO):
        archi_a_sedicesimi(p, o, b * BAR, acc, 0.42, db=-4)
        pulsazioni(p, b * BAR, acc, -9)
        ticchettio(p, b * BAR, -9)
    p.metti("percussioni", 0.0, o.timpani.colpo(38, 0.35), -8, voce="timpani")
    p.metti("percussioni", 0.0, o.grancassa.suona(0.3), -10, voce="grancassa")
    p.metti("percussioni", 4 * BAR, o.timpani.colpo(38, 0.3), -10, voce="timpani")
    p.metti("percussioni", 7 * BAR + 8 * STEP, o.timpani.rullo(45, 8 * STEP, 0.1, 0.4), -10, umano=False, voce="timpani")
    cr = fino_al_picco(o.sospeso.suona(0.6), 2.0)
    p.metti("percussioni", L - len(cr) / SR + 0.02, cr, -18, umano=False, voce="piatti")
    tenuta(p, o.vla_sus, "archi", 0.0, VIOLE, 0.35, -2, voce="viole")
    tenuta(p, o.vln_sus, "archi", 0.0, VIOLINI, 0.3, -8, voce="violini tenuti")
    for v in range(2):
        tenuta(p, o.cor_sus, "ottoni", 0.0, tuple(c[v] for c in CORNI), 0.3, -6, coda=0.4, attacco=0.25, voce="corni")
    p.livelli({"violini": 0, "violoncelli": -3, "pulsazione": -5, "viole": -7, "corni": -8, "violini tenuti": -10,
               "ticchettio": -10, "timpani": -11, "piatti": -15, "grancassa": -14})
    # sotto la voce: un incavo dove sta la voce, qualche basso in meno, niente acuti taglienti
    y = mixa(p, extra_eq=lambda f: curva(f, alto=60, basso=11000, campane=((1900, 2.2, -5.5), (300, 1.0, -2.0))))
    return y, p


def chiusura(o):
    """La battuta del conto alla rovescia sul La e il colpo finale sul Re minore."""
    p = Pista(COLPO + 4.5, seme=37)
    for s in (0, 4, 8, 12):
        p.metti("segnali", s * STEP, segnale(0.1), -2, umano=False, voce="segnali orari")
    ticchettio(p, 0.0, -4, cresc=(-3, 2))
    archi_a_sedicesimi(p, o, 0.0, "La", 0.85, db=-3, cresc=(-4, 0))
    pulsazioni(p, 0.0, "La", -6, cresc=(-2, 0))
    crescendo_ottoni(p, o, 0.0, ((o.cor_sus, 57, 0), (o.cor_sus, 61, 0), (o.cor_sus, 64, 0), (o.trb_sus, 45, 0),
                                  (o.trb_sus, 52, 0), (o.trb_sus, 57, 0), (o.tr_sus, 76, -3)), COLPO - 0.06, -5, da=0.25)
    p.metti("percussioni", 0.0, o.timpani.rullo(45, COLPO, 0.1, 0.9), -3, umano=False, voce="timpani")
    cr = fino_al_picco(o.sospeso.suona(1.0), COLPO)
    p.metti("percussioni", COLPO - len(cr) / SR + 0.02, cr, -8, umano=False, voce="piatti")
    p.metti("elettronica", COLPO - 1.2, salita(1.2), -10, umano=False, voce="salita")
    # il colpo finale
    colpo_ottoni(p, o, COLPO, ((50, 53, 57), (62, 65, 69), (74, 81)), 1.0, durata=2.2, db=0)
    p.metti("percussioni", COLPO, o.timpani.colpo(38, 1.0, durata=4.0), 0, voce="timpani")
    p.metti("percussioni", COLPO, o.grancassa.suona(1.0), -2, voce="grancassa")
    p.metti("percussioni", COLPO, o.piatto.suona(1.0), -5, voce="piatti")
    p.metti("percussioni", COLPO, o.tamtam.suona(0.6, durata=3.0, coda=1.2), -8, voce="tam-tam")
    p.metti("elettronica", COLPO, boom(1.8), -3, umano=False, voce="sub")
    for strum, ns, g in ((o.vc_sus, (38, 50), -2), (o.vla_sus, (62, 65), -5), (o.vln_sus, (74, 81, 86), -5)):
        for m in ns:
            p.metti("archi", COLPO, strum.suona(m, 0.9, durata=2.2, coda=1.0), g, voce="archi tenuti")
    p.livelli({"ottoni": 0, "sintetizzatore": -8, "archi tenuti": -6, "violini": -5, "violoncelli": -6, "timpani": -6,
               "grancassa": -12, "piatti": -10, "tam-tam": -14, "sub": -14, "pulsazione": -10, "salita": -16,
               "segnali orari": -7, "ticchettio": -13})
    y = mixa(p)
    # dopo il colpo tutto si spegne in tre secondi e mezzo
    i = int((COLPO + 1.0) * SR)
    y[i:] *= np.linspace(1, 0, len(y) - i) ** 1.5
    return y, p


def masterizza(y, cresta, circolare=False):
    """Il master di una parte: i picchi (timpani, colpi) non più di `cresta` dB sopra il volume percepito."""
    tetto = 10 ** ((lufs(np.concatenate([y, y]) if circolare else y) + cresta) / 20)
    return due_volte(lambda z: limita(z, tetto), y, circolare)


def rendi(vsco, dest=CARTELLA):
    import soundfile as sf
    o = Orchestra(vsco)
    fatte = {"apertura": masterizza(apertura(o)[0], 12), "tappeto": masterizza(tappeto(o)[0], 13, circolare=True),
             "chiusura": masterizza(chiusura(o)[0], 12)}
    # sigla e chiusura con lo stesso guadagno (il picco più alto a -1 dBFS), così restano nei rapporti della
    # partitura; il tappeto per conto suo (il montaggio lo mette sotto la voce al volume che serve)
    rif = max(np.max(np.abs(fatte[k])) for k in ("apertura", "chiusura"))
    os.makedirs(dest, exist_ok=True)
    for nome, y in fatte.items():
        y = y / (np.max(np.abs(y)) if nome == "tappeto" else rif) * 0.89
        sf.write(os.path.join(dest, nome + ".flac"), y.astype(np.float32), SR, subtype="PCM_16")
        print(f"{nome}: {len(y) / SR:.2f} s, {lufs(y):.1f} LUFS, picco {20 * np.log10(np.max(np.abs(y))):.1f} dBFS")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rendi(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else CARTELLA)
