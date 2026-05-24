import axios from 'axios';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


class SpotPriceTimeRange {
    constructor(from, to, minPrice, maxPrice) {
        this.from = from;
        this.to = to;
        this.minPrice = minPrice;
        this.maxPrice = maxPrice;
    }

    toString() {
        const from = this.from.toISOString();
        const to = this.to.toISOString();
        return `SpotPriceTimeRange(minPrice=${this.minPrice}, maxPrice=${this.maxPrice}, from=${from}, to=${to})`;
    }
}

class SpotPriceEntry {
    constructor(price, validFrom, validTo) {
        this.price = price;
        this.validFrom = validFrom;
        this.validTo = validTo;
    }

    get durationMs() {
        return this.validTo.getTime() - this.validFrom.getTime();
    }

    get durationHours() {
        return this.durationMs / (1000 * 60 * 60);
    }

    toString() {
        const from = this.validFrom.toISOString();
        const to = this.validTo.toISOString();
        return `SpotPriceEntry(price=${this.price}, validFrom=${from}, validTo=${to}, durationHours=${this.durationHours.toFixed(2)})`;
    }
}

class SpotPrices {
    #cachedFilePath = undefined;

    #spotpricedata = undefined;
    #updateTimestamp = undefined;

    #prices = undefined;
    #dates = undefined;
    #entries = undefined; // combined { price, validFrom, validTo }
    #unit = undefined;

    #minDate = undefined;
    #maxDate = undefined;

    /**
     * Create a new SpotPrices instance
     * @param {object|null} [rawSpotPriceData] - Optional fixture data for tests.
     */
    constructor(rawSpotPriceData = null) {
        this.#cachedFilePath = path.join(
                    process.main ? path.dirname(process.main.filename) : __dirname,
                    'spotPricesCache.json');

