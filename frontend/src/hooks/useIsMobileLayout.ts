import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/**
 * Phone / narrow tablet layout.
 *
 * Matches MainLayout's `down('md')` (900px), so a page switches to cards and a
 * bottom sheet at the same width the sidebar becomes a drawer.
 *
 * Reads the theme from context, so a phone-first page inside `PhoneFrame`
 * reports mobile on a desk too. See `components/layout/PhoneFrame.tsx`.
 */
export function useIsMobileLayout(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}
