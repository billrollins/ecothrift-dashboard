// All eight steps at a glance: state, open lines, what they cost. Click one to go there.
import { Box, ButtonBase } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import type { PrepStepState, StepKey } from '../../../api/prepSteps.api';
import { cost, tone } from './tokens';

export default function StepRail({ steps, current, onGo, busy }: { steps: PrepStepState[]; current: StepKey; onGo: (s: StepKey) => void; busy: boolean }) {
  return (
    <Box role="navigation" aria-label="Steps" sx={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 0.75 }}>
      {steps.map((s, i) => {
        const on = s.key === current;
        const done = s.state === 'done';
        const seen = !!s.state;
        return (
          <ButtonBase
            key={s.key}
            disabled={busy}
            onClick={() => onGo(s.key)}
            aria-current={on ? 'step' : undefined}
            aria-label={`${s.label}: ${seen ? `${s.open} open` : 'not yet'}`}
            data-testid={`rail-${s.key}`}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 1.25, height: 52, borderRadius: 1, justifyContent: 'flex-start',
              border: `2px solid ${on ? tone.after : tone.line}`, bgcolor: on ? '#fff' : done ? tone.goodSoft : seen ? '#fff' : tone.head,
              textAlign: 'left',
            }}
          >
            <Box
              sx={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: done ? '#fff' : on ? '#fff' : tone.inkSoft,
                bgcolor: done ? tone.good : on ? tone.ink : 'transparent', border: done || on ? 'none' : `1.5px solid ${tone.before}`,
              }}
            >
              {done ? <CheckIcon sx={{ fontSize: 16 }} /> : i + 1}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ fontSize: 13, fontWeight: 800, color: tone.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</Box>
              <Box sx={{ fontSize: 11.5, color: tone.inkSoft, whiteSpace: 'nowrap', display: 'flex', gap: 0.75 }}>
                {seen ? (
                  <>
                    <Box component="span" sx={{ color: s.open ? '#8A5A0B' : tone.good, fontWeight: 700 }}>{s.open ? `${s.open.toLocaleString()} open` : 'none open'}</Box>
                    {s.cost > 0 && <span>{cost(s.cost)}</span>}
                  </>
                ) : (
                  <span>not yet</span>
                )}
              </Box>
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
