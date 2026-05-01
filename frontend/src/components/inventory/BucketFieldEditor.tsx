import { useEffect, useRef, useState } from 'react';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import type { ManifestFieldBucketMetadata } from '../../api/inventory.api';
import { ManifestFormulaInput } from './preprocessing/ManifestFormulaInput';

const DRAFT_DEBOUNCE_MS = 200;

const SUBKEY_RE = /^[a-z][a-z0-9_]*$/;

interface Row {
  id: number;
  subkey: string;
  formula: string;
}

export interface BucketFieldEditorProps {
  open: boolean;
  bucketId: string;
  bucketMeta: ManifestFieldBucketMetadata | null;
  headers: string[];
  formulas: Record<string, string>;
  onClose: () => void;
  /** Full replacement for this bucket after validation (empty list clears all bucket mappings). */
  onSave: (pairs: Array<{ target: string; formula: string }>) => void;
  /** Debounced preview updates while modal is open (dotted targets + formulas). Omit invalid / incomplete rows. */
  onDraftChange?: (
    bucketId: string,
    pairs: Array<{ target: string; formula: string }>,
  ) => void;
}

/** Pairs usable for overlay preview — same completeness rules as Save, minus duplicate/error guard. */
function rowsToPreviewPairs(bucketId: string, rows: Row[]): Array<{ target: string; formula: string }> {
  const pairs: Array<{ target: string; formula: string }> = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const sk = r.subkey.trim();
    const f = (r.formula ?? '').trim();
    if (!sk || !f) continue;
    if (!SUBKEY_RE.test(sk)) continue;
    if (seen.has(sk)) continue;
    seen.add(sk);
    pairs.push({ target: `${bucketId}.${sk}`, formula: f });
  }
  return pairs;
}

function seedRows(bucketId: string, formulas: Record<string, string>, nextRowIdRef: { current: number }): Row[] {
  const p = `${bucketId}.`;
  const rows: Row[] = [];
  for (const [k, v] of Object.entries(formulas)) {
    if (!k.startsWith(p)) continue;
    const sub = k.slice(p.length);
    rows.push({
      id: nextRowIdRef.current++,
      subkey: sub,
      formula: (v ?? '').trim(),
    });
  }
  rows.sort((a, b) => a.subkey.localeCompare(b.subkey));
  return rows;
}

export function BucketFieldEditor({
  open,
  bucketId,
  bucketMeta,
  headers,
  formulas,
  onClose,
  onSave,
  onDraftChange,
}: BucketFieldEditorProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const formulasRef = useRef(formulas);
  formulasRef.current = formulas;

  const nextRowIdRef = useRef(1);

  const prevOpenRef = useRef(false);
  const prevBucketRef = useRef(bucketId);

  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false;
      prevBucketRef.current = bucketId;
      return;
    }
    const bucketChanged = prevBucketRef.current !== bucketId;
    const opening = !prevOpenRef.current;
    if (opening || bucketChanged) {
      nextRowIdRef.current = 1;
      setRows(seedRows(bucketId, formulasRef.current, nextRowIdRef));
      setSaveError(null);
    }
    prevOpenRef.current = true;
    prevBucketRef.current = bucketId;
  }, [open, bucketId]);

  const draftTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!open || !onDraftChange) return;
    window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = undefined;
      onDraftChange(bucketId, rowsToPreviewPairs(bucketId, rows));
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(draftTimerRef.current);
    };
  }, [open, bucketId, rows, onDraftChange]);

  const label = bucketMeta?.label ?? bucketId;
  const suggested = bucketMeta?.suggested_keys ?? [];

  const commitSave = () => {
    setSaveError(null);
    const seen = new Set<string>();
    for (const r of rows) {
      const sk = r.subkey.trim();
      if (!sk && !(r.formula ?? '').trim()) continue;
      if (!sk) {
        setSaveError('Each row with a formula needs a field name.');
        return;
      }
      if (!SUBKEY_RE.test(sk)) {
        setSaveError(`Field name must match ^[a-z][a-z0-9_]*$ (got "${sk}").`);
        return;
      }
      if (seen.has(sk)) {
        setSaveError(`Duplicate field name: ${sk}`);
        return;
      }
      seen.add(sk);
    }

    const pairs: Array<{ target: string; formula: string }> = [];
    for (const r of rows) {
      const sk = r.subkey.trim();
      const f = (r.formula ?? '').trim();
      if (!sk || !f) continue;
      pairs.push({ target: `${bucketId}.${sk}`, formula: f });
    }
    onSave(pairs);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {label}
        <Typography component="span" variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
          {bucketId}.*
        </Typography>
      </DialogTitle>
      <DialogContent>
        {suggested.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Suggested
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {suggested.map((sk) => {
                const taken = rows.some((r) => r.subkey.trim() === sk);
                return (
                  <Chip
                    key={sk}
                    label={sk}
                    size="small"
                    disabled={taken}
                    onClick={() => {
                      if (taken) return;
                      setRows((prev) => [
                        ...prev,
                        {
                          id: nextRowIdRef.current++,
                          subkey: sk,
                          formula: '',
                        },
                      ]);
                    }}
                    sx={{ cursor: taken ? 'default' : 'pointer' }}
                  />
                );
              })}
            </Box>
          </Box>
        )}

        {rows.map((row) => (
          <BucketFieldRow
            key={row.id}
            headers={headers}
            row={row}
            onChangeSubkey={(next) => {
              setRows((prev) =>
                prev.map((x) => (x.id === row.id ? { ...x, subkey: next } : x)),
              );
            }}
            onChangeFormula={(next) => {
              setRows((prev) =>
                prev.map((x) => (x.id === row.id ? { ...x, formula: next } : x)),
              );
            }}
            onRemove={() => setRows((prev) => prev.filter((x) => x.id !== row.id))}
          />
        ))}

        <Button
          size="small"
          variant="outlined"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { id: nextRowIdRef.current++, subkey: '', formula: '' },
            ])
          }
          sx={{ mt: 2, textTransform: 'none' }}
        >
          Add field
        </Button>

        {saveError && (
          <Typography color="error" variant="body2" sx={{ mt: 2 }}>
            {saveError}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={commitSave} sx={{ textTransform: 'none' }}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BucketFieldRow({
  headers,
  row,
  onChangeSubkey,
  onChangeFormula,
  onRemove,
}: {
  headers: string[];
  row: Row;
  onChangeSubkey: (v: string) => void;
  onChangeFormula: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr 40px',
        gap: 1,
        alignItems: 'start',
        mb: 1.5,
        pt: 1,
        borderTop: '1px solid #EDE8E0',
      }}
    >
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Field name
        </Typography>
        <Box
          component="input"
          value={row.subkey}
          onChange={(e) => onChangeSubkey(e.target.value)}
          placeholder="e.g. warehouse_zone"
          sx={{
            width: '100%',
            p: '7px 10px',
            border: '1px solid #DDD5C9',
            borderRadius: '4px',
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        />
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Formula
        </Typography>
        <ManifestFormulaInput headers={headers} value={row.formula} onChange={onChangeFormula} />
      </Box>
      <IconButton size="small" onClick={onRemove} aria-label="Remove field" sx={{ mt: 3 }}>
        <DeleteOutline fontSize="small" />
      </IconButton>
    </Box>
  );
}
