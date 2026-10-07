import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EventOutlined from '@mui/icons-material/EventOutlined';
import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material';
import { useState } from 'react';
import type { ApplicationRow, Stage } from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { ACTIVE_STAGES, CLOSED_STAGES, rowHint, timeText, type HintTone } from './applicantTimeline';
import { STAGE_LABEL } from './peopleUi';

const TONE: Record<HintTone, string> = {
  plain: ccTokens.ink3,
  now: ccTokens.brand,
  warn: ccTokens.warnText,
  good: ccTokens.goodText,
  bad: ccTokens.badText,
};

/** Names shown under a stage before "N more". */
const SHOW = 8;

function NameRow({
  row,
  selected,
  touch,
  hint,
  onPick,
}: {
  row: ApplicationRow;
  selected: boolean;
  touch: boolean;
  hint: { text: string; tone: HintTone };
  onPick: () => void;
}) {
  return (
    <ButtonBase
      onClick={onPick}
      aria-current={selected ? 'true' : undefined}
      sx={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        minHeight: touch ? 44 : 30,
        borderRadius: ccTokens.rSm,
        textAlign: 'left',
        bgcolor: selected ? ccTokens.goodTint : 'transparent',
        boxShadow: selected ? `inset 3px 0 0 ${ccTokens.brand}` : 'none',
        '&:hover': { bgcolor: selected ? ccTokens.goodTint : '#f4f4f0' },
        '&.Mui-focusVisible': { outline: `2px solid ${ccTokens.brand}`, outlineOffset: -2 },
      }}
    >
      <Box
        title={row.red_flags ? 'Has a red must-have' : undefined}
        sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, bgcolor: row.red_flags ? ccTokens.bad : 'transparent' }}
      />
      <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: touch ? 15 : 14, fontWeight: selected ? 700 : 500 }}>
        {row.full_name}
        {row.is_practice && (
          <Box component="span" sx={{ ml: 0.75, fontSize: 11, fontWeight: 700, color: ccTokens.kraftDeep }}>
            practice
          </Box>
        )}
      </Typography>
      <Typography noWrap sx={{ fontSize: 12, color: TONE[hint.tone], fontWeight: hint.tone === 'plain' ? 400 : 700, flexShrink: 0 }}>
        {hint.text}
      </Typography>
    </ButtonBase>
  );
}

