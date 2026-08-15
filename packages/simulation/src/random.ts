/** Mulberry32: small deterministic PRNG suitable for repeatable game simulations. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = this.state += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  integer(min: number, maxExclusive: number): number {
    return Math.floor(this.range(min, maxExclusive));
  }
}
