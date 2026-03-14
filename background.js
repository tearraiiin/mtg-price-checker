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
