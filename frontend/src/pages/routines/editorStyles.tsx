import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { dutyColors } from '../../components/duty/tokens';

/** One field look across the whole editor: white well, ink focus ring. */
export const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: dutyColors.card,
    borderRadius: '10px',
    fontSize: 14.5,
    '& fieldset': { borderColor: dutyColors.ink15 },
    '&:hover fieldset': { borderColor: dutyColors.ink40 },
    '&.Mui-focused fieldset': { borderColor: dutyColors.brand, borderWidth: 1.5 },
  },
  '& .MuiInputLabel-root': { fontSize: 14, color: dutyColors.ink60 },
  '& .MuiInputLabel-root.Mui-focused': { color: dutyColors.brand },
  '& .MuiFormHelperText-root': { fontSize: 11.5, color: dutyColors.ink40, mx: 0.25 },
} as const;

export const titleFieldSx = {
  ...fieldSx,
  '& .MuiOutlinedInput-root': {
    ...fieldSx['& .MuiOutlinedInput-root'],
    fontSize: 18,
    fontWeight: 600,
  },
} as const;

/**
 * A band of the form sheet. The head reads as one line on a desk - name, then
 * what the band is for - so the controls below get the full sheet width.
 */
export function FormSection({
  title,
  description,
  wide,
  first,
  children,
}: {
  title: string;
  description: string;
  wide: boolean;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        px: wide ? 3 : 2.5,
        py: wide ? 3 : 2.5,
        borderTop: first ? 'none' : `1px solid ${dutyColors.ink08}`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'baseline' : 'flex-start',
          gap: wide ? 1.25 : 0.25,
          mb: 1.75,
        }}
      >
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: dutyColors.ink, flexShrink: 0 }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60, lineHeight: 1.45 }}>
          {description}
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

/** Two-up on the desk, stacked on a phone. Children may set gridColumn: '1 / -1'. */
export function FieldGrid({ wide, children }: { wide: boolean; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
        gap: 1.75,
        alignItems: 'start',
      }}
    >
      {children}
    </Box>
  );
}

export function DashedButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        width: '100%',
        height: 42,
        font: 'inherit',
        fontSize: 13.5,
        fontWeight: 700,
        cursor: 'pointer',
        color: dutyColors.ink60,
        bgcolor: 'transparent',
        border: `1.5px dashed ${dutyColors.ink15}`,
        borderRadius: '10px',
        '&:hover': { borderColor: dutyColors.ink40, color: dutyColors.ink },
      }}
    >
      {label}
    </Box>
  );
}
