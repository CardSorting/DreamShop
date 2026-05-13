import { 
  textFromSelectors, 
  attributeValues, 
  cleanImageUrl, 
  scrapeSpecifications, 
  parseWeightFromSpecs, 
  mergeProductData, 
  findStateInScripts,
  querySelectorAllDeep
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
      { name: "AliExpress_AER", regex: /(?:window\.)?__AER_(?:STATE|DATA)__\s*=\s*({)/ },
      { name: "AliExpress_RunParams", regex: /(?:window\.)?runParams\s*=\s*({)/ },
      { name: "AliExpress_PdpData", regex: /(?:window\.)?(?:_pdp_data_|_pdpData__|__pdpData__|__pdpData|DCData|_page_config_|__INIT_DATA__)\s*=\s*({)/ },
      { name: "AliExpress_InitialState", regex: /(?:window\.)?__INITIAL_STATE__\s*=\s*({)/ }
    ];

    const stateResult = findAliExpressState(patterns);
    const parsed = stateResult?.parsed;
    const d = collectAliExpressData(parsed);
    
    // Modern AliExpress components often reside in these keys
    const productInfo = d.productInfoComponent || d.actionModule || d.item || {};
    const priceComp = d.priceComponent || d.priceModule || d.inventoryComponent || d.webGeneralFreightCalculateComponent || {};
    const imageComp = d.imageComponent || d.imageModule || {};
    const sellerComp = d.sellerComponent || d.storeModule || {};
    const feedbackComp = d.feedbackComponent || d.commonModule || {};
    
    // 2. DOM Extraction (Fallbacks)
    const title = textFromSelectors([
      ".product-title-text", 
      "h1[data-pl=\"product-title\"]",
      "[data-pl=\"product-title\"]",
      ".pdp-info-right .product-title",
      ".title--wrap--UUHae_g h1",
      ".title--title--RN9Pt03",
      "h1.title",
      ".product-name",
      "meta[property=\"og:title\"]",
      "meta[name=\"twitter:title\"]",
      "h1"
    ]);
    
    const price = textFromSelectors([
      ".product-price-value", 
      ".price--currentPriceText--V8_y_b5",
      ".price--currentPriceText--",
      ".price--promotionPrice--S55vC",
      ".price--promotionPrice--",
      ".price--originalText--gxVO5_d",
      ".price--originalText--",
      ".product-price-current",
      ".uniform-banner-box-price", 
      "[data-pl=\"product-price\"]",
      "[class*=\"price--currentPriceText\"]",
      "[class*=\"price--promotionPrice\"]",
      "[class*=\"product-price\"]",
      "meta[property=\"product:price:amount\"]",
      "meta[property=\"og:price:amount\"]",
      "meta[itemprop=\"price\"]",
      ".pdp-info-right .product-price-value"
    ]);
    
    const images = attributeValues([
      "meta[property=\"og:image\"]",
      "meta[name=\"twitter:image\"]",
      ".mag-magnifier-container img", 
      ".product-main-img img", 
      ".image-view-magnifier-main-img",
      ".gallery--image--V8_y_b5",
      ".gallery--image--",
      "[class*=\"gallery--image\"] img",
      "[class*=\"image-view\"] img",
      "[class*=\"slider\"] img",
      ".slider-img img",
      "img[src*=\"alicdn.com\"]"
    ], ["content", "src", "srcset", "data-src", "data-lazy-src"]);

    const specs = scrapeSpecifications();
    const variants = extractVariants(d);
    const normalizedImages = uniqueValues([
      ...normalizeImageList(imageComp.imagePathList),
      ...normalizeImageList(imageComp.summImagePathList),
      ...normalizeImageList(imageComp.imagePath),
      ...normalizeImageList(imageComp.mainImage),
      ...images
    ].map(cleanImageUrl));
    
    function parseIdFromUrl() {
      const match = window.location.href.match(/(?:item\/|i\/|productId=)(\d+)/);
      return match ? match[1] : null;
    }

    // 3. Merged Intelligence
    return mergeProductData(
      {
        title: productInfo.subject || productInfo.title || title,
        price: extractPrice(priceComp) || price,
        currency: priceComp.currencyCode || priceComp.currency || d.currency || textFromSelectors(["meta[property=\"product:price:currency\"]", "meta[property=\"og:price:currency\"]"]) || "",
        image_url: normalizedImages[0] || "",
        additional_image_urls: normalizedImages,
        sku: productInfo.productId || productInfo.itemId || d.productId || d.itemId || d.id || parseIdFromUrl() || "",
        vendor: sellerComp.storeName || sellerComp.sellerName || sellerComp.companyName || textFromSelectors(["[class*=\"store-name\"]", "[data-pl=\"store-name\"]", ".store-info__name"]) || "",
        vendor_url: sellerComp.storeNum ? `https://www.aliexpress.com/store/${sellerComp.storeNum}` : (sellerComp.storeUrl || ""),
        specifications: specs,
        variant_matrix: variants,
        variant_grams: parseWeightFromSpecs(specs),
        rating: feedbackComp.starRating || feedbackComp.averageStar || feedbackComp.evarageStar || 0,
        review_count: feedbackComp.reviewCount || feedbackComp.totalValidNum || feedbackComp.totalNum || 0,
        sold_count: productInfo.tradeCount || productInfo.orders || d.tradeCount || 0,
        extraction_method: stateResult ? `Expert-AliExpress-${stateResult.name}` : "Expert-AliExpress-DOM"
      },
      {
        // Secondary defaults from the state object if any
        description: d.productDetailComponent?.description || d.description || textFromSelectors(["meta[name=\"description\"]", "meta[property=\"og:description\"]"]) || ""
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

function findAliExpressState(patterns) {
  const directState = findStateInScripts(patterns);
  if (directState) return directState;

  const jsonScriptSelectors = [
    "script[type=\"application/json\"]",
    "script#__AER_DATA__",
    "script#__NEXT_DATA__",
    "script[data-hypernova-key]"
  ];

  for (const script of querySelectorAllDeep(jsonScriptSelectors.join(","))) {
    const text = script.textContent?.trim();
    if (!text || !looksLikeAliExpressProductState(text)) continue;

    try {
      return {
        parsed: JSON.parse(text),
        name: script.id ? `AliExpress_${script.id}` : "AliExpress_JSON_Script"
      };
    } catch (_e) {}
  }

  return null;
}

function collectAliExpressData(root) {
  const merged = {};
  const seen = new WeakSet();
  const componentKeys = [
    "productInfoComponent",
    "actionModule",
    "item",
    "priceComponent",
    "priceModule",
    "inventoryComponent",
    "imageComponent",
    "imageModule",
    "sellerComponent",
    "storeModule",
    "feedbackComponent",
    "commonModule",
    "skuComponent",
    "skuModule",
    "productDetailComponent",
    "webGeneralFreightCalculateComponent"
  ];
  const scalarKeys = ["currency", "productId", "itemId", "id", "tradeCount", "description"];
  let visitedCount = 0;

  function visit(value, depth = 0) {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 30 || visitedCount > 10000) return;
    seen.add(value);
    visitedCount++;

    for (const key of componentKeys) {
      if (value[key] && typeof value[key] === "object" && !merged[key]) {
        merged[key] = value[key];
      }
    }

    for (const key of scalarKeys) {
      if (merged[key] === undefined && value[key] !== undefined) {
        merged[key] = value[key];
      }
    }

    if (value.data && typeof value.data === "object") visit(value.data, depth + 1);
    if (value.prefetch && typeof value.prefetch === "object") visit(value.prefetch, depth + 1);
    if (value.widgets && typeof value.widgets === "object") visit(value.widgets, depth + 1);

    for (const child of Object.values(value)) visit(child, depth + 1);
  }

  visit(root);
  return merged;
}

function extractPrice(priceComp) {
  const candidates = [
    priceComp.formatPrice,
    priceComp.formatedPrice,
    priceComp.formattedPrice,
    priceComp.minActivityAmount?.formatedAmount,
    priceComp.minActivityAmount?.formattedAmount,
    priceComp.maxActivityAmount?.formatedAmount,
    priceComp.maxActivityAmount?.formattedAmount,
    priceComp.discountPrice?.mformatPrice,
    priceComp.discountPrice?.formattedPrice,
    priceComp.origPrice?.formattedPrice,
    priceComp.origPrice?.formatedAmount,
    priceComp.price?.formattedPrice,
    priceComp.price?.formatedAmount,
    priceComp.price?.value
  ];

  return candidates.find((value) => value !== null && value !== undefined && String(value).trim() !== "") || "";
}

function normalizeImageList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeImageList);
  if (typeof value === "object") {
    return normalizeImageList(value.imgUrl || value.imageUrl || value.url || value.path || value.summImagePath || value.imagePath);
  }
  return [String(value)];
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function looksLikeAliExpressProductState(text) {
  return text.includes("productInfoComponent") ||
    text.includes("skuComponent") ||
    text.includes("priceComponent") ||
    text.includes("imageComponent");
}
