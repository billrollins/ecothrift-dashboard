import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/**
 * Phone / narrow tablet layout for Online Sales.
 *
 * Matches MainLayout's `down('md')` (900px) so the Holds page switches to
 * cards + bottom sheet at the same width the sidebar becomes a drawer.
 */
export function useOnlineSalesMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}
