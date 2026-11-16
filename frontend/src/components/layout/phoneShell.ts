import { createContext, useContext } from 'react';

/**
 * True inside MainLayout's phone shell (slim top bar + PhoneTabBar). The top bar already says where you are and the
 * bottom bar carries the Home tabs, so a FloorPage there drops its desk band (#146).
 */
export const PhoneShellContext = createContext(false);

export function useInPhoneShell(): boolean {
  return useContext(PhoneShellContext);
}
