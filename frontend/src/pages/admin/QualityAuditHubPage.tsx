import {
  Avatar,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useCreateQualityAudit, useQualityAudits } from '../../hooks/useQualityAudit';
import { useQualityAuditForms } from '../../hooks/useQualityAuditForms';
import { useSnackbar } from 'notistack';

function formatSubmittedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function gradeColor(grade: string): string {
  if (grade === 'A') return '#2f7a48';
  if (grade === 'B') return '#5a9b3f';
  if (grade === 'C') return '#bd8618';
  if (grade === 'D') return '#bf7417';
  return '#b3261e';
}

export default function QualityAuditHubPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const createAudit = useCreateQualityAudit();
  const { data: forms, isLoading: formsLoading } = useQualityAuditForms(true);
  const { data: recentAudits, isLoading: auditsLoading } = useQualityAudits({
    status: 'submitted',
  });

  const isSuperuser = Boolean(user?.is_superuser);

  async function startAudit(slug: string) {
    try {
      const audit = await createAudit.mutateAsync(slug);
      navigate(`/admin/quality-audit/run/${slug}/${audit.id}`);
    } catch {
      enqueueSnackbar('Could not start audit. Try again.', { variant: 'error' });
    }
  }

  if (formsLoading || auditsLoading) {
    return <LoadingScreen message="Loading…" />;
  }

  const latest = recentAudits?.[0];

  return (
    <Box>
      <PageHeader
        title="Quality Audit"
        subtitle="Choose a form to begin a floor checklist."
        action={
          isSuperuser ? (
            <Chip
              icon={<TuneIcon />}
              label="Manage forms"
              onClick={() => navigate('/admin/quality-audit/forms')}
              clickable
              color="primary"
            />
          ) : null
        }
      />

      <Stack spacing={1.5} sx={{ maxWidth: 640 }}>
        {forms && forms.length > 0 ? (
          forms.map((form) => (
            <Card key={form.id} variant="outlined" sx={{ borderRadius: 3 }}>
              <CardActionArea
                onClick={() => startAudit(form.slug)}
                disabled={createAudit.isPending}
                sx={{ p: 0 }}
              >
                <CardContent sx={{ p: 2 }}>
                  <Stack direction="row" spacing={1.75} alignItems="center">
                    <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                      <Typography fontWeight={800}>{(form.title || '?').slice(0, 1)}</Typography>
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                        <Typography variant="h6" fontWeight={800} noWrap>
                          {form.title}
                        </Typography>
                        {form.feeds_dashboard ? (
                          <Chip size="small" label="Dashboard" color="primary" />
                        ) : null}
                      </Stack>
                      {form.intro ? (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {form.intro}
                        </Typography>
                      ) : null}
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {form.section_count} sections · {form.check_count} checks
                      </Typography>
                    </Box>
                    {createAudit.isPending ? <CircularProgress size={22} /> : null}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))
        ) : (
          <Typography color="text.secondary">
            No active audit forms. {isSuperuser ? 'Create one in Manage forms.' : 'Ask an admin to create one.'}
          </Typography>
        )}

        {latest ? (
          <Box sx={{ pt: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Latest submitted audit
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider' }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: gradeColor(latest.overall_grade || 'F'),
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '1.4rem',
                }}
              >
                {latest.overall_grade || '—'}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} noWrap>
                  {latest.form_title || 'Audit'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {latest.conducted_by_name || 'Unknown'} · {latest.submitted_at ? formatSubmittedAt(latest.submitted_at) : '—'}
                </Typography>
              </Box>
            </Stack>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}
