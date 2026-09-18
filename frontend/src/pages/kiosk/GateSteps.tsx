import { useMemo, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import type { GateItem, GateMissed, GateNudge, GatePayload } from '../../api/kiosk.api';
import { MISS_REASON_KEYS, tk, type AppLanguage } from '../../i18n/kiosk';
import { bigButtonSx, kioskColors, mediumButtonSx } from './kioskTheme';
import { dayClockLabel } from './kioskLang';

type Answer = { reason: string; note: string };

/** True when every gate item that needs an answer has one. */
export function gateComplete(items: GateItem[], payload: GatePayload): boolean {
  for (const item of items) {
    if (item.kind === 'stale_punch') return false;
    if (item.kind === 'missed_routines') {
      const given = new Map((payload.missed_routines ?? []).map((row) => [row.run, row]));
      for (const run of item.runs) {
        const row = given.get(run.id);
        if (!row || !row.reason) return false;
        if (row.reason === 'other' && !(row.note ?? '').trim()) return false;
      }
    }
    if (item.kind === 'nudge') {
      const heard = new Set(payload.nudge ?? []);
      for (const nudge of item.nudges) if (!heard.has(nudge.id)) return false;
    }
  }
  return true;
}

function MissedStep({ item, lang, onDone }: { item: GateMissed; lang: AppLanguage; onDone: (rows: NonNullable<GatePayload['missed_routines']>) => void }) {
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [sameForAll, setSameForAll] = useState<string>('');

  function setReason(runId: number, reason: string) {
    setAnswers((prev) => ({ ...prev, [runId]: { reason, note: prev[runId]?.note ?? '' } }));
  }
  function setNote(runId: number, note: string) {
    setAnswers((prev) => ({ ...prev, [runId]: { reason: prev[runId]?.reason ?? '', note } }));
  }
  function applyAll(reason: string) {
    setSameForAll(reason);
    setAnswers((prev) => {
      const next = { ...prev };
      for (const run of item.runs) next[run.id] = { reason, note: prev[run.id]?.note ?? '' };
      return next;
    });
  }

  const ready = item.runs.every((run) => {
    const row = answers[run.id];
    return row?.reason && (row.reason !== 'other' || row.note.trim());
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography sx={{ fontSize: 30, fontWeight: 900, color: kioskColors.ink }}>{tk('missedTitle', lang)}</Typography>
        <Typography sx={{ fontSize: 18, color: kioskColors.ink60 }}>{tk('missedHint', lang)}</Typography>
      </Box>
      {item.runs.length > 1 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Typography sx={{ color: kioskColors.ink60, fontWeight: 700, mr: 1 }}>{tk('sameForAll', lang)}</Typography>
          {MISS_REASON_KEYS.filter((r) => r.code !== 'other').map((r) => (
            <Button
              key={r.code}
              variant={sameForAll === r.code ? 'contained' : 'outlined'}
              onClick={() => applyAll(r.code)}
              sx={{ ...mediumButtonSx, minHeight: 44, fontSize: 15, color: sameForAll === r.code ? '#fff' : kioskColors.ink, borderColor: kioskColors.panelEdge }}
            >
              {tk(r.key, lang)}
            </Button>
          ))}
        </Box>
      ) : null}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '48vh', overflowY: 'auto', pr: 1 }}>
        {item.runs.map((run) => {
          const row = answers[run.id];
          return (
            <Box key={run.id} data-testid={`gate-run-${run.id}`} sx={{ p: 2, borderRadius: 2.5, bgcolor: 'rgba(255,255,255,0.05)', border: `1px solid ${kioskColors.panelEdge}` }}>
              <Typography sx={{ fontSize: 20, fontWeight: 800, color: kioskColors.ink }}>
                {run.title}
                {run.subject ? <Box component="span" sx={{ color: kioskColors.ink60, fontWeight: 600 }}>{` · ${run.subject}`}</Box> : null}
              </Typography>
              <Typography sx={{ color: kioskColors.ink40, fontSize: 15, mb: 1.25 }}>{dayClockLabel(run.due_at, lang)}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {MISS_REASON_KEYS.map((r) => (
                  <Button
                    key={r.code}
                    variant={row?.reason === r.code ? 'contained' : 'outlined'}
                    onClick={() => setReason(run.id, r.code)}
                    sx={{ ...mediumButtonSx, minHeight: 48, fontSize: 16, color: row?.reason === r.code ? '#fff' : kioskColors.ink, borderColor: kioskColors.panelEdge }}
                  >
                    {tk(r.key, lang)}
                  </Button>
                ))}
              </Box>
              {row?.reason === 'other' ? (
                <TextField
                  autoFocus
                  fullWidth
                  size="medium"
                  placeholder={tk('reasonOtherNote', lang)}
                  value={row.note}
                  onChange={(e) => setNote(run.id, e.target.value.slice(0, 200))}
                  sx={{ mt: 1.5, '& .MuiInputBase-root': { bgcolor: '#fff', fontSize: 18 } }}
                />
              ) : null}
            </Box>
          );
        })}
      </Box>
      <Button
        variant="contained"
        disabled={!ready}
        onClick={() => onDone(item.runs.map((run) => ({ run: run.id, reason: answers[run.id].reason, note: answers[run.id].note.trim() })))}
        sx={{ ...bigButtonSx, alignSelf: 'flex-end', bgcolor: kioskColors.brand }}
      >
        {tk('next', lang)}
      </Button>
    </Box>
  );
}

