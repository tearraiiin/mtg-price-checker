console.log("MTG Price Checker: Content script loaded for Moxfield.");
let lastClickedCardName = "";

// Capture card name on right click
document.addEventListener('contextmenu', (event) => {
  const target = event.target;
  
  // Visual View (images or grid items)
  const visualCard = target.closest('.deck--visual-view-card, .card-grid-item');
  if (visualCard) {
    const img = visualCard.querySelector('img');
    if (img) {
      // Moxfield often puts the card name in the alt attribute of the img
      lastClickedCardName = (img.alt || "").split(' // ')[0].trim(); // Handle split cards
      return;
    }
  }

  // List View (text)
  const listCard = target.closest('.deck-list-card-name');
  if (listCard) {
    // Inner text might contain sub-elements, trim to be safe
    lastClickedCardName = listCard.innerText.split(' // ')[0].trim();
    return;
  }
}, true);

// Observe Moxfield's custom dropdown menu
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;

      // Check if the node itself is the menu or contains it
      const menu = node.classList.contains('dropdown-menu') ? node : node.querySelector('.dropdown-menu');
      if (menu) {
        injectPriceCheckItem(menu);
      }
    });
  }
});

observer.observe(document.body, { childList: true, subtree: true });

function injectPriceCheckItem(menu) {
  const ul = menu.querySelector('ul');
  if (!ul) return;

  // Prevent duplicate injection
  if (ul.querySelector('.canadian-price-check')) return;

  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'dropdown-item canadian-price-check';
  a.href = '#';
  a.innerText = 'Check Canadian Price';
  
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (lastClickedCardName) {
      chrome.runtime.sendMessage({
        action: "openPriceCheck",
        cardName: lastClickedCardName
      });
    }
    // Close the menu
    menu.style.display = 'none';
  });

  li.appendChild(a);
  ul.appendChild(li);
}