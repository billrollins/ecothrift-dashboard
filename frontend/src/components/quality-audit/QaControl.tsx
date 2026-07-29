import { useRef } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
} from '@mui/material';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ThumbDownAltIcon from '@mui/icons-material/ThumbDown';
import DoNotDisturbIcon from '@mui/icons-material/DoNotDisturbAlt';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MicIcon from '@mui/icons-material/Mic';
import type { ChangeEvent } from 'react';
import type {
  QaConfidence,
  QaControlKind,
  QaPriority,
  QaSeverity,
  QualityAuditCheck,
} from '../../types/qualityAudit.types';

export type CheckPatch = Partial<QualityAuditCheck> & { result?: QualityAuditCheck['result'] };

interface QaControlProps {
  check: QualityAuditCheck;
  onChange: (patch: CheckPatch) => void;
  compact?: boolean;
}

const EMOJIS = ['😡', '😞', '😐', '🙂', '😄'];

function touchSx(extra?: object): object {
  return { minHeight: 44, textTransform: 'none', fontWeight: 700, ...extra };
}

function tryDictate(onText: (text: string) => void) {
  interface Constructable {
    new (): { start(): void; onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null };
  }
  const W = typeof window !== 'undefined' ? (window as unknown as { SpeechRecognition?: Constructable }) : null;
  const SR = W?.SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: Constructable }).webkitSpeechRecognition;
  if (!SR) return;
  const rec = new SR();
  rec.onresult = (ev) => {
    const text = ev.results?.[0]?.[0]?.transcript ?? '';
    if (text.trim()) onText(text.trim());
  };
  rec.start();
}