function NudgeStep({ item, lang, onDone }: { item: GateNudge; lang: AppLanguage; onDone: (ids: number[]) => void }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography sx={{ fontSize: 30, fontWeight: 900, color: kioskColors.ink }}>{tk('nudgeTitle', lang)}</Typography>
        <Typography sx={{ fontSize: 18, color: kioskColors.ink60 }}>{tk('nudgeHint', lang)}</Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '48vh', overflowY: 'auto' }}>
        {item.nudges.map((nudge) => (
          <Box key={nudge.id} sx={{ p: 2, borderRadius: 2.5, bgcolor: 'rgba(255,255,255,0.05)', border: `1px solid ${kioskColors.panelEdge}` }}>
            <Typography sx={{ fontSize: 21, fontWeight: 700, color: kioskColors.ink }}>{nudge.message || nudge.routine_title}</Typography>
            <Typography sx={{ color: kioskColors.ink40, fontSize: 15 }}>
              {[nudge.routine_title, dayClockLabel(nudge.created_at, lang)].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        ))}
      </Box>
      <Button variant="contained" onClick={() => onDone(item.nudges.map((n) => n.id))} sx={{ ...bigButtonSx, alignSelf: 'flex-end', bgcolor: kioskColors.brand }}>
        {tk('heard', lang)}
      </Button>
    </Box>
  );
}

/**
 * Walks the clock-in gate one item at a time. Answers stay in memory here and
 * are handed back as the gate payload; nothing is saved until clock-in succeeds.
 */
export function GateSteps({ items, lang, onComplete }: { items: GateItem[]; lang: AppLanguage; onComplete: (payload: GatePayload) => void }) {
  const steps = useMemo(() => items.filter((item) => item.kind !== 'stale_punch'), [items]);
  const [index, setIndex] = useState(0);
  const [payload, setPayload] = useState<GatePayload>({});
  const step = steps[index];

  function advance(next: GatePayload) {
    if (index + 1 >= steps.length) onComplete(next);
    else {
      setPayload(next);
      setIndex(index + 1);
    }
  }

  if (!step) return null;
  return (
    <Box>
      <Typography sx={{ color: kioskColors.ink40, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 13, mb: 1 }}>
        {tk('beforeYouClockIn', lang)}
        {steps.length > 1 ? ` · ${index + 1}/${steps.length}` : ''}
      </Typography>
      {step.kind === 'missed_routines' ? (
        <MissedStep key={index} item={step} lang={lang} onDone={(rows) => advance({ ...payload, missed_routines: rows })} />
      ) : (
        <NudgeStep key={index} item={step} lang={lang} onDone={(ids) => advance({ ...payload, nudge: ids })} />
      )}
    </Box>
  );
}
