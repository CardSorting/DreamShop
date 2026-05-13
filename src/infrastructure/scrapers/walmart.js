import { textFromSelectors, attributeValues, cleanImageUrl, mergeProductData, firstObject } from './utils.js';

export const walmartScraper = {
  name: "walmart",
  scrape: (root = document) => {
    const title = textFromSelectors(["h1[itemprop=\"name\"]", "h1.f3", ".product-title"], root);
    const price = textFromSelectors(["[data-testid=\"item-price\"]", ".price-characteristic", ".f2"], root);
    const brand = textFromSelectors([".brand-name", "a[itemprop=\"brand\"]"], root);
    const images = attributeValues(["[data-testid=\"main-image\"] img", ".db_main-image", ".prod-HeroImage", ".bh-main-image"], ["src", "srcset", "data-src"], root);
    
    // Walmart often uses __NEXT_DATA__
    const nextDataScript = root.querySelector('script#__NEXT_DATA__') || document.querySelector('script#__NEXT_DATA__');
    let nextData = {};
    if (nextDataScript) {
      try {
        nextData = JSON.parse(nextDataScript.textContent);
      } catch (e) {}
    }

    return mergeProductData(
      { 
        title, 
        price, 
        brand, 
        image_url: cleanImageUrl(images[0]), 
        extraction_method: "Expert-Walmart" 
      }, 
      firstObject(nextData?.props?.pageProps?.initialData?.product || {})
    );
  }
};
