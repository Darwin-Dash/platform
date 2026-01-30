/**
 * ResourceTracker - Track and cleanup resources created during identity operations
 *
 * Provides centralized tracking of DAPIClient instances and other resources
 * to prevent memory leaks in long-running browser sessions.
 *
 * Usage:
 * - Call `track()` when creating a resource
 * - Call `untrack()` when the resource is no longer needed
 * - Call `cleanup()` to release all tracked resources
 */

import { createLogger } from './identity-logger.js';

const logger = createLogger('ResourceTracker');

export interface CleanupableResource {
  /**
   * Optional cleanup method. If the resource has a `disconnect()` method,
   * it will be called during cleanup.
   */
  disconnect?: () => void | Promise<void>;
}

/**
 * ResourceTracker for managing DAPIClient and other cleanupable resources
 */
class ResourceTrackerImpl {
  private resources: Set<CleanupableResource> = new Set();
  private cleanupInProgress = false;

  /**
   * Track a resource for later cleanup
   * @param resource The resource to track
   * @returns The same resource (for chaining)
   */
  track<T extends CleanupableResource>(resource: T): T {
    this.resources.add(resource);
    logger.debug(`Resource tracked (total: ${this.resources.size})`);
    return resource;
  }

  /**
   * Untrack a resource (when it's been cleaned up manually)
   * @param resource The resource to untrack
   */
  untrack(resource: CleanupableResource): void {
    this.resources.delete(resource);
    logger.debug(`Resource untracked (total: ${this.resources.size})`);
  }

  /**
   * Get the number of tracked resources
   */
  get size(): number {
    return this.resources.size;
  }

  /**
   * Check if a cleanup is currently in progress
   */
  get isCleaningUp(): boolean {
    return this.cleanupInProgress;
  }

  /**
   * Cleanup all tracked resources
   * Calls `disconnect()` on each resource if available
   * @returns Number of resources cleaned up
   */
  async cleanup(): Promise<number> {
    if (this.cleanupInProgress) {
      logger.warn('Cleanup already in progress, skipping');
      return 0;
    }

    this.cleanupInProgress = true;
    const count = this.resources.size;

    if (count === 0) {
      this.cleanupInProgress = false;
      return 0;
    }

    logger.info(`Cleaning up ${count} tracked resources...`);

    const errors: Error[] = [];
    for (const resource of this.resources) {
      try {
        if (typeof resource.disconnect === 'function') {
          await resource.disconnect();
        }
      } catch (error) {
        errors.push(error as Error);
        logger.warn('Error during resource cleanup:', error);
      }
    }

    this.resources.clear();
    this.cleanupInProgress = false;

    if (errors.length > 0) {
      logger.warn(`Cleanup completed with ${errors.length} errors`);
    } else {
      logger.info(`Cleanup completed successfully (${count} resources)`);
    }

    return count;
  }

  /**
   * Reset the tracker (clear all resources without calling cleanup)
   * Use with caution - this can cause resource leaks
   */
  reset(): void {
    const count = this.resources.size;
    this.resources.clear();
    if (count > 0) {
      logger.warn(`Reset tracker without cleanup (${count} resources orphaned)`);
    }
  }
}

/**
 * Global resource tracker instance
 * Tracks DAPIClient and other resources created during identity operations
 */
export const resourceTracker = new ResourceTrackerImpl();
