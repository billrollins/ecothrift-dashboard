import { Typography } from '@mui/material';
import { processingTokens } from '../processing/processingTokens';

export function SeeAllFromProductLink({ onClick }: { onClick: () => void }) {
  return (
    <Typography
      component="button"
      type="button"
      onClick={onClick}
      variant="caption"
      sx={{
        border: 0,
        bgcolor: 'transparent',
        p: 0,
        m: 0,
        cursor: 'pointer',
        fontWeight: 700,
        fontSize: '0.6875rem',
        color: processingTokens.primaryDark,
        textAlign: 'right',
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      See all from this product
    </Typography>
  );
}
