"""Prove nella pagina della ricerca del Terminal (Playwright con Chrome sul sito statico in locale).

    python3 -m pytest -q tests/test_ricerca_pagina.py

Le chiamate a /api/cerca e /api/titolo (il Worker) si fingono con page.route: il sito statico non le ha.
"""
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright, expect

SITO = Path(__file__).resolve().parent.parent / "site"
CHROME = "/usr/bin/google-chrome"
YAHOO = {"q": "eni", "risultati": [
    {"s": "E", "n": "Eni S.p.A.", "b": "NYSE", "k": "azione"},
    {"s": "ENI.MI", "n": "Eni S.p.A.", "b": "Milan", "k": "azione"},
    {"s": "ENIC", "n": "Enel Chile S.A.", "b": "NYSE", "k": "azione"},
]}


def porta_libera():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@pytest.fixture(scope="module")
def base():
    p = porta_libera()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(p), "-d", str(SITO), "--bind", "127.0.0.1"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            socket.create_connection(("127.0.0.1", p), timeout=0.2).close()
            break
        except OSError:
            time.sleep(0.1)
    yield f"http://127.0.0.1:{p}"
    srv.terminate()


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        yield b
        b.close()


def apri(browser, base, larghezza, yahoo=200, lingua="", rotte=None):
    telefono = larghezza < 760
    ctx = browser.new_context(viewport={"width": larghezza, "height": 720 if telefono else 820},
                              has_touch=telefono, is_mobile=telefono, device_scale_factor=2 if telefono else 1)
    pg = ctx.new_page()
    pg.add_init_script("try{sessionStorage.setItem('gerico.intro','1')}catch(e){}")
    chiamate = []

    def finta(route):
        chiamate.append(route.request.url)
        if yahoo == 200:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(YAHOO))
        else:
            route.fulfill(status=yahoo, content_type="application/json", body=json.dumps({"errore": "yahoo"}))

    pg.route("**/api/cerca*", finta)
    def risponde(stato, corpo):
        return lambda route: route.fulfill(status=stato, content_type="application/json", body=json.dumps(corpo))
    for schema, (stato, corpo) in (rotte or {}).items():
        pg.route(schema, risponde(stato, corpo))
    richieste = []
    pg.on("request", lambda r: richieste.append(r.url))
    pg.goto(base + "/terminal.html" + lingua, wait_until="networkidle")
    pg.chiamate, pg.richieste = chiamate, richieste
    return pg


def pronto(pg):
    """Il campo ha caricato i dati dei titoli (data-pronto sul modulo)."""
    pg.locator("#tq").focus()
    pg.wait_for_selector("#t-cerca[data-pronto]", timeout=8000)


@pytest.mark.parametrize("larghezza", [320, 390, 1280])
def test_il_campo_resta_in_vista_scorrendo(browser, base, larghezza):
    pg = apri(browser, base, larghezza)
    pg.evaluate("window.scrollTo(0, 2000)")
    pg.wait_for_timeout(300)
    box = pg.locator("#tq").bounding_box()
    assert box and box["y"] >= 0 and box["y"] + box["height"] <= 720 and box["width"] >= 120, box
    expect(pg.locator("#tq")).to_be_visible()
    pg.context.close()


def test_i_dati_dei_titoli_si_caricano_solo_usando_il_campo(browser, base):
    pg = apri(browser, base, 1280)
    assert not any("/data/indici/USA.json" in u for u in pg.richieste)
    pronto(pg)
    assert any("/data/indici/USA.json" in u for u in pg.richieste)
    pg.context.close()


def test_eni_in_meno_di_300_ms_e_tastiera(browser, base):
    pg = apri(browser, base, 1280)
    pronto(pg)
    t0 = time.monotonic()
    pg.keyboard.type("eni")
    pg.wait_for_selector("#tq-l [role=option]:has-text('Eni')", timeout=300)
    assert time.monotonic() - t0 < 0.6
    assert pg.get_attribute("#tq", "aria-expanded") == "true"
    pg.keyboard.press("ArrowDown")
    attivo = pg.get_attribute("#tq", "aria-activedescendant")
    assert attivo and "Eni" in pg.locator("#" + attivo).inner_text()
    pg.keyboard.press("Enter")
    expect(pg.locator("#map-h")).to_contain_text("FTSE MIB", timeout=5000)
    expect(pg.locator("#tq-p")).to_be_hidden()
    pg.context.close()


