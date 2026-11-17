/**
 * "Report something" (Dash Update #183, Bill 2026-11-17, "Report it to Bill the same day"): one tap from any page, for
 * every staff login. A small red button in the top bar's fixed row (beside the bell) that opens the incident form; the
 * owner gets the Dash message and the alert person (Bill) a text, as from Home > HR.
 */
import { useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import ReportGmailerrorredRounded from '@mui/icons-material/ReportGmailerrorredRounded';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { createIncident, type IncidentWrite } from '../../api/incidents.api';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { IncidentForm } from '../../pages/hr/incidents/IncidentForm';
import { useIncidentCopy } from '../../pages/hr/incidents/incidentCopy';
import { dutyColors } from '../duty/tokens';

export const REPORT_SOMETHING = { en: 'Report something', es: 'Reportar algo' } as const;

const TEAM_ROLES = ['Employee', 'Manager', 'Admin'];

/** Files a new incident report: the form's busy flag, its error line, and what to call on submit. */
export function useFileIncident(onDone: () => void) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const copy = useIncidentCopy();
  const [error, setError] = useState('');
  const report = useMutation({
    mutationFn: async ({ payload, photos }: { payload: IncidentWrite; photos: File[] }) => (await createIncident(payload, photos)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['store-map'] });
      enqueueSnackbar(copy.t('sent'), { variant: 'success' });
      onDone();
    },
    onError: (err) => {
      const body = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const first = body ? Object.values(body)[0] : undefined;
      setError(Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : copy.t('couldNot'));
    },
  });
  return {
    busy: report.isPending,
    error,
    submit: (payload: IncidentWrite, photos: File[]) => {
      setError('');
      return report.mutateAsync({ payload, photos });
    },
  };
}

export function ReportSomethingButton() {
  const { user } = useAuth();
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  const file = useFileIncident(() => setOpen(false));
  if (!user || !(user.is_superuser || TEAM_ROLES.includes(user.role ?? ''))) return null;
  const label = REPORT_SOMETHING[lang];
  return (
    <>
      <Tooltip title={label}>
        <IconButton size="small" aria-label={label} onClick={() => setOpen(true)} data-testid="report-something"
          sx={{ color: dutyColors.red, flexShrink: 0 }}>
          <ReportGmailerrorredRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      <IncidentForm open={open} report={null} busy={file.busy} error={file.error} onClose={() => setOpen(false)}
        onSubmit={file.submit} />
    </>
  );
}
