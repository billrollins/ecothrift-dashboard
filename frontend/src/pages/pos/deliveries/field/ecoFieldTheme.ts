/**
 * Field-facing re-export of the shared Delivery theme.
 * Tokens live in `frontend/src/theme/deliveryTheme.ts`.
 */
export {
  ecoField,
  ecoFieldActionCardSx,
  ecoFieldActionTileSx,
  ecoFieldBucketTone,
  ecoFieldCardSx,
  ecoFieldDotColor,
  ecoFieldDotRing,
  ecoFieldMetaChipSx,
  ecoFieldPrimaryButtonPhoneSx as ecoFieldPrimaryButtonSx,
  ecoFieldSecondaryOutlinePhoneSx as ecoFieldSecondaryOutlineSx,
  ecoFieldStatusChipSx,
  ecoFieldStepAccent,
  ecoFieldSummaryCardCompactSx,
  ecoFieldSummaryCardCompleteSx,
  ecoFieldSummaryCardSx,
  frameToneFromDotTone,
  type DeliveryDensity,
  type DeliveryDotTone,
  type EcoFieldStepKey,
  type FrameStatusTone,
} from '../../../../theme/deliveryTheme';

import type { FieldUiStep } from './fieldStepUtils';
import type { EcoFieldStepKey } from '../../../../theme/deliveryTheme';

export function ecoFieldStepForUi(step: FieldUiStep): EcoFieldStepKey {
  return step;
}
