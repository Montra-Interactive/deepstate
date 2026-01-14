/**
 * useSelect Demo - React bindings for deepstate
 *
 * This demo shows all the ways to use useSelect with deepstate.
 * Run with: bun packages/react/examples/useSelect-demo.tsx
 */

import { StrictMode } from "react";
// @ts-expect-error - react-dom/client types may not be installed
import { createRoot } from "react-dom/client";
import { state } from "../../core/src";
import { usePipeSelect, useSelect } from "../src";
import { debounceTime, filter, map } from "rxjs";

// =============================================================================
// Store Setup
// =============================================================================

type StateType = {
  user: {
    firstName: string;
    lastName: string;
    age: number;
  };
  settings: {
    theme: "light" | "dark";
    notifications: boolean;
  };
  todos: { id: number; text: string; completed: boolean }[];
  stats: {
    completed: number;
    total: number;
  };
  currentTimeMs: number;
  clips: { id: number; name: string; duration: number }[];
  searchQuery: string;
};

const store = state<StateType>({
  user: {
    firstName: "Alice",
    lastName: "Smith",
    age: 30,
  },
  settings: {
    theme: "dark" as "light" | "dark",
    notifications: true,
  },
  todos: [
    { id: 1, text: "Learn deepstate", completed: true },
    { id: 2, text: "Build an app", completed: false },
    { id: 3, text: "Ship it!", completed: false },
  ],
  stats: {
    completed: 1,
    total: 3,
  },
  currentTimeMs: 0,
  clips: [
    { id: 1, name: "Intro", duration: 5000 },
    { id: 2, name: "Main Content", duration: 30000 },
    { id: 3, name: "Outro", duration: 3000 },
  ],
  searchQuery: "",
});

// Start a timer that updates currentTimeMs every 100ms (high frequency)
if (typeof window !== "undefined") {
  setInterval(() => {
    store.currentTimeMs.set(Date.now());
  }, 100);
}

// =============================================================================
// usePipeSelect Examples - For piped observables with RxJS operators
// =============================================================================

/**
 * usePipeSelect is for observables that have been transformed with .pipe()
 * 
 * Key differences from useSelect:
 * - Initial value is `undefined` until the first emission
 * - Works with any RxJS operator (filter, map, debounceTime, etc.)
 * - Return type is always `T | undefined`
 * 
 * Use cases:
 * - Debouncing high-frequency updates to reduce re-renders
 * - Filtering values (only re-render when certain conditions are met)
 * - Transforming values with map (e.g., reduce array to computed value)
 */

function DebounceDemo() {
  // Without debounce - updates every 100ms (high frequency!)
  const rawTime = useSelect(store.currentTimeMs);
  
  // With debounce - updates at most once per second
  const debouncedTime = usePipeSelect(
    store.currentTimeMs.pipe(debounceTime(1000))
  );

  return (
    <div>
      <strong>Debounce Demo:</strong>
      <br />
      Raw (100ms): {new Date(rawTime).toLocaleTimeString()}
      <br />
      Debounced (1s): {debouncedTime ? new Date(debouncedTime).toLocaleTimeString() : "waiting..."}
    </div>
  );
}

function FilterDemo() {
  // Only emit when stats.completed > 1
  const filteredCompleted = usePipeSelect(
    store.stats.completed.pipe(filter((v) => v > 1))
  );

  return (
    <div>
      <strong>Filter Demo:</strong> Completed (only when {">"} 1):{" "}
      {filteredCompleted ?? "filtered out (≤1)"}
    </div>
  );
}

function MapReduceDemo() {
  // Transform array to computed value using map + Array.reduce
  // This is type-safe: totalDuration is `number | undefined`
  const totalDuration = usePipeSelect(
    store.clips.pipe(
      map((clips) => clips.reduce((sum, clip) => sum + clip.duration, 0))
    )
  );

  // Map to different shape
  const clipNames = usePipeSelect(
    store.clips.pipe(map((clips) => clips.map((c) => c.name).join(", ")))
  );

  return (
    <div>
      <strong>Map + Reduce Demo:</strong>
      <br />
      Total duration: {totalDuration ? `${totalDuration / 1000}s` : "calculating..."}
      <br />
      Clip names: {clipNames ?? "loading..."}
    </div>
  );
}

function CombinedOperatorsDemo() {
  // Chain multiple operators: filter then map
  const longClipCount = usePipeSelect(
    store.clips.pipe(
      map((clips) => clips.filter((c) => c.duration > 5000)),
      map((longClips) => longClips.length)
    )
  );

  return (
    <div>
      <strong>Combined Operators:</strong> Clips longer than 5s: {longClipCount ?? 0}
    </div>
  );
}

function DebouncedSearchDemo() {
  // Debounced search input - reduces API calls / expensive computations
  const debouncedQuery = usePipeSelect(
    store.searchQuery.pipe(
      debounceTime(300),
      filter((q) => q.length >= 2) // Only emit when query is at least 2 chars
    )
  );

  return (
    <div>
      <strong>Debounced Search:</strong>
      <br />
      <input
        type="text"
        placeholder="Type to search (min 2 chars)..."
        value={useSelect(store.searchQuery)}
        onChange={(e) => store.searchQuery.set(e.target.value)}
        style={{ padding: "4px", width: "200px" }}
      />
      <br />
      Debounced query: "{debouncedQuery ?? "(waiting for input...)"}"
    </div>
  );
}

// =============================================================================
// Example 1: Single node - get raw value
// =============================================================================

function UserAge() {
  // Subscribe to a single primitive value
  const age = useSelect(store.user.age);

  return (
    <div>
      <strong>1. Single primitive:</strong> Age is {age}
    </div>
  );
}

