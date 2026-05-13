# DreamShop Knowledge Ledger

## Current system state

DreamShop is a Google Chrome Manifest V3 extension that scrapes product-like data from user-opened browser tabs and exports a single generic, shop-agnostic CSV for product population workflows.

## Implemented files

- `manifest.json` — Chrome extension metadata, popup registration, permissions, and http/https host access for user-opened tabs.
- `src/domain/productRecord.js` — pure product record columns, source-site detection, normalization, and validation.
- `src/utils/csv.js` — pure CSV serialization, CSV cell escaping, and timestamped filename generation.
- `src/infrastructure/contentProductScraper.js` — multi-strategy engine supporting JSON-LD (including @graph), Microdata (itemprop), and Meta-tag extraction.
- `src/infrastructure/chromeTabs.js` — high-fidelity tab orchestration and CSV persistence.
- `src/core/productExportCoordinator.js` — batch processing for multi-product captures.
- `src/ui/popup.html` — redesigned glassmorphic interface with tabbed navigation.
- `src/ui/popup.css` — premium design system with dark mode support.
- `src/ui/popup.js` — state management for the Intelligence Engine.

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