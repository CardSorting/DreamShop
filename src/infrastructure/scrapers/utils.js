/**
 * DreamShop Scraping Utilities
 * High-fidelity DOM traversal and data normalization helpers.
 */

export function textFromSelectors(selectors, root = document) {
  for (const s of selectors) {
    const el = querySelectorDeep(s, root);
    const txt = el?.getAttribute("content") || el?.textContent || "";
    if (txt.trim()) return txt.trim();
  }
  return "";
}

export function attributeValues(selectors, attrs, root = document) {
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

export function cleanImageUrl(url) {
  if (!url) return "";
  try {
    let clean = url.startsWith("//") ? window.location.protocol + url : url;
    
    // Nuclear AliExpress Suffix Stripper
    clean = clean.replace(/(\.(?:jpg|jpeg|png|webp))_[\s\S]*$/i, "$1");
    
    // Forensic Cleaning fallback for other sites
    clean = clean.replace(/(_(?:\d+x\d+|Q\d+|thumb|small|AC_SS\d+|AC_UY\d+|SL\d+|SR\d+,\d+)+)(\.[a-z]+)$/i, "$2").replace(/(\?|&)v=\d+/, "");
    
    const u = new URL(clean, window.location.href);
    ["v", "width", "height", "quality", "size", "resize", "impolicy", "imwidth"].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch (_e) { return url; }
}

export function querySelectorAllDeep(s, r = document) {
  const elements = [...r.querySelectorAll(s)];
  const roots = [...r.querySelectorAll("*")].map(el => el.shadowRoot).filter(Boolean);
  for (const sr of roots) elements.push(...querySelectorAllDeep(s, sr));
  return elements;
}

export function querySelectorDeep(s, r = document) {
  const el = r.querySelector(s);
  if (el) return el;
  const roots = [...r.querySelectorAll("*")].map(el => el.shadowRoot).filter(Boolean);
  for (const sr of roots) {
    const target = querySelectorDeep(s, sr);
    if (target) return target;
  }
  return null;
}

export function mergeProductData(...products) {
  const merged = {};
  for (const p of products.reverse()) {
    for (const [k, v] of Object.entries(p || {})) if (hasMeaningfulValue(v)) merged[k] = v;
  }
  return merged;
}

export function hasMeaningfulValue(v) { 
  return Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && String(v).trim() !== ""); 
}

export function normalizeArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

export function normalizeType(t) { return normalizeArray(t).join(" ").toLowerCase(); }

export function firstObject(v) { 
  const item = normalizeArray(v)[0]; 
  return (item && typeof item === "object") ? item : {}; 
}

export function extractObjectFromJs(content, startIdx) {
  if (startIdx === undefined || startIdx === -1 || !content) return null;
  const jsonStart = content.indexOf("{", startIdx);
  if (jsonStart === -1) return null;
  
  let depth = 0, inString = false, stringChar = null, escape = false;
  for (let i = jsonStart; i < content.length; i++) {
    const char = content[i];
    
    if (!escape) {
      if ((char === "\"" || char === "'" || char === "`") && !inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && inString) {
        inString = false;
        stringChar = null;
      }
    }

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

export function sanitizeHtmlForShopify(html) {
  if (!html) return "";
  return html
    .replace(/<div[^>]*>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>")
    .replace(/<(\w+)\s+[^>]*>/gi, "<$1>") 
    .replace(/<p>\s*<\/p>/gi, "") 
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAttributeName(name) {
  const n = name.toLowerCase().trim();
  if (n.includes("color") || n.includes("colour") || n.includes("shade") || n.includes("finish") || n.includes("coloris")) return "Color";
  if (n.includes("size") || n.includes("dimension") || n.includes("fit") || n.includes("talla")) return "Size";
  if (n.includes("material") || n.includes("fabric") || n.includes("composition") || n.includes("matière")) return "Material";
  return name;
}

export function scrapeBreadcrumbs(root = document) {
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

export function scrapeSpecifications(root = document) {
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

export function parseWeightFromSpecs(specs) {
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

export function findStateInScripts(patterns, targetName = null) {
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
          try {
            // Attempt standard JSON first
            return { parsed: JSON.parse(jsonStr), name: pattern.name };
          } catch (e) {
            // Fallback for JS object literals: quote keys and remove trailing commas
            try {
              const fixed = jsonStr
                .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":')
                .replace(/,\s*([}\]])/g, '$1');
              return { parsed: JSON.parse(fixed), name: pattern.name };
            } catch (e2) {}
          }
        }
      }
    }
  }
  return null;
}
export function scrapeWeight(root = document) {
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
