/**
 * Security Module
 * Provides secure DOM manipulation, input sanitization, and XSS prevention
 */

import { errorHandler, ErrorTypes, ErrorSeverity } from './errorHandler.js';

/**
 * XSS prevention and input sanitization utilities
 */
export class SecurityManager {
  constructor() {
    this.allowedTags = new Set(['b', 'i', 'em', 'strong', 'span', 'div', 'p', 'br']);
    this.allowedAttributes = new Set(['class', 'id', 'title', 'data-*']);
    this.sanitizationCache = new Map();
    this.maxCacheSize = 1000;
  }

  /**
   * Sanitize HTML content to prevent XSS
   */
  sanitizeHTML(html, options = {}) {
    try {
      if (!html || typeof html !== 'string') {
        return '';
      }
      
      // Check cache first
      const cacheKey = html + JSON.stringify(options);
      if (this.sanitizationCache.has(cacheKey)) {
        return this.sanitizationCache.get(cacheKey);
      }
      
      const {
        allowTags = this.allowedTags,
        allowAttributes = this.allowedAttributes,
        stripUnknown = true
      } = options;
      
      // Create a temporary element to parse HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      // Sanitize the DOM tree
      this.sanitizeDOM(tempDiv, { allowTags, allowAttributes, stripUnknown });
      
      const sanitized = tempDiv.innerHTML;
      
      // Cache result
      if (this.sanitizationCache.size >= this.maxCacheSize) {
        const firstKey = this.sanitizationCache.keys().next().value;
        this.sanitizationCache.delete(firstKey);
      }
      this.sanitizationCache.set(cacheKey, sanitized);
      
      return sanitized;
      
    } catch (error) {
      errorHandler.handle(new Error(`HTML sanitization failed: ${error.message}`));
      return this.escapeHTML(html); // Fallback to plain text
    }
  }

