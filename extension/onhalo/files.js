// Feature 15 (0.12.0): files open on the page. Halo opens every file in a new tab, in its own viewer (research
// 2026-10-27). A PDF (the name says .pdf and Halo's file says so too) opens instead in a viewer over the page, with
// Download and "Open in Halo's viewer", fetched the way Halo's viewer fetches it (Halo's file service, the page's own
// session). Word and PowerPoint, and anything not certainly a PDF, open as they always have. Halo does not allow its
// pages inside a frame, so the viewer shows the file itself (Chrome's own PDF viewer), never a Halo page.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  const Q_RES = 'query GetResource($id:String!){getResourceById(id:$id){id kind name type embedReady}}';
  const SVC = (type) => (type === 'forum_resource' ? 'forum_resource' : type === 'assignment_submission' ? null : 'course_class_unit_resource');
  let open = null;

  function orch() {
    try {
      const d = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
      const u = d && d.runtimeConfig && d.runtimeConfig.orchestrationApiEndpoint;
      return /^https:\/\/[a-z0-9.-]+\.gcu\.edu\//.test(u || '') ? u : null;
    } catch {
      return null;
    }
  }
  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || a.closest('[data-haloplus]')) return;
    let u;
    try {
      u = new URL(a.getAttribute('href'), location.origin);
    } catch {
      return;
    }
    const m = u.origin === location.origin && !u.search && /^\/resource\/([^/?#]+)$/.exec(u.pathname);
    const name = (a.textContent || '').trim();
    if (!m || !/\.pdf$/i.test(name) || !orch()) return;
    e.preventDefault();
    e.stopPropagation();
    show(decodeURIComponent(m[1]), name, u.href);
  }
  const CSS = `
.bk{position:fixed;inset:0;background:var(--hp-backdrop)}
.dlg{position:fixed;inset:4vh 4vw;display:flex;flex-direction:column;background:var(--hp-surface);border-radius:var(--hp-radius);box-shadow:var(--hp-shadow-dialog);overflow:hidden;font:14px/1.5 var(--hp-font);color:var(--hp-text)}
.hd{display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--hp-surface-2);color:var(--hp-text);border-bottom:1px solid var(--hp-border)}
.hd h4{margin:0;font-size:14px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.b{all:unset;cursor:pointer;font:600 12px/1.75 var(--hp-font);text-transform:uppercase;letter-spacing:.02857em;color:var(--hp-link);padding:4px 10px;border-radius:4px;border:1px solid var(--hp-link);background:var(--hp-surface)}
.b[aria-disabled=true]{opacity:.45;pointer-events:none}
.b:focus-visible,.x:focus-visible{outline:1px solid var(--hp-focus);outline-offset:2px}
.x{all:unset;cursor:pointer;font-size:20px;line-height:1;padding:2px 6px;color:var(--hp-text-3)}
.bd{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:var(--hp-page)}
.bd object{width:100%;height:100%;border:0}
.msg{max-width:420px;text-align:center;color:var(--hp-text-2)}
.msg a{color:var(--hp-link)}
.mk{color:var(--hp-text-2);font-size:13px}`;
  async function show(id, name, href) {
    close();
    const { h, root } = O.host('file-viewer', CSS, { tag: 'div', display: 'block' });
    h.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483600;';
    root.innerHTML = `<div class="bk"></div><div class="dlg" role="dialog" aria-modal="true" aria-label="${O.esc(name)}"><div class="hd"><h4>${O.esc(name)}</h4><span class="mk">${O.mark()}</span><a class="b dl" aria-disabled="true">Download</a><a class="b" href="${O.esc(href)}" target="_blank" rel="noopener">Open in Halo's viewer</a><button class="x" type="button" aria-label="Close">✕</button></div><div class="bd"><p class="msg">Opening the file from Halo…</p></div></div>`;
    document.body.appendChild(h);
    open = { h, url: null };
    const me = open;
    const done = () => close();
    root.querySelector('.x').addEventListener('click', done);
    root.querySelector('.bk').addEventListener('click', done);
    root.querySelector('.x').focus();
    O.count('file-open', false);
    const fail = (why) => {
      if (open !== me) return;
      root.querySelector('.bd').innerHTML = `<p class="msg">${O.esc(why)} <a href="${O.esc(href)}" target="_blank" rel="noopener">Open it in Halo's viewer</a>.</p>`;
    };
    try {
      const d = await O.ask('GetResource', Q_RES, { id }, 10 * 60_000);
      const res = d && d.getResourceById;
      const svc = res && SVC(res.type);
      if (!res || !svc) return fail('Halo+ cannot show this file here.');
      const s = await O.haloSession();
      const r = await fetch(`${orch()}resource/${svc}/download/${encodeURIComponent(id)}?format=download`, { headers: { Authorization: `Bearer ${s.a}`, ContextToken: `Bearer ${s.c}` }, credentials: 'include' });
      if (!r.ok) return fail('Halo did not send the file just now.');
      const blob = await r.blob();
      const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
      const pdf = blob.type === 'application/pdf' || String.fromCharCode(...head) === '%PDF-';
      if (!pdf) return fail('This file is not a PDF, so Halo+ does not show it here.');
      if (open !== me) return;
      me.url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      root.querySelector('.bd').innerHTML = `<object data="${me.url}" type="application/pdf" aria-label="${O.esc(name)}"><p class="msg">This browser cannot show PDFs here. <a href="${O.esc(href)}" target="_blank" rel="noopener">Open it in Halo's viewer</a>.</p></object>`;
      const dl = root.querySelector('.dl');
      dl.href = me.url;
      dl.download = name;
      dl.removeAttribute('aria-disabled');
    } catch {
      fail('Halo did not send the file just now.');
    }
  }
  function close() {
    if (!open) return;
    if (open.url) URL.revokeObjectURL(open.url);
    open.h.remove();
    open = null;
  }
  const onKey = (e) => e.key === 'Escape' && open && close();
  O.feature({
    id: 'files',
    start() {
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
    },
    stop() {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      close();
    },
  });
})();
