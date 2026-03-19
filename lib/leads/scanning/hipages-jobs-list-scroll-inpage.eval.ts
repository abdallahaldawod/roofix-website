/**
 * String expressions for page.evaluate — body is plain JS inside templates (not transpiled).
 * Avoids bundler-injected __name in serialized functions.
 */

export const jobsListResetScrollExpr = `
(() => {
  const findScrollParent = (el) => {
    let p = el;
    for (let d = 0; d < 18 && p; d++) {
      const st = window.getComputedStyle(p);
      const oy = st.overflowY;
      if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 16) {
        return p;
      }
      p = p.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };
  const listEl = document.querySelector('ol[aria-label="Jobs list"]');
  const container = listEl ? findScrollParent(listEl) : findScrollParent(null);
  container.scrollTop = 0;
  window.scrollTo(0, 0);
})()
`.trim();

export const jobsListNudgeScrollExpr = `
(() => {
  const findScrollParent = (el) => {
    let p = el;
    for (let d = 0; d < 18 && p; d++) {
      const st = window.getComputedStyle(p);
      const oy = st.overflowY;
      if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 16) {
        return p;
      }
      p = p.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };
  const listEl = document.querySelector('ol[aria-label="Jobs list"]');
  const container = listEl ? findScrollParent(listEl) : findScrollParent(null);
  const delta = 480;
  container.scrollBy({ top: delta, left: 0, behavior: "instant" });
  window.scrollBy({ top: Math.min(delta, 400), left: 0, behavior: "instant" });
})()
`.trim();

export const jobsListScrollToEndExpr = `
(() => {
  return (async () => {
    const findScrollParent = (el) => {
      let p = el;
      for (let d = 0; d < 18 && p; d++) {
        const st = window.getComputedStyle(p);
        const oy = st.overflowY;
        if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 16) {
          return p;
        }
        p = p.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    };
    const listEl = document.querySelector('ol[aria-label="Jobs list"]');
    const container = listEl ? findScrollParent(listEl) : findScrollParent(null);

    let peak = 0;
    let staleRounds = 0;
    for (let i = 0; i < 220; i++) {
      container.scrollTop = container.scrollHeight;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 120));
      const n = document.querySelectorAll('li[aria-label="Jobs list item"]').length;
      if (n > peak) {
        peak = n;
        staleRounds = 0;
      } else {
        staleRounds++;
        if (staleRounds >= 10) break;
      }
    }
  })();
})()
`.trim();
