export function scrapeProductFromPage(targetSelector = null) {
  // Helpers are intentionally nested so chrome.scripting.executeScript can inject
  // this function as a self-contained page scraper.
  const root = targetSelector ? (document.querySelector(targetSelector) || document) : document;

  /**
   * THE EXPERT SYSTEM V4: Site-specific extraction logic
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
    },
    ebay: () => {
      const title = textFromSelectors([".x-item-title__mainTitle", "h1.vi-title-main"]);
      const price = textFromSelectors([".x-price-primary", "#prcIsum", ".bin-price-content", ".vi-price-main"]);
      const images = attributeValues(["#icImg", ".x-photos img", ".itm-img"], ["src", "data-src"]);
      return { title, price, image_url: cleanImageUrl(images[0]), extraction_method: "Expert-eBay" };
    },
    etsy: () => {
      const title = textFromSelectors([".wt-text-title-03", "h1", "[data-buy-box-listing-title]"]);
      const price = textFromSelectors([".wt-text-title-03 .currency-value", ".wt-display-flex-xs .wt-text-title-03", "[data-buy-box-price]"]);
      const images = attributeValues([".wt-max-width-full", ".image-carousel img", "[data-listing-image-gallery] img"], ["src", "data-src", "data-full-image-href"]);
      return { title, price, image_url: cleanImageUrl(images[0]), extraction_method: "Expert-Etsy" };
    },
    aliexpress: () => {
      // AliExpress often stores massive JSON in window.runParams, _pdp_data_, or __pdpData__
      const state = findStateInScripts("AliExpress");
      const d = state?._raw_data || state; // Access raw data if available for deep mapping
      
      // Modern AliExpress selectors (2024/2025)
      const title = textFromSelectors([
        ".product-title-text", 
        "h1[data-pl=\"product-title\"]",
        ".pdp-info-right .product-title",
        "h1", 
        ".product-name"
      ]);
      
      const price = textFromSelectors([
        ".product-price-value", 
        ".price--currentPriceText--V8_y_b5",
        ".uniform-banner-box-price", 
        ".price-current",
        "[data-pl=\"product-price\"]"
      ]);
      
      const images = attributeValues([
        ".mag-magnifier-container img", 
        ".product-main-img img", 
        ".video-container img", 
        ".slider-img img",
        ".pdp-info-left .img-container img",
        ".image-view-magnifier-main-img",
        ".gallery--image--V8_y_b5"
      ], ["src", "srcset", "data-src"]);

      const specs = scrapeSpecifications();
      const variants = extractAliExpressVariants(d);
      const shipping = textFromSelectors([".shipping-info", ".product-shipping-price", ".delivery--shipping--V8_y_b5", ".shipping-link"]);
      const seller = d.sellerComponent || d.storeModule || d.sellerModule || {};
      const feedback = d.feedbackComponent || d.commonModule || {};
      const video = d.videoComponent || d.imageModule?.videoDetail || {};
      const delivery = d.deliveryComponent || d.shippingModule || {};
      const shippingInfo = delivery.shippingList?.[0] || delivery.shippingList?.[0]?.serviceInfo || {};
      
      return mergeProductData(
        { 
          title, 
          price, 
          image_url: cleanImageUrl(images[0]), 
          additional_image_urls: images.slice(1).map(cleanImageUrl),
          specifications: specs,
          variant_matrix: variants,
          shipping_cost: shipping,
          shipping_method: shippingInfo.shippingMethod || shippingInfo.serviceName || "",
          estimated_delivery: shippingInfo.deliveryTime || shippingInfo.minDate || "",
          variant_grams: parseWeightFromSpecs(specs) || scrapeWeight(),
          brand: specs["Brand"] || specs["Brand Name"] || "",
          vendor: seller.storeName || seller.sellerName || "",
          vendor_url: seller.storeNum ? `https://www.aliexpress.com/store/${seller.storeNum}` : (seller.storeUrl || ""),
          rating: feedback.starRating || feedback.averageStar || 0,
          review_count: feedback.reviewCount || 0,
          sold_count: d.productInfoComponent?.tradeCount || d.tradeCount || 0,
          min_quantity: d.inventoryComponent?.minQuantity || 1,
          max_quantity: d.inventoryComponent?.maxQuantity || 999,
          video_url: video.videoUrl || video.mediaUrl || "",
          description_url: d.productDetailComponent?.descriptionUrl || "",
          currency_code: price.currencyCode || d.currency || "",
          raw_price: parseFloat(String(price.formatPrice || price).replace(/[^0-9.]/g, "")) || 0,
          extraction_method: "Expert-AliExpress-Titan" 
        },
        state || {}
      );
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

  function findMicrodataProducts() {
    const products = [];
    const items = querySelectorAllDeep('[itemscope][itemtype*="Product"]', root);
    items.forEach(item => {
      const getProp = (p) => item.querySelector(`[itemprop="${p}"]`)?.getAttribute("content") || item.querySelector(`[itemprop="${p}"]`)?.textContent?.trim();
      const priceEl = item.querySelector('[itemprop="price"]');
      const currencyEl = item.querySelector('[itemprop="priceCurrency"]');
      
      products.push({
        title: getProp("name"),
        description: getProp("description"),
        price: getProp("price") || priceEl?.getAttribute("content") || priceEl?.textContent?.trim(),
        currency: getProp("priceCurrency") || currencyEl?.getAttribute("content") || currencyEl?.textContent?.trim(),
        brand: getProp("brand"),
        sku: getProp("sku") || getProp("productID"),
        image_url: cleanImageUrl(getProp("image")),
        extraction_method: "Microdata"
      });
    });
    return products.filter(p => p.title || p.price);
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
      { name: "PreloadedState", regex: /window\.__PRELOADED_STATE__\s*=\s*({.*?});/s },
      { name: "AliExpress", regex: /window\.(?:runParams|_pdp_data_|_pdpData__|__pdpData__)\s*=\s*({.*?});/s },
      { name: "Omni", regex: /(?:var|window|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*({)/ }
    ];

    for (const script of scripts) {
      const content = script.textContent;
      for (const pattern of patterns) {
        if (targetName && pattern.name !== targetName) continue;
        
        let jsonStr = null;
        if (pattern.name === "Omni") {
           // Titan Omni-Pass: Scans for any variable assignment that looks like a product state
           const matches = [...content.matchAll(new RegExp(pattern.regex, "g"))];
           for (const m of matches) {
             const candidate = extractObjectFromJs(content, m[1]);
             if (candidate && (candidate.includes("product") || candidate.includes("sku") || candidate.includes("price"))) {
               try {
                 const parsed = JSON.parse(candidate);
                 const product = locateProductInObject(parsed);
                 if (product) return { ...normalizeJsonLdProduct(product), _raw_data: parsed, extraction_method: "Omni-State-Discovery" };
               } catch (e) {}
             }
           }
           continue;
        }

        const match = content.match(pattern.regex);
        if (match) {
           // Industrial Brace Balancer: Handles cases where regex is too greedy or script is complex
           jsonStr = extractObjectFromJs(content, match[0].split("=")[0]);
        }

        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            const product = locateProductInObject(parsed);
            if (product) return { ...normalizeJsonLdProduct(product), _raw_data: parsed, extraction_method: `State-${pattern.name}` };
            
            // Specialized AliExpress mapping
            if (pattern.name === "AliExpress") {
              const d = parsed.data || parsed;
              const product = d.productInfoComponent || d.actionModule || d.item || {};
              const price = d.priceComponent || d.priceModule || {};
              const image = d.imageComponent || d.imageModule || {};
              const seller = d.sellerComponent || d.storeModule || {};
              return {
                title: product.subject || product.title || d.title || d.subject,
                price: price.formatPrice || price.origPrice?.formattedPrice || price.formatedPrice || d.price,
                currency: price.currencyCode || d.currency,
                image_url: image.imagePathList?.[0] || image.mainImage || d.image_url,
                sku: product.productId || d.id || d.sku,
                vendor: seller.storeName || seller.sellerName || "",
                description: d.productDetailComponent?.description || d.description,
                _raw_data: d,
                extraction_method: "State-AliExpress-Balancing"
              };
            }
          } catch (e) {}
        }
      }
    }
    return null;
  }

  function extractObjectFromJs(content, startKeyword) {
    const startIdx = content.indexOf(startKeyword);
    if (startIdx === -1) return null;
    const jsonStart = content.indexOf("{", startIdx);
    if (jsonStart === -1) return null;
    
    let depth = 0, inString = false, escape = false;
    for (let i = jsonStart; i < content.length; i++) {
      const char = content[i];
      if (char === "\"" && !escape) inString = !inString;
      if (!inString) {
        if (char === "{") depth++;
        else if (char === "}") {
          depth--;
          if (depth === 0) return content.substring(jsonStart, i + 1);
        }
      }
      escape = (char === "\\" && !escape);
    }
    return null;
  }

  function locateProductInObject(obj) {
    if (!obj || typeof obj !== "object") return null;
    if ((obj.title || obj.name || obj.subject) && (obj.price || obj.offers || obj.priceComponent)) return obj;
    if (obj.product) return obj.product;
    if (obj.props?.pageProps?.product) return obj.props.pageProps.product;
    if (obj.props?.initialData?.product) return obj.props.initialData.product;
    
    const keys = ["product", "item", "pdp", "initialData", "entry", "listing", "productInfoComponent"];
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
      title: data.name || data.title || data.subject || "",
      description: data.description || "",
      price: primaryOffer.price || primaryOffer.lowPrice || data.price || "",
      currency: primaryOffer.priceCurrency || data.priceCurrency || "",
      compare_at_price: data.listPrice || data.compare_at_price || "",
      availability: primaryOffer.availability || data.availability || "",
      brand: brand.name || data.brand || "",
      vendor: firstObject(primaryOffer.seller).name || data.vendor || "",
      sku: data.sku || data.mpn || data.gtin || data.productId || "",
      category: data.category || "",
      image_url: cleanImageUrl(imageValues[0] || ""),
      additional_image_urls: imageValues.slice(1).map(cleanImageUrl),
      variant_options: data.variant_options || []
    };
  }

  function extractAliExpressVariants(data) {
    if (!data?.skuComponent) return [];
    const props = data.skuComponent.productSKUPropertyList || [];
    const skus = data.skuComponent.skuList || [];
    
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
      return variant;
    });
  }

  function scrapeSpecifications() {
    const specs = {};
    const selectors = [".product-prop", ".specification--prop--V8_y_b5", ".pdp-specs-item", ".ux-layout-section--specification .ux-labels-values", ".product-specs li", "tr.product-property"];
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

  function scrapeFullDescription() {
    const selectors = ["#productDescription", "#description", ".product-description", ".description", ".product-info-main", ".pdp-about-item", "#tab-description", ".product-details__description", ".listing-page-description", ".detail-desc-decorate-richtext"];
    let html = "";
    selectors.forEach(s => {
      const el = querySelectorDeep(s, root);
      if (el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("script, style, button, input, svg, noscript, iframe, link, .social-sharing, .wt-display-none").forEach(e => e.remove());
        html += clone.innerHTML.trim() + " ";
      }
    });
    return sanitizeHtmlForShopify(html.trim());
  }

  function sanitizeHtmlForShopify(html) {
    if (!html) return "";
    return html
      .replace(/<div[^>]*>/gi, "<p>")
      .replace(/<\/div>/gi, "</p>")
      .replace(/<(\w+)\s+[^>]*>/gi, "<$1>") 
      .replace(/<p>\s*<\/p>/gi, "") 
      .replace(/\s+/g, " ")
      .trim();
  }

  function scrapeDetailedVariants() {
    const options = [];
    querySelectorAllDeep(".variant-option, .variation, .product-option, .swatch-container, .picker-option, .attribute-group, .product-customizer, .wt-select, .sku-property", root).forEach(container => {
      const label = container.querySelector("label, .label, .option-name, .attr-label, .title, .sku-title")?.textContent?.trim().replace(/:$/, "");
      const selected = container.querySelector(".selected, .active, .is-selected, option:checked, [aria-checked=\"true\"]")?.textContent?.trim();
      if (label && selected && label.length < 30 && selected.length < 50) {
        options.push({ name: normalizeAttributeName(label), value: selected });
      }
    });
    return options.slice(0, 3);
  }

  function normalizeAttributeName(name) {
    const n = name.toLowerCase().trim();
    if (n.includes("color") || n.includes("colour") || n.includes("shade") || n.includes("finish") || n.includes("coloris")) return "Color";
    if (n.includes("size") || n.includes("dimension") || n.includes("fit") || n.includes("talla")) return "Size";
    if (n.includes("material") || n.includes("fabric") || n.includes("composition") || n.includes("matière")) return "Material";
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
    const title = textFromSelectors(["#productTitle", ".product-title", "h1.title", ".product-name h1", ".pdp-title", ".product-details__title", ".page-title", ".item-name", "[data-listing-title]", ".product-title-text"]);
    const price = textFromSelectors([".a-price .a-offscreen", ".price", ".product-price", ".current-price", ".price-item", ".price-sales", "[itemprop=\"price\"]", ".pdp-price", ".price-wrapper", ".regular-price", ".wt-text-title-03 .currency-value", ".product-price-value"]);
    const images = attributeValues(["#landingImage", ".product-image img", "[data-testid=\"main-image\"] img", ".main-image", ".gallery-item img", ".swiper-slide img", ".product-image-photo", ".bh-main-image", ".wt-max-width-full", ".mag-magnifier-container img"], ["src", "data-src", "srcset", "data-original", "data-zoom-image", "data-full-image-href"]);
    const uniqueImages = [...new Set(images.map(cleanImageUrl))].filter(Boolean);
    
    // Expert resolution
    const host = window.location.hostname;
    let expertData = {};
    if (host.includes("amazon")) expertData = EXPERT_HANDLERS.amazon();
    else if (host.includes("walmart")) expertData = EXPERT_HANDLERS.walmart();
    else if (host.includes("ebay")) expertData = EXPERT_HANDLERS.ebay();
    else if (host.includes("etsy")) expertData = EXPERT_HANDLERS.etsy();
    else if (host.includes("aliexpress")) expertData = EXPERT_HANDLERS.aliexpress();
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
        specifications: scrapeSpecifications(),
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
    const selectors = [".breadcrumb", ".breadcrumbs", ".nav-breadcrumb", ".pdp-breadcrumbs", ".pdp-breadcrumb", "[itemtype*=\"BreadcrumbList\"]", ".wt-action-group", ".bread-crumb"];
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
      // Nuclear AliExpress Suffix Stripper: Handles modern multi-layered obfuscation (_640.jpg_.webp)
      clean = clean.replace(/(\.(?:jpg|jpeg|png|webp))_[\s\S]*$/i, "$1");
      // Forensic Cleaning fallback for other sites
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