import { useState } from 'react';
import { Box, Button, Chip, InputAdornment, MenuItem, Switch, TextField, Tooltip, Typography } from '@mui/material';
import Lock from '@mui/icons-material/LockOutlined';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { createSetting, getSettingHistory, updateSetting } from '../../../api/core.api';
import { isOwnerOnlyKey, type SettingKind, type SettingMeta } from './settingsRegistry';
import { IconSave as Save } from '../../../icons/ecoIcons';

const WEEKDAY_CHIPS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_SECTION_DAYS = [true, true, true, true, true, true, false];

function isOn(value: unknown): boolean {
  return value === true || ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

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
  if (kind === 'switch') {
    return isOn(value) ? 'On' : 'Off';
  }
  if (kind === 'money') {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '';
  }
  if (kind === 'list') {
    return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }
  if (kind === 'date' || kind === 'text' || kind === 'readonly' || kind === 'html') {
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
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
  if (kind === 'text' || kind === 'html') {
    return { ok: true, value: kind === 'html' ? raw : raw.trim() };
  }
  if (kind === 'money') {
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0) return { ok: false, error: 'Enter dollars, 0 or more.' };
    return { ok: true, value: n.toFixed(2) };
  }
  if (kind === 'date') {
    const v = raw.trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: 'Pick a date, or leave it blank.' };
    return { ok: true, value: v };
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

/** Who changed it last, and Undo (puts back the value before the last change). */
function ChangedLine({ settingKey, kind, changedBy, changedAt }: { settingKey: string; kind: SettingKind; changedBy?: string | null; changedAt?: string | null }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const undo = async () => {
    try {
      const [last] = await getSettingHistory(settingKey);
      if (!last) {
        enqueueSnackbar('No earlier value on record.', { variant: 'info' });
        return;
      }
      const before = displayValue(kind, last.old_value) || 'blank';
      if (!window.confirm(`Put back ${before} (before ${last.changed_by || 'someone'}'s change)?`)) return;
      await updateSetting(settingKey, { value: last.old_value });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      enqueueSnackbar('Put back', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not undo', { variant: 'error' });
    }
  };
  if (!changedAt) return null;
  return (
    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
      Changed{changedBy ? ` by ${changedBy}` : ''}, {format(parseISO(changedAt), 'MMM d, yyyy')} ·{' '}
      <Box component="button" type="button" onClick={() => void undo()}
        sx={{ border: 0, p: 0, background: 'none', color: 'primary.main', cursor: 'pointer', font: 'inherit' }}>
        Undo
      </Box>
    </Typography>
  );
}

function Title({ settingKey, label }: { settingKey: string; label: string }) {
  return (
    <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {isOwnerOnlyKey(settingKey) ? (
        <Tooltip title="Only the owner changes this">
          <Lock sx={{ fontSize: 16, color: 'text.secondary' }} />
        </Tooltip>
      ) : null}
      {label}
    </Typography>
  );
}

const ROW_SX = (highlight?: boolean) => ({
  display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 2, py: 2, px: 1, mx: -1,
  borderBottom: '1px solid', borderColor: 'divider', borderRadius: 1,
  bgcolor: highlight ? 'action.selected' : undefined, transition: 'background-color 1s',
} as const);

/** A list of words or codes as chips: add with Enter, remove with the x. Saves at once. */
function ListEditor({ settingKey, value, meta }: { settingKey: string; value: unknown; meta: SettingMeta }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const items = Array.isArray(value) ? value.map(String) : [];
  const save = async (next: string[]) => {
    try {
      try {
        await updateSetting(settingKey, { value: next });
      } catch {
        await createSetting({ key: settingKey, value: next, description: meta.help });
      }
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch {
      enqueueSnackbar('Failed to save setting', { variant: 'error' });
    }
  };
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
      {items.map((item) => (
        <Chip key={item} size="small" label={item} onDelete={() => void save(items.filter((x) => x !== item))} />
      ))}
      <TextField
        size="small"
        placeholder="Add, then Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          const v = draft.trim();
          if (e.key === 'Enter' && v && !items.includes(v)) {
            void save([...items, v]);
            setDraft('');
          }
        }}
        sx={{ width: 160 }}
      />
    </Box>
  );
}

