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
      .map(p => ({ ...normalizeJsonLdProduct(p), extraction_method: "JSON-LD" }));
  }

  function findNextDataProducts() {
    const script = document.querySelector('script#__NEXT_DATA__');
    if (!script) return [];
    try {
      const data = JSON.parse(script.textContent);
      const product = locateProductInObject(data);
      if (product) return [normalizeJsonLdProduct(product)];
    } catch (e) {}
    return [];
  }

  function findStateInScripts() {
    const scripts = [...document.querySelectorAll("script:not([src])")];
    const patterns = [
      { name: "Shopify", regex: /Shopify\.product\s*=\s*({.*?});/s },
      { name: "NextData", regex: /__NEXT_DATA__\s*=\s*({.*?});/s },
      { name: "PreloadedState", regex: /window\.__PRELOADED_STATE__\s*=\s*({.*?});/s },
      { name: "Meteor", regex: /Meteor\.settings\s*=\s*({.*?});/s }
    ];

    for (const script of scripts) {
      const content = script.textContent;
      for (const pattern of patterns) {
        const match = content.match(pattern.regex);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            const product = locateProductInObject(parsed);
            if (product) return { ...normalizeJsonLdProduct(product), extraction_method: `State-${pattern.name}` };
          } catch (e) {}
        }
      }
    }
    return null;
  }

  function locateProductInObject(obj) {
    if (!obj || typeof obj !== "object") return null;
    if ((obj.title || obj.name) && (obj.price || obj.offers)) return obj;
    if (obj.product) return obj.product;
    if (obj.props?.pageProps?.product) return obj.props.pageProps.product;
    if (obj.props?.initialProps?.pageProps?.product) return obj.props.initialProps.pageProps.product;
    
    // Recursive search for keys like 'product' or 'item' (depth limited)
    const queue = [{ node: obj, depth: 0 }];
    while (queue.length > 0) {
      const { node, depth } = queue.shift();
      if (depth > 5) continue;
      for (const key in node) {
        if (["product", "item", "pdp", "entry"].includes(key.toLowerCase())) {
          if (node[key] && typeof node[key] === "object") return node[key];
        }
        if (node[key] && typeof node[key] === "object") queue.push({ node: node[key], depth: depth + 1 });
      }
    }
    return null;
  }

  function parseJsonLd(rawJson) {
    const trimmed = rawJson.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_error) { return []; }
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

  function normalizeJsonLdProduct(data) {
    const offers = normalizeArray(data.offers);
    const primaryOffer = firstObject(offers);
    const aggregateRating = firstObject(data.aggregateRating);
    const brand = firstObject(data.brand);
    const imageValues = normalizeArray(data.image).map((image) => {
      if (typeof image === "string") return image;
      return image?.url || image?.contentUrl || "";
    });

    return {
      title: data.name || data.title || "",
      description: data.description || "",
      price: primaryOffer.price || primaryOffer.lowPrice || data.price || "",
      currency: primaryOffer.priceCurrency || data.priceCurrency || "",
      compare_at_price: data.listPrice || data.compare_at_price || "",
      shipping_price: firstObject(primaryOffer.shippingDetails)?.shippingRate?.value || "",
      availability: primaryOffer.availability || data.availability || "",
      brand: brand.name || data.brand || "",
      vendor: firstObject(primaryOffer.seller).name || data.vendor || "",
      sku: data.sku || data.mpn || data.gtin || "",
      category: data.category || "",
      image_url: cleanImageUrl(imageValues[0] || ""),
      additional_image_urls: imageValues.slice(1).map(cleanImageUrl),
      rating: aggregateRating.ratingValue || "",
      review_count: aggregateRating.reviewCount || "",
      variant_name: data.variantName || "",
      variant_value: data.variantValue || ""
    };
  }

  function findMicrodataProducts() {
    const productElements = querySelectorAllDeep('[itemscope][itemtype*="Product"]', root);
    return productElements.map((el) => {
      const getProp = (p) => el.querySelector(`[itemprop="${p}"]`)?.getAttribute("content") || el.querySelector(`[itemprop="${p}"]`)?.textContent?.trim() || "";
      const getImg = (p) => el.querySelector(`[itemprop="${p}"]`)?.getAttribute("src") || el.querySelector(`[itemprop="${p}"]`)?.getAttribute("data-src") || "";
      return {
        title: getProp("name"),
        description: getProp("description"),
        price: getProp("price"),
        currency: getProp("priceCurrency"),
        availability: getProp("availability"),
        brand: getProp("brand"),
        sku: getProp("sku") || getProp("mpn"),
        image_url: cleanImageUrl(getImg("image")),
        category: getProp("category"),
        extraction_method: "Microdata"
      };
    });
  }

  function scrapeMetaProduct() {
    const meta = (s) => document.querySelector(s)?.getAttribute("content")?.trim() || "";
    return {
      title: meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || document.title || "",
      description: meta('meta[property="og:description"]') || meta('meta[name="description"]') || "",
      price: meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]') || "",
      currency: meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]') || "",
      image_url: cleanImageUrl(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || "")
    };
  }

  function scrapeFullDescription() {
    const selectors = ["#productDescription", "#description", ".product-description", "[data-testid=\"description\"]", ".description", "#feature-bullets", ".product-details", ".post-content", "#tab-description", ".pdp-about-item", ".product-info-main"];
    let html = "";
    for (const selector of selectors) {
      const el = querySelectorDeep(selector, root);
      if (el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("script, style, button, input, iframe, noscript, svg").forEach(e => e.remove());
        html += clone.innerHTML.trim() + " ";
      }
    }
    return html.trim();
  }

  function scrapeDetailedVariants() {
    const options = [];
    const containers = querySelectorAllDeep(".variant-option, .variation, .product-option, .attribute-group, .swatch-container, .picker-option", root);
    containers.forEach(container => {
      const label = container.querySelector("label, .label, .option-name, .attr-label, .title")?.textContent?.trim().replace(/:$/, "");
      const selected = container.querySelector(".selected, .active, .is-selected, option:checked, [aria-checked=\"true\"]")?.textContent?.trim();
      if (label && selected && label.length < 30 && selected.length < 50) options.push({ name: label, value: selected });
    });
    return options.slice(0, 3);
  }

  function scrapeWeight() {
    const text = root.textContent || "";
    const weightRegex = /(\d+(?:\.\d+)?)\s*(kg|lb|oz|g|grams|ounces|pounds|kg\.|lb\.)/i;
    const match = text.match(weightRegex);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (unit.startsWith("kg")) return Math.round(value * 1000);
      if (unit.startsWith("lb")) return Math.round(value * 453.59);
      if (unit.startsWith("oz")) return Math.round(value * 28.35);
      if (unit.startsWith("g")) return Math.round(value);
    }
    return 0;
  }

  function visualHeuristicScrape() {
    const results = { title: "", price: "" };
    try {
      const h1 = querySelectorDeep("h1", root);
      if (h1) results.title = h1.textContent.trim();
      const currencySymbols = ["$", "€", "£", "¥", "₹"];
      const candidateElements = querySelectorAllDeep("span, div, b, strong, ins", root)
        .filter(el => {
          const text = el.textContent.trim();
          return currencySymbols.some(s => text.startsWith(s) || text.includes(s)) && text.length < 15;
        })
        .sort((a, b) => parseFloat(window.getComputedStyle(b).fontSize) - parseFloat(window.getComputedStyle(a).fontSize));
      if (candidateElements.length > 0) results.price = candidateElements[0].textContent.trim();
    } catch (e) {}
    return results;
  }

  function scrapeShopifyMeta() {
    const getMeta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute("content");
    return {
      vendor: getMeta("shopify-seller-name") || getMeta("og:site_name"),
      product_id: getMeta("shopify-product-id"),
      category: getMeta("product:category") || getMeta("product_type") || getMeta("product_category")
    };
  }

  function findBarcodesInText() {
    const text = root.textContent || "";
    const barcodeRegex = /\b(\d{12,14})\b/g;
    const matches = text.match(barcodeRegex);
    return matches ? [...new Set(matches)].join(" | ") : "";
  }

  function scrapeDomProduct() {
    const title = textFromSelectors(["#productTitle", ".product-title", "h1.title", "[data-testid=\"product-title\"]", ".product-name h1", ".pdp-title", ".item-name", ".product-details__title", ".product-info-main .page-title"]);
    const price = textFromSelectors([".a-price .a-offscreen", ".price", "[data-testid=\"price\"]", ".product-price", ".current-price", ".price-item", ".price-sales", "[itemprop=\"price\"]", ".pdp-price", ".price-wrapper"]);
    const market = scrapeMarketplaceSpecific();
    const detailedVariants = scrapeDetailedVariants();
    const fullDescription = scrapeFullDescription();
    const grams = scrapeWeight();
    const visual = visualHeuristicScrape();
    const shopifyMeta = scrapeShopifyMeta();
    const barcode = findBarcodesInText();
    const gallery = attributeValues(["#landingImage", ".product-image img", "[data-testid=\"product-image\"]", ".main-image", ".gallery-item img", ".product-thumbnails img", ".thumb img", ".product-photo img", ".pdp-image", ".image-zoom", ".swiper-slide img", ".product-image-photo"], ["src", "data-src", "data-lazy-src", "srcset", "data-original", "data-zoom-image"]);
    const uniqueImages = [...new Set(gallery.map(cleanImageUrl))].filter(Boolean);

    return mergeProductData(
      { 
        title: title || visual.title, 
        price: price || visual.price, 
        description: fullDescription,
        image_url: uniqueImages[0] || "",
        additional_image_urls: uniqueImages.slice(1),
        variant_options: detailedVariants,
        variant_grams: grams,
        sku: barcode,
        extraction_method: "Industrial-DOM-Visual",
        ...scrapeContactAndSocial(),
        category: scrapeBreadcrumbs()
      },
      shopifyMeta,
      market
    );
  }

  function scrapeMarketingPixels() {
    const pixels = [];
    const html = document.documentElement.innerHTML;
    const patterns = [{ name: "FB", regex: /fbq\('init',\s*'(\d+)'\)/ }, { name: "GA", regex: /gtag\('config',\s*'(G-[A-Z0-9]+|UA-\d+-\d+)'\)/ }, { name: "TikTok", regex: /ttq\.load\('([A-Z0-9]+)'\)/ }, { name: "Pinterest", regex: /pintrk\('load',\s*'(\d+)'\)/ }, { name: "Snapchat", regex: /snaptr\('init',\s*'([a-z0-9-]+)'\)/ }];
    patterns.forEach(p => { const match = html.match(p.regex); if (match) pixels.push(`${p.name}:${match[1]}`); });
    return pixels.join(" | ");
  }

  function scrapeContactAndSocial() {
    const contact = [], social = [];
    const socialPatterns = ["facebook.com", "instagram.com", "twitter.com", "x.com", "pinterest.com", "youtube.com", "tiktok.com", "linkedin.com"];
    querySelectorAllDeep("a[href]", document).forEach(a => {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("mailto:")) contact.push(`Email:${href.replace("mailto:", "").split("?")[0]}`);
      else if (href.startsWith("tel:")) contact.push(`Tel:${href.replace("tel:", "").split("?")[0]}`);
      else if (socialPatterns.some(p => href.includes(p))) social.push(href);
    });
    return { contact_info: [...new Set(contact)].slice(0, 5).join(" | "), social_links: [...new Set(social)].slice(0, 8).join(" | ") };
  }

  function scrapeMarketplaceSpecific() {
    const host = window.location.hostname;
    const registry = {
      "amazon": { title: ["#productTitle", "#title"], price: [".a-price .a-offscreen", "#priceblock_ourprice"], brand: ["#bylineInfo", "#brand"], sku: ["#ASIN"] },
      "walmart": { title: ["h1[itemprop=\"name\"]"], price: ["[data-testid=\"item-price\"]"], brand: [".brand-name"] },
      "ebay": { title: [".x-item-title__mainTitle"], price: [".x-price-primary"], brand: [".x-about-this-item"] },
      "etsy": { title: [".wt-text-title-03", "h1"], price: [".wt-text-title-03 .currency-value"], brand: [".wt-text-caption"] }
    };
    const site = Object.keys(registry).find(key => host.includes(key));
    if (!site) return {};
    const config = registry[site];
    const data = {};
    for (const [key, selectors] of Object.entries(config)) data[key] = textFromSelectors(selectors);
    return data;
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

  function hasMeaningfulValue(value) { return Array.isArray(value) ? value.length > 0 : (value !== null && value !== undefined && String(value).trim() !== ""); }
  function normalizeType(t) { return normalizeArray(t).join(" ").toLowerCase(); }
  function normalizeArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
  function firstObject(v) { const item = normalizeArray(v)[0]; return (item && typeof item === "object") ? item : {}; }

  function textFromSelectors(selectors) {
    for (const selector of selectors) {
      const el = querySelectorDeep(selector, root);
      const text = el?.getAttribute("content") || el?.textContent || "";
      if (text.trim()) return text.trim();
    }
    return "";
  }

  function scrapeBreadcrumbs() {
    const selectors = [".breadcrumb", ".breadcrumbs", ".nav-breadcrumb", ".pdp-breadcrumbs", "[itemtype*=\"BreadcrumbList\"]"];
    for (const selector of selectors) {
      const el = querySelectorDeep(selector, root);
      if (el) {
        const items = [...el.querySelectorAll("li, a, span")].map(i => {
          const text = i.textContent?.trim() || "";
          return (text.length > 1 && !["/", ">", "|", "»", "\\"].includes(text)) ? text : null;
        }).filter(Boolean);
        const cleanItems = items.filter((item, idx) => item !== items[idx - 1]);
        if (cleanItems.length > 0) return cleanItems.join(" > ");
      }
    }
    return "";
  }

  function attributeValues(selectors, attrs) {
    const attrList = Array.isArray(attrs) ? attrs : [attrs];
    return selectors.flatMap(s => querySelectorAllDeep(s, root).map(el => {
      for (const attr of attrList) {
        const val = el.getAttribute(attr);
        if (val) {
          if (attr === "srcset") return val.split(",").pop().trim().split(" ")[0];
          return val;
        }
      }
      return null;
    }).filter(Boolean));
  }

  function cleanImageUrl(url) {
    if (!url) return "";
    try {
      let clean = url.startsWith("//") ? window.location.protocol + url : url;
      clean = clean.replace(/(_\d+x\d+|_thumb|_small|-150x150|-300x300|_AC_SS\d+|_AC_UY\d+|_SL\d+|_SR\d+,\d+)(\.[a-z]+)$/i, "$2").replace(/(\?|&)v=\d+/, "");
      const u = new URL(clean, window.location.href);
      ["v", "width", "height", "quality", "size", "resize", "impolicy", "imwidth"].forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch (_e) { return url; }
  }

  function querySelectorAllDeep(selector, root = document) {
    const elements = [...root.querySelectorAll(selector)];
    const roots = [...root.querySelectorAll("*")].map(el => el.shadowRoot).filter(Boolean);
    for (const shadowRoot of roots) elements.push(...querySelectorAllDeep(selector, shadowRoot));
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

  const scriptState = findStateInScripts();
  const jsonLd = findJsonLdProducts();
  const nextData = findNextDataProducts();
  const microdata = findMicrodataProducts();
  const meta = scrapeMetaProduct();
  const dom = scrapeDomProduct();

  let products = [];
  if (scriptState) products = [scriptState];
  else if (jsonLd.length > 0) products = jsonLd;
  else if (nextData.length > 0) products = nextData;
  else if (microdata.length > 0) products = microdata;
  else {
    const merged = mergeProductData(dom, meta, firstObject(microdata), firstObject(nextData), firstObject(jsonLd));
    if (merged.title || merged.price) products = [merged];
  }

  return products.map(p => ({
    ...p,
    source_url: pageUrl,
    source_tab_title: pageTitle,
    source_site: window.location.hostname,
    extraction_method: p.extraction_method || "fallback",
    scraped_at: timestamp
  }));
}