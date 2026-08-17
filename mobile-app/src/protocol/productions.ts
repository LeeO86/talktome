// Derived from talktome public/client.js chooseProduction @ bbb8e09.

export type Production = {
  id: number;
  name: string;
};

export type ProductionChoice = {
  id: number | null;
  name: string;
};

export const DEFAULT_PRODUCTION: ProductionChoice = { id: null, name: 'Default' };

export function productionChoices(productions: Production[]): ProductionChoice[] {
  return [DEFAULT_PRODUCTION, ...productions];
}

export function resolveProduction(
  productions: Production[],
  id: number | null,
): ProductionChoice {
  if (id === null) {
    return DEFAULT_PRODUCTION;
  }
  return productions.find((item) => item.id === id) ?? DEFAULT_PRODUCTION;
}
