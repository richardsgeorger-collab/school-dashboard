// Feature 18 (0.12.0): drafts never get lost. What the student types in Halo's discussion boxes (a reply, a new post, a
// DQ response, an edit) is kept on this computer while they type, never sent anywhere. Halo itself saves replies, new
// posts and DQ responses to its server 5 seconds after typing stops and puts them back on the next visit (research
// 2026-10-27), so Halo+ offers its copy only when Halo's did not come back: the box is empty once Halo has had its
// moment, or an edit (Halo keeps no draft of edits) reopened without the changes. Offered once ("Restore your
// draft"); deleted once the post goes through (Halo's own "has been submitted" message, or the words already in one of
// the student's own posts on the page). Kept 30 days at most, 40 at most, per Halo account.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;

  const SETTLE_MS = 3500;
  const SAVE_MS = 800;
  const OK_TOAST = /Discussion (post|response) has been (submitted|updated)/;

  // ---- which box ------------------------------------------------------------------------------------------------------
  const hashOf = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (33 * h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  };
  /** A stable name for one of Halo's boxes, from where it sits; null when Halo+ cannot tell which box it is. */
  function boxKey(w) {
    const r = O.route();
    const hash = /#discussion-submission\/([^/]+)\/fid\/([^/?#]+)/.exec(location.hash);
    if (hash) return `dq:${hash[1]}`;
    const forum = r.forum || new URLSearchParams(location.search).get('discussionId');
    if (!forum) return null;
    const submit = w.querySelector('[data-testid="post_text_editor_submit"]');
    const edit = submit && /update/i.test(submit.textContent || '');
    const card = w.closest('[data-testid^="post_card_container_"]');
    const top = card ? card.getAttribute('data-testid').replace('post_card_container_', '') : null;
    const label = (w.previousElementSibling && /Replying to/.test(w.previousElementSibling.textContent || '') ? w.previousElementSibling.textContent : '') || '';
    if (edit) return top ? `edit:${forum}:${top}:${hashOf(label + (w.parentElement ? w.parentElement.className : ''))}` : null;
    if (w.closest('.toggleReplyEditor') || label) return top ? `reply:${forum}:${top}:${hashOf(label)}` : null;
    return `post:${forum}`;
  }
  const textOf = (pm) => (pm ? pm.innerText || '' : '').replace(/​/g, '').trim();

  // ---- the drafts on this computer ------------------------------------------------------------------------------------
  let user = null;
  const who = async () => {
    if (user) return user;
    try {
      user = (await O.haloSession()).user || 'me';
    } catch {
      user = null;
    }
    return user;
  };
  async function all() {
    try {
      return (await chrome.storage.local.get('haloDrafts')).haloDrafts || {};
    } catch {
      return {};
    }
  }
  async function put(key, value) {
    const u = await who();
    if (!u) return;
    const d = await all();
    if (value) d[`${u}|${key}`] = value;
    else delete d[`${u}|${key}`];
    try {
      await chrome.storage.local.set({ haloDrafts: L.pruneDrafts(d, Date.now()) });
    } catch {
      /* the extension was updated under this page */
    }
  }
  async function get(key) {
    const u = await who();
    return u ? (await all())[`${u}|${key}`] || null : null;
  }

  // ---- saving while typing ----------------------------------------------------------------------------------------------
  const timers = new Map();
  function onInput(e) {
    const pm = e.target && e.target.closest && e.target.closest('.ProseMirror');
    const w = pm && pm.closest('[data-testid="post_text_editor"]');
    if (!w) return;
    const key = boxKey(w);
    if (!key) return;
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        const text = textOf(pm);
        if (!L.draftWorth(text)) return;
        void get(key).then((old) => put(key, { text, html: pm.innerHTML, at: new Date().toISOString(), url: location.pathname + location.search + location.hash, offered: old && old.text === text ? old.offered || null : null }));
      }, SAVE_MS),
    );
  }

  // ---- going through ------------------------------------------------------------------------------------------------------
  let sending = null;
  function onClick(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-testid="post_text_editor_submit"], [data-testid="text_editor_submit_dq"], button');
    if (!b) return;
    const w = b.closest('[data-testid="post_text_editor"]') || document.querySelector('[data-testid="post_text_editor"]');
    const isSend = b.matches('[data-testid="post_text_editor_submit"], [data-testid="text_editor_submit_dq"]') || /^(Post|Update|Submit DQ Response)$/i.test((b.textContent || '').trim());
    if (!isSend || !w) return;
    const key = boxKey(w);
    if (key) sending = { key, w, at: Date.now() };
  }
  function checkSent() {
    if (!sending) return;
    if (Date.now() - sending.at > 10_000) return void (sending = null);
    const toast = [...document.querySelectorAll('.Toastify, [role="alert"]')].some((t) => OK_TOAST.test(t.textContent || ''));
    if (toast && !sending.w.isConnected) {
      void put(sending.key, null);
      sending = null;
    }
  }

  // ---- offering it back -------------------------------------------------------------------------------------------------
  const seen = new WeakSet();
  const CSS = `
.o{display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px;margin:8px 0 2px;padding:8px 12px;border-radius:var(--hp-radius);background:var(--hp-tint);font:13px/1.5 var(--hp-font);color:var(--hp-text)}
.o .t{color:var(--hp-text)}
.o .s{color:var(--hp-text-2)}
.o button{all:unset;cursor:pointer;font:600 12px/1.75 var(--hp-font);text-transform:uppercase;letter-spacing:.02857em;color:var(--hp-link);padding:2px 6px;border-radius:4px}
.o button:hover{background:var(--hp-hover)}
.o button:focus-visible{outline:1px solid var(--hp-focus)}
.o .sp{flex:1}`;
  function ownPosts() {
    return [...document.querySelectorAll('[class*="forumCommonStyles_studentPostIndicator"]')]
      .map((head) => {
        const card = head.closest('[data-testid^="post_card_container_"], [class*="PostReplyCardContainer"], section') || head.parentElement;
        const d = card && card.querySelector('[data-testid="description"]');
        return d ? d.innerText || '' : '';
      })
      .filter(Boolean);
  }
  async function consider(w) {
    if (seen.has(w)) return;
    seen.add(w);
    const key = boxKey(w);
    if (!key) return;
    const pm = w.querySelector('.ProseMirror');
    const first = textOf(pm);
    // Halo's own draft has its moment first (its restore, and for a DQ response its draft query).
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    if (!w.isConnected || !O.enabled('drafts')) return;
    const d = await get(key);
    if (!d || d.offered) return;
    const now = textOf(pm);
    const posted = L.postedAlready(d.text, ownPosts());
    if (posted) return void put(key, null);
    const edit = key.startsWith('edit:');
    // A new box must be empty; an edit must still be what it was when it opened, and not already the draft.
    const offer = edit ? now === first && now !== d.text && L.draftWorth(d.text) : L.offerDraft(d, now, Date.now(), []);
    if (!offer) return;
    await put(key, { ...d, offered: new Date().toISOString() });
    show(w, pm, d, edit);
  }
  function show(w, pm, d, edit) {
    const { h, root } = O.host('draft-offer', CSS, { tag: 'div', display: 'block' });
    const z = O.zone();
    const at = z ? L.haloFormat(Date.parse(d.at), z, 'short') : '';
    const n = L.countWords(d.text);
    root.innerHTML = `<div class="o" role="status">${O.mark()}<span class="t">${edit ? 'Your unsaved changes to this post' : 'Your draft'}${at ? ` from ${O.esc(at)}` : ''}</span><span class="s">${n} words, saved on this computer</span><span class="sp"></span><button type="button" class="r">Restore your draft</button><button type="button" class="x">Dismiss</button></div>`;
    w.before(h);
    O.count('draft-offer');
    root.querySelector('.x').addEventListener('click', () => h.remove());
    root.querySelector('.r').addEventListener('click', () => {
      if (restore(pm, d, edit)) {
        h.remove();
        O.count('draft-restore', false);
      } else {
        root.querySelector('.o').innerHTML = `${O.mark()}<span class="t">Halo+ could not put it back in the box.</span><span class="sp"></span><button type="button" class="c">Copy your draft</button>`;
        root.querySelector('.c').addEventListener('click', () => void navigator.clipboard.writeText(d.text).then(() => (root.querySelector('.c').textContent = 'Copied')));
      }
    });
  }
  /** Put the draft back through Halo's own editor (a paste, which Halo's editor cleans up as it does any paste). */
  function restore(pm, d, edit) {
    if (!pm || !pm.isConnected) return false;
    pm.focus();
    if (edit) document.execCommand('selectAll');
    try {
      const dt = new DataTransfer();
      dt.setData('text/html', d.html || '');
      dt.setData('text/plain', d.text);
      pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch {
      /* fall through */
    }
    const head = d.text.slice(0, 40);
    if (textOf(pm).includes(head)) return true;
    try {
      document.execCommand('insertText', false, d.text);
    } catch {
      /* nothing */
    }
    return textOf(pm).includes(head);
  }

  let on = false;
  O.feature({
    id: 'drafts',
    start() {
      on = true;
      document.addEventListener('input', onInput, true);
      document.addEventListener('click', onClick, true);
      this.update();
    },
    update() {
      if (!on) return;
      checkSent();
      for (const w of document.querySelectorAll('[data-testid="post_text_editor"]')) if (w.querySelector('.ProseMirror')) void consider(w);
    },
    stop() {
      on = false;
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('click', onClick, true);
      document.querySelectorAll('[data-haloplus="draft-offer"]').forEach((n) => n.remove());
    },
  });
})();
