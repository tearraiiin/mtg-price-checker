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
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Load set names mapping
async function loadSetMap() {
  if (Object.keys(setMap).length > 0) return;
  try {
    const response = await fetch('setnames.json');
    const rawMap = await response.json();
    // Store both original and normalized keys for maximum compatibility
    setMap = { ...rawMap };
    for (const [name, code] of Object.entries(rawMap)) {
      setMap[name.toLowerCase()] = code;
    }
  } catch (e) {
    console.error("Failed to load setnames.json", e);
  }
}

// Reusable search function
async function performSearch(queryInput) {
  const input = document.getElementById('cardName');
  const rawQuery = (queryInput !== undefined ? queryInput : input.value).trim();
  
  // Clean the query: strip all non-letters/numbers (including ' ? - ,) but keep spaces
  const query = normalizeName(rawQuery);

  const resultsDiv = document.getElementById('results');
  const rawTitlesDiv = document.getElementById('rawTitles');

  if (!query) {
    resultsDiv.innerHTML = '';
    rawTitlesDiv.innerHTML = '';
    return;
  }

  // Update input UI
  if (queryInput !== undefined) {
    input.value = rawQuery;
  }

  const requestId = ++currentRequestId;
  const showCheapestVendor = document.getElementById('toggleCheapestVendor').checked;
  const showCheapestVersion = document.getElementById('toggleCheapestVersion').checked;
  const showInStockOnly = document.getElementById('toggleInStock').checked;

  resultsDiv.innerHTML = `<div style="color: #666;">Searching for "<strong>${rawQuery}</strong>"...</div>`;
  rawTitlesDiv.innerHTML = '';

  if (Object.keys(setMap).length === 0) await loadSetMap();
  if (requestId !== currentRequestId) return;

  const searchTasks = [];
  STORES.forEach(store => {
    // Broaden API search to avoid strict punctuation/formatting failures.
    // We rely on the local filter below to ensure accuracy.
    if (store.name === "401 Games") {
      searchTasks.push({ store, q: `product_type:"Magic: The Gathering Singles" ${query}` });
    } else if (store.name === "Face to Face") {
      searchTasks.push({ store, q: `vendor:Magic ${query}` });
    } else if (store.name === "Emmett's Toy Stop") {
      searchTasks.push({ store, q: `product_type:"MTG Single" ${query}` });
    } else {
      searchTasks.push({ store, q: `${query}` });
    }
  });

  try {
    const allRawTitles = [];
    const fetchPromises = searchTasks.map(async ({ store, q }) => {
      try {
        const cacheBuster = `&_cb=${Date.now()}`;
        const res = await fetch(`${store.url}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product${cacheBuster}`);
        const data = await res.json();
        const products = data.resources?.results?.products || [];
        products.forEach(p => allRawTitles.push(`${store.name}: ${p.title} (${p.available ? 'In' : 'Out'})`));

        return products.map(p => {
          let baseName = p.title;
          let setCode = "???";

          if (store.name === "401 Games") {
            // Match name: everything until " (" or " -" or end of string
            const nameMatch = p.title.match(/^(.+?)(?:\s+[\(-]|$)/);
            if (nameMatch) baseName = nameMatch[1].trim();
            const matches = p.title.match(/\(([^)]+)\)/g);
            if (matches) {
              const lastMatch = matches[matches.length - 1];
              const rawSet = lastMatch.substring(1, lastMatch.length - 1);
              setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
            }
          } else if (store.name === "Face to Face") {
            const nameMatch = p.title.match(/^([^[]+)/);
            if (nameMatch) baseName = nameMatch[1].trim();
            const matches = p.title.match(/\[([^\]]+)\]/g);
            if (matches && matches.length >= 2) {
              const rawSet = matches[matches.length - 2].substring(1, matches[matches.length - 2].length - 1);
              setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
            }
          } else if (store.name === "Emmett's Toy Stop") {
            // Format: STEAM VENTS (RTR-247) - [RETURN TO RAVNICA]
            const nameMatch = p.title.match(/^(.+?)(?:\s+\()/);
            if (nameMatch) baseName = nameMatch[1].trim();
            
            // Try to get set name from brackets first
            const bracketMatch = p.title.match(/\[([^\]]+)\]/);
            if (bracketMatch) {
              const rawSet = bracketMatch[1];
              setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
            } else {
              // Fallback to parentheses code
              const parenMatch = p.title.match(/\(([^)]+)\)/);
              if (parenMatch) {
                setCode = parenMatch[1].split('-')[0];
              }
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

    const seenUrls = new Set();
    allResults = allResults.filter(item => {
      if (seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      if (showInStockOnly && !item.available) return false;

      const baseClean = normalizeName(item.baseName);
      const queryClean = normalizeName(query);

      return baseClean === queryClean;
    });
    
    allResults.sort((a, b) => a.price - b.price);

    if (showCheapestVendor && showCheapestVersion) {
      allResults = allResults.length > 0 ? [allResults[0]] : [];
    } else if (showCheapestVendor) {
      const grouped = new Map();
      allResults.forEach(item => {
        const key = item.standardizedTitle.toLowerCase();
        if (!grouped.has(key)) grouped.set(key, item);
      });
      allResults = Array.from(grouped.values());
    } else if (showCheapestVersion) {
      const grouped = new Map();
      allResults.forEach(item => {
        const key = item.vendor.toLowerCase();
        if (!grouped.has(key)) grouped.set(key, item);
      });
      allResults = Array.from(grouped.values());
    }

    rawTitlesDiv.innerHTML = allRawTitles.length > 0 
      ? allRawTitles.map(t => `<div style="margin-bottom:2px; border-bottom:1px solid #eee;">${t}</div>`).join('')
      : 'No products returned from Shopify.';

    if (allResults.length > 0) {
      const tableHeaders = TABLE_COLUMNS.map(col => `<th>${col.header}</th>`).join('');
      const tableRows = allResults.map(item => {
        const cells = TABLE_COLUMNS.map(col => `<td>${col.render(item)}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      resultsDiv.innerHTML = `
        <table>
          <thead>
            <tr>${tableHeaders}</tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      `;
    } else {
      resultsDiv.innerHTML = `<div style="padding: 10px; color: #888;">No matches for "<strong>${query}</strong>".</div>`;
    }
  } catch (err) {
    resultsDiv.innerHTML = '<div style="color: red;">Search error. Check console.</div>';
  }
}

// Initial initialization
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('search');
  
  if (searchQuery) {
    const query = decodeURIComponent(searchQuery);
    // Clear the URL IMMEDIATELY before starting the search
    try {
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    } catch (e) {}
    
    performSearch(query);
  }
}

// Setup UI listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchBtn').addEventListener('click', () => performSearch());
  
  document.getElementById('cardName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch();
    }
  });

  ['toggleCheapestVendor', 'toggleCheapestVersion', 'toggleInStock'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => performSearch());
  });

  loadSetMap();
  init();
});
