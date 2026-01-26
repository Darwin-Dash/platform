/**
 * Notification System Component
 * Toast notifications for user feedback
 */

export class NotificationSystem {
  constructor() {
    this.container = document.getElementById('notification-container');
    this.notifications = new Map();
    this.nextId = 1;
  }

  /**
   * Show a notification
   * @param {string} message - Notification message
   * @param {string} type - Type: 'success' | 'error' | 'warning' | 'info'
   * @param {number} duration - Duration in ms (0 for persistent)
   * @returns {number} Notification ID
   */
  show(message, type = 'info', duration = 5000) {
    const id = this.nextId++;

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type} toast`;
    notification.dataset.id = id;

    // Icon based on type
    const icon = this.getIcon(type);

    // Build notification HTML
    notification.innerHTML = `
      <div class="notification-icon">${icon}</div>
      <div class="notification-content">
        <p class="notification-message">${this.escapeHtml(message)}</p>
      </div>
      <button class="notification-close" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      ${duration > 0 ? '<div class="notification-progress"></div>' : ''}
    `;

    // Add close handler
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => this.dismiss(id));

    // Add to container
    this.container.appendChild(notification);
    this.notifications.set(id, notification);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      notification.classList.add('notification-enter');
    });

    // Auto-dismiss if duration is set
    if (duration > 0) {
      const progress = notification.querySelector('.notification-progress');
      if (progress) {
        progress.style.animationDuration = `${duration}ms`;
      }

      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  /**
   * Dismiss a notification
   * @param {number} id - Notification ID
   */
  dismiss(id) {
    const notification = this.notifications.get(id);
    if (!notification) return;

    // Trigger exit animation
    notification.classList.add('notification-exit');

    // Remove after animation
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      this.notifications.delete(id);
    }, 300);
  }

  /**
   * Dismiss all notifications
   */
  dismissAll() {
    this.notifications.forEach((notification, id) => {
      this.dismiss(id);
    });
  }

  /**
   * Show success notification
   */
  success(message, duration = 5000) {
    return this.show(message, 'success', duration);
  }

  /**
   * Show error notification
   */
  error(message, duration = 8000) {
    return this.show(message, 'error', duration);
  }

  /**
   * Show warning notification
   */
  warning(message, duration = 7000) {
    return this.show(message, 'warning', duration);
  }

  /**
   * Show info notification
   */
  info(message, duration = 5000) {
    return this.show(message, 'info', duration);
  }

  /**
   * Show loading notification
   */
  loading(message) {
    return this.show(message, 'info', 0);
  }

  /**
   * Update notification message
   */
  update(id, message, type) {
    const notification = this.notifications.get(id);
    if (!notification) return;

    const messageEl = notification.querySelector('.notification-message');
    if (messageEl) {
      messageEl.textContent = message;
    }

    if (type) {
      notification.className = `notification notification-${type} toast notification-enter`;
      const iconEl = notification.querySelector('.notification-icon');
      if (iconEl) {
        iconEl.innerHTML = this.getIcon(type);
      }
    }
  }

  /**
   * Get icon SVG for notification type
   */
  getIcon(type) {
    const icons = {
      success: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M6 10l2 2 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `,
      error: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `,
      warning: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3l8 14H2l8-14z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M10 11v2M10 7v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `,
      info: `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M10 9v5M10 6h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `
    };

    return icons[type] || icons.info;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Create singleton instance
export const notifications = new NotificationSystem();

// Global convenience functions
window.showSuccess = (msg, duration) => notifications.success(msg, duration);
window.showError = (msg, duration) => notifications.error(msg, duration);
window.showWarning = (msg, duration) => notifications.warning(msg, duration);
window.showInfo = (msg, duration) => notifications.info(msg, duration);
window.showLoading = (msg) => notifications.loading(msg);
window.hideLoading = () => notifications.dismissAll();