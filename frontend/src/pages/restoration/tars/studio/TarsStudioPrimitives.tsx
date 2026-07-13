import Check from '@mui/icons-material/Check';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { studio } from './tarsStudioTheme';

export function StudioSurface({
  children,
  sx,
}: {
  children: ReactNode;
  sx?: object;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: studio.panel,
        borderRadius: `${studio.radius.md}px`,
        border: `1px solid ${studio.panelBorder}`,
        boxShadow: studio.panelShadow,
        overflow: 'hidden',
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
}

export function StudioSectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      alignItems="baseline"
      justifyContent="space-between"
      gap={1}
      sx={{ mb: 1 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>
          {title}
        </Typography>
        {subtitle ?
          <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }} noWrap>
            {subtitle}
          </Typography>
        : null}
      </Box>
      {action}
    </Stack>
  );
}

export function StudioChoiceButton({
  selected,
  tone,
  label,
  onClick,
  disabled,
}: {
  selected: boolean;
  tone: 'positive' | 'negative' | 'neutral';
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const palette = tone === 'positive'
    ? { bg: selected ? studio.accentSoft : '#fff', border: selected ? studio.accent : '#e2e8f0', color: studio.accentDark }
    : tone === 'negative'
      ? { bg: selected ? '#ffebee' : '#fff', border: selected ? studio.danger : '#e2e8f0', color: '#b71c1c' }
      : { bg: selected ? studio.accentSoft : '#fff', border: selected ? studio.accent : '#e2e8f0', color: '#0f172a' };

  return (
    <Button
      fullWidth
      size="small"
      disabled={disabled}
      onClick={onClick}
      sx={{
        py: 0.85,
        borderRadius: `${studio.radius.sm}px`,
        border: `1.5px solid ${palette.border}`,
        bgcolor: palette.bg,
        color: palette.color,
        fontWeight: 800,
        fontSize: '0.8rem',
        textTransform: 'none',
        minHeight: 36,
        boxShadow: selected ? studio.accentGlow : 'none',
        '&:hover': { bgcolor: palette.bg, borderColor: palette.border },
      }}
    >
      {label}
    </Button>
  );
}

export function StudioMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const color = tone === 'positive' ? studio.accentDark : tone === 'negative' ? '#b71c1c' : '#0f172a';
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 900, color, fontFamily: 'monospace', lineHeight: 1.2 }}>
        {value}
      </Typography>
    </Box>
  );
}

export function StudioStepDot({
  index,
  label,
  active,
  done,
  onClick,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
  onClick?: () => void;
}) {
  return (
    <Stack
      alignItems="center"
      spacing={0.35}
      onClick={onClick}
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        opacity: active || done ? 1 : 0.5,
        minWidth: 0,
        flex: '1 1 0',
      }}
    >
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 900,
          fontSize: '0.72rem',
          bgcolor: done ? studio.stepDone : active ? studio.stepActive : studio.stepIdle,
          color: done || active ? '#fff' : '#64748b',
          boxShadow: active ? studio.accentGlow : 'none',
        }}
      >
        {done ? <Check sx={{ fontSize: 14 }} /> : index + 1}
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: active ? 900 : 700,
          color: active ? studio.stepLabelActive : studio.stepLabel,
          fontSize: '0.65rem',
          lineHeight: 1,
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
}
