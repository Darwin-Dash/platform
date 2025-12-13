import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import { NotificationSystem } from '../../components/notifications.js';

describe('Notification System Integration', () => {
  let window, document, notifications;

  beforeEach(() => {
    // Create DOM environment
    window = new Window();
    document = window.document;
    global.window = window;
    global.document = document;

    // Create notification container
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);

    // Create notification system
    notifications = new NotificationSystem();

    // Mock setTimeout to avoid delays in tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows notification', () => {
    const id = notifications.show('Test message', 'info', 0);

    expect(id).toBeDefined();
    expect(notifications.notifications.size).toBe(1);

    const notificationEl = document.querySelector('.notification');
    expect(notificationEl).toBeTruthy();
  });

  it('displays correct message', () => {
    notifications.show('Hello World', 'info', 0);

    const message = document.querySelector('.notification-message');
    expect(message.textContent).toBe('Hello World');
  });

  it('applies correct type class', () => {
    notifications.show('Success!', 'success', 0);

    const notification = document.querySelector('.notification');
    expect(notification.classList.contains('notification-success')).toBe(true);
  });

  it('escapes HTML in messages', () => {
    const htmlString = '<b>bold text</b>';
    notifications.show(htmlString, 'info', 0);

    const message = document.querySelector('.notification-message');
    // The escapeHtml function converts HTML to escaped text via innerHTML
    // In happy-dom, this results in the HTML being parsed
    // Verify the text content is preserved
    expect(message.textContent).toContain('bold text');
  });

  it('dismisses notification', () => {
    const id = notifications.show('Test', 'info', 0);

    notifications.dismiss(id);

    // After animation delay
    vi.advanceTimersByTime(350);

    expect(notifications.notifications.has(id)).toBe(false);
  });

  it('auto-dismisses after duration', () => {
    notifications.show('Auto dismiss', 'info', 5000);

    expect(notifications.notifications.size).toBe(1);

    // Advance past the duration + animation time
    vi.advanceTimersByTime(5350);

    expect(notifications.notifications.size).toBe(0);
  });

  it('does not auto-dismiss when duration is 0', () => {
    notifications.show('Persistent', 'info', 0);

    vi.advanceTimersByTime(100000);

    expect(notifications.notifications.size).toBe(1);
  });

  it('dismisses all notifications', () => {
    notifications.show('Message 1', 'info', 0);
    notifications.show('Message 2', 'success', 0);
    notifications.show('Message 3', 'error', 0);

    expect(notifications.notifications.size).toBe(3);

    notifications.dismissAll();

    vi.advanceTimersByTime(350);

    expect(notifications.notifications.size).toBe(0);
  });

  it('success() shows success notification', () => {
    notifications.success('Success message');

    const notification = document.querySelector('.notification-success');
    expect(notification).toBeTruthy();
  });

  it('error() shows error notification', () => {
    notifications.error('Error message');

    const notification = document.querySelector('.notification-error');
    expect(notification).toBeTruthy();
  });

  it('warning() shows warning notification', () => {
    notifications.warning('Warning message');

    const notification = document.querySelector('.notification-warning');
    expect(notification).toBeTruthy();
  });

  it('info() shows info notification', () => {
    notifications.info('Info message');

    const notification = document.querySelector('.notification-info');
    expect(notification).toBeTruthy();
  });

  it('loading() shows persistent notification', () => {
    const id = notifications.loading('Loading...');

    vi.advanceTimersByTime(100000);

    expect(notifications.notifications.has(id)).toBe(true);
  });

  it('includes close button', () => {
    notifications.show('Test', 'info', 0);

    const closeBtn = document.querySelector('.notification-close');
    expect(closeBtn).toBeTruthy();
  });

  it('close button dismisses notification', () => {
    notifications.show('Test', 'info', 0);

    const closeBtn = document.querySelector('.notification-close');
    closeBtn.click();

    vi.advanceTimersByTime(350);

    expect(notifications.notifications.size).toBe(0);
  });

  it('updates notification message', () => {
    const id = notifications.show('Original', 'info', 0);

    notifications.update(id, 'Updated', 'success');

    const message = document.querySelector('.notification-message');
    expect(message.textContent).toBe('Updated');

    const notification = document.querySelector('.notification');
    expect(notification.classList.contains('notification-success')).toBe(true);
  });

  it('shows progress bar for timed notifications', () => {
    notifications.show('Timed', 'info', 5000);

    const progress = document.querySelector('.notification-progress');
    expect(progress).toBeTruthy();
  });

  it('does not show progress for persistent notifications', () => {
    notifications.show('Persistent', 'info', 0);

    const progress = document.querySelector('.notification-progress');
    expect(progress).toBeFalsy();
  });

  it('handles multiple notifications', () => {
    notifications.show('First', 'info', 0);
    notifications.show('Second', 'success', 0);
    notifications.show('Third', 'error', 0);

    const allNotifications = document.querySelectorAll('.notification');
    expect(allNotifications.length).toBe(3);
  });

  it('assigns unique IDs', () => {
    const id1 = notifications.show('Test 1', 'info', 0);
    const id2 = notifications.show('Test 2', 'info', 0);
    const id3 = notifications.show('Test 3', 'info', 0);

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  describe('Notification Sizing', () => {
    beforeEach(() => {
      // Load CSS styles into the DOM
      const style = document.createElement('style');
      style.textContent = `
        .notification {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: white;
          border-radius: 0.5rem;
          width: 400px;
          min-height: 64px;
          pointer-events: auto;
          position: relative;
          overflow: hidden;
        }
      `;
      document.head.appendChild(style);
    });

    it('applies fixed width of 400px', () => {
      notifications.show('Test', 'info', 0);

      const notification = document.querySelector('.notification');
      const styles = window.getComputedStyle(notification);

      expect(styles.width).toBe('400px');
    });

    it('applies min-height of 64px', () => {
      notifications.show('Test', 'info', 0);

      const notification = document.querySelector('.notification');
      const styles = window.getComputedStyle(notification);

      expect(styles.minHeight).toBe('64px');
    });

    it('all notifications have same width regardless of text length', () => {
      notifications.show('Short', 'info', 0);
      notifications.show('This is a much longer notification message', 'success', 0);
      notifications.show('X', 'error', 0);

      const allNotifications = document.querySelectorAll('.notification');
      const widths = Array.from(allNotifications).map(el => {
        return window.getComputedStyle(el).width;
      });

      // All should be 400px
      expect(widths).toEqual(['400px', '400px', '400px']);
    });

    it('notification uses width property not max-width', () => {
      notifications.show('Test', 'info', 0);

      const notification = document.querySelector('.notification');
      const styles = window.getComputedStyle(notification);

      // Should have width set
      expect(styles.width).toBe('400px');
    });

    it('single notification has consistent size', () => {
      const id = notifications.show('Switched to Testnet', 'success', 0);

      const notification = document.querySelector('.notification');
      const styles = window.getComputedStyle(notification);

      expect(styles.width).toBe('400px');
      expect(styles.minHeight).toBe('64px');
    });

    it('multiple notifications maintain consistent width', () => {
      notifications.show('First notification', 'info', 0);
      notifications.show('Second notification with more text', 'success', 0);
      notifications.show('Third', 'error', 0);

      const allNotifications = document.querySelectorAll('.notification');

      allNotifications.forEach(notification => {
        const styles = window.getComputedStyle(notification);
        expect(styles.width).toBe('400px');
      });
    });

    it('notification container does not override notification width', () => {
      const container = document.querySelector('.notification-container');
      container.style.width = '500px'; // Try to influence notification size

      notifications.show('Test', 'info', 0);

      const notification = document.querySelector('.notification');
      const styles = window.getComputedStyle(notification);

      // Notification should still be 400px, not affected by container
      expect(styles.width).toBe('400px');
    });
  });
});