/**
 * Unit tests for StreamWrapper
 * Tests conversion of gRPC event-based streams to async iterables
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamWrapper } from '../../../src/core/StreamWrapper.js';
import { EventEmitter } from 'events';

describe('StreamWrapper', () => {
  describe('makeAsyncIterable', () => {
    describe('with async iterable streams', () => {
      it('should return the stream unchanged if already async iterable', async () => {
        const mockAsyncIterable = {
          async *[Symbol.asyncIterator]() {
            yield 'message1';
            yield 'message2';
          },
        };

        const result = StreamWrapper.makeAsyncIterable(mockAsyncIterable);

        // Should return the same object
        expect(result).toBe(mockAsyncIterable);

        // Verify it still works
        const messages: string[] = [];
        for await (const msg of result) {
          messages.push(msg as string);
        }
        expect(messages).toEqual(['message1', 'message2']);
      });
    });

    describe('with EventEmitter streams', () => {
      let emitter: EventEmitter;

      beforeEach(() => {
        emitter = new EventEmitter();
      });

      afterEach(() => {
        emitter.removeAllListeners();
      });

      it('should convert EventEmitter to async iterable', async () => {
        const asyncIterable = StreamWrapper.makeAsyncIterable<string>(emitter);

        // Queue up data events before iterating
        setTimeout(() => {
          emitter.emit('data', 'message1');
          emitter.emit('data', 'message2');
          emitter.emit('end');
        }, 10);

        const messages: string[] = [];
        for await (const msg of asyncIterable) {
          messages.push(msg);
        }

        expect(messages).toEqual(['message1', 'message2']);
      });

      it('should handle single data event before end', async () => {
        const asyncIterable = StreamWrapper.makeAsyncIterable<string>(emitter);

        setTimeout(() => {
          emitter.emit('data', 'only-message');
          emitter.emit('end');
        }, 10);

        const messages: string[] = [];
        for await (const msg of asyncIterable) {
          messages.push(msg);
        }

        expect(messages).toEqual(['only-message']);
      });

      it('should handle immediate end event (empty stream)', async () => {
        const asyncIterable = StreamWrapper.makeAsyncIterable<string>(emitter);

        setTimeout(() => {
          emitter.emit('end');
        }, 10);

        const messages: string[] = [];
        for await (const msg of asyncIterable) {
          messages.push(msg);
        }

        expect(messages).toEqual([]);
      });

      it('should propagate errors from stream', async () => {
        const asyncIterable = StreamWrapper.makeAsyncIterable<string>(emitter);
        const testError = new Error('Stream error');

        setTimeout(() => {
          emitter.emit('error', testError);
        }, 10);

        await expect(async () => {
          for await (const _ of asyncIterable) {
            // This should throw before any iteration completes
          }
        }).rejects.toThrow('Stream error');
      });

      it('should propagate error after data events', async () => {
        const asyncIterable = StreamWrapper.makeAsyncIterable<string>(emitter);
        const testError = new Error('Error after data');

        setTimeout(() => {
          emitter.emit('data', 'message1');
          emitter.emit('error', testError);
        }, 10);

        const messages: string[] = [];
        await expect(async () => {
          for await (const msg of asyncIterable) {
            messages.push(msg);
          }
        }).rejects.toThrow('Error after data');

        // Should have received first message before error
        expect(messages).toEqual(['message1']);
      });

      it('should clean up listeners on normal completion', async () => {
        const asyncIterable = StreamWrapper.makeAsyncIterable<string>(emitter);

        setTimeout(() => {
          emitter.emit('data', 'message');
          emitter.emit('end');
        }, 10);

        for await (const _ of asyncIterable) {
          // consume
        }

        // Listeners should be removed
        expect(emitter.listenerCount('data')).toBe(0);
        expect(emitter.listenerCount('end')).toBe(0);
        expect(emitter.listenerCount('error')).toBe(0);
      });

      it('should clean up listeners on error', async () => {
        const asyncIterable = StreamWrapper.makeAsyncIterable<string>(emitter);

        setTimeout(() => {
          emitter.emit('error', new Error('test'));
        }, 10);

        try {
          for await (const _ of asyncIterable) {
            // Should throw
          }
        } catch {
          // Expected
        }

        // Listeners should be removed
        expect(emitter.listenerCount('data')).toBe(0);
        expect(emitter.listenerCount('end')).toBe(0);
        expect(emitter.listenerCount('error')).toBe(0);
      });

      it('should support early termination via return()', async () => {
        const asyncIterable = StreamWrapper.makeAsyncIterable<string>(emitter);
        const iterator = asyncIterable[Symbol.asyncIterator]();

        setTimeout(() => {
          emitter.emit('data', 'message1');
          emitter.emit('data', 'message2');
          emitter.emit('data', 'message3');
          emitter.emit('end');
        }, 10);

        // Get first message
        const first = await iterator.next();
        expect(first.value).toBe('message1');

        // Early return (break)
        const returnResult = await iterator.return?.();
        expect(returnResult?.done).toBe(true);

        // Listeners should be cleaned up
        expect(emitter.listenerCount('data')).toBe(0);
        expect(emitter.listenerCount('end')).toBe(0);
        expect(emitter.listenerCount('error')).toBe(0);
      });

      it('should handle typed data', async () => {
        interface Message {
          type: string;
          payload: number;
        }

        const asyncIterable = StreamWrapper.makeAsyncIterable<Message>(emitter);

        setTimeout(() => {
          emitter.emit('data', { type: 'test', payload: 42 });
          emitter.emit('end');
        }, 10);

        const messages: Message[] = [];
        for await (const msg of asyncIterable) {
          messages.push(msg);
        }

        expect(messages).toEqual([{ type: 'test', payload: 42 }]);
      });
    });

    describe('with Node.js Readable-like streams', () => {
      it('should work with objects that have on and removeListener methods', async () => {
        const mockReadable = {
          listeners: new Map<string, Function[]>(),
          on(event: string, handler: Function) {
            if (!this.listeners.has(event)) {
              this.listeners.set(event, []);
            }
            this.listeners.get(event)!.push(handler);
            return this;
          },
          removeListener(event: string, handler: Function) {
            const handlers = this.listeners.get(event);
            if (handlers) {
              const index = handlers.indexOf(handler);
              if (index >= 0) {
                handlers.splice(index, 1);
              }
            }
            return this;
          },
          emit(event: string, ...args: any[]) {
            const handlers = this.listeners.get(event);
            if (handlers) {
              handlers.forEach((h) => h(...args));
            }
          },
        };

        const asyncIterable = StreamWrapper.makeAsyncIterable<string>(mockReadable);

        setTimeout(() => {
          mockReadable.emit('data', 'readable-data');
          mockReadable.emit('end');
        }, 10);

        const messages: string[] = [];
        for await (const msg of asyncIterable) {
          messages.push(msg);
        }

        expect(messages).toEqual(['readable-data']);
      });
    });

    describe('with invalid streams', () => {
      it('should throw TypeError for null stream', () => {
        expect(() => StreamWrapper.makeAsyncIterable(null)).toThrow(TypeError);
      });

      it('should throw TypeError for undefined stream', () => {
        expect(() => StreamWrapper.makeAsyncIterable(undefined)).toThrow(TypeError);
      });

      it('should throw TypeError for plain object without required methods', () => {
        const invalidStream = { foo: 'bar' };

        expect(() => StreamWrapper.makeAsyncIterable(invalidStream)).toThrow(
          TypeError
        );
      });

      it('should throw TypeError for object with only on method (no removeListener)', () => {
        const partialStream = {
          on: vi.fn(),
        };

        expect(() => StreamWrapper.makeAsyncIterable(partialStream)).toThrow(
          TypeError
        );
      });
    });

    describe('edge cases', () => {
      it('should handle rapid data emissions', async () => {
        const emitter = new EventEmitter();
        const asyncIterable = StreamWrapper.makeAsyncIterable<number>(emitter);

        // Emit many items rapidly
        setTimeout(() => {
          for (let i = 0; i < 100; i++) {
            emitter.emit('data', i);
          }
          emitter.emit('end');
        }, 10);

        const messages: number[] = [];
        for await (const msg of asyncIterable) {
          messages.push(msg);
        }

        expect(messages).toHaveLength(100);
        expect(messages[0]).toBe(0);
        expect(messages[99]).toBe(99);
      });

      it('should handle Buffer data', async () => {
        const emitter = new EventEmitter();
        const asyncIterable = StreamWrapper.makeAsyncIterable<Buffer>(emitter);

        const testBuffer = Buffer.from('test data');

        setTimeout(() => {
          emitter.emit('data', testBuffer);
          emitter.emit('end');
        }, 10);

        const messages: Buffer[] = [];
        for await (const msg of asyncIterable) {
          messages.push(msg);
        }

        expect(messages).toHaveLength(1);
        expect(Buffer.isBuffer(messages[0])).toBe(true);
        expect(messages[0].toString()).toBe('test data');
      });
    });
  });
});
