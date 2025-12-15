/**
 * Error Handling Module
 * Provides comprehensive error handling with user feedback and recovery
 */

import { notificationManager } from './notifications.js';
import { performanceMonitor } from './performance.js';

/**
 * Error types for different categories of errors
 */
export const ErrorTypes = {
  // API Errors
  API_TIMEOUT: 'API_TIMEOUT',
  API_NETWORK: 'API_NETWORK',
  API_INVALID_RESPONSE: 'API_INVALID_RESPONSE',
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  
  // DOM Errors
  DOM_QUERY_FAILED: 'DOM_QUERY_FAILED',
  DOM_MANIPULATION_FAILED: 'DOM_MANIPULATION_FAILED',
  DOM_STYLE_ACCESS_FAILED: 'DOM_STYLE_ACCESS_FAILED',
  
  // Color Processing Errors
  COLOR_PARSE_FAILED: 'COLOR_PARSE_FAILED',
  COLOR_CONVERSION_FAILED: 'COLOR_CONVERSION_FAILED',
  COLOR_CONTRAST_CALC_FAILED: 'COLOR_CONTRAST_CALC_FAILED',
  
  // Extension Errors
  EXTENSION_INJECTION_FAILED: 'EXTENSION_INJECTION_FAILED',
  EXTENSION_PERMISSION_DENIED: 'EXTENSION_PERMISSION_DENIED',
  EXTENSION_STORAGE_FAILED: 'EXTENSION_STORAGE_FAILED',
  
  // User Errors
  USER_INVALID_INPUT: 'USER_INVALID_INPUT',
  USER_CANCELLED_OPERATION: 'USER_CANCELLED_OPERATION',
  
  // System Errors
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  PERFORMANCE_DEGRADATION: 'PERFORMANCE_DEGRADATION',
  
  // Unknown Errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Custom error class with additional context
 */
export class ContrastAssistantError extends Error {
  constructor(message, type = ErrorTypes.UNKNOWN_ERROR, severity = ErrorSeverity.MEDIUM, context = {}) {
    super(message);
    this.name = 'ContrastAssistantError';
    this.type = type;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ContrastAssistantError);
    }
  }
}

/**
 * Error handler with user-friendly messages and recovery suggestions
 */
