import { Box, Button, Tooltip, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { dutyColors } from '../../components/duty/tokens';

/**
 * Every left-pane view wears the same head: eyebrow + name on the left, the
 * view's actions on the right. Actions live here rather than in a footer, so
 * they never sit beside the sidebar version line.
 */
export function RoutinePaneHeader({
  eyebrow,
  title,
  actions,
  below,
  note,
  noteIsError,
  tone = 'list',
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  below?: ReactNode;
  note: string;
  noteIsError?: boolean;
  /**
   * `editor` tints the head green so authoring reads as a different room from
   * browsing. `admin` goes to ink: the owner's control room, not the floor.
   */
  tone?: 'list' | 'editor' | 'admin';
}) {
  const editor = tone === 'editor';
  const admin = tone === 'admin';
  return (
    <Box
      sx={{
        flex: '0 0 auto',
        px: 2.5,
        pt: 2,
        pb: 1.5,
        bgcolor: admin ? dutyColors.ink : editor ? dutyColors.brandTint : dutyColors.card,
        borderBottom: `1px solid ${admin ? 'rgba(0,0,0,0.4)' : editor ? 'rgba(46,125,50,0.22)' : dutyColors.ink15}`,
        boxShadow: editor || admin ? `inset 0 3px 0 ${dutyColors.brand}` : 'none',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, minHeight: 42 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: admin ? '#8FD694' : editor ? dutyColors.brandDark : dutyColors.brand,
            }}
          >
            {eyebrow}
          </Typography>
          <Typography
            noWrap
            sx={{ fontSize: 20, fontWeight: 700, color: admin ? '#fff' : dutyColors.ink, lineHeight: 1.25 }}
          >
            {title}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, minHeight: 34 }}>
          {actions}
        </Box>
      </Box>
      {below ? <Box sx={{ mt: 1.5 }}>{below}</Box> : null}
      {/* One line always: a longer note must not push the list down when it changes. */}
      <Typography
        noWrap
        sx={{
          fontSize: 12.5,
          fontWeight: noteIsError ? 600 : 400,
          color: noteIsError ? (admin ? '#FF9B8A' : dutyColors.red) : admin ? 'rgba(255,255,255,0.62)' : dutyColors.ink60,
          mt: 1,
          minHeight: 18,
        }}
      >
        {note}
      </Typography>
    </Box>
  );
}

/** Square ghost button for a secondary header verb; same height as the text buttons. */
export function RoutineHeaderIconButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip title={label}>
      <span style={{ display: 'inline-flex' }}>
        <Box
          component="button"
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          sx={{
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'default' : 'pointer',
            borderRadius: '9px',
            border: `1.5px solid ${dutyColors.ink15}`,
            bgcolor: dutyColors.card,
            color: dutyColors.ink60,
            '& svg': { fontSize: 18 },
            '&:hover': {
              bgcolor: dutyColors.brandTint,
              borderColor: dutyColors.brand,
              color: dutyColors.brandDark,
            },
            '&:disabled': { color: dutyColors.ink15, borderColor: dutyColors.ink08 },
          }}
        >
          {icon}
        </Box>
      </span>
    </Tooltip>
  );
}

export function RoutineHeaderButton({
  label,
  onClick,
  variant,
  disabled,
}: {
  label: string;
  onClick: () => void;
  variant: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      sx={{
        height: 34,
        minWidth: 74,
        px: 1.75,
        borderRadius: '9px',
        fontSize: 13,
        fontWeight: 700,
        color: primary ? '#fff' : dutyColors.ink60,
        bgcolor: primary ? dutyColors.brand : dutyColors.card,
        border: `1.5px solid ${primary ? dutyColors.brand : dutyColors.ink15}`,
        boxShadow: primary ? '0 1px 3px rgba(27,94,32,0.28)' : 'none',
        '&:hover': {
          bgcolor: primary ? dutyColors.brandDark : dutyColors.brandTint,
          borderColor: primary ? dutyColors.brandDark : dutyColors.brand,
          color: primary ? '#fff' : dutyColors.brandDark,
        },
        '&:disabled': {
          bgcolor: primary ? dutyColors.ink15 : dutyColors.card,
          borderColor: dutyColors.ink15,
          color: dutyColors.ink40,
          boxShadow: 'none',
        },
      }}
    >
      {label}
    </Button>
  );
}
