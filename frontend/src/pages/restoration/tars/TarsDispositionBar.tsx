/**
 * The ways the item in hand can leave the bench.
 *
 * These live in the header rather than down in the panels because they are the
 * only controls that end the session. Everything below is about the item you
 * are keeping; these are about handing it on, and they should be findable in
 * the same place every time without hunting through a column.
 *
 * All three open a dialog. None of them is a one-tap exit, because each one
 * asks for something — a reason, a note, a final grade — and an item that left
 * without those is a hole in the record nobody can fill in later.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';

export function TarsDispositionBar({
  busy,
  onHold,
  onSendBack,
  onDone,
}: {
  busy?: boolean;
  onHold: () => void;
  onSendBack: () => void;
  onDone: () => void;
}) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <HeaderButton
        label="Hold"
        hint="Park it mid-job. It keeps its plan and comes back to you."
        disabled={busy}
        onClick={onHold}
      />
      <HeaderButton
        label="Back to queue"
        hint="Send it back unfinished, with a note saying why."
        disabled={busy}
        onClick={onSendBack}
      />
      <HeaderButton
        label="Done"
        hint="Finish it: final grade, where it goes, any last notes."
        disabled={busy}
        primary
        onClick={onDone}
      />
    </Stack>
  );
}

function HeaderButton({
  label,
  hint,
  disabled,
  primary,
  onClick,
}: {
  label: string;
  hint: string;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip arrow title={hint}>
      <span>
        <Box
          component="button"
          type="button"
          disabled={disabled}
          onClick={onClick}
          sx={{
            px: 1.15,
            height: 34,
            cursor: disabled ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            fontSize: '0.78rem',
            fontWeight: 900,
            borderRadius: '8px',
            border: '1px solid',
            borderColor: primary ? '#2f6f68' : '#33425c',
            bgcolor: primary ? '#17564f' : 'transparent',
            color: disabled ? '#5c6b83' : primary ? '#c9f2e9' : '#c6d4e6',
            '&:hover:not(:disabled)': {
              bgcolor: primary ? '#1c6a61' : 'rgba(255,255,255,0.08)',
              borderColor: primary ? '#3d8a81' : '#4a5c7a',
            },
          }}
        >
          {label}
        </Box>
      </span>
    </Tooltip>
  );
}
