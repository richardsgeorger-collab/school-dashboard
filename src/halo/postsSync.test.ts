import { describe, expect, it } from 'vitest';
import { planPostsSync } from './postsSync';
import type { StoredAnnouncement } from './announce';

const post = (id: string): StoredAnnouncement => ({ id, forumId: 'f', title: id, content: '', publishedAt: null, modifiedAt: null, author: null, mustAcknowledge: false, acknowledged: false, resources: [], courseId: 'c1', text: '', pulledAt: '2026-09-27T00:00:00Z', readAt: null, processedAt: null, findings: null, review: {} });

describe('the posts mirror', () => {
  it('pulls the ids the device lacks and pushes the posts the account lacks; never removes', () => {
    const plan = planPostsSync([post('a'), post('b')], [{ id: 'b', updated_at: 'x' }, { id: 'c', updated_at: 'x' }]);
    expect(plan.pullIds).toEqual(['c']);
    expect(plan.push.map((p) => p.id)).toEqual(['a']);
  });
  it('is a no-op when both sides hold the same posts', () => {
    expect(planPostsSync([post('a')], [{ id: 'a', updated_at: 'x' }])).toEqual({ pullIds: [], push: [] });
  });
});
