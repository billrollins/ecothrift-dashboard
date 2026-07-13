import AttachMoney from '@mui/icons-material/AttachMoney';
import FactCheck from '@mui/icons-material/FactCheck';
import Gavel from '@mui/icons-material/Gavel';
import Inventory2 from '@mui/icons-material/Inventory2';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import type { RestorationJobDTO } from '../../../../types/inventory.types';
import { fmtUsd } from '../tarsProfit';
import type { TarsWorkSession } from '../tarsWorkTypes';

function sessionPartsCost(session: TarsWorkSession): number {
  return (session.parts ?? []).reduce((sum, part) => {
    const price = Number(part.unitPriceActual || part.unitPriceEstimate || 0);
    return sum + price * Math.max(Number(part.qty || 1), 1);
  }, 0);
}

export function TarsItemStateBar({
  job,
  session,
  hourlyRate,
  scaleGrades,
  onRequestValuation,
  requesting,
}: {
  job: RestorationJobDTO;
  session: TarsWorkSession;
  hourlyRate: number;
  scaleGrades?: string[];
  onRequestValuation?: (grades: string[]) => void;
  requesting?: boolean;
}) {
  const decision = session.decisionWork;
  const currentGrade = decision?.condition.currentGrade ?? null;
  const selection = decision?.selection;
  const gradeNames = scaleGrades?.length ? scaleGrades : Object.keys(job.grade_values ?? {});
  const grades = gradeNames.map((grade) => [grade, job.grade_values?.[grade] ?? 0] as const);
  const missingGrades = grades.filter(([, value]) => !(Number(value) > 0)).map(([grade]) => grade);
  const laborCost = ((job.elapsed_seconds ?? 0) / 3600) * hourlyRate;
  const partsCost = sessionPartsCost(session);

  return (
    <Box
      sx={{
        bgcolor: '#fff',
        border: '1px solid #cbd5df',
        borderRadius: 2,
        px: 1.25,
        py: 1,
        boxShadow: '0 2px 8px rgba(23, 32, 51, 0.05)',
      }}
    >
      <Stack direction={{ xs: 'column', lg: 'row' }} gap={1.25} alignItems={{ lg: 'stretch' }}>
        <Box sx={{ minWidth: { lg: 225 }, pr: { lg: 1.25 }, borderRight: { lg: '1px solid #e0e6ed' } }}>
          <Typography variant="caption" sx={{ color: '#0b665e', fontWeight: 950, letterSpacing: '0.07em' }}>
            ACTIVE ITEM
          </Typography>
          <Typography variant="subtitle1" noWrap sx={{ color: '#172033', fontWeight: 950, lineHeight: 1.15 }}>
            {job.name}
          </Typography>
          <Typography variant="caption" sx={{ color: '#65748a', fontFamily: 'monospace' }}>
            {job.items[0]?.sku ?? job.sku} · {job.scale || 'No scale'}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Typography variant="caption" sx={{ color: '#65748a', fontWeight: 900 }}>
              ULTIMATE GRADES & VALUES
            </Typography>
            {missingGrades.length && onRequestValuation ? (
              <Button
                size="small"
                color="warning"
                disabled={requesting || Boolean(job.valuation_pending)}
                onClick={() => onRequestValuation(missingGrades)}
                sx={{ minHeight: 24, py: 0, textTransform: 'none', fontWeight: 900 }}
              >
                {job.valuation_pending ? 'Processing notified' : 'Request missing values'}
              </Button>
            ) : null}
          </Stack>
          <Stack direction="row" gap={0.6} mt={0.45} flexWrap="wrap">
            {grades.length ? grades.map(([grade, raw]) => {
              const value = Number(raw);
              const missing = !(value > 0);
              return (
                <Chip
                  key={grade}
                  icon={<AttachMoney />}
                  label={`${grade}: ${missing ? 'MISSING' : fmtUsd(value)}`}
                  sx={{
                    height: 28,
                    border: `1px solid ${missing ? '#e4a11b' : '#cbd5df'}`,
                    bgcolor: missing ? '#fff4cf' : '#f7f9fb',
                    color: missing ? '#874c06' : '#344258',
                    fontWeight: 900,
                    '& .MuiChip-icon': { color: 'inherit', fontSize: 17 },
                  }}
                />
              );
            }) : (
              <Chip
                label="No grade values"
                sx={{ height: 28, bgcolor: '#fff4cf', color: '#874c06', fontWeight: 900 }}
              />
            )}
          </Stack>
        </Box>

        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ minWidth: { lg: 430 } }}>
          <StateCard
            icon={<FactCheck />}
            label="Current grade"
            value={currentGrade || 'Not assessed'}
            attention={!currentGrade}
          />
          <StateCard
            icon={<Inventory2 />}
            label="Known cost"
            value={`${fmtUsd(partsCost + laborCost)}`}
            detail={`${fmtUsd(partsCost)} parts · ${fmtUsd(laborCost)} labor`}
          />
          <StateCard
            icon={<Gavel />}
            label="Committed plan"
            value={
              selection?.outcomeId
                ? `${selection.action?.toUpperCase() ?? ''} → ${selection.grade ?? ''}`
                : 'No plan'
            }
            attention={!selection?.outcomeId}
          />
        </Stack>
      </Stack>
    </Box>
  );
}

function StateCard({
  icon,
  label,
  value,
  detail,
  attention,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  attention?: boolean;
}) {
  return (
    <Box
      sx={{
        flex: '1 1 132px',
        minWidth: 132,
        px: 1,
        py: 0.7,
        borderRadius: 1.5,
        bgcolor: attention ? '#fff8e7' : '#f7f9fb',
        border: `1px solid ${attention ? '#e4b149' : '#d9e0e8'}`,
      }}
    >
      <Stack direction="row" gap={0.55} alignItems="center" sx={{ color: attention ? '#8a5507' : '#526177' }}>
        <Box sx={{ display: 'grid', placeItems: 'center', '& svg': { fontSize: 16 } }}>{icon}</Box>
        <Typography variant="caption" sx={{ fontWeight: 850 }}>{label}</Typography>
      </Stack>
      <Typography variant="body2" noWrap sx={{ mt: 0.2, color: '#172033', fontWeight: 950 }}>
        {value}
      </Typography>
      {detail ? <Typography variant="caption" noWrap sx={{ display: 'block', color: '#7a8798' }}>{detail}</Typography> : null}
    </Box>
  );
}

