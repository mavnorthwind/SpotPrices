/**
 * Represents a single spot price entry with valid date range
 */
export class SpotPriceEntry {
  constructor(
    public readonly price: number,
    public readonly validFrom: Date,
    public readonly validTo: Date
  ) {}

  get durationMs(): number {
    return this.validTo.getTime() - this.validFrom.getTime();
  }

  get durationHours(): number {
    return this.durationMs / (1000 * 60 * 60);
  }

  toString(): string {
    const from = this.validFrom.toISOString();
    const to = this.validTo.toISOString();
    return `SpotPriceEntry(price=${this.price}, validFrom=${from}, validTo=${to}, durationHours=${this.durationHours.toFixed(2)})`;
  }
}
