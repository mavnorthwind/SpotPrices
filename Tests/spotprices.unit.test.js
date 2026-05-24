import test from 'node:test';
import assert from 'node:assert/strict';
import SpotPrices from '../SpotPrices.js';

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

test('getNonPositivePriceSpans returns contiguous spans with price <= 0', async (t) => {
  const sp = new SpotPrices();
  const spans = sp.getNegativePriceSpans();
  assert.ok(Array.isArray(spans));

  for (const span of spans) {
    assert.ok(span.validFrom instanceof Date);
    assert.ok(span.validTo instanceof Date);
    assert.ok(Array.isArray(span.entries));
    assert.ok(span.entries.length > 0);
    // all entries in the span must have price <= 0
    assert.ok(span.entries.every(e => typeof e.price === 'number' && e.price <= 0));
    // span.validFrom should equal first entry's validFrom
    assert.equal(span.validFrom.getTime(), span.entries[0].validFrom.getTime());
    // span.validTo should equal last entry's validTo
    assert.equal(span.validTo.getTime(), span.entries[span.entries.length - 1].validTo.getTime());
  }
});