def test_esc_chiude(browser, base):
    pg = apri(browser, base, 1280)
    pronto(pg)
    pg.keyboard.type("eni")
    expect(pg.locator("#tq-p")).to_be_visible()
    pg.keyboard.press("Escape")
    expect(pg.locator("#tq-p")).to_be_hidden()
    assert pg.get_attribute("#tq", "aria-expanded") == "false"
    pg.context.close()


def test_altri_titoli_da_yahoo_senza_doppioni(browser, base):
    pg = apri(browser, base, 1280)
    pronto(pg)
    pg.keyboard.type("eni")
    expect(pg.locator("#tq-l")).to_contain_text("Enel Chile", timeout=3000)
    assert pg.locator("#tq-l [role=option]:has-text('ENI.MI')").count() == 0
    assert len(pg.chiamate) == 1
    pg.context.close()


def test_yahoo_che_non_risponde(browser, base):
    pg = apri(browser, base, 1280, yahoo=502)
    pronto(pg)
    pg.keyboard.type("eni")
    expect(pg.locator("#tq-p")).to_contain_text("Yahoo Finance non risponde ora", timeout=3000)
    expect(pg.locator("#tq-l [role=option]:has-text('Eni')").first).to_be_visible()
    pg.context.close()


def test_a_320_px_niente_esce_e_l_elenco_sta_sopra_la_barra(browser, base):
    pg = apri(browser, base, 320)
    pronto(pg)
    pg.keyboard.type("a")
    pg.keyboard.type("s")
    expect(pg.locator("#tq-p")).to_be_visible()
    assert pg.evaluate("document.documentElement.scrollWidth") <= 320
    pan = pg.locator("#tq-p").bounding_box()
    assert pan["x"] >= 0 and pan["x"] + pan["width"] <= 320, pan
    barra = pg.locator(".pb")
    if barra.count() and barra.first.is_visible():
        assert pan["y"] + pan["height"] <= barra.first.bounding_box()["y"] + 1, (pan, barra.first.bounding_box())
    pg.context.close()


def test_scrivere_in_fretta_lascia_i_risultati_dell_ultimo_testo(browser, base):
    pg = apri(browser, base, 1280)
    pronto(pg)
    for parziale in ["s", "st", "ste", "stel", "stell"]:
        pg.fill("#tq", parziale)
    pg.wait_for_timeout(900)
    nomi = pg.locator("#tq-l [role=option] .t-o-n").all_inner_texts()
    assert nomi and nomi[0].startswith("Stell"), nomi
    pg.context.close()


def test_slash_porta_al_campo_e_non_apre_le_notizie(browser, base):
    pg = apri(browser, base, 1280)
    pg.locator("body").click(position={"x": 5, "y": 400})
    pg.keyboard.press("/")
    assert pg.evaluate("document.activeElement && document.activeElement.id") == "tq"
    assert pg.locator("dialog[open]").count() == 0
    pg.context.close()


def test_in_inglese(browser, base):
    pg = apri(browser, base, 1280, lingua="?lang=en")
    assert "Search" in (pg.get_attribute("#tq", "placeholder") or "")
    pronto(pg)
    pg.keyboard.type("apple")
    expect(pg.locator("#tq-l")).to_contain_text("Stocks", timeout=2000)
    pg.context.close()


def test_sezioni_e_comandi(browser, base):
    pg = apri(browser, base, 1280)
    pronto(pg)
    pg.keyboard.type("agenda")
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(1200)
    top = pg.locator("#p-agenda").bounding_box()["y"]
    assert 0 <= top < 400, top
    pg.context.close()


@pytest.mark.parametrize("larghezza", [760, 900, 1000])
def test_sul_computer_stretto_orologio_e_campo_ci_stanno(browser, base, larghezza):
    pg = apri(browser, base, larghezza)
    orologio = pg.locator("#clock").bounding_box()
    campo = pg.locator("#tq").bounding_box()
    modo = pg.locator(".top .mode").bounding_box()
    assert orologio["width"] >= 60, orologio
    assert campo["width"] >= 170, campo
    assert orologio["x"] + orologio["width"] <= campo["x"] and campo["x"] + campo["width"] <= modo["x"], (orologio, campo, modo)
    assert pg.evaluate("document.documentElement.scrollWidth") <= larghezza
    pg.context.close()