export function QaControl({ check, onChange, compact }: QaControlProps) {
  const control = (check.control || 'yesno') as QaControlKind;
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (control === 'yesno') {
    return (
      <Segmented
        value={check.result || ''}
        options={[
          { value: 'pass', label: 'Yes' },
          { value: 'fail', label: 'No' },
          { value: 'na', label: 'N/A' },
        ]}
        colorFor={(v) => (v === 'pass' ? 'success' : v === 'fail' ? 'error' : 'inherit')}
        onChange={(v) => onChange({ result: v as QualityAuditCheck['result'] })}
        compact={compact}
      />
    );
  }

  if (control === 'toggle') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {check.result === 'pass' ? 'Compliant' : check.result === 'fail' ? 'Not compliant' : 'Mark compliance'}
        </Typography>
        <Switch
          checked={check.result === 'pass'}
          onChange={(_, checked) => onChange({ result: checked ? 'pass' : 'fail' })}
          color="success"
          sx={{ '& .MuiSwitch-switchBase': { padding: 1 } }}
        />
      </Box>
    );
  }

  if (control === 'thumbs') {
    return (
      <Stack direction="row" spacing={1}>
        <IconChoice active={check.result === 'pass'} color="success" onClick={() => onChange({ result: 'pass' })} label="Good">
          <ThumbUpAltIcon />
        </IconChoice>
        <IconChoice active={check.result === 'fail'} color="error" onClick={() => onChange({ result: 'fail' })} label="Bad">
          <ThumbDownAltIcon />
        </IconChoice>
        <IconChoice active={check.result === 'na'} color="inherit" onClick={() => onChange({ result: 'na' })} label="Skip">
          <DoNotDisturbIcon />
        </IconChoice>
      </Stack>
    );
  }

  if (control === 'rating' || control === 'emoji') {
    const rating = check.rating ?? 0;
    return (
      <Stack direction="row" spacing={compact ? 0.5 : 1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= rating;
          if (control === 'emoji') {
            return (
              <Button
                key={n}
                onClick={() => onChange({ rating: n })}
                variant={active ? 'contained' : 'outlined'}
                sx={touchSx({ minWidth: 48, px: 0, fontSize: '1.4rem', borderColor: 'divider' })}
              >
                {EMOJIS[n - 1]}
              </Button>
            );
          }
          return (
            <IconButton
              key={n}
              onClick={() => onChange({ rating: n })}
              sx={{ color: active ? 'warning.main' : 'text.disabled' }}
              size={compact ? 'small' : 'medium'}
            >
              {active ? <StarIcon /> : <StarBorderIcon />}
            </IconButton>
          );
        })}
      </Stack>
    );
  }

  if (control === 'severity') {
    const options: Array<{ value: QaSeverity; label: string; color: 'success' | 'warning' | 'error' | 'inherit' }> = [
      { value: 'none', label: 'OK', color: 'success' },
      { value: 'minor', label: 'Minor', color: 'inherit' },
      { value: 'major', label: 'Major', color: 'warning' },
      { value: 'critical', label: 'Critical', color: 'error' },
    ];
    return (
      <Segmented
        value={check.severity || ''}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        colorFor={(v) => options.find((o) => o.value === v)?.color ?? 'inherit'}
        onChange={(v) => onChange({ severity: v as QaSeverity })}
        compact={compact}
      />
    );
  }

  if (control === 'slider') {
    const score = check.score ?? 50;
    const label = score >= 80 ? 'Great' : score >= 65 ? 'OK' : score >= 50 ? 'Fair' : 'Poor';
    return (
      <Box>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="body2" fontWeight={700}>{score}/100</Typography>
        </Stack>
        <Slider
          value={score}
          min={0}
          max={100}
          step={5}
          onChange={(_, v) => onChange({ score: v as number })}
          valueLabelDisplay="auto"
          color={score >= 80 ? 'success' : score <= 50 ? 'error' : 'warning'}
        />
      </Box>
    );
  }

  if (control === 'chips') {
    const tags = check.tags || [];
    const options = check.options || [];
    const noIssues = Boolean(check.touched) && tags.length === 0;
    return (
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ rowGap: 0.75 }}>
        <Chip
          label="No issues"
          color={noIssues ? 'success' : 'default'}
          variant={noIssues ? 'filled' : 'outlined'}
          onClick={() => onChange({ touched: true, tags: [] })}
          sx={{ minHeight: 36 }}
        />
        {options.map((opt) => {
          const active = tags.includes(opt);
          return (
            <Chip
              key={opt}
              label={opt}
              color={active ? 'error' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              onClick={() =>
                onChange({
                  touched: true,
                  tags: active ? tags.filter((t) => t !== opt) : [...tags, opt],
                })
              }
              sx={{ minHeight: 36 }}
            />
          );
        })}
      </Stack>
    );
  }

  if (control === 'counter') {
    const count = check.count ?? 0;
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <Button variant="outlined" onClick={() => onChange({ count: Math.max(0, count - 1) })} sx={touchSx({ minWidth: 48 })}>
          −
        </Button>
        <Typography variant="h6" sx={{ minWidth: 32, textAlign: 'center' }} fontWeight={800}>
          {count}
        </Typography>
        <Button variant="outlined" onClick={() => onChange({ count: count + 1 })} sx={touchSx({ minWidth: 48 })}>
          +
        </Button>
      </Stack>
    );
  }

  if (control === 'zone') {
    const options = check.options || [];
    return (
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ rowGap: 0.75 }}>
        {options.map((opt) => {
          const active = check.zone === opt;
          return (
            <Chip
              key={opt}
              label={opt}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              onClick={() => onChange({ zone: active ? null : opt })}
              sx={{ minHeight: 36 }}
            />
          );
        })}
      </Stack>
    );
  }

  if (control === 'photo') {
    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => onChange({ photo: String(reader.result), result: 'pass', touched: true });
            reader.readAsDataURL(file);
          }}
        />
        <Button
          variant="outlined"
          startIcon={<PhotoCameraIcon />}
          onClick={() => fileRef.current?.click()}
          sx={touchSx({})}
        >
          {check.photo ? 'Retake' : 'Capture'}
        </Button>
        <Button
          variant={check.result === 'na' ? 'contained' : 'outlined'}
          onClick={() => onChange({ photo: null, result: 'na', touched: true })}
          sx={touchSx({})}
        >
          N/A
        </Button>
        {check.photo ? (
          <Box sx={{ position: 'relative' }}>
            <Box
              component="img"
              src={check.photo}
              alt="audit"
              sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 1.5, border: 1, borderColor: 'divider' }}
            />
            <IconButton
              size="small"
              onClick={() => onChange({ photo: null, result: '', touched: false })}
              sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper' }}
            >
              <DeleteOutlineIcon fontSize="small" color="error" />
            </IconButton>
          </Box>
        ) : null}
      </Stack>
    );
  }

  if (control === 'confidence') {
    const options: Array<{ value: QaConfidence; label: string }> = [
      { value: 'high', label: 'High' },
      { value: 'med', label: 'Medium' },
      { value: 'low', label: 'Low' },
    ];
    return (
      <Segmented
        value={check.confidence || ''}
        options={options}
        colorFor={(v) => (v === 'high' ? 'success' : v === 'low' ? 'warning' : 'inherit')}
        onChange={(v) => onChange({ confidence: v as QaConfidence })}
        compact={compact}
      />
    );
  }

  if (control === 'priority') {
    const options: Array<{ value: QaPriority; label: string; color: 'inherit' | 'warning' | 'error' }> = [
      { value: 'low', label: 'Low', color: 'inherit' },
      { value: 'med', label: 'Medium', color: 'inherit' },
      { value: 'high', label: 'High', color: 'warning' },
      { value: 'urgent', label: 'Urgent', color: 'error' },
    ];
    return (
      <Segmented
        value={check.priority || ''}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        colorFor={(v) => options.find((o) => o.value === v)?.color ?? 'inherit'}
        onChange={(v) => onChange({ priority: v as QaPriority })}
        compact={compact}
      />
    );
  }

  if (control === 'comment') {
    return (
      <Box>
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          placeholder="Type or dictate notes…"
          value={check.comment || ''}
          onChange={(e) => onChange({ comment: e.target.value })}
        />
        <Button
          size="small"
          startIcon={<MicIcon />}
          onClick={() => tryDictate((text) => onChange({ comment: (check.comment ? `${check.comment} ` : '') + text }))}
          sx={{ mt: 0.5 }}
        >
          Dictate
        </Button>
      </Box>
    );
  }

  if (control === 'grade') {
    return (
      <Segmented
        value={check.letter || ''}
        options={['A', 'B', 'C', 'D', 'F'].map((l) => ({ value: l, label: l }))}
        colorFor={(v) => (['A', 'B', 'C'].includes(v as string) ? 'success' : 'error')}
        onChange={(v) => onChange({ letter: v as string })}
        compact={compact}
      />
    );
  }

  return null;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function SegedColor(color: string): 'success' | 'error' | 'warning' | 'inherit' {
  return color as 'success' | 'error' | 'warning' | 'inherit';
}

