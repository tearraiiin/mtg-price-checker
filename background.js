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

const STORES = [
  { name: "401 Games", url: "https://store.401games.ca" },
  { name: "Face to Face", url: "https://facetofacegames.com" },
  { name: "Emmett's Toy Stop", url: "https://emmettstoystop.com" }
];

async function internalSearch(query) {
  await loadSetMap();
  const normalizedQuery = normalizeName(query);
  const rawQuery = query.trim();

  const searchTasks = STORES.map(store => {
    let q = rawQuery;
    if (store.name === "401 Games") {
      q = `product_type:"Magic: The Gathering Singles" ${rawQuery}`;
    } else if (store.name === "Face to Face") {
      // F2F's Shopify search is very sensitive to quotes. 
      // Using the quote-stripped normalized query for the fetch itself
      // ensures we get results for cards like Teferi's.
      q = `vendor:Magic ${normalizedQuery}`;
    } else if (store.name === "Emmett's Toy Stop") {
      q = `product_type:"MTG Single" ${rawQuery}`;
    }
    return { store, q };
  });

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
    } catch (e) {
      return [];
    }
  });

  const allResults = (await Promise.all(fetchPromises)).flat();
  const seenUrls = new Set();
  
  return allResults.filter(item => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    const normalizedBaseName = normalizeName(item.baseName);
    const segments = item.baseName.split(/\s+\/\/\s+|\s+\/\s+|\s+-\s+/);
    return normalizedBaseName === normalizedQuery || segments.some(seg => normalizeName(seg) === normalizedQuery);
  }).sort((a, b) => a.price - b.price);
}

// Handler for messages from the website (Dashboard)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.action === "checkExtension") {
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version });
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
    internalSearch(message.query).then(results => {
      sendResponse({ success: true, results });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }
});

// Handler for messages within the extension (Content Scripts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openPriceCheck") {
    const cardName = message.cardName;
    const url = chrome.runtime.getURL(`popup.html?search=${encodeURIComponent(cardName)}`);
    chrome.windows.create({
      url: url,
      type: "popup",
      width: 380,
      height: 550
    });
  }
});
