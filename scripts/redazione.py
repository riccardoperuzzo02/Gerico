#!/usr/bin/env python3
"""Aiuti per i giri della redazione su GitHub Actions (workflow «Redazione»).

Uso:
    python3 scripts/redazione.py giro             quale giro fare adesso (notizie, paesi, chiusure, agenda, titoli, prova):
                                                  righe giro=, variante=, modello=, turni=
    python3 scripts/redazione.py live             le storie live del database: rank, id, ultimo aggiornamento, titolo
    python3 scripts/redazione.py controlla        controlla il database con le regole del punto 8 del giro delle notizie
    python3 scripts/redazione.py pubblica <giro>  copia il database sul sito, scrive lastPublish o publishError, commit e push
    python3 scripts/redazione.py pubblica prova   come sopra su una copia: non cambia niente e non fa commit
    python3 scripts/redazione.py esito <file>     la risposta finale del giro dalla trascrizione (stream-json)

Il database è la cartella redazione/db, con lo stesso formato del dump di prima: un file JSON per documento
(stories/<id>.json, markets/snapshot.json, agenda/today.json, meta/status.json, terminal/..., brevi/today.json,
riepilogo/today.json, titoli/today.json). Claude Code lo legge e lo scrive; gli script di sempre lo copiano in site/data."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brevi import front_page  # noqa: E402  stessa regola delle brevi e del sito

ROME = ZoneInfo("Europe/Rome")
try:
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "mappe", "paesi.json"), encoding="utf-8") as _f:
        PAESI = set(json.load(_f))
except (OSError, ValueError):
    PAESI = set()
DB = "redazione/db"
SITE = "site"
ARCHIVE_DAYS = 7
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre",
        "novembre", "dicembre"]

# ora di Roma del giro -> come si chiama il giro nel testo (la prima riga del messaggio a Claude)
GIRI = {
    "notizie": {"ore": {7: "7:18", 13: "13:18"}, "modello": "claude-sonnet-5-5", "turni": 220},
    "chiusure": {"ore": {18: "18:45"}, "modello": "claude-sonnet-5-5", "turni": 40},
    # i risultati dei dati usciti (actual) nell'agenda del Terminal: dopo i dati europei e dopo quelli americani delle 14:30
    "agenda": {"ore": {12: "12:10", 15: "15:40"}, "modello": "claude-sonnet-5-5", "turni": 40},
    "paesi": {"ore": {9: "9:47"}, "modello": "claude-sonnet-5-5", "turni": 160},
    "titoli": {"ore": {7: "7:02"}, "modello": "claude-opus-5-5", "turni": 60},
    "prova": {"ore": {}, "modello": "claude-sonnet-5-5", "turni": 1},
    # solo la pubblicazione del database com'è, senza Claude (dopo una correzione a mano)
    "pubblica": {"ore": {}, "modello": "", "turni": 0},
}
# i cron sono in UTC: per ogni giro ce n'è uno per l'ora legale e uno per l'ora solare, e parte solo quello giusto
CRON = {
    "28 5 * * *": "notizie", "28 6 * * *": "notizie", "28 11 * * *": "notizie", "28 12 * * *": "notizie",
    "55 16 * * 1-5": "chiusure", "55 17 * * 1-5": "chiusure",
    "20 10 * * 1-5": "agenda", "20 11 * * 1-5": "agenda", "50 13 * * 1-5": "agenda", "50 14 * * 1-5": "agenda",
    "57 7 * * *": "paesi", "57 8 * * *": "paesi",
    "2 5 * * 1-5": "titoli", "2 6 * * 1-5": "titoli",
}
SECTIONS = {"mondo", "italia", "economia", "mercati", "tecnologia"}
# il giro dei paesi: ogni paese ha il suo blocco di rank (Stati Uniti 101, 102...; Regno Unito 201...)
BLOCCHI = {"US": 100, "GB": 200, "FR": 300, "DE": 400, "ES": 500}
CLASSES = ["indici", "azioni", "obbligazioni", "valute", "materie", "cripto"]
TZ_RE = re.compile(r"(Z|[+-]\d{2}:?\d{2})$")


def now_rome():
    return datetime.now(ROME).replace(microsecond=0)


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def parse_time(value):
    if not isinstance(value, str) or not TZ_RE.search(value.strip()):
        return None
    try:
        return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None


def stories(db=DB):
    d = os.path.join(db, "stories")
    out = []
    for name in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if name.endswith(".json"):
            s = load(os.path.join(d, name))
            if isinstance(s, dict):
                out.append((name[:-5], s))
    return out


# ---------- giro ----------

RITARDO_MAX = 4   # ore: un cron di GitHub che parte più tardi di così si salta
# dove ogni giro segna in meta/status che è stato fatto
SEGNO = {"notizie": ("lastRun",), "paesi": ("paesiRun", "at"), "chiusure": ("marketsRun", "at"),
         "agenda": ("agendaRun", "at")}


def stato_main():
    """meta/status com'è adesso su main (un cron in ritardo può essere partito da un commit vecchio)."""
    repo = os.environ.get("GITHUB_REPOSITORY")
    if repo:
        p = subprocess.run(["gh", "api", "-H", "Accept: application/vnd.github.raw",
                            f"repos/{repo}/contents/{DB}/meta/status.json?ref=main"],
                           capture_output=True, text=True)
        if p.returncode == 0:
            try:
                return json.loads(p.stdout)
            except ValueError:
                pass
    return load(os.path.join(DB, "meta", "status.json"), {})


