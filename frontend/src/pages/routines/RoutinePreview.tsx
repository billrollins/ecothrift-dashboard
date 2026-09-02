import { Box, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { dutyColors } from '../../components/duty/tokens';
import type { AnyRoutineResponses, RoutineDefinition, RoutineKind } from '../../api/routines.api';
import { RoutinePhoneBar } from './RoutinePhoneBar';
import { RoutineRunner } from './RoutineRunner';
import { KindRunner } from './runners/KindRunner';
import { PREVIEW_TAXONOMY, previewAudit, previewSpot, previewTally, previewWorkCycle } from './runners/previewFixtures';
import { responsesFromDefinition } from './responsesFromDefinition';

function previewResponses(kind: RoutineKind): AnyRoutineResponses {
  if (kind === 'section_tally') return previewTally();
  if (kind === 'section_audit') return previewAudit();
  if (kind === 'work_cycle') return previewWorkCycle();
  return previewSpot();
}

export function RoutinePreview({
  title,
  intro,
  definition,
  kind = 'checklist',
  mode,
}: {
  title: string;
  intro?: string;
  definition: RoutineDefinition | null | undefined;
  /** Section kinds have no authored definition; they preview from a fixture. */
  kind?: RoutineKind;
  mode: 'preview' | 'demo';
}) {
  const navigate = useNavigate();
  const responses = responsesFromDefinition(definition);
  const empty = kind === 'checklist' && responses.sections.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: dutyColors.paper }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {kind !== 'checklist' ? (
          <KindRunner
            kind={kind}
            title={title || 'Routine'}
            subject={intro || ''}
            responses={previewResponses(kind)}
            taxonomy={PREVIEW_TAXONOMY}
            verify={null}
            minItems={20}
            readOnly
          />
        ) : empty ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              px: 4,
            }}
          >
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: dutyColors.ink }}>
              {title || 'Routine'}
            </Typography>
            <Typography sx={{ mt: 1, fontSize: 13, color: dutyColors.ink60, minHeight: 20 }}>
              {intro || 'Add sections to see the live preview.'}
            </Typography>
          </Box>
        ) : (
          <RoutineRunner
            title={title || 'Routine'}
            subject={intro}
            responses={responses}
            hideFooter
            readOnly
          />
        )}
      </Box>
      <RoutinePhoneBar
        mode={mode}
        onCancel={mode === 'demo' ? () => navigate('/routines/catalog') : undefined}
      />
    </Box>
  );
}

export function RoutineIdlePhone() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: dutyColors.paper }}>
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: 4,
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '16px',
            bgcolor: dutyColors.brandSoft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 1.5,
          }}
        >
          <Typography sx={{ fontSize: 24, fontWeight: 800, color: dutyColors.brand }}>✓</Typography>
        </Box>
        <Typography sx={{ fontSize: 17, fontWeight: 700, color: dutyColors.ink }}>No routine open</Typography>
        <Typography sx={{ mt: 0.75, fontSize: 13, color: dutyColors.ink60 }}>
          Pick one on the left to fill it in.
        </Typography>
      </Box>
      <RoutinePhoneBar mode="idle" />
    </Box>
  );
}
