import { cleanImageUrl, normalizeType, normalizeArray, firstObject } from './utils.js';

export const genericScraper = {
  findJsonLdProducts: () => {
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
  },

  findMicrodataProducts: () => {
    const products = [];
    const items = document.querySelectorAll('[itemscope][itemtype*="Product"]');
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
};

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
    brand: brand.name || data.brand || "",
    vendor: firstObject(primaryOffer.seller).name || data.vendor || "",
    sku: data.sku || data.mpn || data.gtin || data.productId || "",
    image_url: cleanImageUrl(imageValues[0] || ""),
    additional_image_urls: imageValues.slice(1).map(cleanImageUrl),
    variant_options: data.variant_options || []
  };
}
