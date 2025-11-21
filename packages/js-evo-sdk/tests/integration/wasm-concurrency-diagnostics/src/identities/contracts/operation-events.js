/**
 * Operation Events - Progress tracking and logging for async operations
 *
 * Provides event types and helpers that enable:
 * - Progress UI updates for long-running operations
 * - Better observability and debugging
 * - Consistent event patterns across identity operations
 */
/**
 * Helper for creating operation events
 */
export class OperationEventFactory {
    static eventIdCounter = 0;
    /**
     * Create a new operation event
     */
    static createEvent(options) {
        return {
            eventId: `event_${++this.eventIdCounter}`,
            timestamp: Date.now(),
            phase: options.phase,
            progress: Math.max(0, Math.min(100, options.progress)),
            message: options.message,
            isBlocking: options.isBlocking ?? false,
            details: options.details,
            error: options.error,
        };
    }
    /**
     * Create event for phase start
     */
    static phaseStart(phase, message) {
        return this.createEvent({
            phase,
            progress: 0,
            message: `Starting: ${message}`,
            isBlocking: false,
        });
    }
    /**
     * Create event for phase progress
     */
    static phaseProgress(phase, progress, message, details) {
        return this.createEvent({
            phase,
            progress,
            message,
            isBlocking: false,
            details,
        });
    }
    /**
     * Create event for phase completion
     */
    static phaseComplete(phase, message, details) {
        return this.createEvent({
            phase,
            progress: 100,
            message: `Complete: ${message}`,
            isBlocking: false,
            details,
        });
    }
    /**
     * Create event for phase error
     */
    static phaseError(phase, error, message) {
        return this.createEvent({
            phase,
            progress: 0,
            message: message || `Error in ${phase}: ${error.message}`,
            isBlocking: !error.recoverable,
            error,
        });
    }
}
/**
 * Phase timing tracker
 * Tracks how long each phase takes for performance monitoring
 */
export class PhaseTimingTracker {
    phaseTiming = new Map();
    /**
     * Mark phase as started
     */
    startPhase(phase) {
        this.phaseTiming.set(phase, { startTime: Date.now() });
    }
    /**
     * Mark phase as complete
     */
    endPhase(phase) {
        const timing = this.phaseTiming.get(phase);
        if (timing) {
            timing.endTime = Date.now();
        }
    }
    /**
     * Get duration for a phase
     */
    getPhaseDuration(phase) {
        const timing = this.phaseTiming.get(phase);
        if (!timing || !timing.endTime)
            return null;
        return timing.endTime - timing.startTime;
    }
    /**
     * Get total duration from start to end
     */
    getTotalDuration(startPhase, endPhase) {
        const start = this.phaseTiming.get(startPhase);
        const end = this.phaseTiming.get(endPhase);
        if (!start || !end?.endTime)
            return null;
        return end.endTime - start.startTime;
    }
    /**
     * Get timing summary for all phases
     */
    getSummary() {
        const summary = {};
        for (const [phase, timing] of this.phaseTiming) {
            if (timing.endTime) {
                summary[phase] = timing.endTime - timing.startTime;
            }
        }
        return summary;
    }
}
/**
 * Event aggregator for monitoring multiple operations
 */
export class OperationEventAggregator {
    listeners = [];
    events = [];
    maxEventsToKeep = 1000;
    /**
     * Emit an operation event
     */
    emit(event) {
        // Store event
        this.events.push(event);
        // Trim old events if needed
        if (this.events.length > this.maxEventsToKeep) {
            this.events = this.events.slice(-this.maxEventsToKeep);
        }
        // Notify listeners
        for (const listener of this.listeners) {
            try {
                listener(event);
            }
            catch (error) {
                console.error('Error in event listener:', error);
            }
        }
    }
    /**
     * Listen for events
     */
    on(listener) {
        this.listeners.push(listener);
    }
    /**
     * Remove event listener
     */
    off(listener) {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
            this.listeners.splice(index, 1);
        }
    }
    /**
     * Get all events
     */
    getEvents() {
        return [...this.events];
    }
    /**
     * Get events for a specific phase
     */
    getEventsForPhase(phase) {
        return this.events.filter(e => e.phase === phase);
    }
    /**
     * Clear all events
     */
    clear() {
        this.events = [];
    }
}
