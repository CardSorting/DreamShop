/**
 * DreamShop Content Product Scraper (Monolithic Edition)
 * 
 * This file is self-contained and avoids all external imports to prevent 
 * execution failures in injected content script environments.
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
    let expertData = {};
    try {
      expertData = scraper ? (scraper.scrape(root) || {}) : {};
    } catch (e) {
      console.error("Expert scraper failed:", e);
    }

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
  if (dom.extraction_method && dom.extraction_method.startsWith("Expert")) products = [dom];
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

// --- Scraper Registry ---

function getScraperForHost(hostname) {
  if (hostname.includes("amazon")) return amazonScraper;
  if (hostname.includes("walmart")) return walmartScraper;
  if (hostname.includes("ebay")) return ebayScraper;
  if (hostname.includes("etsy")) return etsyScraper;
  if (hostname.includes("aliexpress")) return aliexpressScraper;
  if (document.querySelector('meta[content*="shopify"]')) return shopifyScraper;
  return null;
}

// --- Site-Specific Handlers ---

const amazonScraper = {
  name: "amazon",
  scrape: (root = document) => {
    const title = textFromSelectors(["#productTitle", "#title"], root);
    const price = textFromSelectors([".a-price .a-offscreen", "#priceblock_ourprice", "#priceblock_dealprice", ".a-color-price"], root);
    const brand = textFromSelectors(["#bylineInfo", "#brand", ".po-brand"], root);
    const sku = textFromSelectors(["#ASIN", ".prodDetSectionEntry"], root);
    const images = attributeValues(["#landingImage", "#main-image-container img", ".a-dynamic-image"], ["src", "data-old-hires", "data-a-dynamic-image"], root);
    
    return { 
      title, price, brand, sku, 
      image_url: cleanImageUrl(images[0]), 
      extraction_method: "Expert-Amazon" 
    };
  }
};

const walmartScraper = {
  name: "walmart",
  scrape: (root = document) => {
    const title = textFromSelectors(["h1[itemprop=\"name\"]", "h1.f3", ".product-title"], root);
    const price = textFromSelectors(["[data-testid=\"item-price\"]", ".price-characteristic", ".f2"], root);
    const brand = textFromSelectors([".brand-name", "a[itemprop=\"brand\"]"], root);
    const images = attributeValues(["[data-testid=\"main-image\"] img", ".db_main-image", ".prod-HeroImage", ".bh-main-image"], ["src", "srcset", "data-src"], root);
    const nextDataScript = root.querySelector('script#__NEXT_DATA__') || document.querySelector('script#__NEXT_DATA__');
    let nextData = {};
    if (nextDataScript) { try { nextData = JSON.parse(nextDataScript.textContent); } catch (e) {} }

    return mergeProductData(
      { title, price, brand, image_url: cleanImageUrl(images[0]), extraction_method: "Expert-Walmart" }, 
      firstObject(nextData?.props?.pageProps?.initialData?.product || {})
    );
  }
};

const ebayScraper = {
  name: "ebay",
  scrape: (root = document) => {
    const title = textFromSelectors([".x-item-title__mainTitle", "h1.vi-title-main"], root);
    const price = textFromSelectors([".x-price-primary", "#prcIsum", ".bin-price-content", ".vi-price-main"], root);
    const images = attributeValues(["#icImg", ".x-photos img", ".itm-img"], ["src", "data-src"], root);
    return { title, price, image_url: cleanImageUrl(images[0]), extraction_method: "Expert-eBay" };
  }
};

const etsyScraper = {
  name: "etsy",
  scrape: (root = document) => {
    const title = textFromSelectors([".wt-text-title-03", "h1", "[data-buy-box-listing-title]"], root);
    const price = textFromSelectors([".wt-text-title-03 .currency-value", ".wt-display-flex-xs .wt-text-title-03", "[data-buy-box-price]"], root);
    const images = attributeValues([".wt-max-width-full", ".image-carousel img", "[data-listing-image-gallery] img"], ["src", "data-src", "data-full-image-href"], root);
    return { title, price, image_url: cleanImageUrl(images[0]), extraction_method: "Expert-Etsy" };
  }
};

const shopifyScraper = {
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
        price: (p.price / 100).toFixed(2),
        currency: window.Shopify?.currency?.active || "USD",
        vendor: p.vendor,
        category: p.type,
        sku: firstVariant.sku || String(p.id),
        image_url: cleanImageUrl(p.featured_image || p.images?.[0] || ""),
        additional_image_urls: (p.images || []).map(cleanImageUrl),
        variants: (p.variants || []).map(v => ({
          sku_id: v.id, title: v.title, price: (v.price / 100).toFixed(2),
          inventory: v.inventory_quantity, image: cleanImageUrl(v.featured_image?.src || "")
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

const aliexpressScraper = {
  name: "aliexpress",
  scrape: (root = document) => {
    const patterns = [
      { name: "AliExpress_AER", regex: /(?:window\.)?__AER_(?:STATE|DATA)__\s*=\s*({)/ },
      { name: "AliExpress_RunParams", regex: /(?:window\.)?runParams\s*=\s*({)/ },
      { name: "AliExpress_PdpData", regex: /(?:window\.)?(?:_pdp_data_|_pdpData__|__pdpData__|__pdpData|DCData|_page_config_|__INIT_DATA__)\s*=\s*({)/ },
      { name: "AliExpress_InitialState", regex: /(?:window\.)?__INITIAL_STATE__\s*=\s*({)/ }
    ];
    const stateResult = findAliExpressState(patterns);
    const d = collectAliExpressData(stateResult?.parsed);
    const productInfo = d.productInfoComponent || d.actionModule || d.item || {};
    const priceComp = d.priceComponent || d.priceModule || d.inventoryComponent || d.webGeneralFreightCalculateComponent || {};
    const imageComp = d.imageComponent || d.imageModule || {};
    const sellerComp = d.sellerComponent || d.storeModule || {};
    const feedbackComp = d.feedbackComponent || d.commonModule || {};
    
    const title = textFromSelectors([".product-title-text", "h1[data-pl=\"product-title\"]", ".pdp-info-right .product-title", "h1"], root);
    const price = textFromSelectors([".product-price-value", "[class*=\"price--currentPriceText\"]", "meta[property=\"og:price:amount\"]"], root);
    const images = attributeValues(["meta[property=\"og:image\"]", ".mag-magnifier-container img", ".product-main-img img", "img[src*=\"alicdn.com\"]"], ["content", "src", "data-src"], root);
    const specs = scrapeSpecifications(root);
    const variants = extractAliExpressVariants(d);
    const normalizedImages = uniqueValues([...normalizeAliExpressImageList(imageComp.imagePathList), ...normalizeAliExpressImageList(imageComp.mainImage), ...images].map(cleanImageUrl));
    
    const parseIdFromUrl = () => (window.location.href.match(/(?:item\/|i\/|productId=)(\d+)/) || [])[1] || null;

    return mergeProductData({
      title: productInfo.subject || productInfo.title || title,
      price: extractAliExpressPrice(priceComp) || price,
      currency: priceComp.currencyCode || d.currency || textFromSelectors(["meta[property=\"og:price:currency\"]"], root) || "",
      image_url: normalizedImages[0] || "",
      additional_image_urls: normalizedImages,
      sku: productInfo.productId || d.productId || parseIdFromUrl() || "",
      vendor: sellerComp.storeName || textFromSelectors([".store-info__name"], root) || "",
      specifications: specs,
      variants: variants,
      variant_grams: parseWeightFromSpecs(specs),
      extraction_method: stateResult ? `Expert-AliExpress-${stateResult.name}` : "Expert-AliExpress-DOM"
    }, { description: d.productDetailComponent?.description || d.description || "" });
  }
};

const genericScraper = {
  findJsonLdProducts: () => {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    return scripts.flatMap(s => { try { const p = JSON.parse(s.textContent || ""); return Array.isArray(p) ? p : [p]; } catch (e) { return []; } })
      .flatMap(expandJsonLdNode).filter(n => normalizeType(n["@type"]).includes("product") || n.offers)
      .map(p => ({ ...normalizeJsonLdProduct(p), extraction_method: "JSON-LD" }));
  },
  findMicrodataProducts: () => {
    const products = [];
    document.querySelectorAll('[itemscope][itemtype*="Product"]').forEach(item => {
      const getProp = (p) => item.querySelector(`[itemprop="${p}"]`)?.getAttribute("content") || item.querySelector(`[itemprop="${p}"]`)?.textContent?.trim();
      products.push({
        title: getProp("name"), description: getProp("description"), price: getProp("price"),
        currency: getProp("priceCurrency"), brand: getProp("brand"), sku: getProp("sku") || getProp("productID"),
        image_url: cleanImageUrl(getProp("image")), extraction_method: "Microdata"
      });
    });
    return products.filter(p => p.title || p.price);
  }
};

// --- Utilities ---

function textFromSelectors(selectors, root = document) {
  for (const s of selectors) {
    const el = querySelectorDeep(s, root);
    const txt = el?.getAttribute("content") || el?.textContent || "";
    if (txt.trim()) return txt.trim();
  }
  return "";
}

function attributeValues(selectors, attrs, root = document) {
  const attrList = Array.isArray(attrs) ? attrs : [attrs];
  return selectors.flatMap(s => querySelectorAllDeep(s, root).map(el => {
    for (const a of attrList) {
      const v = el.getAttribute(a);
      if (v) return (a === "srcset") ? v.split(",").pop().trim().split(" ")[0] : v;
    }
    return null;
  }).filter(Boolean));
}

function cleanImageUrl(url) {
  if (!url) return "";
  try {
    let clean = url.startsWith("//") ? window.location.protocol + url : url;
    clean = clean.replace(/(\.(?:jpg|jpeg|png|webp))_[\s\S]*$/i, "$1");
    clean = clean.replace(/(_(?:\d+x\d+|Q\d+|thumb|small|AC_SS\d+|AC_UY\d+|SL\d+|SR\d+,\d+)+)(\.[a-z]+)$/i, "$2").replace(/(\?|&)v=\d+/, "");
    const u = new URL(clean, window.location.href);
    ["v", "width", "height", "quality", "size", "resize", "impolicy", "imwidth"].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch (_e) { return url; }
}

function querySelectorAllDeep(s, r = document) {
  const elements = [...r.querySelectorAll(s)];
  const roots = [...r.querySelectorAll("*")].map(el => el.shadowRoot).filter(Boolean);
  for (const sr of roots) elements.push(...querySelectorAllDeep(s, sr));
  return elements;
}

function querySelectorDeep(s, r = document) {
  const el = r.querySelector(s);
  if (el) return el;
  const roots = [...r.querySelectorAll("*")].map(el => el.shadowRoot).filter(Boolean);
  for (const sr of roots) { const target = querySelectorDeep(s, sr); if (target) return target; }
  return null;
}

function mergeProductData(...products) {
  const merged = {};
  for (const p of products.reverse()) {
    for (const [k, v] of Object.entries(p || {})) if (hasMeaningfulValue(v)) merged[k] = v;
  }
  return merged;
}

function hasMeaningfulValue(v) { 
  return Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && String(v).trim() !== ""); 
}

function normalizeArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
function normalizeType(t) { return normalizeArray(t).join(" ").toLowerCase(); }
function firstObject(v) { const item = normalizeArray(v)[0]; return (item && typeof item === "object") ? item : {}; }

function extractObjectFromJs(content, startIdx) {
  if (startIdx === undefined || startIdx === -1 || !content) return null;
  const jsonStart = content.indexOf("{", startIdx);
  if (jsonStart === -1) return null;
  let depth = 0, inString = false, stringChar = null, escape = false;
  for (let i = jsonStart; i < content.length; i++) {
    const char = content[i];
    if (!escape) {
      if ((char === "\"" || char === "'" || char === "`") && !inString) { inString = true; stringChar = char; }
      else if (char === stringChar && inString) { inString = false; stringChar = null; }
    }
    if (!inString) {
      if (char === "{") depth++;
      else if (char === "}") { depth--; if (depth === 0) return content.substring(jsonStart, i + 1); }
    }
    escape = (char === "\\" && !escape);
  }
  return null;
}

function scrapeBreadcrumbs(root = document) {
  const selectors = [".breadcrumb", ".breadcrumbs", ".nav-breadcrumb", ".pdp-breadcrumbs", ".wt-action-group", ".bread-crumb"];
  for (const s of selectors) {
    const el = querySelectorDeep(s, root);
    if (el) {
      const items = [...el.querySelectorAll("li, a, span")].map(i => {
        const t = i.textContent?.trim() || "";
        return (t.length > 1 && !["/", ">", "|", "»", "\\"].includes(t)) ? t : null;
      }).filter(Boolean);
      if (items.length > 0) return items.filter((item, idx) => item !== items[idx - 1]).join(" > ");
    }
  }
  return "";
}

function scrapeSpecifications(root = document) {
  const specs = {};
  const selectors = [".product-prop", ".specification--prop--V8_y_b5", ".pdp-specs-item", ".ux-layout-section--specification .ux-labels-values", ".product-specs li"];
  selectors.forEach(s => {
    querySelectorAllDeep(s, root).forEach(el => {
      const title = el.querySelector(".property-title, .specification--title--V8_y_b5, .label, .ux-labels-values__labels, .title")?.textContent?.trim();
      const desc = el.querySelector(".property-desc, .specification--desc--V8_y_b5, .value, .ux-labels-values__values, .content")?.textContent?.trim();
      if (title && desc) specs[title.replace(/:$/, "")] = desc;
    });
  });
  return specs;
}

function parseWeightFromSpecs(specs) {
  for (const [k, v] of Object.entries(specs)) {
    if (k.toLowerCase().includes("weight")) {
      const match = v.match(/(\d+(?:\.\d+)?)\s*(kg|g|lb|oz)/i);
      if (match) {
        const val = parseFloat(match[1]), unit = match[2].toLowerCase();
        if (unit.startsWith("kg")) return Math.round(val * 1000);
        if (unit.startsWith("lb")) return Math.round(val * 453.59);
        if (unit.startsWith("oz")) return Math.round(val * 28.35);
        return Math.round(val);
      }
    }
  }
  return null;
}

function findStateInScripts(patterns, targetName = null) {
  const scripts = [...document.querySelectorAll("script:not([src])")];
  for (const script of scripts) {
    const content = script.textContent;
    if (!content) continue;
    for (const pattern of patterns) {
      if (targetName && pattern.name !== targetName) continue;
      const match = content.match(pattern.regex);
      if (match) {
        const jsonStr = extractObjectFromJs(content, match.index);
        if (jsonStr) {
          try { return { parsed: JSON.parse(jsonStr), name: pattern.name }; }
          catch (e) {
            try {
              const fixed = jsonStr.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":').replace(/,\s*([}\]])/g, '$1');
              return { parsed: JSON.parse(fixed), name: pattern.name };
            } catch (e2) {}
          }
        }
      }
    }
  }
  return null;
}

function scrapeWeight(root = document) {
  const text = root.textContent || "";
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|lb|oz|g|grams|ounces|pounds)/i);
  if (match) {
    const val = parseFloat(match[1]), unit = match[2].toLowerCase();
    if (unit.startsWith("kg")) return Math.round(val * 1000);
    if (unit.startsWith("lb")) return Math.round(val * 453.59);
    if (unit.startsWith("oz")) return Math.round(val * 28.35);
    return Math.round(val);
  }
  return 0;
}

// --- AliExpress Specific Helpers ---

function extractAliExpressVariants(data) {
  const skuComp = data.skuComponent || data.skuModule || {};
  if (!skuComp.skuList) return [];
  const props = skuComp.productSKUPropertyList || [];
  return (skuComp.skuList || []).map(s => {
    const variant = {
      sku_id: s.skuId, sku_code: s.skuIdStr,
      price: s.skuVal?.skuActivityAmount?.value || s.skuVal?.skuAmount?.value,
      inventory: s.skuVal?.availQuantity, image: cleanImageUrl(s.skuVal?.skuImage || "")
    };
    if (s.skuPropIds) {
      s.skuPropIds.split(",").forEach((id, idx) => {
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
  const jsonScriptSelectors = ["script[type=\"application/json\"]", "script#__AER_DATA__", "script#__NEXT_DATA__"];
  for (const script of querySelectorAllDeep(jsonScriptSelectors.join(","))) {
    const text = script.textContent?.trim();
    if (!text || !looksLikeAliExpressProductState(text)) continue;
    try { return { parsed: JSON.parse(text), name: script.id ? `AliExpress_${script.id}` : "AliExpress_JSON_Script" }; } catch (_e) {}
  }
  return null;
}

function collectAliExpressData(root) {
  const merged = {};
  const seen = new WeakSet();
  const componentKeys = ["productInfoComponent", "actionModule", "item", "priceComponent", "priceModule", "inventoryComponent", "imageComponent", "imageModule", "sellerComponent", "storeModule", "feedbackComponent", "commonModule", "skuComponent", "skuModule", "productDetailComponent"];
  const scalarKeys = ["currency", "productId", "itemId", "id", "tradeCount", "description"];
  let visitedCount = 0;
  function visit(value, depth = 0) {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 30 || visitedCount > 10000) return;
    seen.add(value); visitedCount++;
    for (const key of componentKeys) if (value[key] && typeof value[key] === "object" && !merged[key]) merged[key] = value[key];
    for (const key of scalarKeys) if (merged[key] === undefined && value[key] !== undefined) merged[key] = value[key];
    if (value.data) visit(value.data, depth + 1);
    if (value.prefetch) visit(value.prefetch, depth + 1);
    for (const child of Object.values(value)) visit(child, depth + 1);
  }
  visit(root);
  return merged;
}

function extractAliExpressPrice(priceComp) {
  const candidates = [priceComp.formatPrice, priceComp.formatedPrice, priceComp.formattedPrice, priceComp.minActivityAmount?.formatedAmount, priceComp.maxActivityAmount?.formatedAmount, priceComp.price?.formattedPrice, priceComp.price?.value];
  return candidates.find((value) => value !== null && value !== undefined && String(value).trim() !== "") || "";
}

function normalizeAliExpressImageList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeAliExpressImageList);
  if (typeof value === "object") return normalizeAliExpressImageList(value.imgUrl || value.imageUrl || value.url || value.path);
  return [String(value)];
}

function uniqueValues(values) { return [...new Set(values.filter(Boolean))]; }
function looksLikeAliExpressProductState(text) { return text.includes("productInfoComponent") || text.includes("skuComponent") || text.includes("priceComponent"); }

// --- Generic Helpers ---

function expandJsonLdNode(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(expandJsonLdNode);
  const nodes = [node];
  if (Array.isArray(node["@graph"])) nodes.push(...node["@graph"].flatMap(expandJsonLdNode));
  if (node.offers) nodes.push(...normalizeArray(node.offers).flatMap(expandJsonLdNode));
  if (node.hasVariant) nodes.push(...normalizeArray(node.hasVariant).flatMap(expandJsonLdNode));
  return nodes;
}

function normalizeJsonLdProduct(data) {
  const offers = normalizeArray(data.offers);
  const primaryOffer = firstObject(offers);
  const brand = firstObject(data.brand);
  const imageValues = normalizeArray(data.image).map((img) => (typeof img === "string" ? img : img?.url || img?.contentUrl || ""));
  return {
    title: data.name || data.title || "", description: data.description || "",
    price: primaryOffer.price || primaryOffer.lowPrice || data.price || "",
    currency: primaryOffer.priceCurrency || data.priceCurrency || "",
    brand: brand.name || data.brand || "", vendor: firstObject(primaryOffer.seller).name || "",
    sku: data.sku || data.mpn || data.productId || "",
    image_url: cleanImageUrl(imageValues[0] || ""),
    additional_image_urls: imageValues.slice(1).map(cleanImageUrl)
  };
}