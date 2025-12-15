/**
 * Performance Optimization Module
 * Handles batch processing, caching, and performance monitoring
 */

/**
 * Performance monitor for tracking operation metrics
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
    this.enabled = true;
  }

  /**
   * Start timing an operation
   */
  start(operation) {
    if (!this.enabled) return;
    this.startTimes.set(operation, performance.now());
  }

  /**
   * End timing an operation
   */
  end(operation) {
    if (!this.enabled) return;
    
    const startTime = this.startTimes.get(operation);
    if (!startTime) return;
    
    const duration = performance.now() - startTime;
    const existing = this.metrics.get(operation) || { count: 0, total: 0, avg: 0 };
    
    existing.count++;
    existing.total += duration;
    existing.avg = existing.total / existing.count;
    
    this.metrics.set(operation, existing);
    this.startTimes.delete(operation);
    
    // Log slow operations
    if (duration > 100) {
      console.warn(`⚠️ Slow operation detected: ${operation} took ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
    this.startTimes.clear();
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

// Global performance monitor
export const performanceMonitor = new PerformanceMonitor();

/**
 * Batch processor for handling large numbers of elements
 */
export class BatchProcessor {
  constructor(batchSize = 50, delayBetweenBatches = 10) {
    this.batchSize = batchSize;
    this.delayBetweenBatches = delayBetweenBatches;
    this.isProcessing = false;
    this.progressCallback = null;
  }

  /**
   * Process items in batches with progress tracking
   */
  async process(items, processor, options = {}) {
    if (this.isProcessing) {
      throw new Error('Batch processor is already running');
    }

    this.isProcessing = true;
    const results = [];
    const totalItems = items.length;
    let processedItems = 0;
    
    try {
      performanceMonitor.start('batch_processing');
      
      for (let i = 0; i < totalItems; i += this.batchSize) {
        const batch = items.slice(i, i + this.batchSize);
        const batchResults = [];
        
        // Process batch
        for (const item of batch) {
          try {
            const result = await processor(item, processedItems, totalItems);
            batchResults.push(result);
            processedItems++;
            
            // Progress callback
            if (this.progressCallback) {
              this.progressCallback(processedItems, totalItems, result);
            }
            
            // Optional progress callback from options
            if (options.onProgress) {
              options.onProgress(processedItems, totalItems, result);
            }
            
          } catch (error) {
            console.error('Error processing item:', item, error);
            batchResults.push({ error: error.message, item });
            
            if (options.onError) {
              options.onError(error, item);
            }
          }
        }
        
        results.push(...batchResults);
        
        // Delay between batches to prevent blocking
        if (i + this.batchSize < totalItems && this.delayBetweenBatches > 0) {
          await this.delay(this.delayBetweenBatches);
        }
      }
      
      performanceMonitor.end('batch_processing');
      return results;
      
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if processor is running
   */
  getIsProcessing() {
    return this.isProcessing;
  }

  /**
   * Stop processing (will complete current batch)
   */
  stop() {
    this.isProcessing = false;
  }
}

/**
 * Element cache to avoid repeated DOM queries
 */
export class ElementCache {
  constructor(maxSize = 1000, ttl = 30000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Generate cache key for element
   */
  generateKey(element, operation) {
    const tagName = element.tagName;
    const id = element.id || '';
    const className = element.className || '';
    return `${tagName}#${id}.${className}:${operation}`;
  }

  /**
   * Get cached result
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set cached result
   */
  set(key, value) {
    // Check cache size limit
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%'
    };
  }
}

/**
 * Progress indicator for long operations
 */
export class ProgressIndicator {
  constructor(options = {}) {
    this.container = null;
    this.progressBar = null;
    this.statusText = null;
    this.options = {
      title: 'Processing...',
      showPercentage: true,
      autoClose: true,
      closeDelay: 1000,
      ...options
    };
  }

  /**
   * Create progress indicator
   */
  create() {
    // Remove existing progress indicator
    this.destroy();

    // Create container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      z-index: 10001;
      min-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Create title
    const title = document.createElement('h3');
    title.textContent = this.options.title;
    title.style.cssText = `
      margin: 0 0 15px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    `;

    // Create progress bar container
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      width: 100%;
      height: 8px;
      background: #f3f4f6;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 10px;
    `;

    // Create progress bar
    this.progressBar = document.createElement('div');
    this.progressBar.style.cssText = `
      width: 0%;
      height: 100%;
      background: #3b82f6;
      border-radius: 4px;
      transition: width 0.3s ease;
    `;

    progressContainer.appendChild(this.progressBar);

    // Create status text
    this.statusText = document.createElement('p');
    this.statusText.textContent = 'Initializing...';
    this.statusText.style.cssText = `
      margin: 0;
      font-size: 14px;
      color: #6b7280;
    `;

    this.container.appendChild(title);
    this.container.appendChild(progressContainer);
    this.container.appendChild(this.statusText);

    document.body.appendChild(this.container);
  }

  /**
   * Update progress
   */
  update(progress, status = '') {
    if (!this.container) {
      this.create();
    }

    // Update progress bar
    if (this.progressBar) {
      this.progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }

    // Update status text
    if (this.statusText && status) {
      this.statusText.textContent = status;
    }

    // Update percentage if enabled
    if (this.options.showPercentage && this.statusText) {
      const currentText = this.statusText.textContent;
      if (!status || !currentText.includes('%')) {
        this.statusText.textContent = `${status || currentText} (${Math.round(progress)}%)`;
      }
    }
  }

  /**
   * Complete progress
   */
  complete(message = 'Complete!', autoClose = null) {
    if (!this.container) return;

    const shouldAutoClose = autoClose ?? this.options.autoClose;
    
    // Update to 100%
    this.update(100, message);

    // Change progress bar color
    if (this.progressBar) {
      this.progressBar.style.background = '#10b981';
    }

    // Auto-close after delay
    if (shouldAutoClose) {
      setTimeout(() => {
        this.destroy();
      }, this.options.closeDelay);
    }
  }

  /**
   * Destroy progress indicator
   */
  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.progressBar = null;
    this.statusText = null;
  }
}

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
  constructor() {
    this.initialMemory = null;
    this.measurements = [];
  }

  /**
   * Start memory monitoring
   */
  start() {
    if (performance.memory) {
      this.initialMemory = performance.memory.usedJSHeapSize;
    }
  }

  /**
   * Get current memory usage
   */
  getUsage() {
    if (!performance.memory) {
      return null;
    }

    const current = performance.memory.usedJSHeapSize;
    const initial = this.initialMemory || current;
    
    return {
      current,
      initial,
      increase: current - initial,
      increaseMB: ((current - initial) / 1024 / 1024).toFixed(2) + 'MB'
    };
  }

  /**
   * Log memory usage
   */
  log(label = 'Memory Usage') {
    const usage = this.getUsage();
    if (usage) {
      console.log(`${label}:`, {
        current: (usage.current / 1024 / 1024).toFixed(2) + 'MB',
        increase: usage.increaseMB
      });
    }
  }
}