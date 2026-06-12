/** Shared compact field metrics for processing row defaults + quick check-in toolbars. */
export const PROCESSING_ROW_FIELD_HEIGHT = 26;
export const PROCESSING_ROW_LABEL_FONT = '0.5875rem';
export const PROCESSING_ROW_VALUE_FONT = '0.6875rem';
export const PROCESSING_ROW_VALUE_FONT_COMPACT = '0.625rem';
export const PROCESSING_ROW_VALUE_FONT_EMPHASIZED = '0.75rem';
export const PROCESSING_ROW_VALUE_FONT_WEIGHT = 600;
export const PROCESSING_ROW_EDIT_SEGMENT_WIDTH = 24;
export const PROCESSING_ROW_EDIT_ICON_SIZE = 12;
export const PROCESSING_ROW_EDIT_SEGMENTS_WIDTH = PROCESSING_ROW_EDIT_SEGMENT_WIDTH * 2;

export const processingRowLabelSx = {
  display: 'block',
  mb: 0.1,
  minHeight: 12,
  letterSpacing: 0.28,
  fontSize: PROCESSING_ROW_LABEL_FONT,
  lineHeight: 1.15,
  textTransform: 'uppercase',
} as const;

export const processingRowPillShellSx = {
  minHeight: PROCESSING_ROW_FIELD_HEIGHT,
  fontSize: PROCESSING_ROW_VALUE_FONT,
  fontWeight: PROCESSING_ROW_VALUE_FONT_WEIGHT,
  lineHeight: 1.2,
} as const;

/** Minimum pill width while editing (input + save/cancel). */
export const PROCESSING_ROW_PILL_EDIT_MIN_WIDTH = PROCESSING_ROW_EDIT_SEGMENTS_WIDTH + 72;
