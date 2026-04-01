const TABLE_COLUMNS = [
  { header: "Vendor", key: "vendor", render: (item) => `<div class="vendor-cell">${item.vendor}</div>` },
  { header: "Set", key: "setCode", render: (item) => `<div class="set-cell">${item.setCode}</div>` },
  { header: "Availability", key: "available", render: (item) => item.available ? '<span class="status-in">In Stock</span>' : '<span class="status-out">Out of Stock</span>' },
  { header: "Price", key: "price", render: (item) => `<span class="price-cell">$${item.price.toFixed(2)}</span>` },
  { header: "", key: "url", render: (item) => `<a href="${item.url}" target="_blank" class="buy-btn">Buy</a>` }
];

let currentRequestId = 0;
let lastResults = [];
let lastQuery = "";

const DASHBOARD_URL = "https://mtgwishboard.vercel.app";

// Reusable search function
async function performSearch(queryInput, forceRefresh = false) {
  const input = document.getElementById('cardName');
  const rawQuery = (queryInput !== undefined ? queryInput : input.value).trim();
  const resultsDiv = document.getElementById('results');

  if (!rawQuery) {
    resultsDiv.innerHTML = '';
    lastResults = [];
    lastQuery = "";
    return;
  }

  if (queryInput !== undefined) input.value = rawQuery;

  const requestId = ++currentRequestId;
  const showCheapestVendor = document.getElementById('toggleCheapestVendor').checked;
  const showCheapestVersion = document.getElementById('toggleCheapestVersion').checked;
  const showInStockOnly = document.getElementById('toggleInStock').checked;

  // Retailer settings
  const enabledStores = {
    "401 Games": document.getElementById('store_401').checked,
    "Face to Face": document.getElementById('store_f2f').checked,
    "Emmett's Toy Stop": document.getElementById('store_emmetts').checked,
    "Hobbiesville": document.getElementById('store_hobbiesville').checked
  };

  // Use cache if query is the same and we aren't forcing a refresh
  if (!forceRefresh && rawQuery.toLowerCase() === lastQuery.toLowerCase() && lastResults.length > 0) {
    displayResults(lastResults, showCheapestVendor, showCheapestVersion, showInStockOnly, enabledStores, requestId);
    return;
  }

  resultsDiv.innerHTML = `<div style="color: #666;">Searching for "<strong>${rawQuery}</strong>"...</div>`;

  try {
    const stores = Object.keys(enabledStores).filter(name => enabledStores[name]);
    
    chrome.runtime.sendMessage({ 
      action: "performSearch", 
      query: rawQuery, 
      options: { onlyStores: stores } 
    }, (response) => {
      if (requestId !== currentRequestId) return;

      if (response && response.success) {
        lastResults = response.results;
        lastQuery = rawQuery;
        displayResults(lastResults, showCheapestVendor, showCheapestVersion, showInStockOnly, enabledStores, requestId);
      } else {
        resultsDiv.innerHTML = `<div style="color: red;">Search error: ${response?.error || 'Unknown error'}</div>`;
      }
    });
  } catch (err) {
    resultsDiv.innerHTML = '<div style="color: red;">Search error. Check console.</div>';
  }
}

function displayResults(results, showCheapestVendor, showCheapestVersion, showInStockOnly, enabledStores, requestId) {
  const resultsDiv = document.getElementById('results');
  
  // Basic UI filtering (In-stock and disabled stores)
  let filtered = results.filter(item => {
    if (!enabledStores[item.vendor]) return false;
    if (showInStockOnly && !item.available) return false;
    return true;
  });
  
  // Sorting is already handled by background.js (price + availability)

  if (showCheapestVendor && showCheapestVersion) {
    filtered = filtered.length > 0 ? [filtered[0]] : [];
  } else if (showCheapestVendor) {
    const grouped = new Map();
    filtered.forEach(item => {
      const key = item.standardizedTitle.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, item);
    });
    filtered = Array.from(grouped.values());
  } else if (showCheapestVersion) {
    const grouped = new Map();
    filtered.forEach(item => {
      const key = item.vendor.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, item);
    });
    filtered = Array.from(grouped.values());
  }

  if (filtered.length > 0) {
    const tableHeaders = TABLE_COLUMNS.map(col => `<th>${col.header}</th>`).join('');
    const tableRows = filtered.map(item => {
      const cells = TABLE_COLUMNS.map(col => `<td>${col.render(item)}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    resultsDiv.innerHTML = `<table><thead><tr>${tableHeaders}</tr></thead><tbody>${tableRows}</tbody></table>`;
  } else {
    resultsDiv.innerHTML = `<div style="padding: 10px; color: #888;">No matches found for the current filters.</div>`;
  }
}

async function saveSettings() {
  const settings = {
    showCheapestVendor: document.getElementById('toggleCheapestVendor').checked,
    showCheapestVersion: document.getElementById('toggleCheapestVersion').checked,
    showInStockOnly: document.getElementById('toggleInStock').checked,
    store_401: document.getElementById('store_401').checked,
    store_f2f: document.getElementById('store_f2f').checked,
    store_emmetts: document.getElementById('store_emmetts').checked,
    store_hobbiesville: document.getElementById('store_hobbiesville').checked
  };
  chrome.runtime.sendMessage({ action: "saveSettings", settings });
}

async function loadSettings() {
  chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
    if (response && response.success && response.settings) {
      const s = response.settings;
      document.getElementById('toggleCheapestVendor').checked = s.showCheapestVendor ?? false;
      document.getElementById('toggleCheapestVersion').checked = s.showCheapestVersion ?? false;
      document.getElementById('toggleInStock').checked = s.showInStockOnly ?? true;
      document.getElementById('store_401').checked = s.store_401 ?? true;
      document.getElementById('store_f2f').checked = s.store_f2f ?? true;
      document.getElementById('store_emmetts').checked = s.store_emmetts ?? true;
      document.getElementById('store_hobbiesville').checked = s.store_hobbiesville ?? true;
    }
  });
}

// Setup UI listeners
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();

  document.getElementById('searchBtn').addEventListener('click', () => performSearch(undefined, true));
  
  document.getElementById('cardName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch(undefined, true);
    }
  });

  document.getElementById('openDashboard').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: DASHBOARD_URL });
  });

  const allToggles = [
    'toggleCheapestVendor', 'toggleCheapestVersion', 'toggleInStock',
    'store_401', 'store_f2f', 'store_emmetts', 'store_hobbiesville'
  ];

  allToggles.forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      saveSettings();
      performSearch();
    });
  });
  
  // Check for search parameter in URL
  const params = new URLSearchParams(window.location.search);
  const searchQuery = params.get('search');
  
  if (searchQuery) {
    const input = document.getElementById('cardName');
    if (input) {
      input.value = searchQuery;
    }
    performSearch(searchQuery, true);
  }
});
