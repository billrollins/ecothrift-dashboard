import { newId } from './tarsWorkRollup';
import type {
  TarsAssembleAction,
  TarsRepairAction,
  TarsSalvageAction,
  TarsTestAction,
} from './tarsWorkTypes';

export function createTestAction(linkedGrade?: string): TarsTestAction {
  return {
    id: newId(),
    type: 'test',
    status: 'planned',
    notes: '',
    timeEstimateHours: 0,
    timeActualHours: 0,
    linkedGrade,
    tests: [],
  };
}

export function createAssembleAction(linkedGrade?: string): TarsAssembleAction {
  return {
    id: newId(),
    type: 'assemble',
    status: 'planned',
    notes: '',
    timeEstimateHours: 0,
    timeActualHours: 0,
    linkedGrade,
    steps: [],
  };
}

export function createRepairAction(linkedGrade?: string): TarsRepairAction {
  return {
    id: newId(),
    type: 'repair',
    status: 'planned',
    notes: '',
    timeEstimateHours: 0,
    timeActualHours: 0,
    linkedGrade,
    complaint: '',
    diagnosis: '',
    correction: '',
    result: '',
    options: [
      {
        id: newId(),
        name: 'Option A',
        notes: '',
        timeEstimateHours: 0,
        timeActualHours: 0,
        parts: [],
        selected: true,
      },
    ],
  };
}

export function createSalvageAction(linkedGrade?: string): TarsSalvageAction {
  return {
    id: newId(),
    type: 'salvage',
    status: 'planned',
    notes: '',
    timeEstimateHours: 0,
    timeActualHours: 0,
    linkedGrade,
    lines: [],
  };
}
