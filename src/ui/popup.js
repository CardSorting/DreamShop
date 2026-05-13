import { downloadGenericProductCsv, scrapeActiveTabProducts, scrapeAllOpenTabProducts } from "../core/productExportCoordinator.js";
import { getStoredProducts, addProducts, clearAllData, getStoredLogs, addLog, removeProduct } from "../infrastructure/storage.js";


const state = {
  products: [],
  logs: [],
  busy: false,
  activeTab: "capture",
  page: 1,
  pageSize: 20
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
  searchInput: document.querySelector("#searchInput"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  loadMoreContainer: document.querySelector("#loadMoreContainer"),
  imageLightbox: document.querySelector("#imageLightbox"),
  lightboxImg: document.querySelector("#lightboxImg"),
  closeLightbox: document.querySelector("#closeLightbox"),
  prevImg: document.querySelector("#prevImg"),
  nextImg: document.querySelector("#nextImg"),
  imgIndex: document.querySelector("#imgIndex"),
  downloadImg: document.querySelector("#downloadImg"),
  downloadAllImgs: document.querySelector("#downloadAllImgs"),
  scanningOverlay: document.querySelector("#scanningOverlay"),
  scannerTitle: document.querySelector("#scannerTitle"),
  scannerSub: document.querySelector("#scannerSub")
};

let lightboxGallery = [];
let lightboxCurrentIndex = 0;
let lightboxProductTitle = "";

// Event Listeners
elements.tabCapture.addEventListener("click", () => switchTab("capture"));
elements.tabInventory.addEventListener("click", () => switchTab("inventory"));
elements.scrapeActiveButton.addEventListener("click", () => runScrape(scrapeActiveTabProducts, "Analyzing active tab..."));
elements.scrapeAllButton.addEventListener("click", () => runScrape(scrapeAllOpenTabProducts, "Scanning all open tabs..."));
elements.downloadButton.addEventListener("click", downloadCsv);
elements.clearButton.addEventListener("click", clearProducts);
elements.messageToggle.addEventListener("click", () => elements.logsOverlay.classList.toggle("active"));
elements.closeLogs.addEventListener("click", () => elements.logsOverlay.classList.remove("active"));
elements.searchInput.addEventListener("input", () => {
  state.page = 1;
  render();
});
elements.searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    elements.searchInput.value = "";
    state.page = 1;
    render();
  }
});
elements.loadMoreButton.addEventListener("click", () => {
  state.page++;
  render();
});

elements.downloadImg.addEventListener("click", () => downloadAsset(lightboxCurrentIndex));
elements.downloadAllImgs.addEventListener("click", async () => {
  for (let i = 0; i < lightboxGallery.length; i++) {
    downloadAsset(i);
    // Slight delay to be polite to the browser's download queue
    await new Promise(r => setTimeout(r, 200));
  }
});

function downloadAsset(index) {
  const url = lightboxGallery[index];
  if (!url) return;
  
  const ext = url.split(".").pop().split(/[?#]/)[0] || "jpg";
  const filename = `dreamshop/${lightboxProductTitle.replace(/[^a-z0-9]/gi, "_")}_${index + 1}.${ext}`;
  
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: false
  });
}



elements.closeLightbox.addEventListener("click", () => elements.imageLightbox.classList.remove("active"));
elements.imageLightbox.addEventListener("click", (e) => {
  if (e.target === elements.imageLightbox) elements.imageLightbox.classList.remove("active");
});

elements.prevImg.addEventListener("click", () => {
  lightboxCurrentIndex = (lightboxCurrentIndex - 1 + lightboxGallery.length) % lightboxGallery.length;
  updateLightbox();
});

elements.nextImg.addEventListener("click", () => {
  lightboxCurrentIndex = (lightboxCurrentIndex + 1) % lightboxGallery.length;
  updateLightbox();
});

function showLightbox(product) {
  lightboxGallery = [product.image_url, ...(product.additional_image_urls ? product.additional_image_urls.split(" | ") : [])].filter(Boolean);
  lightboxCurrentIndex = 0;
  lightboxProductTitle = product.title || "Product";
  
  if (lightboxGallery.length === 0) return;

  
  elements.imageLightbox.classList.add("active");
  elements.prevImg.style.display = lightboxGallery.length > 1 ? "block" : "none";
  elements.nextImg.style.display = lightboxGallery.length > 1 ? "block" : "none";
  elements.imgIndex.style.display = lightboxGallery.length > 1 ? "block" : "none";
  
  updateLightbox();
}

function updateLightbox() {
  elements.lightboxImg.src = lightboxGallery[lightboxCurrentIndex];
  elements.imgIndex.textContent = `${lightboxCurrentIndex + 1} / ${lightboxGallery.length}`;
}




// Initialize
(async () => {
  const settings = await chrome.storage.local.get({ ds_first_run: true });
  state.products = await getStoredProducts();
  state.logs = await getStoredLogs();
  render();

  if (settings.ds_first_run) {
    showOnboarding();
  }
})();

