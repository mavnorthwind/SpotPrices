import axios from 'axios';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { AxiosError } from 'axios';

const currentDirPath = __dirname;

import type { SpotPriceRawData } from './types/SpotPriceRawData';
import { SpotPriceTimeRange } from './types/SpotPriceTimeRange';
import { SpotPriceEntry } from './types/SpotPriceEntry';

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

/**
 * Class for fetching and querying energy spot prices
 * Events emitted:
 * - Updated (start, end)
 * - Warning (message)
 * - Error (message)
 */
export default class SpotPrices extends EventEmitter {
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
    super();

    const basePath = process.argv[1] ? path.dirname(process.argv[1]) : currentDirPath;
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
    const entries = this.#entries;
    if (!entries || entries.length === 0) {
      throw new Error('No price data available');
    }

    const extremaIndices = this.#getTodayHighLowIndex(entries);
    const entry = entries[extremaIndices.minIndex];
    if (!entry) {
      throw new Error('No minimum entry found for today');
    }

    return { price: entry.price, validFrom: entry.validFrom, validTo: entry.validTo };
  }

  get minTodayPrice(): number {
    return this.minToday.price;
  }

  get maxToday(): { price: number; validFrom: Date; validTo: Date } {
    const entries = this.#entries;
    if (!entries || entries.length === 0) {
      throw new Error('No price data available');
    }

    const extremaIndices = this.#getTodayHighLowIndex(entries);
    const entry = entries[extremaIndices.maxIndex];
    if (!entry) {
      throw new Error('No maximum entry found for today');
    }

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
    const entries = this.#entries;
    if (!entries || entries.length === 0) {
      throw new Error('Only future prices in dataset');
    }

    const nowIndex = this.#findIndexOfEntryEarlierOrEqual(entries);
    const entry = entries[nowIndex];
    if (nowIndex < 0 || !entry) {
      throw new Error('Only future prices in dataset');
    }

    return entry.price;
  }

  get currentPriceDate(): Date {
    const entries = this.#entries;
    if (!entries || entries.length === 0) {
      throw new Error('Only future prices in dataset');
    }

    const nowIndex = this.#findIndexOfEntryEarlierOrEqual(entries);
    const entry = entries[nowIndex];
    if (nowIndex < 0 || !entry) {
      throw new Error('Only future prices in dataset');
    }

    return entry.validFrom;
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

  async getSpotPricesAsync(startDate: Date, endDate: Date, options?: { timeout?: number, retries?: number }): Promise<SpotPriceRawData | null> {
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    const spotPricesUrl = `https://api.energy-charts.info/price?bzn=DE-LU&start=${start}&end=${end}`;

    const maxRetries = options?.retries ?? 3;
    var attempt = 0;

    var lastError: any = null;
    
    do {
      try {
        attempt++;
        
        console.debug('Getting spot price data');
        const res = await axios.get<SpotPriceRawData>(spotPricesUrl, { timeout: options?.timeout ?? 10000 });
        console.debug('Got spot price data');

        res.data.updateTimestamp = new Date();

        return res.data;
      } catch (lastError) {
        console.warn(`Request for spot prices from ${spotPricesUrl} failed:`, lastError);
        this.emit("Warning", lastError);

        if (lastError instanceof AxiosError &&
            lastError.response?.status === 429) { // Too Many Requests - backoff and retry
          
          const exp  = 1000 * 2 ** attempt;
          const full = exp + Math.random() * exp; // full jitter
          const backoffTime = Math.min(full, 30000); // Exponential backoff with jitter capped at 30 seconds
          console.warn(`Received 429 Too Many Requests. Backing off for ${backoffTime} ms before retrying...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    } while (attempt <= maxRetries);

    console.error(`Request for spot prices from ${spotPricesUrl} failed after ${maxRetries} attempts:`, lastError);
    this.emit("Error", lastError);

    return null;
  }

  async updateSpotPricesAsync(daysBack = 1, daysForward = 1): Promise<void> {
    const now = new Date();

    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - daysBack);
    
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    endDate.setDate(endDate.getDate() + daysForward);

    try {
      const data = await this.getSpotPricesAsync(startDate, endDate);

      if (data === null) {
        throw new Error('Failed to fetch spot prices');
      }

      await this.writeCachedPricesAsync(data);
      this.#readCachedPrices();
    } catch (error) {
      console.error(`Request for spot prices returned error:`, error);
      this.emit("Error", error);
      throw error;
    }
  }

  #findIndexOfEntryEarlierOrEqual(datesArray: Array<Date | SpotPriceEntry>, startingFrom = new Date()): number {
    return datesArray.reduce((bestIdx, item, idx) => {
      const date = item instanceof Date ? item : item.validFrom;
      const currentBest = datesArray[bestIdx];
      const currentBestDate = currentBest instanceof Date ? currentBest : currentBest?.validFrom;

      if (date < startingFrom && (bestIdx === -1 || (currentBestDate !== undefined && date > currentBestDate))) {
        return idx;
      }

      return bestIdx;
    }, -1);
  }

  #getTodayHighLowIndex(entries?: SpotPriceEntry[]): { minIndex: number; maxIndex: number } {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new TypeError('entries must be a non-empty array');
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
      if (!entry) continue;

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

      if (times.length === 0) {
        return false;
      }

      const firstTime = times[0];
      const secondTime = times[1];
      const defaultInterval = times.length > 1 && firstTime && secondTime ? secondTime.getTime() - firstTime.getTime() : 60 * 60 * 1000;

      this.#entries = times.map((t, i) => {
        const validFrom = t;
        const validTo = i + 1 < times.length ? times[i + 1] ?? new Date(t.getTime() + defaultInterval) : new Date(t.getTime() + defaultInterval);
        const price = convertedPrices[i];

        if (price === undefined || !validFrom || !validTo) {
          throw new Error(`Missing price or time value at index ${i}`);
        }

        return new SpotPriceEntry(price, validFrom, validTo);
      });

      this.#prices = this.#entries.map((e) => e.price);
      this.#dates = this.#entries.map((e) => e.validFrom);

      this.#minDate = new Date(Math.min(...this.#dates.map((d) => d.getTime())));
      this.#maxDate = new Date(Math.max(...this.#dates.map((d) => d.getTime())));

      this.#updateTimestamp = this.#spotpricedata.updateTimestamp;

      this.emit('Updated', { start: this.#minDate, end: this.#maxDate });

      return true;
    } catch (error) {
      console.error('Error reading saved spot prices:', error);
      this.emit('Error', error);
      return false;
    }
  }

  async writeCachedPricesAsync(spotPriceData: SpotPriceRawData, filename: string = this.#cachedFilePath): Promise<void> {
    try {
      await fs.writeFile(filename, JSON.stringify(spotPriceData, null, 2), { encoding: 'utf-8' });
    } catch (error) {
      console.error('Error saving spot prices:', error);
      this.emit("Error", error);
      throw error;
    }
  }
}
