/**
 * Represents a time range with minimum and maximum prices
 */
export class SpotPriceTimeRange {
  constructor(
    public readonly from: Date,
    public readonly to: Date,
    public readonly minPrice: number,
    public readonly maxPrice: number
  ) {}

  toString(): string {
    const from = this.from.toISOString();
    const to = this.to.toISOString();
    return `SpotPriceTimeRange(minPrice=${this.minPrice}, maxPrice=${this.maxPrice}, from=${from}, to=${to})`;
  }
}
