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
  return serializeRowsToCsv(products, PRODUCT_CSV_COLUMNS);
}

export async function downloadGenericProductCsv(products) {
  const csv = createGenericProductCsv(products);
  const settings = await chrome.storage.local.get({ filenameFormat: "timestamp" });
  
  let filename = "dreamshop_inventory.csv";
  if (settings.filenameFormat === "timestamp") {
    filename = createTimestampedCsvFilename("dreamshop_export");
  }
  
  return downloadTextFile(filename, csv);
}


async function scrapeTabsToProductSet(tabs, targetSelector = null) {
  if (!tabs.length) {
    return {
      products: [],
      warnings: ["No http/https tabs were available to scrape."],
      failures: []
    };
  }

  const results = await Promise.all(tabs.map(tab => scrapeTab(tab, targetSelector)));
  const products = [];
  const warnings = [];
  const failures = [];

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


  return { products, warnings, failures };
}

function formatTabMessage(tab, message) {
  const title = tab?.title || tab?.url || "Unknown tab";
  return `${title}: ${message}`;
}