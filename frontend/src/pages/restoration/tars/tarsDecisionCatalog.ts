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
  packId?: string;
  checklistKeys?: string[];
}

export interface TarsTestPackCatalogEntry {
  id: string;
  name: string;
  description: string;
  /** Lowercase keywords matched against item category/name/brand. Empty = always suggest. */
  matchKeywords: string[];
  testIds: string[];
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

export const TARS_VISUAL_CHECKLIST_KEYS = [
  'cosmetic_damage',
  'parts_damage',
  'has_all_parts',
  'has_all_accessories',
  'has_box',
  'has_manual',
] as const;

export const TARS_VISUAL_CHECKLIST_LABELS: Record<(typeof TARS_VISUAL_CHECKLIST_KEYS)[number], string> = {
  cosmetic_damage: 'Cosmetic damage',
  parts_damage: 'Parts damage',
  has_all_parts: 'Has all parts',
  has_all_accessories: 'Has all accessories',
  has_box: 'Has box',
  has_manual: 'Has manual',
};

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
    packId: 'universal_visual',
  },
  {
    id: 'universal_completeness',
    name: 'Completeness check',
    prompt: 'Required parts / accessories present for the intended grade.',
    decisionUse: 'Can change completeness, grade, parts need, or sale state.',
    defaultRelevant: true,
    allowedResults: ['pass', 'fail', 'unknown', 'skipped', 'not_applicable'],
    packId: 'universal_visual',
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
  {
    id: 'elec_turns_on',
    name: 'Turns on',
    prompt: 'Has cords / power path, can test, and powers on.',
    decisionUse: 'Separates untested / broken / repair / tested paths.',
    defaultRelevant: true,
    allowedResults: ['pass', 'fail', 'unknown', 'skipped', 'not_applicable'],
    packId: 'basic_electronics',
  },
  {
    id: 'elec_visual_inspection',
    name: 'Passes visual inspection',
    prompt: 'Cosmetic damage, parts damage, completeness, accessories, box, manual.',
    decisionUse: 'Feeds grade and disclosure.',
    defaultRelevant: true,
    allowedResults: ['pass', 'fail', 'unknown', 'skipped', 'not_applicable'],
    packId: 'basic_electronics',
    checklistKeys: [...TARS_VISUAL_CHECKLIST_KEYS],
  },
  {
    id: 'elec_primary_function',
    name: 'Verify primary function',
    prompt: 'Primary use case works enough to support the intended sale path.',
    decisionUse: 'Can change tested sale state vs repair / as-is.',
    defaultRelevant: true,
    allowedResults: ['pass', 'fail', 'unknown', 'skipped', 'not_applicable'],
    packId: 'basic_electronics',
  },
];

export const TARS_TEST_PACKS: TarsTestPackCatalogEntry[] = [
  {
    id: 'universal_visual',
    name: 'Universal visual + completeness',
    description: 'Identity, visible condition, and completeness for any item.',
    matchKeywords: [],
    testIds: ['visual_identity_condition', 'universal_completeness'],
  },
  {
    id: 'basic_electronics',
    name: 'Basic Electronics',
    description: 'Power-on, visual inspection checklist, primary function.',
    matchKeywords: [
      'electronic',
      'electronics',
      'tv',
      'audio',
      'speaker',
      'laptop',
      'computer',
      'tablet',
      'phone',
      'monitor',
      'printer',
      'appliance',
      'microwave',
      'blender',
      'vacuum',
      'charger',
      'battery',
      'radio',
      'stereo',
      'game',
      'console',
      'camera',
      'dvd',
      'blu-ray',
      'receiver',
    ],
    testIds: ['elec_turns_on', 'elec_visual_inspection', 'elec_primary_function'],
  },
];

/**
 * These are decision stop-outs, not a broad safety checklist. A blocked response
 * constrains the paths listed here and cannot be bypassed with an ordinary override.
 * Cockpit UX does not show a Stops step - unanswered is treated as clear.
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

export function suggestTestPackIds(item: {
  category?: string | null;
  name?: string | null;
  brand?: string | null;
}): string[] {
  const haystack = `${item.category ?? ''} ${item.name ?? ''} ${item.brand ?? ''}`.toLowerCase();
  const ids = new Set<string>(['universal_visual']);
  for (const pack of TARS_TEST_PACKS) {
    if (!pack.matchKeywords.length) continue;
    if (pack.matchKeywords.some((keyword) => haystack.includes(keyword))) {
      ids.add(pack.id);
    }
  }
  return [...ids];
}
