const STORES = [
    { name: "401 Games", url: "https://store.401games.ca" },
    { name: "Face to Face", url: "https://facetofacegames.com" }
  ];
  
  let setMap = {};
  
  // Load set names mapping
  async function loadSetMap() {
    try {
      const response = await fetch('setnames.json');
      setMap = await response.json();
    } catch (e) {
      console.error("Failed to load setnames.json", e);
    }
  }
  
  // Reusable search function
  async function performSearch() {
    if (Object.keys(setMap).length === 0) await loadSetMap();

    const query = document.getElementById('cardName').value.trim();
    const showCheapestVendor = document.getElementById('toggleCheapestVendor').checked;
    const showCheapestVersion = document.getElementById('toggleCheapestVersion').checked;
    const showInStockOnly = document.getElementById('toggleInStock').checked;
    const resultsDiv = document.getElementById('results');
    const rawTitlesDiv = document.getElementById('rawTitles');
  
    if (!query) {
      resultsDiv.innerHTML = '';
      rawTitlesDiv.innerHTML = '';
      return;
    }
    
    resultsDiv.innerHTML = 'Searching...';
    rawTitlesDiv.innerHTML = '';
  
    const searchTasks = [];
    STORES.forEach(store => {
      if (store.name === "401 Games") {
        // Shopify-side filtering by product type
        searchTasks.push({ store, q: `product_type:"Magic: The Gathering Singles" "${query} ("` });
        searchTasks.push({ store, q: `product_type:"Magic: The Gathering Singles" "${query} -"` });
      } else if (store.name === "Face to Face") {
        // Shopify-side filtering by vendor
        searchTasks.push({ store, q: `vendor:Magic "${query} ["` });
      } else {
        searchTasks.push({ store, q: `"${query}"` });
      }
    });

    try {
      const allRawTitles = [];
      const fetchPromises = searchTasks.map(async ({store, q}) => {
        try {
          const res = await fetch(`${store.url}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product`);
          const data = await res.json();
          
          const products = data.resources.results.products;
          products.forEach(p => allRawTitles.push(`${store.name} [${q}]: ${p.title} (Available: ${p.available})`));

          return products.map(p => {
            let baseName = p.title;
            let setCode = "???";
  
            if (store.name === "401 Games") {
              // 401 Format: Card Name (Extra) (SET)
              // Name is everything before first ( or -
              const nameMatch = p.title.match(/^([^(-]+)/);
              if (nameMatch) baseName = nameMatch[1].trim();

              // Set is in the LAST parenthesis
              const matches = p.title.match(/\(([^)]+)\)/g);
              if (matches) {
                const lastMatch = matches[matches.length - 1];
                const rawSet = lastMatch.substring(1, lastMatch.length - 1);
                setCode = setMap[rawSet] || rawSet;
              }
            } else if (store.name === "Face to Face") {
              // F2F Format: Card Name [Number] [Set Name] [Finish]
              // Name is everything before first [
              const nameMatch = p.title.match(/^([^[]+)/);
              if (nameMatch) baseName = nameMatch[1].trim();

              // Set Name is in the SECOND TO LAST bracket
              const matches = p.title.match(/\[([^\]]+)\]/g);
              if (matches && matches.length >= 2) {
                const rawSet = matches[matches.length - 2].substring(1, matches[matches.length - 2].length - 1);
                setCode = setMap[rawSet] || rawSet;
              }
            }
  
            const standardizedTitle = `${baseName}-${setCode}`;
  
            return {
              fullTitle: p.title,
              standardizedTitle: standardizedTitle,
              baseName: baseName,
              setCode: setCode,
              price: parseFloat(p.price_max), // Use price_max for NM
              available: p.available,
              vendor: store.name,
              url: store.url + p.url
            };
          });
        } catch (e) { return []; }
      });
  
      let allResults = (await Promise.all(fetchPromises)).flat();

      // Deduplicate results (by URL)
      const seenUrls = new Set();
      allResults = allResults.filter(item => {
        if (seenUrls.has(item.url)) return false;
        seenUrls.add(item.url);
        return true;
      });

      // Display raw titles for debug
      rawTitlesDiv.innerHTML = allRawTitles.length > 0 
        ? allRawTitles.map(t => `<div>${t}</div>`).join('')
        : 'None returned.';
  
      // 1. STRICT FILTERING: Ensure the title follows the expected pattern for that vendor
      allResults = allResults.filter(item => {
        // Apply In-Stock filter
        if (showInStockOnly && !item.available) return false;

        const titleLower = item.fullTitle.toLowerCase();
        const queryLower = query.toLowerCase();
        
        if (item.vendor === "401 Games") {
          // Must contain "name (" or "name -"
          return titleLower.startsWith(`${queryLower} (` ) || titleLower.startsWith(`${queryLower} -`);
        } else if (item.vendor === "Face to Face") {
          // Must contain "name ["
          return titleLower.startsWith(`${queryLower} [`);
        }
        
        // Fallback: just match the base name exactly
        return item.baseName.toLowerCase() === queryLower;
      });
  
      // 2. APPLY FILTERS
      if (showCheapestVendor && showCheapestVersion) {
        // Show ONLY the single cheapest listing overall
        if (allResults.length > 0) {
          allResults.sort((a, b) => a.price - b.price);
          allResults = [allResults[0]];
        }
      } else if (showCheapestVendor) {
        // Show lowest price for each card version (collapse vendors)
        const grouped = new Map();
        allResults.forEach(item => {
          const key = item.standardizedTitle.toLowerCase();
          if (!grouped.has(key) || item.price < grouped.get(key).price) {
            grouped.set(key, item);
          }
        });
        allResults = Array.from(grouped.values());
      } else if (showCheapestVersion) {
        // Show lowest price for each vendor (collapse versions)
        const grouped = new Map();
        allResults.forEach(item => {
          const key = item.vendor.toLowerCase();
          if (!grouped.has(key) || item.price < grouped.get(key).price) {
            grouped.set(key, item);
          }
        });
        allResults = Array.from(grouped.values());
      }
  
      // 4. RENDER
      resultsDiv.innerHTML = allResults.length > 0 
        ? allResults.map(item => `
            <div class="card-item">
              <div style="font-weight: 600;">${item.standardizedTitle}</div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                <span class="vendor-tag">${item.vendor}</span>
                <span class="price">$${item.price.toFixed(2)}</span>
              </div>
            </div>
          `).join('')
        : 'No exact matches found.';
  
    } catch (err) {
      resultsDiv.innerHTML = 'Error searching stores.';
    }
  }
  
  // Event Listeners
  document.getElementById('searchBtn').addEventListener('click', performSearch);
  
  // Trigger search on Enter key
  document.getElementById('cardName').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  
  // AUTO-REFRESH: Trigger search when toggles change
  document.getElementById('toggleCheapestVendor').addEventListener('change', performSearch);
  document.getElementById('toggleCheapestVersion').addEventListener('change', performSearch);
  document.getElementById('toggleInStock').addEventListener('change', performSearch);

  // Check for search parameter on load
  window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('search');
    if (searchQuery) {
      document.getElementById('cardName').value = searchQuery;
      performSearch();
    }
  });