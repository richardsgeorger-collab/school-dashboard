import type { Course, Item, Settings } from '../domain/types';
import { supabase } from './client';

/** Everything the student has, as one file they own. */
export interface ExportFile {
  app: 'school-dashboard';
  exportedAt: string;
  courses: Course[];
  items: Item[];
  settings: Omit<Settings, 'supabaseUrl' | 'supabaseAnonKey'>;
  announcements: unknown[];
}

export function exportEverything(data: { courses: Course[]; items: Item[]; settings: Settings }, announcements: unknown[] = [], at = new Date().toISOString()): string {
  // Connection details are the build's, not the student's, and never travel in an export.
  const { supabaseUrl: _u, supabaseAnonKey: _k, ...settings } = data.settings as Settings & { supabaseUrl?: string; supabaseAnonKey?: string };
  const file: ExportFile = { app: 'school-dashboard', exportedAt: at, courses: data.courses, items: data.items, settings, announcements };
  return JSON.stringify(file, null, 2);
}

/** Every row, then the auth user, in one server call; then signed out here. Irreversible, and the screen says so. */
export async function deleteMyAccount(): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = supabase();
  if (!c) return { ok: false, error: 'There is no account on this build to delete.' };
  const { error } = await c.rpc('delete_my_account');
  if (error) return { ok: false, error: error.message };
  await c.auth.signOut();
  return { ok: true };
}
