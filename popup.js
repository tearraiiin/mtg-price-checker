const STORES = [
    { name: "401 Games", url: "https://store.401games.ca" },
    { name: "Face to Face", url: "https://facetofacegames.com" }
  ];
  
  // Reusable search function
  async function performSearch() {
    const query = document.getElementById('cardName').value.trim();
    const collapse = document.getElementById('toggleCollapse').checked;
    const showLowest = document.getElementById('toggleLowest').checked;
    const resultsDiv = document.getElementById('results');
  
    if (!query) {
      resultsDiv.innerHTML = '';
      return;
    }
    
    resultsDiv.innerHTML = 'Searching...';
  
    try {
      const fetchPromises = STORES.map(async (store) => {
        try {
          const res = await fetch(`${store.url}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`);
          const data = await res.json();
          
          return data.resources.results.products.map(p => {
            // Split name into [Base Name] and [Version Info]
            // Regex looks for the first (, [, or - to split
            const match = p.title.match(/^(.+?)\s*([(\[-].*)$/);
            const baseName = match ? match[1].trim() : p.title.trim();
            const versionInfo = match ? match[2].trim() : "";
  
            return {
              fullTitle: p.title,
              baseName: baseName,
              versionInfo: versionInfo,
              price: parseFloat(p.price),
              vendor: store.name,
              url: store.url + p.url
            };
          });
        } catch (e) { return []; }
      });
  
      let allResults = (await Promise.all(fetchPromises)).flat();
  
      // 1. STRICT FILTERING: Ensure the base name matches the query exactly (case-insensitive)
      allResults = allResults.filter(item => 
        item.baseName.toLowerCase() === query.toLowerCase()
      );
  
      // 2. APPLY COLLAPSE (Group by Base Name + Version, or just Base Name)
      if (collapse) {
        const grouped = new Map();
        allResults.forEach(item => {
          // When collapsed, we only care about the Base Name
          const key = item.baseName.toLowerCase();
          if (!grouped.has(key) || item.price < grouped.get(key).price) {
            grouped.set(key, item);
          }
        });
        allResults = Array.from(grouped.values());
      }
  
      // 3. APPLY LOWEST PRICE ONLY
      if (showLowest) {
        allResults.sort((a, b) => a.price - b.price);
        allResults = allResults.length > 0 ? [allResults[0]] : [];
      }
  
      // 4. RENDER
      resultsDiv.innerHTML = allResults.length > 0 
        ? allResults.map(item => `
            <div class="card-item">
              <div style="font-weight: 600;">${item.baseName}</div>
              <div style="font-size: 0.8em; color: #666; margin-bottom: 5px;">${item.versionInfo}</div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
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
  document.getElementById('toggleCollapse').addEventListener('change', performSearch);
  document.getElementById('toggleLowest').addEventListener('change', performSearch);