  /**
   * Sanitize DOM tree recursively
   */
  sanitizeDOM(element, options = {}) {
    try {
      const { allowTags = this.allowedTags, allowAttributes = this.allowedAttributes, stripUnknown = true } = options;
      
      // Process child nodes
      const children = Array.from(element.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          this.sanitizeElement(child, { allowTags, allowAttributes, stripUnknown });
        } else if (child.nodeType === Node.TEXT_NODE) {
          // Text nodes are generally safe, but escape if needed
          child.textContent = this.escapeHTML(child.textContent);
        }
      }
      
    } catch (error) {
      errorHandler.handle(new Error(`DOM sanitization failed: ${error.message}`));
    }
  }

  /**
   * Sanitize individual element
   */
  sanitizeElement(element, options = {}) {
    try {
      const { allowTags = this.allowedTags, allowAttributes = this.allowedAttributes, stripUnknown = true } = options;
      
      // Check if tag is allowed
      if (!allowTags.has(element.tagName.toLowerCase())) {
        if (stripUnknown) {
          // Replace with text content
          const textNode = document.createTextNode(element.textContent);
          element.parentNode.replaceChild(textNode, element);
          return;
        } else {
          // Remove completely
          element.parentNode.removeChild(element);
          return;
        }
      }
      
      // Sanitize attributes
      const attributes = Array.from(element.attributes);
      for (const attr of attributes) {
        if (!this.isAttributeAllowed(attr.name, allowAttributes)) {
          element.removeAttribute(attr.name);
        } else {
          // Sanitize attribute value
          attr.value = this.sanitizeAttributeValue(attr.name, attr.value);
        }
      }
      
      // Sanitize style attribute if present
      if (element.hasAttribute('style')) {
        element.setAttribute('style', this.sanitizeCSS(element.getAttribute('style')));
      }
      
      // Recursively sanitize children
      const children = Array.from(element.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          this.sanitizeElement(child, { allowTags, allowAttributes, stripUnknown });
        }
      }
      
    } catch (error) {
      errorHandler.handle(new Error(`Element sanitization failed: ${error.message}`));
    }
  }

  /**
   * Check if attribute is allowed
   */
  isAttributeAllowed(attributeName, allowedAttributes) {
    // Check exact match
    if (allowedAttributes.has(attributeName)) {
      return true;
    }
    
    // Check data-* attributes
    if (attributeName.startsWith('data-')) {
      return allowedAttributes.has('data-*');
    }
    
    return false;
  }

  /**
   * Sanitize attribute value
   */
  sanitizeAttributeValue(name, value) {
    try {
      // Escape HTML entities
      let sanitized = this.escapeHTML(value);
      
      // Additional validation for specific attributes
      switch (name.toLowerCase()) {
        case 'href':
        case 'src':
          return this.sanitizeURL(sanitized);
          
        case 'class':
          return sanitized.replace(/[^a-zA-Z0-9\s-_]/g, '');
          
        case 'id':
          return sanitized.replace(/[^a-zA-Z0-9-_]/g, '');
          
        default:
          return sanitized;
      }
    } catch (error) {
      errorHandler.handle(new Error(`Attribute value sanitization failed: ${error.message}`));
      return '';
    }
  }

  /**
   * Sanitize CSS to prevent style-based XSS
   */
  sanitizeCSS(css) {
    try {
      if (!css || typeof css !== 'string') {
        return '';
      }
      
      // Remove dangerous CSS properties and functions
      const dangerousPatterns = [
        /expression\s*\(/gi,           // IE expression()
        /javascript\s*:/gi,            // javascript: URLs
        /vbscript\s*:/gi,               // vbscript: URLs
        /data\s*:\s*text\/html/gi,      // data: URLs
        /behavior\s*:/gi,               // IE behavior
        /-moz-binding/gi,               // Firefox XBL
        /binding\s*:/gi,                 // Generic binding
        /url\s*\(\s*['"]*javascript/gi, // url(javascript:)
      ];
      
      let sanitized = css;
      for (const pattern of dangerousPatterns) {
        sanitized = sanitized.replace(pattern, '');
      }
      
      // Only allow safe CSS properties
      const safeProperties = [
        'color', 'background-color', 'border', 'border-radius', 'padding', 'margin',
        'font-size', 'font-weight', 'font-family', 'text-align', 'text-decoration',
        'display', 'visibility', 'opacity', 'width', 'height', 'max-width', 'max-height',
        'position', 'top', 'left', 'right', 'bottom', 'z-index'
      ];
      
      // Parse CSS and filter properties
      const declarations = sanitized.split(';');
      const safeDeclarations = [];
      
      for (const declaration of declarations) {
        const trimmed = declaration.trim();
        if (!trimmed) continue;
        
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) continue;
        
        const property = trimmed.substring(0, colonIndex).trim().toLowerCase();
        const value = trimmed.substring(colonIndex + 1).trim();
        
        if (safeProperties.includes(property) && value) {
          safeDeclarations.push(`${property}: ${value}`);
        }
      }
      
      return safeDeclarations.join('; ');
      
    } catch (error) {
      errorHandler.handle(new Error(`CSS sanitization failed: ${error.message}`));
      return '';
    }
  }

  /**
   * Sanitize URL to prevent javascript: and other dangerous protocols
   */
  sanitizeURL(url) {
    try {
      if (!url || typeof url !== 'string') {
        return '#';
      }
      
      const trimmed = url.trim();
      
      // Block dangerous protocols
      const dangerousProtocols = [
        'javascript:', 'vbscript:', 'data:', 'file:', 'about:',
        'chrome:', 'chrome-extension:', 'ms-', 'webkit-'
      ];
      
      const lowerUrl = trimmed.toLowerCase();
      for (const protocol of dangerousProtocols) {
        if (lowerUrl.startsWith(protocol)) {
          return '#';
        }
      }
      
      // Allow relative URLs and safe protocols
      if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('?')) {
        return trimmed;
      }
      
      // Allow http and https only
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
      }
      
      // Default to safe URL
      return '#';
      
    } catch (error) {
      errorHandler.handle(new Error(`URL sanitization failed: ${error.message}`));
      return '#';
    }
  }

  /**
   * Escape HTML entities
   */
  escapeHTML(text) {
    try {
      if (!text || typeof text !== 'string') {
        return '';
      }
      
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
      
    } catch (error) {
      // Fallback manual escaping
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }

  /**
   * Create secure DOM element
   */
  createSecureElement(tagName, attributes = {}, content = '') {
    try {
      const element = document.createElement(tagName);
      
      // Set attributes safely
      for (const [name, value] of Object.entries(attributes)) {
        if (this.isAttributeAllowed(name, this.allowedAttributes)) {
          const sanitizedValue = this.sanitizeAttributeValue(name, value);
          element.setAttribute(name, sanitizedValue);
        }
      }
      
      // Set content safely
      if (content) {
        if (typeof content === 'string') {
          element.textContent = content;
        } else if (content instanceof Node) {
          element.appendChild(content);
        }
      }
      
      return element;
      
    } catch (error) {
      errorHandler.handle(new Error(`Secure element creation failed: ${error.message}`));
      return document.createElement('div');
    }
  }

  /**
   * Set secure innerHTML
   */
  setSecureInnerHTML(element, html, options = {}) {
    try {
      const sanitized = this.sanitizeHTML(html, options);
      element.innerHTML = sanitized;
      return true;
    } catch (error) {
      errorHandler.handle(new Error(`Secure innerHTML failed: ${error.message}`));
      element.textContent = this.escapeHTML(html);
      return false;
    }
  }

  /**
   * Validate user input
   */
  validateInput(input, rules = {}) {
    try {
      const {
        type = 'string',
        minLength = 0,
        maxLength = 1000,
        pattern = null,
        required = false
      } = rules;
      
      // Check required
      if (required && (input === null || input === undefined || input === '')) {
        return { valid: false, error: 'This field is required' };
      }
      
      // Check type
      if (input !== null && input !== undefined) {
        if (type === 'string' && typeof input !== 'string') {
          return { valid: false, error: 'Must be a string' };
        }
        if (type === 'number' && typeof input !== 'number') {
          return { valid: false, error: 'Must be a number' };
        }
        if (type === 'boolean' && typeof input !== 'boolean') {
          return { valid: false, error: 'Must be a boolean' };
        }
      }
      
      // Check length
      if (typeof input === 'string') {
        if (input.length < minLength) {
          return { valid: false, error: `Minimum length is ${minLength}` };
        }
        if (input.length > maxLength) {
          return { valid: false, error: `Maximum length is ${maxLength}` };
        }
      }
      
      // Check pattern
      if (pattern && typeof input === 'string') {
        const regex = new RegExp(pattern);
        if (!regex.test(input)) {
          return { valid: false, error: 'Invalid format' };
        }
      }
      
      return { valid: true };
      
    } catch (error) {
      errorHandler.handle(new Error(`Input validation failed: ${error.message}`));
      return { valid: false, error: 'Validation error' };
    }
  }

  /**
   * Clear sanitization cache
   */
  clearCache() {
    this.sanitizationCache.clear();
  }

  /**
   * Get sanitization statistics
   */
  getStats() {
    return {
      cacheSize: this.sanitizationCache.size,
      maxCacheSize: this.maxCacheSize,
      allowedTags: Array.from(this.allowedTags),
      allowedAttributes: Array.from(this.allowedAttributes)
    };
  }
}

// Global security manager instance
export const securityManager = new SecurityManager();

/**
 * Secure wrapper for innerHTML assignment
 */
export function secureInnerHTML(element, html, options = {}) {
  return securityManager.setSecureInnerHTML(element, html, options);
}

/**
 * Create secure DOM element
 */
export function createSecureElement(tagName, attributes = {}, content = '') {
  return securityManager.createSecureElement(tagName, attributes, content);
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input, rules = {}) {
  return securityManager.validateInput(input, rules);
}