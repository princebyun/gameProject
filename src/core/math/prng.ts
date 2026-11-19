export class SeededPRNG {
  private state: number;

  constructor(seed: number = 1337) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  public getSeedState(): number {
    return this.state;
  }

  public nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextRange(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  public nextInt(minInclusive: number, maxInclusive: number): number {
    return Math.floor(this.nextRange(minInclusive, maxInclusive + 1));
  }

  public chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }
}
