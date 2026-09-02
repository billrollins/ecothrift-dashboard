import { Box, Button } from '@mui/material';
import { dutyColors } from '../../../components/duty/tokens';

export type Choice = '' | 'pass' | 'fail' | 'na';

/** Pass / Fail, and N/A when the answer is allowed to be "does not apply". */
export function ChoiceRow({
  value,
  onChange,
  allowNa,
  disabled,
  passLabel = 'Pass',
  failLabel = 'Fail',
}: {
  value: Choice;
  onChange: (next: Choice) => void;
  allowNa?: boolean;
  disabled?: boolean;
  passLabel?: string;
  failLabel?: string;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
      <ChoiceButton
        label={passLabel}
        tone="pass"
        active={value === 'pass'}
        disabled={disabled}
        onClick={() => onChange('pass')}
      />
      <ChoiceButton
        label={failLabel}
        tone="fail"
        active={value === 'fail'}
        disabled={disabled}
        onClick={() => onChange('fail')}
      />
      {allowNa ? (
        <ChoiceButton
          label="N/A"
          tone="na"
          narrow
          active={value === 'na'}
          disabled={disabled}
          onClick={() => onChange('na')}
        />
      ) : null}
    </Box>
  );
}

function ChoiceButton({
  label,
  active,
  tone,
  narrow,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: 'pass' | 'fail' | 'na';
  narrow?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const bg = !active
    ? '#fff'
    : tone === 'pass'
      ? dutyColors.green
      : tone === 'fail'
        ? dutyColors.red
        : dutyColors.ink15;
  const color = !active ? dutyColors.ink60 : tone === 'na' ? dutyColors.ink : '#fff';
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      sx={{
        flex: narrow ? '0 0 62px' : 1,
        height: 46,
        borderRadius: '10px',
        border: `1.5px solid ${active ? 'transparent' : dutyColors.ink15}`,
        bgcolor: bg,
        color,
        fontWeight: 700,
        fontSize: 14.5,
        boxShadow: active ? '0 2px 8px rgba(29,36,64,0.16)' : 'none',
        '&:hover': { bgcolor: bg, borderColor: active ? 'transparent' : dutyColors.ink40 },
        '&:disabled': { bgcolor: bg, color, opacity: 0.6 },
      }}
    >
      {label}
    </Button>
  );
}
