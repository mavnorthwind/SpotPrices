import axios from 'axios';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type SpotPriceRawData = {
  unit: string;
  unix_seconds: number[];
  price: number[];
  updateTimestamp: string | Date;
  [key: string]: unknown;
};

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

export default class SpotPrices {
  #cachedFilePath: string;
  #spotpricedata?: SpotPriceRawData;
  #updateTimestamp?: string | Date;
  #prices?: number[];
  #dates?: Date[];
  #entries?: SpotPriceEntry[];
  #unit?: string;
  #minDate?: Date;
  #maxDate?: Date;

  constructor(rawSpotPriceData: SpotPriceRawData | null = null) {
    const basePath = process.argv[1] ? path.dirname(process.argv[1]) : __dirname;
    this.#cachedFilePath = path.join(basePath, 'spotPricesCache.json');
    this.#readCachedPrices(rawSpotPriceData);
  }

  get hasData(): boolean {
    return this.#spotpricedata !== undefined;
  }

  get prices(): number[] | undefined {
    return this.#prices;
  }

  get dates(): Date[] | undefined {
    return this.#dates;
  }

  get entries(): SpotPriceEntry[] | undefined {
    return this.#entries;
  }

  get unit(): string | undefined {
    return this.#unit;
  }

  get updateTimestamp(): Date {
    return new Date(this.#updateTimestamp as string | Date);
  }

  get minDate(): Date | undefined {
    return this.#minDate;
  }

  get maxDate(): Date | undefined {
    return this.#maxDate;
  }

  get minToday(): { price: number; validFrom: Date; validTo: Date } {
    const extremaIndices = this.#getTodayHighLowIndex(this.#entries);
    const entry = this.#entries![extremaIndices.minIndex];
    return { price: entry.price, validFrom: entry.validFrom, validTo: entry.validTo };
  }

  get minTodayPrice(): number {
    return this.minToday.price;
  }

  get maxToday(): { price: number; validFrom: Date; validTo: Date } {
    const extremaIndices = this.#getTodayHighLowIndex(this.#entries);
    const entry = this.#entries![extremaIndices.maxIndex];
    return { price: entry.price, validFrom: entry.validFrom, validTo: entry.validTo };
  }

  get maxTodayPrice(): number {
    return this.maxToday.price;
  }

  get minTodayPriceDate(): Date {
    return this.minToday.validFrom;
  }

  get maxTodayPriceDate(): Date {
    return this.maxToday.validFrom;
  }

  get currentPrice(): number {
    if (!this.#entries) {
      throw new Error('Only future prices in dataset');
    }
    const nowIndex = this.#findIndexOfEntryEarlierOrEqual(this.#entries);
    if (nowIndex < 0) {
      throw new Error('Only future prices in dataset');
    }
    return this.#entries[nowIndex].price;
  }

  get currentPriceDate(): Date {
    if (!this.#entries) {
      throw new Error('Only future prices in dataset');
    }
    const nowIndex = this.#findIndexOfEntryEarlierOrEqual(this.#entries);
    if (nowIndex < 0) {
      throw new Error('Only future prices in dataset');
    }
    return this.#entries[nowIndex].validFrom;
  }

  get hasTomorrowsPrices(): boolean {
    if (!this.#dates || this.#dates.length === 0) return false;

    const now = new Date();
    const tomorrowStart = new Date(now);
    tomorrowStart.setHours(0, 0, 0, 0);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    return this.#maxDate !== undefined && this.#maxDate >= tomorrowStart;
  }

  getTimeRangeBelow(maxPrice: number): SpotPriceTimeRange[] {
    if (typeof maxPrice !== 'number' || !Array.isArray(this.#entries) || this.#entries.length === 0) {
      return [];
    }

    const ranges: SpotPriceTimeRange[] = [];
    let current: { from: Date; to: Date; prices: number[] } | null = null;

    for (const entry of this.#entries) {
      if (typeof entry.price !== 'number') continue;

      if (entry.price <= maxPrice) {
        if (!current) {
          current = {
            from: entry.validFrom,
            to: entry.validTo,
            prices: [entry.price]
          };
        } else {
          current.to = entry.validTo;
          current.prices.push(entry.price);
        }
      } else if (current) {
        const minPrice = Math.min(...current.prices);
        const maxPriceInRange = Math.max(...current.prices);
        ranges.push(new SpotPriceTimeRange(current.from, current.to, minPrice, maxPriceInRange));
        current = null;
      }
    }

    if (current) {
      const minPrice = Math.min(...current.prices);
      const maxPriceInRange = Math.max(...current.prices);
      ranges.push(new SpotPriceTimeRange(current.from, current.to, minPrice, maxPriceInRange));
    }

    return ranges;
  }

  async updateSpotPricesAsync(daysBack = 1, daysForward = 1): Promise<void> {
    const now = new Date();

    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - daysBack);
    const start = startDate.toISOString();

    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    endDate.setDate(endDate.getDate() + daysForward);
    const end = endDate.toISOString();

    const spotPricesUrl = `https://api.energy-charts.info/price?bzn=DE-LU&start=${start}&end=${end}`;

    try {
      const res = await axios.get<SpotPriceRawData>(spotPricesUrl, { timeout: 30000 });
      console.debug('Got spot price data');

      res.data.updateTimestamp = now;

      await this.#writeCachedPricesAsync(res.data);
      this.#readCachedPrices();
    } catch (error) {
      console.error(`Request for spot prices from ${spotPricesUrl} returned error:`, error);
      throw error;
    }
  }

  #findIndexOfEntryEarlierOrEqual(datesArray: Array<Date | SpotPriceEntry>, startingFrom = new Date()): number {
    return datesArray.reduce((bestIdx, item, idx) => {
      const date = item instanceof Date ? item : item.validFrom;
      if (date < startingFrom && (bestIdx === -1 || date > (datesArray[bestIdx] instanceof Date ? datesArray[bestIdx] : datesArray[bestIdx].validFrom))) {
        return idx;
      }
      return bestIdx;
    }, -1);
  }

  #getTodayHighLowIndex(entries?: SpotPriceEntry[]): { minIndex: number; maxIndex: number } {
    if (!Array.isArray(entries)) {
      throw new TypeError('entries must be an array');
    }

    const now = new Date();
    const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    let highestIndex = -1;
    let lowestIndex = -1;
    let highestPrice = -Infinity;
    let lowestPrice = Infinity;
    let hasTodaysPrices = false;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const d = entry.validFrom;
      if (!(d instanceof Date) || isNaN(d.getTime())) {
        throw new Error(`Ungültiges Datum an Index ${i}`);
      }

      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (key === today) {
        hasTodaysPrices = true;

        const p = entry.price;
        if (typeof p !== 'number' || isNaN(p)) {
          throw new Error(`Ungültiger Preis an Index ${i}`);
        }

        if (p > highestPrice) {
          highestPrice = p;
          highestIndex = i;
        }
        if (p < lowestPrice) {
          lowestPrice = p;
          lowestIndex = i;
        }
      }
    }

