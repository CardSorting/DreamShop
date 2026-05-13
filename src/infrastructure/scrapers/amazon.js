import { textFromSelectors, attributeValues, cleanImageUrl } from './utils.js';

export const amazonScraper = {
  name: "amazon",
  scrape: () => {
    const title = textFromSelectors(["#productTitle", "#title"]);
    const price = textFromSelectors([".a-price .a-offscreen", "#priceblock_ourprice", "#priceblock_dealprice", ".a-color-price"]);
    const brand = textFromSelectors(["#bylineInfo", "#brand", ".po-brand"]);
    const sku = textFromSelectors(["#ASIN", ".prodDetSectionEntry"]);
    const images = attributeValues(["#landingImage", "#main-image-container img", ".a-dynamic-image"], ["src", "data-old-hires", "data-a-dynamic-image"]);
    
    return { 
      title, 
      price, 
      brand, 
      sku, 
      image_url: cleanImageUrl(images[0]), 
      extraction_method: "Expert-Amazon" 
    };
  }
};
