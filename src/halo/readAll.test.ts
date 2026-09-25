import { describe, expect, it } from 'vitest';
import { errorGroups, genuinelyNothing, rawError, readAllAnnouncements, readAllLine, unread, withRetry, type AnnouncementResult, type ReadAllResult } from './readAll';
import { mkCourse, mkItem, TZ } from './fixtures';
import type { StoredAnnouncement } from './announce';

const post = (id: string, title: string): StoredAnnouncement =>
  ({ id, courseId: 'c1', forumId: 'f1', title, text: `Body of ${title}`, publishedAt: '2026-09-14T15:00:00.000Z', modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [], readAt: null, processedAt: null, findings: null, review: {}, storedAt: '2026-09-14T15:00:00.000Z' }) as never;

const courses = [mkCourse({ id: 'c1', code: 'UNV-106' })];
const items = [mkItem({ id: 'i1', courseId: 'c1', title: 'Topic 2 DQ 1' })];
const base = { courses, items, tz: TZ, at: '2026-09-18T12:00:00.000Z' };

/** A fetch that fails every call the way the real API does, with a status and a message. */
const failing = (status: number, message: string): typeof globalThis.fetch =>
  (async () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }), { status, headers: { 'content-type': 'application/json' } })) as never;

const answering = (actions: unknown[]): typeof globalThis.fetch =>
  (async () =>
    new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 't', name: 'announcement_actions', input: { summary: 's', actions } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as never;

describe('a pass where nothing could be read', () => {
  it('never says nothing is required, and says plainly that it does not know', async () => {
    const list = [post('a1', 'One'), post('a2', 'Two'), post('a3', 'Three')];
    const r = await readAllAnnouncements({ ...base, apiKey: 'k', fetch: failing(400, 'tools.0.custom.input_schema: unexpected keyword'), list });
    expect(r.read).toBe(0);
    expect(r.failed).toBe(3);

    const line = readAllLine(r, 0, 0);
    expect(line).toBe('3 announcements could not be read. I do not know what they ask.');
    // The sentence that must never appear over a failed pass, in any of its forms.
    expect(line).not.toMatch(/nothing/i);
    expect(line).not.toMatch(/asks anything/i);
    expect(line).not.toMatch(/^Read 0 announcements:/);
    expect(genuinelyNothing(r, 0, 0)).toBe(false);
  });

  it('keeps the real error, not a shrug, and groups one cause across every announcement', async () => {
    const list = [post('a1', 'One'), post('a2', 'Two'), post('a3', 'Three')];
    const r = await readAllAnnouncements({ ...base, apiKey: 'k', fetch: failing(400, 'tools.0.custom.input_schema: unexpected keyword'), list });
    const groups = errorGroups(r.results);
    // 47 of 47 is one problem, not 47.
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].status).toBe(400);
    expect(groups[0].message).toContain('input_schema');
    expect(groups[0].plain).toBeTruthy();
  });

  it('pulls the status and the API’s own words out of whatever was thrown', () => {
    expect(rawError({ status: 429, error: { error: { message: 'rate limit exceeded' } } })).toEqual({ status: 429, message: 'rate limit exceeded' });
    expect(rawError({ status: 401, message: 'invalid x-api-key' })).toEqual({ status: 401, message: 'invalid x-api-key' });
    expect(rawError(new Error('Failed to fetch'))).toEqual({ status: null, message: 'Failed to fetch' });
  });
});

describe('a pass that partly worked', () => {
  it('reports what it read and refuses to characterise what it could not', async () => {
    const r: ReadAllResult = { results: [], requirements: new Map(), notes: new Map(), changes: [], read: 12, failed: 35 };
    const line = readAllLine(r, 4, 1);
    expect(line).toBe('Read 12 announcements: 4 requirements attached to work you already have, 1 class note. 35 announcements could not be read, so I do not know what those ask.');
    expect(genuinelyNothing(r, 4, 1)).toBe(false);
    // Even with nothing found in the twelve, the thirty-five keep the all-clear off the screen.
    expect(genuinelyNothing({ ...r, read: 12, failed: 35 }, 0, 0)).toBe(false);
  });
});

describe('a pass that fully worked', () => {
  it('is the only case that may say nothing is required', async () => {
    const r = await readAllAnnouncements({ ...base, apiKey: 'k', fetch: answering([]), list: [post('a1', 'Office hours')] });
    expect(r.read).toBe(1);
    expect(r.failed).toBe(0);
    expect(genuinelyNothing(r, 0, 0)).toBe(true);
    expect(readAllLine(r, 0, 0)).toBe('Read 1 announcement: 0 requirements attached to work you already have.');
  });

  it('stops saying so the moment it actually found something', async () => {
    const r = await readAllAnnouncements({
      ...base,
      apiKey: 'k',
      fetch: answering([{ kind: 'requirement', applies_to: 'i1', what: 'Reply to two classmates.', due: '', time: '', points: 0, graded: true, changes_what_done_means: true, quote: 'reply to two classmates', confidence: 'high' }]),
      list: [post('a1', 'Replies')],
    });
    expect(r.requirements.get('i1')).toHaveLength(1);
    expect(genuinelyNothing(r, 1, 0)).toBe(false);
  });
});

describe('which announcements a press reads', () => {
  it('reads the ones never read, and leaves the rest alone', () => {
    const fresh = post('a1', 'One');
    const already = { ...post('a2', 'Two'), actionsAt: '2026-09-17T00:00:00.000Z' } as StoredAnnouncement;
    const other = { ...post('a3', 'Three'), courseId: 'gone' } as StoredAnnouncement;
    expect(unread([fresh, already, other], new Set(['c1'])).map((a) => a.id)).toEqual(['a1']);
  });

  it('a failed read is not stamped, so the next press tries it again', async () => {
    const list = [post('a1', 'One')];
    const r = await readAllAnnouncements({ ...base, apiKey: 'k', fetch: failing(500, 'overloaded'), list });
    const failed: AnnouncementResult = r.results[0];
    expect(failed.error).toBeTruthy();
    expect(failed.raw?.status).toBe(500);
    expect(failed.actions).toEqual([]);
  });
});

describe('retrying', () => {
  const noWait = async () => {};
  it('retries a rate limit and gives up on a rejected key', async () => {
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('rate limited'), { status: 429 });
      return 'ok';
    };
    expect(await withRetry(flaky, noWait)).toBe('ok');
    expect(calls).toBe(3);

    let authCalls = 0;
    const rejected = async () => {
      authCalls += 1;
      throw Object.assign(new Error('invalid x-api-key'), { status: 401 });
    };
    await expect(withRetry(rejected, noWait)).rejects.toThrow('invalid x-api-key');
    // A bad key is not worth asking about three times.
    expect(authCalls).toBe(1);
  });

  it('a bad request is not retried either, because it will fail identically', async () => {
    let n = 0;
    const bad = async () => {
      n += 1;
      throw Object.assign(new Error('input_schema invalid'), { status: 400 });
    };
    await expect(withRetry(bad, noWait)).rejects.toThrow('input_schema');
    expect(n).toBe(1);
  });
});
