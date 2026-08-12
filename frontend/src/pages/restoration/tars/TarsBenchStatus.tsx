/**
 * What is on the bench, where it stands, and the ways it can leave.
 *
 * Everything here is about the item as a whole, which is why it sits apart from
 * the grade list: that answers "which grade is worth chasing", and this answers
 * "what am I holding, and what do I do with it".
 *
 * The current-grade claim is the load-bearing part. Every rate in the grade
 * list is measured from it, so an item with no claim has a table full of
 * meaningless numbers — hence the amber edge until it is answered.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { studio } from './studio/tarsStudioTheme';
import { formatDuration } from './tarsActions';
import { fmtUsd } from './tarsProfit';

export function TarsBenchStatus({
  job,
  grades,
  startingGrade,
  busy,
  partsCount,
  onClaimGrade,
  onParts,
  onHold,
  onSendBack,
  onDone,
}: {
  job: RestorationJobDTO;
  grades: string[];
  startingGrade: string;
  busy?: boolean;
  partsCount: number;
  onClaimGrade: (grade: string) => void;
  onParts: () => void;
  onHold: () => void;
  onSendBack: () => void;
  onDone: () => void;
}) {
  const note = job.queue_note?.trim();
  const sku = job.items[0]?.sku ?? job.sku ?? `Job ${job.id}`;
  const detail = [job.brand, job.category].filter(Boolean).join(' · ');
  const claimed = Boolean(startingGrade);

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      <Panel>
        <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.78rem', color: studio.accentDark }}>
          {sku}
        </Typography>
        <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', color: '#0f172a', lineHeight: 1.25 }}>
          {job.name}
        </Typography>
        {detail ? (
          <Typography sx={{ fontSize: '0.73rem', color: '#8593a5', mt: 0.15 }}>{detail}</Typography>
        ) : null}

        <Stack direction="row" spacing={1.5} sx={{ mt: 0.85 }}>
          <Stat label="RETAIL" value={job.retail ? fmtUsd(Number(job.retail)) : '—'} />
          <Stat label="ON ITEM" value={formatDuration(job.look_seconds ?? 0)} />
          <Stat label="ON GRADES" value={formatDuration(job.work_seconds ?? 0)} />
        </Stack>

        {note ? (
          <Box
            sx={{
              mt: 0.85,
              px: 0.85,
              py: 0.6,
              borderRadius: `${studio.radius.sm}px`,
              bgcolor: '#f8fafc',
              border: '1px solid #eef2f6',
            }}
          >
            <Typography sx={{ fontSize: '0.76rem', color: '#475569', lineHeight: 1.4 }}>{note}</Typography>
          </Box>
        ) : null}
      </Panel>

      <Panel warn={!claimed}>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 900, letterSpacing: 0.5, color: '#94a3b8', mb: 0.5 }}>
          IT IS AT
        </Typography>
        {grades.length === 0 ? (
          <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
            No grade scale on this item yet.
          </Typography>
        ) : (
          <Stack direction="row" spacing={0.4} flexWrap="wrap" useFlexGap>
            {grades.map((grade) => {
              const active = startingGrade === grade;
              return (
                <Box
                  key={grade}
                  component="button"
                  type="button"
                  disabled={busy}
                  onClick={() => onClaimGrade(grade)}
                  sx={{
                    px: 0.85,
                    py: 0.35,
                    cursor: 'pointer',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    borderRadius: `${studio.radius.sm}px`,
                    border: `1px solid ${active ? studio.accentDark : '#e2e8f0'}`,
                    bgcolor: active ? studio.accentDark : '#ffffff',
                    color: active ? '#ffffff' : '#64748b',
                    '&:hover:not(:disabled)': { borderColor: studio.accent },
                  }}
                >
                  {grade}
                </Box>
              );
            })}
          </Stack>
        )}
        {!claimed && grades.length > 0 ? (
          <Typography sx={{ fontSize: '0.7rem', color: '#8a5200', mt: 0.6, fontWeight: 700 }}>
            Every rate is measured from here.
          </Typography>
        ) : null}
      </Panel>

      <Panel>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={onParts}
          sx={{ ...secondaryButton, justifyContent: 'space-between' }}
        >
          Parts list
          <Box
            component="span"
            sx={{
              px: 0.6,
              borderRadius: '999px',
              fontSize: '0.66rem',
              fontWeight: 900,
              bgcolor: partsCount > 0 ? studio.accentSoft : '#f1f5f9',
              color: partsCount > 0 ? studio.accentDark : '#94a3b8',
            }}
          >
            {partsCount}
          </Box>
        </Button>
      </Panel>

      <Panel>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 900, letterSpacing: 0.5, color: '#94a3b8', mb: 0.6 }}>
          WHEN IT LEAVES
        </Typography>
        <Stack spacing={0.5}>
          <Tooltip arrow title="Park it mid-job. It keeps its plan and comes back to you.">
            <span>
              <Button fullWidth size="small" variant="outlined" disabled={busy} onClick={onHold} sx={secondaryButton}>
                Hold
              </Button>
            </span>
          </Tooltip>
          <Tooltip arrow title="Send it back unfinished, with a note saying why.">
            <span>
              <Button fullWidth size="small" variant="outlined" disabled={busy} onClick={onSendBack} sx={secondaryButton}>
                Back to queue
              </Button>
            </span>
          </Tooltip>
          <Button
            fullWidth
            size="small"
            variant="contained"
            disabled={busy}
            onClick={onDone}
            sx={{
              textTransform: 'none',
              fontWeight: 900,
              fontSize: '0.78rem',
              bgcolor: studio.accentDark,
              '&:hover': { bgcolor: studio.accentDark },
            }}
          >
            Done
          </Button>
        </Stack>
      </Panel>
    </Stack>
  );
}

const secondaryButton = {
  textTransform: 'none' as const,
  fontWeight: 800,
  fontSize: '0.78rem',
  borderColor: studio.panelBorder,
  color: '#334155',
  '&:hover': { borderColor: studio.accent, bgcolor: studio.accentSoft },
};

function Panel({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <Box
      sx={{
        px: 1.25,
        py: 1,
        borderRadius: `${studio.radius.lg}px`,
        bgcolor: studio.panel,
        border: `1px solid ${warn ? '#e3b23c' : studio.panelBorder}`,
        boxShadow: studio.panelShadow,
      }}
    >
      {children}
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0}>
      <Typography sx={{ fontSize: '0.56rem', fontWeight: 900, letterSpacing: 0.4, color: '#94a3b8' }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.86rem', fontWeight: 900, color: '#334155' }}>
        {value}
      </Typography>
    </Stack>
  );
}
