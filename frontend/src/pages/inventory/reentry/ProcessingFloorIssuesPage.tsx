import { useQuery } from '@tanstack/react-query';
import { Box, Paper, Typography } from '@mui/material';
import { listWaitingFloorIssues } from '../../../api/floorIssues.api';
import BadTagButton from '../../../components/badTags/BadTagButton';
import { PageHeader } from '../../../components/common/PageHeader';
import { useLanguage } from '../../../i18n/useLanguage';
import { skuFromScan } from '../../../utils/scanCode';
import { BadTagPhoto } from '../tagErrors/BadTagPhoto';
import { ReentryList } from './ReentryList';

const STEPS = [
  'Find the item: scan its tag.',
  'Read why it came back. Look at the photo if there is one.',
  'Pick one: Price again, Back to shelf as is, Send to Restoration, or Scrap.',
  'Put it where it goes. It leaves this list.',
];

/**
 * Processing > Floor issues (Dash Update #84, Bill 2026-11-10): every item someone on the floor reported with
 * "Report a problem" (broken, missing parts, a wrong price, ...), with the simple steps and the four one-tap
 * actions. The list and the actions are the shared ones (`ReentryList`), which Returns uses too; this page adds
 * the report's photo to a row, and the report itself for an item in hand that is not on the list yet.
 */
export default function ProcessingFloorIssuesPage() {
  const lang = useLanguage();
  // Same key prefix the report invalidates, and the shared list's 30 seconds, so a new report shows by itself.
  const reports = useQuery({ queryKey: ['floor-issues', 'waiting'], queryFn: listWaitingFloorIssues, refetchInterval: 30_000 });
  const photoFor = new Map(
    (reports.data ?? []).flatMap((r) => (r.reentry_id != null && r.photo_url ? [[r.reentry_id, r.photo_url] as const] : [])),
  );

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, width: '100%', minWidth: 0, maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="Floor issues"
        subtitle="Items with a problem found on the floor. Pick what happens to each one."
        dense
        action={<BadTagButton where="floor" lang={lang} />}
      />
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>The steps</Typography>
        <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
          {STEPS.map((step) => (
            <Typography key={step} component="li" variant="body2">{step}</Typography>
          ))}
        </Box>
      </Paper>
      <ReentryList
        source="floor"
        rowExtra={(row) => {
          const url = photoFor.get(row.id);
          return url ? (
            <Box sx={{ mt: 0.75 }}>
              <BadTagPhoto url={url} title={row.item.product_title || row.item.sku} variant="button" />
            </Box>
          ) : null;
        }}
        notOnList={(typed) => {
          const sku = skuFromScan(typed).trim();
          return (
            <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              <Typography variant="body2">{`Is ${sku} in your hand with a problem? Report it here.`}</Typography>
              <BadTagButton key={sku} where="floor" code={sku} lang={lang} size="small" />
            </Box>
          );
        }}
      />
    </Box>
  );
}
