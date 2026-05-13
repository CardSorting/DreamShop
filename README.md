# DreamShop Product CSV Scraper

DreamShop Product CSV Scraper is a build-free Google Chrome extension that reads product information from user-opened tabs and exports a single generic CSV for shop population or dropshipping research workflows.

The extension only uses page content available in tabs you already opened. It does not bypass logins, paywalls, captchas, anti-bot systems, or marketplace restrictions.

## Generic CSV columns

The exported CSV uses one shop-agnostic format:

```csv
source_site,source_url,source_tab_title,title,description,price,currency,compare_at_price,availability,brand,vendor,sku,category,tags,image_url,additional_image_urls,variant_name,variant_value,shipping_origin,rating,review_count,notes,scraped_at
```

These columns are intended for your own catalog-building process, spreadsheets, enrichment tools, or custom import scripts. They are not official Etsy, AliExpress, Walmart, Amazon, Shopify, or WooCommerce upload templates.

## How scraping works

For each selected tab, the extension tries safe browser-accessible sources in this order:

1. JSON-LD product schema (`application/ld+json`)
2. OpenGraph, Twitter, and product meta tags
3. Common product-page DOM selectors
4. Generic page title/image fallbacks

Supported source-site detection includes Amazon, Walmart, Etsy, AliExpress/Alibaba, eBay, Shopify-hosted stores, and generic domains. Source detection is only written to `source_site`; it does not change the CSV structure.

## Install in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder: `DreamShop`.
5. Pin **DreamShop Product CSV Scraper** if you want quick access from the toolbar.

## Use

1. Open one or more product pages in Chrome tabs.
2. Click the DreamShop extension icon.
3. Choose **Scrape active tab** or **Scrape all open tabs**.
4. Review the preview and warnings.
5. Click **Download CSV**.

## Permission notes

The extension requests:

- `tabs` to read the URLs/titles of open tabs.
- `scripting` to run the product scraper in selected tabs.
- `downloads` to save the generated CSV.
- `activeTab` and `http/https` host permissions so user-opened product pages can be read when you choose to scrape them.

## Limitations

- Some pages hide product data, render it late, or block extension script injection.
- Product fields vary heavily by website, so missing values can happen.
- Scraping should be used only for pages and data you are allowed to access and process.