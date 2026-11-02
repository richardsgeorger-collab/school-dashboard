// The Halo stand-in for Safari (Loop 308): the same pages and answers as the Chrome tests (lib/haloPages.mjs standIn),
// served over plain HTTP on this Mac, for the Safari test build (SAFARI_TEST=1), which points Halo+ at these ports:
//   http://127.0.0.1:4180 is Halo, :4181 its gateway, :4182 its orchestration API, :4183 Halo+'s server (report and
//   sync-drop, answered here and recorded, nothing sent anywhere real).
// The test build's probe (lib/safari-probe.js) posts each page it sees here and runs the bench's commands, so a test can
// read the page Safari drew and click in it, in the iOS Simulator or Safari on a Mac alike.
import { createServer } from 'node:http';
import { chromium, webkit } from 'playwright-core';
import { standIn } from './haloPages.mjs';

export const PORTS = { halo: 4180, gateway: 4181, orchestration: 4182, server: 4183 };
const REAL = { 4180: 'https://halo.gcu.edu', 4181: 'https://gateway.halo.gcu.edu', 4182: 'https://orchestration.halo.gcu.edu' };
const SWAP = [
  ['https://halo.gcu.edu', 'http://127.0.0.1:4180'],
  ['https://gateway.halo.gcu.edu', 'http://127.0.0.1:4181'],
  ['https://orchestration.halo.gcu.edu', 'http://127.0.0.1:4182'],
];
const swap = (s) => SWAP.reduce((t, [a, b]) => t.split(a).join(b), s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const textual = (type) => /text|javascript|json|css|svg|xml/.test(type || '');

/** A Playwright-like `ctx` whose routes this server answers, so standIn() works unchanged. */
function fakeCtx() {
  const routes = [];
  const glob = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*')}$`);
  return { routes, route: async (pattern, handler) => routes.push([glob(pattern), handler]) };
}

export async function safariBench(fx, opts = {}) {
  const ctx = fakeCtx();
  const bench = await standIn(ctx, fx, opts);
  const snaps = new Map(); // url → latest {seq, html, w, h, ua, at, tab}
  const queue = []; // commands waiting for a tab
  const results = new Map();
  const reports = []; // what the extension sent to Halo+'s server
  let nextId = 1;

  const handle = (port) => async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const local = new URL(req.url, `http://127.0.0.1:${port}`);
    // The probe and the bench (any port).
    if (local.pathname === '/__probe') {
      const p = JSON.parse(body.toString());
      snaps.set(`${p.tab} ${p.url}`, p);
      return res.writeHead(204).end();
    }
    if (local.pathname === '/__result') {
      const p = JSON.parse(body.toString());
      results.set(p.id, p.result);
      return res.writeHead(204).end();
    }
    if (local.pathname === '/__cmd') {
      const url = local.searchParams.get('url') || '';
      const tab = local.searchParams.get('tab') || '';
      const mine = [];
      for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].url || url.includes(queue[i].url) || tab === queue[i].url) mine.unshift(...queue.splice(i, 1));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(mine.map(({ url: _u, ...c }) => c)));
    }
    // Halo+'s server: report and sync-drop, recorded.
    if (port === PORTS.server) {
      const cors = { 'access-control-allow-origin': req.headers.origin || '*', 'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info, x-halo-encoding', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
      let json = null;
      try {
        json = JSON.parse(body.toString());
      } catch {
        json = { raw: body.length };
      }
      reports.push({ path: local.pathname, body: json, headers: req.headers, at: Date.now() });
      res.writeHead(200, { ...cors, 'content-type': 'application/json' });
      return res.end('{"ok":true}');
    }
    // Halo, through the stand-in's routes, as if at Halo's real address.
    const url = `${REAL[port]}${local.pathname}${local.search}`;
    const hit = ctx.routes.find(([re]) => re.test(url));
    if (!hit) return res.writeHead(404).end();
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
    let done = false;
    const send = async ({ status = 200, contentType, headers: h = {}, body: b = '', response } = {}) => {
      done = true;
      const out = { ...h };
      if (contentType) out['content-type'] = contentType;
      if (response && !out['content-type']) out['content-type'] = response.headers.get('content-type') || 'application/octet-stream';
      // Halo's answers allow Halo's page: here that page is http://127.0.0.1:4180.
      for (const k of Object.keys(out)) if (/^access-control-allow-origin$/i.test(k) && out[k] !== '*') out[k] = 'http://127.0.0.1:4180';
      let buf = Buffer.isBuffer(b) ? b : Buffer.from(typeof b === 'string' ? b : b == null ? '' : String(b));
      if (textual(out['content-type'])) buf = Buffer.from(swap(buf.toString()));
      res.writeHead(status, { ...out, 'cache-control': 'no-store' });
      res.end(buf);
    };
    const route = {
      request: () => ({ url: () => url, method: () => req.method, headers: () => headers, postData: () => body.toString(), postDataJSON: () => (body.length ? JSON.parse(body.toString()) : null) }),
      fulfill: (o) => send(o),
      abort: () => {
        done = true;
        res.writeHead(502).end();
      },
      fetch: async () => {
        const r = await fetch(url);
        const ab = Buffer.from(await r.arrayBuffer());
        return { ok: () => r.ok, headers: () => Object.fromEntries(r.headers), body: async () => ab, text: async () => ab.toString(), status: () => r.status, _r: r, _b: ab };
      },
    };
    // A fulfill({ response }) from route.fetch(): pass its body through.
    const fulfill0 = route.fulfill;
    route.fulfill = (o) => (o && o.response && o.response._r ? send({ status: o.response._r.status, contentType: o.response._r.headers.get('content-type'), body: o.body ?? o.response._b }) : fulfill0(o));
    try {
      await hit[1](route);
    } catch (e) {
      if (!done) res.writeHead(500).end(String(e));
    }
    if (!done) res.writeHead(404).end();
  };

  const servers = await Promise.all(
    Object.values(PORTS).map(
      (port) =>
        new Promise((ok, bad) => {
          const s = createServer(handle(port));
          s.on('error', bad);
          s.listen(port, '127.0.0.1', () => ok(s));
        }),
    ),
  );

  // Reading what Safari drew: the probe's copy of the page, in a plain WebKit page with no scripts.
  const wk = await webkit.launch().catch(() => chromium.launch());
  const reader = await wk.newPage();
  // Loaded as a page (not setContent), so the copy's declarative shadow roots are parsed.
  let readerHtml = '';
  await reader.route('http://reader.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: readerHtml }));
  await reader.route(/^https?:\/\/(?!reader\.test)/, (r) => r.abort());
  const load = async (html) => {
    readerHtml = html;
    await reader.goto(`http://reader.test/?${Date.now()}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  };

  const api = {
    ...bench,
    reports,
    snaps,
    halo: (path = '/') => `http://127.0.0.1:${PORTS.halo}${path}`,
    /** The browser tab that showed a page whose URL contains `part`: then `part` can be that tab, wherever it goes. */
    tabOf(part) {
      const s = [...snaps.values()].filter((x) => x.url.includes(part)).sort((a, b) => b.at - a.at)[0];
      return s ? s.tab : null;
    },
    /** The latest copy of a page whose URL contains `part`, or of the tab `part` (newest first), or null. */
    latest(part = '') {
      return [...snaps.values()].filter((s) => s.url.includes(part) || s.tab === part).sort((a, b) => b.at - a.at)[0] || null;
    },
    /** Waits until the page's copy passes `fn` (run in the reader, with the copy loaded), up to `ms`. */
    async until(part, fn, arg, ms = 20000) {
      const end = Date.now() + ms;
      let last = null;
      while (Date.now() < end) {
        const s = api.latest(part);
        if (s && s !== last) {
          last = s;
          await load(s.html);
          const v = await reader.evaluate(fn, arg).catch(() => null);
          if (v) return v;
        }
        await sleep(400);
      }
      return null;
    },
    /** Runs fn in the reader on the latest copy now. */
    async read(part, fn, arg) {
      const s = api.latest(part);
      if (!s) return null;
      await load(s.html);
      return reader.evaluate(fn, arg).catch(() => null);
    },
    /** A command for the page whose URL contains `url` (any page when empty); resolves to its result. */
    async cmd(c, url = '', ms = 15000) {
      const id = nextId++;
      queue.push({ ...c, id, url });
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (results.has(id)) return results.get(id);
        await sleep(150);
      }
      // Not taken in time: out of the queue, so it never runs later, out of order.
      const i = queue.findIndex((q) => q.id === id);
      if (i >= 0) queue.splice(i, 1);
      return { ok: false, why: 'no page took the command' };
    },
    async close() {
      await wk.close().catch(() => undefined);
      await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    },
  };
  return api;
}
