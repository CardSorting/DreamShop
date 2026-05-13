# DreamShop | Commerce Intelligence Engine

**DreamShop** is an industrial-grade Chrome Manifest V3 extension designed for high-velocity product data extraction. It transforms user-opened product tabs into structured commercial intelligence, ready for catalog population or forensic market analysis.

## Elite-Tier Features

- **Precision Selector Tool**: Use the interactive crosshair tool to click and capture specific products on any complex page.
- **Guided Onboarding**: An intuitive, step-by-step introduction ensures even non-technical users can start harvesting intelligence immediately.
- **Actionable Inventory**: Open source URLs or remove specific items directly from the popup's inventory management view.
- **On-Page Capture Overlay**: An intelligent floating button detects product pages and provides a one-click "Save to DreamShop" experience.
- **Preferences Hub**: A dedicated options page to customize your experience, including toggling the capture button and configuring export formats.
- **Deep Shadow DOM Support**: Engineered recursive traversal to harvest data from modern, web-component-based shops (e.g. Nike, Adidas).

- **Universal Normalization**: Deterministically transforms fragmented shop data into a stable, industry-standard CSV schema.

## Universal CSV Columns

The Intelligence Engine exports data in a stable, shop-agnostic format:

```csv
source_site,source_url,source_tab_title,title,description,price,currency,compare_at_price,availability,brand,vendor,sku,category,tags,image_url,additional_image_urls,variant_name,variant_value,shipping_origin,rating,review_count,notes,scraped_at
```

## Advanced Extraction Strategy

For each targeted tab, the engine executes a prioritized intelligence gathering sequence:

1. **Structured Data Layer**: JSON-LD Product & Offer graphs + Microdata `itemprop` scanning (Shadow DOM aware).
2. **Meta Layer**: OpenGraph, Twitter, and Product meta-tag forensic analysis.
3. **DOM Layer**: Heuristic-based selector matching for common marketplace patterns across shadow boundaries.
4. **Context Layer**: Source-site attribution and tab context injection.



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