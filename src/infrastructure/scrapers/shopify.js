import { findStateInScripts, cleanImageUrl } from './utils.js';

export const shopifyScraper = {
  name: "shopify",
  scrape: (root = document) => {
    const patterns = [{ name: "Shopify", regex: /Shopify\.product\s*=\s*({.*?});/s }];
    const state = findStateInScripts(patterns, "Shopify");
    
    if (state?.parsed) {
      const p = state.parsed;
      const firstVariant = p.variants?.[0] || {};
      
      return {
        title: p.title,
        description: p.description,
        price: (p.price / 100).toFixed(2), // Shopify prices are in cents
        currency: window.Shopify?.currency?.active || "USD",
        vendor: p.vendor,
        category: p.type,
        sku: firstVariant.sku || String(p.id),
        image_url: cleanImageUrl(p.featured_image || p.images?.[0] || ""),
        additional_image_urls: (p.images || []).map(cleanImageUrl),
        variants: (p.variants || []).map(v => ({
          sku_id: v.id,
          title: v.title,
          price: (v.price / 100).toFixed(2),
          inventory: v.inventory_quantity,
          image: cleanImageUrl(v.featured_image?.src || "")
        })),
        extraction_method: "Expert-Shopify"
      };
    }
    
    const getMeta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute("content");
    if (getMeta("shopify-product-id") || document.querySelector('meta[content*="shopify"]')) {
       return {
         title: getMeta("og:title") || document.title,
         price: getMeta("product:price:amount") || getMeta("og:price:amount"),
         currency: getMeta("product:price:currency") || getMeta("og:price:currency") || "USD",
         vendor: getMeta("shopify-seller-name") || getMeta("og:site_name"),
         category: getMeta("product:category") || getMeta("product_type"),
         image_url: cleanImageUrl(getMeta("og:image") || ""),
         extraction_method: "Expert-Shopify-Meta"
       };
    }
    return null;
  }
};
