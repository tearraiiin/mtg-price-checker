# TCG Price Checker - Project Overview

A Chrome Extension for Magic: The Gathering (MTG) players to quickly check card prices at major Canadian retailers (401 Games, Face to Face Games).

## Core Mandates
- **Retailers:** Currently supports 401 Games (`store.401games.ca`), Face to Face Games (`facetofacegames.com`), and Emmett's Toy Stop (`emmettstoystop.com`).
- **Data Source:** Uses Shopify's Suggestion API (`/search/suggest.json`) to fetch product results.
- **Integration:** Targets `moxfield.com` for contextual price checking.

## Architecture & Components
The extension is built using Manifest V3 and consists of several key files:

### 1. `content.js` (Moxfield Integration)
- Observes the DOM for Moxfield's custom card dropdown menus.
- Injects a "Check Canadian Price" button into these menus.
- Attempts to extract the card name from the DOM or menu links (`manapool.com` or `cardkingdom.com` URLs).
- Sends a message to `background.js` when the button is clicked.

### 2. `background.js` (Service Worker)
- Listens for `openPriceCheck` actions.
- Opens a new Chrome window as a popup containing `popup.html` with the card name passed as a URL parameter.

### 3. `popup.html` & `popup.js` (Search Interface)
- The main search UI and logic.
- Can be opened via the extension icon or as a standalone window.
- Performs parallel searches to multiple retailers using `fetch`.
- Parses Shopify's JSON response to normalize titles, sets, and prices.
- Supports filtering: "Cheapest Vendor", "Cheapest Version", and "In Stock Only".
- Uses `setnames.json` for mapping set codes between different retailers' naming conventions.

### 4. `setnames.json`
- A lookup table mapping full set names (e.g., "Innistrad: Midnight Hunt") to codes or standardized names used by retailers.

## Key Workflows
1. **Search Flow:** The `performSearch` function in `popup.js` is the core logic. It builds specific search queries for Shopify (e.g., adding `product_type:"Magic: The Gathering Singles"` for 401 Games) to improve accuracy.
2. **Parsing Logic:** Retailers have different title formats. The extension uses regex to extract the base name and set code from the `title` field of the Shopify product object.
3. **Moxfield Context:** The `MutationObserver` in `content.js` is critical for identifying when Moxfield's dynamic menus appear.

## Sample Data
- `401_sample.json`, `f2f_sample.json`: Reference responses from the respective Shopify APIs for debugging parsing logic.

## Conventions
- **Vanilla JavaScript:** No external libraries are used; stick to native DOM APIs and `fetch`.
- **CSS:** Styling is embedded in HTML or injected via JS for simplicity in the extension environment.

## Adding a New Retailer
To add a new Shopify-based retailer, follow these steps in `popup.js`:

1.  **Register the Store:** Add the new retailer to the `STORES` array at the top of the file.
2.  **Configure Search:** In `performSearch()`, add a site-specific query filter (e.g., `product_type:"MTG Singles"`) to the `searchTasks` loop to improve results.
3.  **Implement Parsing:** Add a parsing block inside the fetch loop to extract `baseName` and `setCode` from the Shopify product `title`. Each retailer often has a unique title format (e.g., using `[]`, `()`, or `-`).
4.  **Update Set Mappings:** If the retailer uses unique set names, add them to `setnames.json` to ensure set codes are normalized across all stores.

**Compatibility Check:** A site is compatible if appending `/search/suggest.json?q=Black+Lotus&resources[type]=product` to its base URL returns a JSON object with product results.
