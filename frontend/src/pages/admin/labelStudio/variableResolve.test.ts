import { describe, expect, it } from 'vitest';

import type { LabelDefinition, LabelIncrementFormat } from '../../../api/labels.api';
import {
  emptyPrintForm,
  formatIncrement,
  incrementExamples,
  previewValues,
  validatePrintForm,
  valuesForCopy,
} from './variableResolve';

const definition: LabelDefinition = {
  variables: [
    { key: 'title', name: 'Title', kind: 'text', default: '' },
    {
      key: 'price',
      name: 'Price',
      kind: 'increment',
      default_start: '10',
      default_step: '0.5',
      format: 'currency',
    },
  ],
  elements: [],
};

describe('Label Studio variable resolution', () => {
  it('uses names as the preview and print fallback', () => {
    expect(previewValues(definition).title).toBe('Title');
    expect(valuesForCopy(definition, emptyPrintForm(definition), 0).title).toBe('Title');
  });

  it('resolves fractional and negative increment steps per copy', () => {
    const form = emptyPrintForm(definition);
    expect(valuesForCopy(definition, form, 2).price).toBe('$11.00');
    form.increment.price.step = '-2';
    expect(valuesForCopy(definition, form, 2).price).toBe('$6.00');
  });

  it.each<[LabelIncrementFormat, string]>([
    ['plain', '12.5'],
    ['integer', '12'],
    ['fixed_2', '12.50'],
    ['currency', '$12.50'],
    ['pad_4', '0012'],
    ['pad_6', '000012'],
  ])('formats %s increments', (format, expected) => {
    expect(formatIncrement(12.5, format)).toBe(expected);
  });

  it('accepts zero step and shows repeated examples', () => {
    const variable = definition.variables[1];
    if (variable.kind !== 'increment') throw new Error('fixture');
    expect(incrementExamples(variable, { start: '7', step: '0' })).toEqual([
      '$7.00',
      '$7.00',
      '$7.00',
    ]);
  });

  it('rejects non-finite print inputs', () => {
    const form = emptyPrintForm(definition);
    form.increment.price.start = 'Infinity';
    expect(validatePrintForm(definition, form)).toContain('start must be a number');
  });
});
