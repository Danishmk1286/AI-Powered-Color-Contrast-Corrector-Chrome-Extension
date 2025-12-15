/**
 * DOM Utilities Module
 * Handles DOM manipulation, element detection, and visibility checks
 */

/**
 * Check if element is visible
 * @param {Element} el - Element to check
 * @returns {boolean} Whether element is visible
 */
export function isElementVisible(el) {
  if (!el) return false;
  
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

/**
 * Check if element has text content
 * @param {Element} el - Element to check
 * @returns {boolean} Whether element has text content
 */
export function hasTextContent(el) {
  if (!el) return false;
  
  const text = el.textContent?.trim() || '';
  return text.length > 0 && text.length <= 500; // Reasonable text length limit
}

/**
 * Check if element should be scanned for contrast issues
 * @param {Element} el - Element to check
 * @returns {boolean} Whether element should be scanned
 */
export function shouldScanElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  
  const tagName = el.tagName.toLowerCase();
  
  // Skip certain elements
  const skipTags = [
    'script', 'style', 'link', 'meta', 'title', 'noscript',
    'iframe', 'object', 'embed', 'svg', 'canvas', 'video', 'audio'
  ];
  
  if (skipTags.includes(tagName)) return false;
  
  // Skip hidden elements
  if (!isElementVisible(el)) return false;
  
  // Skip elements without text content
  if (!hasTextContent(el)) return false;
  
  // Skip elements that are too small
  const rect = el.getBoundingClientRect();
  if (rect.width < 5 || rect.height < 5) return false;
  
  return true;
}

/**
 * Get all relevant elements for scanning
 * @param {Element|Document} root - Root element to search from
 * @returns {Array} Array of relevant elements
 */
export function getRelevantElements(root = document) {
  const elements = [];
  
  // Use more specific selectors to reduce the number of elements
  const selectors = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
    'a', 'button', 'span', 'div', 'li', 'td', 'th',
    'label', 'input', 'textarea', 'select'
  ];
  
  selectors.forEach(selector => {
    const found = root.querySelectorAll(selector);
    found.forEach(el => {
      if (shouldScanElement(el) && !elements.includes(el)) {
        elements.push(el);
      }
    });
  });
  
  return elements;
}

/**
 * Get all elements (fallback method)
 * @param {Element|Document} root - Root element to search from
 * @returns {Array} Array of all elements
 */
export function getAllElements(root = document) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        return shouldScanElement(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );
  
  const elements = [];
  let node;
  while (node = walker.nextNode()) {
    elements.push(node);
  }
  
  return elements;
}

/**
 * Safe CSS property getter with fallback
 * @param {Element} el - Element to get property from
 * @param {string} property - CSS property name
 * @param {string} fallback - Fallback value
 * @returns {string} CSS property value
 */
export function getComputedStyleSafe(el, property, fallback = '') {
  try {
    const style = window.getComputedStyle(el);
    return style[property] || fallback;
  } catch (error) {
    console.warn(`Failed to get computed style ${property} for element:`, el, error);
    return fallback;
  }
}

/**
 * Safe inline style getter
 * @param {Element} el - Element to get style from
 * @param {string} property - CSS property name
 * @returns {string} Inline style value
 */
export function getInlineStyle(el, property) {
  try {
    return el.style[property] || '';
  } catch (error) {
    console.warn(`Failed to get inline style ${property} for element:`, el, error);
    return '';
  }
}

/**
 * Set inline style safely
 * @param {Element} el - Element to set style on
 * @param {string} property - CSS property name
 * @param {string} value - CSS property value
 */
export function setInlineStyle(el, property, value) {
  try {
    el.style[property] = value;
  } catch (error) {
    console.warn(`Failed to set inline style ${property} for element:`, el, error);
  }
}

/**
 * Remove inline style safely
 * @param {Element} el - Element to remove style from
 * @param {string} property - CSS property name
 */
export function removeInlineStyle(el, property) {
  try {
    el.style[property] = '';
  } catch (error) {
    console.warn(`Failed to remove inline style ${property} for element:`, el, error);
  }
}

/**
 * Check if element has explicit background
 * @param {Element} el - Element to check
 * @returns {boolean} Whether element has explicit background
 */
export function hasExplicitBackground(el) {
  if (!el) return false;
  
  const bg = getComputedStyleSafe(el, 'backgroundColor');
  return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
}

/**
 * Check if element has background gradient
 * @param {Element} el - Element to check
 * @returns {boolean} Whether element has background gradient
 */
export function hasBackgroundGradient(el) {
  if (!el) return false;
  
  const bg = getComputedStyleSafe(el, 'backgroundImage');
  return bg && bg !== 'none' && bg.includes('gradient');
}

/**
 * Check if element has background image
 * @param {Element} el - Element to check
 * @returns {boolean} Whether element has background image
 */
export function hasBackgroundImage(el) {
  if (!el) return false;
  
  const bg = getComputedStyleSafe(el, 'backgroundImage');
  return bg && bg !== 'none' && !bg.includes('gradient');
}

/**
 * Check if element is interactive (button, link, etc.)
 * @param {Element} el - Element to check
 * @returns {boolean} Whether element is interactive
 */
export function isInteractiveElement(el) {
  if (!el) return false;
  
  const tagName = el.tagName.toLowerCase();
  const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label'];
  
  return interactiveTags.includes(tagName) || 
         el.getAttribute('role') === 'button' ||
         el.getAttribute('onclick') !== null ||
         getComputedStyleSafe(el, 'cursor') === 'pointer';
}

/**
 * Extract element context information
 * @param {Element} el - Element to extract context from
 * @returns {Object} Element context information
 */
export function extractElementContext(el) {
  const tagName = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || '';
  const ariaLabel = el.getAttribute('aria-label') || '';
  const placeholder = el.getAttribute('placeholder') || '';
  
  // Determine element type for AI context
  let elementType = 'text';
  
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
    elementType = 'heading';
  } else if (tagName === 'button' || role === 'button') {
    elementType = 'button';
  } else if (tagName === 'a') {
    elementType = 'link';
  } else if (['input', 'textarea', 'select'].includes(tagName)) {
    elementType = 'input';
  } else if (tagName === 'label') {
    elementType = 'label';
  }
  
  return {
    tagName,
    role,
    ariaLabel,
    placeholder,
    elementType,
    hasBackgroundGradient: hasBackgroundGradient(el),
    hasBackgroundImage: hasBackgroundImage(el),
    isInteractive: isInteractiveElement(el)
  };
}

/**
 * Debounce function to limit execution frequency
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}