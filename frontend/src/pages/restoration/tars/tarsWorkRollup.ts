import { effectiveLaborRate } from './tarsProfit';
import type { TarsItem } from './tarsTypes';
import type {
  TarsAction,
  TarsGradeDirectionRow,
  TarsPartLine,
  TarsProcurementGroup,
  TarsRepairAction,
  TarsRepairOption,
  TarsSalvageAction,
  TarsWorkEvaluation,
  TarsWorkSession,
} from './tarsWorkTypes';

export type { TarsWorkSession };

function partLineTotal(part: TarsPartLine, useActual: boolean): number {
  const unit = useActual && part.unitPriceActual > 0 ? part.unitPriceActual : part.unitPriceEstimate;
  return unit * (part.qty || 1);
}

function optionPartsTotal(option: TarsRepairOption, useActual: boolean): number {
  return option.parts.reduce((sum, p) => sum + partLineTotal(p, useActual), 0);
}

function procurementGroupsForParts(
  groups: TarsProcurementGroup[],
  parts: TarsPartLine[],
): TarsProcurementGroup[] {
  const partIds = new Set(parts.map((p) => p.id));
  return groups.filter((g) => g.partIds.some((id) => partIds.has(id)));
}

function procurementGroupTotal(groups: TarsProcurementGroup[]): number {
  return groups.reduce((sum, g) => sum + g.shipping + g.tax + g.fees, 0);
}

function actionHours(action: TarsAction, useActual: boolean): number {
  if (useActual && action.timeActualHours > 0) return action.timeActualHours;
  if (action.timeEstimateHours > 0) return action.timeEstimateHours;
  if (action.type === 'test') {
    return action.tests.reduce(
      (sum, t) => sum + (useActual && t.timeActualHours > 0 ? t.timeActualHours : t.timeEstimateHours),
      0,
    );
  }
  if (action.type === 'repair') {
    const selected = action.options.find((o) => o.selected) ?? action.options[0];
    if (selected) {
      return useActual && selected.timeActualHours > 0 ? selected.timeActualHours : selected.timeEstimateHours;
    }
  }
  return 0;
}

function actionPartsCost(
  action: TarsAction,
  session: TarsWorkSession,
  useActual: boolean,
): number {
  if (action.type !== 'repair') return 0;
  const selected = action.options.find((o) => o.selected) ?? action.options[0];
  if (!selected) return 0;
  const partsTotal = optionPartsTotal(selected, useActual);
  const groups = procurementGroupsForParts(session.procurementGroups, selected.parts);
  return partsTotal + procurementGroupTotal(groups);
}

function salvageRecovery(action: TarsSalvageAction): number {
  return action.lines.reduce((sum, line) => sum + (line.valueRecovery || 0), 0);
}

export function computeSessionActionCosts(
  session: TarsWorkSession,
  hourlyRate: number,
  timePremium: number,
  useActual: boolean,
): {
  total: number | null;
  labor: number;
  parts: number;
  salvageRecovery: number;
  hasUnknown: boolean;
  byType: { test: number; assemble: number; repair: number; salvage: number };
} {
  const laborRate = effectiveLaborRate(hourlyRate, timePremium);
  let labor = 0;
  let parts = 0;
  let salvageRec = 0;
  let hasUnknown = false;
  const byType = { test: 0, assemble: 0, repair: 0, salvage: 0 };

  for (const action of session.actions) {
    if (action.status === 'skipped') continue;
    const hours = actionHours(action, useActual);
    if (hours <= 0 && action.status !== 'complete') {
      if (action.type === 'repair') {
        const selected = (action as TarsRepairAction).options.find((o) => o.selected);
        if (selected && selected.parts.some((p) => p.unitPriceEstimate <= 0 && p.unitPriceActual <= 0)) {
          hasUnknown = true;
        }
      }
    }
    const laborCost = hours * laborRate;
    labor += laborCost;
    byType[action.type] += laborCost;

    if (action.type === 'repair') {
      const pCost = actionPartsCost(action, session, useActual);
      parts += pCost;
      byType.repair += pCost;
    }
    if (action.type === 'salvage') {
      salvageRec += salvageRecovery(action);
    }
  }

  if (session.actions.length === 0) hasUnknown = true;

  return {
    total: hasUnknown && !useActual ? null : labor + parts - salvageRec,
    labor,
    parts,
    salvageRecovery: salvageRec,
    hasUnknown,
    byType,
  };
}

export function evaluateWorkSession(
  item: TarsItem,
  session: TarsWorkSession | undefined,
  hourlyRate: number,
  timePremium: number,
): TarsWorkEvaluation {
  const resolvedSession = session ?? createEmptyWorkSession();
  const grades = Object.entries(item.values).filter(([, v]) => v > 0);
  const costActual = computeSessionActionCosts(resolvedSession, hourlyRate, timePremium, true);
  const costEstimate = computeSessionActionCosts(resolvedSession, hourlyRate, timePremium, false);

  const directions: TarsGradeDirectionRow[] = grades.map(([grade, processorValue]) => {
    const linked = resolvedSession.actions.filter((a) => !a.linkedGrade || a.linkedGrade === grade);
    const linkedSession = { ...resolvedSession, actions: linked };
    const est = computeSessionActionCosts(linkedSession, hourlyRate, timePremium, false);
    const act = computeSessionActionCosts(linkedSession, hourlyRate, timePremium, true);

    const testHours = linked
      .filter((a) => a.type === 'test')
      .reduce((s, a) => s + actionHours(a, false), 0);
    const assembleHours = linked
      .filter((a) => a.type === 'assemble')
      .reduce((s, a) => s + actionHours(a, false), 0);
    const repairActions = linked.filter((a) => a.type === 'repair') as TarsRepairAction[];
    let repairParts = 0;
    let repairHours = 0;
    for (const ra of repairActions) {
      repairParts += actionPartsCost(ra, linkedSession, false);
      repairHours += actionHours(ra, false);
    }
    const salvageRec = linked
      .filter((a) => a.type === 'salvage')
      .reduce((s, a) => s + salvageRecovery(a as TarsSalvageAction), 0);

    return {
      grade,
      processorValue,
      estimatedActionCost: est.total,
      actualActionCost: act.total,
      partsCost: est.parts,
      laborCost: est.labor,
      projectedProfit: est.total !== null ? processorValue - est.total : null,
      actualProfit: act.total !== null ? processorValue - act.total : null,
      actionSummary: {
        testHours,
        assembleHours,
        repairParts,
        repairHours,
        salvageRecovery: salvageRec,
      },
      isSelected: resolvedSession.selectedGrade === grade,
      isRecommended: false,
      hasUnknownCosts: est.hasUnknown,
    };
  });

  let recommendedGrade: string | null = null;
  let bestProfit = -Infinity;
  for (const d of directions) {
    if (d.projectedProfit !== null && d.projectedProfit > bestProfit) {
      bestProfit = d.projectedProfit;
      recommendedGrade = d.grade;
    }
  }
  if (recommendedGrade) {
    for (const d of directions) {
      d.isRecommended = d.grade === recommendedGrade;
    }
  }

  return {
    directions,
    selectedGrade: resolvedSession.selectedGrade,
    recommendedGrade,
  };
}

export function createEmptyWorkSession(workState: TarsWorkSession['workState'] = 'queue'): TarsWorkSession {
  return { workState, selectedGrade: null, actions: [], procurementGroups: [] };
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
