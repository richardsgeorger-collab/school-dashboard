import { useCallback, useEffect, useState } from 'react';

export type Route = 'calendar' | 'plan' | 'load' | 'grades' | 'settings';
const ROUTES: Route[] = ['calendar', 'plan', 'load', 'grades', 'settings'];
const ALIASES: Record<string, Route> = { home: 'plan', '': 'calendar' };

export interface RouteState {
  route: Route;
  params: URLSearchParams;
}

function parse(): RouteState {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const route = (ROUTES as string[]).includes(path) ? (path as Route) : (ALIASES[path] ?? 'calendar');
  return { route, params: new URLSearchParams(query) };
}

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