function showOnboarding() {
  const overlay = document.createElement("div");
  overlay.className = "onboarding-overlay";
  
  const card = document.createElement("div");
  card.className = "onboarding-card";
  
  const h2 = document.createElement("h2");
  h2.textContent = "Welcome to DreamShop ✨";
  
  const p = document.createElement("p");
  p.textContent = "Your Intelligence Engine is ready. Here's how to start:";
  
  const ul = document.createElement("ul");
  ul.className = "onboarding-steps";
  
  const steps = [
    { label: "Capture", desc: "Navigate to a product page and click \"Current Page\" or use the floating button." },
    { label: "Inventory", desc: "Switch tabs to manage your items and search through your collection." },
    { label: "Export", desc: "One-click Download to save everything to CSV." }
  ];
  
  steps.forEach(step => {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = step.label;
    li.append(strong, `: ${step.desc}`);
    ul.appendChild(li);
  });
  
  const btn = document.createElement("button");
  btn.id = "closeOnboarding";
  btn.className = "primary-btn";
  btn.textContent = "Got it, let's go!";
  btn.onclick = async () => {
    overlay.remove();
    await chrome.storage.local.set({ ds_first_run: false });
  };
  
  card.append(h2, p, ul, btn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}


async function runScrape(scrapeAction, subMessage) {
  setBusy(true, "Analyzing Commerce Substrate", subMessage);
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

function setBusy(isBusy, title, sub) {
  state.busy = isBusy;
  if (isBusy) {
    elements.scanningOverlay.classList.add("active");
    if (title) elements.scannerTitle.textContent = title;
    if (sub) elements.scannerSub.textContent = sub;
  } else {
    elements.scanningOverlay.classList.remove("active");
  }
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
    
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    
    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.textContent = query ? "❓" : "🔍";
    
    const p1 = document.createElement("p");
    p1.textContent = query ? "No matches found." : "No products found yet.";
    
    const p2 = document.createElement("p");
    p2.className = "sub-text";
    p2.textContent = query ? "Try a different search term." : "Navigate to a shop and click \"Current Page\"";
    
    emptyState.append(icon, p1, p2);
    elements.previewList.appendChild(emptyState);
    elements.loadMoreContainer.style.display = "none";
    return;
  }

  elements.previewList.classList.remove("empty");

  const totalToShow = state.page * state.pageSize;
  const pagedProducts = filteredProducts.slice().reverse().slice(0, totalToShow);

  elements.loadMoreContainer.style.display = filteredProducts.length > totalToShow ? "flex" : "none";

  pagedProducts.forEach(product => {


    const card = document.createElement("div");
    card.className = "product-card";

    const imgContainer = document.createElement("div");
    imgContainer.className = "product-img-container";
    imgContainer.style.cursor = "pointer";
    imgContainer.onclick = () => showLightbox(product);

    const img = document.createElement("img");
    img.className = "product-img";
    img.src = product.image_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23e2e8f0'/%3E%3Cpath d='M20 40l12-15 8 10 6-7 8 12H20z' fill='%2394a3b8'/%3E%3C/svg%3E";
    img.alt = product.title || "Product Image Preview";

    
    imgContainer.appendChild(img);

    const galleryText = product.additional_image_urls || "";
    const galleryCount = galleryText ? (galleryText.split(" | ").length) : 0;
    
    if (galleryCount > 0) {
      const badge = document.createElement("span");
      badge.className = "gallery-badge";
      badge.textContent = `+${galleryCount}`;
      imgContainer.appendChild(badge);
    }



    const info = document.createElement("div");
    info.className = "product-info";
    
    const title = document.createElement("h3");
    title.textContent = product.title || "Untitled Product";
    
    const meta = document.createElement("div");
    meta.className = "product-meta";
    
    const price = document.createElement("span");
    price.className = "product-price";
    price.textContent = formatPrice(product);
    
    if (product.discount_percentage) {
      const discount = document.createElement("span");
      discount.className = "discount-badge";
      discount.textContent = `-${product.discount_percentage}`;
      price.append(discount);
    }
    
    const site = document.createElement("span");
    site.className = "product-site";
    site.textContent = product.source_site || "External Source";

    if (product.shipping_price && product.shipping_price !== "0") {
      const shipping = document.createElement("span");
      shipping.className = "shipping-info";
      shipping.textContent = `+ ${product.shipping_price} shipping`;
      meta.append(price, shipping, site);
    } else {
      meta.append(price, site);
    }

    info.append(title, meta);
    
    // Action Buttons for Card
    const cardActions = document.createElement("div");
    cardActions.className = "ds-card-actions";
    
    const openBtn = document.createElement("button");
    openBtn.className = "ds-card-btn";
    openBtn.textContent = "🌐";
    openBtn.title = "Open Source URL";
    openBtn.onclick = (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: product.source_url });
    };

    const copyBtn = document.createElement("button");
    copyBtn.className = "ds-card-btn";
    copyBtn.textContent = "📋";
    copyBtn.title = "Copy to Clipboard";
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      const text = `${product.title} - ${product.price} ${product.currency}\n${product.source_url}`;
      navigator.clipboard.writeText(text);
      copyBtn.textContent = "✅";
      setTimeout(() => copyBtn.textContent = "📋", 2000);
    };
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "ds-card-btn ds-card-btn-danger";
    removeBtn.textContent = "🗑️";
    removeBtn.title = "Remove Item";
    removeBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${product.title}"?`)) {
        await removeProduct(product);
        state.products = await getStoredProducts();
        render();
      }
    };
    
    cardActions.append(openBtn, copyBtn, removeBtn);
    card.append(imgContainer, info, cardActions);
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