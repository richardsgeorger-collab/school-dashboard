import { useCallback, useEffect, useState } from 'react';

export type Route = 'home' | 'calendar' | 'load' | 'grades' | 'settings';
const ROUTES: Route[] = ['home', 'calendar', 'load', 'grades', 'settings'];

export interface RouteState {
  route: Route;
  params: URLSearchParams;
}

function parse(): RouteState {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const route = (ROUTES as string[]).includes(path) ? (path as Route) : 'home';
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
