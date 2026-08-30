const TABLE_COLUMNS = [
  { header: "Vendor", key: "vendor", render: (item) => `<div class="vendor-cell">${item.vendor}</div>` },
  { header: "Set", key: "setCode", render: (item) => `<div class="set-cell">${item.setCode}</div>` },
  { header: "Availability", key: "available", render: (item) => item.available ? '<span class="status-in">In Stock</span>' : '<span class="status-out">Out of Stock</span>' },
  { header: "Price", key: "price", render: (item) => `<span class="price-cell">$${item.price.toFixed(2)}</span>` },
  { header: "", key: "url", render: (item) => `<a href="${item.url}" target="_blank" class="buy-btn">Buy</a>` }
];

const DEFAULT_VENDORS = [
  { id: "store_401", name: "401 Games", url: "https://store.401games.ca" },
  { id: "store_f2f", name: "Face to Face", url: "https://facetofacegames.com" },
  { id: "store_emmetts", name: "Emmett's Toy Stop", url: "https://emmettstoystop.com" },
  { id: "store_hobbiesville", name: "Hobbiesville", url: "https://hobbiesville.com" },
  { id: "store_houseofcards", name: "House of Cards", url: "https://houseofcards.ca" }
];

let vendors = [...DEFAULT_VENDORS];
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

  // Build enabledStores map dynamically
  const enabledStores = {};
  vendors.forEach(v => {
    const el = document.getElementById(v.id);
    enabledStores[v.name] = el ? el.checked : true;
  });

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
    showInStockOnly: document.getElementById('toggleInStock').checked
  };
  
  vendors.forEach(v => {
    const el = document.getElementById(v.id);
    if (el) {
      settings[v.id] = el.checked;
    }
  });

  chrome.runtime.sendMessage({ action: "saveSettings", settings });
}

async function loadSettings() {
  chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
    if (response && response.success && response.settings) {
      const s = response.settings;
      document.getElementById('toggleCheapestVendor').checked = s.showCheapestVendor ?? false;
      document.getElementById('toggleCheapestVersion').checked = s.showCheapestVersion ?? false;
      document.getElementById('toggleInStock').checked = s.showInStockOnly ?? true;
      
      vendors.forEach(v => {
        const el = document.getElementById(v.id);
        if (el) {
          el.checked = s[v.id] ?? true;
        }
      });
    }
  });
}

function renderVendorCheckboxes() {
  const listDiv = document.getElementById('vendorCheckboxesList');
  if (!listDiv) return;
  listDiv.innerHTML = '';

  const origins = vendors.map(v => v.url);
  chrome.runtime.sendMessage({ action: "checkPermissions", origins }, (response) => {
    const permissionsMap = {};
    if (response && response.success) {
      response.results.forEach(res => {
        permissionsMap[res.origin] = res.granted;
      });
    }

    // Check for ungranted optional permissions
    const ungrantedVendors = vendors.filter(v => !(permissionsMap[v.url] ?? false));
    const permissionBanner = document.getElementById('permissionBanner');
    const permissionStoresList = document.getElementById('permissionStoresList');
    const grantPermissionsBtn = document.getElementById('grantPermissionsBtn');

    if (permissionBanner && ungrantedVendors.length > 0) {
      permissionBanner.style.display = 'block';
      if (permissionStoresList) {
        permissionStoresList.textContent = ungrantedVendors.map(v => v.name).join(', ');
      }
      if (grantPermissionsBtn) {
        grantPermissionsBtn.onclick = () => {
          const reqOrigins = ungrantedVendors.map(v => v.url + '/*');
          chrome.permissions.request({ origins: reqOrigins }, (granted) => {
            if (granted) {
              renderVendorCheckboxes();
              saveSettings();
              performSearch();
            }
          });
        };
      }
    } else if (permissionBanner) {
      permissionBanner.style.display = 'none';
    }

    vendors.forEach(v => {
      const hasPermission = permissionsMap[v.url] ?? false;
      
      const toggleGroup = document.createElement('div');
      toggleGroup.className = 'toggle-group';
      
      const label = document.createElement('label');
      label.setAttribute('for', v.id);
      
      if (hasPermission) {
        label.innerText = v.name;
      } else {
        label.innerHTML = `${v.name} <span style="font-size:0.75em;color:#ff9900;font-weight:bold;">(Needs Approval)</span>`;
      }

      const switchLabel = document.createElement('label');
      switchLabel.className = 'switch';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = v.id;
      checkbox.checked = true;

      const slider = document.createElement('span');
      slider.className = 'slider';
      
      switchLabel.appendChild(checkbox);
      switchLabel.appendChild(slider);
      toggleGroup.appendChild(label);
      toggleGroup.appendChild(switchLabel);
      listDiv.appendChild(toggleGroup);

      checkbox.addEventListener('change', () => {
        if (checkbox.checked && !hasPermission) {
          chrome.permissions.request({ origins: [v.url + '/*'] }, (granted) => {
            if (granted) {
              renderVendorCheckboxes();
              saveSettings();
              performSearch();
            } else {
              checkbox.checked = false;
            }
          });
        } else {
          saveSettings();
          performSearch();
        }
      });
    });

    loadSettings();
  });
}

// Setup UI listeners
document.addEventListener('DOMContentLoaded', async () => {
  chrome.runtime.sendMessage({ action: "getVendors" }, (response) => {
    if (response && response.success && response.vendors) {
      vendors = response.vendors;
    }
    renderVendorCheckboxes();
  });

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

  const standardToggles = ['toggleCheapestVendor', 'toggleCheapestVersion', 'toggleInStock'];
  standardToggles.forEach(id => {
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
    setTimeout(() => performSearch(searchQuery, true), 100);
  }
});
