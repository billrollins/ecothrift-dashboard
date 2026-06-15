import { processingTokens } from '../processing/processingTokens';

export const checkInMetricShellSx = {
  px: 0.85,
  py: 0.65,
  borderRadius: 1.25,
  border: '1.5px solid',
  borderColor: processingTokens.primarySoftStrong,
  bgcolor: processingTokens.primarySoft,
  minWidth: 0,
} as const;

export const checkInMetricLabelSx = {
  display: 'block',
  mb: 0.35,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  fontSize: '0.58rem',
  color: processingTokens.primaryDark,
  lineHeight: 1,
} as const;
