/**
 * How the item in hand leaves the bench.
 *
 * Four command keys - Queue, Hold, Reject, Finish - in that order.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { DECK, RADIUS, TYPE } from './studio/benchScale';

export const DISPATCH_CHOICES = ['queue', 'hold', 'reject', 'done'] as const;
export type DispatchChoice = (typeof DISPATCH_CHOICES)[number];

const DISPATCH_LABELS: Record<DispatchChoice, string> = {
  queue: 'Queue',
  hold: 'Hold',
  reject: 'Reject',
  done: 'Finish',
};

const KEY_PAINT: Record<DispatchChoice, { idle: string; hover: string; border: string; color: string }> = {
  queue: { idle: 'rgba(255,255,255,0.05)', hover: 'rgba(255,255,255,0.11)', border: '#3a4a43', color: '#c3d0c8' },
  hold: { idle: 'rgba(224,180,90,0.10)', hover: 'rgba(224,180,90,0.18)', border: '#8a7440', color: '#e0b45a' },
  reject: { idle: 'rgba(231,156,147,0.10)', hover: 'rgba(231,156,147,0.18)', border: '#8a5b55', color: '#e79c93' },
  done: { idle: 'rgba(127,199,154,0.14)', hover: 'rgba(127,199,154,0.24)', border: '#4f8a68', color: '#9edcb4' },
};

const DONE_BLOCKED_PAINT = KEY_PAINT.hold;

export function TarsDispositionBar({
  busy,
  finishBlocked = false,
  layout = 'row',
  onHold,
  onSendBack,
  onReject,
  onDone,
}: {
  busy?: boolean;
  finishBlocked?: boolean;
  layout?: 'console' | 'row';
  onHold: () => void;
  onSendBack: () => void;
  onReject: () => void;
  onDone: () => void;
}) {
  function choose(choice: DispatchChoice) {
    if (choice === 'hold') onHold();
    else if (choice === 'queue') onSendBack();
    else if (choice === 'reject') onReject();
    else onDone();
  }

  return (
    <Stack
      direction={layout === 'console' ? 'column' : 'row'}
      spacing={layout === 'console' ? 0.75 : 0.45}
      sx={{ minWidth: 0, height: layout === 'console' ? '100%' : undefined }}
    >
      {DISPATCH_CHOICES.map((choice) => {
        const paint = choice === 'done' && finishBlocked ? DONE_BLOCKED_PAINT : KEY_PAINT[choice];
        return (
          <Box
            key={choice}
            component="button"
            type="button"
            disabled={busy}
            aria-label={choice === 'done' && finishBlocked ? 'Finish blocked - parts are on order' : DISPATCH_LABELS[choice]}
            onClick={() => choose(choice)}
            sx={{
              ...TYPE.micro,
              letterSpacing: '0.08em',
              height: layout === 'console' ? undefined : 30,
              minHeight: layout === 'console' ? 30 : 30,
              flex: layout === 'console' ? 1 : undefined,
              width: layout === 'console' ? '100%' : 118,
              px: 1,
              cursor: busy ? 'not-allowed' : 'pointer',
              borderRadius: `${RADIUS.md}px`,
              border: `1px solid ${busy ? DECK.rule : paint.border}`,
              bgcolor: busy ? 'rgba(255,255,255,0.03)' : paint.idle,
              color: busy ? DECK.faint : paint.color,
              outline: 'none',
              '&:hover:not(:disabled)': { bgcolor: paint.hover },
              '&:focus-visible': { boxShadow: '0 0 0 2px rgba(127,199,154,0.45)' },
            }}
          >
            {DISPATCH_LABELS[choice]}
          </Box>
        );
      })}
    </Stack>
  );
}