def gia_fatto(giro, nominale):
    """L'ora del giro già fatto oggi (dopo l'ora del cron meno un'ora), oppure None."""
    chiavi = SEGNO.get(giro)
    if not chiavi:
        return None
    v = stato_main()
    for k in chiavi:
        v = v.get(k) if isinstance(v, dict) else None
    t = parse_time(v)
    if not t:
        return None
    t = t.astimezone(ROME)
    return t if t.date() == nominale.date() and t >= nominale - timedelta(hours=1) else None


def chiusure_fatte(now):
    mk = load(os.path.join(DB, "markets", "snapshot.json"), {}) or {}
    t = parse_time(mk.get("asOf"))
    if not t or "hiusur" not in str(mk.get("label") or ""):
        return False
    t = t.astimezone(ROME)
    return t.date() == now.date() and (t.hour, t.minute) >= (17, 35)


def cmd_giro():
    """Per il workflow: stampa giro, variante, modello e turni; niente se a quest'ora non c'è un giro da fare."""
    event = os.environ.get("GITHUB_EVENT_NAME", "")
    sched = os.environ.get("SCHEDULE", "").strip()
    scelta = os.environ.get("SCELTA", "").strip()
    now = now_rome()
    if event == "schedule":
        giro = CRON.get(sched)
        if not giro:
            print(f"Cron sconosciuto: «{sched}»", file=sys.stderr)
            return 0
        minute, hour = (int(x) for x in sched.split()[:2])
        day = datetime.now(timezone.utc).date()
        local = datetime(day.year, day.month, day.day, hour, minute, tzinfo=timezone.utc).astimezone(ROME)
        if local > now + timedelta(minutes=5):
            local -= timedelta(days=1)   # partito dopo la mezzanotte UTC: il cron era di ieri
        variante = GIRI[giro]["ore"].get(local.hour)
        if not variante:
            print(f"Il cron «{sched}» oggi cade alle {local:%H:%M} di Roma: il giro {giro} lo fa l'altro cron.",
                  file=sys.stderr)
            return 0
        # GitHub fa partire i cron quando può, a volte con ore di ritardo: troppo tardi il giro lo recupera il
        # prossimo, e se intanto è stato fatto a mano non si rifà
        ritardo = now - local
        if ritardo > timedelta(hours=RITARDO_MAX):
            print(f"Il giro {giro} delle {variante} parte con {ritardo.total_seconds() / 3600:.1f} ore di ritardo: "
                  "lo salto, lo recupera il prossimo giro.", file=sys.stderr)
            return 0
        fatto = gia_fatto(giro, local)
        if fatto:
            print(f"Il giro {giro} delle {variante} oggi c'è già stato (alle {fatto:%H:%M}): non lo rifaccio.",
                  file=sys.stderr)
            return 0
    elif scelta in GIRI:
        giro = scelta
        # le chiusure partono alle 18:45 e di nuovo alle 19:30: il secondo giro serve solo se il primo non ha trovato
        # gli articoli di chiusura (allora Mercati non ha ancora l'etichetta della chiusura con l'ora di oggi)
        if giro == "chiusure" and chiusure_fatte(now):
            print("Le chiusure di oggi ci sono già: non le rifaccio.", file=sys.stderr)
            return 0
        voluta = os.environ.get("VARIANTE", "").strip()
        if giro == "notizie":
            variante = voluta if voluta in GIRI["notizie"]["ore"].values() else ("7:18" if now.hour < 11 else "13:18")
        elif giro == "agenda":
            variante = "12:10" if now.hour < 14 else "15:40"
        else:
            variante = next(iter(GIRI[giro]["ore"].values()), "")
    else:
        print(f"Giro sconosciuto: «{scelta}»", file=sys.stderr)
        return 1
    g = GIRI[giro]
    print(f"giro={giro}\nvariante={variante}\nmodello={g['modello']}\nturni={g['turni']}")
    return 0


