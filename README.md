# Merchant Scroll (Extension)

The data-fetching engine and on-page integration for the MTG Price Checker ecosystem. Built with Manifest V3.

## Features
- **Moxfield Integration:** Injects "Check Prices" buttons into Moxfield's card dropdown menus for instant results.
- **Quick Search:** A lightweight popup for fast price checks across supported retailers.
- **CORS Proxy:** Acts as a secure bridge between the [MTG Wishboard Web Dashboard](../mtg-price-checker-web/) and retailer APIs.
- **Set Mapping:** Dynamically fetches and caches MTG set name mapping from the web dashboard.

## Installation
1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer Mode** (toggle in the top right).
4. Click **Load unpacked**.
5. Select this folder (`mtg-price-checker`).

## Usage
- **Moxfield Integration:**
  - **Contextual Search:** Right-click or left-click any card on [moxfield.com](https://www.moxfield.com/) (in Deck List, Visual, or Explorer views) to open its native menu.
  - **Injection:** The extension identifies legitimate card menus by looking for items like "Add to Collection" or "Switch Printing" and injects a **"Check Canadian Price"** button at the bottom.
  - **Direct Search:** Clicking the button instantly opens a price check for that specific card on the MTG Wishboard dashboard.
- **Quick Search:** Click the extension icon in your browser toolbar to perform a fast, manual search without leaving your current page.
- **Dashboard:** Open the [MTG Wishboard Dashboard](https://mtgwishboard.vercel.app/) for a full-screen experience with aggregate searching and watchlist management.

## Permissions & Privacy
- **Privacy Policy:** [PRIVACY.md](./PRIVACY.md)
- **Disclaimer:** [DISCLAIMER.md](./DISCLAIMER.md)
- **Permissions:** 
  - `storage`: For caching set names and search results.
  - `activeTab`: To interact with Moxfield cards.
  - `host_permissions`: To perform API requests to 401 Games, Face to Face Games, and Emmett's Toy Stop.
