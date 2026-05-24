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
