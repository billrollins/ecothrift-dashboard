import type {
  AuditTaxonomy,
  OwnerSpotResponses,
  SectionAuditResponses,
  SectionTallyResponses,
} from '../../../api/routines.api';

/**
 * A stand-in floor plan for the preview phone.
 *
 * The three section kinds have no authored definition to render, so a preview
 * has to invent something. Naming the sample sections after nothing real keeps
 * anyone from mistaking the preview for live data.
 */
export const PREVIEW_TAXONOMY: AuditTaxonomy = {
  graded: [
    { key: 'facing_blocking', label: 'Items blocking or hiding what is behind them' },
    { key: 'facing_upright', label: 'Items I had to face or stand up' },
    { key: 'facing_grouped', label: 'Items I had to group back with their like items' },
    { key: 'tag_facing', label: 'Tags I had to turn to the front' },
    { key: 'reshelf', label: 'Items I moved back to their own section' },
    { key: 'reprep', label: 'Items I had to re-prep: cords, empty boxes, opened packaging' },
    { key: 'security', label: 'High-theft items loose on the floor' },
    { key: 'hangers', label: 'Empty hangers I pulled' },
  ],
  recorded: [
    { key: 'clean', label: 'Spots I had to clean: dust, trash on the floor or shelf' },
    { key: 'reprice', label: 'Items needing a price look: not selling, wrong tag, missing tag' },
    { key: 'tars', label: 'Items damaged or missing parts' },
  ],
  flags: [
    { key: 'safety', label: 'Safety issue' },
    { key: 'overstocked', label: 'Section full or overstocked' },
    { key: 'low_stock', label: 'Section low or empty' },
  ],
  safety_flag: 'safety',
};

export function previewAudit(name = 'Sample section'): SectionAuditResponses {
  return {
    section_id: null,
    section_name: name,
    photo: null,
    photo_file_id: null,
    items_inspected: 0,
    counts: {},
    flags: [],
    notes: '',
  };
}

export function previewTally(): SectionTallyResponses {
  return {
    sections: ['Sample section', 'Second sample'].map((name, index) => ({
      section_id: -(index + 1),
      section_name: name,
      counts: {},
      flags: [],
      photo: null,
      photo_file_id: null,
      notes: '',
    })),
  };
}

export function previewSpot(): OwnerSpotResponses {
  return {
    checks: [
      {
        routine_key: 'retail.open',
        routine_title: 'Retail — Opening',
        check_id: 'sample-1',
        label: 'A check drawn from the opening list',
        control: 'pass_fail',
        result: '',
      },
      {
        routine_key: 'retail.close',
        routine_title: 'Retail — Closing',
        check_id: 'sample-2',
        label: 'A check drawn from the closing list',
        control: 'pass_fail',
        result: '',
      },
    ],
    audit: previewAudit(),
  };
}
