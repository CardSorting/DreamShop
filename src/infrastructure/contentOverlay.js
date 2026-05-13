/**
 * Content Overlay Script
 * Injects a "Save to DreamShop" button when a product is detected.
 */

(async function() {
  const settings = await chrome.storage.local.get({ enableOverlay: true });
  
  // Simple heuristic to detect if this might be a product page
  function isProductPage() {
    const hasJsonLd = !!document.querySelector('script[type="application/ld+json"]');
    const hasMetaProduct = !!document.querySelector('meta[property*="product:"], meta[property*="og:price"]');
    const hasPrice = /[$€£¥]\d+/.test(document.body.innerText.slice(0, 5000));
    return hasJsonLd || hasMetaProduct || (hasPrice && document.querySelectorAll('h1').length > 0);
  }

  if (!isProductPage()) return;

  const pill = document.createElement('div');
  pill.className = 'ds-capture-pill';
  pill.innerHTML = `
    <div class="ds-icon">DS</div>
    <span>Save to DreamShop</span>
  `;

  document.body.appendChild(pill);

  function updateVisibility(enabled) {
    if (enabled) {
      pill.style.display = 'flex';
      setTimeout(() => pill.classList.add('visible'), 100);
    } else {
      pill.classList.remove('visible');
      setTimeout(() => pill.style.display = 'none', 300);
    }
  }

  updateVisibility(settings.enableOverlay);

  // Listen for setting changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enableOverlay) {
      updateVisibility(changes.enableOverlay.newValue);
    }
  });

  pill.addEventListener('click', async (e) => {

    e.stopPropagation();
    pill.innerHTML = '<span>Capturing...</span>';
    
    // Message background to run the full scrape coordination
    // We don't want to duplicate scraper logic here
    chrome.runtime.sendMessage({ action: "perform-capture" }, (response) => {
      if (response && response.success) {
        pill.classList.add('ds-success-pill');
        pill.innerHTML = '<span>Captured! ✨</span>';
        setTimeout(() => {
          pill.classList.remove('ds-success-pill');
          pill.innerHTML = '<div class="ds-icon">DS</div><span>Save to DreamShop</span>';
        }, 3000);
      } else {
        pill.innerHTML = '<span>Capture Failed</span>';
        setTimeout(() => {
          pill.innerHTML = '<div class="ds-icon">DS</div><span>Save to DreamShop</span>';
        }, 3000);
      }
    });
  });

  // Listen for background triggers (like context menus)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "trigger-background-capture") {
      pill.click();
      sendResponse({ ok: true });
    }
  });
})();
