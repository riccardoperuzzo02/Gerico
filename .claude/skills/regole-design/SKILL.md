---
name: regole-design
description: Regole di disegno da seguire quando si crea o si cambia un'interfaccia di GERICO (CSS, componenti, pagine).
---

# Regole di disegno

- Angoli annidati: raggio interno = raggio esterno meno il padding.
- Bordi con colori in trasparenza, come `rgb(0 0 0 / 0.12)`, non esadecimali pieni.
- Palette in OKLCH, non HSL, con il colore esadecimale di riserva dove il browser non capisce OKLCH (`CSS.supports`).
- Sfumature `in oklch`, come `linear-gradient(90deg in oklch, blue, orange)`, dentro `@supports`.
- Tratto delle icone uguale al peso del testo accanto.
- Caroselli e file che scorrono: bordi sfumati con
  `mask: linear-gradient(90deg, transparent, black 15% 85%, transparent)` (in GERICO: `G.bordi`).
- Negli scambi di icona quella che esce sfuma con `filter: blur(4px)`.
- Al buio la profondità si fa con superfici più chiare, non con le ombre.
- Sezioni a tutta altezza con `100dvh`, non `100vh`.
- Foto di prodotto su fondo bianco con `mix-blend-mode: multiply`.

Le animazioni devono essere curate e brevi, e con `prefers-reduced-motion` si spengono.
In `site/assets/css/gerico.css` il blocco «Regole di disegno (17 novembre)» ha già le variabili da riusare.
