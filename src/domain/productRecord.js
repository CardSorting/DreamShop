export const PRODUCT_CSV_COLUMNS = [
  "source_site",
  "source_url",
  "source_tab_title",
  "title",
  "description",
  "price",
  "currency",
  "compare_at_price",
  "discount_percentage",
  "shipping_price",
  "availability",
  "return_policy",
  "brand",

  "vendor",
  "sku",
  "category",
  "tags",
  "specifications",
  "marketing_pixels",
  "seo_structure",
  "image_url",


  "additional_image_urls",
  "variant_name",
  "variant_value",
  "shipping_origin",
  "rating",
  "review_count",
  "notes",
  "scraped_at"
];

const KNOWN_SOURCE_SITES = [
  { name: "amazon", patterns: ["amazon."] },
  { name: "walmart", patterns: ["walmart."] },
  { name: "etsy", patterns: ["etsy."] },
  { name: "aliexpress", patterns: ["aliexpress.", "alibaba."] },
  { name: "ebay", patterns: ["ebay."] },
  { name: "shopify", patterns: ["myshopify.com"] }
];

export function createEmptyProductRecord() {
  return PRODUCT_CSV_COLUMNS.reduce((record, column) => {
    record[column] = "";
    return record;
  }, {});
}

export function detectSourceSite(sourceUrl = "") {
  let host = "";

  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch (_error) {
    host = String(sourceUrl).toLowerCase();
  }

  const match = KNOWN_SOURCE_SITES.find((site) =>
    site.patterns.some((pattern) => host.includes(pattern))
  );

  return match?.name || host.replace(/^www\./, "") || "generic";
}

export function normalizeProductRecord(rawProduct = {}, fallback = {}) {
  const record = createEmptyProductRecord();
  const sourceUrl = cleanText(rawProduct.source_url || rawProduct.url || fallback.source_url || "");
  const images = normalizeList(rawProduct.images || rawProduct.additional_image_urls);
  const primaryImage = cleanText(rawProduct.image_url || rawProduct.image || images[0] || "");
  const additionalImages = images.filter((imageUrl) => imageUrl && imageUrl !== primaryImage);
  const priceSource = rawProduct.price || rawProduct.lowPrice || rawProduct.highPrice || "";
  const title = cleanText(rawProduct.title || fallback.title || "");
  const description = cleanText(rawProduct.description || "");
  const notes = buildNotes(rawProduct, fallback, title, description);

  const price = normalizePrice(priceSource);
  const comparePrice = normalizePrice(rawProduct.compare_at_price || rawProduct.listPrice || "");
  const discount = calculateDiscount(price, comparePrice);

  return {

    ...record,
    source_site: cleanText(rawProduct.source_site || detectSourceSite(sourceUrl)),
    source_url: sourceUrl,
    source_tab_title: cleanText(rawProduct.source_tab_title || fallback.source_tab_title || fallback.title || ""),
    title,
    description,
    price,
    currency: normalizeCurrency(rawProduct.currency || rawProduct.priceCurrency || inferCurrencyFromText(priceSource)),
    compare_at_price: comparePrice,
    discount_percentage: discount,
    shipping_price: normalizePrice(rawProduct.shipping_price || rawProduct.shippingRate || ""),
    availability: normalizeAvailability(rawProduct.availability || ""),
    return_policy: cleanText(rawProduct.return_policy || rawProduct.hasMerchantReturnPolicy || ""),
    brand: cleanText(rawProduct.brand || ""),
    vendor: cleanText(rawProduct.vendor || rawProduct.seller || rawProduct.merchant || rawProduct.brand || ""),
    sku: cleanText(rawProduct.sku || rawProduct.mpn || rawProduct.gtin || ""),
    category: cleanText(rawProduct.category || rawProduct.productCategory || ""),
    tags: normalizeTags(rawProduct.tags || rawProduct.keywords || rawProduct.category || ""),
    specifications: cleanText(rawProduct.specifications || ""),
    marketing_pixels: cleanText(rawProduct.marketing_pixels || ""),
    seo_structure: cleanText(rawProduct.seo_structure || ""),
    image_url: primaryImage,


    additional_image_urls: additionalImages.join(" | "),
    variant_name: cleanText(rawProduct.variant_name || rawProduct.variantName || ""),
    variant_value: cleanText(rawProduct.variant_value || rawProduct.variantValue || ""),
    shipping_origin: cleanText(rawProduct.shipping_origin || rawProduct.shipsFrom || ""),
    rating: normalizeRating(rawProduct.rating || rawProduct.ratingValue || ""),
    review_count: normalizeInteger(rawProduct.review_count || rawProduct.reviewCount || ""),
    notes,
    scraped_at: cleanText(rawProduct.scraped_at || fallback.scraped_at || "")
  };
}

