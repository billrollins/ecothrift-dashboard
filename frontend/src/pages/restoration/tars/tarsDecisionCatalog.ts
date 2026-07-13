import type {
  TarsDecisionTestResult,
  TarsSaleState,
} from './tarsDecisionTypes';
import type { TarsActionType } from './tarsWorkTypes';

export interface TarsDecisionTestCatalogEntry {
  id: string;
  name: string;
  prompt: string;
  decisionUse: string;
  defaultRelevant: boolean;
  allowedResults: TarsDecisionTestResult[];
}

export interface TarsStopOutCatalogEntry {
  id: string;
  title: string;
  prompt: string;
  blockedGuidance: string;
  mandatory: true;
  blocksAllSelections?: boolean;
  blockedActions?: TarsActionType[];
  blockedSaleStates?: TarsSaleState[];
}

export const TARS_DECISION_RESULT_OPTIONS: Array<{
  value: TarsDecisionTestResult;
  label: string;
}> = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'not_applicable', label: 'N/A' },
];

/**
 * Universal prompts are deliberately small. A test should be marked relevant only
 * when its result could change grade, sale state, action, or required disclosure.
 */
export const TARS_UNIVERSAL_TEST_CATALOG: TarsDecisionTestCatalogEntry[] = [
  {
    id: 'visual_identity_condition',
    name: 'Identity and visible condition',
    prompt: 'Confirm the item/model and record visible damage or material condition evidence.',
    decisionUse: 'Can change grade, completeness, or disclosure.',
    defaultRelevant: true,
    allowedResults: ['pass', 'fail', 'unknown', 'skipped', 'not_applicable'],
  },
  {
    id: 'basic_function',
    name: 'Basic function',
    prompt: 'Run the shortest practical basic-function check when the result can change the path.',
    decisionUse: 'Can separate tested, broken, repair, and untested paths.',
    defaultRelevant: false,
    allowedResults: ['pass', 'fail', 'unknown', 'skipped', 'not_applicable'],
  },
  {
    id: 'included_components',
    name: 'Included components',
    prompt: 'Check decision-critical components, accessories, or assembly pieces.',
    decisionUse: 'Can change completeness, grade, parts need, or sale state.',
    defaultRelevant: false,
    allowedResults: ['pass', 'fail', 'unknown', 'skipped', 'not_applicable'],
  },
];

/**
 * These are decision stop-outs, not a broad safety checklist. A blocked response
 * constrains the paths listed here and cannot be bypassed with an ordinary override.
 */
export const TARS_MANDATORY_STOP_OUTS: TarsStopOutCatalogEntry[] = [
  {
    id: 'legal_prohibited_sale',
    title: 'Legal / prohibited sale',
    prompt: 'Any recall, legal restriction, prohibited item, or policy reason this cannot be sold?',
    blockedGuidance: 'Do not choose a sale path. Hold/escalate or use an allowed salvage disposition.',
    mandatory: true,
    blockedActions: ['test', 'assemble', 'repair'],
    blockedSaleStates: ['tested', 'untested', 'as_is', 'broken', 'parts_only'],
  },
  {
    id: 'handling_stop',
    title: 'Handling stop',
    prompt: 'Is the item unsafe or unsuitable to continue handling with the available controls?',
    blockedGuidance: 'Stop work and place the item on hold for the required handling decision.',
    mandatory: true,
    blocksAllSelections: true,
  },
  {
    id: 'truthful_disclosure',
    title: 'Truthful disclosure',
    prompt: 'Can the selected tested status, condition, completeness, and unknowns be represented truthfully?',
    blockedGuidance: 'Resolve the disclosure gap or choose a path whose label truthfully represents the item.',
    mandatory: true,
    blockedSaleStates: ['tested', 'untested', 'as_is', 'broken', 'parts_only'],
  },
];

export const TARS_SALE_STATE_LABELS: Record<TarsSaleState, string> = {
  tested: 'Tested',
  untested: 'Untested',
  as_is: 'As-is',
  broken: 'Broken',
  parts_only: 'Parts only',
  salvage: 'Salvage',
};
