import { PRODUCT_CSV_COLUMNS, normalizeProductRecord, validateProductRecord } from "../domain/productRecord.js";
import { createTimestampedCsvFilename, serializeRowsToCsv } from "../utils/csv.js";
import { downloadTextFile, queryActiveTab, queryAllScrapableTabs, scrapeTab } from "../infrastructure/chromeTabs.js";

export async function scrapeActiveTabProducts(targetSelector = null) {
  const tabs = await queryActiveTab();
  return scrapeTabsToProductSet(tabs, targetSelector);
}

export async function scrapeAllOpenTabProducts() {
  const tabs = await queryAllScrapableTabs();
  return scrapeTabsToProductSet(tabs);
}

export function createGenericProductCsv(products) {
  const segments = [];
  const BATCH_SIZE = 500;
  
  // Add Header Segment
  segments.push(new Blob([PRODUCT_CSV_COLUMNS.join(",") + "\r\n"], { type: "text/csv" }));
  
  let currentBatch = [];
  for (let i = 0; i < products.length; i++) {
    const record = normalizeProductRecord(products[i]);
    const line = PRODUCT_CSV_COLUMNS.map((col) => {
      const val = String(record[col] ?? "");
      if (/[",\n\r]/.test(val)) {
        return `"${val.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/"/g, '""')}"`;
      }
      return val;
    }).join(",");
    
    currentBatch.push(line + "\r\n");
    
    // Periodically commit batch to an immutable Blob segment to free up JS heap
    if (currentBatch.length >= BATCH_SIZE) {
      segments.push(new Blob(currentBatch, { type: "text/csv" }));
      currentBatch = [];
    }
  }
  
  if (currentBatch.length > 0) {
    segments.push(new Blob(currentBatch, { type: "text/csv" }));
  }

  return segments;
}

export async function downloadGenericProductCsv(products) {
  // Directly pass segments to the downloader to avoid any concatenation in JS
  const segments = createGenericProductCsv(products);
  const settings = await chrome.storage.local.get({ filenameFormat: "timestamp" });
  
  let filename = "dreamshop_inventory.csv";
  if (settings.filenameFormat === "timestamp") {
    filename = createTimestampedCsvFilename("dreamshop_export");
  }
  
  return downloadTextFile(filename, segments);
}


async function scrapeTabsToProductSet(tabs, targetSelector = null) {
  if (!tabs.length) {
    return {
      products: [],
      warnings: ["No http/https tabs were available to scrape."],
      failures: []
    };
  }

  const products = [];
  const warnings = [];
  const failures = [];

  // Process tabs in batches of 5 to prevent resource exhaustion and browser crashes
  const batchSize = 5;
  for (let i = 0; i < tabs.length; i += batchSize) {
    const batch = tabs.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(tab => scrapeTab(tab, targetSelector)));

    for (const result of results) {
      if (!result.ok) {
        failures.push(formatTabMessage(result.tab, result.error));
        continue;
      }

      for (const rawProduct of result.products) {
        const product = normalizeProductRecord(rawProduct, {
          title: result.tab?.title || "",
          source_tab_title: result.tab?.title || "",
          source_url: result.tab?.url || ""
        });

        const validationWarnings = validateProductRecord(product);
        validationWarnings.forEach((warning) => warnings.push(formatTabMessage(result.tab, `${product.title || "Unknown"}: ${warning}`)));
        products.push(product);
      }
    }
  }

  return { products, warnings, failures };
}

function formatTabMessage(tab, message) {
  const title = tab?.title || tab?.url || "Unknown tab";
  return `${title}: ${message}`;
}