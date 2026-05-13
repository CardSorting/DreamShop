/**
 * persistence layer for DreamShop using chrome.storage.local
 */

const STORAGE_KEYS = {
  META: "ds_products_meta",
  BUCKET_PREFIX: "ds_products_b_",
  LOGS: "ds_logs"
};

const BUCKET_SIZE = 500;

/**
 * Sequential task queue to ensure atomic storage operations.
 * Prevents race conditions during simultaneous tab captures.
 */
let storageQueue = Promise.resolve();

async function enqueueStorageTask(task) {
  const result = storageQueue.then(task);
  storageQueue = result.catch(() => {});
  return result;
}

export async function getStoredProducts() {
  try {
    const meta = await chrome.storage.local.get(STORAGE_KEYS.META);
    const { count = 0, bucketCount = 0 } = meta[STORAGE_KEYS.META] || {};
    
    if (count === 0) return [];

    // Forensic Reassembly: Load all buckets and flatten
    const bucketKeys = Array.from({ length: bucketCount }, (_, i) => `${STORAGE_KEYS.BUCKET_PREFIX}${i}`);
    const results = await chrome.storage.local.get(bucketKeys);
    
    const products = [];
    for (let i = 0; i < bucketCount; i++) {
      const bucket = results[`${STORAGE_KEYS.BUCKET_PREFIX}${i}`] || [];
      products.push(...bucket);
    }
    return products;
  } catch (error) {
    console.error("Storage read failed:", error);
    return [];
  }
}

/**
 * Memory-Safe Generator for large datasets.
 * Yields products bucket-by-bucket to prevent heap exhaustion.
 */
export async function* getStoredProductsStream() {
  const meta = await chrome.storage.local.get(STORAGE_KEYS.META);
  const { bucketCount = 0 } = meta[STORAGE_KEYS.META] || {};
  
  for (let i = 0; i < bucketCount; i++) {
    const key = `${STORAGE_KEYS.BUCKET_PREFIX}${i}`;
    const result = await chrome.storage.local.get(key);
    yield result[key] || [];
  }
}

export async function saveProducts(products) {
  try {
    const deduped = dedupe(products);
    const bucketCount = Math.ceil(deduped.length / BUCKET_SIZE);
    
    // Clear old buckets first to prevent orphaned data
    const oldMeta = await chrome.storage.local.get(STORAGE_KEYS.META);
    const oldBucketCount = oldMeta[STORAGE_KEYS.META]?.bucketCount || 0;
    if (oldBucketCount > bucketCount) {
      const keysToRemove = Array.from({ length: oldBucketCount - bucketCount }, (_, i) => `${STORAGE_KEYS.BUCKET_PREFIX}${bucketCount + i}`);
      await chrome.storage.local.remove(keysToRemove);
    }

    const storageObject = {
      [STORAGE_KEYS.META]: {
        count: deduped.length,
        bucketCount,
        lastUpdated: new Date().toISOString()
      }
    };

    for (let i = 0; i < bucketCount; i++) {
      storageObject[`${STORAGE_KEYS.BUCKET_PREFIX}${i}`] = deduped.slice(i * BUCKET_SIZE, (i + 1) * BUCKET_SIZE);
    }

    await chrome.storage.local.set(storageObject);
    updateBadge(deduped.length);
  } catch (error) {
    console.error("Storage write failed:", error);
    throw new Error("Unable to save inventory. Storage might be full or restricted.");
  }
}

export async function addProducts(newProducts) {
  return enqueueStorageTask(async () => {
    const current = await getStoredProducts();
    await saveProducts([...current, ...newProducts]);
    return getStoredProducts(); // Return fresh state
  });
}

export async function removeProduct(product) {
  return enqueueStorageTask(async () => {
    const current = await getStoredProducts();
    const key = product.source_url || `${product.title}|${product.price}`;
    const updated = current.filter((p) => {
      const pKey = p.source_url || `${p.title}|${p.price}`;
      return pKey !== key;
    });
    await saveProducts(updated);
  });
}

export async function clearAllData() {
  return enqueueStorageTask(async () => {
    try {
      await chrome.storage.local.clear();
      updateBadge(0);
    } catch (error) {
      console.error("Storage clear failed:", error);
    }
  });
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
  return enqueueStorageTask(async () => {
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
  });
}

function dedupe(products) {
  const seen = new Set();
  return products.filter((p) => {
    // Identity key: URL + Title + Price + SKU + Variant
    const key = [
      p.source_url,
      p.title,
      p.price,
      p.sku,
      p.variant_name,
      p.variant_value
    ].filter(Boolean).join("|");
    
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

