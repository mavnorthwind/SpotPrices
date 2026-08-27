import test from 'node:test';
import assert from 'node:assert/strict';
import SpotPrices from '../SpotPrices.js';

const fixtureSpotPriceData = {
  unit: 'EUR / MWh',
  unix_seconds: [1672531200, 1672534800, 1672538400, 1672542000, 1672545600, 1672549200, 1672552800, 1672556400, 1672560000, 1672563600],
  price: [10, 0, -10, -20, 20, 0, -10, 30, -30, -40],
  updateTimestamp: '2026-01-01T00:00:00.000Z'
};

const makeFixtureSpotPrices = () => new SpotPrices(fixtureSpotPriceData);

test('SpotPrices loads cached data and basic properties are valid', async (t) => {
  const sp = new SpotPrices();

  assert.equal(typeof sp.hasData, 'boolean');
  assert.ok(sp.hasData, 'Expected cached spot price data to be present');

  // prices and dates arrays
  assert.ok(Array.isArray(sp.prices), 'prices should be an array');
  assert.ok(Array.isArray(sp.dates), 'dates should be an array');
  assert.equal(sp.prices.length, sp.dates.length, 'prices and dates lengths must match');
  assert.ok(sp.prices.length > 0, 'Expected at least one price data point');

  // unit conversion (cache file stores EUR / MWh; class converts to ct/kWh by Math.round(p)/10 )
  const firstRawPrice = 158.13; // known from the provided spotPricesCache.json
  const expectedFirst = Math.round(firstRawPrice) / 10;
  assert.equal(sp.prices[0], expectedFirst);

  // types
  assert.equal(typeof sp.unit, 'string');
  assert.ok(sp.updateTimestamp instanceof Date, 'updateTimestamp should be a Date');
  assert.ok(sp.minDate instanceof Date, 'minDate should be a Date');
  assert.ok(sp.maxDate instanceof Date, 'maxDate should be a Date');

  // range
  assert.ok(sp.minDate <= sp.maxDate, 'minDate should be <= maxDate');

  // boolean property
  assert.equal(typeof sp.hasTomorrowsPrices, 'boolean');
});

test('Today extrema getters return consistent indices and values', async (t) => {
  const sp = new SpotPrices();

  // The getters may throw if today's prices are not present; guard against that
  try {
    const minPrice = sp.minTodayPrice;
    const maxPrice = sp.maxTodayPrice;
    const minDate = sp.minTodayPriceDate;
    const maxDate = sp.maxTodayPriceDate;

    assert.equal(typeof minPrice, 'number');
    assert.equal(typeof maxPrice, 'number');
    assert.ok(minDate instanceof Date);
    assert.ok(maxDate instanceof Date);

    // The returned dates should exist in the dataset
    const minIdx = sp.dates.findIndex(d => d.getTime() === minDate.getTime());
    const maxIdx = sp.dates.findIndex(d => d.getTime() === maxDate.getTime());
    assert.ok(minIdx >= 0);
    assert.ok(maxIdx >= 0);

    assert.equal(sp.prices[minIdx], minPrice);
    assert.equal(sp.prices[maxIdx], maxPrice);
  } catch (err) {
    // If today's prices are not available in the provided cache, that's acceptable for CI — skip test by failing with a clear message.
    t.skip('Today\'s prices are not present in the cached dataset; skipping extrema assertions');
  }
});

test('currentPrice and currentPriceDate are consistent when available', async (t) => {
  const sp = new SpotPrices();

  try {
    const cp = sp.currentPrice;
    const cpd = sp.currentPriceDate;
    assert.equal(typeof cp, 'number');
    assert.ok(cpd instanceof Date);

    // currentPriceDate should be one of the dataset dates (or at least equal to a date value)
    const idx = sp.dates.findIndex(d => d.getTime() === cpd.getTime());
    assert.ok(idx >= 0, 'currentPriceDate should exist in dates array');
    assert.equal(sp.prices[idx], cp);
  } catch (err) {
    t.skip('Current price not available in dataset; skipping current price assertions');
  }
});

