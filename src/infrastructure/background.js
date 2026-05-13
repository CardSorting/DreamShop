import { getStoredProducts, addProducts } from "./storage.js";
import { scrapeActiveTabProducts } from "../core/productExportCoordinator.js";

chrome.runtime.onInstalled.addListener(async () => {
  const products = await getStoredProducts();
  const text = products.length > 0 ? String(products.length) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
  refreshContextMenu();
});

async function refreshContextMenu() {
  if (!chrome.contextMenus) return; // Defensive hardening

  const settings = await chrome.storage.local.get({ enableContextMenu: true });
  chrome.contextMenus.removeAll();
  
  if (settings.enableContextMenu) {
    chrome.contextMenus.create({
      id: "capture-page",
      title: "Capture Products from this Page",
      contexts: ["page"]
    });
  }
}

chrome.contextMenus?.onClicked?.addListener(async (info, tab) => {
  if (info.menuItemId === "capture-page") {
    chrome.tabs.sendMessage(tab.id, { action: "trigger-background-capture" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "update-badge") {
    const text = message.count > 0 ? String(message.count) : "";
    chrome.action.setBadgeText({ text });
    sendResponse({ ok: true });
    return;
  }

  if (message.action === "refresh-context-menu") {
    refreshContextMenu();
    sendResponse({ ok: true });
    return;
  }

  if (message.action === "perform-capture") {
    // Run the capture coordination logic
    scrapeActiveTabProducts(message.targetSelector).then(async (result) => {
      if (result.products.length > 0) {
        await addProducts(result.products);
        sendResponse({ success: true, count: result.products.length });
      } else {
        sendResponse({ success: false, error: "No products found" });
      }
    }).catch(err => {
      sendResponse({ success: false, error: err?.message || "Internal engine failure" });
    });
    return true; // Keep channel open for async response
  }
});
