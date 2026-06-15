import type { ReactNode } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { processingTokens } from '../processing/processingTokens';
import { workbenchDetailTokens } from './WorkbenchDetailShell';

function StatTooltip({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ p: 0.25, maxWidth: 320 }}>
      {children}
    </Box>
  );
}

export interface WorkbenchStatCellProps {
  label: string;
  value?: string;
  helper?: string;
  mono?: boolean;
  tone?: 'default' | 'good' | 'warning' | 'muted';
  tooltip?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
  /** Override flex sizing in stat rows (default `1 1 132px`). */
  flex?: string;
  minWidth?: number;
}

export function WorkbenchStatCell({
  label,
  value,
  helper,
  mono,
  tone = 'default',
  tooltip,
  onClick,
  children,
  flex = '1 1 132px',
  minWidth = 126,
}: WorkbenchStatCellProps) {
  const valueColor =
    tone === 'warning'
      ? processingTokens.accentAmber
      : tone === 'good'
        ? processingTokens.primaryDark
        : tone === 'muted'
          ? processingTokens.textMute
          : processingTokens.textStrong;

  const cell = (
    <Box
      sx={{
        flex,
        minWidth,
        px: 1.5,
        py: 1,
        border: 1,
        borderColor: workbenchDetailTokens.borderSubtle,
        borderRadius: 1.5,
        bgcolor: workbenchDetailTokens.headerSurface,
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.035)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
        '&:hover': onClick
          ? {
              borderColor: processingTokens.primary,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.10)',
              transform: 'translateY(-1px)',
            }
          : undefined,
      }}
      onClick={onClick}
    >
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: processingTokens.textMute,
          fontSize: '0.625rem',
          fontWeight: 800,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          lineHeight: 1.1,
        }}
      >
        {label}
      </Typography>
      {children ?? (
        <Typography
          noWrap
          sx={{
            mt: 0.45,
            fontSize: '0.9375rem',
            fontWeight: 800,
            lineHeight: 1.2,
            color: valueColor,
            fontFamily: mono ? processingTokens.monoFontFamily : undefined,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </Typography>
      )}
      {helper ?
        <Typography
          variant="caption"
          noWrap
          sx={{ display: 'block', mt: 0.25, color: processingTokens.textMute, fontSize: '0.6875rem', lineHeight: 1.15 }}
        >
          {helper}
        </Typography>
      : null}
    </Box>
  );

  if (!tooltip) return cell;
  return (
    <Tooltip title={<StatTooltip>{tooltip}</StatTooltip>} enterDelay={400} placement="bottom-start">
      {cell}
    </Tooltip>
  );
}

export function truncateText(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}
