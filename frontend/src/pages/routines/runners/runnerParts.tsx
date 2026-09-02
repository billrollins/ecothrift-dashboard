import { Box, Button, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import type { ReactNode } from 'react';
import { dutyColors, thinScrollSx } from '../../../components/duty/tokens';

export const runnerFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '10px',
    bgcolor: dutyColors.card,
    '& fieldset': { borderColor: dutyColors.ink15 },
    '&:hover fieldset': { borderColor: dutyColors.ink40 },
    '&.Mui-focused fieldset': { borderColor: dutyColors.brand, borderWidth: 1.5 },
  },
} as const;

/** The green cap every runner wears: what this is, and how far along it is. */
export function RunnerHead({
  title,
  subject,
  progress,
  progressLabel,
}: {
  title: string;
  subject: string;
  /** 0..1. */
  progress: number;
  progressLabel: string;
}) {
  const pct = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  return (
    <Box
      sx={{
        flex: '0 0 auto',
        background: `linear-gradient(160deg, #3d8b40 0%, ${dutyColors.brand} 58%, ${dutyColors.brandDark} 100%)`,
        color: '#fff',
        px: 2,
        pt: 1.75,
        pb: 1.5,
      }}
    >
      <Typography sx={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{title}</Typography>
      <Typography noWrap sx={{ fontSize: 12.5, color: 'rgba(255,255,255,0.62)', minHeight: 18 }}>
        {subject || ' '}
      </Typography>
      <Box sx={{ mt: 1.25 }}>
        <Box sx={{ height: 6, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
          <Box
            sx={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 999,
              background: 'linear-gradient(90deg, #C8E6C9 0%, #FFFFFF 100%)',
              transition: 'width 220ms ease',
            }}
          />
        </Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mt: 0.75,
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.66)',
          }}
        >
          <span>{progressLabel}</span>
          <span>{pct}%</span>
        </Box>
      </Box>
    </Box>
  );
}

export function RunnerBody({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ flex: 1, overflow: 'auto', pb: 1.5, ...thinScrollSx }}>{children}</Box>
  );
}

export function RunnerBand({ title, hint }: { title: string; hint?: string }) {
  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        bgcolor: dutyColors.paper,
        px: 2,
        pt: 1.75,
        pb: 0.75,
        mb: 0.75,
        borderBottom: `1px solid ${dutyColors.ink15}`,
      }}
    >
      <Typography
        sx={{
          fontSize: 11.5,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: dutyColors.ink60,
        }}
      >
        {title}
      </Typography>
      <Typography noWrap sx={{ fontSize: 11.5, color: dutyColors.ink40, minHeight: 16 }}>
        {hint || ' '}
      </Typography>
    </Box>
  );
}

export function RunnerCard({ children, tone }: { children: ReactNode; tone?: 'plain' | 'warn' | 'good' }) {
  const rail = tone === 'warn' ? dutyColors.red : tone === 'good' ? dutyColors.green : 'transparent';
  return (
    <Box
      sx={{
        mx: 1.25,
        mb: 0.75,
        px: 1.5,
        py: 1.25,
        bgcolor: dutyColors.card,
        border: `1px solid ${dutyColors.ink08}`,
        borderLeft: `4px solid ${rail}`,
        borderRadius: '10px',
      }}
    >
      {children}
    </Box>
  );
}

/**
 * One category, counted with the thumb. A stepper rather than a keyboard
 * because this is done standing in an aisle holding stock, and because the
 * number being small is the normal case.
 */
export function CounterRow({
  label,
  value,
  onChange,
  disabled,
  graded,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  /** Graded categories carry the score; the rest are recorded for the record. */
  graded?: boolean;
}) {
  const lit = value > 0;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mx: 1.25,
        mb: 0.5,
        pl: 1.5,
        pr: 0.75,
        py: 0.75,
        minHeight: 56,
        bgcolor: dutyColors.card,
        border: `1px solid ${lit ? dutyColors.ink15 : dutyColors.ink08}`,
        borderLeft: `4px solid ${lit ? (graded ? dutyColors.amberBg : dutyColors.blue) : 'transparent'}`,
        borderRadius: '10px',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.3, color: dutyColors.ink }}>
        {label}
      </Typography>
      <StepButton label={`One fewer ${label}`} disabled={disabled || value <= 0} onClick={() => onChange(value - 1)}>
        <RemoveRounded sx={{ fontSize: 18 }} />
      </StepButton>
      <Typography
        sx={{
          width: 30,
          textAlign: 'center',
          fontSize: 17,
          fontWeight: 700,
          color: lit ? dutyColors.ink : dutyColors.ink40,
        }}
      >
        {value}
      </Typography>
      <StepButton label={`One more ${label}`} disabled={disabled} onClick={() => onChange(value + 1)}>
        <AddRounded sx={{ fontSize: 18 }} />
      </StepButton>
    </Box>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      sx={{
        width: 40,
        height: 40,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: '10px',
        border: `1.5px solid ${dutyColors.ink15}`,
        bgcolor: dutyColors.card,
        color: dutyColors.ink60,
        '&:hover': disabled ? {} : { borderColor: dutyColors.brand, color: dutyColors.brandDark },
        '&:disabled': { color: dutyColors.ink15, borderColor: dutyColors.ink08 },
      }}
    >
      {children}
    </Box>
  );
}

export function FlagChips({
  options,
  active,
  onToggle,
  disabled,
}: {
  options: Array<{ key: string; label: string }>;
  active: string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mx: 1.25, mb: 0.75 }}>
      {options.map((option) => {
        const on = active.includes(option.key);
        return (
          <Box
            key={option.key}
            component="button"
            type="button"
            disabled={disabled}
            onClick={() => onToggle(option.key)}
            sx={{
              px: 1.5,
              height: 36,
              font: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              cursor: disabled ? 'default' : 'pointer',
              borderRadius: 999,
              border: `1.5px solid ${on ? dutyColors.red : dutyColors.ink15}`,
              bgcolor: on ? '#FBE9E6' : dutyColors.card,
              color: on ? dutyColors.red : dutyColors.ink60,
            }}
          >
            {option.label}
          </Box>
        );
      })}
    </Box>
  );
}

/** A wide shot of the section. On an audit it is the gate; nothing unlocks first. */
export function PhotoButton({
  photo,
  onPhoto,
  disabled,
  label = 'Photo of the section',
}: {
  photo: string | null;
  onPhoto: (dataUrl: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Button
      component="label"
      disabled={disabled}
      startIcon={<CameraAltOutlined />}
      sx={{
        mx: 1.25,
        mb: 0.75,
        height: 52,
        width: 'calc(100% - 20px)',
        borderRadius: '10px',
        border: `1.5px ${photo ? 'solid' : 'dashed'} ${photo ? dutyColors.green : dutyColors.ink40}`,
        color: photo ? dutyColors.green : dutyColors.ink60,
        bgcolor: photo ? '#F1F8F4' : dutyColors.card,
        fontWeight: 700,
      }}
    >
      {photo ? 'Photo taken · tap to replace' : label}
      <input
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onPhoto(String(reader.result || ''));
          reader.readAsDataURL(file);
        }}
      />
    </Button>
  );
}

export function NotesField({
  value,
  onChange,
  disabled,
  placeholder = 'Anything worth saying',
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Box sx={{ mx: 1.25, mb: 1 }}>
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        multiline
        minRows={2}
        fullWidth
        size="small"
        sx={runnerFieldSx}
      />
    </Box>
  );
}
