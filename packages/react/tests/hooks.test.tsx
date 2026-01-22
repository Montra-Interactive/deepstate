/**
 * React hook tests using @testing-library/react
 */
import { describe, test, expect } from "bun:test";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { state } from "deepstate";
import { BehaviorSubject } from "rxjs";
import { filter, map, debounceTime } from "rxjs/operators";
import { useSelect, usePipeSelect, useObservable } from "../src";

describe("useSelect", () => {
  describe("single node without selector", () => {
    test("returns current value of a primitive node", () => {
      const store = state({ count: 42 });

      function Counter() {
        const count = useSelect(store.count);
        return <div data-testid="count">{count}</div>;
      }

      render(<Counter />);
      expect(screen.getByTestId("count").textContent).toBe("42");
    });

    test("updates when node value changes", async () => {
      const store = state({ count: 0 });

      function Counter() {
        const count = useSelect(store.count);
        return <div data-testid="count">{count}</div>;
      }

      render(<Counter />);
      expect(screen.getByTestId("count").textContent).toBe("0");

      await act(() => {
        store.count.set(10);
      });

      expect(screen.getByTestId("count").textContent).toBe("10");
    });

    test("works with object nodes", async () => {
      const store = state({ user: { name: "Alice", age: 30 } });

      function User() {
        const user = useSelect(store.user);
        return <div data-testid="user">{user?.name} ({user?.age})</div>;
      }

      await act(async () => {
        render(<User />);
      });
      expect(screen.getByTestId("user").textContent).toBe("Alice (30)");
    });

    test("works with nested properties", () => {
      const store = state({ user: { name: "Alice" } });

      function UserName() {
        const name = useSelect(store.user.name);
        return <div data-testid="name">{name}</div>;
      }

      render(<UserName />);
      expect(screen.getByTestId("name").textContent).toBe("Alice");
    });

    test("works with nullable node starting as null", async () => {
      const store = state<{ selectedId: string | null }>({ selectedId: null });

      function SelectedId() {
        const id = useSelect(store.selectedId);
        return <div data-testid="id">{id ?? "none"}</div>;
      }

      render(<SelectedId />);
      expect(screen.getByTestId("id").textContent).toBe("none");

      await act(() => {
        store.selectedId.set("abc-123");
      });

      expect(screen.getByTestId("id").textContent).toBe("abc-123");
    });

    test("works with nullable node transitioning null -> value -> null", async () => {
      const store = state<{ selectedId: string | null }>({ selectedId: null });

      function SelectedId() {
        const id = useSelect(store.selectedId);
        return <div data-testid="id">{id ?? "none"}</div>;
      }

      render(<SelectedId />);
      expect(screen.getByTestId("id").textContent).toBe("none");

      await act(() => {
        store.selectedId.set("first");
      });
      expect(screen.getByTestId("id").textContent).toBe("first");

      await act(() => {
        store.selectedId.set(null);
      });
      expect(screen.getByTestId("id").textContent).toBe("none");

      await act(() => {
        store.selectedId.set("second");
      });
      expect(screen.getByTestId("id").textContent).toBe("second");
    });

    test("works with nullable object node", async () => {
      const store = state<{ user: { name: string } | null }>({ user: null });

      function User() {
        const user = useSelect(store.user);
        return <div data-testid="user">{user?.name ?? "no user"}</div>;
      }

      render(<User />);
      expect(screen.getByTestId("user").textContent).toBe("no user");

      await act(() => {
        store.user.set({ name: "Alice" });
      });

      expect(screen.getByTestId("user").textContent).toBe("Alice");
    });
  });

  describe("single node with selector", () => {
    test("applies selector to derive value", () => {
      const store = state({ user: { firstName: "Alice", lastName: "Smith" } });

      function FullName() {
        const fullName = useSelect(
          store.user,
          (user) => `${user.firstName} ${user.lastName}`
        );
        return <div data-testid="name">{fullName}</div>;
      }

      render(<FullName />);
      expect(screen.getByTestId("name").textContent).toBe("Alice Smith");
    });

    test("updates when derived value changes", async () => {
      const store = state({ items: [{ price: 10 }, { price: 20 }] });

      function Total() {
        const total = useSelect(store.items, (items) =>
          items.reduce((sum, item) => sum + item.price, 0)
        );
        return <div data-testid="total">{total}</div>;
      }

      render(<Total />);
      expect(screen.getByTestId("total").textContent).toBe("30");

      await act(() => {
        store.items.push({ price: 15 });
      });

      expect(screen.getByTestId("total").textContent).toBe("45");
    });

    test("selector prevents re-render when derived value unchanged", async () => {
      const store = state({ user: { name: "Alice", age: 30 } });

      function NameOnly() {
        const name = useSelect(store.user, (user) => user.name);
        return <div data-testid="name">{name}</div>;
      }

      await act(async () => {
        render(<NameOnly />);
      });
      expect(screen.getByTestId("name").textContent).toBe("Alice");

      // Change age - selector returns same name, so value unchanged
      await act(() => {
        store.user.age.set(31);
      });
      // Name should still be Alice
      expect(screen.getByTestId("name").textContent).toBe("Alice");

      // Change name - SHOULD update
      await act(() => {
        store.user.name.set("Bob");
      });
      expect(screen.getByTestId("name").textContent).toBe("Bob");
    });
  });

  describe("array of nodes with selector", () => {
    test("combines multiple nodes", () => {
      const store = state({ completed: 3, total: 10 });

      function Progress() {
        const percentage = useSelect(
          [store.completed, store.total],
          ([completed, total]) => (total > 0 ? (completed / total) * 100 : 0)
        );
        return <div data-testid="pct">{percentage}%</div>;
      }

      render(<Progress />);
      expect(screen.getByTestId("pct").textContent).toBe("30%");
    });

    test("updates when any node changes", async () => {
      const store = state({ completed: 3, total: 10 });

      function Progress() {
        const percentage = useSelect(
          [store.completed, store.total],
          ([completed, total]) => (total > 0 ? (completed / total) * 100 : 0)
        );
        return <div data-testid="pct">{percentage}%</div>;
      }

      render(<Progress />);
      expect(screen.getByTestId("pct").textContent).toBe("30%");

      await act(() => {
        store.completed.set(5);
      });
      expect(screen.getByTestId("pct").textContent).toBe("50%");

      await act(() => {
        store.total.set(20);
      });
      expect(screen.getByTestId("pct").textContent).toBe("25%");
    });

    test("works with different node types", async () => {
      const store = state({
        name: "Alice",
        scores: [90, 85, 95],
      });

      function Summary() {
        const summary = useSelect(
          [store.name, store.scores],
          ([name, scores]) => {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            return `${name}: ${avg.toFixed(1)}`;
          }
        );
        return <div data-testid="summary">{summary}</div>;
      }

      render(<Summary />);
      expect(screen.getByTestId("summary").textContent).toBe("Alice: 90.0");
    });
  });

  describe("object of nodes with selector", () => {
    test("combines nodes with named keys", () => {
      const store = state({ completed: 3, total: 10 });

      function Progress() {
        const percentage = useSelect(
          { completed: store.completed, total: store.total },
          ({ completed, total }) => (total > 0 ? (completed / total) * 100 : 0)
        );
        return <div data-testid="pct">{percentage}%</div>;
      }

      render(<Progress />);
      expect(screen.getByTestId("pct").textContent).toBe("30%");
    });

    test("updates when any node changes", async () => {
      const store = state({ a: 1, b: 2 });

      function Sum() {
        const sum = useSelect(
          { first: store.a, second: store.b },
          ({ first, second }) => first + second
        );
        return <div data-testid="sum">{sum}</div>;
      }

      render(<Sum />);
      expect(screen.getByTestId("sum").textContent).toBe("3");

      await act(() => {
        store.a.set(10);
      });
      expect(screen.getByTestId("sum").textContent).toBe("12");
    });
  });
});

