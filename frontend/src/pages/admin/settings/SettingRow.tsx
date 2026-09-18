import { useState } from 'react';
import { Box, Button, Chip, MenuItem, TextField, Typography } from '@mui/material';
import Save from '@mui/icons-material/Save';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { createSetting, updateSetting } from '../../../api/core.api';
import type { SettingKind, SettingMeta } from './settingsRegistry';

const WEEKDAY_CHIPS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_SECTION_DAYS = [true, true, true, true, true, true, false];

function displayValue(kind: SettingKind, value: unknown): string {
  if (kind === 'percent' || kind === 'weight') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return String(Math.round(n * 1000) / 10);
  }
  if (kind === 'raw' || kind === 'ladder' || kind === 'severity_groups') {
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
  }
  if (kind === 'weekday') {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? days[n] : String(value ?? '');
  }
  if (kind === 'weekdays') {
    const flags = Array.isArray(value) ? value : DEFAULT_SECTION_DAYS;
    return WEEKDAY_CHIPS.filter((_, index) => flags[index]).join(', ') || 'None';
  }
  return String(value ?? '');
}

function parseEdit(kind: SettingKind, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (kind === 'days') {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 1 || n > 3650) {
      return { ok: false, error: 'Enter a whole number from 1 to 3650.' };
    }
    return { ok: true, value: n };
  }
  if (kind === 'minutes') {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 5 || n > 120) {
      return { ok: false, error: 'Enter a whole number from 5 to 120.' };
    }
    return { ok: true, value: n };
  }
  if (kind === 'fraction') {
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0 || n >= 1) {
      return { ok: false, error: 'Enter a number between 0 and 1 (exclusive of 1).' };
    }
    return { ok: true, value: n };
  }
  if (kind === 'percent') {
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0 || n > 50) {
      return { ok: false, error: 'Enter a percent from 0 to 50.' };
    }
    return { ok: true, value: Math.round(n * 10) / 1000 };
  }
  if (kind === 'weight') {
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      return { ok: false, error: 'Enter a percent from 0 to 100.' };
    }
    return { ok: true, value: Math.round(n * 10) / 1000 };
  }
  if (kind === 'score') {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      return { ok: false, error: 'Enter a whole score from 0 to 100.' };
    }
    return { ok: true, value: n };
  }
  if (kind === 'count') {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0 || n > 999) {
      return { ok: false, error: 'Enter a whole number from 0 to 999.' };
    }
    return { ok: true, value: n };
  }
  if (kind === 'tail') {
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n <= 0 || n >= 1) {
      return { ok: false, error: 'Enter a probability between 0 and 1, not including the ends.' };
    }
    return { ok: true, value: n };
  }
  if (kind === 'weekday') {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0 || n > 6) {
      return { ok: false, error: 'Enter 0 (Monday) through 6 (Sunday).' };
    }
    return { ok: true, value: n };
  }
  if (kind === 'seconds') {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 1 || n > 3600) {
      return { ok: false, error: 'Enter seconds from 1 to 3600.' };
    }
    return { ok: true, value: n };
  }
  if (kind === 'ratio') {
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < -10 || n > 10) {
      return { ok: false, error: 'Enter a number from -10 to 10.' };
    }
    return { ok: true, value: n };
  }
  if (kind === 'ladder' || kind === 'severity_groups') {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { ok: false, error: 'Must be a list.' };
      return { ok: true, value: parsed };
    } catch {
      return { ok: false, error: 'JSON is not valid.' };
    }
  }
  if (kind === 'raw') {
    const trimmed = raw.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return { ok: true, value: JSON.parse(trimmed) };
      } catch {
        return { ok: false, error: 'JSON is not valid.' };
      }
    }
    return { ok: true, value: raw };
  }
  return { ok: true, value: raw };
}

export function SettingRow({
  settingKey,
  value,
  description,
  meta,
}: {
  settingKey: string;
  value: unknown;
  description?: string;
  meta: SettingMeta;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEdit = () => {
    setEditValue(meta.kind === 'weekday' ? String(value ?? 1) : displayValue(meta.kind, value));
    setEditing(true);
  };

  const save = async () => {
    const parsed = parseEdit(meta.kind, editValue);
    if (!parsed.ok) {
      enqueueSnackbar(parsed.error, { variant: 'warning' });
      return;
    }
    try {
      await updateSetting(settingKey, { value: parsed.value });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      enqueueSnackbar('Setting saved', { variant: 'success' });
      setEditing(false);
    } catch {
      enqueueSnackbar('Failed to save setting', { variant: 'error' });
    }
  };

  const asPercent = meta.kind === 'percent' || meta.kind === 'weight';
  const shown = asPercent ? `${displayValue(meta.kind, value)}%` : displayValue(meta.kind, value);

  if (meta.kind === 'weekdays') {
    const flags = (Array.isArray(value) && value.length === 7 ? value : DEFAULT_SECTION_DAYS).map(Boolean);
    const saveDays = async (next: boolean[]) => {
      try {
        try {
          await updateSetting(settingKey, { value: next });
        } catch {
          await createSetting({ key: settingKey, value: next, description: meta.help });
        }
        queryClient.invalidateQueries({ queryKey: ['settings'] });
        enqueueSnackbar('Setting saved', { variant: 'success' });
      } catch {
        enqueueSnackbar('Failed to save setting', { variant: 'error' });
      }
    };
    return (
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: 2,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ flex: '1 1 200px' }}>
          <Typography variant="subtitle1">{meta.label}</Typography>
          <Typography variant="body2" color="text.secondary">
            {description || meta.help}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, flex: '1 1 240px' }}>
          {WEEKDAY_CHIPS.map((label, index) => (
            <Chip
              key={label}
              label={label}
              size="small"
              color={flags[index] ? 'primary' : 'default'}
              variant={flags[index] ? 'filled' : 'outlined'}
              onClick={() => {
                const next = flags.map((on, day) => (day === index ? !on : on));
                void saveDays(next);
              }}
            />
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 2,
        py: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ flex: '1 1 200px' }}>
        <Typography variant="subtitle1">{meta.label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {description || meta.help}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 240px' }}>
        {editing ? (
          <>
            {meta.kind === 'weekday' ? (
              <TextField
                select
                size="small"
                label="Weekday"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                sx={{ minWidth: 160, flex: 1 }}
              >
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => (
                  <MenuItem key={day} value={String(index)}>{day}</MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                size="small"
                label={asPercent ? 'Percent' : 'Value'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                sx={{ minWidth: 160, flex: 1 }}
                type={meta.kind === 'raw' || meta.kind === 'ladder' || meta.kind === 'severity_groups' ? 'text' : 'number'}
              />
            )}
            <Button size="small" variant="contained" startIcon={<Save />} onClick={() => void save()}>
              Save
            </Button>
            <Button size="small" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Typography variant="body1" sx={{ wordBreak: 'break-all', minWidth: 80 }}>
              {shown}
            </Typography>
            <Button size="small" onClick={startEdit}>
              Edit
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}
