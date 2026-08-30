let setMap = {};
const REMOTE_SET_MAP_URL = "https://mtgwishboard.vercel.app/setnames.json";
const LOCAL_SET_MAP_URL = "http://localhost:5173/setnames.json";

// Load set names mapping
async function loadSetMap() {
  if (Object.keys(setMap).length > 0) return;

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
        return;
      }
    } catch (e) {}

  } catch (e) {
    console.error("Critical failure in loadSetMap", e);
  }
}

function normalizeName(str) {
  if (!str) return "";
  return str.toLowerCase()
    .replace(/-/g, ' ')
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DEFAULT_VENDORS = [
  {
    "id": "store_401",
    "name": "401 Games",
    "url": "https://store.401games.ca",
    "queryTemplate": "product_type:\"Magic: The Gathering Singles\" {rawQuery}",
    "parser": {
      "type": "vendor_set",
      "nameRegex": "^(.+?)(?:\\s+[\\(-]|$)"
    }
  },
  {
    "id": "store_f2f",
    "name": "Face to Face",
    "url": "https://facetofacegames.com",
    "queryTemplate": "vendor:Magic {normalizedQuery}",
    "parser": {
      "type": "title_brackets_ftf",
      "nameRegex": "^([^\\[]+)",
      "setRegex": "\\[([^\\]]+)\\]"
    }
  },
  {
    "id": "store_emmetts",
    "name": "Emmett's Toy Stop",
    "url": "https://emmettstoystop.com",
    "queryTemplate": "product_type:\"MTG Single\" {rawQuery}",
    "parser": {
      "type": "title_brackets_or_paren",
      "nameRegex": "^(.+?)(?:\\s+\\()",
      "setRegex": "\\[([^\\]]+)\\]",
      "fallbackSetRegex": "\\(([^)]+)\\)"
    }
  },
  {
    "id": "store_hobbiesville",
    "name": "Hobbiesville",
    "url": "https://hobbiesville.com",
    "queryTemplate": "tag:Brands_Magicthegathering product_type:Single {rawQuery}",
    "parser": {
      "type": "vendor_set",
      "nameRegex": "^(.+?)(?:\\s+[\\(-]|$)"
    }
  },
  {
    "id": "store_houseofcards",
    "name": "House of Cards",
    "url": "https://houseofcards.ca",
    "queryTemplate": "product_type:\"MTG Single\" {rawQuery}",
    "parser": {
      "type": "title_brackets",
      "nameRegex": "^([^\\[]+)",
      "setRegex": "\\[([^\\]]+)\\]"
    }
  }
];

let vendorsConfig = [...DEFAULT_VENDORS];
const REMOTE_VENDORS_URL = "https://mtgwishboard.vercel.app/vendors.json";
const LOCAL_VENDORS_URL = "http://localhost:5173/vendors.json";

async function loadVendorsConfig(force = false) {
  try {
    const data = await chrome.storage.local.get(['vendorsConfig', 'vendorsConfigTimestamp']);
    const fiveMinutes = 5 * 60 * 1000;
    
    if (!force && data.vendorsConfig && data.vendorsConfigTimestamp && (Date.now() - data.vendorsConfigTimestamp < fiveMinutes)) {
      vendorsConfig = data.vendorsConfig;
      return;
    }

    const cb = `?_cb=${Date.now()}`;

    // Try Localhost (Dev)
    try {
      const response = await fetch(LOCAL_VENDORS_URL + cb);
      if (response.ok) {
        vendorsConfig = await response.json();
        await chrome.storage.local.set({ vendorsConfig: vendorsConfig, vendorsConfigTimestamp: Date.now() });
        return;
      }
    } catch (e) {}

    // Try Remote Vercel
    try {
      const response = await fetch(REMOTE_VENDORS_URL + cb);
      if (response.ok) {
        vendorsConfig = await response.json();
        await chrome.storage.local.set({ vendorsConfig: vendorsConfig, vendorsConfigTimestamp: Date.now() });
        return;
      }
    } catch (e) {}

    if (data.vendorsConfig && data.vendorsConfig.length >= DEFAULT_VENDORS.length) {
      vendorsConfig = data.vendorsConfig;
    } else {
      vendorsConfig = [...DEFAULT_VENDORS];
    }
  } catch (e) {
    console.error("Failure loading vendors config", e);
  }
}

async function resolveVariant(storeUrl, productUrl) {
  try {
    // Construct the correct absolute URL for the .js endpoint
    let baseUrl = productUrl;
    if (productUrl.startsWith('/')) {
      baseUrl = storeUrl.replace(/\/$/, '') + productUrl;
    }
    
    const jsUrl = baseUrl.split('?')[0] + ".js";
    console.log("Resolving variant from:", jsUrl);
    
    const res = await fetch(jsUrl);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    
    const product = await res.json();
    
    // Pick the first available variant, or first variant if none are available
    const variant = product.variants.find(v => v.available) || product.variants[0];
    
    if (variant) {
      console.log("Found variant ID:", variant.id, "for", baseUrl);
      return variant.id;
    }
    return null;
  } catch (e) {
    console.error("Error resolving variant for", productUrl, e);
    return null;
  }
}

async function internalSearch(query, options = {}) {
  await loadSetMap();
  await loadVendorsConfig();
  const normalizedQuery = normalizeName(query);
  const rawQuery = query.trim();

  // Load store settings
  const storageData = await chrome.storage.local.get(['settings']);
  const settings = storageData.settings || {};

  const enabledStores = {};
  vendorsConfig.forEach(store => {
    if (options.onlyStores) {
      enabledStores[store.name] = options.onlyStores.includes(store.name);
    } else {
      enabledStores[store.name] = settings[store.id] ?? true;
    }
  });

  const searchTasks = [];
  for (const store of vendorsConfig) {
    if (enabledStores[store.name]) {
      const origin = store.url;
      const hasPerm = await new Promise((resolve) => {
        chrome.permissions.contains({ origins: [origin + '/*'] }, (result) => {
          resolve(!!result);
        });
      });

      if (hasPerm) {
        const useScryfall = settings.useScryfall !== false;
        let q = useScryfall
          ? store.queryTemplate
              .replace("{rawQuery}", rawQuery)
              .replace("{normalizedQuery}", normalizedQuery)
          : rawQuery;
        searchTasks.push({ store, q });
      } else {
        console.warn(`No permission for origin: ${origin}, skipping search.`);
      }
    }
  }

  if (searchTasks.length === 0) return [];

  const fetchPromises = searchTasks.map(async ({ store, q }) => {
    try {
      const cacheBuster = `&_cb=${Date.now()}`;
      const res = await fetch(`${store.url}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product${cacheBuster}`);
      const data = await res.json();
      const products = data.resources?.results?.products || [];

      return products.map(p => {
        let baseName = p.title;
        let setCode = "???";

        const parser = store.parser || {};
        if (parser.type === "vendor_set") {
          const nameRegex = new RegExp(parser.nameRegex || "^(.+?)(?:\\s+[\\(-]|$)");
          const nameMatch = p.title.match(nameRegex);
          if (nameMatch) baseName = nameMatch[1].trim();
          const rawSet = p.vendor;
          setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
        } else if (parser.type === "title_brackets_ftf") {
          const nameRegex = new RegExp(parser.nameRegex || "^([^[]+)");
          const nameMatch = p.title.match(nameRegex);
          if (nameMatch) baseName = nameMatch[1].trim();
          const matches = p.title.match(/\[([^\]]+)\]/g);
          if (matches && matches.length >= 2) {
            const rawSet = matches[matches.length - 2].substring(1, matches[matches.length - 2].length - 1);
            setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
          }
        } else if (parser.type === "title_brackets_or_paren") {
          const nameRegex = new RegExp(parser.nameRegex || "^(.+?)(?:\\s+\\()");
          const nameMatch = p.title.match(nameRegex);
          if (nameMatch) baseName = nameMatch[1].trim();
          const bracketMatch = p.title.match(new RegExp(parser.setRegex || "\\[([^\\]]+)\\]"));
          if (bracketMatch) {
            const rawSet = bracketMatch[1];
            setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
          } else {
            const parenMatch = p.title.match(new RegExp(parser.fallbackSetRegex || "\\(([^)]+)\\)"));
            if (parenMatch) setCode = parenMatch[1].split('-')[0];
          }
        } else if (parser.type === "title_brackets") {
          const nameRegex = new RegExp(parser.nameRegex || "^([^\\[]+)");
          const nameMatch = p.title.match(nameRegex);
          if (nameMatch) baseName = nameMatch[1].trim();
          const bracketMatch = p.title.match(new RegExp(parser.setRegex || "\\[([^\\]]+)\\]"));
          if (bracketMatch) {
            const rawSet = bracketMatch[1];
            setCode = setMap[rawSet] || setMap[rawSet.toLowerCase()] || rawSet;
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
    } catch (e) {
      console.error(`Error querying store ${store.name}:`, e);
      return [];
    }
  });

  let allResults = (await Promise.all(fetchPromises)).flat();
  const seenUrls = new Set();

  const useScryfall = settings.useScryfall !== false;
  const superClean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanQuery = superClean(query);

  allResults = allResults.filter(item => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);

    if (!useScryfall) {
      const cleanTitle = superClean(item.fullTitle);
      return cleanTitle.includes(cleanQuery);
    }

    const normalizedBaseName = normalizeName(item.baseName);
    const segments = item.baseName.split(/\s+\/\/\s+|\s+\/\s+|\s+-\s+/);
    return normalizedBaseName === normalizedQuery || segments.some(seg => normalizeName(seg) === normalizedQuery);
  });

  // Per-vendor in-stock filtering
  const resultsByVendor = {};
  allResults.forEach(item => {
    if (!resultsByVendor[item.vendor]) resultsByVendor[item.vendor] = [];
    resultsByVendor[item.vendor].push(item);
  });

  allResults = [];
  for (const vendor in resultsByVendor) {
    const vendorResults = resultsByVendor[vendor];
    const inStock = vendorResults.filter(r => r.available);
    if (inStock.length > 0) {
      allResults.push(...inStock);
    } else {
      allResults.push(...vendorResults);
    }
  }

  allResults.sort((a, b) => {
    if (a.available !== b.available) {
      return a.available ? -1 : 1;
    }
    return a.price - b.price;
  });

  // If requested, resolve variant IDs for the top matches
  if (options.resolveVariantIds) {
    const resolutionTasks = allResults.map(async (item) => {
      const store = vendorsConfig.find(s => s.name === item.vendor);
      if (store) {
        item.variantId = await resolveVariant(store.url, item.url);
      }
      return item;
    });
    return await Promise.all(resolutionTasks);
  }

  return allResults;
}

// Handler for messages from the website (Dashboard)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.action === "checkExtension") {
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version });
    return true;
  } else if (message.action === "getSettings") {
    chrome.storage.local.get(['settings']).then(data => {
      sendResponse({ success: true, settings: data.settings || {} });
    });
    return true;
  } else if (message.action === "saveSettings") {
    chrome.storage.local.set({ settings: message.settings }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === "openPriceCheck") {
    const cardName = message.cardName;
    const url = chrome.runtime.getURL(`popup.html?search=${encodeURIComponent(cardName)}`);
    chrome.windows.create({
      url: url,
      type: "popup",
      width: 380,
      height: 550
    });
    sendResponse({ success: true });
    return true;
  } else if (message.action === "performSearch") {
    internalSearch(message.query, message.options).then(results => {
      sendResponse({ success: true, results });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "resolveVariant") {
    resolveVariant(message.storeUrl, message.productUrl).then(variantId => {
      sendResponse({ success: true, variantId });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "checkPermissions") {
    const checkPromises = message.origins.map(origin => {
      return new Promise((resolve) => {
        chrome.permissions.contains({ origins: [origin + '/*'] }, (result) => {
          resolve({ origin, granted: !!result });
        });
      });
    });
    Promise.all(checkPromises).then(results => {
      sendResponse({ success: true, results });
    });
    return true;
  } else if (message.action === "getVendors") {
    loadVendorsConfig(true).then(() => {
      sendResponse({ success: true, vendors: vendorsConfig });
    });
    return true;
  }
});

// Handler for messages within the extension (Popup, Content Scripts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openPriceCheck") {
    const cardName = message.cardName;
    const url = chrome.runtime.getURL(`popup.html?search=${encodeURIComponent(cardName)}`);
    console.log("Opening internal price check for:", cardName, "URL:", url);
    chrome.windows.create({
      url: url,
      type: "popup",
      width: 380,
      height: 550
    });
    sendResponse({ success: true });
  } else if (message.action === "performSearch") {
    internalSearch(message.query, message.options).then(results => {
      sendResponse({ success: true, results });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "resolveVariant") {
    resolveVariant(message.storeUrl, message.productUrl).then(variantId => {
      sendResponse({ success: true, variantId });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (message.action === "getSettings") {
    chrome.storage.local.get(['settings']).then(data => {
      sendResponse({ success: true, settings: data.settings || {} });
    });
    return true;
  } else if (message.action === "saveSettings") {
    chrome.storage.local.set({ settings: message.settings }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === "checkPermissions") {
    const checkPromises = message.origins.map(origin => {
      return new Promise((resolve) => {
        chrome.permissions.contains({ origins: [origin + '/*'] }, (result) => {
          resolve({ origin, granted: !!result });
        });
      });
    });
    Promise.all(checkPromises).then(results => {
      sendResponse({ success: true, results });
    });
    return true;
  } else if (message.action === "getVendors") {
    loadVendorsConfig(true).then(() => {
      sendResponse({ success: true, vendors: vendorsConfig });
    });
    return true;
  }
});
