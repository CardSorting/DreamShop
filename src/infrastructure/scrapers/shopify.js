import { findStateInScripts } from './utils.js';

export const shopifyScraper = {
  name: "shopify",
  scrape: () => {
    const patterns = [{ name: "Shopify", regex: /Shopify\.product\s*=\s*({.*?});/s }];
    const state = findStateInScripts(patterns, "Shopify");
    
    if (state?.parsed) {
      return { ...state.parsed, extraction_method: "Expert-Shopify" };
    }
    
    const getMeta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute("content");
    if (getMeta("shopify-product-id")) {
       return {
         vendor: getMeta("shopify-seller-name") || getMeta("og:site_name"),
         category: getMeta("product:category") || getMeta("product_type"),
         extraction_method: "Expert-Shopify-Meta"
       };
    }
    return null;
  }
};
