const STORES = [
  { name: "401 Games", url: "https://store.401games.ca" },
  { name: "Face to Face", url: "https://facetofacegames.com" },
  { name: "Emmett's Toy Stop", url: "https://emmettstoystop.com" }
];

const TABLE_COLUMNS = [
  { header: "Vendor", key: "vendor", render: (item) => `<div class="vendor-cell">${item.vendor}</div>` },
  { header: "Set", key: "setCode", render: (item) => `<div class="set-cell">${item.setCode}</div>` },
  { header: "Availability", key: "available", render: (item) => item.available ? '<span class="status-in">In Stock</span>' : '<span class="status-out">Out of Stock</span>' },
  { header: "Price", key: "price", render: (item) => `<span class="price-cell">$${item.price.toFixed(2)}</span>` },
  { header: "", key: "url", render: (item) => `<a href="${item.url}" target="_blank" class="buy-btn">Buy</a>` }
];

let setMap = {};
let currentRequestId = 0;
let lastResults = [];
let lastQuery = "";

const REMOTE_SET_MAP_URL = "https://mtgwishboard.vercel.app/setnames.json";
const LOCAL_SET_MAP_URL = "http://localhost:5173/setnames.json";
const DASHBOARD_URL = "https://mtgwishboard.vercel.app";

/**
 * Normalizes a string by:
 * 1. Converting to lowercase
 * 2. Treating hyphens as spaces (important for MTG names like All-seeing)
 * 3. Stripping all non-letter/non-number characters (except spaces)
 * 4. Collapsing multiple spaces into one
 * 5. Trimming
 */
