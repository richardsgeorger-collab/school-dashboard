// The Safari test probe (Loop 308). Only in the test build (SAFARI_TEST=1 node scripts/build-safari.mjs), never in what
// ships: Safari can't be driven by a script with its extensions on, so the extension's own content script reports the
// page to the local bench (scripts/lib/safariBench.mjs) and takes a few fixed commands from it. No eval: only the
// commands below.
(() => {
  if (globalThis.__haloPlusProbe) return;
  globalThis.__haloPlusProbe = true;
  document.documentElement.setAttribute('data-haloplus-probe', '1');
  const base = location.origin;
  const tab = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  let timer = null;
  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab, url: location.href, ...body }) }).catch(() => undefined);
  const snap = () => {
    timer = null;
    const html = document.documentElement.outerHTML.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    post('/__probe', { seq: ++seq, w: innerWidth, h: innerHeight, html, ua: navigator.userAgent, at: Date.now() });
  };
  const soon = () => {
    if (!timer) timer = setTimeout(snap, 600);
  };
  new MutationObserver(soon).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  soon();

  const el = (sel) => document.querySelector(sel);
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
    } catch {
      /* the bench is gone */
    }
    setTimeout(poll, 400);
  };
  poll();
})();
