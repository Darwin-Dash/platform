/**
 * StreamWrapper - Convert gRPC event-based streams to async iterables
 *
 * gRPC streams use an event emitter pattern (stream.on('data', handler))
 * but we need async iterable streams (for await...of) for modern async code.
 * This wrapper bridges the two patterns.
 *
 * Migrated from dash-utxo-finder.
 */
export declare class StreamWrapper {
    /**
     * Convert a gRPC event-based stream or async iterable to an async iterable
     * Handles both event emitter pattern (.on) and async generator patterns
     * @param stream - The stream object (can be event emitter, readable stream, or async iterable)
     * @returns An async iterable that yields stream messages
     */
    static makeAsyncIterable<T>(stream: any): AsyncIterable<T>;
}
//# sourceMappingURL=StreamWrapper.d.ts.map