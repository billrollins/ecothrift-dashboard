import { Box, Tooltip, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { dutyColors } from './tokens';

export type TaskRowTone = 'none' | 'brand' | 'red' | 'amber' | 'green' | 'blue' | 'violet';

/** Soft tile behind the glyph, strong colour on the glyph itself. Same tone = same meaning. */
const GLYPH: Record<TaskRowTone, { bg: string; fg: string }> = {
  none: { bg: dutyColors.ink08, fg: dutyColors.ink40 },
  brand: { bg: dutyColors.brandSoft, fg: dutyColors.brand },
  red: { bg: '#FBE9E6', fg: dutyColors.red },
  amber: { bg: '#FBF1D6', fg: '#8A5B00' },
  green: { bg: dutyColors.brandSoft, fg: dutyColors.green },
  blue: { bg: '#E7EEF9', fg: dutyColors.blue },
  violet: { bg: '#F1EAF9', fg: dutyColors.violet },
};

/**
 * One row of a routine list: a status glyph, two lines of text, badges in
 * their own right-aligned column, and a fixed action strip. Density is the
 * point - a department of fifty has to stay scannable - so nothing here is
 * allowed to grow with content.
 */
export function TaskRow({
  title,
  meta,
  tags,
  tone = 'none',
  glyph,
  selected,
  onClick,
  actions,
}: {
  title: string;
  meta: string;
  tags?: ReactNode;
  /** Colours the glyph tile. */
  tone?: TaskRowTone;
  /** Icon in the tile. Says at a glance what kind of row this is. */
  glyph: ReactNode;
  /** The row the right-hand phone is currently showing. */
  selected?: boolean;
  /** Clicking anywhere on the row that is not a button. */
  onClick?: () => void;
  actions?: ReactNode;
}) {
  const colors = GLYPH[tone];
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        mx: 1.5,
        mb: 0.75,
        pl: 1.25,
        pr: 1,
        py: 1.1,
        cursor: onClick ? 'pointer' : 'default',
        bgcolor: selected ? dutyColors.brandSoft : dutyColors.card,
        border: `1px solid ${selected ? dutyColors.brand : dutyColors.ink08}`,
        borderRadius: '12px',
        boxShadow: selected
          ? '0 0 0 3px rgba(46,125,50,0.12)'
          : '0 1px 2px rgba(26,31,28,0.04)',
        transition: 'border-color 120ms, box-shadow 120ms',
        '&:hover': selected ? {} : {
          borderColor: dutyColors.ink15,
          boxShadow: '0 2px 8px rgba(26,31,28,0.08)',
        },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 36,
          height: 36,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '10px',
          bgcolor: selected ? dutyColors.brand : colors.bg,
          color: selected ? '#fff' : colors.fg,
          '& svg': { fontSize: 19 },
        }}
      >
        {glyph}
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 20 }}>
          <Typography
            noWrap
            sx={{ fontSize: 14.5, fontWeight: 650, color: dutyColors.ink, lineHeight: 1.35, minWidth: 0, flex: 1 }}
          >
            {title}
          </Typography>
          {/* Badges hang off the right of the text block so they line up down the list. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            {tags}
          </Box>
        </Box>
        <Typography
          noWrap
          sx={{ fontSize: 12, color: dutyColors.ink60, lineHeight: 1.4, minHeight: 17 }}
        >
          {meta}
        </Typography>
      </Box>

      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0, pl: 0.5 }}
        onClick={(event) => event.stopPropagation()}
      >
        {actions}
      </Box>
    </Box>
  );
}

/** The one verb for the row. Filled when it is the thing to do next, soft otherwise. */
export function TaskRowAction({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      sx={{
        height: 30,
        minWidth: 68,
        px: 1.5,
        mr: 0.5,
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 700,
        letterSpacing: '0.01em',
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: 999,
        border: 'none',
        bgcolor: primary ? dutyColors.brand : dutyColors.brandSoft,
        color: primary ? '#fff' : dutyColors.brandDark,
        boxShadow: primary ? '0 1px 2px rgba(27,94,32,0.3)' : 'none',
        transition: 'background-color 120ms',
        '&:hover': {
          bgcolor: primary ? dutyColors.brandDark : '#D9EEDB',
        },
        '&:disabled': {
          bgcolor: dutyColors.ink08,
          color: dutyColors.ink40,
          boxShadow: 'none',
        },
      }}
    >
      {label}
    </Box>
  );
}

/** Secondary verbs stay quiet until the pointer reaches them. */
export function TaskRowIcon({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
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
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'default' : 'pointer',
            borderRadius: '8px',
            border: 'none',
            bgcolor: 'transparent',
            color: dutyColors.ink40,
            transition: 'background-color 120ms, color 120ms',
            '&:hover': {
              color: danger ? dutyColors.red : dutyColors.brandDark,
              bgcolor: danger ? 'rgba(192,48,28,0.08)' : dutyColors.brandSoft,
            },
            '&:disabled': { color: dutyColors.ink15, bgcolor: 'transparent' },
          }}
        >
          {icon}
        </Box>
      </span>
    </Tooltip>
  );
}
