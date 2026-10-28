// Feature 28 (0.12.0): clickable links in announcements. Halo shows a link that was typed as one, but an address that
// arrived as plain text stays plain text (Halo adds no links when it shows a post, research 2026-10-27). Halo+ makes
// those clickable, in Halo's own link style (its link class, its link colour, a new tab like Halo's links), only for
// real addresses (logic.js findUrls: http(s) or www., a real host, no trailing punctuation). Never inside a link, code,
// a mention, math or an editor.
// Halo's page code owns those words: Halo+ never replaces Halo's own text, it only splits it (the first part stays
// Halo's own node) and adds after it, and takes its additions away again if Halo changes that text.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const SKIP = 'a, .mention, pre, code, .katex, [contenteditable], [data-haloplus], [data-haloplus-link], script, style, textarea, button';
  const added = new Map();
  const kept = new Map();
  let mo = null;

  function linkClass() {
    const a = document.querySelector('a[class*="HTMLDescription_link__"]');
    const c = a && [...a.classList].find((x) => x.startsWith('HTMLDescription_link__'));
    return c || O.cssClass('HTMLDescription_link') || '';
  }
  function linkify(node, cls) {
    const text = node.nodeValue || '';
    const urls = L.findUrls(text);
    if (!urls.length) return;
    const mine = [];
    let cur = node;
    let offset = 0;
    for (const u of urls) {
      // cur holds the text from `offset`; cut it at the address's start and end.
      const urlNode = cur.splitText(u.start - offset);
      const rest = urlNode.splitText(u.end - u.start);
      const a = document.createElement('a');
      a.href = u.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (cls) a.className = cls;
      a.setAttribute('style', 'color: var(--lms-hyperlinkColor); display: inline-block; margin: 0; padding: 0;');
      a.setAttribute('data-haloplus-link', '');
      a.title = 'Made a link by Halo+';
      urlNode.replaceWith(a);
      a.appendChild(urlNode);
      const mk = document.createElement('span');
      mk.setAttribute('data-haloplus', 'link-mark');
      mk.className = 'text-secondary';
      mk.style.cssText = 'margin-left:2px;font-size:.85em';
      mk.innerHTML = O.mark();
      a.after(mk);
      mine.push(a, mk, rest);
      cur = rest;
      offset = u.end;
    }
    // What Halo's own node holds after the split: a change to anything else is Halo's, not Halo+'s.
    added.set(node, mine);
    kept.set(node, node.nodeValue);
  }
  function undo(node) {
    for (const n of added.get(node) || []) n.remove();
    added.delete(node);
    kept.delete(node);
  }
  function pass() {
    // Halo changed or removed text Halo+ had split: put it back as Halo left it, then look again.
    for (const [node] of added) if (!node.isConnected) undo(node);
    const cls = linkClass();
    for (const box of document.querySelectorAll('[class*="AnnouncementCard_announcementDescriptionContainer"] [data-testid="description"]')) {
      if (/readMore/i.test(box.className)) continue;
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && !n.parentElement.closest(SKIP) && !added.has(n) && /(https?:\/\/|www\.)/i.test(n.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
      });
      const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
      for (const n of nodes) linkify(n, cls);
    }
  }
  O.feature({
    id: 'links',
    routes: ['announcements'],
    start() {
      pass();
      // Halo rewriting one of the texts Halo+ split (an edited announcement): undo and redo, so no word shows twice.
      mo = new MutationObserver((recs) => {
        let redo = false;
        for (const r of recs) if (r.type === 'characterData' && added.has(r.target) && r.target.nodeValue !== kept.get(r.target)) (undo(r.target), (redo = true));
        if (redo) pass();
      });
      mo.observe(document.body, { characterData: true, subtree: true });
    },
    update() {
      pass();
    },
    stop() {
      if (mo) mo.disconnect();
      for (const [node] of [...added]) {
        // Put the words back as one text: Halo's own node takes back what was split off.
        const parts = (added.get(node) || []).filter((n) => n.nodeType === 3 || n.tagName === 'A');
        let text = node.nodeValue;
        for (const n of parts) text += n.textContent;
        undo(node);
        node.nodeValue = text;
      }
    },
  });
})();
