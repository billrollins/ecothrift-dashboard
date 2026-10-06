import { Box, Tooltip, Typography } from '@mui/material';
import type { Flag } from '../../api/hiring.api';
import { ccTokens } from '../../theme';

/** The must-have answers as red / green marks: transportation, lifting, 18+, authorized. */
export function FlagDots({ flags, showLabels = false }: { flags: Flag[]; showLabels?: boolean }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: showLabels ? 1 : 0.5 }}>
      {flags.map((flag) => {
        const color = flag.ok === false ? ccTokens.bad : flag.ok ? ccTokens.good : ccTokens.neu;
        const text = `${flag.label}: ${flag.ok === false ? 'no' : flag.ok ? 'yes' : 'not answered'}`;
        if (showLabels) {
          return (
            <Box
              key={flag.key}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.5,
                borderRadius: 99,
                bgcolor: flag.ok === false ? ccTokens.badTint : flag.ok ? ccTokens.goodTint : ccTokens.neuTint,
              }}
            >
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: color }} />
              <Typography variant="body2" sx={{ fontWeight: 600, color: flag.ok === false ? ccTokens.badText : ccTokens.ink }}>
                {flag.label}
              </Typography>
            </Box>
          );
        }
        return (
          <Tooltip key={flag.key} title={text}>
            <Box aria-label={text} sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: color }} />
          </Tooltip>
        );
      })}
    </Box>
  );
}