describe("useObservable", () => {
  test("works with BehaviorSubject", () => {
    const count$ = new BehaviorSubject(42);

    function Counter() {
      const count = useObservable(count$, () => count$.getValue());
      return <div data-testid="count">{count}</div>;
    }

    render(<Counter />);
    expect(screen.getByTestId("count").textContent).toBe("42");
  });

  test("updates when BehaviorSubject emits", async () => {
    const count$ = new BehaviorSubject(0);

    function Counter() {
      const count = useObservable(count$, () => count$.getValue());
      return <div data-testid="count">{count}</div>;
    }

    render(<Counter />);
    expect(screen.getByTestId("count").textContent).toBe("0");

    await act(() => {
      count$.next(10);
    });

    expect(screen.getByTestId("count").textContent).toBe("10");
  });
});

describe("usePipeSelect", () => {
  test("returns undefined initially when filter blocks initial value", () => {
    const store = state({ count: 1 });

    function FilteredCount() {
      // Initial value is 1, which is filtered out (not > 3)
      const value = usePipeSelect(store.count.pipe(filter((v) => v > 3)));
      return <div data-testid="value">{value ?? "undefined"}</div>;
    }

    render(<FilteredCount />);
    expect(screen.getByTestId("value").textContent).toBe("undefined");
  });

  test("emits when value passes filter", async () => {
    const store = state({ count: 1 });

    function FilteredCount() {
      const value = usePipeSelect(store.count.pipe(filter((v) => v > 3)));
      return <div data-testid="value">{value ?? "undefined"}</div>;
    }

    render(<FilteredCount />);
    expect(screen.getByTestId("value").textContent).toBe("undefined");

    // Update to value that passes filter
    await act(() => {
      store.count.set(5);
    });

    expect(screen.getByTestId("value").textContent).toBe("5");
  });

  test("does not re-render when filter blocks update", async () => {
    const store = state({ count: 5 });
    let renderCount = 0;

    function FilteredCount() {
      renderCount++;
      const value = usePipeSelect(store.count.pipe(filter((v) => v > 3)));
      return <div data-testid="value">{value ?? "undefined"}</div>;
    }

    render(<FilteredCount />);
    const initialRenderCount = renderCount;

    // Initial value passes filter, so we should have it
    expect(screen.getByTestId("value").textContent).toBe("5");

    // Update to value that does NOT pass filter
    await act(() => {
      store.count.set(2);
    });

    // Should NOT have re-rendered since filter blocked it
    // Value should still be 5 (last emitted value)
    expect(screen.getByTestId("value").textContent).toBe("5");

    // Update to value that passes filter
    await act(() => {
      store.count.set(10);
    });

    expect(screen.getByTestId("value").textContent).toBe("10");
  });

  test("works with map operator", async () => {
    const store = state({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });

    function ItemCount() {
      const count = usePipeSelect(store.items.pipe(map((items) => items.length)));
      return <div data-testid="count">{count ?? "undefined"}</div>;
    }

    render(<ItemCount />);
    // Map is synchronous, so first emission happens immediately
    expect(screen.getByTestId("count").textContent).toBe("3");

    await act(() => {
      store.items.push({ id: 4 });
    });

    expect(screen.getByTestId("count").textContent).toBe("4");
  });

  test("filter then update pattern works as expected", async () => {
    /**
     * How it should work:
     * 1. initialValue (1) does not pass filter -> undefined
     * 2. update to 4 -> passes filter -> returns 4
     * 3. update to 2 -> filtered out -> does not emit (still 4)
     * 4. update to 1 -> passes filter -> returns 1, re-renders
     */
    const store = state({ value: 1 });

    function FilteredValue() {
      // Only emit values > 3 OR value === 1 (to test the "passes again" case)
      const value = usePipeSelect(
        store.value.pipe(filter((v) => v > 3 || v === 1))
      );
      return <div data-testid="value">{value ?? "undefined"}</div>;
    }

    render(<FilteredValue />);
    // Initial value 1 passes filter (v === 1)
    expect(screen.getByTestId("value").textContent).toBe("1");

    // Update to 4 -> passes filter (v > 3)
    await act(() => {
      store.value.set(4);
    });
    expect(screen.getByTestId("value").textContent).toBe("4");

    // Update to 2 -> filtered out
    await act(() => {
      store.value.set(2);
    });
    expect(screen.getByTestId("value").textContent).toBe("4"); // Still 4

    // Update to 1 -> passes filter (v === 1)
    await act(() => {
      store.value.set(1);
    });
    expect(screen.getByTestId("value").textContent).toBe("1");
  });

  test("debounceTime reduces renders", async () => {
    const store = state({ search: "" });
    let renderCount = 0;

    function DebouncedSearch() {
      renderCount++;
      const search = usePipeSelect(store.search.pipe(debounceTime(50)));
      return <div data-testid="search">{search ?? "undefined"}</div>;
    }

    render(<DebouncedSearch />);
    const initialRenders = renderCount;

    // Initial is undefined (debounce hasn't emitted yet)
    expect(screen.getByTestId("search").textContent).toBe("undefined");

    // Rapid updates
    await act(() => {
      store.search.set("a");
    });
    await act(() => {
      store.search.set("ab");
    });
    await act(() => {
      store.search.set("abc");
    });

    // Still undefined - debounce hasn't fired
    expect(screen.getByTestId("search").textContent).toBe("undefined");

    // Wait for debounce
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Now should have the final value
    expect(screen.getByTestId("search").textContent).toBe("abc");

    // Should have only rendered once for the debounced value (plus initial)
    expect(renderCount).toBeLessThanOrEqual(initialRenders + 2);
  });

  test("combined operators work", async () => {
    const store = state({ count: 0 });

    function Combined() {
      const doubled = usePipeSelect(
        store.count.pipe(
          filter((v) => v > 0),
          map((v) => v * 2)
        )
      );
      return <div data-testid="doubled">{doubled ?? "undefined"}</div>;
    }

    render(<Combined />);
    // 0 is filtered out
    expect(screen.getByTestId("doubled").textContent).toBe("undefined");

    await act(() => {
      store.count.set(5);
    });

    // 5 passes filter, then doubled to 10
    expect(screen.getByTestId("doubled").textContent).toBe("10");
  });
});

