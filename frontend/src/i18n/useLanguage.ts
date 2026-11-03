/** The signed-in person's language; English outside an AuthProvider (bare tests). useAuth only reads a context. */
import { useAuth } from '../contexts/AuthContext';
import type { AppLanguage } from './routines';

export function useLanguage(): AppLanguage {
  try {
    return useAuth().user?.language === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}
