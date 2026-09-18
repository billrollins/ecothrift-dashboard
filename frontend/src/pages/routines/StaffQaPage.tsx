import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { dutyColors, thinScrollSx } from '../../components/duty/tokens';
import { FloorPage } from '../../components/layout/FloorPage';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useAuth } from '../../hooks/useAuth';
import { useQaMine } from '../../hooks/useRetailQa';
import { t } from '../../i18n/routines';
import { GradeCard, LetterChip } from '../admin/routines/gradeParts';
import { thirdsLine } from '../admin/retailqa/qaShared';

export default function StaffQaPage() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const mine = useQaMine();
  const data = mine.data;

  if (mine.isLoading && !data) return <LoadingScreen message={t('staffQa', lang)} />;

  return (
    <FloorPage title={t('staffQa', lang)} subtitle={t('staffQaTitle', lang)}>
      <Box sx={{ ...thinScrollSx, overflowY: 'auto', pb: 3 }}>
        {data?.under_review ? (
          <GradeCard tone="warn">
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{t('underReview', lang)}</Typography>
          </GradeCard>
        ) : null}

        <GradeCard>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <LetterChip letter={data?.store.letter ?? null} size="lg" />
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{t('thisWeek', lang)}</Typography>
              <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>
                {thirdsLine(data?.store.thirds)}
              </Typography>
              {data?.store.projected ? (
                <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>
                  {thirdsLine(data.store.projected)}
                  {data.store.projected.letter ? ` → ${data.store.projected.letter}` : ''}
                </Typography>
              ) : null}
            </Box>
          </Box>
        </GradeCard>

        <Section title={t('dueToday', lang)}>
          {data?.today.length ? data.today.map((row) => (
            <Row key={row.id} title={row.title} meta={row.status} onClick={() => navigate(row.href)} />
          )) : <Empty />}
        </Section>

        <Section title={`${t('thisWeek', lang)} · ${data?.week.done ?? 0} ${t('approved', lang).toLowerCase()}`}>
          {data?.week.items.length ? data.week.items.map((row) => (
            <Row key={row.id} title={row.title} meta={`${row.date} · ${row.status}`} onClick={() => navigate(row.href)} />
          )) : <Empty />}
        </Section>

        <Section title="Spots">
          {data?.my_sections.spots.length ? data.my_sections.spots.map((row, index) => (
            <Row key={`${row.section}-${index}`} title={row.section} meta={`${row.day} · ${row.score ?? '—'} · ${row.reason}`} />
          )) : <Empty />}
        </Section>

        <Section title="Cross-checks">
          {data?.my_sections.cross_checks.length ? data.my_sections.cross_checks.map((row, index) => (
            <Row key={`${row.section}-${index}`} title={row.section} meta={`${row.day} · ${row.score ?? '—'} · ${row.reason}`} />
          )) : <Empty />}
        </Section>

        <Section title="Verify">
          {data?.verifies.length ? data.verifies.map((row, index) => (
            <Row key={`${row.title}-${index}`} title={row.title} meta={`${row.day} · ${row.score ?? '—'}`} />
          )) : <Empty />}
        </Section>

        <Section title="8 weeks">
          {data?.trend.map((row) => (
            <Row
              key={row.week}
              title={row.week}
              meta={`${row.completion ?? '—'}% · spot ${row.spot_average ?? '—'}`}
            />
          ))}
        </Section>
      </Box>
    </FloorPage>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mt: 2 }}>
      <Typography sx={{ px: 0.5, mb: 0.75, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dutyColors.ink40 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Row({ title, meta, onClick }: { title: string; meta: string; onClick?: () => void }) {
  return (
    <GradeCard>
      <Box onClick={onClick} sx={{ cursor: onClick ? 'pointer' : 'default' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 650 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>{meta}</Typography>
      </Box>
    </GradeCard>
  );
}

function Empty() {
  return <Typography sx={{ px: 0.5, fontSize: 13, color: dutyColors.ink40 }}>—</Typography>;
}
