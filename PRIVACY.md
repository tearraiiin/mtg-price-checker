# Privacy Policy

**Effective Date:** March 17, 2026

Merchant Scroll ("the Extension") and MTG Wishboard ("the Website") are committed to protecting your privacy. This policy explains how we handle your data.

## 1. Data Collection & Processing
- **No Personal Data:** We do not collect, store, or transmit any personally identifiable information (PII) such as names, addresses, emails, or IP addresses.
- **User Activity:** The Extension monitors mouse clicks (specifically mousedown and contextmenu events) locally on your device to identify MTG cards you interact with on Moxfield.com. This activity is processed entirely in-memory and is never stored, logged, or transmitted.
- **Website Content:** The Extension reads card names, image "alt" tags, and internal URL patterns from the active Moxfield.com page to facilitate price checking. For the Bulk Search feature, the Extension processes card names and quantities from decklists provided by the user. This content is only used to populate your search queries and is not collected or shared.
- **Variant Resolution:** To facilitate the "Add to Cart" feature for decklists, the Extension may fetch a retailer's public product metadata (e.g., .js endpoint) to resolve the correct variant ID for a specific card version. This process is performed locally and does not involve the collection of user data.
- **Search Queries:** When you search for a card, the query is sent directly from your browser to the APIs of the supported retailers. We do not log or track your search history on any central server.
- **Local Storage:** The Extension and Website use `chrome.storage` and `localStorage` to save your preferences and personal watchlist locally on your device. This data is never shared with us.

## 2. Third-Party Services
- **Retailer APIs:** The Extension interacts with Shopify-based retailer APIs to fetch live pricing. These third parties may have their own privacy policies regarding how they handle incoming search requests.
- **Scryfall API:** The Website uses the Scryfall API to fetch card images and legality data.

## 3. Changes to This Policy
We may update this policy from time to time. Any changes will be reflected by the "Effective Date" at the top of this page.

## 4. Contact
For questions regarding this policy, please contact the project maintainer via the GitHub repository.