export function SettingRow({
  settingKey,
  value,
  description,
  meta,
  changedBy,
  changedAt,
  highlight,
}: {
  settingKey: string;
  value: unknown;
  description?: string;
  meta: SettingMeta;
  changedBy?: string | null;
  changedAt?: string | null;
  highlight?: boolean;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const anchor = `setting-${settingKey}`;
  const help = meta.help || description;

  if (meta.kind === 'readonly') {
    return (
      <Box id={anchor} sx={ROW_SX(highlight)}>
        <Box sx={{ flex: '1 1 200px' }}>
          <Title settingKey={settingKey} label={meta.label} />
          <Typography variant="body2" color="text.secondary">{help}</Typography>
        </Box>
        <Typography sx={{ flex: '1 1 240px', wordBreak: 'break-word' }}>{displayValue('text', value) || '-'}</Typography>
      </Box>
    );
  }

  if (meta.kind === 'list') {
    return (
      <Box id={anchor} sx={ROW_SX(highlight)}>
        <Box sx={{ flex: '1 1 200px' }}>
          <Title settingKey={settingKey} label={meta.label} />
          <Typography variant="body2" color="text.secondary">{help}</Typography>
          <ChangedLine settingKey={settingKey} kind={meta.kind} changedBy={changedBy} changedAt={changedAt} />
        </Box>
        <Box sx={{ flex: '1 1 240px' }}>
          <ListEditor settingKey={settingKey} value={value} meta={meta} />
        </Box>
      </Box>
    );
  }

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

  if (meta.kind === 'switch') {
    const on = isOn(value);
    const flip = async () => {
      const next = !on;
      if (next && !window.confirm(`Turn on "${meta.label}"? ${meta.help}`)) return;
      try {
        try {
          await updateSetting(settingKey, { value: next });
        } catch {
          await createSetting({ key: settingKey, value: next, description: meta.help });
        }
        queryClient.invalidateQueries({ queryKey: ['settings'] });
        enqueueSnackbar(next ? 'Turned on' : 'Turned off', { variant: 'success' });
      } catch {
        enqueueSnackbar('Failed to save setting', { variant: 'error' });
      }
    };
    return (
      <Box id={anchor} sx={ROW_SX(highlight)}>
        <Box sx={{ flex: '1 1 200px' }}>
          <Title settingKey={settingKey} label={meta.label} />
          <Typography variant="body2" color="text.secondary">
            {help}
          </Typography>
          <ChangedLine settingKey={settingKey} kind={meta.kind} changedBy={changedBy} changedAt={changedAt} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 240px' }}>
          <Switch checked={on} onChange={() => void flip()} inputProps={{ 'aria-label': meta.label }} />
          <Typography sx={{ fontWeight: 700, color: on ? 'success.main' : 'text.secondary' }}>{on ? 'On' : 'Off'}</Typography>
        </Box>
      </Box>
    );
  }

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
    <Box id={anchor} sx={ROW_SX(highlight)}>
      <Box sx={{ flex: '1 1 200px' }}>
        <Title settingKey={settingKey} label={meta.label} />
        <Typography variant="body2" color="text.secondary">
          {help}
        </Typography>
        <ChangedLine settingKey={settingKey} kind={meta.kind} changedBy={changedBy} changedAt={changedAt} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: meta.kind === 'html' ? 'flex-start' : 'center', gap: 1, flex: '1 1 240px', flexWrap: 'wrap' }}>
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
                label={asPercent ? 'Percent' : meta.kind === 'money' ? 'Dollars' : meta.kind === 'date' ? 'Date' : 'Value'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                sx={{ minWidth: 160, flex: 1 }}
                multiline={meta.kind === 'html'}
                minRows={meta.kind === 'html' ? 3 : undefined}
                InputLabelProps={meta.kind === 'date' ? { shrink: true } : undefined}
                InputProps={meta.kind === 'money' ? { startAdornment: <InputAdornment position="start">$</InputAdornment> } : undefined}
                type={meta.kind === 'date' ? 'date' : ['raw', 'text', 'html', 'ladder', 'severity_groups'].includes(meta.kind) ? 'text' : 'number'}
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
            {meta.kind === 'html' ? (
              <Box
                component="iframe"
                title={`${meta.label} preview`}
                sandbox=""
                srcDoc={displayValue('html', value)}
                sx={{ flex: 1, minWidth: 200, height: 90, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#fff' }}
              />
            ) : (
              <Typography variant="body1" sx={{ wordBreak: 'break-all', minWidth: 80 }}>
                {meta.kind === 'money' && shown ? `$${shown}` : shown || (meta.kind === 'date' ? 'Not set' : '')}
              </Typography>
            )}
            <Button size="small" onClick={startEdit}>
              Edit
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}