function UserObject() {
  // Subscribe to an entire object
  const user = useSelect(store.user);

  return (
    <div>
      <strong>2. Single object:</strong> {user.firstName} {user.lastName},{" "}
      {user.age} years old
    </div>
  );
}

// =============================================================================
// Example 2: Single node with selector - derive a value
// =============================================================================

function FullName() {
  // Transform a single node's value
  const fullName = useSelect(
    store.user,
    (user) => `${user.firstName} ${user.lastName}`
  );

  return (
    <div>
      <strong>3. With selector:</strong> Full name is "{fullName}"
    </div>
  );
}

function ThemeEmoji() {
  // Simple transformation
  const emoji = useSelect(store.settings.theme, (theme) =>
    theme === "dark" ? "dark theme" : "light theme"
  );

  return (
    <div>
      <strong>4. Theme selector:</strong> Current theme: {emoji}
    </div>
  );
}

// =============================================================================
// Example 3: Multiple nodes (array form) - combine values
// =============================================================================

function Progress() {
  // Combine two nodes to compute a derived value
  const percentage = useSelect(
    [store.stats.completed, store.stats.total],
    ([completed, total]) => (total > 0 ? Math.round((completed / total) * 100) : 0)
  );

  return (
    <div>
      <strong>5. Array form:</strong> Progress: {percentage}%
    </div>
  );
}

function UserWithTheme() {
  // Combine values from different parts of the store
  const summary = useSelect(
    [store.user.firstName, store.settings.theme],
    ([name, theme]) => `${name} prefers ${theme} mode`
  );

  return (
    <div>
      <strong>6. Cross-store:</strong> {summary}
    </div>
  );
}

// =============================================================================
// Example 4: Multiple nodes (object form) - named values
// =============================================================================

function ProgressNamed() {
  // Object form - easier to read with many dependencies
  const status = useSelect(
    {
      completed: store.stats.completed,
      total: store.stats.total,
      name: store.user.firstName,
    },
    ({ completed, total, name }) =>
      `${name} has completed ${completed} of ${total} tasks`
  );

  return (
    <div>
      <strong>7. Object form:</strong> {status}
    </div>
  );
}

// =============================================================================
// Example 5: Custom equality function
// =============================================================================

function TodoIds() {
  // Custom equality to prevent re-renders when array contents are the same
  const ids = useSelect(
    store.todos,
    (todos) => todos.map((t) => t.id),
    (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
  );

  return (
    <div>
      <strong>8. Custom equality:</strong> Todo IDs: [{ids.join(", ")}]
    </div>
  );
}

// =============================================================================
// Interactive Controls
// =============================================================================

function Controls() {
  return (
    <div style={{ marginTop: "20px", padding: "10px", border: "1px solid #ccc" }}>
      <h3>Controls</h3>
      
      <div style={{ marginBottom: "10px" }}>
        <strong>usePipeSelect demos:</strong>
        <br />
        <button
          type="button"
          onClick={() => {
            const current = store.stats.completed.get();
            store.stats.completed.set(current + 1);
          }}
        >
          Increment Completed (filter demo)
        </button>{" "}
        <button
          type="button"
          onClick={() => store.stats.completed.set(0)}
        >
          Reset Completed to 0
        </button>{" "}
        <button
          type="button"
          onClick={() => {
            const clips = store.clips.get();
            store.clips.push({
              id: clips.length + 1,
              name: `Clip ${clips.length + 1}`,
              duration: Math.floor(Math.random() * 20000) + 1000,
            });
          }}
        >
          Add Random Clip
        </button>{" "}
        <button
          type="button"
          onClick={() => store.clips.pop()}
        >
          Remove Last Clip
        </button>
      </div>

      <div>
        <strong>useSelect demos:</strong>
        <br />
        <button type="button" onClick={() => store.user.age.set(store.user.age.get() + 1)}>
          Increment Age
        </button>{" "}
        <button
          type="button"
          onClick={() =>
            store.settings.theme.set(
              store.settings.theme.get() === "dark" ? "light" : "dark"
            )
          }
        >
          Toggle Theme
        </button>{" "}
        <button
          type="button"
          onClick={() => {
            const current = store.stats.completed.get();
            const total = store.stats.total.get();
            if (current < total) {
              store.stats.completed.set(current + 1);
            }
          }}
        >
          Complete Task
        </button>{" "}
        <button
          type="button"
          onClick={() => {
            store.user.firstName.set(
              store.user.firstName.get() === "Alice" ? "Bob" : "Alice"
            );
          }}
        >
          Change Name
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// App
// =============================================================================

function App() {
  return (
    <div style={{ fontFamily: "system-ui", padding: "20px", maxWidth: "600px" }}>
      <h1>deepstate React Hooks Demo</h1>
      
      <h2>usePipeSelect - For RxJS operators</h2>
      <p>
        Use <code>usePipeSelect</code> when you need to pipe RxJS operators.
        Initial value is <code>undefined</code> until first emission.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
        <DebounceDemo />
        <FilterDemo />
        <MapReduceDemo />
        <CombinedOperatorsDemo />
        <DebouncedSearchDemo />
      </div>

      <h2>useSelect - For direct node access</h2>
      <p>
        Use <code>useSelect</code> for direct deepstate node access.
        Initial value is always available via <code>.get()</code>.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <UserAge />
        <UserObject />
        <FullName />
        <ThemeEmoji />
        <Progress />
        <UserWithTheme />
        <ProgressNamed />
        <TodoIds />
      </div>

      <Controls />
    </div>
  );
}

// =============================================================================
// Mount
// =============================================================================

// For browser rendering
if (typeof document !== "undefined") {
  const container = document.getElementById("root");
  if (container) {
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  }
}

// Export for testing/SSR
export { App, store };