function normalizeName(str) {
  if (!str) return "";
  return str.toLowerCase()
    .replace(/-/g, ' ')
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Load set names mapping
async function loadSetMap() {
  if (Object.keys(setMap).length > 0) return;
  
  const warning = document.getElementById('setWarning');

  try {
    // Try to get from storage first
    const data = await chrome.storage.local.get(['setMap', 'setMapTimestamp']);
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (data.setMap && data.setMapTimestamp && (Date.now() - data.setMapTimestamp < oneDay)) {
      setMap = data.setMap;
      return;
    }

    // Try Remote Vercel
    try {
      const response = await fetch(REMOTE_SET_MAP_URL);
      if (response.ok) {
        const rawMap = await response.json();
        setMap = { ...rawMap };
        for (const [name, code] of Object.entries(rawMap)) {
          setMap[name.toLowerCase()] = code;
        }
        await chrome.storage.local.set({ setMap: setMap, setMapTimestamp: Date.now() });
        if (warning) warning.style.display = 'none';
        return;
      }
    } catch (e) {}

    // Try Localhost (Dev fallback)
    try {
      const response = await fetch(LOCAL_SET_MAP_URL);
      if (response.ok) {
        const rawMap = await response.json();
        setMap = { ...rawMap };
        for (const [name, code] of Object.entries(rawMap)) {
          setMap[name.toLowerCase()] = code;
        }
        if (warning) warning.style.display = 'none';
        return;
      }
    } catch (e) {}

    // If both failed, show warning
    if (warning) warning.style.display = 'block';

  } catch (e) {
    console.error("Critical failure in loadSetMap", e);
    if (warning) warning.style.display = 'block';
  }
}

// Reusable search function
async function performSearch(queryInput, forceRefresh = false) {
  const input = document.getElementById('cardName');
  const rawQuery = (queryInput !== undefined ? queryInput : input.value).trim();
  const query = normalizeName(rawQuery);
  const resultsDiv = document.getElementById('results');

  if (!query) {
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
    "Emmett's Toy Stop": document.getElementById('store_emmetts').checked
  };

  // Use cache if query is the same and we aren't forcing a refresh
  if (!forceRefresh && query === lastQuery && lastResults.length > 0) {
    displayResults(lastResults, showCheapestVendor, showCheapestVersion, showInStockOnly, enabledStores, query, requestId);
    return;
  }

  resultsDiv.innerHTML = `<div style="color: #666;">Searching for "<strong>${rawQuery}</strong>"...</div>`;

  if (Object.keys(setMap).length === 0) await loadSetMap();
  if (requestId !== currentRequestId) return;

  const searchTasks = [];
  STORES.forEach(store => {
    if (!enabledStores[store.name]) return;

    if (store.name === "401 Games") {
      searchTasks.push({ store, q: `product_type:"Magic: The Gathering Singles" ${rawQuery}` });
    } else if (store.name === "Face to Face") {
      searchTasks.push({ store, q: `vendor:Magic ${query}` });
    } else if (store.name === "Emmett's Toy Stop") {
      searchTasks.push({ store, q: `product_type:"MTG Single" ${rawQuery}` });
    }
  });

  if (searchTasks.length === 0) {
    resultsDiv.innerHTML = `<div style="padding: 10px; color: #888;">Please enable at least one retailer.</div>`;
    return;
  }

  try {
    const fetchPromises = searchTasks.map(async ({ store, q }) => {
      try {
        const cacheBuster = `&_cb=${Date.now()}`;
        const res = await fetch(`${store.url}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product${cacheBuster}`);
        const data = await res.json();
        const products = data.resources?.results?.products || [];

        return products.map(p => {
          let baseName = p.title;
          let setCode = "???";

          if (store.name === "401 Games") {
            const nameMatch = p.title.match(/^(.+?)(?:\s+[\(-]|$)/);
            if (nameMatch) baseName = nameMatch[1].trim();
            const rawSet = p.vendor;
            setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
          } else if (store.name === "Face to Face") {
            const nameMatch = p.title.match(/^([^[]+)/);
            if (nameMatch) baseName = nameMatch[1].trim();
            const matches = p.title.match(/\[([^\]]+)\]/g);
            if (matches && matches.length >= 2) {
              const rawSet = matches[matches.length - 2].substring(1, matches[matches.length - 2].length - 1);
              setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
            }
          } else if (store.name === "Emmett's Toy Stop") {
            const nameMatch = p.title.match(/^(.+?)(?:\s+\()/);
            if (nameMatch) baseName = nameMatch[1].trim();
            const bracketMatch = p.title.match(/\[([^\]]+)\]/);
            if (bracketMatch) {
              const rawSet = bracketMatch[1];
              setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
            } else {
              const parenMatch = p.title.match(/\(([^)]+)\)/);
              if (parenMatch) setCode = parenMatch[1].split('-')[0];
            }
          }

          return {
            fullTitle: p.title,
            standardizedTitle: `${baseName}-${setCode}`,
            baseName: baseName,
            setCode: setCode,
            price: parseFloat(p.price_max),
            available: p.available,
            vendor: store.name,
            url: store.url + p.url
          };
        });
      } catch (e) { return []; }
    });

    let allResults = (await Promise.all(fetchPromises)).flat();
    if (requestId !== currentRequestId) return;

    // Save to cache
    lastResults = allResults;
    lastQuery = query;

    displayResults(allResults, showCheapestVendor, showCheapestVersion, showInStockOnly, enabledStores, query, requestId);

  } catch (err) {
    resultsDiv.innerHTML = '<div style="color: red;">Search error. Check console.</div>';
  }
}

function displayResults(results, showCheapestVendor, showCheapestVersion, showInStockOnly, enabledStores, query, requestId) {
  const resultsDiv = document.getElementById('results');
  const seenUrls = new Set();
  
  let filtered = results.filter(item => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    if (!enabledStores[item.vendor]) return false; // Filter out results from disabled stores (relevant for cached results)
    if (showInStockOnly && !item.available) return false;
    const normalizedBaseName = normalizeName(item.baseName);
    const segments = item.baseName.split(/\s+\/\/\s+|\s+\/\s+|\s+-\s+/);
    return normalizedBaseName === query || segments.some(seg => normalizeName(seg) === query);
  });
  
  // Per-vendor in-stock filtering: if a vendor has any in-stock items, only return those
  const resultsByVendor = {};
  filtered.forEach(item => {
    if (!resultsByVendor[item.vendor]) resultsByVendor[item.vendor] = [];
    resultsByVendor[item.vendor].push(item);
  });

  filtered = [];
  for (const vendor in resultsByVendor) {
    const vendorResults = resultsByVendor[vendor];
    const inStock = vendorResults.filter(r => r.available);
    if (inStock.length > 0) {
      filtered.push(...inStock);
    } else {
      filtered.push(...vendorResults);
    }
  }

  filtered.sort((a, b) => {
    // Prioritize in-stock items
    if (a.available !== b.available) {
      return a.available ? -1 : 1;
    }
    // Then sort by price
    return a.price - b.price;
  });

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
    store_emmetts: document.getElementById('store_emmetts').checked
  };
  await chrome.storage.local.set({ settings });
}

async function loadSettings() {
  const data = await chrome.storage.local.get(['settings']);
  if (data.settings) {
    document.getElementById('toggleCheapestVendor').checked = data.settings.showCheapestVendor ?? false;
    document.getElementById('toggleCheapestVersion').checked = data.settings.showCheapestVersion ?? false;
    document.getElementById('toggleInStock').checked = data.settings.showInStockOnly ?? true;
    document.getElementById('store_401').checked = data.settings.store_401 ?? true;
    document.getElementById('store_f2f').checked = data.settings.store_f2f ?? true;
    document.getElementById('store_emmetts').checked = data.settings.store_emmetts ?? true;
  }
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
    'store_401', 'store_f2f', 'store_emmetts'
  ];

  allToggles.forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      saveSettings();
      performSearch();
    });
  });

  loadSetMap();
  
  // Check for search parameter in URL
  console.log("Popup URL:", window.location.href);
  const params = new URLSearchParams(window.location.search);
  const searchQuery = params.get('search');
  console.log("Extracted searchQuery:", searchQuery);
  
  if (searchQuery) {
    const input = document.getElementById('cardName');
    if (input) {
      console.log("Setting input value to:", searchQuery);
      input.value = searchQuery;
    }
    performSearch(searchQuery, true);
  }
});
