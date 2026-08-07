import type { ReactNode } from 'react';
import { keyframes } from '@emotion/react';
import { Box, Typography } from '@mui/material';
import { preprocessingFonts } from './preprocessingTokens';

export const PREPROCESSING_STEP_LABELS = ['Standardize Manifest', 'AI Cleanup', 'Final Decisions'] as const;

export type StepState = 'selected' | 'done' | 'ready' | 'notReady';

export function getStepState(index: number, activeStep: number, completedStep: number): StepState {
  if (index === activeStep) return 'selected';
  if (index <= completedStep) return 'done';
  if (index === completedStep + 1) return 'ready';
  return 'notReady';
}

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(21, 101, 192, 0.38); }
  50% { box-shadow: 0 0 0 6px rgba(21, 101, 192, 0); }
`;

function chipSx(state: StepState, clickable: boolean): Record<string, unknown> {
  const base = {
    padding: '8px 18px',
    borderRadius: '20px',
    fontSize: 13,
    fontFamily: preprocessingFonts.sans,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap' as const,
    border: '2px solid',
    cursor: clickable ? 'pointer' : 'default',
    transition: 'all 0.2s',
  };
  switch (state) {
    case 'selected':
      return {
        ...base,
        bgcolor: '#2D6A4F',
        color: '#fff',
        borderColor: '#2D6A4F',
        fontWeight: 700,
      };
    case 'done':
      return {
        ...base,
        bgcolor: '#52B788',
        color: '#fff',
        borderColor: '#52B788',
        fontWeight: 600,
      };
    case 'ready':
      return {
        ...base,
        bgcolor: '#E3F2FD',
        color: '#1565C0',
        borderColor: '#90CAF9',
        fontWeight: 600,
        animation: `${pulse} 2s ease-in-out infinite`,
      };
    default:
      return {
        ...base,
        bgcolor: 'transparent',
        color: '#aaa',
        borderColor: '#ddd',
        opacity: 0.5,
        fontWeight: 500,
      };
  }
}

interface PreprocessingStepperProps {
  activeStep: number;
  completedStep: number;
  onStepChange: (index: number) => void;
  /** Right side hint (amber italic per mock). */
  actionHint?: ReactNode;
  /** Primary buttons for the active step. */
  actionSlot?: ReactNode;
}

export function PreprocessingStepper({
  activeStep,
  completedStep,
  onStepChange,
  actionHint,
  actionSlot,
}: PreprocessingStepperProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.25,
        py: '10px',
        px: '24px',
        bgcolor: '#fff',
        borderBottom: '2px solid #DDD5C9',
        mb: 2,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
        {PREPROCESSING_STEP_LABELS.map((label, index) => {
          const state = getStepState(index, activeStep, completedStep);
          const isReachable = index <= completedStep + 1;
          const isLast = index === PREPROCESSING_STEP_LABELS.length - 1;
          const clickable = isReachable && state !== 'notReady';
          return (
            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box
                component={clickable ? 'button' : 'div'}
                type={clickable ? 'button' : undefined}
                onClick={clickable ? () => onStepChange(index) : undefined}
                sx={chipSx(state, clickable)}
              >
                {state === 'done' && <span aria-hidden>✓</span>}
                <span>
                  {index + 1}. {label}
                </span>
              </Box>
              {!isLast && (
                <Typography component="span" sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>
                  -
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          ml: { xs: 0, sm: 'auto' },
          minWidth: 0,
        }}
      >
        {actionHint ? (
          <Typography sx={{ fontSize: 12, color: '#B8860B', fontStyle: 'italic', maxWidth: 320 }}>{actionHint}</Typography>
        ) : null}
        {actionSlot}
      </Box>
    </Box>
  );
}
