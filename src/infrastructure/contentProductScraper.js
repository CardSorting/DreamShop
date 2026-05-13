export function scrapeProductFromPage(targetSelector = null) {
  // Helpers are intentionally nested so chrome.scripting.executeScript can inject
  // this function as a self-contained page scraper.
  const root = targetSelector ? (document.querySelector(targetSelector) || document) : document;

  /**
   * THE EXPERT SYSTEM V2: Site-specific extraction logic
   */
  const EXPERT_HANDLERS = {
    shopify: () => {
      const shopifyData = findStateInScripts("Shopify");
      if (shopifyData) return { ...shopifyData, extraction_method: "Expert-Shopify" };
      const getMeta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute("content");
      if (getMeta("shopify-product-id")) {
         return {
           vendor: getMeta("shopify-seller-name") || getMeta("og:site_name"),
           category: getMeta("product:category") || getMeta("product_type"),
           extraction_method: "Expert-Shopify-Meta"
         };
      }
      return null;
    },
    amazon: () => {
      const title = textFromSelectors(["#productTitle", "#title"]);
      const price = textFromSelectors([".a-price .a-offscreen", "#priceblock_ourprice", "#priceblock_dealprice", ".a-color-price"]);
      const brand = textFromSelectors(["#bylineInfo", "#brand", ".po-brand"]);
      const sku = textFromSelectors(["#ASIN", ".prodDetSectionEntry"]);
      const images = attributeValues(["#landingImage", "#main-image-container img", ".a-dynamic-image"], ["src", "data-old-hires", "data-a-dynamic-image"]);
      return { title, price, brand, sku, image_url: cleanImageUrl(images[0]), extraction_method: "Expert-Amazon" };
    },
    walmart: () => {
      const title = textFromSelectors(["h1[itemprop=\"name\"]", "h1.f3", ".product-title"]);
      const price = textFromSelectors(["[data-testid=\"item-price\"]", ".price-characteristic", ".f2"]);
      const brand = textFromSelectors([".brand-name", "a[itemprop=\"brand\"]"]);
      const images = attributeValues(["[data-testid=\"main-image\"] img", ".db_main-image", ".prod-HeroImage", ".bh-main-image"], ["src", "srcset", "data-src"]);
      const nextData = findNextDataProducts();
      return mergeProductData({ title, price, brand, image_url: cleanImageUrl(images[0]), extraction_method: "Expert-Walmart" }, firstObject(nextData));
    }
  };

  function findJsonLdProducts() {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    return scripts
      .flatMap((s) => {
        try {
          const parsed = JSON.parse(s.textContent || "");
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) { return []; }
      })
      .flatMap(expandJsonLdNode)
      .filter(n => normalizeType(n["@type"]).includes("product") || n.offers)
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

  function findStateInScripts(targetName = null) {
    const scripts = [...document.querySelectorAll("script:not([src])")];
    const patterns = [
      { name: "Shopify", regex: /Shopify\.product\s*=\s*({.*?});/s },
      { name: "NextData", regex: /__NEXT_DATA__\s*=\s*({.*?});/s },
      { name: "PreloadedState", regex: /window\.__PRELOADED_STATE__\s*=\s*({.*?});/s }
    ];

    for (const script of scripts) {
      const content = script.textContent;
      for (const pattern of patterns) {
        if (targetName && pattern.name !== targetName) continue;
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
    if (obj.props?.initialData?.product) return obj.props.initialData.product;
    
    // Breadth-First search for common product keys
    const keys = ["product", "item", "pdp", "initialData", "entry"];
    for (const key of keys) {
      if (obj[key] && typeof obj[key] === "object") {
        const nested = locateProductInObject(obj[key]);
        if (nested) return nested;
      }
    }
    return null;
  }

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
      title: data.name || data.title || "",
      description: data.description || "",
      price: primaryOffer.price || primaryOffer.lowPrice || data.price || "",
      currency: primaryOffer.priceCurrency || data.priceCurrency || "",
      compare_at_price: data.listPrice || data.compare_at_price || "",
      availability: primaryOffer.availability || data.availability || "",
      brand: brand.name || data.brand || "",
      vendor: firstObject(primaryOffer.seller).name || data.vendor || "",
      sku: data.sku || data.mpn || data.gtin || "",
      category: data.category || "",
      image_url: cleanImageUrl(imageValues[0] || ""),
      additional_image_urls: imageValues.slice(1).map(cleanImageUrl),
      variant_options: data.variant_options || []
    };
  }

  function scrapeFullDescription() {
    const selectors = ["#productDescription", "#description", ".product-description", ".description", ".product-info-main", ".pdp-about-item", "#tab-description", ".product-details__description"];
    let html = "";
    selectors.forEach(s => {
      const el = querySelectorDeep(s, root);
      if (el) {
        const clone = el.cloneNode(true);
        // Deep sanitization: remove all non-content nodes
        clone.querySelectorAll("script, style, button, input, svg, noscript, iframe, link, .social-sharing").forEach(e => e.remove());
        html += clone.innerHTML.trim() + " ";
      }
    });
    return sanitizeHtmlForShopify(html.trim());
  }

  function sanitizeHtmlForShopify(html) {
    if (!html) return "";
    // Shopify allows basic structural tags. We clean everything else.
    return html
      .replace(/<div[^>]*>/gi, "<p>")
      .replace(/<\/div>/gi, "</p>")
      .replace(/<(\w+)\s+[^>]*>/gi, "<$1>") // Strip all attributes from tags
      .replace(/<p>\s*<\/p>/gi, "") // Remove empty paragraphs
      .replace(/\s+/g, " ")
      .trim();
  }

  function scrapeDetailedVariants() {
    const options = [];
    querySelectorAllDeep(".variant-option, .variation, .product-option, .swatch-container, .picker-option, .attribute-group, .product-customizer", root).forEach(container => {
      const label = container.querySelector("label, .label, .option-name, .attr-label, .title")?.textContent?.trim().replace(/:$/, "");
      const selected = container.querySelector(".selected, .active, .is-selected, option:checked, [aria-checked=\"true\"]")?.textContent?.trim();
      if (label && selected && label.length < 30 && selected.length < 50) {
        options.push({ name: normalizeAttributeName(label), value: selected });
      }
    });
    return options.slice(0, 3);
  }

  function normalizeAttributeName(name) {
    const n = name.toLowerCase().trim();
    if (n.includes("color") || n.includes("colour") || n.includes("shade") || n.includes("finish")) return "Color";
    if (n.includes("size") || n.includes("dimension") || n.includes("fit")) return "Size";
    if (n.includes("material") || n.includes("fabric") || n.includes("composition")) return "Material";
    return name;
  }

  function scrapeWeight() {
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

  function scrapeDomProduct() {
    const title = textFromSelectors(["#productTitle", ".product-title", "h1.title", ".product-name h1", ".pdp-title", ".product-details__title", ".page-title", ".item-name"]);
    const price = textFromSelectors([".a-price .a-offscreen", ".price", ".product-price", ".current-price", ".price-item", ".price-sales", "[itemprop=\"price\"]", ".pdp-price", ".price-wrapper", ".regular-price"]);
    const images = attributeValues(["#landingImage", ".product-image img", "[data-testid=\"main-image\"] img", ".main-image", ".gallery-item img", ".swiper-slide img", ".product-image-photo", ".bh-main-image"], ["src", "data-src", "srcset", "data-original", "data-zoom-image"]);
    const uniqueImages = [...new Set(images.map(cleanImageUrl))].filter(Boolean);
    
    // Expert resolution
    const host = window.location.hostname;
    let expertData = {};
    if (host.includes("amazon")) expertData = EXPERT_HANDLERS.amazon();
    else if (host.includes("walmart")) expertData = EXPERT_HANDLERS.walmart();
    else if (document.querySelector('meta[content*="shopify"]')) expertData = EXPERT_HANDLERS.shopify();

    return mergeProductData(
      {
        title, price, 
        description: scrapeFullDescription(),
        image_url: uniqueImages[0] || "",
        additional_image_urls: uniqueImages.slice(1),
        variant_options: scrapeDetailedVariants(),
        variant_grams: scrapeWeight(),
        category: scrapeBreadcrumbs(),
        extraction_method: "Industrial-DOM-Heuristic"
      },
      expertData
    );
  }

  function mergeProductData(...products) {
    const merged = {};
    for (const p of products.reverse()) {
      for (const [k, v] of Object.entries(p || {})) if (hasMeaningfulValue(v)) merged[k] = v;
    }
    return merged;
  }

  function hasMeaningfulValue(v) { return Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && String(v).trim() !== ""); }
  function normalizeArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
  function normalizeType(t) { return normalizeArray(t).join(" ").toLowerCase(); }
  function firstObject(v) { const item = normalizeArray(v)[0]; return (item && typeof item === "object") ? item : {}; }

  function textFromSelectors(selectors) {
    for (const s of selectors) {
      const el = querySelectorDeep(s, root);
      const txt = el?.getAttribute("content") || el?.textContent || "";
      if (txt.trim()) return txt.trim();
    }
    return "";
  }

  function scrapeBreadcrumbs() {
    const selectors = [".breadcrumb", ".breadcrumbs", ".nav-breadcrumb", ".pdp-breadcrumbs", "[itemtype*=\"BreadcrumbList\"]"];
    for (const s of selectors) {
      const el = querySelectorDeep(s, root);
      if (el) {
        const items = [...el.querySelectorAll("li, a, span")].map(i => {
          const t = i.textContent?.trim() || "";
          return (t.length > 1 && !["/", ">", "|", "»", "\\"].includes(t)) ? t : null;
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
      for (const a of attrList) {
        const v = el.getAttribute(a);
        if (v) {
          if (a === "srcset") return v.split(",").pop().trim().split(" ")[0];
          return v;
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
    for (const sr of roots) {
      const target = querySelectorDeep(s, sr);
      if (target) return target;
    }
    return null;
  }

  const scriptState = findStateInScripts();
  const jsonLd = findJsonLdProducts();
  const nextData = findNextDataProducts();
  const microdata = findMicrodataProducts();
  const meta = { ...textFromSelectors(["meta[property=\"og:title\"]"]), extraction_method: "Meta" };
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
    source_url: window.location.href,
    source_tab_title: document.title,
    source_site: window.location.hostname,
    scraped_at: new Date().toISOString()
  }));
}