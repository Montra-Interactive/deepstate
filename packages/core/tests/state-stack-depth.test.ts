/**
 * Tests to measure and verify subscription stack depth.
 * 
 * These tests help diagnose stack overflow issues that occur in browsers
 * with smaller stack limits (like Safari ~36k frames vs Chrome ~125k).
 */

import { describe, test, expect } from 'bun:test';
import { state, array } from '../src';

// Helper to measure current stack depth
function getStackDepth(): number {
  try {
    throw new Error();
  } catch (e) {
    return (e as Error).stack?.split('\n').length ?? 0;
  }
}

// Helper to measure stack depth during a callback
function measureCallStackDepth(fn: () => void): number {
  let maxDepth = 0;
  const originalSubscribe = (globalThis as any).__rxjsSubscribeDepth ?? 0;
  
  // We can't easily hook into RxJS, so we'll use a recursive probe
  function probe(depth: number): number {
    if (depth > maxDepth) maxDepth = depth;
    return depth;
  }
  
  const startDepth = getStackDepth();
  fn();
  const endDepth = getStackDepth();
  
  return endDepth - startDepth;
}

describe('subscription stack depth analysis', () => {
  test('should measure baseline stack depth for simple state', () => {
    const store = state({ count: 0 });
    
    let subscribeStackDepth = 0;
    const baselineDepth = getStackDepth();
    
    store.count.subscribe(() => {
      subscribeStackDepth = getStackDepth() - baselineDepth;
    });
    
    console.log(`Baseline stack depth for leaf subscription: ${subscribeStackDepth}`);
    expect(subscribeStackDepth).toBeGreaterThan(0);
    expect(subscribeStackDepth).toBeLessThan(100); // Should be very shallow
  });

  test('should measure stack depth for root store subscription with TTS-like shape', () => {
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

    let subscribeStackDepth = 0;
    const baselineDepth = getStackDepth();
    
    // Subscribe to root store (the problematic pattern)
    store.subscribe(() => {
      subscribeStackDepth = getStackDepth() - baselineDepth;
    });
    
    console.log(`Stack depth for root store subscription (13 fields, 5 scenes): ${subscribeStackDepth}`);
    
    // This is the key metric - if this is too high, Safari will overflow
    // Safari limit: ~36,000 frames
    // Chrome limit: ~125,000 frames
    expect(subscribeStackDepth).toBeLessThan(1000); // Should be manageable
  });

  test('should measure stack depth during state update with root subscription', () => {
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

    let updateStackDepth = 0;
    let emissionCount = 0;
    const baselineDepth = getStackDepth();
    
    // Subscribe to root store
    store.subscribe(() => {
      emissionCount++;
      if (emissionCount > 1) { // Skip initial emission
        updateStackDepth = getStackDepth() - baselineDepth;
      }
    });
    
    // Trigger update like syncToRedux does
    store.update((s) => {
      s.isPlaying.set(true);
      s.globalTimeMs.set(1000);
    });
    
    console.log(`Stack depth during update with root subscription: ${updateStackDepth}`);
    expect(updateStackDepth).toBeLessThan(1000);
  });

  test('should handle deeply nested state without stack overflow', () => {
    // Create a deeply nested structure to stress test
    type Level10 = { value: string };
    type Level9 = { level10: Level10 };
    type Level8 = { level9: Level9 };
    type Level7 = { level8: Level8 };
    type Level6 = { level7: Level7 };
    type Level5 = { level6: Level6 };
    type Level4 = { level5: Level5 };
    type Level3 = { level4: Level4 };
    type Level2 = { level3: Level3 };
    type Level1 = { level2: Level2 };
    type DeepState = { level1: Level1 };

    const store = state<DeepState>({
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

    let subscribeStackDepth = 0;
    const baselineDepth = getStackDepth();
    
    // Subscribe to root of deeply nested store
    store.subscribe(() => {
      subscribeStackDepth = getStackDepth() - baselineDepth;
    });
    
    console.log(`Stack depth for 10-level nested store: ${subscribeStackDepth}`);
    expect(subscribeStackDepth).toBeLessThan(1000);
  });

  test('should handle wide state (many fields) without stack overflow', () => {
    // Create a wide object with 50 fields
    const wideState: Record<string, number> = {};
    for (let i = 0; i < 50; i++) {
      wideState[`field${i}`] = i;
    }

    const store = state(wideState);

    let subscribeStackDepth = 0;
    const baselineDepth = getStackDepth();
    
    store.subscribe(() => {
      subscribeStackDepth = getStackDepth() - baselineDepth;
    });
    
    console.log(`Stack depth for 50-field wide store: ${subscribeStackDepth}`);
    expect(subscribeStackDepth).toBeLessThan(1000);
  });

  test('should handle multiple simultaneous subscriptions', () => {
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

    let maxStackDepth = 0;
    const baselineDepth = getStackDepth();
    
    // Simulate multiple components subscribing (like in React)
    const subscriptions = [];
    
    // Component 1: root subscription (StoryboardScrubber pattern)
    subscriptions.push(store.subscribe(() => {
      const depth = getStackDepth() - baselineDepth;
      if (depth > maxStackDepth) maxStackDepth = depth;
    }));
    
    // Component 2: scenes subscription
    subscriptions.push(store.scenes.subscribe(() => {}));
    
    // Component 3: individual field subscriptions (like StoryboardScenePreviewButton)
    subscriptions.push(store.isPlaying.subscribe(() => {}));
    subscriptions.push(store.isPaused.subscribe(() => {}));
    subscriptions.push(store.isLoading.subscribe(() => {}));
    subscriptions.push(store.selectedSceneId.subscribe(() => {}));
    
    // Trigger an update
    store.update((s) => {
      s.isPlaying.set(true);
      s.globalTimeMs.set(250);
    });
    
    console.log(`Max stack depth with multiple subscriptions: ${maxStackDepth}`);
    
    // Cleanup
    subscriptions.forEach(s => s.unsubscribe());
    
    expect(maxStackDepth).toBeLessThan(1000);
  });

  test('should measure actual recursion depth using Error stack', () => {
    // Capture stack trace during subscription to measure true depth
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

    // Capture full stack trace during subscription
    let subscriptionStack = '';
    let stackFrameCount = 0;
    
    // Override Error.prepareStackTrace temporarily to get unlimited stack
    const originalPrepareStackTrace = Error.prepareStackTrace;
    const originalStackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = Infinity;
    
    try {
      // Create a custom subscriber that captures the stack
      const { Observable } = require('rxjs');
      const originalSubscribe = Observable.prototype.subscribe;
      let callCount = 0;
      
      Observable.prototype.subscribe = function(...args: any[]) {
        callCount++;
        if (callCount === 1) { // Capture on first subscribe call
          const err = new Error();
          subscriptionStack = err.stack || '';
          stackFrameCount = subscriptionStack.split('\n').length;
        }
        return originalSubscribe.apply(this, args);
      };
      
      try {
        // This triggers the subscription chain
        const sub = store.subscribe(() => {});
        sub.unsubscribe();
        
        console.log(`Stack frames during subscription: ${stackFrameCount}`);
        console.log(`Subscribe calls triggered: ${callCount}`);
        
        // Log first 20 and last 10 frames for analysis
        const frames = subscriptionStack.split('\n');
        console.log('First 20 frames:');
        frames.slice(0, 20).forEach((f, i) => console.log(`  ${i}: ${f.trim().substring(0, 100)}`));
        if (frames.length > 30) {
          console.log('...');
          console.log('Last 10 frames:');
          frames.slice(-10).forEach((f, i) => console.log(`  ${frames.length - 10 + i}: ${f.trim().substring(0, 100)}`));
        }
        
        expect(stackFrameCount).toBeLessThan(500); // Reasonable limit
        expect(callCount).toBeGreaterThan(1); // Multiple subscriptions happen
      } finally {
        Observable.prototype.subscribe = originalSubscribe;
      }
    } finally {
      Error.prepareStackTrace = originalPrepareStackTrace;
      Error.stackTraceLimit = originalStackTraceLimit;
    }
  });

  test('should measure subscribe calls during STORE CREATION', () => {
    // The key insight: subscriptions happen during state() call, not when user subscribes
    const { Observable } = require('rxjs');
    const originalSubscribe = Observable.prototype.subscribe;
    
    let subscribeCount = 0;
    let maxStackDepth = 0;
    
    Observable.prototype.subscribe = function(...args: any[]) {
      subscribeCount++;
      // Measure stack depth at each subscribe call
      const err = new Error();
      const depth = (err.stack?.split('\n').length || 0);
      if (depth > maxStackDepth) {
        maxStackDepth = depth;
      }
      return originalSubscribe.apply(this, args);
    };
    
    try {
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

      // Reset counter before creation
      subscribeCount = 0;
      maxStackDepth = 0;

      // THIS is where subscriptions happen - during state() call
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

      console.log(`Subscribe calls during store CREATION: ${subscribeCount}`);
      console.log(`Max stack depth during store CREATION: ${maxStackDepth}`);
      
      // This is the critical metric for Safari
      // Safari limit ~36k, if maxStackDepth approaches this, we have a problem
      expect(subscribeCount).toBeGreaterThan(10); // Expect many internal subscriptions
      expect(maxStackDepth).toBeLessThan(200); // Should be reasonable
    } finally {
      Observable.prototype.subscribe = originalSubscribe;
    }
  });

  test('should try to trigger stack overflow with artificial recursion limit', () => {
    // Try to reproduce stack overflow by artificially limiting recursion
    interface PlayableScene {
      sceneId: string;
      ttsJobId: string;
      durationMs: number;
    }

    const scenes: PlayableScene[] = Array.from({ length: 10 }, (_, i) => ({
      sceneId: `scene-${i}`,
      ttsJobId: `job-${i}`,
      durationMs: 5000,
    }));

    // Create store
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

    // Count how many times combineLatest subscribe is called
    let subscribeCount = 0;
    const { Observable } = require('rxjs');
    const originalSubscribe = Observable.prototype.subscribe;
    
    Observable.prototype.subscribe = function(...args: any[]) {
      subscribeCount++;
      return originalSubscribe.apply(this, args);
    };
    
    try {
      const sub = store.subscribe(() => {});
      console.log(`Total Observable.subscribe calls for root subscription: ${subscribeCount}`);
      sub.unsubscribe();
      
      // If this number is high, that's the source of the stack depth issue
      // Safari has ~36k stack limit, each subscribe adds ~10-20 frames
      // So if subscribeCount * framesPerSubscribe > 36000, Safari would overflow
      expect(subscribeCount).toBeGreaterThan(0);
    } finally {
      Observable.prototype.subscribe = originalSubscribe;
    }
  });
});