export class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
    this.recoveryStrategies = new Map();
    this.setupRecoveryStrategies();
  }

  /**
   * Setup recovery strategies for different error types
   */
  setupRecoveryStrategies() {
    // API Errors
    this.recoveryStrategies.set(ErrorTypes.API_TIMEOUT, {
      userMessage: 'AI analysis is taking too long. Switching to WCAG-only mode.',
      recoveryAction: 'switch_to_wcag_mode',
      severity: ErrorSeverity.MEDIUM
    });
    
    this.recoveryStrategies.set(ErrorTypes.API_NETWORK, {
      userMessage: 'Cannot connect to AI service. Switching to WCAG-only mode.',
      recoveryAction: 'switch_to_wcag_mode',
      severity: ErrorSeverity.MEDIUM
    });
    
    this.recoveryStrategies.set(ErrorTypes.API_UNAVAILABLE, {
      userMessage: 'AI service is unavailable. Using WCAG guidelines only.',
      recoveryAction: 'switch_to_wcag_mode',
      severity: ErrorSeverity.LOW
    });

    // DOM Errors
    this.recoveryStrategies.set(ErrorTypes.DOM_QUERY_FAILED, {
      userMessage: 'Unable to analyze some page elements. Skipping problematic areas.',
      recoveryAction: 'skip_problematic_elements',
      severity: ErrorSeverity.LOW
    });
    
    this.recoveryStrategies.set(ErrorTypes.DOM_MANIPULATION_FAILED, {
      userMessage: 'Unable to apply some corrections. Trying alternative approach.',
      recoveryAction: 'try_alternative_approach',
      severity: ErrorSeverity.MEDIUM
    });

    // Color Errors
    this.recoveryStrategies.set(ErrorTypes.COLOR_PARSE_FAILED, {
      userMessage: 'Unable to process some colors. Using fallback values.',
      recoveryAction: 'use_fallback_colors',
      severity: ErrorSeverity.LOW
    });

    // Performance Errors
    this.recoveryStrategies.set(ErrorTypes.MEMORY_LIMIT_EXCEEDED, {
      userMessage: 'Page is too large to process efficiently. Processing in smaller chunks.',
      recoveryAction: 'use_batch_processing',
      severity: ErrorSeverity.MEDIUM
    });
    
    this.recoveryStrategies.set(ErrorTypes.PERFORMANCE_DEGRADATION, {
      userMessage: 'Processing is taking longer than expected. Please wait...',
      recoveryAction: 'show_progress_indicator',
      severity: ErrorSeverity.LOW
    });

    // Extension Errors
    this.recoveryStrategies.set(ErrorTypes.EXTENSION_INJECTION_FAILED, {
      userMessage: 'Extension failed to load properly. Please refresh the page.',
      recoveryAction: 'request_page_refresh',
      severity: ErrorSeverity.HIGH
    });
  }

  /**
   * Handle error with user notification and recovery
   */
  handle(error, context = {}) {
    // Log error
    this.logError(error, context);
    
    // Determine error type and severity
    const errorInfo = this.categorizeError(error);
    
    // Get recovery strategy
    const recovery = this.recoveryStrategies.get(errorInfo.type) || {
      userMessage: 'An unexpected error occurred. Please try again.',
      recoveryAction: 'generic_recovery',
      severity: ErrorSeverity.MEDIUM
    };
    
    // Show user notification based on severity
    this.notifyUser(errorInfo, recovery);
    
    // Execute recovery action
    this.executeRecovery(recovery.recoveryAction, errorInfo, context);
    
    return {
      error: errorInfo,
      recovery: recovery,
      handled: true
    };
  }

  /**
   * Categorize error and determine severity
   */
  categorizeError(error) {
    if (error instanceof ContrastAssistantError) {
      return {
        type: error.type,
        message: error.message,
        severity: error.severity,
        context: error.context,
        timestamp: error.timestamp
      };
    }
    
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return {
        type: ErrorTypes.API_TIMEOUT,
        message: error.message,
        severity: ErrorSeverity.MEDIUM,
        context: {}
      };
    }
    
    if (error.name === 'TypeError' && error.message?.includes('fetch')) {
      return {
        type: ErrorTypes.API_NETWORK,
        message: error.message,
        severity: ErrorSeverity.MEDIUM,
        context: {}
      };
    }
    
    if (error.name === 'TypeError' && error.message?.includes('Cannot read')) {
      return {
        type: ErrorTypes.DOM_QUERY_FAILED,
        message: error.message,
        severity: ErrorSeverity.LOW,
        context: {}
      };
    }
    
    // Default categorization
    return {
      type: ErrorTypes.UNKNOWN_ERROR,
      message: error.message || 'Unknown error occurred',
      severity: ErrorSeverity.MEDIUM,
      context: {}
    };
  }

  /**
   * Notify user based on error severity
   */
  notifyUser(errorInfo, recovery) {
    const { severity, message } = errorInfo;
    const { userMessage } = recovery;
    
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        notificationManager.error(userMessage, 8000);
        break;
        
      case ErrorSeverity.HIGH:
        notificationManager.error(userMessage, 6000);
        break;
        
      case ErrorSeverity.MEDIUM:
        notificationManager.warning(userMessage, 5000);
        break;
        
      case ErrorSeverity.LOW:
        // Only show low severity errors in debug mode or if user explicitly enabled detailed notifications
        if (this.isDebugMode()) {
          notificationManager.info(userMessage, 3000);
        }
        break;
    }
    
    // Always log to console for debugging
    console.error(`[ContrastAssistant] ${errorInfo.type}: ${message}`, errorInfo.context);
  }

  /**
   * Execute recovery action
   */
  executeRecovery(action, errorInfo, context) {
    switch (action) {
      case 'switch_to_wcag_mode':
        // This will be handled by the main extension logic
        console.warn('Switching to WCAG-only mode due to:', errorInfo.type);
        break;
        
      case 'skip_problematic_elements':
        console.warn('Skipping problematic elements due to:', errorInfo.type);
        break;
        
      case 'use_fallback_colors':
        console.warn('Using fallback colors due to:', errorInfo.type);
        break;
        
      case 'use_batch_processing':
        console.warn('Switching to batch processing due to:', errorInfo.type);
        break;
        
      case 'show_progress_indicator':
        // This will be handled by the performance module
        break;
        
      case 'request_page_refresh':
        notificationManager.error('Please refresh the page to continue', 10000);
        break;
        
      default:
        console.warn('Using generic recovery for:', errorInfo.type);
    }
  }

  /**
   * Log error for debugging and analysis
   */
  logError(error, context) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message,
      type: error.type || ErrorTypes.UNKNOWN_ERROR,
      stack: error.stack,
      context: context,
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    this.errorLog.push(errorEntry);
    
    // Keep log size manageable
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
    
    // Send to performance monitor
    performanceMonitor.start('error_handling');
  }

  /**
   * Get error log
   */
  getErrorLog() {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  clearErrorLog() {
    this.errorLog = [];
  }

  /**
   * Export error log for debugging
   */
  exportErrorLog() {
    const logData = {
      exportTime: new Date().toISOString(),
      errors: this.errorLog,
      summary: {
        totalErrors: this.errorLog.length,
        errorTypes: this.getErrorTypeSummary(),
        mostRecentError: this.errorLog[this.errorLog.length - 1]
      }
    };
    
    return JSON.stringify(logData, null, 2);
  }

  /**
   * Get summary of error types
   */
  getErrorTypeSummary() {
    const summary = {};
    this.errorLog.forEach(entry => {
      const type = entry.type || ErrorTypes.UNKNOWN_ERROR;
      summary[type] = (summary[type] || 0) + 1;
    });
    return summary;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebugMode() {
    // Check URL parameter or localStorage
    return window.location.search.includes('debug=true') || 
           localStorage.getItem('contrastAssistantDebug') === 'true';
  }
}

// Global error handler instance
export const errorHandler = new ErrorHandler();

/**
 * Global error handler for uncaught errors
 */
export function setupGlobalErrorHandler() {
  window.addEventListener('error', (event) => {
    const error = new ContrastAssistantError(
      event.message,
      ErrorTypes.UNKNOWN_ERROR,
      ErrorSeverity.MEDIUM,
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      }
    );
    
    errorHandler.handle(error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error = new ContrastAssistantError(
      `Unhandled promise rejection: ${event.reason}`,
      ErrorTypes.UNKNOWN_ERROR,
      ErrorSeverity.MEDIUM,
      { reason: event.reason }
    );
    
    errorHandler.handle(error);
  });
}