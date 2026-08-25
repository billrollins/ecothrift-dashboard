import { Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import { getRestorationJob } from '../../../api/inventory.api';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { usePatchRestorationQueueDetails } from '../../../hooks/useRestorationBench';
import type { RestorationIntendedDestination, RestorationJobDTO } from '../../../types/inventory.types';
import { RestorationQueueCard, type QueueEdit } from '../queue/RestorationQueueCard';
import { queueListAccent } from '../queue/restorationQueueModel';
import { lowestGrade } from './finishNotes';
import { studio } from './studio/tarsStudioTheme';
import { gradeValuesComplete } from './tarsProfit';

export const QUICK_GRADE_DEFAULT_DESTINATION: RestorationIntendedDestination = 'shelf';

const FORM_MIN_HEIGHT = 480;

export function TarsQuickGradeDialog({
  open,
  jobId,
  onClose,
}: {
  open: boolean;
  jobId: number | null;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { scales } = useGradeScales();
  const save = usePatchRestorationQueueDetails();
  const seeded = useRef(false);
  const [draft, setDraft] = useState<RestorationJobDTO | null>(null);

  const jobQuery = useQuery({
    queryKey: ['restoration-job', jobId],
    queryFn: async () => {
      const { data } = await getRestorationJob(jobId as number);
      return data;
    },
    enabled: open && jobId != null,
  });

  useEffect(() => {
    if (!open) {
      seeded.current = false;
      setDraft(null);
      return;
    }
    if (jobQuery.data) setDraft(jobQuery.data);
  }, [open, jobQuery.data]);

  useEffect(() => {
    if (!open || !draft || seeded.current) return;
    seeded.current = true;
    if (draft.intended_destination) return;
    const next = { ...draft, intended_destination: QUICK_GRADE_DEFAULT_DESTINATION };
    setDraft(next);
    save.mutate(
      { id: next.id, payload: { intended_destination: QUICK_GRADE_DEFAULT_DESTINATION } },
      {
        onSuccess: (data) => {
          setDraft(data);
          queryClient.setQueryData(['restoration-job', data.id], data);
        },
        onError: (err) => {
          enqueueSnackbar(err instanceof Error ? err.message : 'Could not save that change', {
            variant: 'error',
          });
        },
      },
    );
  }, [open, draft, enqueueSnackbar, queryClient, save]);

  function applyEdit(id: number, patch: QueueEdit) {
    const current = draft;
    if (!current) return;
    const nextValues = patch.grade_values ?? current.grade_values ?? {};
    const nextScale = patch.scale ?? current.scale;
    const payload = {
      ...patch,
      ...(patch.grade_values && gradeValuesComplete(nextScale, nextValues, scales)
        ? { starting_grade: lowestGrade(nextValues) }
        : {}),
    };
    setDraft({ ...current, ...patch } as RestorationJobDTO);
    save.mutate(
      { id, payload },
      {
        onSuccess: (data) => {
          setDraft(data);
          queryClient.setQueryData(['restoration-job', data.id], data);
        },
        onError: (err) => {
          setDraft(current);
          enqueueSnackbar(err instanceof Error ? err.message : 'Could not save that change', {
            variant: 'error',
          });
        },
      },
    );
  }

  const ready = Boolean(draft && draft.scale && gradeValuesComplete(draft.scale, draft.grade_values ?? {}, scales));

  return (
    <Dialog
      open={open}
      onClose={ready ? onClose : undefined}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { bgcolor: studio.canvas } }}
    >
      <DialogTitle sx={{ pb: 0.75, fontWeight: 900 }}>Grade for Restoration</DialogTitle>
      <DialogContent>
        <Box sx={{ minHeight: FORM_MIN_HEIGHT, pt: 0.5 }}>
          {draft ? (
            <RestorationQueueCard
              layout="form"
              job={draft}
              scales={scales}
              accent={queueListAccent('queue')}
              onEdit={applyEdit}
              formAction={
                <Button
                  variant="contained"
                  disabled={!ready}
                  onClick={onClose}
                  sx={{ minWidth: 128, fontWeight: 800 }}
                >
                  Done
                </Button>
              }
            />
          ) : (
            <Box
              sx={{
                minHeight: FORM_MIN_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: `${studio.radius.lg}px`,
                border: `1.5px solid ${studio.panelBorder}`,
                bgcolor: studio.panel,
              }}
            >
              <CircularProgress size={22} />
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
