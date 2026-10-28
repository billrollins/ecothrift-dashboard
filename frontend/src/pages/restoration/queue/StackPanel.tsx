/**
 * The units inside a stack, opened from the ×N badge.
 *
 * Every decision on the card covers every unit; this list is where a unit is
 * taken out on its own. On a wide screen it opens in place under the card; on
 * a phone it is a bottom sheet with the same rows.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { ItemSkuLink } from '../../../components/objects/ItemPeek';
import { studio } from '../tars/studio/tarsStudioTheme';
import { unitCount } from './stackModel';

const ROW_HEIGHT = 44;

export function StackPanel({
  job,
  accent,
  highlightSku,
  busy,
  canBench,
  onClose,
  onSplit,
  onPullOut,
  onJustThisOne,
  onBenchAll,
}: {
  job: RestorationJobDTO;
  accent: string;
  /** The unit that was scanned. */
  highlightSku?: string | null;
  busy?: boolean;
  /** Queue stacks can send one unit to the bench. */
  canBench: boolean;
  onClose: () => void;
  onSplit: (picked: number[]) => void;
  onPullOut: (itemIds: number[]) => void;
  onJustThisOne: (itemId: number) => void;
  /** Queue stacks: put every unit on the bench as one item. */
  onBenchAll?: () => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const [picked, setPicked] = useState<number[]>([]);
  const units = job.items ?? [];
  const total = unitCount(job);
  const hit = highlightSku?.trim().toUpperCase() ?? '';

  useEffect(() => {
    setPicked([]);
  }, [job.id, job.items.length]);

  useEffect(() => {
    if (!hit) return;
    const el = document.querySelector(`[data-stack-unit="${hit}"]`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [hit]);

  function toggle(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const pullable = picked.length > 0 && picked.length < units.length;

  const body = (
    <Stack spacing={0.75} sx={{ width: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 36, flexWrap: 'wrap', rowGap: 0.75 }}>
        <Typography sx={{ fontWeight: 900, fontSize: '0.9rem', color: studio.ink, flex: 1, minWidth: 160 }}>
          {total} units · one set of decisions for all
        </Typography>
        <Button
          size="small"
          variant="outlined"
          disabled={busy || !pullable}
          onClick={() => onPullOut(picked)}
          sx={{ fontWeight: 800, minWidth: 128 }}
        >
          {picked.length > 0 ? `Pull out ${picked.length}` : 'Pull out ticked'}
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={busy}
          onClick={() => onSplit(picked)}
          sx={{ fontWeight: 800, bgcolor: accent, '&:hover': { bgcolor: accent, filter: 'brightness(0.92)' } }}
        >
          Split…
        </Button>
        {canBench && onBenchAll ? (
          <Button
            size="small"
            variant="contained"
            disabled={busy}
            onClick={onBenchAll}
            sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}
          >
            Put the whole group on the Bench
          </Button>
        ) : null}
        <Button size="small" onClick={onClose} sx={{ fontWeight: 800, color: studio.inkMuted }}>
          Close
        </Button>
      </Stack>
      <Box
        role="list"
        aria-label={`Units in ${job.name}`}
        sx={{ maxHeight: phone ? '55vh' : ROW_HEIGHT * 6 + 2, overflowY: 'auto', pr: 0.25 }}
      >
        {units.map((unit) => {
          const lit = hit !== '' && unit.sku.toUpperCase() === hit;
          return (
            <Stack
              key={unit.id}
              role="listitem"
              data-stack-unit={unit.sku.toUpperCase()}
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                minHeight: ROW_HEIGHT,
                px: 0.75,
                borderRadius: `${studio.radius.md}px`,
                bgcolor: lit ? '#fff3c4' : 'transparent',
                border: `1.5px solid ${lit ? '#e0a800' : 'transparent'}`,
                borderBottomColor: lit ? '#e0a800' : studio.rule,
              }}
            >
              <Checkbox
                size="small"
                checked={picked.includes(unit.id)}
                disabled={busy}
                onChange={() => toggle(unit.id)}
                inputProps={{ 'aria-label': `Tick ${unit.sku}` }}
              />
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.8rem', color: accent, minWidth: 96 }}>
                <ItemSkuLink itemId={unit.id} sku={unit.sku} />
              </Typography>
              <Typography noWrap sx={{ fontSize: '0.72rem', color: studio.inkMuted, flex: 1, minWidth: 0 }}>
                {lit ? 'Scanned' : phone ? '' : unit.condition || ''}
              </Typography>
              <Button
                size="small"
                disabled={busy}
                onClick={() => onPullOut([unit.id])}
                sx={{ fontWeight: 800, color: studio.inkMuted, minWidth: 0, whiteSpace: 'nowrap' }}
              >
                Pull out
              </Button>
              {canBench ? (
                <Button
                  size="small"
                  variant={lit ? 'contained' : 'text'}
                  aria-label={`Just this one → Bench: ${unit.sku}`}
                  disabled={busy}
                  onClick={() => onJustThisOne(unit.id)}
                  sx={{ fontWeight: 800, minWidth: 0, whiteSpace: 'nowrap' }}
                >
                  {phone ? 'Bench' : 'Just this one → Bench'}
                </Button>
              ) : null}
            </Stack>
          );
        })}
      </Box>
    </Stack>
  );

  if (phone) {
    return (
      <Drawer
        anchor="bottom"
        open
        onClose={onClose}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            px: 1.5,
            pt: 1,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            bgcolor: studio.panel,
          },
        }}
      >
        <Box aria-hidden sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: studio.panelBorder, mx: 'auto', mb: 1 }} />
        <Typography sx={{ fontWeight: 900, fontSize: '1rem', color: studio.ink, mb: 0.5 }}>{job.name}</Typography>
        {body}
      </Drawer>
    );
  }

  return (
    <Box
      data-stack-panel={job.id}
      sx={{
        mt: -0.5,
        mx: 1,
        px: 1.25,
        py: 1,
        bgcolor: studio.panel,
        border: `1.5px solid ${studio.panelBorder}`,
        borderTop: `3px solid ${accent}`,
        borderRadius: `0 0 ${studio.radius.lg}px ${studio.radius.lg}px`,
        boxShadow: studio.panelShadow,
      }}
    >
      {body}
    </Box>
  );
}
