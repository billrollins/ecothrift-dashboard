import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { Alert, Box, Button, Checkbox, Chip, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import type { AiAction, Question } from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { AiHelpBar } from './AiHelpBar';

/**
 * A role's interview questions (owner 2026-10-12): the scorecard asks each one with 1–5 stars and a note. Add, edit,
 * reorder and delete one at a time, or have AI review the whole list and accept its changes all at once or one by
 * one. A question keeps its key when its words change, so earlier scorecards stay linked. Nothing saves until Save.
 */

type Change = 'keep' | 'edit' | 'new';
type Proposed = { key: string; label: string; change: Change; was: string; why: string };
type Removed = { key: string; label: string; why: string };
export type Proposal = { questions: Proposed[]; removed: Removed[]; summary: string };

const QUESTION_ACTIONS: { key: AiAction; label: string }[] = [
  { key: 'review', label: 'Review the list' },
  { key: 'shorter', label: 'Fewer, sharper' },
  { key: 'polish', label: 'Polish the wording' },
  { key: 'voice', label: 'In my voice' },
];

const CHIP: Record<Change | 'remove', { label: string; color: string; bg: string }> = {
  keep: { label: 'Keep', color: ccTokens.ink2, bg: ccTokens.neuTint },
  edit: { label: 'Reworded', color: ccTokens.warnText, bg: ccTokens.warnTint },
  new: { label: 'New', color: ccTokens.goodText, bg: ccTokens.goodTint },
  remove: { label: 'Drop', color: ccTokens.badText, bg: ccTokens.badTint },
};

function newKey(label: string, taken: Set<string>): string {
  const base = `q_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'question'}`;
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`;
  taken.add(key);
  return key;
}

/**
 * The list after the ticked AI changes: kept and reworded questions keep their keys (scorecards stay linked); new ones
 * get a key; a drop that wasn't ticked, or a question the AI left out, stays at the end.
 */
export function applyProposal(value: Question[], proposal: Proposal, take: Set<string>): Question[] {
  const byKey = new Map(value.map((q) => [q.key, q]));
  const taken = new Set(value.map((q) => q.key));
  const out: Question[] = [];
  proposal.questions.forEach((p, i) => {
    const yes = take.has(String(i));
    if (p.change === 'new') {
      if (yes) out.push({ key: newKey(p.label, taken), label: p.label, type: 'text', required: false });
      return;
    }
    const old = byKey.get(p.key);
    if (!old) return;
    out.push(p.change === 'edit' && yes ? { ...old, label: p.label } : old);
    byKey.delete(p.key);
  });
  for (const q of byKey.values()) if (!take.has(`rm:${q.key}`)) out.push(q);
  return out;
}

export function InterviewQuestionsEditor({
  value,
  onChange,
  role,
}: {
  value: Question[];
  onChange: (questions: Question[]) => void;
  /** The role's words, for the AI. */
  role: () => Record<string, unknown>;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  // Which proposed changes to take: the index in proposal.questions, or `rm:<key>` for a drop.
  const [take, setTake] = useState<Set<string>>(new Set());

  const update = (i: number, label: string) => onChange(value.map((q, j) => (j === i ? { ...q, label } : q)));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = () => {
    const taken = new Set(value.map((q) => q.key));
    onChange([...value, { key: newKey(`question ${value.length + 1}`, taken), label: '', type: 'text', required: false }]);
  };

  function showProposal(p: Proposal) {
    setProposal(p);
    const picked = new Set<string>();
    p.questions.forEach((q, i) => q.change !== 'keep' && picked.add(String(i)));
    p.removed.forEach((r) => picked.add(`rm:${r.key}`));
    setTake(picked);
  }

  function apply() {
    if (!proposal) return;
    onChange(applyProposal(value, proposal, take));
    setProposal(null);
  }

  const toggle = (id: string) =>
    setTake((t) => {
      const next = new Set(t);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Box data-testid="interview-questions">
      <Typography fontWeight={700}>Interview questions</Typography>
      <Typography variant="body2" sx={{ color: ccTokens.ink2, mb: 1 }}>
        The scorecard asks these, in this order, each with 1–5 stars and a note.
      </Typography>
      <Stack spacing={1}>
        {value.map((q, i) => (
          <Box key={q.key} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <Typography sx={{ width: 22, pt: 1, color: ccTokens.ink3, fontWeight: 700, textAlign: 'right' }}>{i + 1}.</Typography>
            <TextField
              size="small"
              value={q.label}
              placeholder="Type the question"
              onChange={(e) => update(i, e.target.value)}
              multiline
              fullWidth
              inputProps={{ 'aria-label': `Question ${i + 1}` }}
            />
            <Tooltip title="Move up">
              <span>
                <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUpward fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Move down">
              <span>
                <IconButton size="small" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => remove(i)} aria-label={`Delete question ${i + 1}`}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
        <Box>
          <Button size="small" onClick={add}>
            Add a question
          </Button>
        </Box>
      </Stack>

      <Box sx={{ mt: 1.5 }}>
        <AiHelpBar<Proposal>
          what="the interview questions"
          actions={QUESTION_ACTIONS}
          payload={() => ({
            kind: 'questions',
            questions: value.filter((q) => q.label.trim()).map((q) => ({ key: q.key, label: q.label.trim() })),
            role: role(),
          })}
          onResult={(job) => showProposal(job.result)}
        />
      </Box>

      {proposal && (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: ccTokens.r, border: '1px solid #e2dcf0', bgcolor: '#fbfaff' }} data-testid="questions-proposal">
          {proposal.summary && <Alert severity="info" sx={{ mb: 1 }}>{proposal.summary}</Alert>}
          <Stack spacing={0.75}>
            {proposal.questions.map((p, i) => (
              <Box key={`${p.key}-${i}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Checkbox
                  size="small"
                  checked={p.change === 'keep' || take.has(String(i))}
                  disabled={p.change === 'keep'}
                  onChange={() => toggle(String(i))}
                  sx={{ p: 0.5 }}
                />
                <Chip size="small" label={CHIP[p.change].label} sx={{ color: CHIP[p.change].color, bgcolor: CHIP[p.change].bg, fontWeight: 700, mt: 0.25 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14 }}>{p.label}</Typography>
                  {p.change === 'edit' && (
                    <Typography sx={{ fontSize: 12, color: ccTokens.ink3, textDecoration: 'line-through' }}>{p.was}</Typography>
                  )}
                  {p.why && <Typography sx={{ fontSize: 12, color: ccTokens.ink2 }}>{p.why}</Typography>}
                </Box>
              </Box>
            ))}
            {proposal.removed.map((r) => (
              <Box key={`rm-${r.key}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Checkbox size="small" checked={take.has(`rm:${r.key}`)} onChange={() => toggle(`rm:${r.key}`)} sx={{ p: 0.5 }} />
                <Chip size="small" label={CHIP.remove.label} sx={{ color: CHIP.remove.color, bgcolor: CHIP.remove.bg, fontWeight: 700, mt: 0.25 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, textDecoration: 'line-through' }}>{r.label}</Typography>
                  {r.why && <Typography sx={{ fontSize: 12, color: ccTokens.ink2 }}>{r.why}</Typography>}
                </Box>
              </Box>
            ))}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
            <Button variant="contained" size="small" onClick={apply}>
              Use the ticked changes
            </Button>
            <Button size="small" onClick={() => setProposal(null)}>
              Dismiss
            </Button>
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: ccTokens.ink3 }}>
            Nothing is saved until you press Save on the role.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
