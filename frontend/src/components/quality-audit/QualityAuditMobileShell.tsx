import {
  Avatar,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import type { ReactNode } from 'react';
import { QaGradeRing } from './QaGradeRing';

interface QualityAuditMobileShellProps {
  title: string;
  intro?: string;
  auditorName: string;
  startedAt: string;
  step: number;
  stepLabels: string[];
  completionPct: number;
  liveGrade: string;
  passRate: number;
  sectionComplete: boolean[];
  onJumpStep: (step: number) => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Draft autosave status shown next to the auditor line. */
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
}

function formatStartedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function QualityAuditMobileShell({
  title,
  intro,
  auditorName,
  startedAt,
  step,
  stepLabels,
  completionPct,
  liveGrade,
  passRate,
  sectionComplete,
  onJumpStep,
  children,
  footer,
  saveStatus = 'idle',
}: QualityAuditMobileShellProps) {
  const sectionLabels = stepLabels.slice(0, stepLabels.length - 1);
  const saveLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'Saved'
        : saveStatus === 'error'
          ? 'Save failed'
          : null;

  return (
    <Box
      sx={{
        mx: { xs: -1, sm: 0 },
        mb: { xs: -2, sm: 0 },
        minHeight: { xs: 'calc(100dvh - 116px)', md: 'auto' },
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      {/* Hero */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          color: '#f8fbf5',
          background: 'linear-gradient(135deg, #2f67ad 0%, #243460 100%)',
          px: 2,
          pt: 2,
          pb: 1.5,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
          <QaGradeRing
            grade={liveGrade}
            value={completionPct / 100}
            size={64}
            sublabel={`${completionPct}%`}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.1 }} noWrap>
              {title}
            </Typography>
            {intro ? (
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.82)', mt: 0.25 }} noWrap>
                {intro}
              </Typography>
            ) : null}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
              <Avatar sx={{ width: 22, height: 22, fontSize: 12, bgcolor: 'rgba(255,255,255,0.18)' }}>
                {initials(auditorName)}
              </Avatar>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                {auditorName || '—'} · {formatStartedAt(startedAt)}
              </Typography>
              {saveLabel ? (
                <Typography
                  variant="caption"
                  sx={{
                    color: saveStatus === 'error' ? '#ffb4ab' : 'rgba(255,255,255,0.75)',
                    fontWeight: 700,
                  }}
                >
                  · {saveLabel}
                </Typography>
              ) : null}
            </Stack>
          </Box>
        </Stack>
      </Box>

      {/* Section rail */}
      <Box
        sx={{
          display: 'flex',
          gap: 0.75,
          overflowX: 'auto',
          px: 1.5,
          py: 1,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          WebkitOverflowScrolling: 'touch',
          '::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {sectionLabels.map((label, idx) => {
          const active = step === idx;
          const done = sectionComplete[idx];
          return (
            <Chip
              key={label}
              size="small"
              label={label}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              onClick={() => onJumpStep(idx)}
              icon={
                done ? (
                  <CheckCircleIcon sx={{ fontSize: 16 }} />
                ) : (
                  <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />
                )
              }
              sx={{ flexShrink: 0, fontWeight: 600 }}
            />
          );
        })}
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: 'auto', px: { xs: 1.5, sm: 2 }, py: 2 }}>{children}</Box>

      {/* Sticky footer */}
      {footer ? (
        <Paper
          square
          elevation={8}
          sx={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            px: 2,
            py: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            zIndex: 2,
            paddingBottom: 'calc(1.5 * 8px + env(safe-area-inset-bottom))',
          }}
        >
          {footer}
        </Paper>
      ) : null}
    </Box>
  );
}

export function QualityAuditSectionNav() {
  return null;
}

export function QaBackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button startIcon={<ArrowBackIcon />} onClick={onClick} sx={{ minHeight: 44 }}>
      Back
    </Button>
  );
}
