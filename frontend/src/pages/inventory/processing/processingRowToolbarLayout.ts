/** Full-width toolbar rows - quick check-in may wrap within the card. */
export const processingRowToolbarRowSx = {
  display: 'flex',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  gap: 0.5,
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
} as const;

/** Processing row defaults - single horizontal line (scroll inside card if needed). */
export const processingRowManifestToolbarRowSx = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'nowrap',
  gap: 0.5,
  minWidth: 'max-content',
} as const;

export const processingRowManifestBodySx = {
  px: 0.75,
  py: 0.85,
  minWidth: 0,
  overflowX: 'auto',
  overflowY: 'hidden',
} as const;

export const processingRowSectionBodyFitSx = {
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
} as const;
