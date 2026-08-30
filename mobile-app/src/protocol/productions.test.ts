import { describe, expect, it } from 'vitest';

import { DEFAULT_PRODUCTION, productionChoices, resolveProduction, visibleProductionName } from './productions';

describe('productionChoices', () => {
  it('offers a synthetic Default first when the server does not announce one', () => {
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

  it('does not double Default when the server announces one', () => {
    expect(
      productionChoices([
        { id: 1, name: 'Default' },
        { id: 2, name: 'Studio' },
      ]),
    ).toEqual([
      { id: 1, name: 'Default' },
      { id: 2, name: 'Studio' },
    ]);
  });
});

describe('resolveProduction', () => {
  it('falls back to Default when the id is missing', () => {
    expect(resolveProduction([{ id: 2, name: 'Test-von-Adi' }], 99)).toEqual(DEFAULT_PRODUCTION);
    expect(resolveProduction([{ id: 2, name: 'Test-von-Adi' }], null).name).toBe('Default');
  });
});

describe('visibleProductionName', () => {
  it('hides Default and empty names', () => {
    expect(visibleProductionName('Default')).toBeNull();
    expect(visibleProductionName('default')).toBeNull();
    expect(visibleProductionName(null)).toBeNull();
    expect(visibleProductionName('Studio 2')).toBe('Studio 2');
  });
});
