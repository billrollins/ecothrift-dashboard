import { useEffect, useState } from 'react';
import { Box, Button, Drawer, Stack, TextField, Typography } from '@mui/material';
import type { IssueAction, IssueKind, Section } from '../../../api/stocktake.api';
import { PROBLEM_RULES, REPORTABLE } from './countProblems';

export interface SheetAnswer {
  kind: IssueKind;
  action: IssueAction;
  detail: string;
  targetSectionId: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** What the sheet is about: the code and, when known, the item. */
  code: string;
  title: string;
  price: string | null;
  /** A known problem, or null to let the person pick one first. */
  kind: IssueKind | null;
  /** Shown under the heading, e.g. where the tag was scanned before. */
  context?: string;
  sections: Section[];
  currentSectionId: number | null;
  busy: boolean;
  onAnswer: (answer: SheetAnswer) => void;
  /** Take the scan out of the count (or put it back). Hidden when not given. */
  onRemove?: () => void;
  removed?: boolean;
}

const big = { py: 1.5, fontWeight: 800, fontSize: 16, textTransform: 'none' as const };

/** The bottom sheet for a problem: big buttons, an answer in a tap or two. */
export default function ProblemSheet(props: Props) {
  const { open, onClose, code, title, price, context, sections, currentSectionId, busy, onAnswer, onRemove, removed } = props;
  const [picked, setPicked] = useState<IssueKind | null>(props.kind);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (open) {
      setPicked(props.kind);
      setDetail('');
    }
  }, [open, props.kind]);

  const rule = picked ? PROBLEM_RULES[picked] : null;
  const send = (action: IssueAction, targetSectionId: number | null = null) => {
    if (picked) onAnswer({ kind: picked, action, detail: detail.trim(), targetSectionId });
  };

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose} PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}>
      <Box sx={{ p: 2, pb: 3, width: '100%', maxWidth: 560, mx: 'auto' }}>
        <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 18 }}>{code || 'No tag'}</Typography>
        {(title || price) && (
          <Typography sx={{ color: 'text.secondary', mb: 0.5 }}>
            {title}
            {price ? ` · $${Number(price).toFixed(2)}` : ''}
          </Typography>
        )}

        {!rule && !removed && (
          <>
            <Typography sx={{ fontWeight: 800, mt: 1, mb: 1 }}>What is wrong with it?</Typography>
            <Stack spacing={1}>
              {REPORTABLE.map((k) => (
                <Button key={k} variant="outlined" fullWidth sx={big} onClick={() => setPicked(k)}>
                  {PROBLEM_RULES[k].title}
                </Button>
              ))}
            </Stack>
          </>
        )}

        {rule && (
          <>
            <Typography sx={{ fontWeight: 900, fontSize: 20, mt: 1 }}>{rule.title}</Typography>
            <Typography sx={{ color: 'text.secondary', mb: 1.5 }}>{context || rule.help}</Typography>
            {rule.ask && (
              <TextField
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder={rule.ask}
                size="small"
                fullWidth
                sx={{ mb: 1.5 }}
                inputProps={{ maxLength: 200, 'aria-label': rule.ask }}
              />
            )}
            {rule.pickSection && (
              <>
                <Typography sx={{ fontWeight: 700, mb: 0.75 }}>Put it in the relocate cart. Where does it belong?</Typography>
                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
                  {sections
                    .filter((s) => s.id !== currentSectionId)
                    .map((s) => (
                      <Button key={s.id} variant="contained" disabled={busy} sx={{ ...big, py: 1 }} onClick={() => send('relocate', s.id)}>
                        {s.name}
                      </Button>
                    ))}
                  <Button variant="outlined" disabled={busy} sx={{ ...big, py: 1 }} onClick={() => send('relocate')}>
                    Not sure
                  </Button>
                </Stack>
              </>
            )}
            <Stack spacing={1}>
              {rule.answers
                .filter((a) => !(rule.pickSection && a.action === 'relocate'))
                .map((a, i) => (
                  <Button
                    key={a.action}
                    variant={i === 0 && !rule.pickSection ? 'contained' : 'outlined'}
                    fullWidth
                    disabled={busy}
                    sx={big}
                    onClick={() => send(a.action)}
                  >
                    {a.label}
                  </Button>
                ))}
            </Stack>
          </>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          {onRemove && (
            <Button color={removed ? 'primary' : 'error'} disabled={busy} onClick={onRemove} sx={{ textTransform: 'none', fontWeight: 700 }}>
              {removed ? 'Put this scan back' : 'Remove this scan'}
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