# ---------- Task 4: cosa si apre ----------
SOCIETARI = {"asOf": "2026-11-26T15:44:45+01:00", "items": [
    {"kind": "utili", "date": "2099-12-07", "sym": "ENI.MI", "name": "Eni", "code": "ITA", "index": "FTSE MIB", "when": "", "period": ""}]}
ARCHIVIO = {"temi": {}, "aggiornato": "2026-11-26T15:00:00+01:00", "storie": [
    {"id": "2026-11-25-it-eni-prova", "t": "Gas: l'Eni prevede un inverno difficile", "s": "Prova.", "sec": "economia", "d": "2026-11-25T10:00:00+01:00", "tags": ["Eni"]}]}
TITOLO = {"s": "E", "n": "Eni S.p.A.", "b": "NYSE", "k": "azione", "cur": "USD", "p": 33.12, "t": "2026-11-26T16:35:19.000Z", "prev": 32.5,
          "c": 1.91, "c1w": -2.13, "c1m": -10.1, "c3m": 4.99, "lo": 32.9, "hi": 33.4, "lo52": 21.1, "hi52": 36.2,
          "spark": [30, 31, 30.5, 32, 33.12], "url": "https://finance.yahoo.com/quote/E"}
ROTTE = {"**/data/societari.json*": (200, SOCIETARI), "**/data/archivio.json*": (200, ARCHIVIO), "**/data/edition.json*": (200, {"stories": []})}


def scegli(pg, testo, nome):
    pg.fill("#tq", testo)
    pg.locator("#tq-l [role=option]").filter(has_text=nome).first.click()


def test_eni_apre_il_ftse_mib_con_la_scheda_completa(browser, base):
    pg = apri(browser, base, 1280, rotte=ROTTE)
    pronto(pg)
    scegli(pg, "eni", "Eni")
    expect(pg.locator("#map-h")).to_contain_text("FTSE MIB", timeout=5000)
    det = pg.locator("#indetail")
    expect(det).to_contain_text("Eni")
    expect(det).to_contain_text("Ultimo prezzo")
    expect(det).to_contain_text("peso")
    expect(det).to_contain_text("Trimestrale il 7 dic")
    expect(det).to_contain_text("l'Eni prevede un inverno difficile", timeout=3000)
    expect(det.locator("a[href*='finance.yahoo.com/quote/ENI.MI']")).to_have_count(1)
    assert pg.get_attribute("#inmap .tile[aria-pressed=true]", "data-code") == "ENI.MI"
    pg.context.close()


def test_da_dentro_il_dax_apple_porta_all_sp_500(browser, base):
    pg = apri(browser, base, 1280, rotte=ROTTE)
    pronto(pg)
    scegli(pg, "sap", "SAP")
    expect(pg.locator("#map-h")).to_contain_text("DAX", timeout=5000)
    scegli(pg, "apple", "Apple")
    expect(pg.locator("#map-h")).to_contain_text("S&P 500", timeout=5000)
    expect(pg.locator("#indetail")).to_contain_text("Apple")
    pg.context.close()


def test_un_titolo_di_yahoo_apre_il_foglio(browser, base):
    rotte = dict(ROTTE)
    rotte["**/api/titolo*"] = (200, TITOLO)
    pg = apri(browser, base, 1280, rotte=rotte)
    pronto(pg)
    pg.fill("#tq", "eni")
    pg.locator("#tq-l [role=option]").filter(has_text="NYSE").first.click()
    d = pg.locator("dialog#conto-d[open]")
    expect(d).to_contain_text("Eni S.p.A.", timeout=4000)
    expect(d).to_contain_text("33,12")
    expect(d).to_contain_text("+1,91%")
    expect(d).to_contain_text("3 mesi")
    expect(d.locator(".sk-sp")).to_have_count(1)
    expect(d.locator("a[href='https://finance.yahoo.com/quote/E']")).to_have_count(1)
    pg.context.close()


def test_il_foglio_dice_quando_yahoo_non_risponde(browser, base):
    rotte = dict(ROTTE)
    rotte["**/api/titolo*"] = (502, {"errore": "yahoo"})
    pg = apri(browser, base, 390, rotte=rotte)
    pronto(pg)
    pg.fill("#tq", "eni")
    pg.locator("#tq-l [role=option]").filter(has_text="NYSE").first.click()
    expect(pg.locator("dialog#conto-d[open]")).to_contain_text("non arrivano", timeout=4000)
    assert pg.evaluate("document.documentElement.scrollWidth") <= 390
    pg.context.close()
