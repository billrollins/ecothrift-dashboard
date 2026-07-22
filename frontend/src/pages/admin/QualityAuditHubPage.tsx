import {
  Avatar,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import TuneIcon from '@mui/icons-material/Tune';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useCreateQualityAudit, useQualityAudits } from '../../hooks/useQualityAudit';
import { useQualityAuditForms } from '../../hooks/useQualityAuditForms';
import { useSnackbar } from 'notistack';
import type { QualityAudit } from '../../types/qualityAudit.types';

function formatSubmittedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

function GradeBadge({ grade }: { grade: string }) {
  return (
    <Box
      sx={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: gradeColor(grade || 'F'),
        color: '#fff',
        fontWeight: 800,
        fontSize: '1.1rem',
        flexShrink: 0,
      }}
    >
      {grade || '—'}
    </Box>
  );
}

function auditReviewPath(audit: QualityAudit): string {
  const slug = audit.form_slug || audit.audit_type || 'audit';
  return `/admin/quality-audit/run/${slug}/${audit.id}`;
}

export default function QualityAuditHubPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const createAudit = useCreateQualityAudit();
  const { data: forms, isLoading: formsLoading } = useQualityAuditForms(true);
  const { data: submittedAudits, isLoading: auditsLoading } = useQualityAudits({
    status: 'submitted',
  });

  const isSuperuser = Boolean(user?.is_superuser);
  const audits = submittedAudits ?? [];

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

  return (
    <Box>
      <PageHeader
        title="Quality Audit"
        subtitle="Choose a form to begin a floor checklist, or review past submissions."
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

      <Stack spacing={2.5} sx={{ maxWidth: 860 }}>
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
        </Stack>

        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Submitted audits
          </Typography>
          {audits.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No submitted audits yet. Complete a checklist to see history here.
            </Typography>
          ) : isNarrow ? (
            <Stack spacing={1}>
              {audits.map((audit) => (
                <Card key={audit.id} variant="outlined" sx={{ borderRadius: 2.5 }}>
                  <CardActionArea onClick={() => navigate(auditReviewPath(audit))} sx={{ p: 0 }}>
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <GradeBadge grade={audit.overall_grade} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={700} noWrap>
                            {audit.form_title || 'Audit'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block" noWrap>
                            {audit.conducted_by_name || 'Unknown'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {audit.submitted_at ? formatSubmittedAt(audit.submitted_at) : '—'}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="primary.main" fontWeight={700}>
                          Review
                        </Typography>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ))}
            </Stack>
          ) : (
            <TableContainer
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 2.5,
                bgcolor: 'background.paper',
              }}
            >
              <Table size="small" aria-label="Submitted quality audits">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 72 }}>Grade</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Form</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Auditor</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Submitted</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 88 }} align="right">
                      Action
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {audits.map((audit) => (
                    <TableRow
                      key={audit.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(auditReviewPath(audit))}
                    >
                      <TableCell>
                        <GradeBadge grade={audit.overall_grade} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {audit.form_title || 'Audit'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {audit.conducted_by_name || 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {audit.submitted_at ? formatSubmittedAt(audit.submitted_at) : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="primary.main" fontWeight={700}>
                          Review
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
