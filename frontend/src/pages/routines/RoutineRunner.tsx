import { Box, Button, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { RoutineCheckResponse, RoutineResponses, VerifyContext } from '../../api/routines.api';
import { dutyColors, thinScrollSx } from '../../components/duty/tokens';
import { VerifyBlock } from './runners/VerifyBlock';
import { answeredCount, deriveResult, failCount, flattenChecks, unansweredCount } from './scoring';

const runnerFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '10px',
    bgcolor: dutyColors.card,
    '& fieldset': { borderColor: dutyColors.ink15 },
    '&:hover fieldset': { borderColor: dutyColors.ink40 },
    '&.Mui-focused fieldset': { borderColor: dutyColors.brand, borderWidth: 1.5 },
  },
} as const;

function patchCheck(
  responses: RoutineResponses,
  checkId: string,
  patch: Partial<RoutineCheckResponse>,
): RoutineResponses {
  return {
    ...responses,
    sections: responses.sections.map((section) => ({
      ...section,
      checks: section.checks.map((check) => (
        check.id === checkId ? { ...check, ...patch, touched: true } : check
      )),
    })),
  };
}

export function RoutineRunner({
  title,
  subject,
  responses,
  verify,
  onChange,
  onSubmit,
  submitting,
  hideFooter,
  readOnly,
}: {
  title: string;
  subject?: string;
  responses: RoutineResponses;
  /** What the shift before this one left behind, when the routine verifies another. */
  verify?: VerifyContext | null;
  onChange?: (next: RoutineResponses) => void;
  onSubmit?: () => void;
  submitting?: boolean;
  hideFooter?: boolean;
  readOnly?: boolean;
}) {
  const checks = useMemo(() => flattenChecks(responses), [responses]);
  const total = checks.length;
  const answered = answeredCount(responses);
  const left = unansweredCount(responses);
  const fails = failCount(responses);
  const signOff = verify && responses.verify ? responses.verify : null;
  const owed = left + (signOff && !signOff.result ? 1 : 0);
  const steps = total + (signOff ? 1 : 0);
  const pct = steps ? Math.round(((steps - owed) / steps) * 100) : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: dutyColors.paper }}>
      <Box
        sx={{
          flex: '0 0 auto',
          background: `linear-gradient(160deg, #3d8b40 0%, ${dutyColors.brand} 58%, ${dutyColors.brandDark} 100%)`,
          color: '#fff',
          px: 2,
          pt: 1.75,
          pb: 1.5,
        }}
      >
        <Typography sx={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'rgba(255,255,255,0.62)', minHeight: 18 }}>
          {subject || ' '}
        </Typography>
        <Box sx={{ mt: 1.25 }}>
          <Box sx={{ height: 6, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
            <Box
              sx={{
                height: '100%',
                width: `${pct}%`,
                borderRadius: 999,
                background: 'linear-gradient(90deg, #C8E6C9 0%, #FFFFFF 100%)',
                transition: 'width 220ms ease',
              }}
            />
          </Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mt: 0.75,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.66)',
            }}
          >
            <span>{steps - owed} of {steps}</span>
            <span>{pct}%</span>
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', pb: 1.5, ...thinScrollSx }}>
        {verify && signOff ? (
          <VerifyBlock
            context={verify}
            value={signOff}
            readOnly={readOnly}
            onChange={(next) => onChange?.({ ...responses, verify: next })}
          />
        ) : null}
        {responses.sections.map((section) => (
          <Box key={section.id}>
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                bgcolor: dutyColors.paper,
                px: 2,
                pt: 1.75,
                pb: 0.75,
                mb: 0.75,
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: dutyColors.ink60,
                borderBottom: `1px solid ${dutyColors.ink15}`,
              }}
            >
              {section.title}
            </Box>
            {section.checks.map((check) => (
              <CheckRow
                key={check.id}
                check={check}
                readOnly={readOnly}
                onPatch={(patch) => onChange?.(patchCheck(responses, check.id, patch))}
              />
            ))}
          </Box>
        ))}
      </Box>

      {hideFooter ? null : (
      <Box sx={{ flex: '0 0 auto', p: 1.5, bgcolor: dutyColors.paper, borderTop: `1px solid ${dutyColors.ink15}` }}>
        <Button
          fullWidth
          variant="contained"
          disabled={owed > 0 || submitting}
          onClick={onSubmit}
          sx={{
            height: 48,
            bgcolor: owed > 0 ? dutyColors.ink15 : dutyColors.brand,
            color: owed > 0 ? dutyColors.ink40 : '#fff',
            fontWeight: 600,
            '&:disabled': { bgcolor: dutyColors.ink15, color: dutyColors.ink40 },
          }}
        >
          {owed > 0
            ? `Answer everything to submit · ${owed} left`
            : fails > 0
              ? `Submit with ${fails} fail${fails === 1 ? '' : 's'}`
              : 'Submit'}
        </Button>
      </Box>
      )}
    </Box>
  );
}

