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
  var sectionCount = sections.length;
  for (var i = 0; i < sections.length; i++) {
    var costSection = sections[i];
    if (!costSection) continue;
    var sectionText = (costSection.innerText || costSection.textContent || "").trim();
    if (/\bfree\b/i.test(sectionText)) return { leadCost: "Free", snippet: "" };
    var cost = costOnly(sectionText);
    if (cost) return { leadCost: cost, snippet: "" };
    var span = costSection.querySelector("div span");
    var spanText = span ? (span.innerText || span.textContent || "").trim() : "";
    if (spanText) {
      if (/\bfree\b/i.test(spanText)) return { leadCost: "Free", snippet: "" };
      var costFromSpan = costOnly(spanText);
      if (costFromSpan) return { leadCost: costFromSpan, snippet: "" };
      var creditsMatch = /(\d+(?:\.\d+)?)\s*credits?/i.exec(spanText);
      if (creditsMatch) return { leadCost: creditsMatch[1] + " credits", snippet: "" };
      var dollarMatch = /\$(\d+(?:\.\d+)?)/.exec(spanText);
      if (dollarMatch) return { leadCost: "$" + dollarMatch[1], snippet: "" };
    }
  }
  var allEls = Array.from(el.querySelectorAll("*"));
  for (var j = 0; j < allEls.length; j++) {
    if (allEls[j].children.length > 0) continue;
    var text = (allEls[j].innerText || allEls[j].textContent || "").trim();
    var c = costOnly(text);
    if (c) return { leadCost: c, snippet: "" };
  }
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  var node = walker.nextNode();
  while (node) {
    var txt = (node.textContent || "").trim();
    var c2 = costOnly(txt);
    if (c2) return { leadCost: c2, snippet: "" };
    if (/\$\d+(\.\d+)?/.test(txt) && txt.length < 20) return { leadCost: txt.trim(), snippet: "" };
    node = walker.nextNode();
  }
  var fullText = (el.innerText || el.textContent || "").trim();
  var dm = /\$(\d+(?:\.\d+)?)/.exec(fullText);
  if (dm) return { leadCost: "$" + dm[1], snippet: "" };
  var cm = /(\d+(?:\.\d+)?)\s*credits?/i.exec(fullText);
  if (cm) return { leadCost: cm[1] + " credits", snippet: "" };
  var snippet = fullText.length > 400 ? fullText.slice(-400) : fullText;
  var diag = { sectionCount: sectionCount, fullTextLen: fullText.length, fullTextTail: fullText.slice(-200).replace(/\s+/g, " ").trim() };
  return { leadCost: null, snippet: snippet.replace(/\s+/g, " ").trim(), _diag: diag };
})
