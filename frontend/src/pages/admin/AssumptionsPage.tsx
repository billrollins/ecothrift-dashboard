import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
} from '@mui/material';
import Save from '@mui/icons-material/Save';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { getSettings, updateSetting, type Setting } from '../../api/core.api';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/** Keys shown on Assumptions; must match AppSetting keys used in buying + inventory. */
const ASSUMPTION_KEYS = [
  'po_default_est_shrink',
  'pricing_shrinkage_factor',
  'pricing_need_window_days',
] as const;

type ValueKind = 'fraction' | 'days';

const KEY_META: Record<
  string,
  { label: string; help: string; kind: ValueKind }
> = {
  po_default_est_shrink: {
    label: 'Default PO est. shrink',
    help:
      'Inventory: fraction 0–1 for new purchase orders (cost allocation). Does not retrofit existing POs.',
    kind: 'fraction',
  },
  pricing_shrinkage_factor: {
    label: 'Buying revenue shrink',
    help:
      'Buying: fraction 0–1 applied to estimated auction revenue before profit (valuation card). Distinct from PO shrink but same default target (0.15).',
    kind: 'fraction',
  },
  pricing_need_window_days: {
    label: 'Category need — sold lookback (days)',
    help: 'Buying: window for sold-items stats used in category need / SQL aggregates (e.g. 90).',
    kind: 'days',
  },
};

export default function AssumptionsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await getSettings();
      return Array.isArray(data) ? data : (data as { results?: Setting[] })?.results ?? [];
    },
  });

  const assumptionRows = (settings ?? []).filter((s) =>
    ASSUMPTION_KEYS.includes(s.key as (typeof ASSUMPTION_KEYS)[number]),
  );

  const handleEdit = (key: string, value: unknown) => {
    setEditingKey(key);
    setEditValue(String(value ?? ''));
  };

  const handleSave = async (key: string) => {
    const meta = KEY_META[key];
    const kind = meta?.kind ?? 'fraction';

    if (kind === 'days') {
      const n = parseInt(editValue, 10);
      if (Number.isNaN(n) || n < 1 || n > 3650) {
        enqueueSnackbar('Enter a whole number from 1 to 3650.', { variant: 'warning' });
        return;
      }
      try {
        await updateSetting(key, { value: n });
        queryClient.invalidateQueries({ queryKey: ['settings'] });
        enqueueSnackbar('Assumption saved', { variant: 'success' });
        setEditingKey(null);
        setEditValue('');
      } catch {
        enqueueSnackbar('Failed to save', { variant: 'error' });
      }
      return;
    }

    const n = parseFloat(editValue);
    if (Number.isNaN(n) || n < 0 || n >= 1) {
      enqueueSnackbar('Enter a number between 0 and 1 (exclusive of 1).', { variant: 'warning' });
      return;
    }
    try {
      await updateSetting(key, { value: n });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      enqueueSnackbar('Assumption saved', { variant: 'success' });
      setEditingKey(null);
      setEditValue('');
    } catch {
      enqueueSnackbar('Failed to save', { variant: 'error' });
    }
  };

  if (isLoading && !settings) return <LoadingScreen message="Loading assumptions..." />;

  return (
    <Box>
      <PageHeader
        title="Assumptions"
        subtitle="Universal defaults (AppSetting keys) for inventory PO shrink, buying valuation shrink, and category-need window"
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>PO shrink</strong> drives item cost allocation; <strong>buying revenue shrink</strong>{' '}
        reduces estimated auction revenue in valuation — related ideas, separate settings. Changing PO
        default does not retrofit existing POs.
      </Alert>

      <Card>
        <CardContent>
          {assumptionRows.length === 0 ? (
            <Typography color="text.secondary">
              No assumption keys found. Run <code>python manage.py setup_initial_data</code> (and/or{' '}
              <code>seed_pricing_rules</code> with CSV) to seed{' '}
              <code>po_default_est_shrink</code>, <code>pricing_shrinkage_factor</code>,{' '}
              <code>pricing_need_window_days</code>.
            </Typography>
          ) : (
            ASSUMPTION_KEYS.map((key) => {
              const row = assumptionRows.find((s) => s.key === key);
              if (!row) {
                return (
                  <Box key={key} sx={{ py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      {KEY_META[key]?.label ?? key} — not in database yet (run setup_initial_data).
                    </Typography>
                  </Box>
                );
              }
              const meta = KEY_META[row.key] ?? {
                label: row.key,
                help: '',
                kind: 'fraction' as const,
              };
              return (
                <Box
                  key={row.key}
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
                    {row.description ? (
                      <Typography variant="body2" color="text.secondary">
                        {String(row.description)}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {meta.help}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {editingKey === row.key ? (
                      <>
                        <TextField
                          size="small"
                          label="Value"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          sx={{ width: 160 }}
                          type={meta.kind === 'days' ? 'number' : 'text'}
                          inputProps={meta.kind === 'days' ? { min: 1, max: 3650 } : undefined}
                        />
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<Save />}
                          onClick={() => handleSave(row.key)}
                        >
                          Save
                        </Button>
                        <Button size="small" onClick={() => setEditingKey(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Typography variant="body1" sx={{ minWidth: 80 }}>
                          {String(row.value ?? '')}
                        </Typography>
                        <Button size="small" onClick={() => handleEdit(row.key, row.value)}>
                          Edit
                        </Button>
                      </>
                    )}
                  </Box>
                </Box>
              );
            })
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
