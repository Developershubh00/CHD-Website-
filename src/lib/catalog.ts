// Product counts per category, derived from the data.json files under
// src/assets/<category>/slide_NNN/. The catalog grows automatically when a
// new slide folder (with its data.json) is added — there are no hardcoded
// counts to keep in sync. The matching images live in
// public/images/<category>/slide_NNN/.
const dataModules = import.meta.glob('/src/assets/**/data.json', {
  eager: true,
});

export function slideCount(category: string): number {
  const prefix = `/src/assets/${category}/slide_`;
  return Object.keys(dataModules).filter((key) => key.startsWith(prefix)).length;
}
