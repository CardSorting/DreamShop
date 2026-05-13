# DreamShop Knowledge Ledger

## Current system state

DreamShop is a Google Chrome Manifest V3 extension that scrapes product-like data from user-opened browser tabs and exports a single generic, shop-agnostic CSV for product population workflows.

## Implemented files

- `manifest.json` — Chrome extension metadata, popup registration, permissions, and http/https host access for user-opened tabs.
- `src/domain/productRecord.js` — pure product record columns, source-site detection, normalization, and validation.
- `src/utils/csv.js` — pure CSV serialization, CSV cell escaping, and timestamped filename generation.
- `src/infrastructure/contentProductScraper.js` — injected page scraper for JSON-LD, meta tags, and common DOM product selectors.
- `src/infrastructure/chromeTabs.js` — Chrome tab querying, script injection, and CSV download adapter.
- `src/core/productExportCoordinator.js` — orchestration for active/all-tab scraping, normalization, validation warnings, CSV creation, and download.
- `src/ui/popup.html` — extension popup markup.
- `src/ui/popup.css` — popup styling.
- `src/ui/popup.js` — popup event handling, preview rendering, scrape actions, and CSV download action.
- `README.md` — install, usage, permissions, CSV columns, and limitations documentation.
- `.wiki/verification.md` — structural audit, verification commands, layer audit, and behavior boundary record.

## Generic CSV schema

The extension exports these columns in stable order:

```csv
source_site,source_url,source_tab_title,title,description,price,currency,compare_at_price,availability,brand,vendor,sku,category,tags,image_url,additional_image_urls,variant_name,variant_value,shipping_origin,rating,review_count,notes,scraped_at
```

## Boundary notes

- The extension reads accessible DOM/metadata only from tabs the user has opened.
- The extension does not bypass authentication, paywalls, captchas, anti-bot measures, or marketplace controls.
- CSV output is generic and is not an official import template for any marketplace.

## Verification status

The 2026-05-13 structural audit is recorded in `.wiki/verification.md`.