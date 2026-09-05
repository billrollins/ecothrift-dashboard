import { Box, Card, CardContent, Typography } from '@mui/material';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { metaForKey } from './settingsRegistry';
import { SettingRow } from './SettingRow';
import { HolidayHoursCard } from './HolidayHoursCard';
import { StoreHoursEditor } from './StoreHoursEditor';
import { settingByKey, useAppSettings } from './useAppSettings';

export function StorePanel() {
  const { data: settings, isLoading } = useAppSettings();
  const tax = settingByKey(settings, 'tax_rate');
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
            {metaForKey('online_sales.hours').label}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {metaForKey('online_sales.hours').help}
          </Typography>
          <StoreHoursEditor value={hours?.value} />
        </CardContent>
      </Card>
      <HolidayHoursCard />
    </Box>
  );
}
