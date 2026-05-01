import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { ProcessingWorkspaceRowDTO } from '../../../../types/inventory.types';

export interface MergeModalProps {
  open: boolean;
  onClose: () => void;
  manifestRowIds: number[];
  rows: ProcessingWorkspaceRowDTO[];
  loading: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

type FieldKey = 'title' | 'brand' | 'model' | 'category' | 'description' | 'tags';

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'brand', label: 'Brand' },
  { key: 'model', label: 'Model / product #' },
  { key: 'category', label: 'Category' },
  { key: 'description', label: 'Description' },
  { key: 'tags', label: 'Tags' },
];

function fieldValue(row: ProcessingWorkspaceRowDTO | undefined, k: FieldKey): string {
  if (!row) return '';
  const p = row.product;
  switch (k) {
    case 'title':
      return (p?.title || row.title || '').trim();
    case 'brand':
      return (p?.brand || row.brand || '').trim();
    case 'model':
      return (p?.model || row.model || '').trim();
    case 'category':
      return (p?.category || row.category || '').trim();
    case 'description':
      return (p?.description || row.description || '').trim();
    case 'tags':
      return (p?.tags || row.tags || '').trim();
    default:
      return '';
  }
}

/** All identical across selected rows → one merged value hint. */
function allSame(rows: ProcessingWorkspaceRowDTO[], k: FieldKey): boolean {
  if (rows.length < 2) return true;
  const v0 = fieldValue(rows[0], k);
  return rows.every((r) => fieldValue(r, k) === v0);
}

function pickValue(
  rs: ProcessingWorkspaceRowDTO[],
  picks: Record<FieldKey, number>,
  k: FieldKey,
): string {
  if (!rs.length) return '';
  const idxRaw = picks[k] ?? 0;
  const idx = Math.min(Math.max(0, idxRaw), rs.length - 1);
  return fieldValue(rs[idx], k);
}

export function MergeModal({ open, onClose, manifestRowIds, rows, loading, onSubmit }: MergeModalProps) {
  const [sourceByField, setSourceByField] = useState<Record<FieldKey, number>>({
    title: 0,
    brand: 0,
    model: 0,
    category: 0,
    description: 0,
    tags: 0,
  });

  useEffect(() => {
    if (!open || rows.length < 2) return;
    const base: Record<FieldKey, number> = {
      title: 0,
      brand: 0,
      model: 0,
      category: 0,
      description: 0,
      tags: 0,
    };
    setSourceByField(base);
  }, [open, rows]);

  const canSubmit = manifestRowIds.length >= 2 && rows.length >= 2;
  const titlePreview = useMemo(
    () => (rows.length >= 2 ? pickValue(rows, sourceByField, 'title') : ''),
    [rows, sourceByField],
  );

  const affectingSummary = useMemo(() => rows.map((r) => `#${r.rowNum}`).join(', '), [rows]);

  return (
    <Dialog open={open} onClose={() => !loading && onClose()} maxWidth="md" fullWidth>
      <DialogTitle>Merge manifest rows</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Pick which manifest row contributes each canonical product field before merge. Rows: <strong>{affectingSummary || '—'}</strong>.
          Title is required; canonical product adopts the stitched values below.
        </Typography>
        {rows.length < 2 ?
          <Typography variant="body2" color="warning.main">
            Select at least two manifest rows (same-product merge) — row data was cleared or did not load. Close this dialog and try again from the queue.
          </Typography>
        : null}
        {rows.length >= 2 ? FIELDS.map(({ key: fk, label }) => {
          const uniform = rows.length >= 2 && allSame(rows, fk);
          return (
            <Box key={fk} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
              <Typography variant="subtitle2">{label}</Typography>
              {uniform ?
                <Typography variant="caption" color="text.secondary">
                  All rows match.
                </Typography>
              : null}
              <RadioGroup
                value={String(sourceByField[fk] ?? 0)}
                onChange={(_, val) =>
                  setSourceByField((prev) => ({ ...prev, [fk]: Number.parseInt(val, 10) }))
                }
              >
                {rows.map((r, idx) => (
                  <FormControlLabel
                    key={`${fk}-${r.processing_row_id}`}
                    value={String(idx)}
                    control={<Radio size="small" />}
                    label={
                      <Typography component="span" variant="body2">
                        Row {r.rowNum}: {fieldValue(r, fk).slice(0, 240) || '—'}
                        {fieldValue(r, fk).length > 240 ? '…' : ''}
                      </Typography>
                    }
                  />
                ))}
              </RadioGroup>
            </Box>
          );
        }) : null}
        {rows.length >= 2 ?
          <Typography variant="caption" color="text.secondary">
            Canonical title outcome:{' '}
            <strong>
              {titlePreview.slice(0, 280) || '—'}
              {titlePreview.length > 280 ? '…' : ''}
            </strong>
          </Typography>
        : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={loading || !canSubmit || !pickValue(rows, sourceByField, 'title').trim()}
          onClick={async () => {
            const fv: Record<string, unknown> = {
              title: pickValue(rows, sourceByField, 'title').slice(0, 300),
              brand: pickValue(rows, sourceByField, 'brand'),
              model: pickValue(rows, sourceByField, 'model'),
              category: pickValue(rows, sourceByField, 'category'),
              description: pickValue(rows, sourceByField, 'description'),
              tags: pickValue(rows, sourceByField, 'tags'),
            };
            const titleIx = Math.min(sourceByField.title ?? 0, rows.length - 1);
            const specsFrom = rows[titleIx]?.specs;
            if (specsFrom && typeof specsFrom === 'object') fv.specs = specsFrom;
            await onSubmit({
              manifest_row_ids: manifestRowIds,
              field_values: fv,
            });
          }}
        >
          Merge rows
        </Button>
      </DialogActions>
    </Dialog>
  );
}