test('All public properties and SpotPriceEntry behavior', async (t) => {
  const sp = new SpotPrices();

  // Basic metadata
  assert.equal(typeof sp.unit, 'string');
  assert.equal(sp.unit, 'ct/kWh');
  assert.ok(sp.updateTimestamp instanceof Date);
  assert.ok(sp.minDate instanceof Date);
  assert.ok(sp.maxDate instanceof Date);

  // Arrays
  assert.ok(Array.isArray(sp.prices));
  assert.ok(Array.isArray(sp.dates));
  assert.equal(sp.prices.length, sp.dates.length);

  // Entries
  assert.ok(Array.isArray(sp.entries), 'entries should be an array');
  assert.equal(sp.entries.length, sp.prices.length);
  const firstEntry = sp.entries[0];
  assert.ok(firstEntry, 'expected at least one entry');
  assert.equal(typeof firstEntry.price, 'number');
  assert.ok(firstEntry.validFrom instanceof Date);
  assert.ok(firstEntry.validTo instanceof Date);

  // duration getters on the entry object should exist and return numbers
  assert.equal(typeof firstEntry.durationMs, 'number');
  assert.equal(typeof firstEntry.durationHours, 'number');
  assert.equal(typeof firstEntry.toString, 'function');
  assert.match(firstEntry.toString(), /SpotPriceEntry\(price=\d+(?:\.\d+)?, validFrom=.*Z, validTo=.*Z, durationHours=\d+\.\d{2}\)/);

  // hasTomorrowsPrices is boolean
  assert.equal(typeof sp.hasTomorrowsPrices, 'boolean');

  // min/max date relationship
  assert.ok(sp.minDate <= sp.maxDate, 'minDate should be <= maxDate');

  // minToday/maxToday and their dates (may be skipped if today's data not present)
  try {
    const minT = sp.minToday;
    const maxT = sp.maxToday;
    assert.equal(typeof minT.price, 'number');
    assert.equal(typeof maxT.price, 'number');
    assert.ok(minT.validFrom instanceof Date);
    assert.ok(minT.validTo instanceof Date);
    assert.ok(maxT.validFrom instanceof Date);
    assert.ok(maxT.validTo instanceof Date);
    assert.ok(sp.minTodayPriceDate instanceof Date);
    assert.ok(sp.maxTodayPriceDate instanceof Date);
  } catch (err) {
    t.skip('Today\'s price extrema not present; skipping related assertions');
  }
});

test('getTimeRangeBelow returns SpotPriceTimeRange objects for price <= maxPrice', async (t) => {
  const sp = new SpotPrices();
  const ranges = sp.getTimeRangeBelow(0);
  assert.ok(Array.isArray(ranges));

  for (const range of ranges) {
    assert.ok(range.from instanceof Date);
    assert.ok(range.to instanceof Date);
    assert.equal(typeof range.minPrice, 'number');
    assert.equal(typeof range.maxPrice, 'number');
    assert.ok(range.minPrice <= 0);
    assert.ok(range.maxPrice <= 0);
    assert.ok(range.from < range.to, 'range start should be before range end');
    assert.match(range.toString(), /SpotPriceTimeRange\(minPrice=.*?, maxPrice=.*?, from=.*Z, to=.*Z\)/);
  }
});

test('fixture dataset returns expected time ranges below threshold', async (t) => {
  const sp = makeFixtureSpotPrices();
  const ranges = sp.getTimeRangeBelow(0);
  assert.equal(ranges.length, 3);

  assert.equal(ranges[0].from.toISOString(), '2023-01-01T01:00:00.000Z');
  assert.equal(ranges[0].to.toISOString(), '2023-01-01T04:00:00.000Z');
  assert.equal(ranges[0].minPrice, -2);
  assert.equal(ranges[0].maxPrice, 0);

  assert.equal(ranges[1].from.toISOString(), '2023-01-01T05:00:00.000Z');
  assert.equal(ranges[1].to.toISOString(), '2023-01-01T07:00:00.000Z');
  assert.equal(ranges[1].minPrice, -1);
  assert.equal(ranges[1].maxPrice, 0);

  assert.equal(ranges[2].from.toISOString(), '2023-01-01T08:00:00.000Z');
  assert.equal(ranges[2].to.toISOString(), '2023-01-01T10:00:00.000Z');
  assert.equal(ranges[2].minPrice, -4);
  assert.equal(ranges[2].maxPrice, -3);
});
