import { textFromSelectors, attributeValues, cleanImageUrl } from './utils.js';

export const etsyScraper = {
  name: "etsy",
  scrape: () => {
    const title = textFromSelectors([".wt-text-title-03", "h1", "[data-buy-box-listing-title]"]);
    const price = textFromSelectors([".wt-text-title-03 .currency-value", ".wt-display-flex-xs .wt-text-title-03", "[data-buy-box-price]"]);
    const images = attributeValues([".wt-max-width-full", ".image-carousel img", "[data-listing-image-gallery] img"], ["src", "data-src", "data-full-image-href"]);
    return { 
      title, 
      price, 
      image_url: cleanImageUrl(images[0]), 
      extraction_method: "Expert-Etsy" 
    };
  }
};
