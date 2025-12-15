/**
 * Notification System Module
 * Manages user notifications with proper stacking prevention and cleanup
 */

import { secureInnerHTML } from './security.js';

// Notification manager to prevent stacking
class NotificationManager {
  constructor() {
    this.activeNotifications = new Map();
    this.notificationContainer = null;
    this.maxNotifications = 3;
    this.notificationTimeout = 5000;
  }

  /**
   * Get or create notification container
   */
  getContainer() {
    if (this.notificationContainer && document.contains(this.notificationContainer)) {
      return this.notificationContainer;
    }

    // Create container if it doesn't exist
    this.notificationContainer = document.createElement('div');
    this.notificationContainer.id = 'ai-contrast-notification-container';
    this.notificationContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 350px;
      pointer-events: none;
    `;
    
    document.body.appendChild(this.notificationContainer);
    return this.notificationContainer;
  }

  /**
   * Create notification element
   */
  createNotification(icon, message, type = 'info') {
    const notification = document.createElement('div');
    const notificationId = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    notification.id = notificationId;
    notification.className = `ai-contrast-notification ai-contrast-notification-${type}`;
    notification.style.cssText = `
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #1f2937;
      pointer-events: auto;
      animation: slideInRight 0.3s ease-out;
      position: relative;
    `;

    // Add type-specific styling
    const typeStyles = {
      success: 'border-left: 4px solid #10b981;',
      warning: 'border-left: 4px solid #f59e0b;',
      error: 'border-left: 4px solid #ef4444;',
      info: 'border-left: 4px solid #3b82f6;'
    };
    
    notification.style.cssText += typeStyles[type] || typeStyles.info;

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.className = 'contrast-assistant-close';
    closeButton.setAttribute('aria-label', 'Close notification');
    closeButton.style.cssText = `
      background: none;
      border: none;
      font-size: 18px;
      font-weight: bold;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      margin-left: auto;
      line-height: 1;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s ease;
    `;
    
    closeButton.onmouseover = () => {
      closeButton.style.color = '#374151';
      closeButton.style.backgroundColor = '#f3f4f6';
    };
    
    closeButton.onmouseout = () => {
      closeButton.style.color = '#6b7280';
      closeButton.style.backgroundColor = 'transparent';
    };
    
    closeButton.onclick = () => this.removeNotification(notificationId);

    // Create content
    const content = document.createElement('div');
    content.style.cssText = 'flex: 1; display: flex; align-items: center; gap: 8px;';
    
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    iconSpan.style.cssText = 'font-size: 16px; flex-shrink: 0;';
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    messageSpan.style.cssText = 'flex: 1;';
    
    content.appendChild(iconSpan);
    content.appendChild(messageSpan);
    
    notification.appendChild(content);
    notification.appendChild(closeButton);

    return { notification, notificationId };
  }

  /**
   * Show notification with stacking prevention
   */
  show(icon, message, type = 'info', duration = null) {
    const container = this.getContainer();
    
    // Remove oldest notifications if we're at the limit
    if (this.activeNotifications.size >= this.maxNotifications) {
      const oldestId = this.activeNotifications.keys().next().value;
      this.removeNotification(oldestId);
    }

    // Check for duplicate messages and remove them
    const duplicateId = Array.from(this.activeNotifications.entries())
      .find(([_, notif]) => notif.message === message)?.[0];
    
    if (duplicateId) {
      this.removeNotification(duplicateId);
    }

    // Create new notification
    const { notification, notificationId } = this.createNotification(icon, message, type);
    
    // Store notification info
    this.activeNotifications.set(notificationId, {
      element: notification,
      message,
      type,
      timestamp: Date.now()
    });

    // Add to container
    container.appendChild(notification);

    // Auto-remove after duration
    const timeoutDuration = duration ?? this.notificationTimeout;
    if (timeoutDuration > 0) {
      setTimeout(() => {
        this.removeNotification(notificationId);
      }, timeoutDuration);
    }

    return notificationId;
  }

  /**
   * Remove specific notification
   */
  removeNotification(notificationId) {
    const notification = this.activeNotifications.get(notificationId);
    if (!notification) return;

    const element = notification.element;
    
    // Add fade out animation
    element.style.animation = 'slideOutRight 0.3s ease-in';
    
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.activeNotifications.delete(notificationId);
      
      // Clean up container if empty
      if (this.activeNotifications.size === 0 && this.notificationContainer) {
        this.notificationContainer.remove();
        this.notificationContainer = null;
      }
    }, 300);
  }

  /**
   * Clear all notifications
   */
  clearAll() {
    const ids = Array.from(this.activeNotifications.keys());
    ids.forEach(id => this.removeNotification(id));
  }

  /**
   * Show success notification
   */
  success(message, duration) {
    return this.show('✅', message, 'success', duration);
  }

  /**
   * Show warning notification
   */
  warning(message, duration) {
    return this.show('⚠️', message, 'warning', duration);
  }

  /**
   * Show error notification
   */
  error(message, duration) {
    return this.show('❌', message, 'error', duration);
  }

  /**
   * Show info notification
   */
  info(message, duration) {
    return this.show('ℹ️', message, 'info', duration);
  }
}

// Create global notification manager instance
export const notificationManager = new NotificationManager();

// Add CSS animations to document
const notificationStyles = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;

// Inject styles if not already present
if (!document.getElementById('ai-contrast-notification-styles')) {
  const styleElement = document.createElement('style');
  styleElement.id = 'ai-contrast-notification-styles';
  styleElement.textContent = notificationStyles;
  document.head.appendChild(styleElement);
}