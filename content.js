console.log("MTG Price Checker: Content script loaded for Moxfield.");
let lastClickedCardName = "";

// Capture card name on right click or left click
function captureCardName(event) {
  const target = event.target;
  
  // Try to find the card container
  const cardContainer = target.closest('.deck--visual-view-card, .card-grid-item, .deck-list-card, [data-card-name]');
  
  if (cardContainer) {
    // 1. Check for data attribute (some sites use this)
    if (cardContainer.dataset.cardName) {
      lastClickedCardName = cardContainer.dataset.cardName.split(' // ')[0].trim();
      return;
    }

    // 2. Check for image alt (Visual View)
    const img = cardContainer.querySelector('img');
    if (img && img.alt) {
      lastClickedCardName = img.alt.split(' // ')[0].trim();
      return;
    }

    // 3. Check for name element (List View)
    const nameEl = cardContainer.querySelector('.deck-list-card-name, .card-name');
    if (nameEl) {
      lastClickedCardName = nameEl.innerText.split(' // ')[0].trim();
      return;
    }
  }

  // Fallback: Check if the target itself is the name element
  if (target.classList.contains('deck-list-card-name')) {
    lastClickedCardName = target.innerText.split(' // ')[0].trim();
  }
}

document.addEventListener('contextmenu', captureCardName, true);
document.addEventListener('mousedown', captureCardName, true);

// Observe Moxfield's custom dropdown menu
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;

      // Check if the node itself is the menu or contains it
      const menu = node.classList.contains('dropdown-menu') ? node : node.querySelector('.dropdown-menu');
      if (menu) {
        // When a menu opens, ALWAYS try to refresh the card name from its contents
        const extractedName = extractCardNameFromMenu(menu);
        if (extractedName) {
          lastClickedCardName = extractedName;
        }
        injectPriceCheckItem(menu);
      }
    });
  }
});

observer.observe(document.body, { childList: true, subtree: true });

function extractCardNameFromMenu(menu) {
  const manapoolLink = menu.querySelector('a[href*="manapool.com/card/"]');
  const ckLink = menu.querySelector('a[href*="cardkingdom.com/mtg/"]');
  
  if (manapoolLink) {
    try {
      const url = new URL(manapoolLink.href);
      const pathParts = url.pathname.split('/').filter(p => p);
      if (pathParts.length > 0) {
        return decodeURIComponent(pathParts[pathParts.length - 1].replace(/-/g, ' '));
      }
    } catch (err) {}
  } 
  
  if (ckLink) {
    try {
      const url = new URL(ckLink.href);
      const pathParts = url.pathname.split('/').filter(p => p);
      if (pathParts.length > 0) {
        return decodeURIComponent(pathParts[pathParts.length - 1].replace(/-/g, ' '));
      }
    } catch (err) {}
  }
  return null;
}

function injectPriceCheckItem(menu) {
  // Prevent duplicate injection
  if (menu.querySelector('.canadian-price-check')) return;

  // Try to find a container: either a UL or a DIV that contains dropdown-items
  let container = menu.querySelector('ul');
  if (!container) {
    // If no UL, look for the column that has "Buy on" links
    const buyLinks = Array.from(menu.querySelectorAll('a.dropdown-item')).filter(a => 
      a.innerText.includes('Buy on') || a.href.includes('tcgplayer.com') || a.href.includes('cardkingdom.com')
    );
    
    if (buyLinks.length > 0) {
      container = buyLinks[0].parentElement;
    } else {
      // Fallback: just look for the first div that has dropdown-item children
      const firstItem = menu.querySelector('.dropdown-item');
      if (firstItem) {
        container = firstItem.parentElement;
      }
    }
  }

  if (!container) return;

  const a = document.createElement('a');
  a.className = 'dropdown-item canadian-price-check';
  a.style.cursor = 'pointer';
  a.innerText = 'Check Canadian Price';
  
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (lastClickedCardName) {
      chrome.runtime.sendMessage({
        action: "openPriceCheck",
        cardName: lastClickedCardName
      });
    } else {
      console.error("MTG Price Checker: Could not determine card name.");
      alert("Could not determine card name. Please try right-clicking the card first.");
    }
    // Close the menu
    menu.style.display = 'none';
  });

  if (container.tagName.toLowerCase() === 'ul') {
    const li = document.createElement('li');
    li.appendChild(a);
    container.appendChild(li);
  } else {
    // For div containers, we might want to add a divider before our link
    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';
    container.appendChild(divider);
    container.appendChild(a);
  }
}