# ---------- live ----------

def cmd_live():
    live = [(s.get("rank") if isinstance(s.get("rank"), int) else 99, sid, s) for sid, s in stories()
            if s.get("status") == "live"]
    live.sort(key=lambda x: (x[0], x[1]))
    for rank, sid, s in live:
        print(f"{rank:>2}  {sid}  {s.get('updated', '?')}  [{s.get('section', '?')}]  {s.get('title', '')}")
    archived = sum(1 for _sid, s in stories() if s.get("status") != "live")
    print(f"Storie live: {len(live)}. Archiviate nel database: {archived} (quelle di più di {ARCHIVE_DAYS} giorni "
          "le cancella la pubblicazione).")
    return 0


# ---------- controlla ----------

def check_time(value, where, problems):
    if value in (None, ""):
        return
    if parse_time(value) is None:
        problems.append(f"{where}: «{value}» non è un orario ISO 8601 con il fuso")


def cmd_controlla(db=DB, quiet=False):
    problems = []
    today = now_rome().date().isoformat()
    live = []
    for sid, s in stories(db):
        where = f"stories/{sid}"
        if s.get("status") not in ("live", "archived"):
            problems.append(f"{where}: status «{s.get('status')}» (va «live» o «archived»)")
        for k in ("firstSeen", "updated"):
            check_time(s.get(k), f"{where}.{k}", problems)
        if s.get("status") != "live":
            continue
        live.append((sid, s))
        if not isinstance(s.get("rank"), int) or isinstance(s.get("rank"), bool):
            problems.append(f"{where}: rank «{s.get('rank')}» non è un numero intero")
        title = s.get("title") or ""
        if not title:
            problems.append(f"{where}: titolo vuoto")
        elif len(title) > 80:
            problems.append(f"{where}: titolo di {len(title)} caratteri (al massimo 80)")
        if ";" in title:
            problems.append(f"{where}: titolo con il punto e virgola")
        if len(s.get("summary") or "") > 300:
            problems.append(f"{where}: sintesi oltre 300 caratteri")
        # formato del 9 novembre: ogni storia è un articolo di GERICO scritto su tutte le fonti
        article = s.get("article") or ""
        if str(s.get("updated") or "")[:10] == today and not article.strip():
            problems.append(f"{where}: aggiornata oggi ma senza article, l'articolo di GERICO")
        if re.search(r"(testate|fonti|giornali)[^.]{0,40}\bconcord", article, re.I):
            problems.append(f"{where}: l'articolo parla di cosa concordano le testate (le testate sono le fonti, non l'argomento)")
        if not article.strip():
            problems.append(f"{where}: storia live senza article (ogni storia live è un articolo)")
        for k in ("title", "summary", "article", "view"):
            if re.search("[—–]", str(s.get(k) or "")):
                problems.append(f"{where}.{k}: c'è una lineetta («—» o «–»): virgola, punto, due punti o parentesi")
        if not isinstance(s.get("themes"), list):
            problems.append(f"{where}: manca themes (gli id dei temi caldi, anche [])")
        # i paesi e il luogo della mappa sopra l'articolo
        if not isinstance(s.get("places"), list):
            problems.append(f"{where}: manca places (le sigle ISO dei paesi della notizia, per la mappa)")
        else:
            cattive = [c for c in s["places"] if not (isinstance(c, str) and (c == "EU" or c in PAESI))]
            if cattive:
                problems.append(f"{where}: places con sigle che non sono paesi: {cattive} (due lettere ISO, es. \"UA\", o \"EU\")")
        city = s.get("city")
        if city is not None and not (isinstance(city, dict) and city.get("name") and isinstance(city.get("lat"), (int, float))
                                     and isinstance(city.get("lon"), (int, float)) and -90 <= city["lat"] <= 90 and -180 <= city["lon"] <= 180):
            problems.append(f"{where}: city deve essere {{name, lat, lon}} con le coordinate in numeri")
        if s.get("section") not in SECTIONS:
            problems.append(f"{where}: section «{s.get('section')}» non valida")
        names = []
        for src in s.get("sources") or []:
            name, url = (src.get("name") or "").strip(), src.get("url") or ""
            if name.lower() in names:
                problems.append(f"{where}: due voci per la stessa testata «{name}»")
            names.append(name.lower())
            if not re.match(r"^https?://", url) or front_page(url):
                problems.append(f"{where}: la fonte «{name}» non ha l'indirizzo di un articolo ({url or 'vuoto'})")
        hist = s.get("history") or []
        if len(hist) > 10:
            problems.append(f"{where}: history ha {len(hist)} voci (al massimo 10)")
        for i, h in enumerate(hist):
            check_time(h.get("at"), f"{where}.history[{i}].at", problems)
    # le storie dei paesi (scope "paese", giro dei paesi) hanno i loro rank, a blocchi per paese, e non contano nei
    # numeri della redazione principale
    principali = [(sid, s) for sid, s in live if s.get("scope") != "paese"]
    ranks = sorted(s.get("rank") for _sid, s in principali if isinstance(s.get("rank"), int))
    if ranks and ranks != list(range(1, len(ranks) + 1)):
        problems.append(f"rank delle storie live non vanno da 1 a {len(ranks)}: {ranks}")
    if len(principali) < 10:
        problems.append(f"storie live: {len(principali)} (ne servono almeno 10)")
    per_paese = {}
    for sid, s in live:
        if s.get("scope") != "paese":
            continue
        where, c, r = f"stories/{sid}", s.get("country"), s.get("rank")
        if c not in BLOCCHI:
            problems.append(f"{where}: storia dei paesi con country «{c}» (US, GB, FR, DE o ES)")
            continue
        per_paese[c] = per_paese.get(c, 0) + 1
        if isinstance(r, int) and not BLOCCHI[c] < r < BLOCCHI[c] + 100:
            problems.append(f"{where}: rank {r} fuori dal blocco di {c} ({BLOCCHI[c] + 1}-{BLOCCHI[c] + 99})")
        if (s.get("places") or [None])[0] != c:
            problems.append(f"{where}: places deve cominciare con «{c}»")
        if s.get("section") != "mondo":
            problems.append(f"{where}: le storie dei paesi hanno section «mondo»")
    for c, n in per_paese.items():
        if n > 4:
            problems.append(f"{c}: {n} storie live dei paesi (al massimo 4)")
    # ogni storia nata oggi ha la sua immagine: il numero (figure) o la foto di un luogo (photo)
    if os.environ.get("GIRO") in ("notizie", "paesi"):
        oggi_ = now_rome().date()
        for sid, s in live:
            fs = parse_time(s.get("firstSeen"))
            if fs and fs.astimezone(ROME).date() == oggi_ and not isinstance(s.get("photo"), dict) and not isinstance(s.get("figure"), dict):
                if (s.get("scope") == "paese") == (os.environ.get("GIRO") == "paesi"):
                    problems.append(f"stories/{sid}: storia nuova senza immagine (photo con un luogo, oppure figure con il numero)")
    # dopo il giro delle 7:18 ogni sezione ha le sue notizie del giorno (SEZIONI E CRONACA nel testo delle notizie)
    if os.environ.get("GIRO") == "notizie" and os.environ.get("VARIANTE") == "7:18":
        limite = datetime.now(timezone.utc) - timedelta(hours=24)
        conta = {}
        for _sid, s in principali:
            upd = parse_time(s.get("updated"))
            if upd and upd >= limite:
                conta[s.get("section")] = conta.get(s.get("section"), 0) + 1
        oggi = now_rome().date()
        nuove = sum(1 for _sid, s in principali if (parse_time(s.get("firstSeen")) or datetime(2000, 1, 1, tzinfo=timezone.utc)).astimezone(ROME).date() == oggi)
        if nuove < 4:
            problems.append(f"storie nuove di oggi: {nuove} (al giro delle 7:18 ne servono almeno 4, vedi CONSUMO)")
        for sec, minimo in (("italia", 3), ("mondo", 2), ("economia", 2), ("mercati", 2), ("tecnologia", 2)):
            if conta.get(sec, 0) < minimo:
                problems.append(f"sezione {sec}: {conta.get(sec, 0)} storie nuove o aggiornate nelle ultime 24 ore "
                                f"(ne servono {minimo}, vedi SEZIONI E CRONACA)")

    markets = load(os.path.join(db, "markets", "snapshot.json"))
    if markets is not None:
        keys = [c.get("key") for c in markets.get("classes") or []]
        if keys != CLASSES:
            problems.append(f"markets/snapshot: classi {keys} (servono {CLASSES}, in quest'ordine)")
        check_time(markets.get("asOf"), "markets/snapshot.asOf", problems)

    agenda = load(os.path.join(db, "agenda", "today.json"))
    if agenda is not None:
        for i, it in enumerate(agenda.get("items") or []):
            t = it.get("time") or ""
            if it.get("impact") == "alto" and not re.match(r"^\d{2}:\d{2}$", t):
                problems.append(f"agenda/today: «{it.get('event')}» è ad alto impatto e non ha l'orario HH:MM")
            elif t and not re.match(r"^\d{2}:\d{2}$", t):
                problems.append(f"agenda/today: orario «{t}» di «{it.get('event')}» non è HH:MM")
            for campo in ("expected", "previous", "actual"):
                v = str(it.get(campo) or "").strip()
                if v and not re.search(r"\d", v):
                    problems.append(f"agenda/today: {campo} «{v}» di «{it.get('event')}» non è un numero "
                                    "(solo il numero con la sua unità, oppure vuoto)")
            if len(str(it.get("event") or "")) > 65:
                problems.append(f"agenda/today: il nome «{str(it.get('event'))[:50]}…» è troppo lungo "
                                "(solo il nome del dato, senza commenti)")
        # gli eventi ad alto impatto del calendario di Forex Factory devono esserci (stessa valuta, orario entro 5 minuti)
        oggi_iso = now_rome().date().isoformat()
        cal = load(os.path.join(SITE, "data", "calendario.json"), {}) or {}
        if str(agenda.get("date") or "")[:10] == oggi_iso and isinstance(cal.get("items"), list):
            def minuti(t):
                m = re.match(r"^(\d{1,2}):(\d{2})$", str(t or ""))
                return int(m.group(1)) * 60 + int(m.group(2)) if m else None
            mie = [(str(it.get("currency") or "").upper(), minuti(it.get("time"))) for it in agenda.get("items") or []
                   if it.get("impact") == "alto"]
            for x in cal["items"]:
                if not isinstance(x, dict) or x.get("date") != oggi_iso or x.get("impact") != "alto":
                    continue
                m = minuti(x.get("time"))
                if m is not None and not any(c == x.get("currency") and mm is not None and abs(mm - m) <= 5 for c, mm in mie):
                    problems.append(f"agenda/today: manca «{x.get('title')}» ({x.get('currency')}, {x.get('time')}), "
                                    "ad alto impatto nel calendario di Forex Factory (site/data/calendario.json): "
                                    "aggiungilo, o segna impact \"alto\" se c'è già")
        check_time(agenda.get("asOf"), "agenda/today.asOf", problems)

    brevi = load(os.path.join(db, "brevi", "today.json"))
    if brevi is not None:
        items = brevi.get("items") or []
        if len(items) > 15:
            problems.append(f"brevi/today: {len(items)} brevi (al massimo 15)")
        story_urls = {src.get("url") for _sid, s in live for src in s.get("sources") or []}
        for b in items:
            url = b.get("url") or ""
            if not re.match(r"^https?://", url) or front_page(url):
                problems.append(f"brevi/today: «{b.get('title')}» non ha l'indirizzo di un articolo")
            elif url in story_urls:
                problems.append(f"brevi/today: «{b.get('title')}» ripete una fonte di una storia live")
            check_time(b.get("at"), f"brevi/today «{b.get('title')}».at", problems)

    riepilogo = load(os.path.join(db, "riepilogo", "today.json"))
    if riepilogo is not None:
        words = len((riepilogo.get("text") or "").split())
        if riepilogo.get("date") == today and not 380 <= words <= 450:
            problems.append(f"riepilogo/today: {words} parole (servono 380-450)")

    temi = (load(os.path.join(db, "meta", "temi.json"), {}) or {}).get("temi") or []
    if len(temi) != 3:
        problems.append(f"meta/temi: {len(temi)} temi (ne servono 3)")
    for t in temi:
        if not any(t.get("id") in (s.get("themes") or []) for _sid, s in live):
            problems.append(f"meta/temi: il tema «{t.get('label')}» non ha storie live")

    meta = load(os.path.join(db, "meta", "status.json"), {}) or {}
    check_time(meta.get("lastRun"), "meta/status.lastRun", problems)

    if not quiet:
        for p in problems:
            print("- " + p)
        print("Tutto a posto." if not problems else f"Da sistemare: {len(problems)}.")
    return problems


