import { Alert, Box, Card, CardContent, Typography } from '@mui/material';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { keysForTab, metaForKey } from './settingsRegistry';
import { SettingRow } from './SettingRow';
import { useAppSettings } from './useAppSettings';

const ASSUMPTION_ORDER = [
  'po_default_est_shrink',
  'pricing_shrinkage_factor',
  'pricing_need_window_days',
  'delivery_service_minutes_per_stop',
] as const;

export function AssumptionsPanel() {
  const { data: settings, isLoading } = useAppSettings();

  if (isLoading && !settings) return <LoadingScreen message="Loading assumptions..." />;

  const present = new Set((settings ?? []).map((s) => s.key));
  const keys = keysForTab('assumptions', [...ASSUMPTION_ORDER, ...(settings ?? []).map((s) => s.key)]);
  const ordered = ASSUMPTION_ORDER.filter((key) => keys.includes(key));

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>PO shrink</strong> drives item cost allocation; <strong>buying revenue shrink</strong>{' '}
        reduces estimated auction revenue in valuation - related ideas, separate settings. Changing the
        PO default does not retrofit existing POs.
      </Alert>
      <Card>
        <CardContent>
          {ordered.length === 0 ? (
            <Typography color="text.secondary">
              No assumption keys found. Run setup_initial_data to seed them.
            </Typography>
          ) : (
            ordered.map((key) => {
              const row = (settings ?? []).find((s) => s.key === key);
              if (!row && !present.has(key)) {
                return (
                  <Box key={key} sx={{ py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      {metaForKey(key).label} - not in the database yet.
                    </Typography>
                  </Box>
                );
              }
              if (!row) return null;
              return (
                <SettingRow
                  key={key}
                  settingKey={key}
                  value={row.value}
                  description={typeof row.description === 'string' ? row.description : undefined}
                  meta={metaForKey(key)}
                />
              );
            })
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
