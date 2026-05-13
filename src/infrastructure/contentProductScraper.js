export function scrapeProductFromPage(targetSelector = null) {
  // Helpers are intentionally nested so chrome.scripting.executeScript can inject
  // this function as a self-contained page scraper.
  const root = targetSelector ? (document.querySelector(targetSelector) || document) : document;

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
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_error) {
      return [];
    }
  }

  function expandJsonLdNode(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(expandJsonLdNode);

    const nodes = [node];
    if (Array.isArray(node["@graph"])) nodes.push(...node["@graph"].flatMap(expandJsonLdNode));
    if (node.offers) nodes.push(...normalizeArray(node.offers).flatMap(expandJsonLdNode));
    if (node.hasVariant) nodes.push(...normalizeArray(node.hasVariant).flatMap(expandJsonLdNode));
    if (node.mainEntity) nodes.push(...expandJsonLdNode(node.mainEntity));

    return nodes;
  }

  function isProductLike(node) {
    const type = normalizeType(node["@type"]);
    return type.includes("product") || Boolean(node.offers && (node.name || node.image));
  }

  function normalizeJsonLdProduct(product) {
    const offers = normalizeArray(product.offers);
    const primaryOffer = firstObject(offers);
    const aggregateRating = firstObject(product.aggregateRating);
    const brand = firstObject(product.brand);
    const imageValues = normalizeArray(product.image).map((image) => {
      if (typeof image === "string") return image;
      return image?.url || image?.contentUrl || "";
    });

    return {
      title: product.name || "",
      description: product.description || "",
      price: primaryOffer.price || primaryOffer.lowPrice || product.price || "",
      currency: primaryOffer.priceCurrency || product.priceCurrency || "",
      availability: primaryOffer.availability || product.availability || "",
      brand: brand.name || product.brand || "",
      vendor: firstObject(primaryOffer.seller).name || product.vendor || "",
      sku: product.sku || product.mpn || product.gtin || "",
      category: product.category || "",
      image_url: cleanImageUrl(imageValues[0] || ""),
      additional_image_urls: imageValues.slice(1).map(cleanImageUrl),
      rating: aggregateRating.ratingValue || "",
      review_count: aggregateRating.reviewCount || aggregateRating.ratingCount || "",
      variant_name: product.variantName || "",
      variant_value: product.variantValue || ""
    };
  }

  function findMicrodataProducts() {
    const productElements = querySelectorAllDeep('[itemscope][itemtype*="Product"]', root);
    if (productElements.length === 0) return [];

    return productElements.map((el) => {
      const getProp = (prop) => {
        const target = el.querySelector(`[itemprop="${prop}"]`);
        return target?.getAttribute("content") || target?.textContent?.trim() || "";
      };
      
      const getImg = (prop) => {
        const target = el.querySelector(`[itemprop="${prop}"]`);
        if (!target) return "";
        return target.getAttribute("src") || target.getAttribute("data-src") || target.getAttribute("content") || "";
      };

      return {
        title: getProp("name"),
        description: getProp("description"),
        price: getProp("price"),
        currency: getProp("priceCurrency"),
        availability: getProp("availability"),
        brand: getProp("brand"),
        sku: getProp("sku") || getProp("mpn"),
        image_url: cleanImageUrl(getImg("image")),
        rating: el.querySelector('[itemscope][itemtype*="AggregateRating"] [itemprop="ratingValue"]')?.textContent?.trim() || ""
      };
    });
  }

  function scrapeMetaProduct() {
    const meta = (selector) => document.querySelector(selector)?.getAttribute("content")?.trim() || "";
    return {
      title: meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || document.title || "",
      description: meta('meta[property="og:description"]') || meta('meta[name="description"]') || "",
      price: meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]') || "",
      currency: meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]') || "",
      availability: meta('meta[property="product:availability"]') || "",
      brand: meta('meta[property="product:brand"]') || meta('meta[name="brand"]') || "",
      image_url: cleanImageUrl(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || "")
    };
  }

  function scrapeDomProduct() {
    const title = textFromSelectors(["#productTitle", ".product-title", "h1.title", "[data-testid=\"product-title\"]"]);
    const price = textFromSelectors([".a-price .a-offscreen", ".price", "[data-testid=\"price\"]", ".product-price"]);
    const image_url = attributeValues(["#landingImage", ".product-image img", "[data-testid=\"product-image\"]", ".main-image"], ["src", "data-src", "data-lazy-src", "srcset"])[0] || "";

    return { title, price, image_url: cleanImageUrl(image_url) };
  }

  function mergeProductData(...products) {
    const merged = {};
    for (const product of products.reverse()) {
      for (const [key, value] of Object.entries(product || {})) {
        if (hasMeaningfulValue(value)) merged[key] = value;
      }
    }
    return merged;
  }

  function hasMeaningfulValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function normalizeType(type) {
    return normalizeArray(type).join(" ").toLowerCase();
  }

  function normalizeArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function firstObject(value) {
    const item = normalizeArray(value)[0];
    return (item && typeof item === "object") ? item : {};
  }

  function textFromSelectors(selectors) {
    for (const selector of selectors) {
      const el = querySelectorDeep(selector, root);
      const text = el?.getAttribute("content") || el?.textContent || "";
      if (text.trim()) return text.trim();
    }
    return "";
  }

  function attributeValues(selectors, attrs) {
    const attrList = Array.isArray(attrs) ? attrs : [attrs];
    return selectors.flatMap(s => querySelectorAllDeep(s, root).map(el => {
      for (const attr of attrList) {
        const val = el.getAttribute(attr);
        if (val) {
          if (attr === "srcset") return val.split(",")[0].split(" ")[0];
          return val;
        }
      }
      return null;
    }).filter(Boolean));
  }

  function cleanImageUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url, window.location.href);
      ["v", "width", "height", "quality"].forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch (_e) {
      return url;
    }
  }

  /**
   * Helper to find elements across Shadow DOM boundaries
   */
  function querySelectorAllDeep(selector, root = document) {
    const elements = [...root.querySelectorAll(selector)];
    const roots = [...root.querySelectorAll("*")].map(el => el.shadowRoot).filter(Boolean);
    
    for (const shadowRoot of roots) {
      elements.push(...querySelectorAllDeep(selector, shadowRoot));
    }
    return elements;
  }

  function querySelectorDeep(selector, root = document) {
    const el = root.querySelector(selector);
    if (el) return el;

    const roots = [...root.querySelectorAll("*")].map(el => el.shadowRoot).filter(Boolean);
    for (const shadowRoot of roots) {
      const target = querySelectorDeep(selector, shadowRoot);
      if (target) return target;
    }
    return null;
  }

  const pageUrl = window.location.href;
  const pageTitle = document.title || "";
  const timestamp = new Date().toISOString();

  // Strategy: Try to find multiple products first (Lists/Collections)
  let products = findJsonLdProducts();
  if (products.length === 0) products = findMicrodataProducts();

  // If no structured products found, fallback to meta/dom for a single item
  if (products.length === 0) {
    const meta = scrapeMetaProduct();
    const dom = scrapeDomProduct();
    const merged = mergeProductData(meta, dom);
    if (merged.title || merged.price) products = [merged];
  }

  return products.map(p => ({
    ...p,
    source_url: pageUrl,
    source_tab_title: pageTitle,
    source_site: window.location.hostname,
    scraped_at: timestamp
  }));
}