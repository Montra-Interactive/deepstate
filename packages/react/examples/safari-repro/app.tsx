import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BehaviorSubject, combineLatest, Observable } from "rxjs";
import { distinctUntilChanged, filter, map, shareReplay, take } from "rxjs/operators";

// ============================================================================
// Inline deepstate implementation (minimal version for reproduction)
// ============================================================================

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  if (Array.isArray(obj)) {
    obj.forEach((item) => deepFreeze(item));
  } else {
    Object.keys(obj).forEach((key) => {
      deepFreeze((obj as Record<string, unknown>)[key]);
    });
  }
  return obj;
}

interface NodeCore<T> {
  $: Observable<T>;
  get(): T;
  set(value: T): void;
}

function createLeafNode<T>(value: T): NodeCore<T> {
  const subject$ = new BehaviorSubject<T>(value);
  const distinct$ = subject$.pipe(distinctUntilChanged(), shareReplay(1));
  distinct$.subscribe();
  return {
    $: distinct$,
    get: () => subject$.getValue(),
    set: (v: T) => subject$.next(v),
  };
}

function createObjectNode<T extends object>(value: T): NodeCore<T> & { 
  children: Map<string, NodeCore<unknown>>;
  lock(): void;
  unlock(): void;
} {
  const keys = Object.keys(value) as (keyof T)[];
  const children = new Map<keyof T, NodeCore<unknown>>();

  for (const key of keys) {
    const childValue = value[key];
    if (childValue !== null && typeof childValue === "object" && !Array.isArray(childValue)) {
      children.set(key, createObjectNode(childValue as object) as unknown as NodeCore<unknown>);
    } else if (Array.isArray(childValue)) {
      children.set(key, createArrayNode(childValue) as unknown as NodeCore<unknown>);
    } else {
      children.set(key, createLeafNode(childValue));
    }
  }

  const getCurrentValue = (): T => {
    const result = {} as T;
    for (const [key, child] of children) {
      (result as Record<string, unknown>)[key as string] = child.get();
    }
    return result;
  };

  if (keys.length === 0) {
    const empty$ = new BehaviorSubject(value).pipe(shareReplay(1));
    return {
      $: empty$,
      children: children as Map<string, NodeCore<unknown>>,
      get: () => ({}) as T,
      set: () => {},
      lock: () => {},
      unlock: () => {},
    };
  }

  const lock$ = new BehaviorSubject<boolean>(true);
  const childObservables = keys.map((key) => children.get(key)!.$);

  const $ = combineLatest([...childObservables, lock$] as Observable<unknown>[]).pipe(
    filter((values) => values[values.length - 1] === true),
    map((values) => {
      const result = {} as T;
      keys.forEach((key, i) => {
        (result as Record<string, unknown>)[key as string] = values[i];
      });
      return result;
    }),
    shareReplay(1)
  );

  $.subscribe(); // Keep hot

  const frozen$ = $.pipe(map(deepFreeze));

  return {
    $: frozen$,
    children: children as Map<string, NodeCore<unknown>>,
    get: () => deepFreeze(getCurrentValue()),
    set: (v: T) => {
      for (const [key, child] of children) {
        child.set(v[key]);
      }
    },
    lock: () => lock$.next(false),
    unlock: () => lock$.next(true),
  };
}

function createArrayNode<T>(value: T[]): NodeCore<T[]> & {
  lock(): void;
  unlock(): void;
} {
  const subject$ = new BehaviorSubject<T[]>([...value]);
  const lock$ = new BehaviorSubject<boolean>(true);

  const baseLocked$ = combineLatest([subject$, lock$]).pipe(
    filter(([_, unlocked]) => unlocked),
    map(([arr, _]) => arr),
  );
  
  const locked$ = baseLocked$.pipe(
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    map(deepFreeze),
    shareReplay(1)
  );
  locked$.subscribe();

  return {
    $: locked$ as Observable<T[]>,
    get: () => deepFreeze([...subject$.getValue()]) as T[],
    set: (v: T[]) => subject$.next([...v]),
    lock: () => lock$.next(false),
    unlock: () => lock$.next(true),
  };
}

type RxState<T extends object> = Observable<T> & {
  get(): T;
  set(value: T): void;
  update(callback: (draft: any) => void): T;
  subscribe: Observable<T>["subscribe"];
} & {
  [K in keyof T]: T[K] extends object 
    ? RxState<T[K] & object> 
    : Observable<T[K]> & { get(): T[K]; set(value: T[K]): void };
};

