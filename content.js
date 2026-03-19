console.log("MTG Price Checker: Content script loaded for Moxfield.");
let lastClickedCardName = "";

// Helper to extract card name from Moxfield URL pattern: /cards/xxxxx-card-name
function getNameFromMoxfieldUrl(url) {
  if (!url) return null;
  try {
    const path = url.includes('http') ? new URL(url).pathname : url;
    // Matches /cards/ followed by 5 alphanumeric characters, a dash, and then the name
    const match = path.match(/\/cards\/[a-zA-Z0-9]{5}-([^/?#]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1].replace(/-/g, ' ')).trim();
    }
  } catch (e) {}
  return null;
}

// Capture card name on right click or left click
function captureCardName(event) {
  const target = event.target;
  
  // 1. Check for card link (Deck List / Explorer / Image Link)
  const link = target.closest('a[href*="/cards/"]');
  if (link) {
    const name = getNameFromMoxfieldUrl(link.getAttribute('href'));
    if (name) {
      lastClickedCardName = name;
      return;
    }
  }

  // 2. Check for image with alt text (Visual View)
  if (target.tagName === 'IMG' && target.alt) {
    lastClickedCardName = target.alt.split(' // ')[0].trim();
    return;
  }

  // 3. Try to find the card container for other views
  const cardContainer = target.closest('.deck--visual-view-card, .card-grid-item, .deck-list-card, [data-card-name]');
  if (cardContainer) {
    if (cardContainer.dataset.cardName) {
      lastClickedCardName = cardContainer.dataset.cardName.split(' // ')[0].trim();
      return;
    }

    const img = cardContainer.querySelector('img');
    if (img && img.alt) {
      lastClickedCardName = img.alt.split(' // ')[0].trim();
      return;
    }

    const nameEl = cardContainer.querySelector('.deck-list-card-name, .card-name');
    if (nameEl) {
      lastClickedCardName = nameEl.innerText.split(' // ')[0].trim();
      return;
    }
  }
}

document.addEventListener('contextmenu', captureCardName, true);
document.addEventListener('mousedown', captureCardName, true);

// Observe Moxfield's custom dropdown menu
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;

      const menu = node.classList.contains('dropdown-menu') ? node : node.querySelector('.dropdown-menu');
      if (menu) {
        const extractedName = extractCardNameFromMenu(menu);
        if (extractedName) {
          lastClickedCardName = extractedName;
          injectPriceCheckItem(menu);
        }
      }
    });
  }
});

observer.observe(document.body, { childList: true, subtree: true });

function extractCardNameFromMenu(menu) {
  const items = Array.from(menu.querySelectorAll('.dropdown-item'));
  
  // High-confidence marker: "Add to Collection" or "Add One" usually only appear on card menus
  const isCardMenu = items.some(item => 
    item.innerText.includes('Add to Collection') || 
    item.innerText.includes('Add One') ||
    item.innerText.includes('Switch Printing') ||
    item.innerText.includes('Move to Sideboard')
  );

  if (!isCardMenu) return null;

  // If it is a card menu, try to find the most accurate name
  // 1. Prioritize the name captured during the click event
  if (lastClickedCardName) {
    return lastClickedCardName;
  }

  // 2. Fallback: Check for internal Moxfield link in the menu
  const moxfieldLink = menu.querySelector('a[href*="/cards/"]');
  if (moxfieldLink) {
    const name = getNameFromMoxfieldUrl(moxfieldLink.getAttribute('href'));
    if (name) return name;
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