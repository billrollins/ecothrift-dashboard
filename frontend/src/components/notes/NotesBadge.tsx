import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

/** Fixed footprint so a count never shoves the row. */
export const NOTES_BADGE_WIDTH = 44;
export const NOTES_BADGE_HEIGHT = 28;
/** Corner chip on the queue note — small enough that the note keeps the column. */
export const NOTES_BADGE_COMPACT_WIDTH = 22;
export const NOTES_BADGE_COMPACT_HEIGHT = 20;

export function NotesBadge({
  count,
  onClick,
  disabled,
  compact,
  tone = 'light',
}: {
  count: number;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
  tone?: 'light' | 'dark';
}) {
  const label = count > 99 ? '99+' : String(count);
  const width = compact ? NOTES_BADGE_COMPACT_WIDTH : NOTES_BADGE_WIDTH;
  const height = compact ? NOTES_BADGE_COMPACT_HEIGHT : NOTES_BADGE_HEIGHT;
  const dark = tone === 'dark';
  return (
    <Button
      size="small"
      variant="outlined"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Notes (${count})`}
      sx={{
        minWidth: width,
        width,
        height,
        px: 0,
        fontWeight: 800,
        fontSize: compact ? '0.58rem' : '0.72rem',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
        ...(dark
          ? {
              color: '#f8fafc',
              borderColor: 'rgba(248, 250, 252, 0.38)',
              bgcolor: 'rgba(248, 250, 252, 0.08)',
              '&:hover': {
                borderColor: '#f8fafc',
                bgcolor: 'rgba(248, 250, 252, 0.16)',
              },
            }
          : null),
      }}
    >
      <Box component="span">{label}</Box>
    </Button>
  );
}
