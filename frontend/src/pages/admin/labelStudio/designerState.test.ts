import { describe, expect, it } from 'vitest';

import type { LabelDefinition } from '../../../api/labels.api';
import {
  keyFromName,
  moveElement,
  normalizeDefinition,
  starterDefinition,
} from './designerState';

describe('Label Studio designer state', () => {
  it('creates an immediately understandable starter label', () => {
    const definition = starterDefinition();
    expect(definition.variables).toHaveLength(1);
    expect(definition.elements[0].variable).toBe(definition.variables[0].key);
  });

  it('normalizes legacy labels without exposing required', () => {
    const legacy = {
      variables: [{ key: 'price', label: 'Price', default: '', required: true }],
      elements: [],
    } as unknown as LabelDefinition;
    expect(normalizeDefinition(legacy).variables[0]).toEqual({
      key: 'price',
      name: 'Price',
      kind: 'text',
      default: '',
    });
  });

  it('creates unique stable keys', () => {
    const existing = starterDefinition().variables;
    expect(keyFromName('Text', existing)).toBe('text_2');
  });

  it('moves layers while preserving selection', () => {
    const definition = starterDefinition();
    definition.elements.push({ ...definition.elements[0], x_pct: 20 });
    const moved = moveElement(definition, 0, 1);
    expect(moved.selectedIndex).toBe(1);
    expect(moved.definition.elements[0].x_pct).toBe(20);
  });
});
