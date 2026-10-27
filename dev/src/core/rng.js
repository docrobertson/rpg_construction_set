// Seeded random numbers, hashing and dice.

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic hash of integer coords → [0,1)
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class RNG {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.seed = seed >>> 0;
    this.f = mulberry32(this.seed);
  }
  next() { return this.f(); }
  float(a = 0, b = 1) { return a + (b - a) * this.f(); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  chance(p) { return this.f() < p; }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.f() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted(items, weightFn) {
    let total = 0;
    for (const it of items) total += weightFn(it);
    let r = this.f() * total;
    for (const it of items) {
      r -= weightFn(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
}

// Global gameplay RNG (not seeded; combat should feel random)
export const rng = new RNG();

// Dice: "2d6+1", "1d8", "5", 7
export function parseDice(spec) {
  if (typeof spec === 'number') return { n: 0, d: 0, b: spec };
  const m = String(spec).replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) {
    const v = parseInt(spec, 10);
    return { n: 0, d: 0, b: isNaN(v) ? 0 : v };
  }
  return { n: m[1] === '' ? 1 : parseInt(m[1], 10), d: parseInt(m[2], 10), b: m[3] ? parseInt(m[3], 10) : 0 };
}

export function roll(spec, r = rng) {
  const { n, d, b } = parseDice(spec);
  let t = b;
  for (let i = 0; i < n; i++) t += 1 + Math.floor(r.next() * d);
  return t;
}

export function diceAvg(spec) {
  const { n, d, b } = parseDice(spec);
  return n * (d + 1) / 2 + b;
}

export function diceMax(spec) {
  const { n, d, b } = parseDice(spec);
  return n * d + b;
}
