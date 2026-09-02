import { Box } from '@mui/material';
import { dutyColors, type StatusTagTone } from './tokens';

const TONE: Record<StatusTagTone, { bg: string; color: string; pin: string }> = {
  red: { bg: dutyColors.red, color: '#fff', pin: 'rgba(255,255,255,0.75)' },
  amber: { bg: dutyColors.amberBg, color: dutyColors.amberInk, pin: 'rgba(74,50,0,0.55)' },
  green: { bg: dutyColors.green, color: '#fff', pin: 'rgba(255,255,255,0.75)' },
  blue: { bg: dutyColors.blue, color: '#fff', pin: 'rgba(255,255,255,0.75)' },
  violet: { bg: dutyColors.violet, color: '#fff', pin: 'rgba(255,255,255,0.75)' },
  plain: { bg: dutyColors.ink15, color: dutyColors.ink60, pin: dutyColors.ink40 },
};

export function StatusTag({
  label,
  tone,
  small,
}: {
  label: string;
  tone: StatusTagTone;
  small?: boolean;
}) {
  const colors = TONE[tone];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: small ? 18 : 22,
        pl: small ? '13px' : '15px',
        pr: small ? '7px' : '9px',
        clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 8px 100%, 0 50%)',
        fontSize: small ? 10.5 : 11.5,
        fontWeight: 700,
        letterSpacing: '0.01em',
        color: colors.color,
        bgcolor: colors.bg,
        position: 'relative',
        whiteSpace: 'nowrap',
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 9,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 3.5,
          height: 3.5,
          borderRadius: '50%',
          bgcolor: colors.pin,
        },
      }}
    >
      {label}
    </Box>
  );
}