function Segmented({
  value,
  options,
  colorFor,
  onChange,
  compact,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  colorFor: (value: string) => string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <ToggleButtonGroup
      exclusive
      value={value}
      size={compact ? 'small' : 'medium'}
      sx={{ flexWrap: 'wrap', width: '100%', '& .MuiToggleButtonGroup-grouped': { minHeight: 44, flex: 1, minWidth: 64, borderColor: 'divider' } }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        const color = SegedColor(colorFor(opt.value) || 'inherit');
        return (
          <ToggleButton
            key={opt.value}
            value={opt.value}
            onClick={() => onChange(opt.value)}
            sx={{
              color: active ? `${color}.main` : 'text.secondary',
              borderColor: active ? alpha('#000', 0.0) : 'divider',
              bgcolor: active ? alpha('#000', 0.04) : 'transparent',
              fontWeight: 700,
            }}
          >
            {opt.label}
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}

function IconChoice({
  active,
  color,
  onClick,
  label,
  children,
}: {
  active: boolean;
  color: 'success' | 'error' | 'inherit';
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? 'contained' : 'outlined'}
      color={active ? color : 'inherit'}
      onClick={onClick}
      sx={touchSx({ flex: 1, flexDirection: 'column', gap: 0.5 })}
    >
      {children}
      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'none' }}>
        {label}
      </Typography>
    </Button>
  );
}
