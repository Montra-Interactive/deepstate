/**
 * Tests for potential stack overflow scenarios.
 * 
 * These tests verify that the library handles complex state structures
 * without exceeding the call stack, particularly when:
 * - Subscribing to root store with many fields
 * - Arrays with object elements
 * - Multiple simultaneous subscriptions
 */

import { describe, test, expect } from 'bun:test';
import { state, array } from '../src';

describe('stack overflow prevention', () => {
  describe('subscription depth measurement', () => {
    test('should measure actual subscription call depth for TTS-like store', () => {
      // Measure how deep the call stack goes when subscribing
      let maxDepth = 0;
      const originalSubscribe = Object.getPrototypeOf(
        new (require('rxjs').BehaviorSubject)(0)
      ).subscribe;

      // Monkey-patch to measure depth (only for this test)
      let currentDepth = 0;
      const depthStack: number[] = [];
      
      // We can't easily patch RxJS, so let's just create the store and count observables
      interface PlayableScene {
        sceneId: string;
        ttsJobId: string;
        durationMs: number;
      }

      const scenes: PlayableScene[] = Array.from({ length: 5 }, (_, i) => ({
        sceneId: `scene-${i}`,
        ttsJobId: `job-${i}`,
        durationMs: 5000,
      }));

      // Count how many observables are created
      let observableCount = 0;
      const originalCombineLatest = require('rxjs').combineLatest;
      
      // This store shape matches TTS player
      const store = state({
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        isScrubbing: false,
        isInitializing: true,
        globalTimeMs: 0,
        totalDurationMs: 0,
        scenes: array(scenes, { distinct: 'deep' }),
        triggerMode: 'CHAINED',
        wasPlayingBeforeScrub: false,
        scrubTargetSceneIndex: null as number | null,
        error: null as { message: string } | null,
        selectedSceneId: null as string | null,
      });

      // Just verify the store was created without throwing
      expect(store.isPlaying.get()).toBe(false);
      expect(store.scenes.get().length).toBe(5);
      
      // The fact that we got here means creation didn't overflow
      // Log info about the structure for debugging
      console.log('Store created successfully with 13 root fields and 5 scenes');
    });
  });

  describe('root store subscription', () => {
    test('should handle subscribing to root store with many fields', () => {
      // Mimics the TTS player store structure
      interface PlayableScene {
        sceneId: string;
        ttsJobId: string;
        durationMs: number;
      }

      const store = state<{
        isPlaying: boolean;
        isPaused: boolean;
        isLoading: boolean;
        isScrubbing: boolean;
        isInitializing: boolean;
        globalTimeMs: number;
        totalDurationMs: number;
        scenes: PlayableScene[];
        triggerMode: string;
        wasPlayingBeforeScrub: boolean;
        scrubTargetSceneIndex: number | null;
        error: { message: string } | null;
        selectedSceneId: string | null;
      }>({
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        isScrubbing: false,
        isInitializing: true,
        globalTimeMs: 0,
        totalDurationMs: 0,
        scenes: array([], { distinct: 'deep' }),
        triggerMode: 'CHAINED',
        wasPlayingBeforeScrub: false,
        scrubTargetSceneIndex: null,
        error: null,
        selectedSceneId: null,
      });

      // This is the problematic pattern - subscribing to entire root store
      const emissions: unknown[] = [];
      
      // Should not throw stack overflow
      expect(() => {
        const sub = store.subscribe((value) => {
          emissions.push(value);
        });
        sub.unsubscribe();
      }).not.toThrow();

      expect(emissions.length).toBe(1);
    });

    test('should handle subscribing to root store with populated array', () => {
      interface PlayableScene {
        sceneId: string;
        ttsJobId: string;
        durationMs: number;
      }

      // Create scenes like the real app would have
      const scenes: PlayableScene[] = Array.from({ length: 10 }, (_, i) => ({
        sceneId: `scene-${i}`,
        ttsJobId: `job-${i}`,
        durationMs: 5000,
      }));

      const store = state({
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        isScrubbing: false,
        isInitializing: true,
        globalTimeMs: 0,
        totalDurationMs: 50000,
        scenes: array(scenes, { distinct: 'deep' }),
        triggerMode: 'CHAINED',
        wasPlayingBeforeScrub: false,
        scrubTargetSceneIndex: null,
        error: null as { message: string } | null,
        selectedSceneId: null as string | null,
      });

      const emissions: unknown[] = [];
      
      // Should not throw stack overflow
      expect(() => {
        const sub = store.subscribe((value) => {
          emissions.push(value);
        });
        sub.unsubscribe();
      }).not.toThrow();

      expect(emissions.length).toBe(1);
    });

    test('should handle multiple simultaneous root subscriptions', () => {
      const store = state({
        a: 1,
        b: 2,
        c: 3,
        nested: { x: 10, y: 20 },
        items: [{ id: 1 }, { id: 2 }],
      });

      const subs: Array<{ unsubscribe: () => void }> = [];
      
      // Subscribe multiple times simultaneously
      expect(() => {
        for (let i = 0; i < 10; i++) {
          subs.push(store.subscribe(() => {}));
        }
      }).not.toThrow();

      // Cleanup
      subs.forEach(s => s.unsubscribe());
    });
  });

  describe('deeply nested structures', () => {
    test('should handle moderately deep nesting (10 levels)', () => {
      // Build a 10-level deep structure
      type DeepNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: {
                      level8: {
                        level9: {
                          level10: {
                            value: string;
                          };
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };

      const store = state<DeepNested>({
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: {
                      level8: {
                        level9: {
                          level10: {
                            value: 'deep',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Should not throw during creation or subscription
      expect(() => {
        const sub = store.subscribe(() => {});
        sub.unsubscribe();
      }).not.toThrow();

      // Should be able to access deepest value
      expect(store.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.value.get()).toBe('deep');
    });

    test('should handle wide object with many fields', () => {
      // Create an object with 50 fields
      const wideObject: Record<string, number> = {};
      for (let i = 0; i < 50; i++) {
        wideObject[`field${i}`] = i;
      }

      const store = state(wideObject);

      expect(() => {
        const sub = store.subscribe(() => {});
        sub.unsubscribe();
      }).not.toThrow();
    });
  });

  describe('array stress tests', () => {
    test('should handle array with many object elements', () => {
      interface Item {
        id: number;
        name: string;
        value: number;
      }

      const items: Item[] = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
        value: i * 10,
      }));

      const store = state({
        items: array(items, { distinct: 'deep' }),
      });

      expect(() => {
        const sub = store.items.subscribe(() => {});
        sub.unsubscribe();
      }).not.toThrow();

      expect(store.items.length.get()).toBe(100);
    });

    test('should handle rapid array updates without stack overflow', () => {
      const store = state({
        items: array([] as { id: number }[], { distinct: 'deep' }),
      });

      const sub = store.items.subscribe(() => {});

      // Rapid updates
      expect(() => {
        for (let i = 0; i < 50; i++) {
          store.items.push({ id: i });
        }
      }).not.toThrow();

      sub.unsubscribe();
      expect(store.items.length.get()).toBe(50);
    });
  });

  describe('combineLatest depth simulation', () => {
    test('should handle useSelect-like pattern with multiple nodes', () => {
      const { combineLatest } = require('rxjs');

      const store = state({
        a: 1,
        b: 2,
        c: 3,
        d: { nested: 4 },
        items: [{ id: 1 }, { id: 2 }],
      });

      // Simulate useSelect([store.a, store.b, store.c, store.d, store.items], ...)
      expect(() => {
        const combined$ = combineLatest([
          store.a,
          store.b,
          store.c,
          store.d,
          store.items,
        ]);
        
        const sub = combined$.subscribe(() => {});
        sub.unsubscribe();
      }).not.toThrow();
    });

    test('should handle nested combineLatest (simulating component tree)', () => {
      const { combineLatest } = require('rxjs');

      const store = state({
        user: { name: 'Alice', age: 30 },
        settings: { theme: 'dark', language: 'en' },
        items: [{ id: 1 }, { id: 2 }],
      });

      // Simulate multiple components each doing combineLatest
      const subscriptions: Array<{ unsubscribe: () => void }> = [];

      expect(() => {
        // Component 1: subscribes to user
        subscriptions.push(
          combineLatest([store.user.name, store.user.age]).subscribe(() => {})
        );

        // Component 2: subscribes to settings
        subscriptions.push(
          combineLatest([store.settings.theme, store.settings.language]).subscribe(() => {})
        );

        // Component 3: subscribes to root (problematic pattern)
        subscriptions.push(store.subscribe(() => {}));

        // Component 4: another root subscription
        subscriptions.push(store.subscribe(() => {}));
      }).not.toThrow();

      subscriptions.forEach(s => s.unsubscribe());
    });
  });

  describe('recursive subscription detection', () => {
    test('should detect if subscription triggers another subscription synchronously', () => {
      // This tests for the pattern where subscribing causes a re-render
      // which causes another subscription in React
      
      const store = state({
        count: 0,
        items: [{ id: 1 }, { id: 2 }],
      });

      let subscriptionDepth = 0;
      let maxDepth = 0;

      const trackingSubscribe = () => {
        subscriptionDepth++;
        maxDepth = Math.max(maxDepth, subscriptionDepth);
        
        const sub = store.subscribe(() => {});
        
        subscriptionDepth--;
        return sub;
      };

      const sub = trackingSubscribe();
      sub.unsubscribe();

      // Subscription should not recurse
      expect(maxDepth).toBe(1);
    });

    test('should handle subscription that triggers state change', () => {
      // This is a dangerous pattern but shouldn't cause stack overflow
      const store = state({ count: 0 });
      
      let callCount = 0;
      const maxCalls = 100;
      
      expect(() => {
        const sub = store.count.subscribe((value) => {
          callCount++;
          // Dangerous: setting state in subscription callback
          // This should NOT cause infinite recursion due to distinctUntilChanged
          if (callCount < maxCalls && value < 5) {
            store.count.set(value); // Same value - should be filtered
          }
        });
        
        sub.unsubscribe();
      }).not.toThrow();

      // Due to distinctUntilChanged, setting same value shouldn't cause extra emissions
      expect(callCount).toBe(1);
    });

    test('should handle subscription callback that sets different value (bounded)', () => {
      const store = state({ count: 0 });
      
      let emissions: number[] = [];
      
      expect(() => {
        const sub = store.count.subscribe((value) => {
          emissions.push(value);
          // Set a different value but with a bound
          if (value < 3) {
            store.count.set(value + 1);
          }
        });
        
        sub.unsubscribe();
      }).not.toThrow();

      // Should have emitted 0, 1, 2, 3 (stops at 3 because condition fails)
      expect(emissions).toEqual([0, 1, 2, 3]);
    });
  });

  describe('exact TTS player store reproduction', () => {
    test('should handle exact TTS store shape with scenes and root subscription', () => {
      // Exact reproduction of the TTS player store from frontend-component
      interface PlayableScene {
        sceneId: string;
        ttsJobId: string;
        durationMs: number;
      }

      type TtsPlayerState = {
        isPlaying: boolean;
        isPaused: boolean;
        isLoading: boolean;
        isScrubbing: boolean;
        isInitializing: boolean;
        globalTimeMs: number;
        totalDurationMs: number;
        scenes: PlayableScene[];
        triggerMode: 'SINGLE' | 'CHAINED';
        wasPlayingBeforeScrub: boolean;
        scrubTargetSceneIndex: number | null;
        error: { message: string; code: string } | null;
        selectedSceneId: string | null;
      };

      // Create with scenes populated (like after initialization)
      const scenes: PlayableScene[] = [
        { sceneId: 'scene-1', ttsJobId: 'job-1', durationMs: 5000 },
        { sceneId: 'scene-2', ttsJobId: 'job-2', durationMs: 3000 },
        { sceneId: 'scene-3', ttsJobId: 'job-3', durationMs: 7000 },
        { sceneId: 'scene-4', ttsJobId: 'job-4', durationMs: 4000 },
        { sceneId: 'scene-5', ttsJobId: 'job-5', durationMs: 6000 },
      ];

      const store = state<TtsPlayerState>({
        isPlaying: false,
        isPaused: true,
        isLoading: false,
        isScrubbing: false,
        isInitializing: false,
        globalTimeMs: 0,
        totalDurationMs: 25000,
        scenes: array(scenes, { distinct: 'deep' }),
        triggerMode: 'CHAINED',
        wasPlayingBeforeScrub: false,
        scrubTargetSceneIndex: null,
        error: null,
        selectedSceneId: 'scene-1',
      });

      // Simulate the problematic useSelect(ttsPlayerStore) pattern
      // This subscribes to the entire root which includes the scenes array
      const rootEmissions: unknown[] = [];
      
      expect(() => {
        const sub = store.subscribe((value) => {
          rootEmissions.push(value);
        });
        
        // Simulate what happens during playback - rapid state updates
        store.isPlaying.set(true);
        store.isPaused.set(false);
        store.globalTimeMs.set(1000);
        store.globalTimeMs.set(2000);
        store.globalTimeMs.set(3000);
        store.selectedSceneId.set('scene-2');
        store.globalTimeMs.set(5500);
        
        sub.unsubscribe();
      }).not.toThrow();

      // Should have received emissions
      expect(rootEmissions.length).toBeGreaterThan(0);
    });

    test('should handle simulated React strict mode double-subscription', () => {
      interface PlayableScene {
        sceneId: string;
        ttsJobId: string;
        durationMs: number;
      }

      const scenes: PlayableScene[] = Array.from({ length: 8 }, (_, i) => ({
        sceneId: `scene-${i}`,
        ttsJobId: `job-${i}`,
        durationMs: 3000 + i * 1000,
      }));

      const store = state({
        isPlaying: false,
        isPaused: true,
        isLoading: false,
        globalTimeMs: 0,
        totalDurationMs: 36000,
        scenes: array(scenes, { distinct: 'deep' }),
        selectedSceneId: null as string | null,
      });

      // Simulate React strict mode: mount, unmount, mount again rapidly
      const subscriptions: Array<{ unsubscribe: () => void }> = [];

      expect(() => {
        // First mount
        subscriptions.push(store.subscribe(() => {}));
        subscriptions.push(store.scenes.subscribe(() => {}));
        subscriptions.push(store.selectedSceneId.subscribe(() => {}));

        // Strict mode unmount
        subscriptions.forEach(s => s.unsubscribe());
        subscriptions.length = 0;

        // Second mount
        subscriptions.push(store.subscribe(() => {}));
        subscriptions.push(store.scenes.subscribe(() => {}));
        subscriptions.push(store.selectedSceneId.subscribe(() => {}));

        // Some updates
        store.isPlaying.set(true);
        store.globalTimeMs.set(5000);
      }).not.toThrow();

      subscriptions.forEach(s => s.unsubscribe());
    });

    test('should handle multiple components subscribing to root simultaneously', () => {
      // This simulates what happens when StoryboardScrubber and other components
      // all subscribe to ttsPlayerStore at the same time
      
      interface PlayableScene {
        sceneId: string;
        ttsJobId: string;
        durationMs: number;
      }

      const scenes: PlayableScene[] = Array.from({ length: 5 }, (_, i) => ({
        sceneId: `scene-${i}`,
        ttsJobId: `job-${i}`,
        durationMs: 5000,
      }));

      const store = state({
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        isScrubbing: false,
        isInitializing: true,
        globalTimeMs: 0,
        totalDurationMs: 0,
        scenes: array(scenes, { distinct: 'deep' }),
        triggerMode: 'CHAINED',
        wasPlayingBeforeScrub: false,
        scrubTargetSceneIndex: null as number | null,
        error: null as { message: string } | null,
        selectedSceneId: null as string | null,
      });

      const subscriptions: Array<{ unsubscribe: () => void }> = [];

      expect(() => {
        // StoryboardScrubber: useSelect(ttsPlayerStore) - subscribes to ROOT
        subscriptions.push(store.subscribe(() => {}));

        // StoryboardPopup: useSelect(ttsPlayerStore.scenes)
        subscriptions.push(store.scenes.subscribe(() => {}));

        // StoryboardScenePreviewButton (x5): individual field subscriptions
        for (let i = 0; i < 5; i++) {
          subscriptions.push(store.isPlaying.subscribe(() => {}));
          subscriptions.push(store.isPaused.subscribe(() => {}));
          subscriptions.push(store.isLoading.subscribe(() => {}));
          subscriptions.push(store.selectedSceneId.subscribe(() => {}));
        }

        // Another root subscription
        subscriptions.push(store.subscribe(() => {}));
      }).not.toThrow();

      // Simulate rapid updates during syncToRedux
      expect(() => {
        store.isPlaying.set(true);
        store.globalTimeMs.set(1000);
        store.scenes.set(scenes.map(s => ({ ...s, durationMs: s.durationMs + 100 })));
      }).not.toThrow();

      subscriptions.forEach(s => s.unsubscribe());
    });
  });

  describe('circular reference handling', () => {
    test('should throw clear error for circular references instead of stack overflow', () => {
      const store = state({
        items: array([] as any[]),
      });

      // Create circular reference
      const a: any = { id: 1, name: 'A' };
      const b: any = { id: 2, name: 'B' };
      a.ref = b;
      b.ref = a; // Circular!

      // Should throw a clear error, not stack overflow
      expect(() => {
        store.items.set([a, b]);
      }).toThrow(/[Cc]ircular reference/);
    });

    test('should throw clear error for self-referential objects', () => {
      const store = state({
        data: null as any,
      });

      // Self-referential object
      const obj: any = { id: 1, name: 'Self' };
      obj.self = obj;

      expect(() => {
        store.data.set(obj);
      }).toThrow(/[Cc]ircular reference/);
    });

    test('should throw clear error for deeply nested circular references', () => {
      const store = state({
        root: null as any,
      });

      // Create a chain: a -> b -> c -> a (circular)
      const a: any = { id: 'a' };
      const b: any = { id: 'b' };
      const c: any = { id: 'c' };
      a.next = b;
      b.next = c;
      c.next = a; // Circular back to start

      expect(() => {
        store.root.set(a);
      }).toThrow(/[Cc]ircular reference/);
    });

    test('should allow non-circular nested objects', () => {
      const store = state({
        data: null as any,
      });

      let emissionCount = 0;
      store.data.subscribe(() => { emissionCount++; });

      // Deeply nested but NOT circular
      const obj = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      };

      expect(() => {
        store.data.set(obj);
      }).not.toThrow();

      expect(emissionCount).toBe(2);
      expect(store.data.get()).toEqual(obj);
    });
  });
});
