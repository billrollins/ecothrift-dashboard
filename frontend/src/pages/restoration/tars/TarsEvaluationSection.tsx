import { Box, Button, Stack, Typography } from '@mui/material';
import { TarsPathEvaluationCard } from './TarsPathEvaluationCard';
import { fmtProfit } from './tarsProfit';
import { useTarsMock } from './TarsMockStore';

interface TarsEvaluationSectionProps {
  sku: string | null;
  showPerform?: boolean;
}

/** Evaluation path cards with VALUE + cost fields (shared by Check-In & Evaluate and TARS). */
export function TarsEvaluationSection({ sku, showPerform = true }: TarsEvaluationSectionProps) {
  const {
    evaluateItem,
    selectPath,
    performPath,
    setPathCostField,
  } = useTarsMock();

  if (!sku) {
    return (
      <Typography color="text.secondary" textAlign="center" py={4}>
        Select or check in an item to evaluate paths.
      </Typography>
    );
  }

  const evaluation = evaluateItem(sku);
  if (!evaluation || evaluation.rows.length === 0) {
    return (
      <Typography color="text.secondary" textAlign="center" py={4}>
        No evaluation paths for this item.
      </Typography>
    );
  }

  const bestRow = evaluation.rows[evaluation.bestIdx];
  const selectedRow = evaluation.rows[evaluation.selectedIdx ?? 0];

  return (
    <>
      <Typography variant="subtitle2" fontWeight={750} mb={0.5}>
        Evaluation
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
        Each card: <strong>Value</strong> (retail if grade is reached) minus <strong>Parts</strong> +{' '}
        <strong>Time</strong>. Mark costs Unknown, $0, Est., or Known.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        {evaluation.rows.map((row) => (
          <TarsPathEvaluationCard
            key={row.idx}
            row={row}
            isWinner={row.idx === evaluation.bestIdx && row.profit !== null}
            isSelected={row.idx === evaluation.selectedIdx}
            onSelect={() => selectPath(sku, row.idx)}
            onValueChange={(f) => setPathCostField(sku, row.idx, 'value', f)}
            onPartsChange={(f) => setPathCostField(sku, row.idx, 'parts', f)}
            onHoursChange={(f) => setPathCostField(sku, row.idx, 'hours', f)}
          />
        ))}
      </Box>

      {showPerform && bestRow && selectedRow && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ sm: 'center' }}
          p={2}
          borderRadius={2}
          bgcolor={
            bestRow.profit !== null && bestRow.profit >= 0 ? 'success.50' : 'error.50'
          }
          border={1}
          borderColor={
            bestRow.profit !== null && bestRow.profit >= 0 ? 'success.light' : 'error.light'
          }
        >
          <Box flex={1}>
            <Typography variant="overline" fontWeight={700} color="text.secondary">
              App recommends
            </Typography>
            <Typography
              variant="h6"
              fontWeight={750}
              color={
                bestRow.profit === null
                  ? 'text.secondary'
                  : bestRow.profit >= 0
                    ? 'success.dark'
                    : 'error.dark'
              }
            >
              {bestRow.profit !== null
                ? `${bestRow.verb} → ${bestRow.grade}`
                : 'Need cost estimates'}{' '}
              <Typography component="span" fontFamily="monospace" fontWeight={700}>
                {fmtProfit(bestRow.profit)}
              </Typography>
            </Typography>
            {evaluation.selectedIdx !== evaluation.bestIdx && selectedRow.profit !== null && (
              <Typography variant="body2" color="warning.dark" mt={0.5}>
                You picked <strong>{selectedRow.verb} → {selectedRow.grade}</strong> (
                {fmtProfit(selectedRow.profit)}) — overriding the recommendation.
              </Typography>
            )}
          </Box>
          <Button
            variant="contained"
            size="large"
            disabled={selectedRow.profit === null}
            onClick={() => performPath(sku, evaluation.selectedIdx)}
          >
            Perform {selectedRow.verb}
          </Button>
        </Stack>
      )}
    </>
  );
}