function state<T extends object>(initialState: T): RxState<T> {
  const node = createObjectNode(initialState);
  
  function wrapWithProxy(n: NodeCore<any> & { children?: Map<string, NodeCore<unknown>>; lock?(): void; unlock?(): void }, path: string = ''): any {
    const value = n.get();
    
    if (value === null || typeof value !== "object") {
      return Object.assign(n.$, {
        get: n.get,
        set: n.set,
        subscribe: n.$.subscribe.bind(n.$),
        pipe: n.$.pipe.bind(n.$),
      });
    }

    if (Array.isArray(value)) {
      return Object.assign(n.$, {
        get: n.get,
        set: n.set,
        subscribe: n.$.subscribe.bind(n.$),
        pipe: n.$.pipe.bind(n.$),
        update: (callback: (draft: any) => void) => {
          n.lock?.();
          try {
            callback(n);
          } finally {
            n.unlock?.();
          }
          return n.get();
        },
      });
    }

    const objectNode = n as NodeCore<object> & { children: Map<string, NodeCore<unknown>>; lock(): void; unlock(): void };
    
    let updateFn: ((callback: (draft: object) => void) => object) | undefined;

    const proxy = new Proxy(n.$ as object, {
      get(target, prop: PropertyKey) {
        if (prop === "subscribe") return n.$.subscribe.bind(n.$);
        if (prop === "pipe") return n.$.pipe.bind(n.$);
        if (prop === "get") return n.get;
        if (prop === "set") return n.set;
        if (prop === "update") return updateFn;

        if (objectNode.children && typeof prop === "string") {
          const child = objectNode.children.get(prop);
          if (child) {
            return wrapWithProxy(child as any, path ? `${path}.${prop}` : prop);
          }
        }

        if (prop in target) {
          const val = (target as Record<PropertyKey, unknown>)[prop];
          return typeof val === "function" ? val.bind(target) : val;
        }

        return undefined;
      },
    });

    if (objectNode.lock && objectNode.unlock) {
      updateFn = (callback: (draft: object) => void): object => {
        objectNode.lock();
        try {
          callback(proxy as object);
        } finally {
          objectNode.unlock();
        }
        return n.get() as object;
      };
    }

    return proxy;
  }

  return wrapWithProxy(node) as RxState<T>;
}

function array<T>(value: T[], options?: { distinct?: "deep" }): T[] {
  return value; // Just return the value, createArrayNode handles it
}

// ============================================================================
// Inline useSelect implementation (from deepstate-react)
// ============================================================================

interface NodeWithGet<T> {
  get(): T;
}

function hasGet<T>(obj: unknown): obj is NodeWithGet<T> {
  if (obj === null || typeof obj !== "object") return false;
  try {
    return typeof (obj as NodeWithGet<T>).get === "function";
  } catch {
    return false;
  }
}

function isObservable(obj: unknown): obj is Observable<unknown> {
  if (obj === null || typeof obj !== "object") return false;
  try {
    return typeof (obj as Record<string, unknown>).subscribe === "function";
  } catch {
    return false;
  }
}

function useSelect<T>(node: Observable<T> & { get(): T }): T {
  const { combined$, getInitialValue } = useMemo(() => {
    return {
      combined$: node.pipe(distinctUntilChanged()),
      getInitialValue: (): T => {
        if (hasGet<T>(node)) {
          return node.get();
        }
        return undefined as T;
      },
    };
  }, [node]);

  const valueRef = useRef<T>(getInitialValue());

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const subscription = combined$.subscribe((newValue) => {
        valueRef.current = newValue;
        onStoreChange();
      });

      return () => subscription.unsubscribe();
    },
    [combined$]
  );

  const getSnapshot = useCallback(() => valueRef.current, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ============================================================================
// App code (reproduction of TTS player pattern)
// ============================================================================

// Exact replica of PlayableScene from frontend-component
interface PlayableScene {
  sceneId: string;
  ttsJobId: string;
  durationMs: number;
}

// Exact replica of ttsPlayerStore shape from frontend-component
const ttsPlayerStore = state({
  isPlaying: false,
  isPaused: false,
  isLoading: false,
  isScrubbing: false,
  isInitializing: true,
  globalTimeMs: 0,
  totalDurationMs: 0,
  scenes: array([] as PlayableScene[], { distinct: "deep" }),
  triggerMode: "CHAINED" as const,
  wasPlayingBeforeScrub: false,
  scrubTargetSceneIndex: null as number | null,
  error: null as { message: string } | null,
  selectedSceneId: null as string | null,
});

// Log to help debug
console.log("Store created successfully");

// Component that uses the PROBLEMATIC pattern: useSelect on entire root store
function StoryboardScrubber() {
  console.log("StoryboardScrubber rendering...");
  
  // This is the problematic pattern from storyboard-scrubber.presenter.tsx:59
  const {
    isPlaying,
    globalTimeMs,
    totalDurationMs,
    scenes,
    triggerMode,
    scrubTargetSceneIndex,
    isPaused,
    isLoading,
    isScrubbing,
    error,
  } = useSelect(ttsPlayerStore);

  console.log("StoryboardScrubber got values:", { isPlaying, globalTimeMs, scenes: scenes.length });

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", margin: "10px" }}>
      <h3>Storyboard Scrubber (uses useSelect on root store)</h3>
      <p>isPlaying: {isPlaying ? "true" : "false"}</p>
      <p>isPaused: {isPaused ? "true" : "false"}</p>
      <p>isLoading: {isLoading ? "true" : "false"}</p>
      <p>isScrubbing: {isScrubbing ? "true" : "false"}</p>
      <p>globalTimeMs: {globalTimeMs}</p>
      <p>totalDurationMs: {totalDurationMs}</p>
      <p>scenes: {scenes.length}</p>
      <p>triggerMode: {triggerMode}</p>
      <p>error: {error ? error.message : "none"}</p>
    </div>
  );
}

