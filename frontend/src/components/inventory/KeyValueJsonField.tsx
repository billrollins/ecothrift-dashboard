import Add from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import EditOutlined from '@mui/icons-material/EditOutlined';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  draftRowsToIdentifiers,
  identifierLabel,
  identifiersDisplayOrder,
  identifiersToDraftRows,
  newIdentifierDraftRow,
  normalizeIdentifiersObject,
  validateIdentifierDraftRows,
  type IdentifierDraftRow,
} from '../../pages/inventory/processing/processingIdentifiers';

export const SPECIFICATION_PRESET_KEYS = [
  'color',
  'size',
  'weight',
  'dimensions',
  'material',
  'capacity',
  'voltage',
  'wattage',
] as const;

function normalizeSpecObject(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    const normKey = key.trim().toLowerCase().replace(/[\s-]+/g, '_').slice(0, 64);
    const normVal = String(val ?? '').trim();
    if (!normKey || !normVal) continue;
    out[normKey] = normVal;
  }
  return out;
}

function specsToDraftRows(raw: Record<string, unknown> | null | undefined): IdentifierDraftRow[] {
  const normalized = normalizeSpecObject(raw);
  const keys = Object.keys(normalized).sort((a, b) => a.localeCompare(b));
  return keys.map((key, idx) => ({
    id: `spec-${idx}-${key}`,
    key,
    value: normalized[key] ?? '',
  }));
}

