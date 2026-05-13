import { 
  textFromSelectors, 
  attributeValues, 
  cleanImageUrl, 
  scrapeSpecifications, 
  parseWeightFromSpecs, 
  mergeProductData, 
  findStateInScripts,
  firstObject
} from './utils.js';

/**
 * AliExpress Forensic Scraper
 * Handles modern Titan-Shell and AER-State architectures.
 */
export const aliexpressScraper = {
  name: "aliexpress",
  
  scrape: () => {
    // 1. Forensic State Discovery
    const patterns = [
      { name: "AliExpress_AER", regex: /__AER_STATE__\s*=\s*({)/ },
      { name: "AliExpress_RunParams", regex: /window\.runParams\s*=\s*({)/ },
      { name: "AliExpress_PdpData", regex: /(?:_pdp_data_|_pdpData__|__pdpData__|__pdpData|DCData|_page_config_|__INIT_DATA__)\s*=\s*({)/ },
      { name: "AliExpress_InitialState", regex: /window\.__INITIAL_STATE__\s*=\s*({)/ }
    ];

    const stateResult = findStateInScripts(patterns);
    const parsed = stateResult?.parsed;
    const d = parsed?.data || parsed?.prefetch?.data || parsed?.widgets || parsed || {};
    
    // Modern AliExpress components often reside in these keys
    const productInfo = d.productInfoComponent || d.actionModule || d.item || {};
    const priceComp = d.priceComponent || d.priceModule || d.inventoryComponent || {};
    const imageComp = d.imageComponent || d.imageModule || {};
    const sellerComp = d.sellerComponent || d.storeModule || {};
    const feedbackComp = d.feedbackComponent || d.commonModule || {};
    
    // 2. DOM Extraction (Fallbacks)
    const title = textFromSelectors([
      ".product-title-text", 
      "h1[data-pl=\"product-title\"]",
      ".pdp-info-right .product-title",
      "h1.title",
      ".product-name",
      "h1"
    ]);
    
    const price = textFromSelectors([
      ".product-price-value", 
      ".price--currentPriceText--V8_y_b5",
      ".price--promotionPrice--S55vC",
      ".product-price-current",
      ".uniform-banner-box-price", 
      "[data-pl=\"product-price\"]",
      ".pdp-info-right .product-price-value"
    ]);
    
    const images = attributeValues([
      ".mag-magnifier-container img", 
      ".product-main-img img", 
      ".image-view-magnifier-main-img",
      ".gallery--image--V8_y_b5",
      ".slider-img img"
    ], ["src", "srcset", "data-src"]);

    const specs = scrapeSpecifications();
    const variants = extractVariants(d);
    
    function parseIdFromUrl() {
      const match = window.location.href.match(/(?:item\/|i\/|productId=)(\d+)/);
      return match ? match[1] : null;
    }

    // 3. Merged Intelligence
    return mergeProductData(
      {
        title: productInfo.subject || productInfo.title || title,
        price: priceComp.formatPrice || priceComp.origPrice?.formattedPrice || priceComp.discountPrice?.mformatPrice || priceComp.formatedPrice || price,
        currency: priceComp.currencyCode || d.currency || "",
        image_url: cleanImageUrl(imageComp.imagePathList?.[0] || imageComp.summImagePathList?.[0] || imageComp.mainImage || images[0]),
        additional_image_urls: (imageComp.imagePathList || images).map(cleanImageUrl),
        sku: productInfo.productId || d.productId || d.id || parseIdFromUrl() || "",
        vendor: sellerComp.storeName || sellerComp.sellerName || "",
        vendor_url: sellerComp.storeNum ? `https://www.aliexpress.com/store/${sellerComp.storeNum}` : (sellerComp.storeUrl || ""),
        specifications: specs,
        variant_matrix: variants,
        variant_grams: parseWeightFromSpecs(specs),
        rating: feedbackComp.starRating || feedbackComp.averageStar || 0,
        review_count: feedbackComp.reviewCount || 0,
        sold_count: productInfo.tradeCount || d.tradeCount || 0,
        extraction_method: stateResult ? `Expert-AliExpress-${stateResult.name}` : "Expert-AliExpress-DOM"
      },
      {
        // Secondary defaults from the state object if any
        description: d.productDetailComponent?.description || d.description || ""
      }
    );
  }
};

function extractVariants(data) {
  const skuComp = data.skuComponent || data.skuModule || {};
  if (!skuComp.skuList) return [];
  
  const props = skuComp.productSKUPropertyList || [];
  const skus = skuComp.skuList || [];
  
  return skus.map(s => {
    const variant = {
      sku_id: s.skuId,
      sku_code: s.skuIdStr,
      price: s.skuVal?.skuActivityAmount?.value || s.skuVal?.skuAmount?.value,
      price_formatted: s.skuVal?.skuActivityAmount?.formatedAmount || s.skuVal?.skuAmount?.formatedAmount,
      currency: s.skuVal?.skuAmount?.currency || s.skuVal?.skuActivityAmount?.currency || "",
      inventory: s.skuVal?.availQuantity,
      image: cleanImageUrl(s.skuVal?.skuImage || "")
    };
    
    if (s.skuPropIds) {
      const propIds = s.skuPropIds.split(",");
      propIds.forEach((id, idx) => {
        for (const p of props) {
          const val = p.skuPropertyValues.find(v => v.propertyValueId == id);
          if (val) {
            variant[`option${idx + 1}`] = { name: p.skuPropertyName, value: val.propertyValueName };
            if (val.skuPropertyImageSummPath && !variant.image) variant.image = cleanImageUrl(val.skuPropertyImageSummPath);
          }
        }
      });
    }
    return variant;
  });
}
