import { PRODUCT_CSV_COLUMNS, normalizeProductRecord, validateProductRecord } from "../domain/productRecord.js";
import { createTimestampedCsvFilename, serializeRowsToCsv } from "../utils/csv.js";
import { downloadTextFile, queryActiveTab, queryAllScrapableTabs, scrapeTab } from "../infrastructure/chromeTabs.js";

export async function scrapeActiveTabProducts() {
  const tabs = await queryActiveTab();
  return scrapeTabsToProductSet(tabs);
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
  const filename = createTimestampedCsvFilename();
  return downloadTextFile(filename, csv);
}

async function scrapeTabsToProductSet(tabs) {
  if (!tabs.length) {
    return {
      products: [],
      warnings: ["No http/https tabs were available to scrape."],
      failures: []
    };
  }

  const results = await Promise.all(tabs.map(scrapeTab));
  const products = [];
  const warnings = [];
  const failures = [];

  for (const result of results) {
    if (!result.ok) {
      failures.push(formatTabMessage(result.tab, result.error));
      continue;
    }

    const product = normalizeProductRecord(result.product, {
      title: result.tab?.title || "",
      source_tab_title: result.tab?.title || "",
      source_url: result.tab?.url || ""
    });

    const validationWarnings = validateProductRecord(product);
    validationWarnings.forEach((warning) => warnings.push(formatTabMessage(result.tab, warning)));
    products.push(product);
  }

  return { products, warnings, failures };
}

function formatTabMessage(tab, message) {
  const title = tab?.title || tab?.url || "Unknown tab";
  return `${title}: ${message}`;
}