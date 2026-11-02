import { Alert, Box, Button, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getDashFixBundle } from '../../api/dashFixes.api';
import { getAppVersion } from '../../api/core.api';
import { PageHeader } from '../../components/common/PageHeader';
import { DashFixDrawer } from '../../components/dashFixes/DashFixDrawer';
import { DashFixJsonDialog } from '../../components/dashFixes/DashFixJsonDialog';
import { DashFixRowBody } from '../../components/dashFixes/DashFixRow';
import {
  VISIBLE_DONE,
  groupLine,
  moveInLine,
  nextUpId,
  projectLabel,
  sectionsFor,
  waitingOn,
} from '../../components/dashFixes/dashFixesModel';
import { aiCopyText } from '../../components/dashFixes/dashFixesFile';
import { sourcePage } from '../../components/dashFixes/rememberPage';
import { ReportFixDialog } from '../../components/dashFixes/ReportFixDialog';
import { useAuth } from '../../hooks/useAuth';
import { dashFixCountKey, dashFixesKey, useDashFixes, useMarkDashFixesSeen, useReorderDashFixes } from '../../hooks/useDashFixes';
import { t } from '../../i18n/routines';
import type { DashFixDTO } from '../../types/dashFixes.types';
import { downloadJson } from '../people/careersFile';