# ---------- pubblica ----------

def run(cmd, check=False):
    p = subprocess.run(cmd, capture_output=True, text=True)
    out = (p.stdout + p.stderr).strip()
    if check and p.returncode:
        raise RuntimeError(f"{' '.join(cmd)}: {out[-400:]}")
    return p.returncode == 0, out


def delete_old(db):
    """Cancella le storie archiviate da più di 7 giorni (prima lo faceva il giro delle notizie)."""
    limit = datetime.now(timezone.utc) - timedelta(days=ARCHIVE_DAYS)
    gone = []
    for sid, s in stories(db):
        upd = parse_time(s.get("updated"))
        if s.get("status") != "live" and upd and upd < limit:
            os.remove(os.path.join(db, "stories", sid + ".json"))
            gone.append(sid)
    return gone


def esito_line(giro, outputs, gone, warnings, meta):
    parts = []
    joined = "\n".join(outputs.values())
    m = re.search(r"Dump controllato: \d+ documenti, (\d+) correzioni", joined)
    if m:
        parts.append(f"check_dump.py: {m.group(1)} correzioni")
    m = re.search(r"brevi\.json: (\d+) brevi", joined)
    if m:
        parts.append(f"brevi.py: {m.group(1)} brevi copiate")
    m = re.search(r"riepilogo\.json: (\d+) parole", joined)
    if m:
        parts.append(f"riepilogo.py: riepilogo copiato ({m.group(1)} parole)")
    if "titoli.json: nessun" in joined:
        parts.append("titoli.py: nessun titolo nel database")
    else:
        m = re.search(r"titoli\.json: (\d+)", joined)
        if m:
            parts.append(f"titoli.py: {m.group(1)} titoli copiati")
    if gone:
        parts.append(f"cancellate {len(gone)} storie archiviate da più di {ARCHIVE_DAYS} giorni")
    if warnings:
        parts.append(f"controlla: {len(warnings)} cose da sistemare")
    if giro == "notizie" and (meta.get("quality") or {}).get("factsChecked") == 0:
        parts.append("controllo dei fatti non fatto")
    return f"Giro {giro} su GitHub; " + "; ".join(parts) + "."


