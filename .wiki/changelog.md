# Changelog

## 2026-05-13

- **Intelligence Engine Graduation**: Re-engineered the scraper to support multi-product pages (collections/lists) and Schema.org Microdata.
- **Premium UI Overhaul**: Implemented a glassmorphic design system with tabbed navigation ("Capture" vs "Inventory") and dark mode support.
- **Batch Processing**: Updated the core coordinator to handle multi-product results from single-tab injections.
- **Forensic Stats**: Added real-time tracking of source counts and total row metrics in the UI.
- **Architecture Hardening**: Refined domain logic for better price and currency normalization.
- **Compliance Refinement**: Optimized asset loading to comply with strict MV3 CSP.
- Created a build-free Chrome Manifest V3 extension for product tab scraping and generic CSV export.
- Added a pure domain model for generic product records and validation warnings.
- Added CSV serialization utilities with deterministic column order.
- Added Chrome infrastructure for querying active/all current-window tabs, injecting the scraper, and downloading CSV files.
- Added `.wiki/verification.md` with the verified file inventory, syntax/manifest checks, layer audit, and behavior boundary.