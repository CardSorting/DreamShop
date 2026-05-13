/**
 * persistence layer for DreamShop using chrome.storage.local
 */

const STORAGE_KEYS = {
  PRODUCTS: "ds_products",
  LOGS: "ds_logs"
};

export async function getStoredProducts() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PRODUCTS);
  return result[STORAGE_KEYS.PRODUCTS] || [];
}

export async function saveProducts(products) {
  await chrome.storage.local.set({ [STORAGE_KEYS.PRODUCTS]: products });
  updateBadge(products.length);
}

export async function addProducts(newProducts) {
  const current = await getStoredProducts();
  const deduped = dedupe([...current, ...newProducts]);
  await saveProducts(deduped);
  return deduped;
}

export async function clearAllData() {
  await chrome.storage.local.clear();
  updateBadge(0);
}

export async function getStoredLogs() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
  return result[STORAGE_KEYS.LOGS] || [];
}

export async function addLog(message, type = "info") {
  const current = await getStoredLogs();
  const newLog = {
    message,
    type,
    timestamp: new Date().toISOString()
  };
  const updated = [newLog, ...current].slice(0, 50);
  await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: updated });
}

function dedupe(products) {
  const seen = new Set();
  return products.filter((p) => {
    const key = p.source_url || `${p.title}|${p.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function updateBadge(count) {
  const text = count > 0 ? String(count) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
}
