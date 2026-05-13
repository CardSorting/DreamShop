import { downloadGenericProductCsv, scrapeActiveTabProducts, scrapeAllOpenTabProducts } from "../core/productExportCoordinator.js";

const state = {
  products: [],
  warnings: [],
  failures: [],
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
  closeLogs: document.querySelector("#closeLogs")
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

render();

async function runScrape(scrapeAction, busyMessage) {
  setBusy(true, busyMessage);
  try {
    const result = await scrapeAction();
    // The coordinator might return a single result or a list of results if it handles multiple tabs
    // In this case, result.products is already an array from contentProductScraper.js
    state.products = dedupeProducts([...state.products, ...result.products]);
    state.warnings = [...state.warnings, ...result.warnings];
    state.failures = [...state.failures, ...result.failures];
    
    elements.statusText.textContent = result.products.length
      ? `Intelligence gathered: ${result.products.length} items.`
      : "No commercial data found.";
  } catch (error) {
    state.failures.push(error?.message || "Internal engine failure.");
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
  } catch (error) {
    state.failures.push(error?.message || "Export failure.");
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

function clearProducts() {
  state.products = [];
  state.warnings = [];
  state.failures = [];
  elements.statusText.textContent = "Intelligence purged.";
  render();
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
  elements.clearButton.disabled = state.busy || (!state.products.length && !state.warnings.length && !state.failures.length);

  // Stats
  elements.recordCount.textContent = `${state.products.length} item${state.products.length === 1 ? "" : "s"}`;
  elements.totalRows.textContent = state.products.length;
  elements.sourceCount.textContent = new Set(state.products.map(p => p.source_site)).size;

  renderPreview();
  renderMessages();
}

function renderPreview() {
  elements.previewList.innerHTML = "";

  if (!state.products.length) {
    elements.previewList.classList.add("empty");
    elements.previewList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <p>No products found yet.</p>
        <p class="sub-text">Navigate to a shop and click "Current Page"</p>
      </div>`;
    return;
  }

  elements.previewList.classList.remove("empty");

  state.products.slice().reverse().slice(0, 15).forEach(product => {
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
  const messages = [...state.failures, ...state.warnings];

  if (!messages.length) {
    const item = document.createElement("li");
    item.textContent = "No engine warnings.";
    elements.messageList.append(item);
    return;
  }

  messages.slice(-20).forEach(msg => {
    const item = document.createElement("li");
    item.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    elements.messageList.append(item);
  });
}

function dedupeProducts(products) {
  const seen = new Set();
  return products.filter((p) => {
    const key = p.source_url || `${p.title}|${p.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatPrice(product) {
  if (!product.price) return "Price N/A";
  const curr = product.currency ? product.currency + " " : "";
  return `${curr}${product.price}`;
}