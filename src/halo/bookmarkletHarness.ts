import { bookmarkletSource } from './bookmarklet';

/**
 * Runs the real bookmarklet string against a fake Halo, in a fake page. The point is that the code under test is the
 * exact text that goes in the bookmark, parsing and indexing included: compiling it proved nothing, which is how a
 * read of an unassigned `var` reached the browser.
 */
export type Reply = { data?: unknown; errors?: { message: string }[] };
export type Halo = (op: string, variables: Record<string, unknown>, query: string) => Reply | Promise<Reply>;

export interface RunResult {
  /** The payload the page posted to the dashboard, when it got that far. */
  payload: any | null;
  /** Set when the whole sync died. This is the string the user sees. */
  failed: string | null;
  /** Every line the box showed, in order. */
  said: string[];
  /** Operations the fake Halo was asked for, in order. */
  asked: string[];
}

const el = (tag: string): any => {
  const node: any = {
    tagName: tag,
    style: { cssText: '' },
    textContent: '',
    value: '',
    children: [] as any[],
    appendChild(c: any) {
      node.children.push(c);
      return c;
    },
    setAttribute() {},
    remove() {},
    select() {},
  };
  return node;
};

/** Runs the bookmarklet. `halo` answers GraphQL; anything it throws or returns is what the code has to survive. */
export async function runBookmarklet(halo: Halo, opts: { download?: () => unknown; nextData?: unknown; source?: string } = {}): Promise<RunResult> {
  const said: string[] = [];
  const asked: string[] = [];
  let payload: any = null;
  let failed: string | null = null;
  let settle: () => void = () => {};
  const done = new Promise<void>((r) => {
    settle = r;
  });

  const listeners: ((e: any) => void)[] = [];
  const body = el('body');
  const nextData = opts.nextData === undefined ? { runtimeConfig: { orchestrationApiEndpoint: 'https://gateway.halo.gcu.edu/api/' } } : opts.nextData;
  const document: any = {
    createElement: el,
    body,
    getElementById: (id: string) => (id === '__NEXT_DATA__' && nextData !== null ? { textContent: JSON.stringify(nextData) } : null),
    execCommand: () => true,
  };
  // The fallback path writes the payload into a textarea. Treat that as delivery too: the data still reached the user.
  const origAppend = body.appendChild;
  void origAppend;

  const win: any = {
    closed: false,
    postMessage(p: any) {
      payload = p;
      for (const fn of [...listeners]) fn({ origin: 'https://richardsgeorger-collab.github.io', data: { kind: 'halo-received' } });
      settle();
    },
  };
  const window: any = {
    open: () => win,
    addEventListener: (_: string, fn: any) => listeners.push(fn),
    removeEventListener: (_: string, fn: any) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };

  const fetchImpl = async (url: string, init?: any) => {
    if (String(url).endsWith('/api/auth/session')) return { status: 200, json: async () => ({ authToken: 'A', contextToken: 'C' }) };
    if (String(url).includes('downloadUrl/')) {
      if (!opts.download) throw new Error('no download');
      return { status: 200, json: async () => opts.download!() };
    }
    const sent = JSON.parse(init.body);
    asked.push(sent.operationName);
    const r = await halo(sent.operationName, sent.variables, sent.query);
    return { status: 200, json: async () => r };
  };

  // Real timers would make every case wait 400ms; the loop only needs to turn twice.
  const spin = (fn: () => void) => {
    const handle = { stopped: false };
    const tick = () => {
      if (handle.stopped) return;
      fn();
      if (!handle.stopped) queueMicrotask(tick);
    };
    queueMicrotask(tick);
    return handle;
  };

  const say = (t: string) => {
    said.push(t);
    if (t.startsWith('Halo sync failed: ')) {
      failed = t.slice('Halo sync failed: '.length);
      settle();
    }
    if (t.startsWith('Could not reach the dashboard tab')) settle();
  };
  // The box's textContent setter is how the code says things; intercept the one element it writes to.
  const doc: any = {
    ...document,
    createElement: (tag: string) => {
      const node = el(tag);
      if (tag === 'div') {
        let text = '';
        Object.defineProperty(node, 'textContent', {
          get: () => text,
          set: (v: string) => {
            text = v;
            say(v);
          },
        });
      }
      if (tag === 'textarea') {
        let v = '';
        Object.defineProperty(node, 'value', {
          get: () => v,
          set: (nv: string) => {
            v = nv;
            if (nv.includes('"kind":"halo-export"')) {
              payload = JSON.parse(nv);
              settle();
            }
          },
        });
      }
      return node;
    },
  };

  const src = opts.source ?? bookmarkletSource({ dashOrigin: 'https://richardsgeorger-collab.github.io', dashPath: '/school-dashboard/#/you?halo=1' });
  const fn = new Function('location', 'document', 'window', 'fetch', 'crypto', 'alert', 'navigator', 'setInterval', 'clearInterval', 'setTimeout', src);
  fn(
    { hostname: 'halo.gcu.edu' },
    doc,
    window,
    fetchImpl,
    { randomUUID: () => 'test-uuid' },
    () => {},
    {},
    spin,
    (h: any) => {
      if (h) h.stopped = true;
    },
    (f: any) => queueMicrotask(f),
  );

  await Promise.race([done, new Promise<void>((r) => setTimeout(r, 4000))]);
  return { payload, failed, said, asked };
}
