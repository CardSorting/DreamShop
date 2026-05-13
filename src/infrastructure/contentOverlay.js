(async function() {
  const settings = await chrome.storage.local.get({ enableOverlay: true });
  
  function getDetectedProducts() {
    const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
    const microdata = document.querySelectorAll('[itemscope][itemtype*="Product"]');
    const meta = document.querySelectorAll('meta[property*="product:"], meta[property*="og:price"]');
    if (microdata.length > 0) return microdata.length;
    if (jsonLd.length > 0) return 1;
    return meta.length > 0 ? 1 : 0;
  }

  const detectedCount = getDetectedProducts();
  if (detectedCount === 0) return;

  const pill = document.createElement('div');
  pill.className = 'ds-capture-pill';
  pill.innerHTML = `
    <div class="ds-icon">DS</div>
    <div class="ds-content">
      <span class="ds-label">Capture ${detectedCount > 1 ? detectedCount + ' Products' : 'Product'}</span>
      <div class="ds-actions">
        <button class="ds-action-btn" id="dsCaptureAll" title="Capture All Items">⚡</button>
        <button class="ds-action-btn" id="dsTargeted" title="Select Specific Item">🎯</button>
      </div>
    </div>
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

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enableOverlay) {
      updateVisibility(changes.enableOverlay.newValue);
    }
  });

  // Selector Mode Logic
  let selectorMode = false;
  const highlightEl = document.createElement('div');
  highlightEl.style.cssText = 'position:fixed; z-index:2147483646; border:2px solid #6366f1; background:rgba(99,102,241,0.1); pointer-events:none; display:none; transition:all 0.1s ease; border-radius: 8px;';
  document.body.appendChild(highlightEl);

  function enterSelectorMode() {
    selectorMode = true;
    pill.classList.add('ds-selector-active');
    document.body.style.cursor = 'crosshair';
    window.addEventListener('mouseover', onHover);
    window.addEventListener('click', onClick, true);
  }

  function exitSelectorMode() {
    selectorMode = false;
    pill.classList.remove('ds-selector-active');
    document.body.style.cursor = 'default';
    highlightEl.style.display = 'none';
    window.removeEventListener('mouseover', onHover);
    window.removeEventListener('click', onClick, true);
  }

  function onHover(e) {
    if (!selectorMode) return;
    const target = e.target.closest('[itemscope], [data-testid*="product"], article, .product, .item');
    if (target) {
      const rect = target.getBoundingClientRect();
      highlightEl.style.top = rect.top + 'px';
      highlightEl.style.left = rect.left + 'px';
      highlightEl.style.width = rect.width + 'px';
      highlightEl.style.height = rect.height + 'px';
      highlightEl.style.display = 'block';
    } else {
      highlightEl.style.display = 'none';
    }
  }

  async function onClick(e) {
    if (!selectorMode) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target.closest('[itemscope], [data-testid*="product"], article, .product, .item');
    if (target) {
      const selector = getUniqueSelector(target);
      chrome.runtime.sendMessage({ action: "perform-capture", targetSelector: selector }, (res) => {
        if (res?.success) showStatus('Target Captured! ✨', true);
        else showStatus('Selection Failed ❌', false);
      });
    }
    exitSelectorMode();
  }

  function getUniqueSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += `#${CSS.escape(el.id)}`;
        path.unshift(selector);
        break;
      } else {
        let sib = el, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(" > ");
  }

  function showStatus(text, success = true) {
    const label = pill.querySelector('.ds-label');
    const originalText = label.textContent;
    label.textContent = text;
    if (success) pill.classList.add('ds-success-pill');
    setTimeout(() => {
      label.textContent = originalText;
      pill.classList.remove('ds-success-pill');
    }, 3000);
  }

  pill.querySelector('#dsCaptureAll').addEventListener('click', (e) => {
    e.stopPropagation();
    showStatus('Capturing...');
    chrome.runtime.sendMessage({ action: "perform-capture" }, (res) => {
      if (res?.success) showStatus('Intelligence Captured! ✨');
      else showStatus('Capture Failed ❌', false);
    });
  });

  pill.querySelector('#dsTargeted').addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectorMode) exitSelectorMode();
    else enterSelectorMode();
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "trigger-background-capture") {
      pill.querySelector('#dsCaptureAll').click();
      sendResponse({ ok: true });
    }
  });
})();

  // SPA Intelligence Bridge
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'DS_PRODUCT_DATA_DETECTED') {
      injectSpaData(event.data.data);
    }
  });

  function injectSpaData(data) {
    // Check if we already injected this to avoid duplicates
    const str = JSON.stringify(data);
    const existing = [...document.querySelectorAll('.ds-spa-data')].find(s => s.textContent === str);
    if (existing) return;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.className = 'ds-spa-data';
    script.textContent = str;
    document.head.appendChild(script);
    setTimeout(() => script.remove(), 60000);
  }

  // Real-time Mutation Awareness
  const observer = new MutationObserver(() => {
    const newCount = getDetectedProducts();
    const label = pill.querySelector('.ds-label');
    if (label) {
      label.textContent = `Capture ${newCount > 1 ? newCount + ' Products' : 'Product'}`;
    }
  });

  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: true,
    attributeFilter: ['itemtype', 'class', 'id']
  });
