import { Box, useMediaQuery, useTheme } from '@mui/material';
import { useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { dutyCardSx } from '../../components/duty/cards';
import { dutyColors } from '../../components/duty/tokens';
import { FloorPage } from '../../components/layout/FloorPage';
import { PhoneFrame } from '../../components/layout/PhoneFrame';
import { useAuth } from '../../hooks/useAuth';
import { useRoutine } from '../../hooks/useRoutines';
import { t } from '../../i18n/routines';
import { CatalogPane } from './CatalogPane';
import { todayHref } from './todayRunner';
import { emptyDefinition, RoutineEditorPane, type EditorPreview } from './RoutineEditorPane';
import { RoutineIdlePhone, RoutinePreview } from './RoutinePreview';
import { routineShellMode } from './routineMode';

/** Left pane on a desk. Wide enough for two-line rows with badges and for the form sheet. */
const PANE_WIDTH = 'clamp(500px, 46%, 680px)';

/**
 * The superuser's catalog and editor. Staff routines live on Today (`/today`): the list, and
 * the runner beside it. Old run links (`/routines/run/12`, `/routines?run=12`) land there.
 */
export default function RoutinesPage() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const location = useLocation();
  const [params] = useSearchParams();
  const mode = routineShellMode(location.pathname, params);
  const [preview, setPreview] = useState<EditorPreview>({
    title: '',
    intro: '',
    definition: emptyDefinition(),
  });
  const viewId = Number(params.get('view') || 0) || null;
  const demo = useRoutine(mode === 'demo' ? viewId : null);

  if (mode === 'fill') {
    const target = todayHref(`${location.pathname}${location.search}`);
    return <Navigate to={target.startsWith('/today') ? target : '/today'} replace />;
  }
  if (mode === 'mine' || !user?.is_superuser) {
    return <Navigate to="/today" replace />;
  }

  const left = mode === 'edit' ? (
    <RoutineEditorPane wide={desktop} onPreviewChange={setPreview} />
  ) : (
    <CatalogPane desktop={desktop} />
  );

  const phone = mode === 'edit' ? (
    <RoutinePreview
      title={preview.title}
      intro={preview.intro}
      definition={preview.definition}
      kind={preview.kind}
      mode="preview"
      taxonomy={preview.taxonomy}
      sections={preview.sections}
    />
  ) : mode === 'demo' ? (
    <RoutinePreview
      title={demo.data?.title || 'Routine'}
      intro={demo.data?.intro}
      definition={demo.data?.definition}
      kind={demo.data?.kind}
      mode="demo"
      taxonomy={demo.data?.runner?.taxonomy}
      sections={demo.data?.runner?.sections}
    />
  ) : (
    <RoutineIdlePhone />
  );

  if (!desktop) {
    if (mode === 'demo') {
      return (
        <Box sx={{ height: '100%', minHeight: 0, display: 'flex' }}>
          <PhoneFrame framed={false} background={dutyColors.paper} contentSx={{ overflow: 'hidden' }}>
            {phone}
          </PhoneFrame>
        </Box>
      );
    }
    return (
      <Box sx={{ height: '100%', minHeight: 0, bgcolor: dutyColors.paper }}>
        {left}
      </Box>
    );
  }

  return (
    <FloorPage title={t('routines', lang)} fill>
      <Box
        sx={{
          ...dutyCardSx,
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `${PANE_WIDTH} 1fr`,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            borderRight: `1px solid ${dutyColors.ink15}`,
          }}
        >
          {left}
        </Box>
        <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', p: 2 }}>
          <PhoneFrame
            framed
            stage
            inset
            background={dutyColors.paper}
            contentSx={{ overflow: 'hidden' }}
          >
            {phone}
          </PhoneFrame>
        </Box>
      </Box>
    </FloorPage>
  );
}
