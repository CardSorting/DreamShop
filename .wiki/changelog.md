# Changelog

## 2026-05-13

- Created a build-free Chrome Manifest V3 extension for product tab scraping and generic CSV export.
- Added a pure domain model for generic product records and validation warnings.
- Added CSV serialization utilities with deterministic column order.
- Added Chrome infrastructure for querying active/all current-window tabs, injecting the scraper, and downloading CSV files.
- Added an injected product scraper that reads JSON-LD Product data, metadata, and common DOM selectors.
- Added popup UI for scraping the active tab, scraping all open tabs, previewing captured rows, clearing state, and downloading CSV.
- Added README documentation for installation, permissions, CSV fields, usage, and limitations.
- Added `.wiki/verification.md` with the verified file inventory, syntax/manifest checks, layer audit, and behavior boundary.