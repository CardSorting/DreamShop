import { getScraperForHost } from './scrapers/index.js';
import { genericScraper } from './scrapers/generic.js';
import { 
  mergeProductData, 
  scrapeBreadcrumbs, 
  scrapeSpecifications, 
  scrapeWeight, 
  cleanImageUrl,
  querySelectorDeep,
  textFromSelectors,
  attributeValues
} from './scrapers/utils.js';

/**
 * DreamShop Content Product Scraper (Modular Edition)
 * 
 * NOTE: This function is intended to be bundled or injected with its dependencies.
 * If using chrome.scripting.executeScript, ensure all dependencies in ./scrapers/ are included.
 */
export function scrapeProductFromPage(targetSelector = null) {
  const root = targetSelector ? (document.querySelector(targetSelector) || document) : document;

  function scrapeDomProduct() {
    const title = textFromSelectors(["#productTitle", ".product-title", "h1.title", ".product-name h1", ".pdp-title", "h1"], root);
    const price = textFromSelectors([".price", ".product-price", ".current-price", "[itemprop=\"price\"]", ".pdp-price", ".price-wrapper"], root);
    const images = attributeValues(["meta[property=\"og:image\"]", "#landingImage", ".product-image img", "[data-testid=\"main-image\"] img"], ["content", "src", "data-src"], root);
    const uniqueImages = [...new Set(images.map(cleanImageUrl))].filter(Boolean);
    
    // Expert resolution
    const scraper = getScraperForHost(window.location.hostname);
    const expertData = scraper ? scraper.scrape() : {};

    return mergeProductData(
      expertData,
      {
        title, price, 
        image_url: uniqueImages[0] || "",
        additional_image_urls: uniqueImages.slice(1),
        category: scrapeBreadcrumbs(root),
        specifications: scrapeSpecifications(root),
        variant_grams: scrapeWeight(root),
        extraction_method: "Industrial-DOM-Heuristic"
      }
    );
  }

  const jsonLd = genericScraper.findJsonLdProducts();
  const microdata = genericScraper.findMicrodataProducts();
  const dom = scrapeDomProduct();

  let products = [];
  if (dom.extraction_method.startsWith("Expert")) products = [dom];
  else if (jsonLd.length > 0) products = jsonLd;
  else if (microdata.length > 0) products = microdata;
  else if (dom.title || dom.price) products = [dom];

  // Last-Resort Safeguard
  if (products.length === 0) {
    const title = querySelectorDeep("h1", root)?.textContent?.trim() || document.title.split("-")[0].split("|")[0].trim();
    if (title) {
      products = [{
        title,
        image_url: cleanImageUrl(querySelectorDeep("img", root)?.src || ""),
        extraction_method: "Last-Resort-Safeguard"
      }];
    }
  }

  return products.map(p => ({
    ...p,
    source_url: window.location.href,
    source_tab_title: document.title,
    source_site: window.location.hostname,
    scraped_at: new Date().toISOString()
  }));
}