    if (!hasTodaysPrices) {
      throw new Error(`Don't have today's prices to determine min and max for today! Available data range: ${this.minDate}-${this.maxDate}`);
    }

    return { minIndex: lowestIndex, maxIndex: highestIndex };
  }

  #readCachedPrices(rawSpotPriceData: SpotPriceRawData | null = null): boolean {
    try {
      if (rawSpotPriceData !== null) {
        this.#spotpricedata = rawSpotPriceData;
      } else if (fsSync.existsSync(this.#cachedFilePath)) {
        const data = fsSync.readFileSync(this.#cachedFilePath, 'utf8');
        this.#spotpricedata = JSON.parse(data) as SpotPriceRawData;
      }

      if (!this.#spotpricedata) return false;

      if (this.#spotpricedata.unit !== 'EUR / MWh') {
        throw new Error("Unit returned by spotprices.info has changes - no longer 'EUR / MWh'");
      }

      this.#unit = 'ct/kWh';

      const convertedPrices = this.#spotpricedata.price.map((p) => Math.round(p) / 10);
      const times = this.#spotpricedata.unix_seconds.map((d) => new Date(d * 1000));

      const defaultInterval = times.length > 1 ? times[1].getTime() - times[0].getTime() : 60 * 60 * 1000;

      this.#entries = times.map((t, i) => {
        const validFrom = t;
        const validTo = i + 1 < times.length ? times[i + 1] : new Date(t.getTime() + defaultInterval);
        return new SpotPriceEntry(convertedPrices[i], validFrom, validTo);
      });

      this.#prices = this.#entries.map((e) => e.price);
      this.#dates = this.#entries.map((e) => e.validFrom);

      this.#minDate = new Date(Math.min(...this.#dates.map((d) => d.getTime())));
      this.#maxDate = new Date(Math.max(...this.#dates.map((d) => d.getTime())));

      this.#updateTimestamp = this.#spotpricedata.updateTimestamp;
      return true;
    } catch (error) {
      console.error('Error reading saved spot prices:', error);
    }
    return false;
  }

  async #writeCachedPricesAsync(spotPriceData: SpotPriceRawData): Promise<void> {
    try {
      await fs.writeFile(this.#cachedFilePath, JSON.stringify(spotPriceData), { encoding: 'utf-8' });
    } catch (error) {
      console.error('Error saving spot prices:', error);
      throw error;
    }
  }
}
