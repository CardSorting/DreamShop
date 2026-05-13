import { textFromSelectors, attributeValues, cleanImageUrl } from './utils.js';

export const ebayScraper = {
  name: "ebay",
  scrape: (root = document) => {
    const title = textFromSelectors([".x-item-title__mainTitle", "h1.vi-title-main"], root);
    const price = textFromSelectors([".x-price-primary", "#prcIsum", ".bin-price-content", ".vi-price-main"], root);
    const images = attributeValues(["#icImg", ".x-photos img", ".itm-img"], ["src", "data-src"], root);
    return { 
      title, 
      price, 
      image_url: cleanImageUrl(images[0]), 
      extraction_method: "Expert-eBay" 
    };
  }
};