        this.#readCachedPrices(rawSpotPriceData);
    }

    get hasData() { return !(this.#spotpricedata === undefined); }

    /**
     * Array of spot prices (Number)
     */
    get prices() { return this.#prices; }
    /**
     * Array of spot price dates (Date)
     */
    get dates() { return this.#dates; }
    /**
     * Array of entries with combined price/timespan
     * Each entry is a SpotPriceEntry instance.
     */
    get entries() { return this.#entries; }
    /**
     * Unit of spot prices (usually ct/kWh)
     */
    get unit() { return this.#unit; }

    /**
     * Timestamp when the spot prices were updated (Date)
     */
    get updateTimestamp() { return new Date(this.#updateTimestamp); }


    /**
     * Returns the first Date in the dataset
     */
    get minDate() { return this.#minDate; }
    /**
     * Returns the last Date in the dataset
     */
    get maxDate() { return this.#maxDate; }

    /**
     * Returns the minimum price for today
     */
    get minToday() {
        const extremaIndices = this.#getTodayHighLowIndex(this.#entries);
        const entry = this.#entries[extremaIndices.minIndex];
        return { price: entry.price, validFrom: entry.validFrom, validTo: entry.validTo };
    }
    get minTodayPrice() { return this.minToday.price; }
    /**
     * Returns the maximum price for today
     */
    get maxToday() {
        const extremaIndices = this.#getTodayHighLowIndex(this.#entries);
        const entry = this.#entries[extremaIndices.maxIndex];
        return { price: entry.price, validFrom: entry.validFrom, validTo: entry.validTo };
    }
    get maxTodayPrice() { return this.maxToday.price; }

    /**
     * Returns the DateTime of today's minimum price
     */
    get minTodayPriceDate() { return this.minToday.validFrom; }

    /**
     * Returns the DateTime of today's maximum price
     */
    get maxTodayPriceDate() {
        return this.maxToday.validFrom;
    }

    /**
     * Current spot price
     */
    get currentPrice() {
        const nowIndex = this.#findIndexOfEntryEarlierOrEqual(this.#entries);
        if (nowIndex < 0)
            throw new Error("Only future prices in dataset");
        return this.#entries[nowIndex].price;
    }
    /**
     * Date when the current price has been set. (Date)
     */
    get currentPriceDate() {
        const nowIndex = this.#findIndexOfEntryEarlierOrEqual(this.#entries);
        if (nowIndex < 0)
            throw new Error("Only future prices in dataset");
        return this.#entries[nowIndex].validFrom;
    }


    /**
     * Does the current dataset contain tomorrow's spot prices?
     */
    get hasTomorrowsPrices() {
        // No data → false
        if (!this.#dates || this.#dates.length === 0) return false;

        const now = new Date();

        // Start of tomorrow (00:00:00)
        const tomorrowStart = new Date(now);
        tomorrowStart.setHours(0, 0, 0, 0);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        return this.#maxDate >= tomorrowStart;
    }

    /**
     * Return the longest contiguous timespans where the price is below or equal to maxPrice.
     * Each span is returned as a SpotPriceTimeRange instance.
     * If no entries or none match, returns an empty array.
     *
     * @param {number} maxPrice
     * @returns {SpotPriceTimeRange[]}
     */
    getTimeRangeBelow(maxPrice) {
        if (typeof maxPrice !== 'number' || !Array.isArray(this.#entries) || this.#entries.length === 0) {
            return [];
        }

        const ranges = [];
        let current = null;

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

    /**
     * Fetch spot prices, save to cache and update internal variables
     * The range of data fetched goes back <daysBack> at 00:00:00 and
     * forward <daysForward> at 23:59:59
     * 
     * Throws error on failure
     * 
     * @param {number} daysBack
     * @param {number} daysForward 
     */
    async updateSpotPricesAsync(daysBack = 1, daysForward = 1) {
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
            const res = await axios.get(spotPricesUrl, { timeout: 30000 }); // Spot prices API can be slow
            console.debug(`Got spot price data`);

            res.data.updateTimestamp = now;

            await this.#writeCachedPricesAsync(res.data);

            this.#readCachedPrices();
        } catch(error) {
            console.error(`Request for spot prices from ${spotPricesUrl} returned error:`, error);
            throw error;
        }
    }

    /**
     * Find index of the entry with a timestamp closest and below the given date
     * Requires dates to be sorted
     * @param {Array} datesArray 
     * @param {Date} [startingFrom=new Date()] 
     * @returns Index or -1 if not found
     */
    #findIndexOfEntryEarlierOrEqual(datesArray, startingFrom = new Date()) {
        // Accept either an array of Dates or an array of entries
        // start with -1 to indicate “none found”
        return datesArray.reduce((bestIdx, item, idx) => {
            const date = item instanceof Date ? item : item.validFrom;
            if (date < startingFrom && (bestIdx === -1 || date > (datesArray[bestIdx] instanceof Date ? datesArray[bestIdx] : datesArray[bestIdx].validFrom))) {
                return idx;          // new best
            }
            return bestIdx;          // keep previous best
        }, -1);
    }

    /**
     * Get index of minimum and maximum value of today's prices
     * @param {Date[]} dates 
     * @param {Number[]} prices 
     * @returns {minIndex, maxIndex}
     */
    #getTodayHighLowIndex(entries) {
        if (!Array.isArray(entries)) {
            throw new TypeError('entries must be an array');
        }

        // heutiges Datum (lokal)
        const now = new Date();
        const today = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();

        let highestIndex = -1;
        let lowestIndex = -1;
        let highestPrice = -Infinity;
        let lowestPrice = Infinity;
        let hasTodaysPrices = false;

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const d = entry.validFrom;
            if (!(d instanceof Date) || isNaN(d)) {
                throw new Error(`Ungültiges Datum an Index ${i}`);
            }

            const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
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

        if (!hasTodaysPrices)
            throw new Error(`Don't have today's prices to determine min and max for today! Available data range: ${this.minDate}-${this.maxDate}`);

        return { minIndex: lowestIndex, maxIndex: highestIndex };
    }

    /**
     * Read cached spot prices.
     * @param {object|null} rawSpotPriceData - Optional fixture data for tests.
     * @returns true if cached prices were read, else false
     */
    #readCachedPrices(rawSpotPriceData = null) {
        try {
            if (rawSpotPriceData !== null) {
                this.#spotpricedata = rawSpotPriceData;
            } else if (fsSync.existsSync(this.#cachedFilePath)) {
                const data = fsSync.readFileSync(this.#cachedFilePath, 'utf8');
                this.#spotpricedata = JSON.parse(data);
            }

            if (!this.#spotpricedata) return false;

            if (this.#spotpricedata.unit != "EUR / MWh")
                throw "Unit returned by spotprices.info has changes - no longer 'EUR / MWh'";

            this.#unit = "ct/kWh";

            // Convert from EUR/MWh to ct/kWh and build combined entries
            const convertedPrices = this.#spotpricedata.price.map(p => Math.round(p) / 10);
            const times = this.#spotpricedata.unix_seconds.map(d => new Date(d * 1000));

            // Determine default interval (fallback to 1 hour)
            const defaultInterval = (times.length > 1) ? (times[1].getTime() - times[0].getTime()) : 60 * 60 * 1000;

            this.#entries = times.map((t, i) => {
                const validFrom = t;
                const validTo = (i + 1 < times.length) ? times[i + 1] : new Date(t.getTime() + defaultInterval);
                return new SpotPriceEntry(convertedPrices[i], validFrom, validTo);
            });

            // Keep backward-compatible arrays
            this.#prices = this.#entries.map(e => e.price);
            this.#dates = this.#entries.map(e => e.validFrom);

            this.#minDate = new Date(Math.min(...this.#dates.map(d => d.getTime())));
            this.#maxDate = new Date(Math.max(...this.#dates.map(d => d.getTime())));

            this.#updateTimestamp = this.#spotpricedata.updateTimestamp;
            return true;
        } catch (error) {
            console.error("Error reading saved spot prices:", error);
        }
        return false;
    }

    /**
     * Write spot prices to cache
     * @param {*} spotPriceData 
     */
    async #writeCachedPricesAsync(spotPriceData) {
        try {
            await fs.writeFile(this.#cachedFilePath, JSON.stringify(spotPriceData), { encoding: 'utf-8' });
        } catch (error) {
            console.error("Error saving spot prices:", error);
            throw error;
        }
    }
}

export default SpotPrices;