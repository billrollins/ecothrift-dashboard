import { Box, Typography } from '@mui/material';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GroupHeader } from '../../components/duty/GroupHeader';
import { StatusTag } from '../../components/duty/StatusTag';
import { TaskRow, TaskRowAction } from '../../components/duty/TaskRow';
import { dutyColors, thinScrollSx } from '../../components/duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useRoutines } from '../../hooks/useRoutines';
import { pick, t, triggerLabel } from '../../i18n/routines';
import type { Routine } from '../../api/routines.api';
import { UNASSIGNED_GROUP, groupCatalog } from './groupCatalog';
import { RoutineListHeader } from './RoutineListHeader';
import { triggerGlyphIcon } from './routineGlyphs';

function friendlyTime(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${String(m || 0).padStart(2, '0')}${suffix}`;
}

function routineMeta(routine: Routine, language: string): string {
  const trigger = triggerLabel(routine.trigger, language);
  const who = routine.assignment === 'pooled' ? t('oneShared', language) : t('each', language);
  const checks = (routine.definition?.sections ?? []).reduce((sum, s) => sum + (s.checks?.length ?? 0), 0);
  const when = routine.trigger === 'on_demand'
    ? trigger
    : `${trigger} ${t('at', language)} ${friendlyTime(routine.due_time || '')}`;
  const checkWord = checks === 1 ? t('check', language) : t('checks', language);
  return `${when} · ${who} · ${checks} ${checkWord}`;
}

export function CatalogPane({ desktop }: { desktop: boolean }) {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selectedId = Number(params.get('view') || 0) || null;
  const catalog = useRoutines();
  const groups = useMemo(
    () => groupCatalog((catalog.data ?? []).filter((routine) => routine.is_active)),
    [catalog.data],
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.paper }}>
      <RoutineListHeader
        view="catalog"
        desktop={desktop}
        onView={(next) => navigate(next === 'catalog' ? '/routines/catalog' : '/routines')}
        error={catalog.isError ? t('couldNotLoad', lang) : undefined}
      />
      <Box sx={{ flex: 1, overflow: 'auto', pb: 2, ...thinScrollSx }}>
        {groups.length ? groups.map((group) => (
          <Box key={group.name}>
            <GroupHeader
              title={group.name === UNASSIGNED_GROUP ? t('unassigned', lang) : group.name}
              count={group.routines.length}
            />
            {group.routines.map((routine) => (
              <TaskRow
                key={routine.id}
                title={pick(routine, 'title', lang) || routine.title}
                tone={routine.is_blocking ? 'violet' : 'brand'}
                glyph={triggerGlyphIcon(routine.trigger)}
                meta={routineMeta(routine, lang)}
                selected={selectedId === routine.id}
                onClick={() => navigate(`/routines/catalog?view=${routine.id}`)}
                tags={routine.is_blocking ? <StatusTag small label={t('blocking', lang)} tone="violet" /> : null}
                actions={(
                  <TaskRowAction
                    label={t('view', lang)}
                    primary={selectedId === routine.id}
                    onClick={() => navigate(`/routines/catalog?view=${routine.id}`)}
                  />
                )}
              />
            ))}
          </Box>
        )) : (
          <Typography sx={{ px: 2.5, py: 2, fontSize: 12.5, color: dutyColors.ink40, minHeight: 20 }}>
            {t('none', lang)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
