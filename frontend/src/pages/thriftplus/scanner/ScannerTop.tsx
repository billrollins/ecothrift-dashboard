import { Box } from '@mui/material';
import { art, u } from './scannerTheme';

/** The field photo header. `tall` is the sign-in screen's bigger version. */
export function FieldBanner({ children, tall = false }: { children: React.ReactNode; tall?: boolean }) {
  return (
    <Box
      sx={{
        position: 'relative',
        flexShrink: 0,
        height: tall ? u(420) : u(200), // taller, so the cart pill can be bigger (owner, 2026-10-09)
        pt: 'env(safe-area-inset-top, 0px)',
        boxSizing: 'content-box',
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.10)), url(${art.header})`,
        backgroundSize: 'cover',
        backgroundPosition: tall ? 'center 42%' : 'center 46%',
      }}
    >
      {children}
    </Box>
  );
}