function draftRowsToSpecObject(rows: IdentifierDraftRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim().toLowerCase().replace(/[\s-]+/g, '_').slice(0, 64);
    const value = row.value.trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

function specLabel(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSummary(
  value: Record<string, unknown>,
  presetLabels: Record<string, string>,
  emptyLabel: string,
): string {
  const norm = normalizeIdentifiersObject(value);
  const keys = Object.keys(norm);
  if (!keys.length) return emptyLabel;
  if (keys.length === 1) {
    const key = keys[0];
    const label = presetLabels[key] || identifierLabel(key) || specLabel(key);
    return `${label}: ${norm[key]}`;
  }
  return `${keys.length} entries`;
}

interface KeyValueHoverLine {
  label: string;
  value: string;
}

function buildHoverLines(
  value: Record<string, unknown>,
  presetKeyLabels: Record<string, string>,
  mode: 'identifiers' | 'specifications',
): KeyValueHoverLine[] {
  const norm = mode === 'identifiers' ? normalizeIdentifiersObject(value) : normalizeSpecObject(value);
  const keys = mode === 'identifiers'
    ? identifiersDisplayOrder(Object.keys(norm))
    : Object.keys(norm).sort((a, b) => a.localeCompare(b));
  return keys.map((key) => ({
    label: presetKeyLabels[key] || identifierLabel(key) || specLabel(key),
    value: norm[key] ?? '',
  }));
}

function KeyValueHoverContent({ lines }: { lines: KeyValueHoverLine[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.25, maxWidth: 360 }}>
      {lines.map((line) => (
        <Box key={`${line.label}-${line.value}`} sx={{ display: 'flex', gap: 1.25, alignItems: 'baseline' }}>
          <Typography
            component="span"
            variant="caption"
            sx={{ fontWeight: 700, minWidth: 88, flexShrink: 0, color: 'common.white' }}
          >
            {line.label}
          </Typography>
          <Typography
            component="span"
            variant="caption"
            sx={{ fontFamily: 'monospace', wordBreak: 'break-all', color: 'grey.100' }}
          >
            {line.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

interface KeyValueJsonFieldProps {
  label: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, string>) => void;
  presetKeys?: readonly string[];
  presetKeyLabels?: Record<string, string>;
  emptySummary?: string;
  mode?: 'identifiers' | 'specifications';
  accentColor?: string;
  softBg?: string;
  compact?: boolean;
  endAdornment?: React.ReactNode;
}

export function KeyValueJsonField({
  label,
  value,
  onChange,
  presetKeys = [],
  presetKeyLabels = {},
  emptySummary = 'None',
  mode = 'identifiers',
  accentColor = '#64748b',
  softBg = '#f8fafc',
  compact = false,
  endAdornment,
}: KeyValueJsonFieldProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [draftRows, setDraftRows] = useState<IdentifierDraftRow[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const summary = useMemo(
    () => buildSummary(value, presetKeyLabels, emptySummary),
    [value, presetKeyLabels, emptySummary],
  );

  const hoverLines = useMemo(
    () => buildHoverLines(value, presetKeyLabels, mode),
    [value, presetKeyLabels, mode],
  );

  useEffect(() => {
    if (!open) return;
    const rows = mode === 'identifiers'
      ? identifiersToDraftRows(value)
      : specsToDraftRows(value);
    setDraftRows(rows.length ? rows : [newIdentifierDraftRow()]);
    setValidationError(null);
  }, [open, value, mode]);

  function updateRow(id: string, patch: Partial<IdentifierDraftRow>) {
    setDraftRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setValidationError(null);
  }

  function removeRow(id: string) {
    setDraftRows((prev) => prev.filter((row) => row.id !== id));
    setValidationError(null);
  }

  function handleSave() {
    const err = mode === 'identifiers' ? validateIdentifierDraftRows(draftRows) : null;
    if (err) {
      setValidationError(err);
      return;
    }
    const next = mode === 'identifiers' ? draftRowsToIdentifiers(draftRows) : draftRowsToSpecObject(draftRows);
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      <Tooltip
        title={hoverLines.length ? <KeyValueHoverContent lines={hoverLines} /> : ''}
        disableHoverListener={!hoverLines.length}
        enterDelay={300}
        placement="top-start"
        arrow
      >
        <Button
          fullWidth
          size={compact ? 'small' : 'medium'}
          variant="outlined"
          startIcon={<EditOutlined sx={{ fontSize: compact ? 16 : 18, color: accentColor }} />}
          onClick={() => setOpen(true)}
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            py: compact ? 0.85 : 1.1,
            px: 1.25,
            borderColor: accentColor,
            bgcolor: softBg,
            '&:hover': {
              bgcolor: softBg,
              borderColor: accentColor,
              filter: 'brightness(0.97)',
            },
          }}
        >
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, textAlign: 'left', flex: 1 }}>
            <Typography component="span" variant="caption" sx={{ fontWeight: 800, color: accentColor, lineHeight: 1.2 }}>
              {label}
            </Typography>
            <Typography component="span" variant={compact ? 'caption' : 'body2'} sx={{ lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {summary}
            </Typography>
          </Box>
          {endAdornment ?
            <Box component="span" sx={{ ml: 0.75, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              {endAdornment}
            </Box>
          : null}
        </Button>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pt: 0.5 }}>
            {draftRows.map((row, index) => (
              <Box key={row.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <TextField
                  size="small"
                  label="Key"
                  value={row.key}
                  onChange={(e) => updateRow(row.id, { key: e.target.value })}
                  slotProps={{
                    htmlInput: { list: presetKeys.length ? listId : undefined },
                  }}
                  sx={{ width: 160, flexShrink: 0 }}
                />
                <TextField
                  size="small"
                  label="Value"
                  value={row.value}
                  onChange={(e) => updateRow(row.id, { value: e.target.value })}
                  sx={{ flex: 1, minWidth: 0 }}
                  autoFocus={index === 0}
                />
                <IconButton size="small" aria-label="Remove row" onClick={() => removeRow(row.id)}>
                  <DeleteOutline sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            ))}
            <Button
              size="small"
              startIcon={<Add sx={{ fontSize: 16 }} />}
              onClick={() => setDraftRows((prev) => [...prev, newIdentifierDraftRow()])}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add row
            </Button>
            {validationError ?
              <Typography variant="caption" color="error.main">
                {validationError}
              </Typography>
            : null}
            <datalist id={listId}>
              {(presetKeys.length ? presetKeys : SPECIFICATION_PRESET_KEYS).map((key) => (
                <option
                  key={key}
                  value={key}
                  label={presetKeyLabels[key] || identifierLabel(key) || specLabel(key)}
                />
              ))}
            </datalist>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
