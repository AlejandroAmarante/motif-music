/** Generates a compact, collision-safe id without pulling in a uuid dependency. */
export function makeId(prefix = '') {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  const id = `${rand[0].toString(36)}${rand[1].toString(36)}${Date.now().toString(36)}`;
  return prefix ? `${prefix}_${id}` : id;
}

export function normalize(str) {
  return (str || '').trim().toLowerCase();
}
