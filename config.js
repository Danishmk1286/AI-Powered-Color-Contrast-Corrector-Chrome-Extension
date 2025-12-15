// Configuration Management for Contrast Assistant Extension
// This file handles all configuration settings including API endpoints

class ConfigManager {
  constructor() {
    this.config = {
      // API Configuration
      api: {
        endpoints: [
          'http://127.0.0.1:5000',
          'http://localhost:5000',
          'https://contrast-api.example.com'
        ],
        timeout: 30000,
        retries: 3,
        retryDelay: 1000,
        healthCheckInterval: 30000
      },
      
      // Performance Settings
      performance: {
        batchSize: 50,
        debounceDelay: 300,
        maxElementsPerScan: 1000,
        scanTimeout: 60000,
        memoryThreshold: 50 // MB
      },
      
      // Contrast Settings
      contrast: {
        defaultComfortScale: 4.5,
        wcagAA: 4.5,
        wcagAAA: 7.0,
        minimumContrast: 3.0
      },
      
      // UI Settings
      ui: {
        highlightColor: '#ff6b6b',
        highlightOpacity: 0.3,
        tooltipDelay: 500,
        notificationDuration: 5000,
        progressUpdateInterval: 100
      },
      
      // Security Settings
      security: {
        maxInputLength: 1000,
        allowedTags: ['b', 'i', 'em', 'strong', 'span', 'div'],
        allowedAttributes: ['class', 'id', 'data-*']
      }
    };
    
    this.loadConfig();
  }
  
  // Load configuration from storage
  async loadConfig() {
    try {
      const stored = await chrome.storage.local.get('contrastAssistantConfig');
      if (stored.contrastAssistantConfig) {
        this.mergeConfig(stored.contrastAssistantConfig);
      }
    } catch (error) {
      console.warn('Failed to load configuration:', error);
    }
  }
  
  // Save configuration to storage
  async saveConfig() {
    try {
      await chrome.storage.local.set({
        contrastAssistantConfig: this.config
      });
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  }
  
  // Merge stored configuration with defaults
  mergeConfig(storedConfig) {
    this.deepMerge(this.config, storedConfig);
  }
  
  // Deep merge utility
  deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  
  // Get configuration value by path
  get(path, defaultValue = null) {
    const keys = path.split('.');
    let current = this.config;
    
    for (const key of keys) {
      if (current[key] === undefined) {
        return defaultValue;
      }
      current = current[key];
    }
    
    return current;
  }
  
  // Set configuration value by path
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = this.config;
    
    for (const key of keys) {
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[lastKey] = value;
    this.saveConfig();
  }
  
  // Get API endpoints
  getApiEndpoints() {
    return this.config.api.endpoints;
  }
  
  // Get API timeout
  getApiTimeout() {
    return this.config.api.timeout;
  }
  
  // Get retry configuration
  getRetryConfig() {
    return {
      retries: this.config.api.retries,
      delay: this.config.api.retryDelay
    };
  }
  
  // Get performance settings
  getPerformanceSettings() {
    return this.config.performance;
  }
  
  // Get contrast settings
  getContrastSettings() {
    return this.config.contrast;
  }
  
  // Get UI settings
  getUiSettings() {
    return this.config.ui;
  }
  
  // Get security settings
  getSecuritySettings() {
    return this.config.security;
  }
  
  // Update API endpoints
  updateApiEndpoints(endpoints) {
    if (Array.isArray(endpoints) && endpoints.length > 0) {
      this.config.api.endpoints = endpoints;
      this.saveConfig();
      return true;
    }
    return false;
  }
  
  // Add API endpoint
  addApiEndpoint(endpoint) {
    if (typeof endpoint === 'string' && endpoint.length > 0) {
      if (!this.config.api.endpoints.includes(endpoint)) {
        this.config.api.endpoints.push(endpoint);
        this.saveConfig();
        return true;
      }
    }
    return false;
  }
  
  // Remove API endpoint
  removeApiEndpoint(endpoint) {
    const index = this.config.api.endpoints.indexOf(endpoint);
    if (index > -1) {
      this.config.api.endpoints.splice(index, 1);
      this.saveConfig();
      return true;
    }
    return false;
  }
  
  // Reset to defaults
  resetToDefaults() {
    this.config = {
      api: {
        endpoints: [
          'http://127.0.0.1:5000',
          'http://localhost:5000',
          'https://contrast-api.example.com'
        ],
        timeout: 30000,
        retries: 3,
        retryDelay: 1000,
        healthCheckInterval: 30000
      },
      performance: {
        batchSize: 50,
        debounceDelay: 300,
        maxElementsPerScan: 1000,
        scanTimeout: 60000,
        memoryThreshold: 50
      },
      contrast: {
        defaultComfortScale: 4.5,
        wcagAA: 4.5,
        wcagAAA: 7.0,
        minimumContrast: 3.0
      },
      ui: {
        highlightColor: '#ff6b6b',
        highlightOpacity: 0.3,
        tooltipDelay: 500,
        notificationDuration: 5000,
        progressUpdateInterval: 100
      },
      security: {
        maxInputLength: 1000,
        allowedTags: ['b', 'i', 'em', 'strong', 'span', 'div'],
        allowedAttributes: ['class', 'id', 'data-*']
      }
    };
    this.saveConfig();
  }
}

// Create global config instance
const configManager = new ConfigManager();