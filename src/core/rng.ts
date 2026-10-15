/**
 * Gerador pseudoaleatório determinístico (mulberry32). Com a mesma semente, os
 * cenários dos simuladores se repetem exatamente — o que permite reproduzir uma sessão.
 */
export interface Rng {
  /** Número em [0, 1). */
  next(): number;
  /** Número em [min, max). */
  range(min: number, max: number): number;
  /** Inteiro em [min, max] (inclusivo). */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  chance(probability: number): boolean;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('Lista vazia');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    shuffle: (items) => {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copy[i] as (typeof copy)[number];
        copy[i] = copy[j] as (typeof copy)[number];
        copy[j] = tmp;
      }
      return copy;
    },
    chance: (probability) => next() < probability,
  };
  return rng;
}

/** Combina números em uma nova semente de 32 bits (hash FNV-1a). */
export function hashSeed(...parts: (number | string)[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x7c;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Semente nova a partir de uma fonte de entropia (não determinística por design). */
export function freshSeed(): number {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    const buffer = new Uint32Array(1);
    cryptoObj.getRandomValues(buffer);
    return (buffer[0] ?? 1) >>> 0 || 1;
  }
  return (Date.now() ^ 0x5bd1e995) >>> 0;
}
