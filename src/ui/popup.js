import { downloadGenericProductCsv, scrapeActiveTabProducts, scrapeAllOpenTabProducts } from "../core/productExportCoordinator.js";

const state = {
  products: [],
  warnings: [],
  failures: [],
  busy: false
};

const elements = {
  scrapeActiveButton: document.querySelector("#scrapeActiveButton"),
  scrapeAllButton: document.querySelector("#scrapeAllButton"),
  downloadButton: document.querySelector("#downloadButton"),
  clearButton: document.querySelector("#clearButton"),
  statusText: document.querySelector("#statusText"),
  recordCount: document.querySelector("#recordCount"),
  previewList: document.querySelector("#previewList"),
  messageList: document.querySelector("#messageList")
};

elements.scrapeActiveButton.addEventListener("click", () => runScrape(scrapeActiveTabProducts, "Scraping active tab..."));
elements.scrapeAllButton.addEventListener("click", () => runScrape(scrapeAllOpenTabProducts, "Scraping open tabs..."));
elements.downloadButton.addEventListener("click", downloadCsv);
elements.clearButton.addEventListener("click", clearProducts);

render();

async function runScrape(scrapeAction, busyMessage) {
  setBusy(true, busyMessage);

  try {
    const result = await scrapeAction();
    state.products = dedupeProducts([...state.products, ...result.products]);
    state.warnings = [...state.warnings, ...result.warnings];
    state.failures = [...state.failures, ...result.failures];
    elements.statusText.textContent = result.products.length
      ? `Captured ${result.products.length} product${result.products.length === 1 ? "" : "s"}.`
      : "No products captured from that scrape.";
  } catch (error) {
    state.failures = [...state.failures, error?.message || "Unexpected scrape failure."];
    elements.statusText.textContent = "Scrape failed.";
  } finally {
    setBusy(false);
    render();
  }
}

async function downloadCsv() {
  if (!state.products.length) {
    return;
  }

  setBusy(true, "Preparing CSV download...");

  try {
    await downloadGenericProductCsv(state.products);
    elements.statusText.textContent = "CSV download started.";
  } catch (error) {
    state.failures = [...state.failures, error?.message || "CSV download failed."];
    elements.statusText.textContent = "CSV download failed.";
  } finally {
    setBusy(false);
    render();
  }
}

function clearProducts() {
  state.products = [];
  state.warnings = [];
  state.failures = [];
  elements.statusText.textContent = "Cleared scraped products.";
  render();
}

function setBusy(isBusy, message) {
  state.busy = isBusy;

  if (message) {
    elements.statusText.textContent = message;
  }

  render();
}

function render() {
  elements.scrapeActiveButton.disabled = state.busy;
  elements.scrapeAllButton.disabled = state.busy;
  elements.downloadButton.disabled = state.busy || !state.products.length;
  elements.clearButton.disabled = state.busy || (!state.products.length && !state.warnings.length && !state.failures.length);
  elements.recordCount.textContent = `${state.products.length} product${state.products.length === 1 ? "" : "s"} captured`;
  renderPreview();
  renderMessages();
}

function renderPreview() {
  elements.previewList.replaceChildren();

  if (!state.products.length) {
    elements.previewList.classList.add("empty");
    elements.previewList.textContent = "No products scraped yet.";
    return;
  }

  elements.previewList.classList.remove("empty");

  for (const product of state.products.slice(0, 20)) {
    const card = document.createElement("article");
    card.className = "product-card";

    const image = document.createElement("img");
    image.alt = "";
    image.src = product.image_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='54' height='54' viewBox='0 0 54 54'%3E%3Crect width='54' height='54' fill='%23efe7dc'/%3E%3Cpath d='M15 36l8-10 6 7 4-5 6 8H15z' fill='%23bfae9c'/%3E%3Ccircle cx='20' cy='19' r='4' fill='%23bfae9c'/%3E%3C/svg%3E";

    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = product.title || "Untitled product";
    const meta = document.createElement("span");
    meta.textContent = [product.source_site, formatPrice(product)].filter(Boolean).join(" · ") || "No source metadata";
    const url = document.createElement("span");
    url.textContent = product.source_url;

    details.append(title, meta, url);
    card.append(image, details);
    elements.previewList.append(card);
  }
}

function renderMessages() {
  elements.messageList.replaceChildren();
  const messages = [...state.failures, ...state.warnings];

  if (!messages.length) {
    const item = document.createElement("li");
    item.textContent = "No warnings.";
    elements.messageList.append(item);
    return;
  }

  for (const message of messages.slice(-30)) {
    const item = document.createElement("li");
    item.textContent = message;
    elements.messageList.append(item);
  }
}

function dedupeProducts(products) {
  const seen = new Set();

  return products.filter((product) => {
    const key = product.source_url || `${product.title}|${product.price}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function formatPrice(product) {
  if (!product.price) {
    return "";
  }

  return `${product.currency ? `${product.currency} ` : ""}${product.price}`;
}