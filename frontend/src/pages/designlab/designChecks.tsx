/**
 * The owner's design checklist ticks (Template / Design / Done), shared by the Pages and Surfaces tabs. Saved on the
 * server (/api/core/design-lab/checks/, steps kept in order); a surface's ticks are saved under `surface-<object>`.
 */
import { Box, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDesignPageChecks, setDesignPageCheck, type DesignPageCheck, type DesignStep } from '../../api/core.api';

const KEY = ['design-lab', 'checks'];

export const STEPS: { id: DesignStep; label: string }[] = [
  { id: 'template', label: 'Template' },
  { id: 'design', label: 'Design' },
  { id: 'done', label: 'Done' },
];

export function useDesignChecks(onError?: () => void) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: getDesignPageChecks });
  const tick = useMutation({
    mutationFn: ({ page, step, on }: { page: string; step: DesignStep; on: boolean }) => setDesignPageCheck(page, step, on),
    onSuccess: (checks) => queryClient.setQueryData(KEY, checks),
    onError,
  });
  return { checks: query.data, tick };
}

function shortDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The three steps as tick boxes, in order: ticking one ticks the ones before it, unticking one the ones after. */
export function Ticks({
  check,
  labels = STEPS.map((s) => s.label),
  busy,
  onTick,
}: {
  check: Partial<DesignPageCheck> | undefined;
  /** Other words for the three steps (a surface's first step is "Standard"). */
  labels?: string[];
  busy: boolean;
  onTick: (step: DesignStep, on: boolean) => void;
}) {
  return (
    <Box>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {STEPS.map((s, i) => (
          <FormControlLabel
            key={s.id}
            label={labels[i]}
            disabled={busy}
            control={<Checkbox size="small" color="success" checked={Boolean(check?.[s.id])} onChange={(e) => onTick(s.id, e.target.checked)} />}
            slotProps={{ typography: { variant: 'body2', sx: { fontWeight: 600 } } }}
            sx={{ mr: 0.5, ml: -0.5 }}
          />
        ))}
      </Stack>
      {check?.by ? <Typography variant="caption" component="div">{check.by}, {shortDate(check.at)}</Typography> : null}
    </Box>
  );
}
