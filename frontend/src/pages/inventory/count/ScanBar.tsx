import type { ReactNode, Ref } from 'react';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import { Button, Paper, Stack, TextField, Typography } from '@mui/material';

/**
 * The one scan box of PR Fix-it: the same box, in the same place, on every tab. A scanner types into it and
 * presses Enter; a person can type too. 16px text so a phone does not zoom in on focus.
 */
export function ScanBar({
  value, onChange, onSubmit, label, placeholder, actionLabel, onAction, actionDisabled, disabled, ready = true,
  inputRef, helper,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Enter in the box (what a scanner sends). */
  onSubmit: () => void;
  label: string;
  placeholder?: string;
  actionLabel: string;
  /** The button; defaults to the same as Enter. */
  onAction?: () => void;
  actionDisabled?: boolean;
  disabled?: boolean;
  /** Green-light border: the box will act on a scan. */
  ready?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  helper?: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 1.25, sm: 2 }, mb: 2, borderWidth: 2, borderColor: ready ? 'primary.main' : 'divider' }}
    >
      <Stack direction="row" spacing={{ xs: 1, sm: 1.5 }} alignItems="center">
        <QrCodeScanner color={ready ? 'primary' : 'disabled'} sx={{ fontSize: 28, display: { xs: 'none', sm: 'block' } }} />
        <TextField
          inputRef={inputRef}
          fullWidth
          label={label}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          size="small"
          inputProps={{ 'aria-label': label, enterKeyHint: 'go', autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false }}
          sx={{ '& input': { fontSize: 16 } }}
        />
        <Button
          variant="contained"
          onClick={onAction ?? onSubmit}
          disabled={disabled || actionDisabled}
          sx={{ minWidth: 92, minHeight: 40, textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          {actionLabel}
        </Button>
      </Stack>
      {helper && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
          {helper}
        </Typography>
      )}
    </Paper>
  );
}
