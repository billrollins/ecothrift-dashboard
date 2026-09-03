import type {
  AuditTaxonomy,
  OwnerSpotResponses,
  SectionAuditResponses,
  SectionTallyResponses,
  WorkCycleResponses,
} from '../../../api/routines.api';

/**
 * A stand-in floor plan for the preview phone.
 *
 * The three section kinds have no authored definition to render, so a preview
 * has to invent something. Naming the sample sections after nothing real keeps
 * anyone from mistaking the preview for live data.
 */
export const PREVIEW_TAXONOMY: AuditTaxonomy = {
  groups: [
    {
      key: 'facing',
      solution: 'fix_in_place',
      label: 'Facing + tag',
      items: [
        { key: 'facing_blocking', label: 'Blocking or hiding items behind' },
        { key: 'tag_facing', label: 'Tag not front-facing' },
      ],
    },
    {
      key: 'flags',
      solution: 'flag',
      label: 'Flags',
      items: [
        { key: 'safety', label: 'Safety issue, cannot fix alone' },
        { key: 'overstocked', label: 'Section full or overstocked' },
        { key: 'low_stock', label: 'Section low or empty' },
      ],
    },
    {
      key: 'just_do',
      solution: 'just_do',
      label: 'Just do',
      items: [
        { key: 'clean_dirty', label: 'Dirty or dusty but sellable' },
        { key: 'hangers', label: 'Empty hangers on rack' },
      ],
    },
    {
      key: 'reshelf',
      solution: 'reshelf_cart',
      label: 'Reshelf cart',
      items: [{ key: 'reshelf', label: 'Item in wrong section' }],
    },
  ],
  graded: [
    { key: 'facing', label: 'Facing + tag' },
    { key: 'reshelf', label: 'Reshelf cart' },
  ],
  recorded: [
    { key: 'pr_cart', label: 'PR cart' },
    { key: 'tars', label: 'TARS cart' },
  ],
  flags: [
    { key: 'safety', label: 'Safety issue, cannot fix alone' },
    { key: 'overstocked', label: 'Section full or overstocked' },
    { key: 'low_stock', label: 'Section low or empty' },
  ],
  safety_flag: 'safety',
};

export function previewAudit(name = 'Sample section', sectionId = 1): SectionAuditResponses {
  return {
    section_id: sectionId,
    section_name: name,
    photo: null,
    photo_file_id: null,
    items_inspected: 0,
    counts: {},
    flags: [],
    notes: '',
  };
}

export function previewTally(name = 'Sample section'): SectionTallyResponses {
  return {
    sections: [{
      section_id: -1,
      section_name: name,
      counts: {},
      flags: [],
      photo: null,
      photo_file_id: null,
      notes: '',
    }],
  };
}

export function previewSpot(): OwnerSpotResponses {
  return {
    checks: [
      {
        routine_key: 'retail.open',
        routine_title: 'Retail open',
        check_id: 'sample-1',
        label: 'A check drawn from the opening list',
        control: 'pass_fail',
        result: '',
      },
      {
        routine_key: 'retail.close',
        routine_title: 'Retail close',
        check_id: 'sample-2',
        label: 'A check drawn from the closing list',
        control: 'pass_fail',
        result: '',
      },
    ],
    audit: previewAudit(),
  };
}

export function previewWorkCycle(): WorkCycleResponses {
  return {
    mode: '',
    shelf: {
      section_id: null,
      section_name: '',
      counts: {},
      flags: [],
      photo: null,
      photo_file_id: null,
      notes: '',
    },
    non_shelf: { done: [], notes: '' },
  };
}
