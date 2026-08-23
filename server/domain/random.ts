export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T;
}

export function integer(random: () => number, minimum: number, maximum: number): number {
  return Math.floor(random() * (maximum - minimum + 1)) + minimum;
}

export function weightedPick<T extends { weight: number }>(
  random: () => number,
  values: readonly T[],
): T {
  const total = values.reduce((sum, value) => sum + value.weight, 0);
  let cursor = random() * total;
  for (const value of values) {
    cursor -= value.weight;
    if (cursor <= 0) return value;
  }
  return values[values.length - 1] as T;
}
