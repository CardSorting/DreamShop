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

import { getStoredProductsStream } from "../infrastructure/storage.js";

export async function downloadGenericProductCsv(providedProducts = null) {
  const segments = [];
  
  // Add Header Segment
  segments.push(new Blob([PRODUCT_CSV_COLUMNS.join(",") + "\r\n"], { type: "text/csv" }));
  
  const processBatch = (batch) => {
    const lines = batch.map(rawProduct => {
      const record = normalizeProductRecord(rawProduct);
      return PRODUCT_CSV_COLUMNS.map((col) => {
        const val = String(record[col] ?? "");
        if (/[",\n\r]/.test(val)) {
          return `"${val.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/"/g, '""')}"`;
        }
        return val;
      }).join(",") + "\r\n";
    });
    segments.push(new Blob(lines, { type: "text/csv" }));
  };

  if (providedProducts) {
    // Legacy support for provided arrays
    for (let i = 0; i < providedProducts.length; i += 500) {
      processBatch(providedProducts.slice(i, i + 500));
    }
  } else {
    // Forensic Streaming: Read buckets one by one from storage
    const stream = getStoredProductsStream();
    for await (const bucket of stream) {
      processBatch(bucket);
    }
  }

  const settings = await chrome.storage.local.get({ filenameFormat: "timestamp" });
  let filename = createTimestampedCsvFilename("dreamshop_export");
  
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