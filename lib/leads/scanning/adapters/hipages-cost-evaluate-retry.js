(function(el) {
  function costOnly(text) {
    var t = (text || '').trim();
    if (/^free$/i.test(t)) return "Free";
    if (/^\$\d+(\.\d+)?$/.test(t) || /^\d+(?:\.\d+)?\s+credits?$/i.test(t)) return t;
    var withSuffix = /^(\$\d+(?:\.\d+)?|\d+(?:\.\d+)?\s+credits?)\s*-\s*./i.exec(t);
    if (withSuffix) return withSuffix[1].trim();
    return null;
  }
  var sections = Array.from(el.querySelectorAll(":scope > section"));
  for (var i = 0; i < sections.length; i++) {
    var costSection = sections[i];
    if (!costSection) continue;
    var sectionText = (costSection.innerText || costSection.textContent || "").trim();
    if (/\bfree\b/i.test(sectionText)) return { leadCost: "Free", snippet: "" };
    var cost = costOnly(sectionText);
    if (cost) return { leadCost: cost, snippet: "" };
    var span = costSection.querySelector("div span");
    var spanText = span ? (span.innerText || span.textContent || "").trim() : "";
    if (spanText && /\bfree\b/i.test(spanText)) return { leadCost: "Free", snippet: "" };
    if (spanText) {
      var creditsMatch = /(\d+(?:\.\d+)?)\s*credits?/i.exec(spanText);
      if (creditsMatch) return { leadCost: creditsMatch[1] + " credits", snippet: "" };
      var dollarMatch = /\$(\d+(?:\.\d+)?)/.exec(spanText);
      if (dollarMatch) return { leadCost: "$" + dollarMatch[1], snippet: "" };
    }
  }
  var fullText = (el.innerText || el.textContent || "").trim();
  var dm = /\$(\d+(?:\.\d+)?)/.exec(fullText);
  if (dm) return { leadCost: "$" + dm[1], snippet: "" };
  var cm = /(\d+(?:\.\d+)?)\s*credits?/i.exec(fullText);
  if (cm) return { leadCost: cm[1] + " credits", snippet: "" };
  return { leadCost: null, snippet: fullText.slice(-400).replace(/\s+/g, " ").trim() };
})
