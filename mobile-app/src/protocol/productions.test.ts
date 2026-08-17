import { describe, expect, it } from 'vitest';

import { DEFAULT_PRODUCTION, productionChoices, resolveProduction } from './productions';

describe('productionChoices', () => {
  it('always offers Default first, then server productions', () => {
    expect(
      productionChoices([
        { id: 2, name: 'Test-von-Adi' },
        { id: 1, name: 'Studio' },
      ]),
    ).toEqual([
      DEFAULT_PRODUCTION,
      { id: 2, name: 'Test-von-Adi' },
      { id: 1, name: 'Studio' },
    ]);
  });
});

describe('resolveProduction', () => {
  it('falls back to Default when the id is missing', () => {
    expect(resolveProduction([{ id: 2, name: 'Test-von-Adi' }], 99)).toEqual(DEFAULT_PRODUCTION);
    expect(resolveProduction([{ id: 2, name: 'Test-von-Adi' }], null).name).toBe('Default');
  });
});
