// The Safari test probe (Loop 308). Only in the test build (SAFARI_TEST=1 node scripts/build-safari.mjs), never in what
// ships: Safari can't be driven by a script with its extensions on, so the extension's own content script reports the
// page to the local bench (scripts/lib/safariBench.mjs) and takes a few fixed commands from it. No eval: only the
// commands below.
(() => {
  if (globalThis.__haloPlusProbe) return;
  globalThis.__haloPlusProbe = true;
  document.documentElement.setAttribute('data-haloplus-probe', '1');
  const base = location.origin;
  // One id per browser tab, kept across Halo's page changes in that tab, so the bench can talk to exactly this tab
  // (Safari on a phone keeps old tabs open, some still running).
  let tab = null;
  try {
    tab = sessionStorage.getItem('__hpTab');
  } catch {
    /* none */
  }
  if (!tab) {
    tab = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      sessionStorage.setItem('__hpTab', tab);
    } catch {
      /* none */
    }
  }
  let seq = 0;
  let timer = null;
  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab, url: location.href, ...body }) }).catch(() => undefined);
  // The page as drawn, with Halo+'s shadow roots (as declarative shadow DOM) and, on Halo+'s own elements, their size and
  // whether they show (data-hp-r="width,height,shown"), since the bench reads the copy with no styles of Safari's.
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attr = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const box = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const shown = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
    return `${Math.round(r.width)},${Math.round(r.height)},${shown ? 1 : 0},${Math.round(r.left)},${Math.round(r.top)}`;
  };
  const ser = (n, inHp) => {
    if (n.nodeType === 3) return esc(n.data);
    if (n.nodeType !== 1) return '';
    const tag = n.localName;
    if (tag === 'script') return '';
    const hp = inHp || n.hasAttribute('data-haloplus') || !!n.shadowRoot;
    let s = `<${tag}`;
    for (const a of n.attributes) s += ` ${a.name}="${attr(a.value)}"`;
    if (hp) s += ` data-hp-r="${box(n)}"`;
    s += '>';
    if (VOID.has(tag)) return s;
    if (n.shadowRoot) s += `<template shadowrootmode="open">${[...n.shadowRoot.childNodes].map((c) => ser(c, true)).join('')}</template>`;
    const kids = tag === 'template' ? n.content.childNodes : n.childNodes;
    for (const c of kids) s += ser(c, hp);
    return `${s}</${tag}>`;
  };
  const snap = () => {
    timer = null;
    const html = `<!doctype html>${ser(document.documentElement, false)}`;
    post('/__probe', { seq: ++seq, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, html, ua: navigator.userAgent, at: Date.now() });
  };
  const soon = () => {
    if (!timer) timer = setTimeout(snap, 600);
  };
  new MutationObserver(soon).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  soon();

  // "host >>> inside": through Halo+'s open shadow roots.
  const el = (sel) => sel.split('>>>').reduce((root, part) => (root ? (root.shadowRoot || root).querySelector(part.trim()) : null), document);
  const run = async (c) => {
    if (c.click) {
      const e = el(c.click);
      if (!e) return { ok: false, why: `no ${c.click}` };
      e.scrollIntoView({ block: 'center' });
      for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) e.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      e.click();
      return { ok: true };
    }
    if (c.key) {
      const t = c.key.target ? el(c.key.target) : document.activeElement || document.body;
      const o = { key: c.key.key, code: c.key.code || '', metaKey: !!c.key.meta, ctrlKey: !!c.key.ctrl, shiftKey: !!c.key.shift, bubbles: true, cancelable: true };
      t.dispatchEvent(new KeyboardEvent('keydown', o));
      t.dispatchEvent(new KeyboardEvent('keyup', o));
      return { ok: true };
    }
    if (c.type) {
      const e = el(c.type.selector);
      if (!e) return { ok: false, why: `no ${c.type.selector}` };
      e.focus();
      e.value = c.type.text;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true };
    }
    if (c.set) {
      await chrome.storage.local.set(c.set);
      return { ok: true };
    }
    if (c.clear) {
      await chrome.storage.local.clear();
      return { ok: true };
    }
    if (c.get) return { ok: true, value: await chrome.storage.local.get(c.get) };
    if (c.message) return { ok: true, value: await chrome.runtime.sendMessage(c.message).catch((e) => ({ error: String(e) })) };
    if (c.go) {
      location.href = c.go;
      return { ok: true };
    }
    if (c.reload) {
      location.reload();
      return { ok: true };
    }
    if (c.snap) {
      snap();
      return { ok: true };
    }
    return { ok: false, why: 'unknown command' };
  };
  const poll = async () => {
    try {
      const r = await fetch(`${base}/__cmd?tab=${tab}&url=${encodeURIComponent(location.href)}`);
      const cmds = r.ok ? await r.json() : [];
      for (const c of cmds) post('/__result', { id: c.id, result: await run(c).catch((e) => ({ ok: false, why: String(e) })) });
      // Changes inside Halo+'s shadow roots are not seen by the page's observer: a fresh copy after each command.
      if (cmds.length) setTimeout(snap, 900);
    } catch {
      /* the bench is gone */
    }
    setTimeout(poll, 400);
  };
  poll();
})();
