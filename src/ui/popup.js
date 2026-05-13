import { downloadGenericProductCsv, scrapeActiveTabProducts, scrapeAllOpenTabProducts } from "../core/productExportCoordinator.js";
import { getStoredProducts, addProducts, clearAllData, getStoredLogs, addLog } from "../infrastructure/storage.js";

const state = {
  products: [],
  logs: [],
  busy: false,
  activeTab: "capture"
};

const elements = {
  tabCapture: document.querySelector("#tabCapture"),
  tabInventory: document.querySelector("#tabInventory"),
  captureView: document.querySelector("#captureView"),
  inventoryView: document.querySelector("#inventoryView"),
  scrapeActiveButton: document.querySelector("#scrapeActiveButton"),
  scrapeAllButton: document.querySelector("#scrapeAllButton"),
  downloadButton: document.querySelector("#downloadButton"),
  clearButton: document.querySelector("#clearButton"),
  statusText: document.querySelector("#statusText"),
  recordCount: document.querySelector("#recordCount"),
  previewList: document.querySelector("#previewList"),
  messageList: document.querySelector("#messageList"),
  totalRows: document.querySelector("#totalRows"),
  sourceCount: document.querySelector("#sourceCount"),
  messageToggle: document.querySelector("#messageToggle"),
  logsOverlay: document.querySelector("#logsOverlay"),
  closeLogs: document.querySelector("#closeLogs"),
  searchInput: document.querySelector("#searchInput")
};

// Event Listeners
elements.tabCapture.addEventListener("click", () => switchTab("capture"));
elements.tabInventory.addEventListener("click", () => switchTab("inventory"));
elements.scrapeActiveButton.addEventListener("click", () => runScrape(scrapeActiveTabProducts, "Analyzing active tab..."));
elements.scrapeAllButton.addEventListener("click", () => runScrape(scrapeAllOpenTabProducts, "Scanning all open tabs..."));
elements.downloadButton.addEventListener("click", downloadCsv);
elements.clearButton.addEventListener("click", clearProducts);
elements.messageToggle.addEventListener("click", () => elements.logsOverlay.classList.toggle("active"));
elements.closeLogs.addEventListener("click", () => elements.logsOverlay.classList.remove("active"));
elements.searchInput.addEventListener("input", () => render());


// Initialize
(async () => {
  state.products = await getStoredProducts();
  state.logs = await getStoredLogs();
  render();
})();

async function runScrape(scrapeAction, busyMessage) {
  setBusy(true, busyMessage);
  try {
    const result = await scrapeAction();
    state.products = await addProducts(result.products);
    
    for (const warn of result.warnings) await addLog(warn, "warning");
    for (const fail of result.failures) await addLog(fail, "error");
    
    state.logs = await getStoredLogs();
    
    elements.statusText.textContent = result.products.length
      ? `Intelligence gathered: ${result.products.length} items.`
      : "No commercial data found.";
  } catch (error) {
    await addLog(error?.message || "Internal engine failure.", "error");
    state.logs = await getStoredLogs();
    elements.statusText.textContent = "Operation failed.";
  } finally {
    setBusy(false);
    render();
  }
}

async function downloadCsv() {
  if (!state.products.length) return;
  setBusy(true, "Compiling export...");
  try {
    await downloadGenericProductCsv(state.products);
    elements.statusText.textContent = "Export dispatched.";
    await addLog("CSV export initiated.");
    state.logs = await getStoredLogs();
  } catch (error) {
    await addLog(error?.message || "Export failure.", "error");
    state.logs = await getStoredLogs();
    elements.statusText.textContent = "Export failed.";
  } finally {
    setBusy(false);
    render();
  }
}

function switchTab(tabId) {
  state.activeTab = tabId;
  render();
}

async function clearProducts() {
  if (confirm("Are you sure you want to purge all captured intelligence?")) {
    await clearAllData();
    state.products = [];
    state.logs = await getStoredLogs();
    elements.statusText.textContent = "Intelligence purged.";
    render();
  }
}

function setBusy(isBusy, message) {
  state.busy = isBusy;
  if (message) elements.statusText.textContent = message;
  render();
}

function render() {
  // Tab UI
  elements.tabCapture.classList.toggle("active", state.activeTab === "capture");
  elements.tabInventory.classList.toggle("active", state.activeTab === "inventory");
  elements.captureView.classList.toggle("active", state.activeTab === "capture");
  elements.inventoryView.classList.toggle("active", state.activeTab === "inventory");

  // Button States
  elements.scrapeActiveButton.disabled = state.busy;
  elements.scrapeAllButton.disabled = state.busy;
  elements.downloadButton.disabled = state.busy || !state.products.length;
  elements.clearButton.disabled = state.busy || !state.products.length;

  // Stats
  elements.recordCount.textContent = `${state.products.length} item${state.products.length === 1 ? "" : "s"}`;
  elements.totalRows.textContent = state.products.length;
  elements.sourceCount.textContent = new Set(state.products.map(p => p.source_site)).size;

  renderPreview();
  renderMessages();
}

function renderPreview() {
  elements.previewList.innerHTML = "";

  const query = elements.searchInput.value.toLowerCase();
  const filteredProducts = state.products.filter(p => 
    p.title?.toLowerCase().includes(query) || 
    p.source_site?.toLowerCase().includes(query)
  );

  if (!filteredProducts.length) {
    elements.previewList.classList.add("empty");
    elements.previewList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">${query ? "❓" : "🔍"}</span>
        <p>${query ? "No matches found." : "No products found yet."}</p>
        <p class="sub-text">${query ? "Try a different search term." : "Navigate to a shop and click \"Current Page\""}</p>
      </div>`;
    return;
  }

  elements.previewList.classList.remove("empty");

  // Show latest 15 matches
  filteredProducts.slice().reverse().slice(0, 15).forEach(product => {

    const card = document.createElement("div");
    card.className = "product-card";

    const img = document.createElement("img");
    img.className = "product-img";
    img.src = product.image_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23e2e8f0'/%3E%3Cpath d='M20 40l12-15 8 10 6-7 8 12H20z' fill='%2394a3b8'/%3E%3C/svg%3E";
    img.alt = "";

    const info = document.createElement("div");
    info.className = "product-info";
    
    const title = document.createElement("h3");
    title.textContent = product.title || "Untitled Product";
    
    const meta = document.createElement("div");
    meta.className = "product-meta";
    
    const price = document.createElement("span");
    price.className = "product-price";
    price.textContent = formatPrice(product);
    
    const site = document.createElement("span");
    site.textContent = product.source_site || "External Source";

    meta.append(price, site);
    info.append(title, meta);
    card.append(img, info);
    elements.previewList.append(card);
  });
}

function renderMessages() {
  elements.messageList.innerHTML = "";

  if (!state.logs.length) {
    const item = document.createElement("li");
    item.textContent = "No engine warnings.";
    elements.messageList.append(item);
    return;
  }

  state.logs.forEach(log => {
    const item = document.createElement("li");
    const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    item.textContent = `[${time}] ${log.message}`;
    if (log.type === "error") item.style.color = "#ef4444";
    if (log.type === "warning") item.style.color = "#f59e0b";
    elements.messageList.append(item);
  });
}

function formatPrice(product) {
  if (!product.price) return "Price N/A";
  const curr = product.currency ? product.currency + " " : "";
  return `${curr}${product.price}`;
}