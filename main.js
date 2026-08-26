let SpotPrices;
try {
  SpotPrices = require('./dist/src/SpotPrices.js').default;
} catch {
  SpotPrices = require('./dist/SpotPrices.js').default;
}

const spotPrices = new SpotPrices();

(async () => {
  if (!spotPrices.hasData) {
    console.log('No cached spot price data found, fetching new data...');
    await spotPrices.updateSpotPricesAsync();
  }

  console.log(`Minimum price: ${spotPrices.minTodayPrice} at ${spotPrices.minTodayPriceDate}`);
  console.log(`Prices under 0 today: ${spotPrices.getTimeRangeBelow(0)}`);
  console.log(`Prices under 10 today: ${spotPrices.getTimeRangeBelow(1)}`);
})();

