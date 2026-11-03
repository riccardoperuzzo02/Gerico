/* GERICO: pagine di testo (Come funziona, Privacy). */
G.page("info", async function () {
  "use strict";
  G.initPrefs();
  const outlets = document.getElementById("outlets"), quality = document.getElementById("quality");
  if (!outlets && !quality) return;
  const ed = await G.load("edition");
  if (!ed) return;
  if (outlets && (ed.outlets || []).length) outlets.textContent = "Testate lette nell'edizione di " + G.longDay(ed.lastRun) + ": " + ed.outlets.join(", ") + ".";
  const q = ed.quality;
  if (quality && q && typeof q.articlesRead === "number") {
    quality.textContent = "In quel giro: " + q.articlesRead + " articoli letti, " + (q.articlesDiscarded || 0) + " scartati perché vecchi, " +
      (q.factsChecked || 0) + " fatti ricontrollati" + (q.factsCorrected ? ", " + q.factsCorrected + " corretti" : "") + ".";
  }
});
