import { Box, useMediaQuery, useTheme } from '@mui/material';
import { useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { PhoneFrame } from '../../components/layout/PhoneFrame';
import { dutyColors } from '../../components/duty/tokens';
import { useRoutine } from '../../hooks/useRoutines';
import { CatalogPane } from './CatalogPane';
import { MyRoutinesPane } from './MyRoutinesPane';
import { emptyDefinition, RoutineEditorPane, type EditorPreview } from './RoutineEditorPane';
import { RoutineIdlePhone, RoutinePreview } from './RoutinePreview';
import { RoutineRunnerPage } from './RoutineRunnerPage';
import { routineShellMode } from './routineMode';

/** Left pane on a desk. Wide enough for two-line rows with badges and for the form sheet. */
const PANE_WIDTH = 'clamp(500px, 46%, 680px)';

export default function RoutinesPage() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const location = useLocation();
  const [params] = useSearchParams();
  const routeParams = useParams();
  const mode = routineShellMode(location.pathname, params);
  const [preview, setPreview] = useState<EditorPreview>({
    title: '',
    intro: '',
    definition: emptyDefinition(),
  });

  const runFromQuery = Number(params.get('run') || 0) || null;
  const runFromPath = routeParams.id && routeParams.id !== 'new' ? Number(routeParams.id) : null;
  const fillRunId = runFromQuery || runFromPath || undefined;
  const viewId = Number(params.get('view') || 0) || null;
  const demo = useRoutine(mode === 'demo' ? viewId : null);

  const listMode = mode === 'catalog' || mode === 'demo' ? 'catalog' : 'mine';
  const left = mode === 'edit' ? (
    <RoutineEditorPane wide={desktop} onPreviewChange={setPreview} />
  ) : listMode === 'catalog' ? (
    <CatalogPane desktop={desktop} />
  ) : (
    <MyRoutinesPane desktop={desktop} />
  );

  const phone = mode === 'fill' ? (
    <RoutineRunnerPage runId={fillRunId} />
  ) : mode === 'edit' ? (
    <RoutinePreview
      title={preview.title}
      intro={preview.intro}
      definition={preview.definition}
      kind={preview.kind}
      mode="preview"
    />
  ) : mode === 'demo' ? (
    <RoutinePreview
      title={demo.data?.title || 'Routine'}
      intro={demo.data?.intro}
      definition={demo.data?.definition}
      kind={demo.data?.kind}
      mode="demo"
    />
  ) : (
    <RoutineIdlePhone />
  );

  if (!desktop) {
    if (mode === 'fill' || mode === 'demo') {
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
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0, bgcolor: dutyColors.desk }}>
      <Box
        sx={{
          // Lists and editor share one width, so switching between them never
          // moves the phone. Rows get room for badges; the form stays a form.
          flex: `0 0 ${PANE_WIDTH}`,
          minWidth: 0,
          minHeight: 0,
          borderRight: `1px solid ${dutyColors.ink15}`,
        }}
      >
        {left}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
        <PhoneFrame
          framed
          flush
          stage
          background={dutyColors.paper}
          contentSx={{ overflow: 'hidden' }}
        >
          {phone}
        </PhoneFrame>
      </Box>
    </Box>
  );
}
