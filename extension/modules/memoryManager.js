/**
 * Memory Management Module
 * Provides memory leak prevention, cleanup utilities, and resource management
 */

import { errorHandler, ErrorTypes, ErrorSeverity } from './errorHandler.js';
import { performanceMonitor } from './performance.js';

/**
 * Memory manager for tracking and cleaning up resources
 */
export class MemoryManager {
  constructor() {
    this.resources = new Map();
    this.eventListeners = new Map();
    this.intervals = new Set();
    this.timeouts = new Set();
    this.observers = new Set();
    this.weakRefs = new WeakMap();
    this.cleanupCallbacks = new Set();
    
    // Memory monitoring
    this.memoryThreshold = 100 * 1024 * 1024; // 100MB threshold
    this.checkInterval = null;
    
    // Setup automatic cleanup
    this.setupAutomaticCleanup();
  }

  /**
   * Setup automatic cleanup on page unload
   */
  setupAutomaticCleanup() {
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      this.cleanupAll();
    });

    // Monitor memory usage
    if (performance.memory) {
      this.checkInterval = setInterval(() => {
        this.checkMemoryUsage();
      }, 30000); // Check every 30 seconds
    }
  }

  /**
   * Track a resource for cleanup
   */
  trackResource(id, resource, cleanupFn) {
    try {
      this.resources.set(id, {
        resource,
        cleanup: cleanupFn,
        created: Date.now()
      });
      
      // Use WeakRef if available
      if (typeof WeakRef !== 'undefined') {
        this.weakRefs.set(resource, new WeakRef(resource));
      }
    } catch (error) {
      errorHandler.handle(new Error(`Failed to track resource ${id}: ${error.message}`));
    }
  }

  /**
   * Add event listener with automatic tracking
   */
  addEventListener(element, event, handler, options = false) {
    try {
      element.addEventListener(event, handler, options);
      
      const listenerId = `${element.tagName}_${event}_${Date.now()}`;
      this.eventListeners.set(listenerId, {
        element,
        event,
        handler,
        options,
        added: Date.now()
      });
      
      return listenerId;
    } catch (error) {
      errorHandler.handle(new Error(`Failed to add event listener: ${error.message}`));
      return null;
    }
  }

  /**
   * Remove specific event listener
   */
  removeEventListener(listenerId) {
    try {
      const listener = this.eventListeners.get(listenerId);
      if (listener) {
        listener.element.removeEventListener(listener.listener, listener.handler, listener.options);
        this.eventListeners.delete(listenerId);
        return true;
      }
      return false;
    } catch (error) {
      errorHandler.handle(new Error(`Failed to remove event listener ${listenerId}: ${error.message}`));
      return false;
    }
  }

  /**
   * Create timeout with automatic tracking
   */
  setTimeout(callback, delay, ...args) {
    try {
      const timeoutId = setTimeout((...timeoutArgs) => {
        this.timeouts.delete(timeoutId);
        callback(...timeoutArgs);
      }, delay, ...args);
      
      this.timeouts.add(timeoutId);
      return timeoutId;
    } catch (error) {
      errorHandler.handle(new Error(`Failed to create timeout: ${error.message}`));
      return null;
    }
  }

  /**
   * Clear specific timeout
   */
  clearTimeout(timeoutId) {
    try {
      if (this.timeouts.has(timeoutId)) {
        clearTimeout(timeoutId);
        this.timeouts.delete(timeoutId);
        return true;
      }
      return false;
    } catch (error) {
      errorHandler.handle(new Error(`Failed to clear timeout ${timeoutId}: ${error.message}`));
      return false;
    }
  }

  /**
   * Create interval with automatic tracking
   */
  setInterval(callback, delay, ...args) {
    try {
      const intervalId = setInterval(callback, delay, ...args);
      this.intervals.add(intervalId);
      return intervalId;
    } catch (error) {
      errorHandler.handle(new Error(`Failed to create interval: ${error.message}`));
      return null;
    }
  }

  /**
   * Clear specific interval
   */
  clearInterval(intervalId) {
    try {
      if (this.intervals.has(intervalId)) {
        clearInterval(intervalId);
        this.intervals.delete(intervalId);
        return true;
      }
      return false;
    } catch (error) {
      errorHandler.handle(new Error(`Failed to clear interval ${intervalId}: ${error.message}`));
      return false;
    }
  }

  /**
   * Track MutationObserver
   */
  trackObserver(observer, type = 'mutation') {
    try {
      this.observers.add({
        observer,
        type,
        created: Date.now()
      });
    } catch (error) {
      errorHandler.handle(new Error(`Failed to track observer: ${error.message}`));
    }
  }

  /**
   * Stop and remove observer
   */
  stopObserver(observer) {
    try {
      observer.disconnect();
      
      // Find and remove from tracking
      for (const tracked of this.observers) {
        if (tracked.observer === observer) {
          this.observers.delete(tracked);
          break;
        }
      }
    } catch (error) {
      errorHandler.handle(new Error(`Failed to stop observer: ${error.message}`));
    }
  }

  /**
   * Add cleanup callback
   */
  addCleanupCallback(callback) {
    try {
      this.cleanupCallbacks.add(callback);
    } catch (error) {
      errorHandler.handle(new Error(`Failed to add cleanup callback: ${error.message}`));
    }
  }

  /**
   * Remove cleanup callback
   */
  removeCleanupCallback(callback) {
    try {
      return this.cleanupCallbacks.delete(callback);
    } catch (error) {
      errorHandler.handle(new Error(`Failed to remove cleanup callback: ${error.message}`));
      return false;
    }
  }

  /**
   * Check memory usage and trigger cleanup if needed
   */
  checkMemoryUsage() {
    try {
      if (!performance.memory) return;
      
      const usedMemory = performance.memory.usedJSHeapSize;
      
      if (usedMemory > this.memoryThreshold) {
        errorHandler.handle(new Error(
          `Memory usage exceeded threshold: ${Math.round(usedMemory / 1024 / 1024)}MB`,
          ErrorTypes.MEMORY_LIMIT_EXCEEDED,
          ErrorSeverity.MEDIUM
        ));
        
        // Trigger aggressive cleanup
        this.performAggressiveCleanup();
      }
    } catch (error) {
      errorHandler.handle(new Error(`Failed to check memory usage: ${error.message}`));
    }
  }

  /**
   * Perform aggressive cleanup when memory is high
   */
  performAggressiveCleanup() {
    try {
      // Clear old resources
      const now = Date.now();
      const oldThreshold = 5 * 60 * 1000; // 5 minutes
      
      // Clean up old resources
      for (const [id, resource] of this.resources) {
        if (now - resource.created > oldThreshold) {
          this.cleanupResource(id);
        }
      }
      
      // Clean up old event listeners
      for (const [id, listener] of this.eventListeners) {
        if (now - listener.added > oldThreshold) {
          this.removeEventListener(id);
        }
      }
      
      // Force garbage collection if available
      if (window.gc) {
        window.gc();
      }
      
      performanceMonitor.record('memory_cleanup', {
        remainingResources: this.resources.size,
        remainingListeners: this.eventListeners.size,
        remainingTimeouts: this.timeouts.size,
        remainingIntervals: this.intervals.size
      });
      
    } catch (error) {
      errorHandler.handle(new Error(`Failed to perform aggressive cleanup: ${error.message}`));
    }
  }

  /**
   * Cleanup specific resource
   */
  cleanupResource(id) {
    try {
      const resource = this.resources.get(id);
      if (resource) {
        if (typeof resource.cleanup === 'function') {
          resource.cleanup(resource.resource);
        }
        this.resources.delete(id);
        return true;
      }
      return false;
    } catch (error) {
      errorHandler.handle(new Error(`Failed to cleanup resource ${id}: ${error.message}`));
      return false;
    }
  }

  /**
   * Cleanup all resources
   */
  cleanupAll() {
    try {
      // Execute cleanup callbacks
      for (const callback of this.cleanupCallbacks) {
        try {
          callback();
        } catch (callbackError) {
          errorHandler.handle(new Error(`Cleanup callback failed: ${callbackError.message}`));
        }
      }
      
      // Clear all intervals
      for (const intervalId of this.intervals) {
        clearInterval(intervalId);
      }
      this.intervals.clear();
      
      // Clear all timeouts
      for (const timeoutId of this.timeouts) {
        clearTimeout(timeoutId);
      }
      this.timeouts.clear();
      
      // Disconnect all observers
      for (const tracked of this.observers) {
        tracked.observer.disconnect();
      }
      this.observers.clear();
      
      // Remove all event listeners
      for (const [id, listener] of this.eventListeners) {
        try {
          listener.element.removeEventListener(listener.event, listener.handler, listener.options);
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
      this.eventListeners.clear();
      
      // Cleanup all resources
      for (const [id] of this.resources) {
        this.cleanupResource(id);
      }
      
      // Clear memory check interval
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
      
      // Clear collections
      this.cleanupCallbacks.clear();
      this.weakRefs = new WeakMap();
      
      // Force garbage collection if available
      if (window.gc) {
        window.gc();
      }
      
    } catch (error) {
      errorHandler.handle(new Error(`Failed to cleanup all resources: ${error.message}`));
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    try {
      const stats = {
        resources: this.resources.size,
        eventListeners: this.eventListeners.size,
        intervals: this.intervals.size,
        timeouts: this.timeouts.size,
        observers: this.observers.size,
        cleanupCallbacks: this.cleanupCallbacks.size
      };
      
      if (performance.memory) {
        stats.jsHeapSize = performance.memory.usedJSHeapSize;
        stats.jsHeapSizeLimit = performance.memory.jsHeapSizeLimit;
        stats.totalJSHeapSize = performance.memory.totalJSHeapSize;
      }
      
      return stats;
    } catch (error) {
      errorHandler.handle(new Error(`Failed to get memory stats: ${error.message}`));
      return {};
    }
  }

  /**
   * Check if element is still in DOM
   */
  isElementInDOM(element) {
    try {
      return document.body.contains(element);
    } catch (error) {
      return false;
    }
  }
}

// Global memory manager instance
export const memoryManager = new MemoryManager();

/**
 * Utility function to create cleanup-safe event listeners
 */
export function createSafeEventListener(element, event, handler, options = false) {
  return memoryManager.addEventListener(element, event, handler, options);
}

/**
 * Utility function to create cleanup-safe timeouts
 */
export function createSafeTimeout(callback, delay, ...args) {
  return memoryManager.setTimeout(callback, delay, ...args);
}

/**
 * Utility function to create cleanup-safe intervals
 */
export function createSafeInterval(callback, delay, ...args) {
  return memoryManager.setInterval(callback, delay, ...args);
}