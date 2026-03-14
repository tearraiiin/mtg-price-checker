# TCG Price Checker - Project Overview

A Chrome Extension for Magic: The Gathering (MTG) players to quickly check card prices at major Canadian retailers (401 Games, Face to Face Games).

## Core Mandates
- **Retailers:** Currently supports 401 Games (`store.401games.ca`) and Face to Face Games (`facetofacegames.com`).
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
