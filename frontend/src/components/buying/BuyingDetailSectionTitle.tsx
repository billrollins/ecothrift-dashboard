import { Typography, type TypographyProps } from '@mui/material';
import type { ReactNode } from 'react';

/** Matches Pricing / Timing / Auction subsection titles on the auction detail page. */
export default function BuyingDetailSectionTitle({
  children,
  first,
  ...rest
}: { children: ReactNode; first?: boolean } & Omit<TypographyProps, 'children'>) {
  return (
    <Typography
      component="h3"
      variant="overline"
      sx={{
        display: 'block',
        lineHeight: 1.35,
        mb: 1,
        mt: first ? 0 : 2,
        fontWeight: 800,
        letterSpacing: '0.1em',
        color: 'text.primary',
        borderBottom: 1,
        borderColor: 'divider',
        pb: 0.75,
      }}
      {...rest}
    >
      {children}
    </Typography>
  );
}
