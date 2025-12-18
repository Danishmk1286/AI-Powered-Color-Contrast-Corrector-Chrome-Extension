/**
 * API Configuration Module
 * Manages API endpoints, timeouts, and configuration
 */

// Default configuration
const DEFAULT_CONFIG = {
  API_ENDPOINTS: {
    PREDICT: '/predict',
    HEALTH: '/'
  },
  HOSTS: [
    'http://127.0.0.1:5000',
    'http://localhost:5000'
  ],
  TIMEOUT: 5000,
  RETRIES: 2,
  FALLBACK_MODE: 'wcag_only'
};

/**
 * Configuration manager for API settings
 */
class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.currentHostIndex = 0;
    this.loadConfig();
  }

  /**
   * Load configuration from storage or use defaults
   */
  async loadConfig() {
    try {
      const stored = await chrome.storage.local.get(['apiConfig']);
      if (stored.apiConfig) {
        this.config = { ...this.config, ...stored.apiConfig };
      }
    } catch (error) {
      console.warn('Failed to load API config, using defaults:', error);
    }
  }

  /**
   * Save configuration to storage
   */
  async saveConfig() {
    try {
      await chrome.storage.local.set({ apiConfig: this.config });
    } catch (error) {
      console.warn('Failed to save API config:', error);
    }
  }

  /**
   * Get current API base URL
   */
  getBaseUrl() {
    return this.config.HOSTS[this.currentHostIndex];
  }

  /**
   * Get full API endpoint URL
   */
  getEndpointUrl(endpoint) {
    const baseUrl = this.getBaseUrl();
    return `${baseUrl}${endpoint}`;
  }

  /**
   * Try next host in case of failure
   */
  tryNextHost() {
    this.currentHostIndex = (this.currentHostIndex + 1) % this.config.HOSTS.length;
    return this.currentHostIndex < this.config.HOSTS.length;
  }

  /**
   * Reset to first host
   */
  resetHost() {
    this.currentHostIndex = 0;
  }

  /**
   * Get configuration values
   */
  get(key) {
    return this.config[key];
  }

  /**
   * Set configuration value
   */
  set(key, value) {
    this.config[key] = value;
    this.saveConfig();
  }

  /**
   * Update multiple configuration values
   */
  update(config) {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }
}

// Create global config instance
export const configManager = new ConfigManager();

/**
 * API Error types
 */
export class APIError extends Error {
  constructor(message, type, statusCode = null) {
    super(message);
    this.name = 'APIError';
    this.type = type;
    this.statusCode = statusCode;
  }
}

/**
 * Sanitize input to prevent XSS attacks
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return String(input);
  }
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate API response
 * @param {any} response - API response to validate
 * @returns {boolean} Whether response is valid
 */
export function validateResponse(response) {
  if (!response || typeof response !== 'object') {
    return false;
  }
  
  // Check for required fields in prediction response
  if (response.hasOwnProperty('comfort') && response.hasOwnProperty('probability')) {
    return typeof response.comfort === 'number' && typeof response.probability === 'number';
  }
  
  // Check for health check response
  if (response.hasOwnProperty('status') && response.hasOwnProperty('model')) {
    return response.status === 'healthy' && typeof response.model === 'string';
  }
  
  return false;
}