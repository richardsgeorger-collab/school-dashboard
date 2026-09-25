import { useCallback, useEffect, useState } from 'react';

/**
 * Five tabs: Now, Calendar, Classes, Inbox, You. Everything else is a screen reached from one of them and lights up
 * that tab. Old addresses keep working through the aliases so a bookmark from last month still lands somewhere.
 */
export type Route = 'now' | 'calendar' | 'classes' | 'inbox' | 'you' | 'load' | 'library' | 'grades' | 'quiz' | 'class' | 'ingest' | 'tutor' | 'study' | 'ai' | 'admin';
const ROUTES: Route[] = ['now', 'calendar', 'classes', 'inbox', 'you', 'load', 'library', 'grades', 'quiz', 'class', 'ingest', 'tutor', 'study', 'ai', 'admin'];
const ALIASES: Record<string, Route> = { home: 'now', '': 'now', record: 'library', news: 'inbox', settings: 'you', plan: 'load' };

export type Tab = 'now' | 'calendar' | 'classes' | 'inbox' | 'you';
export const TABS: Tab[] = ['now', 'calendar', 'classes', 'inbox', 'you'];

/** Which tab a screen belongs to, so the tab bar can show where you are. */
export const TAB_OF: Record<Route, Tab> = {
  now: 'now',
  calendar: 'calendar',
  classes: 'classes',
  class: 'classes',
  library: 'classes',
  ai: 'now',
  quiz: 'now',
  study: 'now',
  tutor: 'now',
  ingest: 'classes',
  inbox: 'inbox',
  you: 'you',
  load: 'you',
  grades: 'you',
  admin: 'you',
};

export interface RouteState {
  route: Route;
  params: URLSearchParams;
}

export function parseHash(hash: string): RouteState {
  const clean = hash.replace(/^#\/?/, '');
  const [path, query = ''] = clean.split('?');
  const route = (ROUTES as string[]).includes(path) ? (path as Route) : (ALIASES[path] ?? 'now');
  return { route, params: new URLSearchParams(query) };
}

const parse = (): RouteState => parseHash(window.location.hash);

export function useRoute(): RouteState & { navigate: (route: Route, params?: Record<string, string>) => void } {
  const [state, setState] = useState<RouteState>(parse);
  useEffect(() => {
    const onChange = () => setState(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((route: Route, params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    window.location.hash = `/${route}${qs ? `?${qs}` : ''}`;
  }, []);
  return { ...state, navigate };
}
