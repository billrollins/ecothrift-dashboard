/**
 * Auto clock-in on the store Wi-Fi (D23 pilot; owner 2026-11-04). Only in the installed Thrift+ Staff app.
 *
 * A web page can't read its phone's Wi-Fi address, so the button sends the phone to the helper on the store PC with a
 * one-time code; the helper sees which phone opened it and tells Dash. This card then shows On (it checks every few
 * seconds while it waits). Shown only to people in the pilot.
 */
import { useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import WifiRounded from '@mui/icons-material/WifiRounded';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getWifiClock, startWifiClock, turnOffWifiClock } from '../../api/hr.api';
import { isStandalone } from '../thriftplus/scanner/installApp';
import { ccTokens } from '../../theme';

export const WIFI_CLOCK_KEY = ['hr', 'wifi-clock', 'me'];

export default function WifiClockCard() {
  const qc = useQueryClient();
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: WIFI_CLOCK_KEY,
    queryFn: async () => (await getWifiClock()).data,
    refetchInterval: (q) => (waiting && !q.state.data?.on ? 4000 : false),
  });
  const status = query.data;
  if (!status?.eligible) return null;
  const installed = isStandalone();

  const turnOn = async () => {
    setError('');
    try {
      const { data } = await startWifiClock();
      setWaiting(true);
      window.location.assign(data.join_url);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail || 'Could not start. Try again.');
    }
  };
  const turnOff = async () => {
    setError('');
    setWaiting(false);
    qc.setQueryData(WIFI_CLOCK_KEY, (await turnOffWifiClock()).data);
  };

  return (
    <Box data-testid="me-wifi-clock" sx={{ p: 2, mb: 1.5, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <WifiRounded />
        <Typography fontWeight={800} sx={{ flex: 1 }}>Auto clock-in</Typography>
        <Typography variant="body2" fontWeight={700} color={status.on ? 'success.main' : 'text.secondary'} data-testid="wifi-clock-state">
          {status.on ? 'On' : 'Off'}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Test run: it emails you what it would have done. It makes no punches.
      </Typography>
      {status.on ? (
        <Button size="small" onClick={turnOff} data-testid="wifi-clock-off">Turn off</Button>
      ) : !installed ? (
        <Alert severity="info">Open the installed Thrift+ Staff app to turn this on.</Alert>
      ) : (
        <Button fullWidth variant="contained" size="large" onClick={turnOn} disabled={!status.helper_ready} data-testid="wifi-clock-on">
          I'm on the store Wi-Fi: turn on auto clock-in
        </Button>
      )}
      {!status.on && installed && !status.helper_ready ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          The store PC is not answering right now.
        </Typography>
      ) : null}
      {error ? <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert> : null}
    </Box>
  );
}
