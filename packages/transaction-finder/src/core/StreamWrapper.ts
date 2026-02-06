/**
 * StreamWrapper - Convert gRPC event-based streams to async iterables
 *
 * gRPC streams use an event emitter pattern (stream.on('data', handler))
 * but we need async iterable streams (for await...of) for modern async code.
 * This wrapper bridges the two patterns.
 *
 * Migrated from dash-utxo-finder.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('StreamWrapper');

export class StreamWrapper {
  /**
   * Convert a gRPC event-based stream or async iterable to an async iterable
   * Handles both event emitter pattern (.on) and async generator patterns
   * @param stream - The stream object (can be event emitter, readable stream, or async iterable)
   * @returns An async iterable that yields stream messages
   */
  static makeAsyncIterable<T>(stream: any): AsyncIterable<T> {
  // IMPORTANT: Prefer EventEmitter-based wrapping over native async iterator.
  // @grpc/grpc-js ClientReadableStreamImpl exposes both Symbol.asyncIterator
  // and EventEmitter (.on), but its native async iterator can stall after the
  // initial batch. The EventEmitter path with explicit queuing is more reliable
  // for long-lived streaming subscriptions.
  if (stream && typeof stream.on === 'function' && typeof stream.removeListener === 'function') {
    return {
      [Symbol.asyncIterator]() {
        let done = false;
        let error: Error | null = null;
        let queue: T[] = [];
        let waitResolve: (() => void) | null = null;

        // Set up data handler to queue messages
        const onData = (message: T) => {
          queue.push(message);
          if (waitResolve) {
            waitResolve();
            waitResolve = null;
          }
        };

        // Set up end handler to signal completion
        const onEnd = () => {
          done = true;
          if (waitResolve) {
            waitResolve();
            waitResolve = null;
          }
        };

        // Set up error handler
        const onError = (err: Error) => {
          error = err;
          done = true;
          if (waitResolve) {
            waitResolve();
            waitResolve = null;
          }
        };

        // Attach listeners
        stream.on('data', onData);
        stream.on('end', onEnd);
        stream.on('error', onError);

        return {
          async next() {
            // While queue is empty and stream isn't done, wait for data
            while (queue.length === 0 && !done) {
              if (error) {
                throw error;
              }
              await new Promise<void>((resolve) => {
                waitResolve = resolve;
              });
            }

            // Return next item from queue, or signal done
            if (queue.length > 0) {
              return { value: queue.shift() as T, done: false };
            } else if (error) {
              // Clean up listeners and throw error
              stream.removeListener('data', onData);
              stream.removeListener('end', onEnd);
              stream.removeListener('error', onError);
              throw error;
            } else {
              // Clean up listeners
              stream.removeListener('data', onData);
              stream.removeListener('end', onEnd);
              stream.removeListener('error', onError);
              return { value: undefined, done: true };
            }
          },

          // Support return for early cleanup
          async return() {
            try {
              stream.removeListener('data', onData);
              stream.removeListener('end', onEnd);
              stream.removeListener('error', onError);
            } catch {
              // Ignore cleanup errors
            }
            return { value: undefined, done: true };
          },
        };
      },
    };
  }

  // Fallback: check if stream is an async iterable without EventEmitter
  if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
    return stream as AsyncIterable<T>;
  }

  // Log stream properties for debugging
  if (stream) {
    const streamType = Object.prototype.toString.call(stream);
    const hasSymbol = typeof stream[Symbol.asyncIterator] === 'function';
    const hasOn = typeof stream.on === 'function';
    logger.warn(
      `Unexpected stream type. type=${streamType}, asyncIterator=${hasSymbol}, on=${hasOn}`
    );
  }

  // No supported stream interface found
  throw new TypeError(
    'Stream must be either an async iterable or an EventEmitter/Readable stream with .on() method'
  );
  }
}
