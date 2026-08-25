import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { PANEL, TYPE } from './benchScale';

export function BenchPaneHeader({
  kicker,
  value,
  detail,
  action,
  mark,
}: {
  kicker: string;
  value?: string;
  detail?: string;
  action?: ReactNode;
  /** A colon-like join between kicker and value, without a colon. */
  mark?: boolean;
}) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        px: '10px',
        pt: '6px',
        pb: '5px',
        bgcolor: PANEL.bgSubtle,
        borderBottom: `1px solid ${PANEL.border}`,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 28 }}>
        <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography sx={{ ...TYPE.micro, color: PANEL.label }}>{kicker}</Typography>
          {mark ? (
            <Box
              aria-hidden
              sx={{
                width: '1px',
                height: 11,
                alignSelf: 'center',
                bgcolor: PANEL.borderStrong,
                flexShrink: 0,
              }}
            />
          ) : null}
          <Typography
            data-pane-total={kicker}
            sx={{ ...TYPE.value, color: PANEL.ink, minWidth: 56 }}
          >
            {value ?? ''}
          </Typography>
        </Stack>
        <Box sx={{ minHeight: 26, minWidth: 72, display: 'flex', justifyContent: 'flex-end' }}>
          {action}
        </Box>
      </Stack>
      {detail != null ? (
        <Typography
          noWrap
          title={detail}
          sx={{ ...TYPE.meta, color: PANEL.inkMuted, minHeight: 16 }}
        >
          {detail}
        </Typography>
      ) : null}
    </Box>
  );
}
