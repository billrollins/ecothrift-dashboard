import { Box, Card, CardContent, Typography } from '@mui/material';
import { useAuth } from '../../../contexts/AuthContext';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { metaForKey } from './settingsRegistry';
import { SettingRow } from './SettingRow';
import { CardSurchargeEditor } from './CardSurchargeEditor';
import { HolidayHoursCard } from './HolidayHoursCard';
import { StoreHoursEditor } from './StoreHoursEditor';
import { settingByKey, useAppSettings } from './useAppSettings';

const THRIFT_PLUS_KEYS = [
  'thrift_plus_enabled', 'thrift_plus_preview_code', 'thrift_plus_test_registers', 'thrift_plus_rewards_start',
  'thrift_plus_floor_share',
];

/** Thrift+ behind one switch (owner, 2026-10-07). The Super User's alone: the server refuses anyone else. */
function ThriftPlusCard({ settings }: { settings: ReturnType<typeof useAppSettings>['data'] }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          Thrift+
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Everything customers see of Thrift+ (the scanner at /scan, the portal, member prices at the register) waits for this switch.
        </Typography>
        {THRIFT_PLUS_KEYS.map((key) => {
          const row = settingByKey(settings, key);
          return (
            <SettingRow
              key={key}
              settingKey={key}
              value={row?.value ?? (key === 'thrift_plus_enabled' ? false : '')}
              meta={metaForKey(key)}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

export function StorePanel() {
  const { data: settings, isLoading } = useAppSettings();
  const { user } = useAuth();
  const tax = settingByKey(settings, 'tax_rate');
  const surcharge = settingByKey(settings, 'pos.card_surcharge');
  const hours = settingByKey(settings, 'online_sales.hours');

  if (isLoading && !settings) return <LoadingScreen message="Loading store settings..." />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardContent>
          {tax ? (
            <SettingRow
              settingKey="tax_rate"
              value={tax.value}
              description={typeof tax.description === 'string' ? tax.description : undefined}
              meta={metaForKey('tax_rate')}
            />
          ) : (
            <Typography color="text.secondary">Sales tax rate is not in the database yet.</Typography>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
            {metaForKey('pos.card_surcharge').label}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {metaForKey('pos.card_surcharge').help}
          </Typography>
          {surcharge ? (
            <CardSurchargeEditor key={JSON.stringify(surcharge.value)} value={surcharge.value} />
          ) : (
            <Typography color="text.secondary">
              Credit card surcharge is not in the database yet.
            </Typography>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
            {metaForKey('online_sales.hours').label}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {metaForKey('online_sales.hours').help}
          </Typography>
          <StoreHoursEditor value={hours?.value} />
        </CardContent>
      </Card>
      <HolidayHoursCard />
      {user?.is_superuser ? <ThriftPlusCard settings={settings} /> : null}
    </Box>
  );
}
