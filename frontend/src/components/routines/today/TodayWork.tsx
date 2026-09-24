import { Box, Skeleton, Typography } from '@mui/material';
import { t } from '../../../i18n/routines';
import type { MyWork } from '../../../pages/routines/myWork';
import { dutyColors } from '../../duty/tokens';
import { MyWorkList } from '../MyWorkList';
import { glanceHref } from './useTodayModel';

/**
 * Today's routines: the one list staff work from. Same count as the badge and the nag icon.
 * `onOpen` gets a routine link; Today opens it beside the list (desk) or full screen (phone).
 */
export function TodayWork({
  work,
  loading,
  clockedIn,
  lang,
  onOpen,
  selectedRunId,
}: {
  work: MyWork;
  loading: boolean;
  clockedIn: boolean;
  lang: string;
  onOpen: (href: string) => void;
  selectedRunId?: number | null;
}) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Skeleton variant="rounded" height={140} sx={{ borderRadius: '12px' }} />
        <Skeleton variant="rounded" height={64} sx={{ borderRadius: '12px' }} />
      </Box>
    );
  }
  return (
    <Box sx={{ mx: -1.5 }}>
      {!clockedIn && work.count > 0 ? (
        <Typography sx={{ mx: 2.5, mb: 0.5, fontSize: 12.5, color: dutyColors.ink40 }}>
          {t('pickShiftToSeeDay', lang)}
        </Typography>
      ) : null}
      <MyWorkList
        work={work}
        lang={lang}
        selectedRunId={selectedRunId}
        onOpenRun={(run) => onOpen(glanceHref(run))}
        onOpenDraft={(draft) => onOpen(draft.href)}
        onStartAnytime={(routine) => onOpen(`/routines/run/new?routine=${routine.id}`)}
      />
    </Box>
  );
}
