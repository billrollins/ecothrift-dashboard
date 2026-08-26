import { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import Save from '@mui/icons-material/Save';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { updateSetting } from '../../../api/core.api';
import type { SettingKind, SettingMeta } from './settingsRegistry';

function displayValue(kind: SettingKind, value: unknown): string {
  if (kind === 'percent') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return String(Math.round(n * 1000) / 10);
  }
  if (kind === 'raw') {
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
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
    setEditValue(displayValue(meta.kind, value));
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

  const shown = meta.kind === 'percent' ? `${displayValue(meta.kind, value)}%` : displayValue(meta.kind, value);

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
            <TextField
              size="small"
              label={meta.kind === 'percent' ? 'Percent' : 'Value'}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              sx={{ minWidth: 160, flex: 1 }}
              type={meta.kind === 'raw' ? 'text' : 'number'}
            />
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
