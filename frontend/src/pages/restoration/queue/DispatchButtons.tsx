/**
 * The next-move strip on an Overview row.
 *
 * Every button is always there. Ready ones go; blocked ones stay the same
 * size and explain why.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { studio } from '../tars/studio/tarsStudioTheme';
import { FIELD_HEIGHT } from './QueueInlineCells';
import type { DispatchOption } from './queueDispatch';

export function DispatchButtons({
  options,
  name,
  busy,
  onPick,
}: {
  options: DispatchOption[];
  name: string;
  busy?: boolean;
  onPick: (option: DispatchOption) => void;
}) {
  return (
    <Stack
      direction="row"
      spacing={0.4}
      role="group"
      aria-label={`Dispatch ${name}`}
      sx={{ width: '100%', minHeight: FIELD_HEIGHT, alignItems: 'center' }}
    >
      {options.map((option) => {
        const blocked = option.tone === 'blocked';
        return (
          <Box
            key={option.target}
            component="button"
            type="button"
            aria-disabled={busy || blocked}
            aria-label={`${option.label} ${name}`}
            onClick={() => {
              if (busy) return;
              onPick(option);
            }}
            sx={{
              flex: 1,
              minWidth: 0,
              height: FIELD_HEIGHT,
              px: 0.4,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 800,
              fontSize: '0.68rem',
              letterSpacing: 0.1,
              borderRadius: `${studio.radius.sm}px`,
              border: `1.5px solid ${blocked ? studio.panelBorder : option.dot}`,
              bgcolor: blocked ? studio.panel : `${option.dot}18`,
              color: blocked ? studio.inkFaint : option.dot,
              opacity: blocked ? 0.55 : 1,
              outline: 'none',
              '&:focus-visible': { boxShadow: `0 0 0 2px ${studio.accentSoft}` },
            }}
          >
            {option.label}
          </Box>
        );
      })}
    </Stack>
  );
}
