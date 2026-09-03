import { Box, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dutyColors } from '../../components/duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/routines';
import type {
  AnyRoutineResponses,
  AuditTaxonomy,
  OwnerSpotResponses,
  RoutineDefinition,
  RoutineKind,
  SectionTallyResponses,
} from '../../api/routines.api';
import { RoutinePhoneBar } from './RoutinePhoneBar';
import { RoutineRunner } from './RoutineRunner';
import { KindRunner } from './runners/KindRunner';
import {
  PREVIEW_TAXONOMY,
  previewAudit,
  previewSpot,
  previewTally,
  previewWorkCycle,
} from './runners/previewFixtures';
import { responsesFromDefinition } from './responsesFromDefinition';

const EMPTY_SECTIONS: Array<{ id: number; name: string }> = [];

function pickOther(ids: number[], current: number | null): number | null {
  const pool = current == null ? ids : ids.filter((id) => id !== current);
  if (!pool.length) return current;
  return pool[Math.floor(Math.random() * pool.length)];
}

function tallyFor(id: number, name: string): SectionTallyResponses {
  return {
    sections: [{
      section_id: id,
      section_name: name,
      counts: {},
      flags: [],
      photo: null,
      photo_file_id: null,
      notes: '',
    }],
  };
}

function spotFor(id: number | null, name: string): OwnerSpotResponses {
  const base = previewSpot();
  return {
    ...base,
    audit: previewAudit(name, id ?? 0),
  };
}

export function RoutinePreview({
  title,
  intro,
  definition,
  kind = 'checklist',
  mode,
  taxonomy,
  sections = EMPTY_SECTIONS,
}: {
  title: string;
  intro?: string;
  definition: RoutineDefinition | null | undefined;
  /** Section kinds have no authored definition; they preview from a fixture. */
  kind?: RoutineKind;
  mode: 'preview' | 'demo';
  taxonomy?: AuditTaxonomy | null;
  sections?: Array<{ id: number; name: string }>;
}) {
  const responses = responsesFromDefinition(definition);
  const empty = kind === 'checklist' && responses.sections.length === 0;
  const floor = sections;
  const idsKey = useMemo(() => floor.map((row) => row.id).join(','), [floor]);
  const names = useMemo(
    () => Object.fromEntries(floor.map((row) => [row.id, row.name])),
    [idsKey],
  );
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [tally, setTally] = useState<SectionTallyResponses>(previewTally());
  const [spot, setSpot] = useState<OwnerSpotResponses>(previewSpot());
  const seededFor = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',').map(Number) : [];
    if (!ids.length) {
      setSectionId(null);
      setTally({ sections: [] });
      setSpot(spotFor(null, ''));
      return;
    }
    setSectionId((current) => (
      current != null && ids.includes(current) ? current : pickOther(ids, null)
    ));
  }, [idsKey]);

  useEffect(() => {
    if (sectionId == null) {
      seededFor.current = null;
      return;
    }
    if (seededFor.current === sectionId) return;
    seededFor.current = sectionId;
    const name = names[sectionId] || '';
    setTally(tallyFor(sectionId, name));
    setSpot(spotFor(sectionId, name));
  }, [sectionId, names]);

  function reroll() {
    const ids = idsKey ? idsKey.split(',').map(Number) : [];
    const next = pickOther(ids, sectionId);
    if (next == null) return;
    seededFor.current = next;
    setSectionId(next);
    setTally(tallyFor(next, names[next] || ''));
    setSpot((prev) => ({
      ...prev,
      audit: previewAudit(names[next] || '', next),
    }));
  }

  const sectionKind = kind !== 'checklist' && kind !== 'work_cycle';
  const liveTaxonomy = taxonomy || PREVIEW_TAXONOMY;
  const previewResponses: AnyRoutineResponses = kind === 'section_tally'
    ? tally
    : kind === 'section_audit'
      ? previewAudit(names[sectionId ?? 0] || 'Sample section', sectionId ?? 1)
      : kind === 'work_cycle'
        ? previewWorkCycle()
        : spot;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: dutyColors.paper }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {kind !== 'checklist' ? (
          <KindRunner
            kind={kind}
            title={title || 'Routine'}
            subject={intro || ''}
            responses={previewResponses}
            taxonomy={liveTaxonomy}
            verify={null}
            minItems={0}
            readOnly={false}
            sections={floor}
            reroll={sectionKind && kind !== 'section_audit'
              ? { onClick: reroll, disabled: idsKey.split(',').filter(Boolean).length < 2 }
              : undefined}
            onChange={(next) => {
              if (kind === 'section_tally') setTally(next as SectionTallyResponses);
              if (kind === 'owner_spot') setSpot(next as OwnerSpotResponses);
            }}
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
      <RoutinePhoneBar mode={mode} />
    </Box>
  );
}

export function RoutineIdlePhone() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
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
        <Typography sx={{ fontSize: 17, fontWeight: 700, color: dutyColors.ink }}>{t('noRoutineOpen', lang)}</Typography>
        <Typography sx={{ mt: 0.75, fontSize: 13, color: dutyColors.ink60 }}>
          {t('pickOneLeft', lang)}
        </Typography>
      </Box>
      <RoutinePhoneBar mode="idle" />
    </Box>
  );
}
