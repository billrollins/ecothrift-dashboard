import { TARS_GRADE_SCALES } from './tarsConstants';
import { effectiveLaborRate, gradesForScale } from './tarsProfit';
import type { TarsItem } from './tarsTypes';
import type {
  TarsPartLine,
  TarsProcurementGroup,
  TarsWorkEvaluation,
  TarsGradeDirectionRow,
  TarsWorkSession,
} from './tarsWorkTypes';

export type { TarsWorkSession };

/** Coerce possibly-missing/NaN numeric fields from legacy work_session data. */
function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function partUnit(part: TarsPartLine): number {
  const actual = num(part.unitPriceActual);
  return actual > 0 ? actual : num(part.unitPriceEstimate);
}

/** Grand total for one order: selected parts (with order qty overrides) + shipping + tax + fees. */
function orderTotal(parts: TarsPartLine[], order: TarsProcurementGroup): number {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const subtotal = order.partIds.reduce((sum, id) => {
    const part = byId.get(id);
    if (!part) return sum;
    const override = num(order.partQtyOverrides?.[id]);
    const qty = override > 0 ? override : num(part.qty) || 1;
    return sum + partUnit(part) * qty;
  }, 0);
  return subtotal + num(order.shipping) + num(order.tax) + num(order.fees);
}

/**
 * One direction row per grade in the item's current scale that has a value > 0.
 * Cost-only: labor (estimated hours × rate) + attached orders. No profit math.
 */
export function evaluateWorkSession(
  item: TarsItem,
  session: TarsWorkSession | undefined,
  hourlyRate: number,
  timePremium: number,
  scales: Record<string, string[]> = TARS_GRADE_SCALES,
): TarsWorkEvaluation {
  const resolved = session ?? createEmptyWorkSession();
  const values = item.values ?? {};
  const scaleGrades = gradesForScale(item.scale, scales);
  const gradeNames = scaleGrades.length > 0 ? scaleGrades : Object.keys(values);
  const laborRate = effectiveLaborRate(hourlyRate, timePremium);

  const directions: TarsGradeDirectionRow[] = gradeNames
    .filter((grade) => (values[grade] ?? 0) > 0)
    .map((grade) => {
      const plan = resolved.gradePlans?.[grade];
      const estimateHours = num(plan?.estimateHours);
      const orderIds = plan?.orderIds ?? [];
      const attachedOrders = resolved.orders.filter((o) => orderIds.includes(o.id));
      const laborCost = estimateHours * laborRate;
      const ordersCost = attachedOrders.reduce((sum, o) => sum + orderTotal(resolved.parts, o), 0);
      return {
        grade,
        processorValue: values[grade] ?? 0,
        estimateHours,
        laborCost,
        ordersCost,
        restoreCost: laborCost + ordersCost,
        orderCount: attachedOrders.length,
        isSelected: resolved.selectedGrade === grade,
      };
    });

  return {
    directions,
    selectedGrade: resolved.selectedGrade,
  };
}

export function createEmptyWorkSession(
  workState: TarsWorkSession['workState'] = 'queue',
): TarsWorkSession {
  return {
    workState,
    selectedGrade: null,
    parts: [],
    orders: [],
    gradePlans: {},
    benchRows: [],
  };
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
