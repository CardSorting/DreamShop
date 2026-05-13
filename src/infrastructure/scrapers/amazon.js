import { textFromSelectors, attributeValues, cleanImageUrl } from './utils.js';

export const amazonScraper = {
  name: "amazon",
  scrape: (root = document) => {
    const title = textFromSelectors(["#productTitle", "#title"], root);
    const price = textFromSelectors([".a-price .a-offscreen", "#priceblock_ourprice", "#priceblock_dealprice", ".a-color-price"], root);
    const brand = textFromSelectors(["#bylineInfo", "#brand", ".po-brand"], root);
    const sku = textFromSelectors(["#ASIN", ".prodDetSectionEntry"], root);
    const images = attributeValues(["#landingImage", "#main-image-container img", ".a-dynamic-image"], ["src", "data-old-hires", "data-a-dynamic-image"], root);
    
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
