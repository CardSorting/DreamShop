export function scrapeProductFromPage() {
// Helpers are intentionally nested so chrome.scripting.executeScript can inject
// this function as a self-contained page scraper.
function findJsonLdProducts() {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];

  return scripts
    .flatMap((script) => parseJsonLd(script.textContent || ""))
    .flatMap(expandJsonLdNode)
    .filter(isProductLike)
    .map(normalizeJsonLdProduct);
}

function parseJsonLd(rawJson) {
  const trimmed = rawJson.trim();

  if (!trimmed) {
    return [];
  }

  try {
    return [JSON.parse(trimmed)];
  } catch (_error) {
    return [];
  }
}

function expandJsonLdNode(node) {
  if (!node) {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap(expandJsonLdNode);
  }

  if (typeof node !== "object") {
    return [];
  }

  const graph = Array.isArray(node["@graph"]) ? node["@graph"].flatMap(expandJsonLdNode) : [];
  const hasOffers = node.offers ? expandJsonLdNode(node.offers) : [];
  const variants = node.hasVariant ? expandJsonLdNode(node.hasVariant) : [];

  return [node, ...graph, ...hasOffers, ...variants];
}

function isProductLike(node) {
  const type = normalizeType(node["@type"]);
  return type.includes("product") || Boolean(node.offers && (node.name || node.image));
}

function normalizeJsonLdProduct(product) {
  const offer = firstObject(product.offers);
  const aggregateRating = firstObject(product.aggregateRating);
  const brand = firstObject(product.brand);
  const imageValues = normalizeArray(product.image).map((image) => {
    if (typeof image === "string") {
      return image;
    }

    return image?.url || image?.contentUrl || "";
  });

  return {
    title: product.name || "",
    description: product.description || "",
    price: offer.price || offer.lowPrice || offer.highPrice || product.price || "",
    currency: offer.priceCurrency || product.priceCurrency || "",
    availability: offer.availability || product.availability || "",
    brand: brand.name || product.brand || "",
    vendor: firstObject(offer.seller).name || firstObject(product.seller).name || "",
    sku: product.sku || product.mpn || product.gtin || product.gtin13 || product.gtin14 || "",
    category: product.category || "",
    image_url: imageValues[0] || "",
    additional_image_urls: imageValues.slice(1),
    rating: aggregateRating.ratingValue || "",
    review_count: aggregateRating.reviewCount || aggregateRating.ratingCount || ""
  };
}

function scrapeMetaProduct() {
  const meta = (selector) => document.querySelector(selector)?.getAttribute("content")?.trim() || "";
  const keywords = meta('meta[name="keywords"]');
  const price =
    meta('meta[property="product:price:amount"]') ||
    meta('meta[property="og:price:amount"]') ||
    meta('meta[name="twitter:data1"]');

  return {
    title: meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || document.title || "",
    description:
      meta('meta[property="og:description"]') ||
      meta('meta[name="twitter:description"]') ||
      meta('meta[name="description"]') ||
      "",
    price,
    currency: meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]') || "",
    availability: meta('meta[property="product:availability"]') || "",
    brand: meta('meta[property="product:brand"]') || "",
    category: meta('meta[property="product:category"]') || "",
    tags: keywords,
    image_url: meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || ""
  };
}

function scrapeDomProduct() {
  const title = textFromSelectors([
    "#productTitle",
    '[data-testid="product-title"]',
    '[data-test-id="product-title"]',
    '[itemprop="name"]',
    "h1"
  ]);
  const description = textFromSelectors([
    "#productDescription",
    "#feature-bullets",
    '[data-testid="product-description"]',
    '[data-test-id="product-description"]',
    '[itemprop="description"]',
    ".product-description",
    ".description"
  ]);
  const price = textFromSelectors([
    ".a-price .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    '[data-testid="price-wrap"]',
    '[data-automation-id="product-price"]',
    '[itemprop="price"]',
    ".price",
    ".product-price",
    "[class*=price]"
  ]);
  const availability = textFromSelectors([
    "#availability",
    '[data-testid="availability"]',
    '[data-automation-id="fulfillment-shipping-text"]',
    ".availability",
    "[class*=availability]"
  ]);
  const brand = textFromSelectors([
    "#bylineInfo",
    '[data-testid="brand-name"]',
    '[itemprop="brand"]',
    ".brand",
    "[class*=brand]"
  ]);
  const imageUrls = uniqueValues([
    ...attributeValues([
      "#landingImage",
      "#imgTagWrapperId img",
      '[data-testid="hero-image"] img',
      '[data-testid="product-image"] img',
      '[data-automation-id="product-image"] img',
      '[itemprop="image"]',
      ".product-image img",
      ".carousel img",
      "main img"
    ], "src"),
    ...attributeValues([
      "#landingImage",
      "#imgTagWrapperId img",
      '[data-testid="hero-image"] img',
      '[data-testid="product-image"] img',
      '[data-automation-id="product-image"] img',
      ".product-image img",
      ".carousel img",
      "main img"
    ], "data-old-hires"),
    ...srcsetValues()
  ]).filter(isLikelyImageUrl);

  return {
    title,
    description,
    price,
    availability,
    brand,
    vendor: brand,
    image_url: imageUrls[0] || "",
    additional_image_urls: imageUrls.slice(1, 8),
    rating: textFromSelectors([
      '[data-testid="rating"]',
      '[itemprop="ratingValue"]',
      ".review-rating",
      "[class*=rating]"
    ]),
    review_count: textFromSelectors([
      "#acrCustomerReviewText",
      '[data-testid="reviews-count"]',
      '[itemprop="reviewCount"]',
      "[class*=review]"
    ])
  };
}

function mergeProductData(...products) {
  const merged = {};

  for (const product of products.reverse()) {
    for (const [key, value] of Object.entries(product || {})) {
      if (hasMeaningfulValue(value)) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== null && value !== undefined && String(value).trim() !== "";
}

function normalizeType(type) {
  return normalizeArray(type).join(" ").toLowerCase();
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function firstObject(value) {
  const item = normalizeArray(value)[0];

  if (item && typeof item === "object") {
    return item;
  }

  return {};
}

function textFromSelectors(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const text = element?.getAttribute?.("content") || element?.textContent || element?.getAttribute?.("aria-label") || "";
    const cleaned = text.replace(/\s+/g, " ").trim();

    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function attributeValues(selectors, attributeName) {
  return selectors.flatMap((selector) =>
    [...document.querySelectorAll(selector)]
      .map((element) => element.getAttribute(attributeName))
      .filter(Boolean)
  );
}

function srcsetValues() {
  return [...document.querySelectorAll("img[srcset]")]
    .flatMap((image) => image.getAttribute("srcset").split(","))
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => absoluteUrl(value)).filter(Boolean))];
}

function absoluteUrl(value) {
  try {
    return new URL(value, window.location.href).href;
  } catch (_error) {
    return "";
  }
}

function isLikelyImageUrl(value) {
  return /^https?:\/\//i.test(value) && !/sprite|logo|icon|avatar|placeholder/i.test(value);
}

  const pageUrl = window.location.href;
  const jsonLdProducts = findJsonLdProducts();
  const primaryJsonLdProduct = jsonLdProducts[0] || {};
  const metaProduct = scrapeMetaProduct();
  const domProduct = scrapeDomProduct();
  const mergedProduct = mergeProductData(primaryJsonLdProduct, metaProduct, domProduct);

  return {
    ...mergedProduct,
    source_url: pageUrl,
    source_tab_title: document.title || "",
    scraped_at: new Date().toISOString()
  };
}