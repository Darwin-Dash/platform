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
    static makeAsyncIterable(stream) {
        // Check if stream is already an async iterable (has Symbol.asyncIterator)
        if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
            return stream;
        }
        // Check if stream has .on method (EventEmitter/Node.js Readable pattern)
        // This includes both EventEmitters and Node.js Readable streams
        if (stream && typeof stream.on === 'function' && typeof stream.removeListener === 'function') {
            return {
                [Symbol.asyncIterator]() {
                    let done = false;
                    let error = null;
                    let queue = [];
                    let waitResolve = null;
                    // Set up data handler to queue messages
                    const onData = (message) => {
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
                    const onError = (err) => {
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
                                await new Promise((resolve) => {
                                    waitResolve = resolve;
                                });
                            }
                            // Return next item from queue, or signal done
                            if (queue.length > 0) {
                                return { value: queue.shift(), done: false };
                            }
                            else if (error) {
                                // Clean up listeners and throw error
                                stream.removeListener('data', onData);
                                stream.removeListener('end', onEnd);
                                stream.removeListener('error', onError);
                                throw error;
                            }
                            else {
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
                            }
                            catch {
                                // Ignore cleanup errors
                            }
                            return { value: undefined, done: true };
                        },
                    };
                },
            };
        }
        // Log stream properties for debugging
        if (stream) {
            const streamType = Object.prototype.toString.call(stream);
            const hasSymbol = typeof stream[Symbol.asyncIterator] === 'function';
            const hasOn = typeof stream.on === 'function';
            logger.warn(`Unexpected stream type. type=${streamType}, asyncIterator=${hasSymbol}, on=${hasOn}`);
        }
        // Fallback: treat as async iterable or throw error
        throw new TypeError('Stream must be either an async iterable or an EventEmitter/Readable stream with .on() method');
    }
}
//# sourceMappingURL=StreamWrapper.js.map