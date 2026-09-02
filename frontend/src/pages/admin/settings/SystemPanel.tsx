import { Box, Card, CardContent, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getAppVersion } from '../../../api/core.api';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { isHiddenKey, keysForTab, metaForKey } from './settingsRegistry';
import { SettingRow } from './SettingRow';
import { useAppSettings } from './useAppSettings';

export function SystemPanel() {
  const { data: settings, isLoading } = useAppSettings();
  const { data: appVersion } = useQuery({
    queryKey: ['appVersion'],
    queryFn: async () => {
      const { data } = await getAppVersion();
      return data;
    },
    staleTime: Infinity,
  });

  if (isLoading && !settings) return <LoadingScreen message="Loading system..." />;

  const leftoverKeys = keysForTab(
    'system',
    (settings ?? []).map((s) => s.key).filter((key) => !isHiddenKey(key)),
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Application
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, mt: 1, minHeight: 56 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Version
              </Typography>
              <Typography variant="h5" fontWeight={600}>
                {appVersion?.version ?? '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Build Date
              </Typography>
              <Typography variant="body1">
                {appVersion?.build_date
                  ? new Date(appVersion.build_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Description
              </Typography>
              <Typography variant="body1">{appVersion?.description || '-'}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Other settings
          </Typography>
          {leftoverKeys.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Every AppSetting key is curated on Assumptions or Store. Receipt storefront text is
              hardcoded on the print server.
            </Typography>
          ) : (
            leftoverKeys.map((key) => {
              const row = (settings ?? []).find((s) => s.key === key);
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
