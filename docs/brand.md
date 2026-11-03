# GERICO: identità «Tratto»

Scelta il 3 novembre 2026 fra tre rifiniture di «Evidenziatore». Le regole qui sotto valgono per sito, Terminal, immagini e audio. I valori stanno in `site/assets/css/gerico.css` (blocco «identità Tratto» in fondo).

## Idea

GERICO legge più testate e mette in evidenza i fatti condivisi. Il segno è il tratto dell'evidenziatore: si usa per dire «questo conta», non per decorare.

## Colori

| Ruolo | Chiaro | Scuro e Terminal |
|---|---|---|
| Fondo (`--ground`) | #FAF8F3, color carta | #0B0B0C, nero inchiostro |
| Riquadri (`--group`) | #FFFFFF con filo #E4DFD3 | #161618 con filo #26262A |
| Testo (`--ink`) | #0B0B0C | #F5F5F2 |
| Evidenziatore (`--hl`) | #FFD60A | #FFD60A |
| Tratto sotto il nome (`--band-color`) | #FFD60A | #3B350B, oliva scuro |
| Nome (`--brand`) | #0B0B0C | #FFD60A |
| Su e giù (`--up`, `--down`) | #0B7A3B, #B42318 | i verdi e rossi del tema scuro |

Un solo giallo. Il giallo non si usa per i testi su fondo chiaro (non si legge): lì si usa il tratto sotto il testo.

## Il tratto

- Dove sì: il nome GERICO; il titolo d'apertura della prima pagina; la sezione negli occhielli; la sezione attiva (linea di 4 px); la selezione del testo; la sottolineatura dei link; l'avanzamento del riepilogo a voce.
- Dove no: titoli delle altre notizie, pulsanti, numeri dei mercati, etichette di stato.
- Forma: copre la metà bassa delle lettere (dal 52% al 94% dell'altezza), con le punte oblique (2%). Al buio il nome diventa giallo e il tratto oliva scuro.
- È un `::before` dietro al testo: si anima con `transform: scaleX()` da sinistra.

## Caratteri

- Atkinson Hyperlegible Next, servito dal sito (nessun font esterno).
- Titoli 800, spaziatura stretta (da −0,02 a −0,03 em). Testo 400. Occhielli 800 maiuscoli con spaziatura 0,06 em.
- Cifre tabellari nei numeri che cambiano (prezzi, tempi del riepilogo).

## Spazi e forme

- Raggio dei riquadri 14 px; riquadri bianchi con un filo da 1 px, senza ombre in chiaro.
- Margini laterali 16 px sul telefono.
- Aree da toccare di almeno 44 px.

## Movimento

- Quattro durate: `--t-1` 140 ms (risposte al tocco), `--t-2` 220 ms (piccoli cambi), `--t-3` 360 ms (pagine e pannelli), `--t-4` 560 ms (entrata e passaggi grandi).
- Curve: `--ease` per quasi tutto, `--ease-emph` per il tratto, `--ease-exit` per ciò che esce, `--snap` per gli indicatori che scorrono.
- Solo `transform`, `opacity` e `clip-path`. Con «riduci movimento» resta una dissolvenza breve.
- Pagine: avanti entra da destra, indietro da sinistra; tra Notizie e Terminal un cerchio dal punto toccato; la barra in alto e quella del riepilogo restano ferme.
- Entrata: una volta al giorno il tratto attraversa il nome al centro, il nome va al suo posto e le notizie salgono a cascata (circa 1,1 s); nelle altre aperture solo il tratto sul nome in alto.

## Voce

- Riepilogo a voce: Nicola di Kokoro con il 15% di Sara, velocità 1,1, letto frase per frase; volume a −16 LUFS, AAC 64 kbps.
- Sigla: due note di marimba (la e mi), 1,25 s, generate in `scripts/audio.py`.
- Testo per l'orecchio: frasi brevi, passaggi tra i temi, numeri raggruppati, sigle scritte come si leggono.

## Tono dei testi

Italiano semplice, come una persona che spiega a un collega. Niente aggettivi enfatici né frasi fatte. I fatti prima, le interpretazioni dopo e dichiarate. Mai consigli di comprare o vendere.

## Icone e immagini

- Icona: quadrato giallo con la G nera. Nessun logo o simbolo di altri (niente icone Apple).
- Immagine di condivisione: fondo chiaro, GERICO con il tratto, la riga di mattoncini delle testate.