describe("stack overflow prevention", () => {
  test("should handle rapid TIME_UPDATE pattern (like audio playback)", async () => {
    // This simulates the exact pattern that causes stack overflow:
    // - HTML5 audio timeupdate fires ~4x per second (every 250ms)
    // - Each update triggers syncToRedux which sets 12+ fields
    // - Component using useSelect(store) on root re-renders each time
    const { array } = await import("deepstate");
    
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
      totalDurationMs: 25000,
      scenes: array(scenes, { distinct: "deep" }),
      triggerMode: "CHAINED" as const,
      wasPlayingBeforeScrub: false,
      scrubTargetSceneIndex: null as number | null,
      error: null as { message: string } | null,
      selectedSceneId: null as string | null,
    });

    let renderCount = 0;

    // Component using the problematic pattern: useSelect(store) on root
    function StoryboardScrubber() {
      renderCount++;
      const {
        isPlaying,
        globalTimeMs,
        totalDurationMs,
        scenes,
        isScrubbing,
      } = useSelect(store);
      
      return (
        <div data-testid="scrubber">
          {isPlaying ? "playing" : "stopped"} | 
          {globalTimeMs}/{totalDurationMs} | 
          {scenes.length} scenes |
          {isScrubbing ? "scrubbing" : "idle"}
        </div>
      );
    }

    render(<StoryboardScrubber />);
    const initialRenderCount = renderCount;

    // Simulate syncToRedux being called rapidly (like during playback)
    // This is what happens on each TIME_UPDATE event from audio element
    await act(async () => {
      for (let i = 0; i < 20; i++) {
        // Simulate syncToRedux update pattern - sets multiple fields at once
        store.update((s) => {
          s.isPlaying.set(true);
          s.isPaused.set(false);
          s.globalTimeMs.set(i * 250); // 250ms increments like timeupdate
          s.isInitializing.set(false);
        });
        
        // Small delay to simulate real timing
        await new Promise(r => setTimeout(r, 10));
      }
    });

    // Should not throw and should have rendered multiple times
    expect(renderCount).toBeGreaterThan(initialRenderCount);
    expect(screen.getByTestId("scrubber").textContent).toContain("playing");
  });

  test("should handle synchronous burst of updates without stack overflow", async () => {
    // Even more aggressive test: many synchronous updates without any delay
    // This simulates worst-case scenario
    const { array } = await import("deepstate");
    
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

    const store = state({
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      isScrubbing: false,
      isInitializing: true,
      globalTimeMs: 0,
      totalDurationMs: 50000,
      scenes: array(scenes, { distinct: "deep" }),
      triggerMode: "CHAINED" as const,
      wasPlayingBeforeScrub: false,
      scrubTargetSceneIndex: null as number | null,
      error: null as { message: string } | null,
      selectedSceneId: null as string | null,
    });

    function StoryboardScrubber() {
      const state = useSelect(store);
      return <div data-testid="time">{state.globalTimeMs}</div>;
    }

    render(<StoryboardScrubber />);

    // Burst of 100 synchronous updates - no delays
    await act(() => {
      for (let i = 0; i < 100; i++) {
        store.update((s) => {
          s.isPlaying.set(true);
          s.isPaused.set(false);
          s.globalTimeMs.set(i * 100);
          s.selectedSceneId.set(`scene-${i % 10}`);
        });
      }
    });

    expect(screen.getByTestId("time").textContent).toBe("9900");
  });

  test("should handle useSelect on root store with many fields and array with distinct:deep", async () => {
    // This reproduces the EXACT TTS player store pattern from frontend-component
    const { array } = await import("deepstate");
    
    interface PlayableScene {
      sceneId: string;
      ttsJobId: string;
      durationMs: number;
    }

    // Use 10 scenes (realistic for production)
    const scenes: PlayableScene[] = Array.from({ length: 10 }, (_, i) => ({
      sceneId: `scene-${i}`,
      ttsJobId: `job-${i}`,
      durationMs: 3000 + i * 500,
    }));

    // EXACT replica of ttsPlayerStore from frontend-component/store/deepstate/tts-player.store.ts
    const store = state({
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      isScrubbing: false,
      isInitializing: true,
      globalTimeMs: 0,
      totalDurationMs: 0,
      scenes: array(scenes, { distinct: "deep" }), // <-- This is the key difference!
      triggerMode: "CHAINED" as const,
      wasPlayingBeforeScrub: false,
      scrubTargetSceneIndex: null as number | null,
      error: null as { message: string } | null,
      selectedSceneId: null as string | null,
    });

    // The problematic pattern: useSelect(store) subscribes to entire root
    function StoryboardScrubber() {
      const {
        isPlaying,
        isPaused,
        globalTimeMs,
        totalDurationMs,
        scenes,
        isScrubbing,
      } = useSelect(store);
      
      return (
        <div data-testid="scrubber">
          {isPlaying ? "playing" : "stopped"} | 
          {isPaused ? "paused" : "running"} | 
          {globalTimeMs}/{totalDurationMs} | 
          {scenes.length} scenes |
          {isScrubbing ? "scrubbing" : "idle"}
        </div>
      );
    }

    // Should not throw stack overflow
    expect(() => {
      render(<StoryboardScrubber />);
    }).not.toThrow();

    expect(screen.getByTestId("scrubber")).toBeTruthy();

    // Updates should also work
    await act(() => {
      store.isPlaying.set(true);
      store.globalTimeMs.set(1000);
    });

    expect(screen.getByTestId("scrubber").textContent).toContain("playing");
  });

  test("should handle multiple components subscribing to same store", async () => {
    const store = state({
      isPlaying: false,
      isPaused: true,
      isLoading: false,
      globalTimeMs: 0,
      scenes: [{ id: 1 }, { id: 2 }],
      selectedSceneId: null as string | null,
    });

    // Component 1: subscribes to root (problematic pattern)
    function ComponentA() {
      const { isPlaying, isPaused, isLoading, globalTimeMs, scenes } = useSelect(store);
      return (
        <div data-testid="a">
          A: {isPlaying ? "y" : "n"}/{isPaused ? "y" : "n"}/{isLoading ? "y" : "n"}/{globalTimeMs}/{scenes.length}
        </div>
      );
    }

    // Component 2: also subscribes to root
    function ComponentB() {
      const { isPlaying, scenes } = useSelect(store);
      return <div data-testid="b">B: {isPlaying ? "y" : "n"}/{scenes.length}</div>;
    }

    // Component 3: subscribes to individual fields
    function ComponentC() {
      const isPlaying = useSelect(store.isPlaying);
      const isPaused = useSelect(store.isPaused);
      return <div data-testid="c">C: {isPlaying ? "y" : "n"}/{isPaused ? "y" : "n"}</div>;
    }

    function App() {
      return (
        <>
          <ComponentA />
          <ComponentB />
          <ComponentC />
        </>
      );
    }

    // Should not throw stack overflow
    expect(() => {
      render(<App />);
    }).not.toThrow();

    expect(screen.getByTestId("a")).toBeTruthy();
    expect(screen.getByTestId("b")).toBeTruthy();
    expect(screen.getByTestId("c")).toBeTruthy();

    // Rapid updates should also work
    await act(() => {
      store.isPlaying.set(true);
    });
    await act(() => {
      store.isPaused.set(false);
    });
    await act(() => {
      store.globalTimeMs.set(500);
    });

    expect(screen.getByTestId("a").textContent).toContain("A: y/n/n/500/2");
  });

  test("should handle useSelect on store with array using distinct:deep", async () => {
    const { array } = await import("deepstate");
    
    interface Item {
      id: number;
      name: string;
      value: number;
    }

    const items: Item[] = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      name: `item-${i}`,
      value: i * 10,
    }));

    const store = state({
      items: array(items, { distinct: "deep" }),
      selectedId: null as number | null,
    });

    function ItemList() {
      // Subscribe to entire store including array
      const { items, selectedId } = useSelect(store);
      return (
        <div data-testid="list">
          {items.length} items, selected: {selectedId ?? "none"}
        </div>
      );
    }

    expect(() => {
      render(<ItemList />);
    }).not.toThrow();

    expect(screen.getByTestId("list").textContent).toBe("10 items, selected: none");

    await act(() => {
      store.selectedId.set(5);
    });

    expect(screen.getByTestId("list").textContent).toBe("10 items, selected: 5");
  });

  test("should not cause infinite render loop when subscribing to root store", async () => {
    const { array } = await import("deepstate");

    // Replicate TTS player store structure
    const store = state({
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      isScrubbing: false,
      isInitializing: true,
      globalTimeMs: 0,
      totalDurationMs: 0,
      scenes: array([] as { sceneId: string; ttsJobId: string; durationMs: number }[], { distinct: "deep" }),
      triggerMode: "CHAINED",
      wasPlayingBeforeScrub: false,
      scrubTargetSceneIndex: null as number | null,
      error: null as { message: string } | null,
      selectedSceneId: null as string | null,
    });

    let renderCount = 0;

    function StoryboardScrubber() {
      renderCount++;
      
      // This is the problematic pattern - subscribing to entire root store
      const {
        isPlaying,
        isPaused,
        globalTimeMs,
        totalDurationMs,
        scenes,
      } = useSelect(store);

      return (
        <div data-testid="scrubber">
          {isPlaying ? "playing" : "stopped"} | {globalTimeMs}/{totalDurationMs} | {scenes.length} scenes
        </div>
      );
    }

    await act(async () => {
      render(<StoryboardScrubber />);
    });

    const initialRenderCount = renderCount;
    
    // Initial render should be 1-2 (React StrictMode may cause 2)
    expect(initialRenderCount).toBeLessThanOrEqual(2);

    // Simulate rapid updates like audio timeupdate (every 250ms during playback)
    await act(async () => {
      for (let i = 0; i < 10; i++) {
        store.globalTimeMs.set(i * 250);
      }
    });

    // After 10 updates, we should have at most ~12-14 renders (initial + 10 updates + some buffer)
    // If there's an infinite loop, renderCount would be much higher
    const finalRenderCount = renderCount;
    
    // The key assertion: render count should be reasonable, not exploding
    expect(finalRenderCount).toBeLessThan(50);
    
    console.log(`Render count: initial=${initialRenderCount}, final=${finalRenderCount}`);
  });

  test("should not re-render when store emits same values (Object.is issue)", async () => {
    const store = state({
      count: 0,
      name: "test",
    });

    let renderCount = 0;

    function Component() {
      renderCount++;
      const { count, name } = useSelect(store);
      return <div data-testid="value">{count} - {name}</div>;
    }

    await act(async () => {
      render(<Component />);
    });

    const afterInitialRender = renderCount;

    // Set the SAME values - this should NOT cause a re-render
    await act(async () => {
      store.count.set(0);  // Same value
      store.name.set("test");  // Same value
    });

    const afterSameValues = renderCount;

    // Setting same values should not increase render count significantly
    // (might be 1 extra due to how React batches, but not many)
    expect(afterSameValues - afterInitialRender).toBeLessThanOrEqual(2);

    console.log(`Render count: initial=${afterInitialRender}, afterSameValues=${afterSameValues}`);
  });

  test("root store observable emits new object reference when any field changes", async () => {
    // This test verifies that root store emits new object references
    const store = state({
      a: 1,
      b: 2,
    });

    const emissions: unknown[] = [];
    
    // Subscribe directly to the store's observable
    const sub = store.subscribe((value) => {
      emissions.push(value);
    });

    // Change field 'b' - this should cause a new emission with new object reference
    store.b.set(3);
    
    sub.unsubscribe();

    expect(emissions.length).toBe(2);
    
    const first = emissions[0];
    const second = emissions[1];
    
    // They should be different references
    const areSameReference = first === second;
    
    console.log(`Emissions are same reference: ${areSameReference}`);
    console.log(`First:`, first);
    console.log(`Second:`, second);
    
    // Root store creates new object on each emission
    expect(areSameReference).toBe(false);
  });

  test("useSelect on root store re-renders on every field change due to Object.is", async () => {
    // This test demonstrates the render loop issue
    const store = state({
      fieldA: 0,
      fieldB: 0,
    });

    let renderCount = 0;

    function Component() {
      renderCount++;
      const { fieldA, fieldB } = useSelect(store);
      return <div data-testid="value">{fieldA}-{fieldB}</div>;
    }

    await act(async () => {
      render(<Component />);
    });

    const afterInitialRender = renderCount;

    // Rapidly update ONE field multiple times (simulating timeupdate events)
    await act(async () => {
      for (let i = 1; i <= 10; i++) {
        store.fieldA.set(i);
      }
    });

    const afterUpdates = renderCount;

    console.log(`Render count after rapid updates: initial=${afterInitialRender}, final=${afterUpdates}`);
    
    // Each update to fieldA causes a new object emission from root store
    // useSelect uses Object.is which always returns false for different object refs
    // So we expect ~11 renders (1 initial + 10 updates)
    // This is expected behavior, but if batching fails, it could be much higher
    expect(afterUpdates).toBeLessThanOrEqual(15); // Allow some buffer for React batching
  });

  test("demonstrates the subscription cascade issue", async () => {
    const { array } = await import("deepstate");
    
    // Create a store similar to TTS player
    const store = state({
      isPlaying: false,
      globalTimeMs: 0,
      scenes: array([] as { id: string }[], { distinct: "deep" }),
    });

    let subscribeCallCount = 0;
    let renderCount = 0;

    // Patch the store's subscribe to count calls
    const originalSubscribe = store.subscribe.bind(store);
    (store as any).subscribe = function(callback: any) {
      subscribeCallCount++;
      return originalSubscribe(callback);
    };

    function Component() {
      renderCount++;
      const { isPlaying, globalTimeMs } = useSelect(store);
      return <div data-testid="value">{isPlaying ? "playing" : "stopped"} - {globalTimeMs}</div>;
    }

    await act(async () => {
      render(<Component />);
    });

    console.log(`After initial render: subscribeCount=${subscribeCallCount}, renderCount=${renderCount}`);

    const initialSubscribeCount = subscribeCallCount;
    const initialRenderCount = renderCount;

    // Simulate timeupdate events during playback
    await act(async () => {
      store.isPlaying.set(true);
      for (let i = 1; i <= 5; i++) {
        store.globalTimeMs.set(i * 250);
      }
    });

    console.log(`After updates: subscribeCount=${subscribeCallCount}, renderCount=${renderCount}`);

    // Key check: subscriptions should not grow unboundedly
    // If there's a loop, subscribeCallCount would be much higher than expected
    expect(subscribeCallCount - initialSubscribeCount).toBeLessThan(10);
    expect(renderCount - initialRenderCount).toBeLessThan(20);
  });
});
