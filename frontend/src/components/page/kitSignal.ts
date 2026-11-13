/**
 * How a page built with the kit tells the shell it is there (Dash Update #134, Design Lab phase 2). MainLayout
 * provides the setter; PageShell marks itself while mounted. The shell then names the page in the top bar (kit rule:
 * the top bar names the page, the body never repeats it). Pages not on the kit keep their own titles, so no page shows
 * two. Without a provider (tests, the Design Lab's own frames) the mark does nothing.
 */
import { createContext, useContext, useEffect } from 'react';

export const KitPageContext = createContext<((delta: 1 | -1) => void) | null>(null);

export function useMarkKitPage() {
  const mark = useContext(KitPageContext);
  useEffect(() => {
    if (!mark) return undefined;
    mark(1);
    return () => mark(-1);
  }, [mark]);
}
