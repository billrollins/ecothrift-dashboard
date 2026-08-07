import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import type { QualityAudit, QualityAuditStatus } from '../../types/qualityAudit.types';
import { gradeLetterColor } from '../../components/quality-audit/qaScoring';

type HubFilter = 'all' | 'submitted' | 'draft';

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
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
        bgcolor: gradeLetterColor(grade || 'F'),
        color: '#fff',
        fontWeight: 800,
        fontSize: grade.length > 1 ? '0.85rem' : '1.1rem',
        flexShrink: 0,
      }}
    >
      {grade || '-'}
    </Box>
  );
}

function auditReviewPath(audit: QualityAudit): string {
  const slug = audit.form_slug || audit.audit_type || 'audit';
  return `/admin/quality-audit/run/${slug}/${audit.id}`;
}

function statusLabel(status: QualityAuditStatus): string {
  return status === 'submitted' ? 'Submitted' : 'In progress';
}

export default function QualityAuditHubPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const createAudit = useCreateQualityAudit();
  const { data: forms, isLoading: formsLoading } = useQualityAuditForms(true);
  const { data: allAudits, isLoading: auditsLoading } = useQualityAudits({ limit: 100 });
  const [filter, setFilter] = useState<HubFilter>('all');
  const [resumePrompt, setResumePrompt] = useState<{
    slug: string;
    title: string;
    draft: QualityAudit;
  } | null>(null);

  const isSuperuser = Boolean(user?.is_superuser);
  const audits = useMemo(() => {
    const rows = allAudits ?? [];
    if (filter === 'submitted') return rows.filter((a) => a.status === 'submitted');
    if (filter === 'draft') return rows.filter((a) => a.status === 'draft');
    return rows;
  }, [allAudits, filter]);

  const myDrafts = useMemo(() => {
    if (!user?.id) return [];
    return (allAudits ?? []).filter(
      (a) => a.status === 'draft' && a.conducted_by === user.id,
    );
  }, [allAudits, user?.id]);

  async function createAndOpen(slug: string) {
    try {
      const audit = await createAudit.mutateAsync(slug);
      navigate(`/admin/quality-audit/run/${slug}/${audit.id}`);
    } catch {
      enqueueSnackbar('Could not start audit. Try again.', { variant: 'error' });
    }
  }

  function startAudit(slug: string, title: string) {
    const existing = myDrafts.find((a) => (a.form_slug || a.audit_type) === slug);
    if (existing) {
      setResumePrompt({ slug, title, draft: existing });
      return;
    }
    void createAndOpen(slug);
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

      <Stack spacing={2.5} sx={{ maxWidth: 960 }}>
        {myDrafts.length > 0 ? (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => navigate(auditReviewPath(myDrafts[0]))}
                sx={{ fontWeight: 800 }}
              >
                Resume
              </Button>
            }
          >
            You have {myDrafts.length} in-progress audit{myDrafts.length === 1 ? '' : 's'}. Resume to
            finish and submit so the dashboard updates.
          </Alert>
        ) : null}

        <Stack spacing={1.5} sx={{ maxWidth: 640 }}>
          {forms && forms.length > 0 ? (
            forms.map((form) => (
              <Card key={form.id} variant="outlined" sx={{ borderRadius: 3 }}>
                <CardActionArea
                  onClick={() => startAudit(form.slug, form.title)}
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
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ mb: 1.25 }}
          >
            <Typography variant="subtitle2" color="text.secondary" sx={{ mr: 0.5 }}>
              Audit history
            </Typography>
            {(
              [
                ['all', 'All'],
                ['submitted', 'Submitted'],
                ['draft', 'In progress'],
              ] as const
            ).map(([key, label]) => (
              <Chip
                key={key}
                size="small"
                label={label}
                color={filter === key ? 'primary' : 'default'}
                variant={filter === key ? 'filled' : 'outlined'}
                onClick={() => setFilter(key)}
                clickable
              />
            ))}
          </Stack>

          {audits.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {filter === 'draft'
                ? 'No in-progress audits.'
                : filter === 'submitted'
                  ? 'No submitted audits yet. Complete a checklist to see history here.'
                  : 'No audits yet. Start a checklist above.'}
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
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Typography variant="body2" fontWeight={700} noWrap>
                              {audit.form_title || 'Audit'}
                            </Typography>
                            <Chip
                              size="small"
                              label={statusLabel(audit.status)}
                              color={audit.status === 'submitted' ? 'success' : 'warning'}
                              variant="outlined"
                            />
                          </Stack>
                          <Typography variant="caption" color="text.secondary" display="block" noWrap>
                            {audit.conducted_by_name || 'Unknown'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Started {formatDateTime(audit.started_at)}
                            {audit.submitted_at
                              ? ` · Submitted ${formatDateTime(audit.submitted_at)}`
                              : ''}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="primary.main" fontWeight={700}>
                          {audit.status === 'draft' ? 'Resume' : 'Review'}
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
              <Table size="small" aria-label="Quality audits">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, width: 72 }}>Grade</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Form</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 120 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Auditor</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Started</TableCell>
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
                        <Chip
                          size="small"
                          label={statusLabel(audit.status)}
                          color={audit.status === 'submitted' ? 'success' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {audit.conducted_by_name || 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(audit.started_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(audit.submitted_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="primary.main" fontWeight={700}>
                          {audit.status === 'draft' ? 'Resume' : 'Review'}
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

      <Dialog open={Boolean(resumePrompt)} onClose={() => setResumePrompt(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Resume in-progress audit?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You already have an unfinished {resumePrompt?.title || 'audit'}. Resume it, or start a new
            one (the unfinished draft stays in history).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResumePrompt(null)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!resumePrompt) return;
              const slug = resumePrompt.slug;
              setResumePrompt(null);
              void createAndOpen(slug);
            }}
          >
            Start new
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!resumePrompt) return;
              navigate(auditReviewPath(resumePrompt.draft));
              setResumePrompt(null);
            }}
          >
            Resume
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
