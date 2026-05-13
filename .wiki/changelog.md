# Changelog

## 2026-05-13

- **Precision Selector Tool**: Launched an interactive crosshair tool for targeted on-page product capture.
- **Guided Onboarding Experience**: Integrated an intuitive walkthrough for first-time users to improve approachability.
- **Actionable Item Management**: Added single-item removal and source navigation to the inventory preview.
- **Dual-Mode Page Interaction**: Upgraded the floating pill with multi-action buttons and real-time product counts.
- **Preferences Hub (Options UI)**: Launched a dedicated configuration dashboard for user-defined toggles and export formatting.
- **Deep Shadow DOM Scraper**: Upgraded the extraction engine with recursive shadow root traversal for modern web-component architecture.
- **Persistent Intelligence Layer**: Integrated `chrome.storage.local` to preserve captured data across sessions.
- **Extension Badging**: Added real-time inventory count tracking on the extension icon.



- Created a build-free Chrome Manifest V3 extension for product tab scraping and generic CSV export.
- Added a pure domain model for generic product records and validation warnings.
- Added CSV serialization utilities with deterministic column order.
- Added Chrome infrastructure for querying active/all current-window tabs, injecting the scraper, and downloading CSV files.
- Added `.wiki/verification.md` with the verified file inventory, syntax/manifest checks, layer audit, and behavior boundary.