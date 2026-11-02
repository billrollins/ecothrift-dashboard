import { Box, ButtonBase, Chip, IconButton, Typography } from '@mui/material';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import { t } from '../../i18n/routines';
import type { DashFixDTO } from '../../types/dashFixes.types';
import { formatShortDate, kindLabel, needsAnswer, statusLabel, statusTone, type ChipTone } from './dashFixesModel';

const TONES: Record<ChipTone, { bg: string; fg: string }> = {
  info: { bg: '#E8EEF9', fg: '#1E3A8A' },
  warn: { bg: '#FEF3C7', fg: '#7C4A03' },
  good: { bg: '#DCFCE7', fg: '#14532D' },
  muted: { bg: '#EEF0F2', fg: '#374151' },
};

export function StatusChip({ row, lang }: { row: DashFixDTO; lang: string }) {
  const tone = TONES[statusTone(row)];
  return (
    <Chip
      size="small"
      label={statusLabel(row, lang)}
      data-testid={`fix-status-${row.id}`}
      sx={{
        bgcolor: tone.bg,
        color: tone.fg,
        fontWeight: 700,
        maxWidth: '100%',
        height: 'auto',
        '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 },
      }}
    />
  );
}

export interface DashFixRowProps {
  row: DashFixDTO;
  lang: string;
  /** "#N" place in the line. */
  number?: number;
  onOpen: (id: number) => void;
  /** Owner line controls. */
  reorder?: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void };
  /** "Navigation redesign · step 2 of 4" */
  project?: string;
  /** Open dependencies, shown as "after #3". */
  after?: DashFixDTO[];
  nextUp?: boolean;
}

export function DashFixRowBody({ row, lang, number, onOpen, reorder, project, after, nextUp }: DashFixRowProps) {
  const meta = [
    kindLabel(row.kind, lang),
    row.page_path || null,
    row.submitted_by_name ? t('fxReportedBy', lang).replace('{name}', row.submitted_by_name) : null,
    formatShortDate(row.created_at),
  ].filter(Boolean);
  return (
    <Box
      data-testid={`fix-row-${row.id}`}
      sx={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <ButtonBase
        onClick={() => onOpen(row.id)}
        aria-label={row.title}
        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 1.25, textAlign: 'left', px: 1.5, py: 1.25 }}
      >
        {number ? (
          <Typography data-testid={`fix-number-${row.id}`} sx={{ fontWeight: 800, fontSize: 15, minWidth: 32, color: 'primary.main' }}>
            #{number}
          </Typography>
        ) : null}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
            {row.title}
            {row.unseen ? (
              <Box component="span" data-testid={`fix-unseen-${row.id}`} sx={{ ml: 1, color: 'error.main', fontSize: 12, fontWeight: 800 }}>
                {t('fxUpdated', lang)}
              </Box>
            ) : null}
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', overflowWrap: 'anywhere' }}>
            {meta.join(' · ')}
          </Typography>
          {project ? (
            <Typography data-testid={`fix-project-${row.id}`} sx={{ fontSize: 12.5, fontWeight: 700, color: 'primary.main' }}>
              {project}
            </Typography>
          ) : null}
          <Box sx={{ mt: 0.75, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {needsAnswer(row) ? <Chip size="small" color="warning" label={t('fxNeedsAnswer', lang)} data-testid={`fix-needs-answer-${row.id}`} sx={{ fontWeight: 700 }} /> : null}
            {nextUp ? <Chip size="small" color="primary" label={t('fxNextUp', lang)} data-testid={`fix-next-${row.id}`} sx={{ fontWeight: 700 }} /> : null}
            <StatusChip row={row} lang={lang} />
            {(after ?? []).map((dep) => (
              <Chip
                key={dep.id}
                size="small"
                variant="outlined"
                label={`${t('fxAfter', lang)} ${dep.rank ? `#${dep.rank}` : dep.title}`}
                data-testid={`fix-after-${row.id}-${dep.id}`}
              />
            ))}
            {row.private ? <Chip size="small" label={t('fxPrivate', lang)} sx={{ fontWeight: 700 }} /> : null}
          </Box>
        </Box>
      </ButtonBase>
      {reorder ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', pr: 0.5 }}>
          <IconButton
            size="small"
            aria-label={`${t('fxMoveUp', lang)}: ${row.title}`}
            disabled={!reorder.canUp}
            onClick={reorder.onUp}
            sx={{ width: 44, height: 28 }}
          >
            <ArrowUpwardRounded fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`${t('fxMoveDown', lang)}: ${row.title}`}
            disabled={!reorder.canDown}
            onClick={reorder.onDown}
            sx={{ width: 44, height: 28 }}
          >
            <ArrowDownwardRounded fontSize="small" />
          </IconButton>
        </Box>
      ) : null}
    </Box>
  );
}
