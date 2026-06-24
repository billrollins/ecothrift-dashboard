import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { TARS_VERB_META } from './tarsConstants';
import { TarsCostFieldInput } from './TarsCostFieldInput';
import { fmtProfit, fmtUsd } from './tarsProfit';
import type { TarsCostField, TarsPathRow } from './tarsTypes';
import { formatCostField, formatHoursField } from './tarsCostUtils';

interface TarsPathEvaluationCardProps {
  row: TarsPathRow;
  isWinner: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onValueChange: (field: TarsCostField) => void;
  onPartsChange: (field: TarsCostField) => void;
  onHoursChange: (field: TarsCostField) => void;
}

export function TarsPathEvaluationCard({
  row,
  isWinner,
  isSelected,
  onSelect,
  onValueChange,
  onPartsChange,
  onHoursChange,
}: TarsPathEvaluationCardProps) {
  const meta = TARS_VERB_META[row.verb];
  const positive = row.profit !== null && row.profit >= 0;

  return (
    <Card
      variant="outlined"
      onClick={onSelect}
      sx={{
        cursor: 'pointer',
        position: 'relative',
        borderWidth: isWinner || isSelected ? 2 : 1,
        borderColor: isWinner ? 'primary.main' : isSelected ? 'secondary.main' : 'divider',
        boxShadow: isSelected ? (t) => `0 0 0 3px ${t.palette.secondary.main}22` : undefined,
        bgcolor: isWinner ? 'primary.50' : 'background.paper',
      }}
    >
      {isWinner && row.profit !== null && (
        <Chip
          label="Recommended"
          size="small"
          color="primary"
          sx={{ position: 'absolute', top: -10, left: 12, height: 20, fontSize: 10, fontWeight: 800 }}
        />
      )}
      <CardContent sx={{ pt: isWinner ? 2.5 : 2 }}>
        <Chip
          label={row.verb.toUpperCase()}
          size="small"
          sx={{
            fontWeight: 750,
            letterSpacing: '0.04em',
            color: meta.color,
            bgcolor: `${meta.color}18`,
          }}
        />
        <Typography variant="body2" fontWeight={650} mt={1} mb={0.25}>
          → {row.grade}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
          {meta.description}
        </Typography>

        <Box onClick={(e) => e.stopPropagation()} sx={{ mb: 1.5 }}>
          <TarsCostFieldInput label="Value" field={row.value} unit="money" onChange={onValueChange} compact />
        </Box>

        <Typography variant="overline" fontWeight={700} color="text.secondary" display="block" mb={1}>
          Costs
        </Typography>
        <Stack spacing={1.25} onClick={(e) => e.stopPropagation()}>
          <TarsCostFieldInput label="Parts" field={row.parts} unit="money" onChange={onPartsChange} compact />
          <TarsCostFieldInput label="Time" field={row.hours} unit="hours" onChange={onHoursChange} compact />
        </Stack>

        <Stack spacing={0.5} mt={1.5} fontSize={12}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              Labor
            </Typography>
            <Typography variant="caption" fontFamily="monospace" color="text.secondary">
              {row.labor !== null ? fmtUsd(row.labor) : '—'}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" fontWeight={700} color="text.secondary">
              Total cost
            </Typography>
            <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
              {row.cost !== null ? fmtUsd(row.cost) : '—'}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled" fontSize={10}>
            Parts {formatCostField(row.parts, fmtUsd)} · Time {formatHoursField(row.hours)}
          </Typography>
        </Stack>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="baseline"
          sx={{ mt: 1.5, pt: 1.25, borderTop: 1, borderColor: 'divider', borderTopStyle: 'dashed' }}
        >
          <Typography variant="caption" fontWeight={700} color="text.secondary" letterSpacing="0.04em">
            PROFIT
          </Typography>
          <Typography
            variant="h6"
            fontFamily="monospace"
            fontWeight={700}
            color={row.profit === null ? 'text.disabled' : positive ? 'success.main' : 'error.main'}
          >
            {fmtProfit(row.profit)}
          </Typography>
        </Stack>
        {row.hasUnknownCost && (
          <Typography variant="caption" color="warning.dark" display="block" mt={0.5}>
            Set all costs to estimate or known to compare profit.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
