(function() {
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  function scanGlobalState() {
    const commonKeys = [
      'product', 'variants', 'item', 'productData', 
      'Shopify.product', 'BCConfig', 'PRODUCT_DATA',
      '__NEXT_DATA__', 'initialState', 'state'
    ];
    commonKeys.forEach(key => {
      try {
        const parts = key.split('.');
        let val = window;
        for (const p of parts) val = val?.[p];
        if (val) scanForProduct(val);
      } catch (e) {}
    });
  }

  function scanForProduct(data) {
    if (!data || typeof data !== 'object') return;
    const str = JSON.stringify(data);
    
    // Broad detection for product-like objects or state objects containing them
    if (str.includes('"@type":"Product"') || str.includes('"product_id"') || (data.variants && data.title) || data.props?.pageProps?.product) {
      window.postMessage({ type: 'DS_PRODUCT_DATA_DETECTED', data }, '*');
    }
  }


  // Initial scan and periodic re-scans for state-heavy apps
  window.addEventListener('load', () => {
    scanGlobalState();
    setInterval(scanGlobalState, 5000);
  });

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const clone = response.clone();
    clone.json().then(scanForProduct).catch(() => {});
    return response;
  };

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', () => {
      try {
        const data = JSON.parse(this.responseText);
        scanForProduct(data);
      } catch (e) {}
    });
    return originalSend.apply(this, arguments);
  };
})();
