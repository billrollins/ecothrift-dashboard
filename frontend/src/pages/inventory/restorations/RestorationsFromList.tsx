import {
  Box,
  Chip,
  List,
  ListItemButton,
  Stack,
  Typography,
} from '@mui/material';
import type { RestorationJobDTO } from '../../../types/inventory.types';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '-';
}

function unitKindLabel(kind: string | undefined): string {
  if (kind === 'part') return 'Part';
  if (kind === 'added') return 'Added-by-Restoration';
  return 'Whole item';
}

function familyColor(family: string | null | undefined): 'warning' | 'success' {
  return family === 'untouched' ? 'warning' : 'success';
}

export interface RestorationsFromListProps {
  jobs: RestorationJobDTO[];
  selectedId: number | null;
  onSelect: (job: RestorationJobDTO) => void;
}

export function RestorationsFromList({ jobs, selectedId, onSelect }: RestorationsFromListProps) {
  if (jobs.length === 0) {
    return (
      <Box sx={{ py: 4, px: 2, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Nothing waiting from Restoration. Worked and untouched returns show up here.
        </Typography>
      </Box>
    );
  }

  return (
    <List disablePadding sx={{ bgcolor: 'background.paper' }}>
      {jobs.map((job) => {
        const selected = job.id === selectedId;
        const family = job.from_family ?? 'worked';
        const sku =
          job.items.length > 0 ? job.items.map((it) => it.sku).join(', ') : (job.sku ?? '-');
        const grade = job.final_grade || job.return_grade || '';
        const returnedAt = job.dispositioned_at ?? job.returned_at;
        return (
          <ListItemButton
            key={job.id}
            selected={selected}
            onClick={() => onSelect(job)}
            sx={{
              alignItems: 'flex-start',
              py: 1.1,
              px: 1.25,
              borderBottom: 1,
              borderColor: 'divider',
              borderLeft: 4,
              borderLeftColor: family === 'untouched' ? 'warning.main' : 'success.main',
            }}
          >
            <Stack spacing={0.55} sx={{ width: '100%', minWidth: 0 }}>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                <Chip size="small" label="FROM" color="primary" sx={{ fontWeight: 900 }} />
                <Chip
                  size="small"
                  label={family === 'untouched' ? 'Untouched' : 'Worked'}
                  color={familyColor(family)}
                  sx={{ fontWeight: 900 }}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={unitKindLabel(job.unit_kind)}
                  sx={{ fontWeight: 700 }}
                />
                {(job.work_verbs ?? []).map((verb) => (
                  <Chip key={verb} size="small" label={verb} sx={{ fontWeight: 700 }} />
                ))}
              </Stack>
              <Typography sx={{ fontWeight: 800, lineHeight: 1.25 }} noWrap>
                {job.name || 'Untitled product'}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {sku}
                {grade ? ` · ${grade}` : ''}
                {job.sale_state ? ` · ${job.sale_state}` : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {fmtDate(returnedAt)}
                {job.price ? ` · $${job.price}` : ''}
              </Typography>
            </Stack>
          </ListItemButton>
        );
      })}
    </List>
  );
}
