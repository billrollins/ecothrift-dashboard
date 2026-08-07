import { Box, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactElement } from 'react';
import {
  processingRowLabelSx,
  PROCESSING_ROW_FIELD_HEIGHT,
  PROCESSING_ROW_VALUE_FONT,
  PROCESSING_ROW_VALUE_FONT_WEIGHT,
} from './processingRowFieldTokens';
import { processingTokens } from './processingTokens';

function FieldHoverTooltip({
  title,
  children,
  disabled = false,
  multiline = false,
}: {
  title: string;
  children: ReactElement;
  disabled?: boolean;
  multiline?: boolean;
}) {
  if (disabled || !title.trim()) return children;
  return (
    <Tooltip
      title={multiline ? <span style={{ whiteSpace: 'pre-line' }}>{title}</span> : title}
      enterDelay={350}
      disableInteractive
    >
      <Box component="span" sx={{ display: 'block', minWidth: 0, flex: 1 }}>
        {children}
      </Box>
    </Tooltip>
  );
}

export const manifestToolbarLabelSx = processingRowLabelSx;

export interface ManifestToolbarPillProps {
  label: string;
  value: string;
  /** Full hover text when `value` is a truncated summary. Defaults to `value`. */
  hoverTitle?: string;
  placeholder?: string;
  onClick?: () => void;
  readOnly?: boolean;
  /** `field` = bordered shell like editable pills; `display` = centered text, no input chrome */
  appearance?: 'field' | 'display';
  emptyItalic?: boolean;
  valueFontSize?: string;
  valueFontWeight?: number;
  sx?: object;
}

export function ManifestToolbarPill({
  label,
  value,
  hoverTitle,
  placeholder = '-',
  onClick,
  readOnly = false,
  appearance = 'field',
  emptyItalic = true,
  valueFontSize = PROCESSING_ROW_VALUE_FONT,
  valueFontWeight = PROCESSING_ROW_VALUE_FONT_WEIGHT,
  sx,
}: ManifestToolbarPillProps) {
  const isEmpty = !value.trim();
  const shown = isEmpty ? placeholder : value;
  const tooltipText = (hoverTitle ?? value).trim();
  const isDisplay = appearance === 'display';
  const valueTextSx = {
    fontSize: valueFontSize,
    fontWeight: valueFontWeight,
    lineHeight: 1.2,
  };
  const valueShellSx = {
    display: 'flex',
    alignItems: 'center',
    minHeight: PROCESSING_ROW_FIELD_HEIGHT,
  };

  return (
    <Box sx={{ minWidth: 0, py: 0.35, px: 0, ...sx }}>
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={400}
        sx={{
          ...manifestToolbarLabelSx,
          ...(isDisplay ? { textAlign: 'center' } : {}),
        }}
      >
        {label}
      </Typography>
      {isDisplay ?
        <Box
          sx={{
            ...valueShellSx,
            justifyContent: 'center',
            px: 0.5,
          }}
        >
          <Typography
            noWrap
            sx={{
              ...valueTextSx,
              fontWeight: 700,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              color: isEmpty ? 'text.disabled' : 'text.primary',
            }}
          >
            {shown}
          </Typography>
        </Box>
      : <FieldHoverTooltip title={tooltipText} disabled={isEmpty && !tooltipText} multiline={Boolean(hoverTitle)}>
          <Box
            onClick={readOnly ? undefined : onClick}
            sx={{
              ...valueShellSx,
              borderRadius: 1,
              border: '1px solid',
              borderColor: processingTokens.border,
              bgcolor: (t) => alpha(t.palette.background.default, 0.4),
              overflow: 'hidden',
              cursor: readOnly ? 'default' : onClick ? 'pointer' : 'default',
              transition: (theme) =>
                theme.transitions.create(['background-color', 'border-color'], { duration: 120 }),
              ...(!readOnly && onClick ?
                {
                  '&:hover': {
                    bgcolor: 'action.hover',
                    borderColor: processingTokens.borderStrong,
                  },
                }
              : {}),
            }}
          >
            <Typography
              noWrap
              sx={{
                flex: 1,
                minWidth: 0,
                px: 0.75,
                ...valueTextSx,
                color: isEmpty ? 'text.disabled' : 'text.primary',
                fontStyle: isEmpty && emptyItalic ? 'italic' : 'normal',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {shown}
            </Typography>
          </Box>
        </FieldHoverTooltip>
      }
    </Box>
  );
}
