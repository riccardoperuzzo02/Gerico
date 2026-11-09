/* GERICO: pagine di testo (Come funziona, Privacy). Il testo c'è in italiano e in inglese (data-only="it" | "en"). */
G.page("info", async function () {
  "use strict";
  G.initPrefs();
  const out = document.querySelectorAll("[data-outlets]"), qual = document.querySelectorAll("[data-quality]");
  if (!out.length && !qual.length) return;
  const ed = await G.load("edition");
  if (!ed) return;
  const en = (el) => !!el.closest("[data-only='en']");
  if ((ed.outlets || []).length) {
    out.forEach((el) => {
      el.textContent = en(el) ? "Outlets read for the edition of " + new Date(ed.lastRun).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" }) + ": " + ed.outlets.join(", ") + "."
        : "Testate lette nell'edizione di " + new Date(ed.lastRun).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }) + ": " + ed.outlets.join(", ") + ".";
    });
  }
  const q = ed.quality;
  if (q && typeof q.articlesRead === "number") {
    qual.forEach((el) => {
      el.textContent = en(el)
        ? "In that run: " + q.articlesRead + " articles read, " + (q.articlesDiscarded || 0) + " discarded as old, " + (q.factsChecked || 0) + " facts rechecked" + (q.factsCorrected ? ", " + q.factsCorrected + " corrected" : "") + "."
        : "In quel giro: " + q.articlesRead + " articoli letti, " + (q.articlesDiscarded || 0) + " scartati perché vecchi, " + (q.factsChecked || 0) + " fatti ricontrollati" + (q.factsCorrected ? ", " + q.factsCorrected + " corretti" : "") + ".";
    });
  }
});
