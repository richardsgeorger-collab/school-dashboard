import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Course, Item, Settings } from '../domain/types';
import type { RemoteData, Repository } from './repository';

let cached: { key: string; client: SupabaseClient } | null = null;

/** One client per URL+key for the life of the page. */
export function getSupabaseClient(url: string, anonKey: string): SupabaseClient {
  const key = `${url}|${anonKey}`;
  if (cached?.key === key) return cached.client;
  cached = { key, client: createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) };
  return cached.client;
}

interface Row<T> {
  id: string;
  data: T;
  updated_at: string;
  deleted_at: string | null;
}

/** Settings fields that stay on the device: connection details never round-trip. */
function remoteSettings(s: Settings): Omit<Settings, 'supabaseUrl' | 'supabaseAnonKey'> {
  const { supabaseUrl: _u, supabaseAnonKey: _k, ...rest } = s;
  return rest;
}

export class SupabaseRepo implements Repository {
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}

  async load(): Promise<RemoteData> {
    const [courses, items, settings] = await Promise.all([
      this.client.from('courses').select('id,data,updated_at,deleted_at'),
      this.client.from('items').select('id,data,updated_at,deleted_at'),
      this.client.from('settings').select('data,updated_at').eq('user_id', this.userId).maybeSingle(),
    ]);
    if (courses.error) throw new Error(courses.error.message);
    if (items.error) throw new Error(items.error.message);
    if (settings.error) throw new Error(settings.error.message);

    const split = <T extends { id: string; updatedAt: string }>(rows: Row<T>[]) => {
      const live: T[] = [];
      const dead: Record<string, string> = {};
      for (const r of rows) {
        if (r.deleted_at) dead[r.id] = r.deleted_at;
        else live.push({ ...r.data, id: r.id, updatedAt: r.updated_at });
      }
      return { live, dead };
    };
    const c = split<Course>((courses.data ?? []) as Row<Course>[]);
    const i = split<Item>((items.data ?? []) as Row<Item>[]);
    return {
      courses: c.live,
      items: i.live,
      deletedCourseIds: c.dead,
      deletedItemIds: i.dead,
      settings: settings.data ? ({ ...(settings.data.data as Settings), updatedAt: settings.data.updated_at } as Settings) : undefined,
    };
  }

  private async upsert<T extends { id: string; updatedAt: string }>(table: string, rows: T[]) {
    if (rows.length === 0) return;
    const { error } = await this.client.from(table).upsert(
      rows.map((r) => ({ id: r.id, user_id: this.userId, data: r, updated_at: r.updatedAt, deleted_at: null })),
      { onConflict: 'id' },
    );
    if (error) throw new Error(error.message);
  }

  private async tombstone(table: string, id: string, deletedAt: string) {
    const { error } = await this.client
      .from(table)
      .upsert({ id, user_id: this.userId, data: { id }, updated_at: deletedAt, deleted_at: deletedAt }, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  saveCourses(courses: Course[]) {
    return this.upsert('courses', courses);
  }
  saveItems(items: Item[]) {
    return this.upsert('items', items);
  }
  deleteItem(id: string, deletedAt: string) {
    return this.tombstone('items', id, deletedAt);
  }
  deleteCourse(id: string, deletedAt: string) {
    return this.tombstone('courses', id, deletedAt);
  }
  async saveSettings(settings: Settings) {
    const { error } = await this.client
      .from('settings')
      .upsert({ user_id: this.userId, data: remoteSettings(settings), updated_at: settings.updatedAt }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  }
}
