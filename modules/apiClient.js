/**
 * API Client Module
 * Handles all API communications with proper error handling and retries
 */

import { APIError, sanitizeInput, validateResponse } from './apiConfig.js';
import { ErrorHandler, ErrorTypes } from './errorHandler.js';

// Configuration will be injected from the main content script
let configManager = null;

// Set configuration
export function setConfig(configManagerInstance) {
  configManager = configManagerInstance;
}

/**
 * Check API health status
 * @returns {Promise<Object>} Health status object
 */
export async function checkAPIHealth() {
  if (!configManager) {
    throw new Error('Configuration not set. Call setConfig() first.');
  }
  
  const endpoints = configManager.getApiEndpoints();
  const timeout = configManager.getApiTimeout();
  
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(`${endpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return {
          healthy: true,
          endpoint: endpoint,
          response: await response.json().catch(() => ({}))
        };
      }
    } catch (error) {
      console.warn(`Health check failed for ${endpoint}:`, error.message);
    }
  }
  
  return {
    healthy: false,
    endpoint: null,
    response: null
  };
}

/**
 * Make AI prediction request with retries
 * @param {Object} payload - Request payload
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<Object>} Prediction response
 */
export async function callAI(elements, comfortScale, autoCorrect) {
  if (!configManager) {
    throw new Error('Configuration not set. Call setConfig() first.');
  }
  
  const retryConfig = configManager.getRetryConfig();
  let lastError;
  
  for (let attempt = 0; attempt <= retryConfig.retries; attempt++) {
    try {
      const health = await checkAPIHealth();
      if (!health.healthy) {
        throw new Error('API is not healthy');
      }
      
      const endpoint = health.endpoint;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), configManager.getApiTimeout());
      
      const sanitizedElements = elements.map(el => ({
        ...el,
        text: sanitizeInput(el.text || ''),
        selector: sanitizeInput(el.selector || '')
      }));
      
      const response = await fetch(`${endpoint}/predict`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          elements: sanitizedElements,
          comfort_scale: comfortScale,
          auto_correct: autoCorrect
        })
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new APIError(
          `AI prediction failed: ${response.status} ${response.statusText}`,
          'AI_PREDICTION_FAILED',
          response.status
        );
      }
      
      const data = await response.json();
      
      if (!validateResponse(data)) {
        throw new APIError('Invalid AI prediction response format', 'INVALID_RESPONSE');
      }
      
      return data;
      
    } catch (error) {
      lastError = error;
      
      if (attempt < retryConfig.retries) {
        console.warn(`AI call attempt ${attempt + 1} failed, retrying in ${retryConfig.delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, retryConfig.delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Get current API status with fallback handling
 * @returns {Promise<Object>} Status object with mode and health info
 */
export async function getAPIStatus() {
  try {
    const health = await checkAPIHealth();
    configManager.resetHost(); // Reset to first host on success
    
    return {
      mode: 'ai_assisted',
      healthy: true,
      model: health.model || 'unknown',
      host: configManager.getBaseUrl()
    };
  } catch (error) {
    console.warn('API unavailable, falling back to WCAG-only mode:', error.message);
    
    return {
      mode: 'wcag_only',
      healthy: false,
      error: error.message,
      host: configManager.getBaseUrl()
    };
  }
}

/**
 * Handle API errors with user-friendly messages
 * @param {Error} error - The error to handle
 * @returns {Object} Error information for display
 */
export function handleAPIError(error) {
  const errorInfo = {
    message: 'An error occurred',
    userMessage: 'Unable to process contrast analysis',
    type: 'UNKNOWN_ERROR'
  };

  if (error instanceof APIError) {
    errorInfo.type = error.type;
    
    switch (error.type) {
      case 'TIMEOUT':
        errorInfo.message = 'API request timeout';
        errorInfo.userMessage = 'Analysis is taking too long. Using WCAG-only mode.';
        break;
        
      case 'NETWORK_ERROR':
        errorInfo.message = 'Network error';
        errorInfo.userMessage = 'Cannot connect to AI service. Using WCAG-only mode.';
        break;
        
      case 'HEALTH_CHECK_FAILED':
        errorInfo.message = 'API health check failed';
        errorInfo.userMessage = 'AI service is unavailable. Using WCAG-only mode.';
        break;
        
      case 'PREDICTION_FAILED':
        errorInfo.message = 'AI prediction failed';
        errorInfo.userMessage = 'AI analysis failed. Using WCAG-only mode.';
        break;
        
      case 'INVALID_RESPONSE':
        errorInfo.message = 'Invalid API response';
        errorInfo.userMessage = 'Received invalid response. Using WCAG-only mode.';
        break;
        
      default:
        errorInfo.message = error.message;
        errorInfo.userMessage = 'AI service error. Using WCAG-only mode.';
    }
  } else {
    errorInfo.message = error.message;
    errorInfo.userMessage = 'An unexpected error occurred. Using WCAG-only mode.';
  }

  console.error(`API Error [${errorInfo.type}]: ${errorInfo.message}`);
  return errorInfo;
}