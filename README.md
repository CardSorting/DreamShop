# DreamShop | Commerce Intelligence Engine

**DreamShop** is an industrial-grade Chrome Manifest V3 extension designed for high-velocity product data extraction. It transforms user-opened product tabs into structured commercial intelligence, ready for catalog population or forensic market analysis.

## Elite-Tier Features

- **Multi-Product Intelligence**: Automatically detects and scrapes multiple products from collection pages or search results using a multi-layered extraction engine.
- **Deep Data Harvesting**: Support for JSON-LD (including complex `@graph` nodes), Schema.org Microdata, and OpenGraph metadata.
- **Universal Normalization**: Deterministically transforms fragmented shop data into a stable, industry-standard CSV schema.
- **Glassmorphic Interface**: A premium, world-class UI with tabbed navigation and real-time capture analytics.
- **Forensic Logs & Stats**: Real-time auditing of scraping operations and source attribution tracking.

## Universal CSV Columns

The Intelligence Engine exports data in a stable, shop-agnostic format:

```csv
source_site,source_url,source_tab_title,title,description,price,currency,compare_at_price,availability,brand,vendor,sku,category,tags,image_url,additional_image_urls,variant_name,variant_value,shipping_origin,rating,review_count,notes,scraped_at
```

## Advanced Extraction Strategy

For each targeted tab, the engine executes a prioritized intelligence gathering sequence:

1. **Structured Data Layer**: JSON-LD Product & Offer graphs + Microdata `itemprop` scanning.
2. **Meta Layer**: OpenGraph, Twitter, and Product meta-tag forensic analysis.
3. **DOM Layer**: Heuristic-based selector matching for common marketplace patterns.
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