function calculateDiscount(price, compare) {
  const p = parseFloat(price);
  const c = parseFloat(compare);
  if (!p || !c || c <= p) return "";
  const pct = ((c - p) / c) * 100;
  return `${Math.round(pct)}%`;
}


export function validateProductRecord(record) {
  const warnings = [];

  if (!record.title) {
    warnings.push("Missing product title");
  }

  if (!record.price) {
    warnings.push("Missing product price");
  }

  if (!record.image_url) {
    warnings.push("Missing primary image URL");
  }

  if (!record.source_url) {
    warnings.push("Missing source URL");
  }

  return warnings;
}

function buildNotes(rawProduct, fallback, title, description) {
  const notes = normalizeList(rawProduct.notes);

  if (!title && fallback.title) {
    notes.push("Used tab title fallback for missing product title.");
  }

  if (!description) {
    notes.push("Description was not found on page.");
  }

  return notes.join(" | ");
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean).join(" | ");
  }

  if (typeof value === "object") {
    if (value.name) {
      return cleanText(value.name);
    }

    if (value.value) {
      return cleanText(value.value);
    }

    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(normalizeList).filter(Boolean);
  }

  if (typeof value === "object") {
    const objectValue = value.url || value.contentUrl || value.name || value.value;
    return objectValue ? normalizeList(objectValue) : [];
  }

  return String(value)
    .split(/[,|\n]/)
    .map(cleanText)
    .filter(Boolean);
}

function normalizePrice(value) {
  let text = cleanText(value);

  if (!text) return "";

  // Handle European/South American format: 1.299,99 -> 1299.99
  if (text.includes(",") && text.includes(".")) {
    const commaIndex = text.lastIndexOf(",");
    const dotIndex = text.lastIndexOf(".");
    if (commaIndex > dotIndex) {
      // European: 1.299,99
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 1,299.99
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    // Check if comma is decimal or thousands separator
    // 1,299 (US int) vs 1,29 (EU decimal)
    const parts = text.split(",");
    if (parts[parts.length - 1].length === 2) {
      // Likely decimal: 1,29
      text = text.replace(",", ".");
    } else {
      // Likely thousands: 1,299
      text = text.replace(",", "");
    }
  }

  const priceMatch = text.match(/-?\d+(?:\.\d+)?/);
  return priceMatch ? priceMatch[0] : text;
}

function normalizeCurrency(value) {
  const text = cleanText(value).toUpperCase();

  if (!text) return "";

  const symbolMap = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "C$": "CAD",
    "A$": "AUD",
    "CHF": "CHF",
    "KR": "SEK",
    "₹": "INR",
    "₩": "KRW",
    "₽": "RUB"
  };

  if (symbolMap[text]) return symbolMap[text];

  const codeMatch = text.match(/[A-Z]{3}/);
  return codeMatch ? codeMatch[0] : text;
}


function inferCurrencyFromText(value) {
  const text = cleanText(value);

  if (text.includes("$")) {
    return "USD";
  }

  if (text.includes("€")) {
    return "EUR";
  }

  if (text.includes("£")) {
    return "GBP";
  }

  if (text.includes("¥")) {
    return "JPY";
  }

  return "";
}

function normalizeAvailability(value) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  return text
    .replace(/^https?:\/\/schema\.org\//i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function normalizeTags(value) {
  return normalizeList(value)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean)
    .filter((tag, index, allTags) => allTags.indexOf(tag) === index)
    .join(" | ");
}

function normalizeRating(value) {
  const text = cleanText(value);
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? match[0] : text;
}

function normalizeInteger(value) {
  const text = cleanText(value);
  const match = text.replace(/,/g, "").match(/\d+/);
  return match ? match[0] : text;
}