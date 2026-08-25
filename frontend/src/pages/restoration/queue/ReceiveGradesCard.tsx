/**
 * The grade ladder restoration was priced against, with a star on the grade they reached.
 *
 * Tapping a priced row writes that amount into the price of whatever is being received,
 * so the processor never retypes a number the bench already agreed to.
 */
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { Box, Typography } from '@mui/material';
import { useGradeScales } from '../../../hooks/useGradeScales';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { GRADE_ROLE, gradeRoleWash } from '../tars/tarsGradeRoles';
import { receiveGradePrice, receiveScaleGrades } from './restorationReceive';

const ROW_HEIGHT = 26;
const STAR_SLOT = 18;
const PRICE_SLOT = 68;
const HINT_HEIGHT = 16;

export function ReceiveGradesCard({
  job,
  height,
  onUsePrice,
  disabled,
}: {
  job: RestorationJobDTO;
  height: number;
  onUsePrice: (price: string) => void;
  disabled?: boolean;
}) {
  const { scales } = useGradeScales();
  const grades = receiveScaleGrades(job, scales);

  return (
    <Box
      sx={{
        height,
        minHeight: height,
        display: 'flex',
        flexDirection: 'column',
        p: 1,
        border: '1px solid #ddd6cc',
        borderRadius: 2,
        bgcolor: '#f6f4f0',
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minHeight: 14 }}>
        <Typography
          sx={{
            fontSize: '0.58rem',
            fontWeight: 800,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: '#65748a',
          }}
        >
          Grades &amp; values
        </Typography>
        <Typography noWrap sx={{ ml: 'auto', fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8' }}>
          {job.scale || 'No scale'}
        </Typography>
      </Box>

      <Box sx={{ mt: 0.5, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {grades.length === 0 ? (
          <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
            No grade prices were given to restoration.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
            {grades.map((grade) => (
              <GradeRow
                key={grade}
                grade={grade}
                price={receiveGradePrice(job, grade)}
                isOriginal={grade === job.starting_grade}
                isAchieved={grade === job.final_grade}
                disabled={disabled}
                onUse={onUsePrice}
              />
            ))}
          </Box>
        )}
      </Box>

      <Typography
        noWrap
        sx={{
          mt: 0.4,
          height: HINT_HEIGHT,
          minHeight: HINT_HEIGHT,
          fontSize: '0.68rem',
          fontWeight: 800,
          color: '#65748a',
        }}
      >
        {hintLine(job, grades.length > 0)}
      </Typography>
    </Box>
  );
}

function hintLine(job: RestorationJobDTO, hasGrades: boolean): string {
  const added = Number(job.value_added);
  const bits: string[] = [];
  if (job.value_added != null && job.value_added !== '' && Number.isFinite(added)) {
    bits.push(added < 0 ? `−$${Math.abs(added).toFixed(2)} value` : `+$${added.toFixed(2)} value`);
  }
  bits.push(hasGrades ? 'Tap a price to use it' : 'Set the price by hand');
  return bits.join(' · ');
}

function GradeRow({
  grade,
  price,
  isOriginal,
  isAchieved,
  disabled,
  onUse,
}: {
  grade: string;
  price: number | null;
  isOriginal: boolean;
  isAchieved: boolean;
  disabled?: boolean;
  onUse: (price: string) => void;
}) {
  const priced = price != null;
  const wash = gradeRoleWash(isOriginal, isAchieved);
  const asButton = priced
    ? {
        component: 'button' as const,
        type: 'button' as const,
        disabled: Boolean(disabled),
        onClick: () => onUse(price.toFixed(2)),
        'aria-label': `Use $${price.toFixed(2)} as the price`,
      }
    : {};

  return (
    <Box
      {...asButton}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        width: '100%',
        height: ROW_HEIGHT,
        minHeight: ROW_HEIGHT,
        px: 0.65,
        textAlign: 'left',
        borderRadius: 1,
        border: `1px solid ${
          isAchieved ? GRADE_ROLE.current.border : isOriginal ? GRADE_ROLE.original.border : '#e8eee9'
        }`,
        borderLeft: `3px solid ${
          isOriginal ? GRADE_ROLE.original.ink : isAchieved ? GRADE_ROLE.current.border : '#e8eee9'
        }`,
        background: wash === 'transparent' ? '#fbfcfb' : wash,
        cursor: priced && !disabled ? 'pointer' : 'default',
        opacity: priced ? 1 : 0.5,
        '&:hover': priced && !disabled ? { filter: 'brightness(0.97)' } : undefined,
      }}
    >
      <Box sx={{ width: STAR_SLOT, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <StarRoundedIcon
          sx={{
            fontSize: 17,
            color: isAchieved ? GRADE_ROLE.current.ink : 'transparent',
          }}
        />
      </Box>
      <Typography noWrap title={grade} sx={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: '0.8rem', color: '#172033' }}>
        {grade}
      </Typography>
      <Typography
        sx={{
          width: PRICE_SLOT,
          flexShrink: 0,
          textAlign: 'right',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 900,
          fontSize: '0.84rem',
          color: price == null ? '#cbd5e1' : '#172033',
        }}
      >
        {price == null ? '—' : `$${price.toFixed(2)}`}
      </Typography>
    </Box>
  );
}
