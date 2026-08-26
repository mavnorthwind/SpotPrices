"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _SpotPrices_instances, _SpotPrices_cachedFilePath, _SpotPrices_spotpricedata, _SpotPrices_updateTimestamp, _SpotPrices_prices, _SpotPrices_dates, _SpotPrices_entries, _SpotPrices_unit, _SpotPrices_minDate, _SpotPrices_maxDate, _SpotPrices_eventEmitter, _SpotPrices_findIndexOfEntryEarlierOrEqual, _SpotPrices_getTodayHighLowIndex, _SpotPrices_readCachedPrices, _SpotPrices_writeCachedPricesAsync;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpotPriceEntry = exports.SpotPriceTimeRange = void 0;
const axios_1 = __importDefault(require("axios"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const events_1 = __importDefault(require("events"));
const console_1 = __importDefault(require("console"));
const currentFilePath = (0, url_1.fileURLToPath)(import.meta.url);
const currentDirPath = path_1.default.dirname(currentFilePath);
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
exports.SpotPriceTimeRange = SpotPriceTimeRange;
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
exports.SpotPriceEntry = SpotPriceEntry;
/**
 * Class for fetching and querying energy spot prices
 * Events emitted:
 * - Updated (start, end)
 * - Warning (message)
 * - Error (message)
 */
class SpotPrices {
    constructor(rawSpotPriceData = null) {
        _SpotPrices_instances.add(this);
        _SpotPrices_cachedFilePath.set(this, void 0);
        _SpotPrices_spotpricedata.set(this, void 0);
        _SpotPrices_updateTimestamp.set(this, void 0);
        _SpotPrices_prices.set(this, void 0);
        _SpotPrices_dates.set(this, void 0);
        _SpotPrices_entries.set(this, void 0);
        _SpotPrices_unit.set(this, void 0);
        _SpotPrices_minDate.set(this, void 0);
        _SpotPrices_maxDate.set(this, void 0);
        _SpotPrices_eventEmitter.set(this, void 0);
        const basePath = process.argv[1] ? path_1.default.dirname(process.argv[1]) : currentDirPath;
        __classPrivateFieldSet(this, _SpotPrices_cachedFilePath, path_1.default.join(basePath, 'spotPricesCache.json'), "f");
        __classPrivateFieldGet(this, _SpotPrices_instances, "m", _SpotPrices_readCachedPrices).call(this, rawSpotPriceData);
        __classPrivateFieldSet(this, _SpotPrices_eventEmitter, new events_1.default(), "f");
    }
    get hasData() {
        return __classPrivateFieldGet(this, _SpotPrices_spotpricedata, "f") !== undefined;
    }
    get prices() {
        return __classPrivateFieldGet(this, _SpotPrices_prices, "f");
    }
    get dates() {
        return __classPrivateFieldGet(this, _SpotPrices_dates, "f");
    }
    get entries() {
        return __classPrivateFieldGet(this, _SpotPrices_entries, "f");
    }
    get unit() {
        return __classPrivateFieldGet(this, _SpotPrices_unit, "f");
    }
    get updateTimestamp() {
        return new Date(__classPrivateFieldGet(this, _SpotPrices_updateTimestamp, "f"));
    }
    get minDate() {
        return __classPrivateFieldGet(this, _SpotPrices_minDate, "f");
    }
    get maxDate() {
        return __classPrivateFieldGet(this, _SpotPrices_maxDate, "f");
    }
    get minToday() {
        const extremaIndices = __classPrivateFieldGet(this, _SpotPrices_instances, "m", _SpotPrices_getTodayHighLowIndex).call(this, __classPrivateFieldGet(this, _SpotPrices_entries, "f"));
        const entry = __classPrivateFieldGet(this, _SpotPrices_entries, "f")[extremaIndices.minIndex];
        return { price: entry.price, validFrom: entry.validFrom, validTo: entry.validTo };
    }
    get minTodayPrice() {
        return this.minToday.price;
    }
    get maxToday() {
        const extremaIndices = __classPrivateFieldGet(this, _SpotPrices_instances, "m", _SpotPrices_getTodayHighLowIndex).call(this, __classPrivateFieldGet(this, _SpotPrices_entries, "f"));
        const entry = __classPrivateFieldGet(this, _SpotPrices_entries, "f")[extremaIndices.maxIndex];
        return { price: entry.price, validFrom: entry.validFrom, validTo: entry.validTo };
    }
    get maxTodayPrice() {
        return this.maxToday.price;
    }
    get minTodayPriceDate() {
        return this.minToday.validFrom;
    }
    get maxTodayPriceDate() {
        return this.maxToday.validFrom;
    }
    get currentPrice() {
        if (!__classPrivateFieldGet(this, _SpotPrices_entries, "f")) {
            throw new Error('Only future prices in dataset');
        }
        const nowIndex = __classPrivateFieldGet(this, _SpotPrices_instances, "m", _SpotPrices_findIndexOfEntryEarlierOrEqual).call(this, __classPrivateFieldGet(this, _SpotPrices_entries, "f"));
        if (nowIndex < 0) {
            throw new Error('Only future prices in dataset');
        }
        return __classPrivateFieldGet(this, _SpotPrices_entries, "f")[nowIndex].price;
    }
    get currentPriceDate() {
        if (!__classPrivateFieldGet(this, _SpotPrices_entries, "f")) {
            throw new Error('Only future prices in dataset');
        }
        const nowIndex = __classPrivateFieldGet(this, _SpotPrices_instances, "m", _SpotPrices_findIndexOfEntryEarlierOrEqual).call(this, __classPrivateFieldGet(this, _SpotPrices_entries, "f"));
        if (nowIndex < 0) {
            throw new Error('Only future prices in dataset');
        }
        return __classPrivateFieldGet(this, _SpotPrices_entries, "f")[nowIndex].validFrom;
    }
    get hasTomorrowsPrices() {
        if (!__classPrivateFieldGet(this, _SpotPrices_dates, "f") || __classPrivateFieldGet(this, _SpotPrices_dates, "f").length === 0)
            return false;
        const now = new Date();
        const tomorrowStart = new Date(now);
        tomorrowStart.setHours(0, 0, 0, 0);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        return __classPrivateFieldGet(this, _SpotPrices_maxDate, "f") !== undefined && __classPrivateFieldGet(this, _SpotPrices_maxDate, "f") >= tomorrowStart;
    }
    getTimeRangeBelow(maxPrice) {
        if (typeof maxPrice !== 'number' || !Array.isArray(__classPrivateFieldGet(this, _SpotPrices_entries, "f")) || __classPrivateFieldGet(this, _SpotPrices_entries, "f").length === 0) {
            return [];
        }
        const ranges = [];
        let current = null;
        for (const entry of __classPrivateFieldGet(this, _SpotPrices_entries, "f")) {
            if (typeof entry.price !== 'number')
                continue;
            if (entry.price <= maxPrice) {
                if (!current) {
                    current = {
                        from: entry.validFrom,
                        to: entry.validTo,
                        prices: [entry.price]
                    };
                }
                else {
                    current.to = entry.validTo;
                    current.prices.push(entry.price);
                }
            }
            else if (current) {
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
            const res = await axios_1.default.get(spotPricesUrl, { timeout: 30000 });
            console_1.default.debug('Got spot price data');
            res.data.updateTimestamp = now;
            await __classPrivateFieldGet(this, _SpotPrices_instances, "m", _SpotPrices_writeCachedPricesAsync).call(this, res.data);
            __classPrivateFieldGet(this, _SpotPrices_instances, "m", _SpotPrices_readCachedPrices).call(this);
        }
        catch (error) {
            console_1.default.error(`Request for spot prices from ${spotPricesUrl} returned error:`, error);
            __classPrivateFieldGet(this, _SpotPrices_eventEmitter, "f").emit("Error", error);
            throw error;
        }
    }
}
_SpotPrices_cachedFilePath = new WeakMap(), _SpotPrices_spotpricedata = new WeakMap(), _SpotPrices_updateTimestamp = new WeakMap(), _SpotPrices_prices = new WeakMap(), _SpotPrices_dates = new WeakMap(), _SpotPrices_entries = new WeakMap(), _SpotPrices_unit = new WeakMap(), _SpotPrices_minDate = new WeakMap(), _SpotPrices_maxDate = new WeakMap(), _SpotPrices_eventEmitter = new WeakMap(), _SpotPrices_instances = new WeakSet(), _SpotPrices_findIndexOfEntryEarlierOrEqual = function _SpotPrices_findIndexOfEntryEarlierOrEqual(datesArray, startingFrom = new Date()) {
    return datesArray.reduce((bestIdx, item, idx) => {
        const date = item instanceof Date ? item : item.validFrom;
        if (date < startingFrom && (bestIdx === -1 || date > (datesArray[bestIdx] instanceof Date ? datesArray[bestIdx] : datesArray[bestIdx].validFrom))) {
            return idx;
        }
        return bestIdx;
    }, -1);
}, _SpotPrices_getTodayHighLowIndex = function _SpotPrices_getTodayHighLowIndex(entries) {
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
}, _SpotPrices_readCachedPrices = function _SpotPrices_readCachedPrices(rawSpotPriceData = null) {
    try {
        if (rawSpotPriceData !== null) {
            __classPrivateFieldSet(this, _SpotPrices_spotpricedata, rawSpotPriceData, "f");
        }
        else if (fs_1.default.existsSync(__classPrivateFieldGet(this, _SpotPrices_cachedFilePath, "f"))) {
            const data = fs_1.default.readFileSync(__classPrivateFieldGet(this, _SpotPrices_cachedFilePath, "f"), 'utf8');
            __classPrivateFieldSet(this, _SpotPrices_spotpricedata, JSON.parse(data), "f");
        }
        if (!__classPrivateFieldGet(this, _SpotPrices_spotpricedata, "f"))
            return false;
        if (__classPrivateFieldGet(this, _SpotPrices_spotpricedata, "f").unit !== 'EUR / MWh') {
            throw new Error("Unit returned by spotprices.info has changes - no longer 'EUR / MWh'");
        }
        __classPrivateFieldSet(this, _SpotPrices_unit, 'ct/kWh', "f");
        const convertedPrices = __classPrivateFieldGet(this, _SpotPrices_spotpricedata, "f").price.map((p) => Math.round(p) / 10);
        const times = __classPrivateFieldGet(this, _SpotPrices_spotpricedata, "f").unix_seconds.map((d) => new Date(d * 1000));
        const defaultInterval = times.length > 1 ? times[1].getTime() - times[0].getTime() : 60 * 60 * 1000;
        __classPrivateFieldSet(this, _SpotPrices_entries, times.map((t, i) => {
            const validFrom = t;
            const validTo = i + 1 < times.length ? times[i + 1] : new Date(t.getTime() + defaultInterval);
            return new SpotPriceEntry(convertedPrices[i], validFrom, validTo);
        }), "f");
        __classPrivateFieldSet(this, _SpotPrices_prices, __classPrivateFieldGet(this, _SpotPrices_entries, "f").map((e) => e.price), "f");
        __classPrivateFieldSet(this, _SpotPrices_dates, __classPrivateFieldGet(this, _SpotPrices_entries, "f").map((e) => e.validFrom), "f");
        __classPrivateFieldSet(this, _SpotPrices_minDate, new Date(Math.min(...__classPrivateFieldGet(this, _SpotPrices_dates, "f").map((d) => d.getTime()))), "f");
        __classPrivateFieldSet(this, _SpotPrices_maxDate, new Date(Math.max(...__classPrivateFieldGet(this, _SpotPrices_dates, "f").map((d) => d.getTime()))), "f");
        __classPrivateFieldSet(this, _SpotPrices_updateTimestamp, __classPrivateFieldGet(this, _SpotPrices_spotpricedata, "f").updateTimestamp, "f");
        __classPrivateFieldGet(this, _SpotPrices_eventEmitter, "f").emit("Updated", { start: __classPrivateFieldGet(this, _SpotPrices_minDate, "f"), end: __classPrivateFieldGet(this, _SpotPrices_maxDate, "f") });
        return true;
    }
    catch (error) {
        console_1.default.error('Error reading saved spot prices:', error);
        __classPrivateFieldGet(this, _SpotPrices_eventEmitter, "f").emit("Error", error);
        return false;
    }
}, _SpotPrices_writeCachedPricesAsync = async function _SpotPrices_writeCachedPricesAsync(spotPriceData) {
    try {
        await promises_1.default.writeFile(__classPrivateFieldGet(this, _SpotPrices_cachedFilePath, "f"), JSON.stringify(spotPriceData), { encoding: 'utf-8' });
    }
    catch (error) {
        console_1.default.error('Error saving spot prices:', error);
        __classPrivateFieldGet(this, _SpotPrices_eventEmitter, "f").emit("Error", error);
        throw error;
    }
};
exports.default = SpotPrices;
//# sourceMappingURL=SpotPrices.js.map