def git_push():
    for i in range(4):
        ok, out = run(["git", "pull", "-q", "--rebase", "origin", "main"])
        if ok:
            ok, out = run(["git", "push", "-q", "origin", "HEAD:main"])
            if ok:
                return True, ""
        run(["git", "rebase", "--abort"])
        time.sleep((i + 1) * 15)
    return False, out


def github_output(**kv):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            for k, v in kv.items():
                f.write(f"{k}={v}\n")


def cmd_pubblica(giro):
    # chi pubblica è GERICO, anche nei commit che il rebase rifà quando main è andato avanti durante il giro
    for k, v in (("GIT_AUTHOR_NAME", "GERICO"), ("GIT_AUTHOR_EMAIL", "gerico@users.noreply.github.com"),
                 ("GIT_COMMITTER_NAME", "GERICO"), ("GIT_COMMITTER_EMAIL", "gerico@users.noreply.github.com")):
        os.environ.setdefault(k, v)
    prova = giro == "prova"
    db, site = DB, SITE
    if prova:
        tmp = tempfile.mkdtemp(prefix="gerico-prova-")
        shutil.copytree(DB, os.path.join(tmp, "db"))
        shutil.copytree(SITE, os.path.join(tmp, "site"))
        db, site = os.path.join(tmp, "db"), os.path.join(tmp, "site")
    gone = delete_old(db)
    py = sys.executable
    steps = [("check_dump.py", [db]), ("foto.py", [db, site]), ("export.py", [db, f"{site}/data"]), ("brevi.py", [db, f"{site}/data"]),
             ("riepilogo.py", [db, f"{site}/data"]), ("titoli.py", [db, f"{site}/data"]),
             ("share_pages.py", [site]), ("check_site.py", [site])]
    outputs, error = {}, None
    for name, args in steps:
        if not os.path.exists(os.path.join("scripts", name)):
            continue
        ok, out = run([py, os.path.join("scripts", name), *args])
        outputs[name] = out
        print(f"== {name}\n{out}")
        if not ok:
            tail = " | ".join(out.splitlines()[-3:])
            error = f"Passo {name} fallito: {tail}"
            break
    warnings = cmd_controlla(db, quiet=True)
    for w in warnings:
        print("controlla: " + w)

    status_path = os.path.join(db, "meta", "status.json")
    meta = load(status_path, {}) or {}
    at = now_rome().isoformat()
    if error:
        if not prova:
            run(["git", "checkout", "--", SITE])
            run(["git", "clean", "-fdq", SITE])
        meta["publishError"] = {"at": at, "message": error}
        print("ERRORE: " + error)
    else:
        meta["lastPublish"] = {"at": at, "esito": esito_line(giro, outputs, gone, warnings, meta)}
        meta.pop("publishError", None)
        print("Esito: " + meta["lastPublish"]["esito"])
    save(status_path, meta)
    if prova:
        shutil.rmtree(os.path.dirname(db), ignore_errors=True)
        return 1 if error else 0

    run(["git", "add", "-A", DB, SITE], check=True)
    ok, staged = run(["git", "diff", "--cached", "--name-only"])
    files = [f for f in staged.splitlines() if f]
    if not files:
        print("Niente di nuovo.")
        return 1 if error else 0
    t = now_rome()
    on_site = any(f.startswith(SITE + "/") for f in files)
    msg = ((f"Notizie dei paesi del {t.day} {MESI[t.month - 1]} alle {t:%H:%M}" if giro == "paesi"
            else f"Risultati dell'agenda del {t.day} {MESI[t.month - 1]} alle {t:%H:%M}" if giro == "agenda"
            else f"Edizione del {t.day} {MESI[t.month - 1]} alle {t:%H:%M}") if on_site
           else f"Database della redazione del {t.day}/{t.month} alle {t:%H:%M}")
    run(["git", "-c", "user.name=GERICO", "-c", "user.email=gerico@users.noreply.github.com",
         "commit", "-q", "-m", msg], check=True)
    pushed, out = git_push()
    if not pushed:
        print(f"::error::Push non riuscito dopo 4 tentativi: {out[-300:]}")
        return 1
    print(f"Pubblicato: {msg}")
    audio = any(f in (f"{SITE}/data/edition.json", f"{SITE}/data/riepilogo.json") for f in files)
    github_output(terminal="si" if audio else "no")
    return 1 if error else 0


