/**
 * GracefulDegradation
 *
 * Handles partial service failures from payment-monitor pattern
 */

import { Logger } from '../utils/logger.js';

export class GracefulDegradation {
  private coreAvailable: boolean = true;
  private platformAvailable: boolean = true;
  private enabled: boolean;
  private logger: Logger;

  constructor(enabled: boolean, logger: Logger) {
    this.enabled = enabled;
    this.logger = logger;
  }

  /**
   * Handle service failure and determine if operation should continue
   *
   * @param namespace Which service failed (core or platform)
   * @param error The error that occurred
   * @returns true if operation should continue degraded, false if should fail
   */
  handleFailure(namespace: 'core' | 'platform', error: Error): boolean {
    if (!this.enabled) {
      return false; // Degradation disabled - fail fast
    }

    // Core failures are critical - blockchain access required
    if (namespace === 'core') {
      this.coreAvailable = false;
      this.logger.error(`Core service unavailable: ${error.message}`);
      return false; // Cannot continue without core
    }

    // Platform failures can be tolerated - platform features optional
    if (namespace === 'platform') {
      this.platformAvailable = false;
      this.logger.warn(`Platform service degraded: ${error.message}`);
      return true; // Continue without platform features
    }

    return false;
  }

  /**
   * Get current service availability status
   */
  getStatus() {
    return {
      coreAvailable: this.coreAvailable,
      platformAvailable: this.platformAvailable,
    };
  }

  /**
   * Reset service availability (mark as available again)
   *
   * @param namespace Optional - reset specific service or all
   */
  reset(namespace?: 'core' | 'platform'): void {
    if (!namespace || namespace === 'core') {
      if (!this.coreAvailable) {
        this.logger.info('Core service restored');
      }
      this.coreAvailable = true;
    }

    if (!namespace || namespace === 'platform') {
      if (!this.platformAvailable) {
        this.logger.info('Platform service restored');
      }
      this.platformAvailable = true;
    }
  }

  /**
   * Check if degradation is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if any service is degraded
   */
  isDegraded(): boolean {
    return !this.coreAvailable || !this.platformAvailable;
  }
}