// Simulate the TTS player service updating state rapidly (like audio timeupdate events)
function useTtsPlaybackSimulation() {
  useEffect(() => {
    console.log("Starting playback simulation...");
    
    // Simulate initializing with scenes
    const scenes: PlayableScene[] = Array.from({ length: 5 }, (_, i) => ({
      sceneId: `scene-${i}`,
      ttsJobId: `job-${i}`,
      durationMs: 5000,
    }));

    // Initial sync (like what happens after loadDurationsAndPreload)
    ttsPlayerStore.update((s) => {
      s.scenes.set(scenes);
      s.totalDurationMs.set(25000);
      s.isInitializing.set(false);
      s.selectedSceneId.set("scene-0");
    });

    // Simulate playback starting
    setTimeout(() => {
      console.log("Starting simulated playback...");
      ttsPlayerStore.isPlaying.set(true);
      ttsPlayerStore.isPaused.set(false);
    }, 1000);

    // Simulate TIME_UPDATE events (every 250ms like HTML5 audio timeupdate)
    let currentTime = 0;
    const interval = setInterval(() => {
      currentTime += 250;
      
      // This simulates syncToRedux being called on each TIME_UPDATE
      ttsPlayerStore.update((s) => {
        s.globalTimeMs.set(currentTime);
        // These might also be set on each sync in production
        s.isPlaying.set(true);
        s.isPaused.set(false);
        s.isLoading.set(false);
      });

      if (currentTime >= 25000) {
        clearInterval(interval);
        console.log("Playback simulation complete");
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);
}

// Additional components that also subscribe (like in production)
function ScenePreviewButton({ sceneId }: { sceneId: string }) {
  const isPlaying = useSelect(ttsPlayerStore.isPlaying);
  const isPaused = useSelect(ttsPlayerStore.isPaused);
  const isLoading = useSelect(ttsPlayerStore.isLoading);
  const selectedSceneId = useSelect(ttsPlayerStore.selectedSceneId);
  
  const isSelected = selectedSceneId === sceneId;
  
  return (
    <button 
      style={{ 
        padding: "5px 10px", 
        margin: "2px",
        background: isSelected ? "#007bff" : "#eee",
        color: isSelected ? "white" : "black",
        border: "none",
        borderRadius: "4px"
      }}
    >
      {sceneId} {isPlaying && isSelected ? "▶" : ""} {isLoading && isSelected ? "⏳" : ""}
    </button>
  );
}

function SceneList() {
  const scenes = useSelect(ttsPlayerStore.scenes);
  
  return (
    <div style={{ padding: "10px", border: "1px solid #ccc", margin: "10px" }}>
      <h4>Scene Preview Buttons (each subscribes to 4 fields)</h4>
      <div>
        {scenes.map((scene) => (
          <ScenePreviewButton key={scene.sceneId} sceneId={scene.sceneId} />
        ))}
      </div>
    </div>
  );
}

function App() {
  const [showScrubber, setShowScrubber] = useState(true);
  const [showSceneList, setShowSceneList] = useState(true);
  const [stressTest, setStressTest] = useState(false);
  
  useTtsPlaybackSimulation();

  // Stress test: rapidly toggle components to trigger mount/unmount cycles
  useEffect(() => {
    if (!stressTest) return;
    
    let count = 0;
    const interval = setInterval(() => {
      setShowScrubber(prev => !prev);
      count++;
      if (count > 20) {
        clearInterval(interval);
        setStressTest(false);
        setShowScrubber(true);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [stressTest]);

  return (
    <div style={{ fontFamily: "system-ui", padding: "20px" }}>
      <h1>Deepstate Safari Stack Overflow Reproduction</h1>
      
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px" }}>
        <button onClick={() => setShowScrubber(!showScrubber)}>
          {showScrubber ? "Hide" : "Show"} Scrubber
        </button>
        <button onClick={() => setShowSceneList(!showSceneList)}>
          {showSceneList ? "Hide" : "Show"} Scene List
        </button>
        <button 
          onClick={() => setStressTest(true)}
          style={{ background: "#ff4444", color: "white", border: "none", padding: "5px 15px", borderRadius: "4px" }}
        >
          Stress Test (rapid mount/unmount)
        </button>
      </div>

      {showScrubber && <StoryboardScrubber />}
      {showSceneList && <SceneList />}

      <div style={{ marginTop: "20px", padding: "10px", background: "#f5f5f5" }}>
        <h4>Instructions:</h4>
        <ol>
          <li>Open this page in Safari</li>
          <li>Open Developer Tools (Cmd+Option+I)</li>
          <li>Check the Console for errors</li>
          <li>Click "Stress Test" to rapidly mount/unmount components</li>
          <li>Watch for "RangeError: Maximum call stack size exceeded"</li>
        </ol>
        <p>The playback simulation updates state every 250ms, mimicking audio timeupdate events.</p>
      </div>
    </div>
  );
}

// Mount the app
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
