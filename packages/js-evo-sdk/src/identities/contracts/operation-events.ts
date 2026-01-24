/**
 * Operation Events - Progress tracking and logging for async operations
 *
 * Provides event types and helpers that enable:
 * - Progress UI updates for long-running operations
 * - Better observability and debugging
 * - Consistent event patterns across identity operations
 */

/**
 * Phase within an identity operation
 */
export type OperationPhase =
  | 'wallet_setup'
  | 'key_derivation'
  | 'utxo_discovery'
  | 'identity_discovery'
  | 'address_selection'
  | 'transaction_creation'
  | 'coin_selection'
  | 'transaction_signing'
  | 'transaction_broadcast'
  | 'confirmation_wait'
  | 'instantlock_wait'
  | 'chainlock_wait'
  | 'asset_lock_proof'
  | 'platform_sync_check'
  | 'identity_creation'
  | 'identity_topup'
  | 'wasm_worker_submission'
  | 'finalization'
  | 'cleanup';

/**
 * Operation event emitted during async operations
 * Allows callers to track progress and display UI updates
 */
export interface OperationEvent {
  /** Unique event ID for tracking */
  eventId: string;

  /** Timestamp when event was emitted */
  timestamp: number;

  /** Current phase of operation */
  phase: OperationPhase;

  /** Progress percentage (0-100) */
  progress: number;

  /** Human-readable message for UI display */
  message: string;

  /** Detailed information for debugging */
  details?: Record<string, any>;

  /** Whether operation can still succeed from this point */
  isBlocking: boolean;

  /** Error information if phase failed */
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
    context?: Record<string, any>;
  };
}

/**
 * Event source for emitting operation events
 */
export interface EventEmitter {
  /**
   * Emit an operation event
   * @param event Event to emit
   */
  emit(event: OperationEvent): void;

  /**
   * Listen for events
   * @param listener Function called on each event
   */
  on(listener: (event: OperationEvent) => void): void;

  /**
   * Remove event listener
   */
  off(listener: (event: OperationEvent) => void): void;
}

/**
 * Phase progression information
 */
export interface PhaseProgress {
  /** Current phase */
  phase: OperationPhase;

  /** Phases completed */
  completed: OperationPhase[];

  /** Phases remaining */
  remaining: OperationPhase[];

  /** Overall progress 0-100 */
  overallProgress: number;

  /** Estimated time remaining (ms) */
  estimatedTimeRemainingMs?: number;
}

/**
 * Operation context carrying through multiple phases
 */
export interface OperationContext {
  /** Unique operation ID */
  operationId: string;

  /** Operation type */
  type: 'identity_creation' | 'identity_topup' | 'identity_discovery';

  /** Event emitter for progress tracking */
  emitter: EventEmitter;

  /** Operation start time */
  startTime: number;

  /** Phase timing information */
  phaseTiming: Map<OperationPhase, { startTime: number; endTime?: number }>;

  /** Metadata to carry through operation */
  metadata: Record<string, any>;
}

/**
 * Helper for creating operation events
 */
export class OperationEventFactory {
  private static eventIdCounter = 0;

  /**
   * Create a new operation event
   */
  static createEvent(options: {
    phase: OperationPhase;
    progress: number;
    message: string;
    isBlocking?: boolean;
    details?: Record<string, any>;
    error?: {
      code: string;
      message: string;
      recoverable: boolean;
      context?: Record<string, any>;
    };
  }): OperationEvent {
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
  static phaseStart(phase: OperationPhase, message: string): OperationEvent {
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
  static phaseProgress(
    phase: OperationPhase,
    progress: number,
    message: string,
    details?: Record<string, any>
  ): OperationEvent {
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
  static phaseComplete(
    phase: OperationPhase,
    message: string,
    details?: Record<string, any>
  ): OperationEvent {
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
  static phaseError(
    phase: OperationPhase,
    error: {
      code: string;
      message: string;
      recoverable: boolean;
      context?: Record<string, any>;
    },
    message?: string
  ): OperationEvent {
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
  private phaseTiming = new Map<OperationPhase, { startTime: number; endTime?: number }>();

  /**
   * Mark phase as started
   */
  startPhase(phase: OperationPhase): void {
    this.phaseTiming.set(phase, { startTime: Date.now() });
  }

  /**
   * Mark phase as complete
   */
  endPhase(phase: OperationPhase): void {
    const timing = this.phaseTiming.get(phase);
    if (timing) {
      timing.endTime = Date.now();
    }
  }

  /**
   * Get duration for a phase
   */
  getPhaseDuration(phase: OperationPhase): number | null {
    const timing = this.phaseTiming.get(phase);
    if (!timing || !timing.endTime) return null;
    return timing.endTime - timing.startTime;
  }

  /**
   * Get total duration from start to end
   */
  getTotalDuration(startPhase: OperationPhase, endPhase: OperationPhase): number | null {
    const start = this.phaseTiming.get(startPhase);
    const end = this.phaseTiming.get(endPhase);

    if (!start || !end?.endTime) return null;

    return end.endTime - start.startTime;
  }

  /**
   * Get timing summary for all phases
   */
  getSummary(): Record<OperationPhase, number> {
    const summary: Partial<Record<OperationPhase, number>> = {};

    for (const [phase, timing] of this.phaseTiming) {
      if (timing.endTime) {
        summary[phase] = timing.endTime - timing.startTime;
      }
    }

    return summary as Record<OperationPhase, number>;
  }
}

/**
 * Event aggregator for monitoring multiple operations
 */
export class OperationEventAggregator implements EventEmitter {
  private listeners: Array<(event: OperationEvent) => void> = [];
  private events: OperationEvent[] = [];
  private readonly maxEventsToKeep = 1000;

  /**
   * Emit an operation event
   */
  emit(event: OperationEvent): void {
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
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    }
  }

  /**
   * Listen for events
   */
  on(listener: (event: OperationEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove event listener
   */
  off(listener: (event: OperationEvent) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Get all events
   */
  getEvents(): OperationEvent[] {
    return [...this.events];
  }

  /**
   * Get events for a specific phase
   */
  getEventsForPhase(phase: OperationPhase): OperationEvent[] {
    return this.events.filter(e => e.phase === phase);
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }
}
