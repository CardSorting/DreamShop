export function scrapeProductFromPage(targetSelector = null) {
  // Helpers are intentionally nested so chrome.scripting.executeScript can inject
  // this function as a self-contained page scraper.
  const root = targetSelector ? (document.querySelector(targetSelector) || document) : document;

  function findJsonLdProducts() {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    const spaScripts = [...document.querySelectorAll('script.ds-spa-data')];
    
    return [...scripts, ...spaScripts]
      .flatMap((script) => parseJsonLd(script.textContent || ""))
      .flatMap(expandJsonLdNode)
      .filter(isProductLike)
      .map(normalizeJsonLdProduct);
  }

  function findNextDataProducts() {
    const script = document.querySelector('script#__NEXT_DATA__');
    if (!script) return [];
    try {
      const data = JSON.parse(script.textContent);
      const product = data.props?.pageProps?.product;
      if (product) return [normalizeJsonLdProduct(product)];
    } catch (e) {}
    return [];
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

  function normalizeJsonLdProduct(data) {
    const offers = normalizeArray(data.offers);
    const primaryOffer = firstObject(offers);
    const aggregateRating = firstObject(data.aggregateRating);
    const brand = firstObject(data.brand);
    const imageValues = normalizeArray(data.image).map((image) => {
      if (typeof image === "string") return image;
      return image?.url || image?.contentUrl || "";
    });

    const shipping = firstObject(primaryOffer.shippingDetails)?.shippingRate?.value || "";
    const returnPolicy = firstObject(data.hasMerchantReturnPolicy)?.merchantReturnDays || "";

    return {
      title: data.name || "",
      description: data.description || "",
      price: primaryOffer.price || primaryOffer.lowPrice || data.price || "",
      currency: primaryOffer.priceCurrency || data.priceCurrency || "",
      compare_at_price: data.listPrice || "",
      shipping_price: shipping,
      return_policy: returnPolicy ? `${returnPolicy} days` : "",
      availability: primaryOffer.availability || data.availability || "",
      brand: brand.name || data.brand || "",
      vendor: firstObject(primaryOffer.seller).name || data.vendor || "",
      sku: data.sku || data.mpn || data.gtin || "",
      category: data.category || "",
      image_url: cleanImageUrl(imageValues[0] || ""),
      additional_image_urls: imageValues.slice(1).map(cleanImageUrl),
      rating: aggregateRating.ratingValue || "",
      review_count: aggregateRating.reviewCount || aggregateRating.ratingCount || "",
      variant_name: data.variantName || "",
      variant_value: data.variantValue || "",
      video_url: data.video?.contentUrl || data.video?.embedUrl || ""
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
        category: scrapeBreadcrumbs() || getProp("category"),
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
      category: scrapeBreadcrumbs(),
      image_url: cleanImageUrl(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || "")
    };
  }


  function scrapeDomProduct() {
    const title = textFromSelectors(["#productTitle", ".product-title", "h1.title", "[data-testid=\"product-title\"]"]);
    const price = textFromSelectors([".a-price .a-offscreen", ".price", "[data-testid=\"price\"]", ".product-price"]);
    
    const market = scrapeMarketplaceSpecific();
    
    const gallery = attributeValues([
      "#landingImage", 
      ".product-image img", 
      "[data-testid=\"product-image\"]", 
      ".main-image",
      ".gallery-item img",
      ".product-thumbnails img",
      ".thumb img"
    ], ["src", "data-src", "data-lazy-src", "srcset"]);

    const uniqueImages = [...new Set(gallery.map(cleanImageUrl))].filter(Boolean);

    return mergeProductData(
      { 
        title, 
        price, 
        image_url: uniqueImages[0] || "",
        additional_image_urls: uniqueImages.slice(1),
        specifications: scrapeSpecifications(),
        marketing_pixels: scrapeMarketingPixels(),
        seo_structure: scrapeSeoStructure(),
        ...scrapeContactAndSocial()

      },
      market
    );
  }

  function scrapeMarketingPixels() {
    const pixels = [];
    const html = document.documentElement.innerHTML;
    
    const patterns = [
      { name: "FB", regex: /fbq\('init',\s*'(\d+)'\)/ },
      { name: "GA", regex: /gtag\('config',\s*'(G-[A-Z0-9]+|UA-\d+-\d+)'\)/ },
      { name: "TikTok", regex: /ttq\.load\('([A-Z0-9]+)'\)/ },
      { name: "Pinterest", regex: /pintrk\('load',\s*'(\d+)'\)/ }
    ];

    patterns.forEach(p => {
      const match = html.match(p.regex);
      if (match) pixels.push(`${p.name}:${match[1]}`);
    });

    return pixels.join(" | ");
  }

  function scrapeSeoStructure() {
    const headers = [];
    querySelectorAllDeep("h1, h2, h3", root).forEach(h => {
      const text = h.textContent?.trim();
      if (text && text.length < 100) {
        headers.push(`${h.tagName}: ${text}`);
      }
    });
    return headers.slice(0, 10).join(" | ");
  }

  function scrapeContactAndSocial() {
    const contact = [];
    const social = [];
    
    const socialPatterns = [
      "facebook.com", "instagram.com", "twitter.com", "x.com", 
      "pinterest.com", "youtube.com", "tiktok.com", "linkedin.com"
    ];

    querySelectorAllDeep("a[href]", document).forEach(a => {
      const href = a.getAttribute("href") || "";
      
      if (href.startsWith("mailto:")) {
        contact.push(`Email:${href.replace("mailto:", "").split("?")[0]}`);
      } else if (href.startsWith("tel:")) {
        contact.push(`Tel:${href.replace("tel:", "").split("?")[0]}`);
      } else if (socialPatterns.some(p => href.includes(p))) {
        social.push(href);
      }
    });

    return {
      contact_info: [...new Set(contact)].slice(0, 5).join(" | "),
      social_links: [...new Set(social)].slice(0, 8).join(" | ")
    };
  }


  function scrapeMarketplaceSpecific() {
    const host = window.location.hostname;
    
    const registry = {
      "amazon": {
        title: ["#productTitle"],
        price: [".a-price .a-offscreen", "#priceblock_ourprice", "#priceblock_dealprice"],
        brand: ["#bylineInfo", "#brand"],
        sku: ["#ASIN"]
      },
      "walmart": {
        title: ["h1[itemprop=\"name\"]"],
        price: ["[data-testid=\"item-price\"]", ".price-characteristic"],
        brand: [".brand-name"]
      },
      "etsy": {
        title: [".wt-text-title-03"],
        price: [".wt-text-title-03 .currency-value", ".wt-display-flex-xs .wt-text-title-03"],
        brand: [".wt-text-caption"]
      }
    };

    const site = Object.keys(registry).find(key => host.includes(key));
    if (!site) return {};

    const config = registry[site];
    const data = {};
    for (const [key, selectors] of Object.entries(config)) {
      data[key] = textFromSelectors(selectors);
    }
    return data;
  }


  function scrapeSpecifications() {
    const specs = [];
    
    // Scrape tables
    querySelectorAllDeep("table", root).forEach(table => {
      const rows = [...table.querySelectorAll("tr")];
      rows.forEach(row => {
        const cells = [...row.querySelectorAll("td, th")];
        if (cells.length >= 2) {
          const key = cells[0].textContent?.trim().replace(/:$/, "");
          const val = cells.slice(1).map(c => c.textContent?.trim()).join(" ").trim();
          if (key && val && key.length < 50) specs.push(`${key}: ${val}`);
        }
      });
    });

    // Scrape definition lists
    querySelectorAllDeep("dl", root).forEach(dl => {
      const dts = [...dl.querySelectorAll("dt")];
      dts.forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === "DD") {
          const key = dt.textContent?.trim().replace(/:$/, "");
          const val = dd.textContent?.trim();
          if (key && val && key.length < 50) specs.push(`${key}: ${val}`);
        }
      });
    });

    return specs.join(" | ");
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

  function scrapeBreadcrumbs() {

    const selectors = [
      ".breadcrumb", ".breadcrumbs", ".nav-breadcrumb", 
      "[class*=\"breadcrumb\"]", "[itemtype*=\"BreadcrumbList\"]"
    ];
    for (const selector of selectors) {
      const el = querySelectorDeep(selector, root);
      if (el) {
        const items = [...el.querySelectorAll("li, a, span")].map(i => i.textContent?.trim()).filter(Boolean);
        // Deduplicate adjacent identical items and filter out separators like / or >
        const cleanItems = items.filter((item, idx) => {
          if (["/", ">", "|", "»"].includes(item)) return false;
          return item !== items[idx - 1];
        });
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
      let clean = url;
      // Strip common resizing suffixes for high-res versions
      clean = clean.replace(/(_\d+x\d+|_thumb|_small|-150x150|-300x300)(\.[a-z]+)$/i, "$2");
      
      const u = new URL(clean, window.location.href);
      ["v", "width", "height", "quality", "size", "resize"].forEach(p => u.searchParams.delete(p));
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

  // Strategy prioritization: 
  // 1. JSON-LD / SPA Data (Highest confidence)
  // 2. Microdata
  // 3. Meta Tags
  // 4. DOM Heuristics (Fallback)

  const jsonLd = findJsonLdProducts();
  const nextData = findNextDataProducts();
  const microdata = findMicrodataProducts();
  const meta = scrapeMetaProduct();
  const dom = scrapeDomProduct();

  // If we found multiple products via structured data, prioritize those
  let products = [];
  if (jsonLd.length > 0) {
    products = jsonLd;
  } else if (nextData.length > 0) {
    products = nextData;
  } else if (microdata.length > 0) {
    products = microdata;
  } else {
    // Single product fallback
    const merged = mergeProductData(dom, meta, firstObject(microdata), firstObject(nextData), firstObject(jsonLd));
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