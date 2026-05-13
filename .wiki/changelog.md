# Changelog

## 2026-05-13

- **Preferences Hub (Options UI)**: Launched a dedicated configuration dashboard for user-defined toggles and export formatting.
- **Deep Shadow DOM Scraper**: Upgraded the extraction engine with recursive shadow root traversal for modern web-component architecture.
- **Persistent Intelligence Layer**: Integrated `chrome.storage.local` to preserve captured data across sessions.
- **Direct Page Interaction**: Developed a floating 'Capture' overlay that appears on product pages for a seamless user journey.
- **Inventory Search Engine**: Added real-time search and filtering to the inventory tab for high-volume data management.
- **Context Menu Integration**: Enabled right-click captures directly from the browser window.
- **Premium UI Overhaul**: Implemented a glassmorphic design system with tabbed navigation and dark mode support.
- **Extension Badging**: Added real-time inventory count tracking on the extension icon.


- Created a build-free Chrome Manifest V3 extension for product tab scraping and generic CSV export.
- Added a pure domain model for generic product records and validation warnings.
- Added CSV serialization utilities with deterministic column order.
- Added Chrome infrastructure for querying active/all current-window tabs, injecting the scraper, and downloading CSV files.
- Added `.wiki/verification.md` with the verified file inventory, syntax/manifest checks, layer audit, and behavior boundary.