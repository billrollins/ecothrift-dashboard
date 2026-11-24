/**
 * Owner page, Testing (owner 2026-11-24): "this has testing settings so i can see Dash or what ever app how i want ...
 * Mobile: Legacy, NEW, Black Friday (as a choose one) Desktop: NEW, Black Friday (as a choose one) ... THEN make all
 * selections unselect and go to prod after 24 hours ... This help me know what I am lookin at and not accidently get
 * stuck on a version no one sees."
 *
 * One pick per device kind (Live = what customers see), each on for 24 hours and then off by itself; End now ends it at
 * once. Only the owner's linked devices follow the picks (link each once: the QR for a phone, the button for this
 * computer); a TEST badge on the site says what a linked device is looking at. The options come from the server, so a
 * version that no longer exists is simply not listed. Nothing here moves when a pick goes on or off (fixed rows).
 */
import { Box, Button, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import QrSvg from '../../components/thriftplus/QrSvg';
import { fetchOwnerTesting, saveOwnerTesting, type OwnerTesting as Testing, type TestOption, type TestPick } from '../../api/owner.api';

function PickCard({ title, live, options, value, busy, onPick, testId }: {
  title: string; live: string; options: TestOption[]; value: TestPick; busy: boolean; onPick: (pick: TestPick) => void; testId: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 280 }} data-testid={testId}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value}
        aria-label={`${title}: what your devices see`}
        onChange={(_, pick: TestPick | null) => {
          if (pick !== null && pick !== value) onPick(pick);
        }}
        sx={{ mt: 1, flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 700, px: 2 } }}
      >
        <ToggleButton value="" disabled={busy}>Live</ToggleButton>
        {options.map((o) => (
          <ToggleButton key={o.key} value={o.key} disabled={busy}>{o.label}</ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Customers see: {live}</Typography>
    </Paper>
  );
}

export function endsText(until: string | null): string {
  if (!until) return '';
  try {
    return format(parseISO(until), 'EEE h:mm a');
  } catch {
    return '';
  }
}

export default function OwnerTesting() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['owner-testing'], queryFn: fetchOwnerTesting, refetchInterval: 60_000 });
  const save = useMutation({
    mutationFn: saveOwnerTesting,
    onSuccess: (next: Testing) => qc.setQueryData(['owner-testing'], next),
  });
  if (!data) return <Box sx={{ minHeight: 420 }} />;
  const { state } = data;
  const testing = Boolean(state.mobile || state.desktop);
  const ends = endsText(state.until);
  return (
    <Stack spacing={2} sx={{ maxWidth: 1100 }} data-testid="owner-testing">
      {/* One fixed row: it reads Live or Testing, and never changes height. */}
      <Paper
        variant="outlined"
        sx={{ p: 2, minHeight: 68, display: 'flex', alignItems: 'center', gap: 2, borderColor: testing ? 'warning.main' : 'divider',
          bgcolor: testing ? '#fff4d6' : 'background.paper' }}
        data-testid="testing-status"
      >
        <Typography sx={{ fontWeight: 800, flex: 1 }}>
          {testing ? `Testing on your devices until ${ends}. Then back to Live by itself.` : 'Live. Your devices see what customers see.'}
        </Typography>
        <Button
          variant="contained"
          color="inherit"
          disabled={!testing || save.isPending}
          onClick={() => save.mutate({ end: true })}
          sx={{ visibility: testing ? 'visible' : 'hidden', textTransform: 'none', fontWeight: 800 }}
        >
          End now
        </Button>
      </Paper>

      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <PickCard title="Mobile" live={data.live.mobile} options={data.options.mobile} value={state.mobile} busy={save.isPending}
          onPick={(mobile) => save.mutate({ mobile })} testId="testing-mobile" />
        <PickCard title="Desktop" live={data.live.desktop} options={data.options.desktop} value={state.desktop} busy={save.isPending}
          onPick={(desktop) => save.mutate({ desktop })} testId="testing-desktop" />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }} data-testid="testing-devices">
        <QrSvg text={data.link} label="Link your phone: scan to open ecothrift.us as a test device" sx={{ width: 150, mx: 0 }} />
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Your devices</Typography>
          <Typography variant="body2" color="text.secondary">Link each one once. Only linked devices follow your picks.</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: 'wrap' }}>
            <Button variant="contained" href={data.link} target="_blank" rel="noreferrer" sx={{ textTransform: 'none', fontWeight: 800 }}>
              Link this computer
            </Button>
            <Button variant="outlined" href={data.unlink} target="_blank" rel="noreferrer" sx={{ textTransform: 'none', fontWeight: 700 }}>
              Unlink this computer
            </Button>
          </Stack>
          <Typography variant="body2" sx={{ mt: 1.5 }}>Phone: scan the code.</Typography>
        </Box>
      </Paper>
    </Stack>
  );
}
