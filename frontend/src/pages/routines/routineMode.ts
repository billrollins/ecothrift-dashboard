export type RoutineShellMode = 'mine' | 'catalog' | 'fill' | 'edit' | 'demo';

export function routineShellMode(pathname: string, search: URLSearchParams): RoutineShellMode {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/routines/catalog') {
    return search.get('view') ? 'demo' : 'catalog';
  }
  if (path === '/routines/new' || /\/routines\/\d+\/edit$/.test(path)) {
    return 'edit';
  }
  if (path.startsWith('/routines/run/')) {
    return 'fill';
  }
  if (path === '/routines' && search.get('run')) {
    return 'fill';
  }
  return path === '/routines/catalog' ? 'catalog' : 'mine';
}

export function routineListPath(mode: 'mine' | 'catalog'): string {
  return mode === 'catalog' ? '/routines/catalog' : '/routines';
}
