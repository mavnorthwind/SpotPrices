import SpotPrices from './SpotPrices.js';

const spotPrices = new SpotPrices();

if (!spotPrices.hasData) {
    console.log('No cached spot price data found, fetching new data...');
    await spotPrices.updateSpotPricesAsync();
}

console.log(`Minimum price: ${spotPrices.minTodayPrice} at ${spotPrices.minTodayPriceDate}`);
