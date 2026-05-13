import { amazonScraper } from './amazon.js';
import { walmartScraper } from './walmart.js';
import { ebayScraper } from './ebay.js';
import { etsyScraper } from './etsy.js';
import { aliexpressScraper } from './aliexpress.js';
import { shopifyScraper } from './shopify.js';

export const scrapers = [
  amazonScraper,
  walmartScraper,
  ebayScraper,
  etsyScraper,
  aliexpressScraper,
  shopifyScraper
];

export function getScraperForHost(hostname) {
  if (hostname.includes("amazon")) return amazonScraper;
  if (hostname.includes("walmart")) return walmartScraper;
  if (hostname.includes("ebay")) return ebayScraper;
  if (hostname.includes("etsy")) return etsyScraper;
  if (hostname.includes("aliexpress")) return aliexpressScraper;
  if (document.querySelector('meta[content*="shopify"]')) return shopifyScraper;
  return null;
}