function SectionTitle({ children, count, testId }: { children: string; count: number; testId: string }) {
  return (
    <Typography
      component="h2"
      data-testid={testId}
      sx={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', mt: 3, mb: 0.75 }}
    >
      {children} ({count})
    </Typography>
  );
}

export default function DashFixesPage() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const isOwner = Boolean(user?.is_superuser);
  const location = useLocation();
  const { enqueueSnackbar } = useSnackbar();
  const { data: rows = [], isLoading } = useDashFixes();
  const queryClient = useQueryClient();
  const markSeen = useMarkDashFixesSeen();
  const reorder = useReorderDashFixes();
  const [openId, setOpenId] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);

  const { data: appVersion } = useQuery({
    queryKey: ['appVersion'],
    queryFn: async () => (await getAppVersion()).data,
    staleTime: Infinity,
  });

  // Opening the page marks the person's own items seen (clears their bell number).
  useEffect(() => {
    markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sections = useMemo(() => sectionsFor(rows), [rows]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const groups = useMemo(() => groupLine(sections.line), [sections.line]);
  const nextUp = useMemo(() => nextUpId(sections.line, byId), [sections.line, byId]);
  const rankOrder = useMemo(
    () => [...sections.line].sort((a, b) => a.rank - b.rank || a.id - b.id),
    [sections.line],
  );
  const open = openId ? (byId.get(openId) ?? null) : null;
  const doneShown = showAllDone ? sections.done : sections.done.slice(0, VISIBLE_DONE);

  const plainRow = (row: DashFixDTO) => (
    <DashFixRowBody key={row.id} row={row} lang={lang} onOpen={setOpenId} />
  );

  async function downloadForAi() {
    try {
      const { data } = await getDashFixBundle();
      downloadJson(data, `ecothrift-dash-fixes-for-ai-${new Date().toISOString().slice(0, 10)}.json`);
      enqueueSnackbar('Downloaded. Give the file to any AI with what you want changed, then upload its answer here.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not build the file.', { variant: 'error' });
    }
  }

  async function copyForAi() {
    try {
      const { data } = await getDashFixBundle();
      await navigator.clipboard.writeText(aiCopyText(data));
      enqueueSnackbar('Copied. Paste it into any AI chat, write what you want changed, then paste the answer back here.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not copy. Use Download for AI instead.', { variant: 'error' });
    }
  }

  return (
    <Box sx={{ maxWidth: 900, width: '100%', mx: 'auto', pb: 6 }}>
      <PageHeader
        title={t('dashFixes', lang)}
        subtitle={t('fxPageSub', lang)}
        action={
          <Button variant="contained" onClick={() => setReportOpen(true)} data-testid="report-fix-button" sx={{ minHeight: 44 }}>
            {t('reportFix', lang)}
          </Button>
        }
      />

      {isOwner ? (
        <Box data-testid="fix-json-tools" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Button variant="outlined" onClick={downloadForAi}>Download for AI (.json)</Button>
          <Button variant="outlined" onClick={copyForAi}>Copy for AI</Button>
          <Button variant="outlined" onClick={() => setJsonOpen(true)}>Upload or paste JSON</Button>
        </Box>
      ) : null}

      {isLoading ? <Typography>{t('fxLoading', lang)}</Typography> : null}

      <SectionTitle count={sections.line.length} testId="fix-section-line">{t('fxInLine', lang)}</SectionTitle>
      {sections.line.length === 0 ? (
        <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>{t('fxEmptyLine', lang)}</Typography>
      ) : (
        <Box data-testid="fix-line" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
          {groups.map((group) => (
            <Box key={group.project ? `p:${group.project}` : `t:${group.items[0].id}`} data-testid={group.project ? `fix-group-${group.project}` : undefined}>
              {group.project ? (
                <Typography sx={{ px: 1.5, py: 0.75, bgcolor: 'action.hover', fontWeight: 800, fontSize: 13.5 }}>
                  {group.project}
                </Typography>
              ) : null}
              {group.items.map((row) => {
                const index = rankOrder.findIndex((other) => other.id === row.id);
                return (
                  <DashFixRowBody
                    key={row.id}
                    row={row}
                    lang={lang}
                    number={row.rank || undefined}
                    project={group.project ? projectLabel(row, rows, lang) : undefined}
                    after={waitingOn(row, byId)}
                    nextUp={row.id === nextUp}
                    onOpen={setOpenId}
                    reorder={
                      isOwner
                        ? {
                            canUp: index > 0,
                            canDown: index < rankOrder.length - 1,
                            onUp: () => reorder.mutate(moveInLine(rankOrder, row.id, -1)),
                            onDown: () => reorder.mutate(moveInLine(rankOrder, row.id, 1)),
                          }
                        : undefined
                    }
                  />
                );
              })}
            </Box>
          ))}
        </Box>
      )}

      {sections.waiting.length > 0 ? (
        <>
          <SectionTitle count={sections.waiting.length} testId="fix-section-waiting">{t('fxWaiting', lang)}</SectionTitle>
          <Box data-testid="fix-waiting" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
            {sections.waiting.map(plainRow)}
          </Box>
        </>
      ) : null}

      {sections.hold.length > 0 ? (
        <>
          <SectionTitle count={sections.hold.length} testId="fix-section-hold">{t('fxOnHold', lang)}</SectionTitle>
          <Box data-testid="fix-hold" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
            {sections.hold.map(plainRow)}
          </Box>
        </>
      ) : null}

      {sections.done.length > 0 ? (
        <>
          <SectionTitle count={sections.done.length} testId="fix-section-done">{t('fxDone', lang)}</SectionTitle>
          <Box data-testid="fix-done-list" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
            {doneShown.map(plainRow)}
          </Box>
          {sections.done.length > VISIBLE_DONE ? (
            <Button sx={{ mt: 0.5 }} onClick={() => setShowAllDone((value) => !value)} data-testid="fix-done-toggle">
              {showAllDone ? t('fxShowFewerDone', lang) : t('fxShowAllDone', lang).replace('{n}', String(sections.done.length))}
            </Button>
          ) : null}
        </>
      ) : null}

      {sections.declined.length > 0 ? (
        <>
          <SectionTitle count={sections.declined.length} testId="fix-section-declined">{t('fxNotDoing', lang)}</SectionTitle>
          <Box data-testid="fix-declined" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
            {sections.declined.map(plainRow)}
          </Box>
        </>
      ) : null}

      {reorder.isError ? <Alert severity="error" sx={{ mt: 2 }}>{t('fxActionFailed', lang)}</Alert> : null}

      <DashFixDrawer
        fix={open}
        lang={lang}
        isOwner={isOwner}
        appVersion={appVersion?.version ?? ''}
        onClose={() => setOpenId(null)}
      />
      <ReportFixDialog open={reportOpen} onClose={() => setReportOpen(false)} pagePath={sourcePage(location.pathname)} />
      {isOwner ? (
        <DashFixJsonDialog
          open={jsonOpen}
          onClose={() => setJsonOpen(false)}
          onSaved={() => {
            setJsonOpen(false);
            void queryClient.invalidateQueries({ queryKey: dashFixesKey });
            void queryClient.invalidateQueries({ queryKey: dashFixCountKey });
            enqueueSnackbar('Dash Fixes saved', { variant: 'success' });
          }}
        />
      ) : null}
    </Box>
  );
}
