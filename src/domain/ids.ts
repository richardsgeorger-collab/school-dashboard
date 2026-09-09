function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Deterministic UUID-shaped id from a string, so re-importing the same syllabus yields the same ids. */
export function stableId(key: string): string {
  const hex = [0x811c9dc5, 0x9747b28c, 0x5bd1e995, 0xc2b2ae35]
    .map((seed) => fnv1a(key, seed).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return stableId(`${Date.now()}-${Math.random()}`);
}