# ---------- esito ----------

def cmd_esito(path):
    """La risposta finale di Claude Code, nel log e nel riepilogo del job su GitHub. Per il workflow scrive anche
    risposta=si (giro finito), interrotta (ha usato i suoi strumenti ma non ha finito: tempo, turni, limite
    dell'abbonamento; si pubblica quello che ha scritto) oppure no (non ha lavorato: accesso non riuscito, limite
    dell'abbonamento o errore prima di cominciare; non si pubblica niente)."""
    result, strumenti = None, 0
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(obj, dict):
                    continue
                if obj.get("type") == "result":
                    result = obj
                elif obj.get("type") == "assistant":
                    content = (obj.get("message") or {}).get("content") or []
                    strumenti += sum(1 for c in content if isinstance(c, dict) and c.get("type") == "tool_use")
    except OSError:
        pass
    finito = bool(result) and not result.get("is_error") and result.get("subtype") == "success"
    risposta = "si" if finito else ("interrotta" if strumenti else "no")
    # gli strumenti che il workflow non permette (scritture fuori da redazione/db, comandi non in elenco)
    negati = []
    for d in (result or {}).get("permission_denials") or []:
        if not isinstance(d, dict):
            continue
        inp = d.get("tool_input") if isinstance(d.get("tool_input"), dict) else {}
        cosa = inp.get("file_path") or inp.get("command") or inp.get("url") or inp.get("pattern") or ""
        cosa = re.sub(r"\s+", " ", str(cosa)).strip()
        negati.append(f"{d.get('tool_name', '?')} {cosa[:140]}".strip())
    if not result:
        text = (f"Claude Code non ha dato una risposta finale (accesso non riuscito o giro interrotto). "
                f"Strumenti usati: {strumenti}.")
    else:
        mins = round((result.get("duration_ms") or 0) / 60000, 1)
        text = (f"{(result.get('result') or '').strip() or result.get('subtype')}\n\n"
                f"Turni: {result.get('num_turns')}, strumenti usati: {strumenti}, durata: {mins} minuti.")
    if negati:
        text += f"\n\nPermessi negati ({len(negati)}):\n" + "\n".join(f"- {n}" for n in negati[:20])
    print(text)
    print(f"Esito per il workflow: {risposta}")
    if negati:
        print(f"::warning::Claude Code si è visto negare {len(negati)} azioni: l'elenco è nel passo Giro.")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("### Risposta del giro\n\n" + text + "\n")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as f:
            f.write(f"risposta={risposta}\n")
    return 0 if finito else 1


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == "giro":
        return cmd_giro()
    if cmd == "live":
        return cmd_live()
    if cmd == "controlla":
        return 1 if cmd_controlla() else 0
    if cmd == "pubblica" and len(argv) == 3:
        return cmd_pubblica(argv[2])
    if cmd == "esito" and len(argv) == 3:
        return cmd_esito(argv[2])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
