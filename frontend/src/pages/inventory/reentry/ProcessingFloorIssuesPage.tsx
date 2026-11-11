import { useQuery } from '@tanstack/react-query';
import { Box, Typography } from '@mui/material';
import { listWaitingFloorIssues } from '../../../api/floorIssues.api';
import BadTagButton from '../../../components/badTags/BadTagButton';
import { PageHeader } from '../../../components/common/PageHeader';
import { useLanguage } from '../../../i18n/useLanguage';
import { ReentryList } from './ReentryList';
import { ReentrySteps } from './ReentrySteps';
import { ReportPhoto } from './ReportPhoto';

const STEPS = [
  'Scan the tag of the item in your hand.',
  'Read why it was reported. Tap the photo if there is one.',
  'Tap one of its four buttons. The line under the find box says where the item goes. A slip? Back to shelf as is and Scrap give you a few seconds to undo.',
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
        subtitle="Items reported from the sales floor. Each one needs one decision."
        dense
        action={<BadTagButton where="floor" lang={lang} />}
      />
      <ReentrySteps steps={STEPS} />
      <ReentryList
        source="floor"
        rowLead={(row) => {
          const url = photoFor.get(row.id);
          return url ? <ReportPhoto url={url} title={row.item.product_title || row.item.sku} /> : null;
        }}
        offer={(found) => (
          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2">
              {found.last ? 'Does it have a new problem? Report it.' : 'Does it have a problem? Report it.'}
            </Typography>
            <BadTagButton key={found.item.sku} where="floor" code={found.item.sku} lang={lang} size="small" />
          </Box>
        )}
      />
    </Box>
  );
}