function Milestone({
  stage,
  count,
  rows,
  loading,
  last,
  offLine,
  collapsible,
  open,
  onToggle,
  selectedId,
  touch,
  now,
  onPick,
}: {
  stage: Stage;
  count: number | undefined;
  rows: ApplicationRow[] | undefined;
  loading?: boolean;
  last?: boolean;
  offLine?: boolean;
  collapsible?: boolean;
  open: boolean;
  onToggle?: () => void;
  selectedId: number | null;
  touch: boolean;
  now: Date;
  onPick: (id: number) => void;
}) {
  const [all, setAll] = useState(false);
  const list = rows ?? [];
  const shown = all ? list : list.filter((r, i) => i < SHOW || r.id === selectedId);
  const more = list.length - shown.length;
  const has = (count ?? list.length) > 0;
  const dot = offLine ? ccTokens.neu : ccTokens.brand;

  const title = (
    <>
      <Typography sx={{ fontWeight: 700, fontSize: touch ? 15 : 14, color: has ? ccTokens.ink : ccTokens.ink3 }}>
        {STAGE_LABEL[stage]}
      </Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: has ? ccTokens.ink2 : ccTokens.ink3 }}>{count ?? '…'}</Typography>
      {collapsible && (
        <ExpandMoreIcon
          fontSize="small"
          sx={{ ml: 'auto', color: ccTokens.ink3, transition: 'transform .15s', transform: open ? 'none' : 'rotate(-90deg)' }}
        />
      )}
    </>
  );

  return (
    <Box sx={{ position: 'relative', pl: 3, pb: last ? 0 : touch ? 2 : 1.5, mt: offLine ? 1.5 : 0 }}>
      {!last && (
        <Box sx={{ position: 'absolute', left: 8, top: 14, bottom: -2, width: 2, bgcolor: ccTokens.line2, borderRadius: 1 }} />
      )}
      <Box
        sx={{
          position: 'absolute',
          left: 3,
          top: touch ? 9 : 6,
          width: 12,
          height: 12,
          borderRadius: '50%',
          border: `2px solid ${has ? dot : ccTokens.line2}`,
          bgcolor: has ? dot : ccTokens.card,
          boxSizing: 'border-box',
        }}
      />
      {collapsible ? (
        <ButtonBase
          onClick={onToggle}
          aria-expanded={open}
          sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1, px: 1, ml: -1, minHeight: touch ? 32 : 24, borderRadius: ccTokens.rSm, justifyContent: 'flex-start', '&:hover': { bgcolor: '#f4f4f0' } }}
        >
          {title}
        </ButtonBase>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: touch ? 32 : 24 }}>{title}</Box>
      )}
      {open && (
        <Box sx={{ mt: 0.25, ml: -1 }}>
          {loading && <CircularProgress size={16} sx={{ m: 1 }} />}
          {shown.map((row) => (
            <NameRow key={row.id} row={row} selected={row.id === selectedId} touch={touch} hint={rowHint(row, now)} onPick={() => onPick(row.id)} />
          ))}
          {more > 0 && (
            <ButtonBase onClick={() => setAll(true)} sx={{ px: 1, py: 0.5, borderRadius: ccTokens.rSm, fontSize: 13, color: ccTokens.brand, fontWeight: 600 }}>
              {more} more
            </ButtonBase>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * The hiring line as a timeline: each stage a milestone with its count and the people in it.
 * Hired and Not now fold up (they only grow); open them to load their names.
 */
export function StageTimeline({
  counts,
  groups,
  closedRows,
  closedLoading,
  openClosed,
  onToggleClosed,
  today,
  selectedId,
  touch = false,
  onPick,
}: {
  counts: Partial<Record<string, number>> | undefined;
  groups: Partial<Record<Stage, ApplicationRow[]>> | undefined;
  closedRows: Partial<Record<Stage, ApplicationRow[]>>;
  closedLoading: Partial<Record<Stage, boolean>>;
  openClosed: Stage[];
  onToggleClosed: (stage: Stage) => void;
  today: ApplicationRow[];
  selectedId: number | null;
  touch?: boolean;
  onPick: (id: number) => void;
}) {
  const now = new Date();
  return (
    <Box>
      {today.length > 0 && (
        <Box sx={{ mb: 2, p: 1.25, borderRadius: ccTokens.r, bgcolor: ccTokens.goodTint }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, px: 0.5 }}>
            <EventOutlined sx={{ fontSize: 18, color: ccTokens.goodText }} />
            <Typography sx={{ fontWeight: 700, fontSize: 14, color: ccTokens.goodText }}>
              Interviews today
            </Typography>
          </Box>
          {today.map((row) => (
            <NameRow
              key={row.id}
              row={row}
              selected={row.id === selectedId}
              touch={touch}
              hint={{ text: timeText(new Date(row.next_interview!)), tone: 'now' }}
              onPick={() => onPick(row.id)}
            />
          ))}
        </Box>
      )}
      {ACTIVE_STAGES.map((stage) => (
        <Milestone
          key={stage}
          stage={stage}
          count={counts?.[stage]}
          rows={groups?.[stage]}
          loading={!groups}
          open
          selectedId={selectedId}
          touch={touch}
          now={now}
          onPick={onPick}
        />
      ))}
      {CLOSED_STAGES.map((stage) => (
        <Milestone
          key={stage}
          stage={stage}
          count={counts?.[stage]}
          rows={closedRows[stage]}
          loading={closedLoading[stage]}
          last
          offLine={stage === 'not_now'}
          collapsible
          open={openClosed.includes(stage)}
          onToggle={() => onToggleClosed(stage)}
          selectedId={selectedId}
          touch={touch}
          now={now}
          onPick={onPick}
        />
      ))}
    </Box>
  );
}
