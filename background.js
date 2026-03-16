// Handler for messages from the website (Dashboard)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.action === "checkExtension") {
    // Return true just to let the website know we are here
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version });
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
