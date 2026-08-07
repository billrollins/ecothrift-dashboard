import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { processingTokens } from '../processing/processingTokens';
import {
  workbenchSearchContentSx,
  workbenchSearchLabelSx,
  workbenchSearchShellSx,
  type WorkbenchSearchFieldTone,
} from './workbenchSearchFieldSx';

export interface WorkbenchSearchFieldShellProps {
  tone: WorkbenchSearchFieldTone;
  label: string;
  required?: boolean;
  /** Amber outline when a required field is still empty. */
  incomplete?: boolean;
  children: ReactNode;
}

export function WorkbenchSearchFieldShell({
  tone,
  label,
  required,
  incomplete,
  children,
}: WorkbenchSearchFieldShellProps) {
  return (
    <Box sx={workbenchSearchShellSx(tone, { incomplete })}>
      <Typography variant="caption" sx={workbenchSearchLabelSx(tone)}>
        {label}{required ? ' *' : ''}
      </Typography>
      <Box sx={workbenchSearchContentSx}>{children}</Box>
    </Box>
  );
}

export interface WorkbenchOrderReadOnlyFieldProps {
  value: string;
  mono?: boolean;
}

export function WorkbenchOrderReadOnlyField({ value, mono }: WorkbenchOrderReadOnlyFieldProps) {
  return (
    <WorkbenchSearchFieldShell tone="order" label="Order">
      <Typography
        noWrap
        sx={{
          fontSize: '0.8125rem',
          fontWeight: 700,
          color: processingTokens.textStrong,
          fontFamily: mono ? processingTokens.monoFontFamily : undefined,
          lineHeight: 1.25,
          width: '100%',
        }}
      >
        {value || '-'}
      </Typography>
    </WorkbenchSearchFieldShell>
  );
}
