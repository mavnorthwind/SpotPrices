/**
 * Raw spot price data structure returned from the API
 */
export type SpotPriceRawData = {
  unit: string;
  unix_seconds: number[];
  price: number[];
  updateTimestamp: string | Date;
  [key: string]: unknown;
};
