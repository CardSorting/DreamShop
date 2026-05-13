/**
 * persistence layer for DreamShop using chrome.storage.local
 */

const STORAGE_KEYS = {
  PRODUCTS: "ds_products",
  LOGS: "ds_logs"
};

export async function getStoredProducts() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PRODUCTS);
    return result[STORAGE_KEYS.PRODUCTS] || [];
  } catch (error) {
    console.error("Storage read failed:", error);
    return [];
  }
}

export async function saveProducts(products) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.PRODUCTS]: products });
    updateBadge(products.length);
  } catch (error) {
    console.error("Storage write failed:", error);
    throw new Error("Unable to save inventory. Storage might be full or restricted.");
  }
}

export async function addProducts(newProducts) {
  const current = await getStoredProducts();
  const deduped = dedupe([...current, ...newProducts]);
  await saveProducts(deduped);
  return deduped;
}

export async function removeProduct(product) {
  const current = await getStoredProducts();
  const key = product.source_url || `${product.title}|${product.price}`;
  const updated = current.filter((p) => {
    const pKey = p.source_url || `${p.title}|${p.price}`;
    return pKey !== key;
  });
  await saveProducts(updated);
}

export async function clearAllData() {
  try {
    await chrome.storage.local.clear();
    updateBadge(0);
  } catch (error) {
    console.error("Storage clear failed:", error);
  }
}

export async function getStoredLogs() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
    return result[STORAGE_KEYS.LOGS] || [];
  } catch (error) {
    return [];
  }
}

export async function addLog(message, type = "info") {
  try {
    const current = await getStoredLogs();
    const newLog = {
      message: String(message).slice(0, 500),
      type,
      timestamp: new Date().toISOString()
    };
    const updated = [newLog, ...current].slice(0, 100);
    await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: updated });
  } catch (error) {
    // Fail silently for logs to avoid infinite error loops
  }
}

function dedupe(products) {
  const seen = new Set();
  return products.filter((p) => {
    const key = p.source_url || `${p.title}|${p.price}|${p.sku}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function updateBadge(count) {
  try {
    const text = count > 0 ? (count > 999 ? "999+" : String(count)) : "";
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
  } catch (error) {
    // Badge update might fail if extension context is invalid
  }
}

