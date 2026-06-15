import type { ReactNode } from 'react';
import {
  Box,
  Chip,
  Divider,
  Typography,
} from '@mui/material';
import { processingTokens } from '../processing/processingTokens';

const headerSurface = '#ffffff';
const headerSubtle = '#f6f8f6';
const borderSubtle = '#dfe7df';
const editorSurface = '#fbfcfb';

export interface WorkbenchDetailShellProps {
  title: string;
  subhead: string;
  identityLabel: string;
  identityTone?: 'new' | 'existing';
  onIdentityClick?: () => void;
  /** Optional action above the identity chip (top-right), e.g. product scope link. */
  headerAction?: ReactNode;
  stats?: ReactNode;
  statusStrip?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Tighter header/content padding for dense detail panes (check-in). */
  compact?: boolean;
}

export function WorkbenchDetailShell({
  title,
  subhead,
  identityLabel,
  identityTone = 'existing',
  onIdentityClick,
  headerAction,
  stats,
  statusStrip,
  toolbar,
  children,
  footer,
  compact = false,
}: WorkbenchDetailShellProps) {
  const isNew = identityTone === 'new';

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: editorSurface,
      }}
    >
      <Box sx={{ flexShrink: 0, bgcolor: headerSurface, borderBottom: 1, borderColor: borderSubtle }}>
        <Box
          sx={{
            px: compact ? 1.75 : 2.75,
            pt: compact ? 1.1 : 1.75,
            pb: compact ? 0.85 : 1.25,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant={compact ? 'subtitle1' : 'h6'}
              sx={{ fontWeight: 800, color: processingTokens.textStrong, lineHeight: 1.2 }}
            >
              {title}
            </Typography>
            {!compact ?
              <Typography variant="caption" sx={{ display: 'block', mt: 0.35, color: processingTokens.textMute }}>
                {subhead}
              </Typography>
            : null}
          </Box>
          <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
            {headerAction}
            <Chip
            size="small"
            label={identityLabel}
            variant={isNew ? 'filled' : 'outlined'}
            color={isNew ? 'primary' : 'default'}
            clickable={Boolean(onIdentityClick)}
            onClick={onIdentityClick}
            sx={{
              flexShrink: 0,
              height: 22,
              fontFamily: processingTokens.monoFontFamily,
              fontWeight: 800,
              fontSize: '0.72rem',
              letterSpacing: 0.4,
              ...(isNew ? {} : {
                borderColor: borderSubtle,
                color: processingTokens.textSoft,
                bgcolor: headerSubtle,
                ...(onIdentityClick ? { cursor: 'pointer' } : {}),
              }),
            }}
          />
          </Box>
        </Box>

        {stats ?
          <Box
            sx={{
              display: 'flex',
              width: '100%',
              overflowX: 'auto',
              bgcolor: headerSubtle,
              borderTop: 1,
              borderColor: borderSubtle,
              px: compact ? 1 : 1.25,
              py: compact ? 0.65 : 1,
              gap: 0.75,
            }}
          >
            {stats}
          </Box>
        : null}

        {statusStrip}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: compact ? 'hidden' : 'auto', px: compact ? 1.75 : 2.75, py: compact ? 0.85 : 1.75, bgcolor: editorSurface }}>
        {toolbar ?
          <Box sx={{ mb: 1.25 }}>{toolbar}</Box>
        : null}
        {children}
      </Box>

      {footer ?
        <>
          <Divider />
          <Box
            sx={{
              flexShrink: 0,
              px: compact ? 1.75 : 2.75,
              py: compact ? 0.85 : 1.15,
              bgcolor: headerSurface,
              borderTop: 1,
              borderColor: borderSubtle,
            }}
          >
            {footer}
          </Box>
        </>
      : null}
    </Box>
  );
}

export const workbenchDetailTokens = {
  headerSurface,
  headerSubtle,
  borderSubtle,
  editorSurface,
  formSection: {
    p: 2,
    border: 1,
    borderColor: borderSubtle,
    borderRadius: 2,
    bgcolor: headerSurface,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
    gap: 1.5,
    alignItems: 'start',
  },
  compactField: {
    '& .MuiInputBase-root': { fontSize: '0.875rem', bgcolor: '#fff' },
    '& .MuiInputLabel-root': { fontSize: '0.8125rem', color: processingTokens.textMute },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: borderSubtle },
  },
} as const;
