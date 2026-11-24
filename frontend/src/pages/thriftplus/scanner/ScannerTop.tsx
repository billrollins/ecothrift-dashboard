import { Box } from '@mui/material';
import { art, u } from './scannerTheme';

/** The field photo header. `tall` is the sign-in screen's bigger version. */
/** `blackFriday` (#220): the Black Friday ad's ink and cranberry instead of the field photo. */
export function FieldBanner({ children, tall = false, blackFriday = false }: { children: React.ReactNode; tall?: boolean; blackFriday?: boolean }) {
  return (
    <Box
      sx={{
        position: 'relative',
        flexShrink: 0,
        height: tall ? u(420) : u(200), // taller, so the cart pill can be bigger (owner, 2026-10-09)
        pt: 'env(safe-area-inset-top, 0px)',
        boxSizing: 'content-box',
        backgroundImage: blackFriday
          ? 'linear-gradient(180deg, #10140f 0%, #10140f 78%, #b4232c 78%, #b4232c 100%)'
          : `linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.10)), url(${art.header})`,
        backgroundSize: 'cover',
        backgroundPosition: tall ? 'center 42%' : 'center 46%',
      }}
    >
      {children}
    </Box>
  );
}
