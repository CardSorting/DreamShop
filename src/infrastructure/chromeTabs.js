import { scrapeProductFromPage } from "./contentProductScraper.js";

const SCRAPABLE_URL_PATTERN = /^https?:\/\//i;

export async function queryActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return filterScrapableTabs(tabs).slice(0, 1);
}

export async function queryAllScrapableTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return filterScrapableTabs(tabs);
}

export async function scrapeTab(tab, targetSelector = null) {
  if (!tab?.id) {
    return {
      ok: false,
      tab,
      error: "Tab has no accessible id."
    };
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeProductFromPage,
      args: [targetSelector]
    });

    const scriptResults = result?.result || [];
    const products = (Array.isArray(scriptResults) ? scriptResults : [scriptResults]).filter(Boolean);

    return {
      ok: true,
      tab,
      products: products.map(p => ({
        ...p,
        source_url: tab.url || p.source_url || "",
        source_tab_title: tab.title || p.source_tab_title || ""
      }))
    };


  } catch (error) {
    return {
      ok: false,
      tab,
      error: error?.message || "Unable to scrape this tab."
    };
  }
}

export async function downloadTextFile(filename, content, mimeType = "text/csv;charset=utf-8") {
  // Use array-based Blob constructor for memory efficiency
  const blobContent = Array.isArray(content) ? content : [content];
  const blob = new Blob(blobContent, { type: mimeType });
  const url = URL.createObjectURL(blob);

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: true
    });

    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return downloadId;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function filterScrapableTabs(tabs) {
  return tabs.filter((tab) => SCRAPABLE_URL_PATTERN.test(tab.url || ""));
}