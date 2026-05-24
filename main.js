import SpotPrices from './SpotPrices.js';

const spotPrices = new SpotPrices();

if (!spotPrices.hasData) {
    console.log('No cached spot price data found, fetching new data...');
    await spotPrices.updateSpotPricesAsync();
}

console.log(`Minimum price: ${spotPrices.minTodayPrice} at ${spotPrices.minTodayPriceDate}`);
console.log(`Prices under 0 today: ${spotPrices.getTimeRangeBelow(0)}`);
console.log(`Prices under 10 today: ${spotPrices.getTimeRangeBelow(1)}`);