function CheckRow({
  check,
  onPatch,
  readOnly,
}: {
  check: RoutineCheckResponse;
  onPatch: (patch: Partial<RoutineCheckResponse>) => void;
  readOnly?: boolean;
}) {
  const patch = readOnly ? () => undefined : onPatch;
  const result = deriveResult(check);
  const rail = result === 'fail'
    ? dutyColors.red
    : result
      ? dutyColors.green
      : 'transparent';
  return (
    <Box
      sx={{
        // Inset card so the rail sits inside the phone, not against its edge.
        mx: 1.25,
        mb: 0.75,
        bgcolor: dutyColors.card,
        border: `1px solid ${dutyColors.ink08}`,
        borderLeft: `4px solid ${rail}`,
        borderRadius: '10px',
        pl: 1.5,
        pr: 1.5,
        py: 1.25,
      }}
    >
      <Typography sx={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.3, minHeight: 20, color: dutyColors.ink }}>
        {check.label}
        {check.critical ? (
          <Box component="span" sx={{ ml: 1, color: dutyColors.red, fontSize: 12, fontWeight: 700 }}>
            Critical
          </Box>
        ) : null}
      </Typography>
      <Typography sx={{ fontSize: 12, color: dutyColors.ink40, mt: 0.35, height: 16, overflow: 'hidden' }}>
        {check.hint || ' '}
      </Typography>
      {check.control === 'pass_fail' || check.control === 'pass_fail_strict' ? (
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          {(['pass', 'fail'] as const).map((value) => (
            <ChoiceButton
              key={value}
              label={value === 'pass' ? 'Pass' : 'Fail'}
              active={result === value}
              tone={value}
              onClick={() => patch({ result: value })}
            />
          ))}
          {check.control === 'pass_fail' ? (
            <ChoiceButton
              label="N/A"
              active={result === 'na'}
              tone="na"
              narrow
              onClick={() => patch({ result: 'na' })}
            />
          ) : null}
        </Box>
      ) : null}
      {check.control === 'number' ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
          <TextField
            value={check.value ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              if (readOnly) return;
              onPatch({ value: raw === '' ? null : Number(raw) });
            }}
            type="number"
            size="small"
            fullWidth
            disabled={readOnly}
            sx={runnerFieldSx}
            inputProps={{ style: { height: 46, boxSizing: 'border-box', fontSize: 17, fontWeight: 600 } }}
          />
          <Typography sx={{ width: 74, fontSize: 13, color: dutyColors.ink40 }}>
            {check.unit || ' '}
          </Typography>
        </Box>
      ) : null}
      {check.control === 'text' ? (
        <TextField
          value={check.value ?? ''}
          onChange={(e) => {
            if (readOnly) return;
            onPatch({ value: e.target.value });
          }}
          size="small"
          fullWidth
          disabled={readOnly}
          sx={{ mt: 1, ...runnerFieldSx }}
          inputProps={{ style: { height: 46, boxSizing: 'border-box' } }}
        />
      ) : null}
      {check.control === 'photo' ? (
        <PhotoControl check={check} onPatch={patch} readOnly={readOnly} />
      ) : null}
    </Box>
  );
}

function ChoiceButton({
  label,
  active,
  tone,
  narrow,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: 'pass' | 'fail' | 'na';
  narrow?: boolean;
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
      }}
    >
      {label}
    </Button>
  );
}

function PhotoControl({
  check,
  onPatch,
  readOnly,
}: {
  check: RoutineCheckResponse;
  onPatch: (patch: Partial<RoutineCheckResponse>) => void;
  readOnly?: boolean;
}) {
  const [label, setLabel] = useState(check.photo ? 'Photo attached' : 'Add photo');
  useEffect(() => {
    setLabel(check.photo ? 'Photo attached' : 'Add photo');
  }, [check.photo]);
  return (
    <Button
      component="label"
      sx={{
        mt: 1,
        height: 46,
        width: '100%',
        borderRadius: '10px',
        border: `1.5px ${check.photo ? 'solid' : 'dashed'} ${check.photo ? dutyColors.green : dutyColors.ink15}`,
        color: check.photo ? dutyColors.green : dutyColors.ink60,
        bgcolor: check.photo ? '#F1F8F4' : '#fff',
        fontWeight: 600,
      }}
    >
      {label}
      <input
        hidden
        type="file"
        accept="image/*"
        disabled={readOnly}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onPatch({ photo: String(reader.result || '') });
          reader.readAsDataURL(file);
        }}
      />
    </Button>
  );
}
