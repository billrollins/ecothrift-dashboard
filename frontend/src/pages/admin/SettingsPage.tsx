import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  TextField,
  Typography,
} from '@mui/material';
import Save from '@mui/icons-material/Save';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { getSettings, updateSetting, getAppVersion, getPrintServerVersion } from '../../api/core.api';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function SettingsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await getSettings();
      // DRF returns paginated { count, results } or a plain array
      return Array.isArray(data) ? data : (data as { results?: unknown[] })?.results ?? [];
    },
  });

  const { data: appVersion } = useQuery({
    queryKey: ['appVersion'],
    queryFn: async () => {
      const { data } = await getAppVersion();
      return data;
    },
    staleTime: Infinity,
  });

  const { data: printServer, isLoading: printLoading } = useQuery({
    queryKey: ['printServerVersion'],
    queryFn: async () => {
      const { data } = await getPrintServerVersion();
      return data;
    },
  });

  const handleSave = async (key: string) => {
    try {
      await updateSetting(key, { value: editValue });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      enqueueSnackbar('Setting saved', { variant: 'success' });
      setEditingKey(null);
      setEditValue('');
    } catch {
      enqueueSnackbar('Failed to save setting', { variant: 'error' });
    }
  };

  const handleEdit = (key: string, value: unknown) => {
    setEditingKey(key);
    setEditValue(String(value ?? ''));
  };

  const settingList = (settings ?? []) as Array<{
    key: string;
    value: unknown;
    description?: string;
  }>;

  if (isLoading && !settings) return <LoadingScreen message="Loading settings..." />;

  return (
    <Box>
      <PageHeader title="Settings" subtitle="System configuration" />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {appVersion && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Application
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, mt: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Version
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {appVersion.version}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Build Date
                  </Typography>
                  <Typography variant="body1">
                    {appVersion.build_date
                      ? new Date(appVersion.build_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body1">
                    {appVersion.description || '—'}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              App Settings
            </Typography>
            {settingList.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No settings
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                {settingList.map((s) => (
                  <Box
                    key={s.key}
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                      gap: 2,
                      p: 2,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Box sx={{ flex: '1 1 200px' }}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {s.key}
                      </Typography>
                      {s.description && (
                        <Typography variant="caption" color="text.secondary">
                          {s.description}
                        </Typography>
                      )}
                    </Box>
                    {editingKey === s.key ? (
                      <Box sx={{ display: 'flex', gap: 1, flex: '1 1 300px' }}>
                        <TextField
                          size="small"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          fullWidth
                        />
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Save />}
                          onClick={() => handleSave(s.key)}
                        >
                          Save
                        </Button>
                        <Button size="small" onClick={() => setEditingKey(null)}>
                          Cancel
                        </Button>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 300px' }}>
                        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                          {String(s.value ?? '')}
                        </Typography>
                        <Button size="small" onClick={() => handleEdit(s.key, s.value)}>
                          Edit
                        </Button>
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Print Server
            </Typography>
            {printLoading ? (
              <CircularProgress size={24} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                <Chip
                  label={printServer?.version ? 'Connected' : 'Unknown'}
                  color={printServer?.version ? 'success' : 'default'}
                  size="small"
                />
                <Typography variant="body2" color="text.secondary">
                  Version: {printServer?.version ?? '—'}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
