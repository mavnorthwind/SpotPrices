let SpotPrices;
try {
  SpotPrices = require('./dist/src/SpotPrices.js').default;
} catch {
  SpotPrices = require('./dist/SpotPrices.js').default;
}

const spotPrices = new SpotPrices();

(async () => {
/*
  if (!spotPrices.hasData) {
    console.log('No cached spot price data found, fetching new data...');
    await spotPrices.updateSpotPricesAsync();
  }

  console.log(`Minimum price: ${spotPrices.minTodayPrice} at ${spotPrices.minTodayPriceDate}`);
  console.log(`Prices under 0 today: ${spotPrices.getTimeRangeBelow(0)}`);
  console.log(`Prices under 10 today: ${spotPrices.getTimeRangeBelow(1)}`);
*/

  spotPrices.on("Error", (error) => {
    console.error(`Error event received:`, error);
  });
  spotPrices.on("Warning", (warning) => {
    console.warn(`Warning event received:`, warning);
  });
  spotPrices.on("Updated", () => {
    console.log(`Spot prices updated at ${new Date()}`);
  });

/*
  for (var i = 27; i > 0; i--) {
    var startDate = new Date("2026-08-"+(i<10?"0":"")+i);
    var endDate = new Date("2026-08-"+(i<10?"0":"")+i+"T23:59:59.999Z");
    const prices = await spotPrices.getSpotPricesAsync(startDate, endDate, options={timeout: 10000, maxRetries: 5});
    if (prices) {
      await spotPrices.writeCachedPricesAsync(prices, "data/" + startDate.toISOString().slice(0,10) + ".json");
    }
  }
*/


})();

