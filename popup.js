const STORES = [
  { name: "401 Games", url: "https://store.401games.ca" },
  { name: "Face to Face", url: "https://facetofacegames.com" }
];

let setMap = {};
let currentRequestId = 0;

// Load set names mapping
async function loadSetMap() {
  if (Object.keys(setMap).length > 0) return;
  try {
    const response = await fetch('setnames.json');
    setMap = await response.json();
  } catch (e) {
    console.error("Failed to load setnames.json", e);
  }
}

// Reusable search function
async function performSearch(queryInput) {
  const input = document.getElementById('cardName');
  // Use provided query or read from input
  let query = (queryInput !== undefined ? queryInput : input.value).trim();
  
  // Strip commas from the query
  query = query.replace(/,/g, '');

  const resultsDiv = document.getElementById('results');
  const rawTitlesDiv = document.getElementById('rawTitles');

  if (!query) {
    resultsDiv.innerHTML = '';
    rawTitlesDiv.innerHTML = '';
    return;
  }

  // Update input UI if we were passed a query from elsewhere
  if (queryInput !== undefined) {
    input.value = query;
  }

  const requestId = ++currentRequestId;
  const showCheapestVendor = document.getElementById('toggleCheapestVendor').checked;
  const showCheapestVersion = document.getElementById('toggleCheapestVersion').checked;
  const showInStockOnly = document.getElementById('toggleInStock').checked;

  resultsDiv.innerHTML = `<div style="color: #666;">Searching for "<strong>${query}</strong>"...</div>`;
  rawTitlesDiv.innerHTML = '';

  if (Object.keys(setMap).length === 0) await loadSetMap();
  if (requestId !== currentRequestId) return;

  const searchTasks = [];
  STORES.forEach(store => {
    if (store.name === "401 Games") {
      searchTasks.push({ store, q: `product_type:"Magic: The Gathering Singles" "${query} ("` });
      searchTasks.push({ store, q: `product_type:"Magic: The Gathering Singles" "${query} -"` });
    } else if (store.name === "Face to Face") {
      searchTasks.push({ store, q: `vendor:Magic "${query} ["` });
    } else {
      searchTasks.push({ store, q: `"${query}"` });
    }
  });

  try {
    const allRawTitles = [];
    const fetchPromises = searchTasks.map(async ({ store, q }) => {
      try {
        const cacheBuster = `&_cb=${Date.now()}`;
        const res = await fetch(`${store.url}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product${cacheBuster}`);
        const data = await res.json();
        const products = data.resources.results.products || [];
        products.forEach(p => allRawTitles.push(`${store.name}: ${p.title} (${p.available ? 'In' : 'Out'})`));

        return products.map(p => {
          let baseName = p.title;
          let setCode = "???";

          if (store.name === "401 Games") {
            const nameMatch = p.title.match(/^([^(-]+)/);
            if (nameMatch) baseName = nameMatch[1].trim();
            const matches = p.title.match(/\(([^)]+)\)/g);
            if (matches) {
              const lastMatch = matches[matches.length - 1];
              const rawSet = lastMatch.substring(1, lastMatch.length - 1);
              setCode = setMap[rawSet] || rawSet;
            }
          } else if (store.name === "Face to Face") {
            const nameMatch = p.title.match(/^([^[]+)/);
            if (nameMatch) baseName = nameMatch[1].trim();
            const matches = p.title.match(/\[([^\]]+)\]/g);
            if (matches && matches.length >= 2) {
              const rawSet = matches[matches.length - 2].substring(1, matches[matches.length - 2].length - 1);
              setCode = setMap[rawSet] || rawSet;
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
    const queryLower = query.toLowerCase();
allResults = allResults.filter(item => {
  if (seenUrls.has(item.url)) return false;
  seenUrls.add(item.url);
  if (showInStockOnly && !item.available) return false;

  const titleLower = item.fullTitle.toLowerCase().replace(/,/g, '');
  const queryLower = query.toLowerCase();

  if (item.vendor === "401 Games") {
    return titleLower.startsWith(`${queryLower} (` ) || titleLower.startsWith(`${queryLower} -`);
  } else if (item.vendor === "Face to Face") {
    return titleLower.startsWith(`${queryLower} [`);
  }
  return item.baseName.toLowerCase().replace(/,/g, '') === queryLower;
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
      resultsDiv.innerHTML = allResults.map(item => `
        <div class="card-item">
          <div style="font-weight: 600;">${item.standardizedTitle}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
            <span class="vendor-tag">${item.vendor}</span>
            <span class="price">$${item.price.toFixed(2)}</span>
          </div>
          <div style="font-size: 0.7em; margin-top: 3px;"><a href="${item.url}" target="_blank">View Store</a></div>
        </div>
      `).join('');
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
    // This prevents the browser from thinking it needs to restore state
    try {
      const newUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    } catch (e) {}
    
    // Set search bar value and perform search
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

  // Load map and check for initial search
  loadSetMap();
  init();
});
