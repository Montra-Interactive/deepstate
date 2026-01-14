# React Integration Guide

This guide covers how to use deepstate with React, including the core hooks and patterns for building reactive applications.

## Installation

```bash
bun add @montra-interactive/deepstate @montra-interactive/deepstate-react rxjs
# or
npm install @montra-interactive/deepstate @montra-interactive/deepstate-react rxjs
```

## Overview

deepstate provides two React hooks:

| Hook | Purpose | Return Type | Initial Value |
|------|---------|-------------|---------------|
| `useSelect` | Subscribe to deepstate nodes directly | `T` | Always available |
| `usePipeSelect` | Subscribe to piped observables (with RxJS operators) | `T \| undefined` | `undefined` until first emission |

## The Sync/Async Boundary

Understanding when to use each hook requires understanding the boundary between React's synchronous rendering and RxJS's asynchronous streams.

### The Problem

React components need a value *immediately* when they render:

```tsx
function Counter() {
  const count = ???;  // React needs this NOW
  return <div>{count}</div>;
}
```

deepstate nodes can provide this via `.get()`:

```tsx
const count = store.count.get();  // Synchronous, always works
```

But RxJS operators introduce asynchronicity:

```tsx
// What's the "current value" here?
const debounced$ = store.count.pipe(debounceTime(300));
// debounceTime delays emissions - there's no value yet!

const filtered$ = store.count.pipe(filter(v => v > 0));
// If count is 0, nothing has passed the filter yet!
```

### The Solution

Two hooks with different contracts:

**`useSelect`** - For synchronous access to deepstate nodes:
- Node has `.get()` → initial value is always available
- Return type: `T`
- Use when: Direct access to store properties

**`usePipeSelect`** - For asynchronous piped streams:
- Piped observable has no `.get()` → initial value is `undefined`
- Return type: `T | undefined`
- Use when: Using RxJS operators like `filter`, `debounceTime`, `map`, etc.

This is **type-safe** - the compiler forces you to handle the `undefined` case with `usePipeSelect`.

## API Reference

### `useSelect`

Subscribe to one or more deepstate nodes with optional transformation.

#### Single Node (No Selector)

```tsx
const value = useSelect(node);
```

Returns the current value of the node, re-rendering when it changes.

```tsx
function UserName() {
  const name = useSelect(store.user.name);  // string
  return <span>{name}</span>;
}

function UserProfile() {
  const user = useSelect(store.user);  // { name: string, age: number }
  return <div>{user.name}, {user.age}</div>;
}
```

#### Single Node with Selector

```tsx
const derived = useSelect(node, selector, equalityFn?);
```

Transforms the value before returning. Only re-renders when the derived value changes.

```tsx
function FullName() {
  const fullName = useSelect(
    store.user,
    user => `${user.firstName} ${user.lastName}`
  );
  return <span>{fullName}</span>;
}

function CompletedCount() {
  const count = useSelect(
    store.todos,
    todos => todos.filter(t => t.completed).length
  );
  return <span>{count} completed</span>;
}
```

#### Multiple Nodes (Array Form)

```tsx
const derived = useSelect([node1, node2, ...], selector, equalityFn?);
```

Combines multiple nodes into a single derived value.

```tsx
function Progress() {
  const percentage = useSelect(
    [store.stats.completed, store.stats.total],
    ([completed, total]) => total > 0 ? (completed / total) * 100 : 0
  );
  return <span>{percentage}%</span>;
}
```

#### Multiple Nodes (Object Form)

```tsx
const derived = useSelect({ a: node1, b: node2 }, selector, equalityFn?);
```

Same as array form, but with named keys for readability.

```tsx
function TaskSummary() {
  const summary = useSelect(
    {
      user: store.user.name,
      completed: store.stats.completed,
      total: store.stats.total,
    },
    ({ user, completed, total }) => 
      `${user} has completed ${completed}/${total} tasks`
  );
  return <p>{summary}</p>;
}
```

#### Custom Equality Function

By default, `useSelect` uses `Object.is` for equality checks. Provide a custom function for complex derived values:

```tsx
function TodoIds() {
  const ids = useSelect(
    store.todos,
    todos => todos.map(t => t.id),
    // Custom equality: compare arrays by value
    (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
  );
  return <span>{ids.join(', ')}</span>;
}
```

### `usePipeSelect`

Subscribe to a piped observable (one that has had RxJS operators applied).

```tsx
const value = usePipeSelect(pipedObservable);  // T | undefined
```

Returns `undefined` until the first emission, then returns the latest emitted value.

#### With `debounceTime` - Reduce Re-renders

```tsx
function DebouncedDisplay() {
  // Raw value updates every 100ms
  const rawTime = useSelect(store.currentTimeMs);
  
  // Debounced value updates at most once per second
  const debouncedTime = usePipeSelect(
    store.currentTimeMs.pipe(debounceTime(1000))
  );
  
  return (
    <div>
      <p>Raw: {rawTime}</p>
      <p>Debounced: {debouncedTime ?? 'waiting...'}</p>
    </div>
  );
}
```

#### With `filter` - Conditional Updates

```tsx
function PositiveOnly() {
  // Only emits when count > 0
  const positive = usePipeSelect(
    store.count.pipe(filter(v => v > 0))
  );
  
  if (positive === undefined) {
    return <span>Waiting for positive value...</span>;
  }
  
  return <span>Positive: {positive}</span>;
}
```

#### With `map` - Transform Values

```tsx
function TotalDuration() {
  // Transform array to computed value
  const total = usePipeSelect(
    store.clips.pipe(
      map(clips => clips.reduce((sum, c) => sum + c.duration, 0))
    )
  );
  
  return <span>Total: {total ?? 0}ms</span>;
}
```

#### Combined Operators

```tsx
function DebouncedSearch() {
  const query = usePipeSelect(
    store.searchQuery.pipe(
      debounceTime(300),
      filter(q => q.length >= 2),
      map(q => q.trim().toLowerCase())
    )
  );
  
  if (query === undefined) {
    return <p>Type at least 2 characters...</p>;
  }
  
  return <SearchResults query={query} />;
}
```

### `useObservable`

Low-level hook for any RxJS Observable. Requires you to provide the initial value getter.

```tsx
const value = useObservable(observable$, getSnapshot);
```

```tsx
import { BehaviorSubject } from 'rxjs';

const count$ = new BehaviorSubject(0);

function Counter() {
  const count = useObservable(count$, () => count$.getValue());
  return <span>{count}</span>;
}
```

## Common Patterns

### Debouncing High-Frequency Updates

Useful for real-time data like mouse position, timers, or live feeds:

```tsx
function LiveFeed() {
  // Update UI at most 5 times per second, regardless of actual update rate
  const data = usePipeSelect(
    store.liveData.pipe(throttleTime(200))
  );
  
  return <Chart data={data ?? []} />;
}
```

### Debounced Search Input

```tsx
function SearchBox() {
  // Controlled input - always shows current value
  const rawQuery = useSelect(store.searchQuery);
  
  // Debounced query for expensive operations
  const debouncedQuery = usePipeSelect(
    store.searchQuery.pipe(
      debounceTime(300),
      filter(q => q.length >= 2)
    )
  );
  
  return (
    <div>
      <input
        value={rawQuery}
        onChange={e => store.searchQuery.set(e.target.value)}
        placeholder="Search..."
      />
      {debouncedQuery !== undefined && (
        <SearchResults query={debouncedQuery} />
      )}
    </div>
  );
}
```

### Computing Totals from Arrays

```tsx
function OrderSummary() {
  const total = usePipeSelect(
    store.cart.items.pipe(
      map(items => items.reduce((sum, item) => sum + item.price * item.qty, 0))
    )
  );
  
  const itemCount = usePipeSelect(
    store.cart.items.pipe(
      map(items => items.reduce((sum, item) => sum + item.qty, 0))
    )
  );
  
  return (
    <div>
      <p>Items: {itemCount ?? 0}</p>
      <p>Total: ${(total ?? 0).toFixed(2)}</p>
    </div>
  );
}
```

### Filtering Invalid States

```tsx
function ValidUserProfile() {
  // Only render when user has a valid name
  const user = usePipeSelect(
    store.user.pipe(
      filter(u => u.name.trim().length > 0)
    )
  );
  
  if (user === undefined) {
    return <p>Please enter your name</p>;
  }
  
  return <Profile user={user} />;
}
```

### Distinct Until Changed (Custom Comparison)

```tsx
function UniqueValues() {
  // Only emit when the rounded value changes
  const rounded = usePipeSelect(
    store.preciseValue.pipe(
      map(v => Math.round(v)),
      distinctUntilChanged()
    )
  );
  
  return <span>{rounded ?? 0}</span>;
}
```

## Type Safety

### `useSelect` Type Inference

```tsx
const store = state({
  count: 0,
  user: { name: 'Alice', age: 30 },
  items: [{ id: 1 }],
});

// Primitive: number
const count = useSelect(store.count);

// Object: { readonly name: string; readonly age: number }
const user = useSelect(store.user);

// With selector: string
const name = useSelect(store.user, u => u.name);

// Combined: string
const summary = useSelect(
  [store.user.name, store.count],
  ([name, count]) => `${name}: ${count}`
);
```

### `usePipeSelect` Type Inference

```tsx
// number | undefined
const debounced = usePipeSelect(store.count.pipe(debounceTime(100)));

// string | undefined
const filtered = usePipeSelect(
  store.user.name.pipe(filter(n => n.length > 0))
);

// number | undefined (mapped from array)
const total = usePipeSelect(
  store.items.pipe(map(items => items.length))
);
```

### Preventing Misuse

`useSelect` only accepts deepstate nodes (objects with a `.get()` method). Piped observables will cause a TypeScript error:

```tsx
// ✅ Works - deepstate node
const count = useSelect(store.count);

// ❌ TypeScript Error - piped observable has no .get()
const debounced = useSelect(store.count.pipe(debounceTime(100)));
//                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Error: Property 'get' is missing in type 'Observable<number>'

// ✅ Works - use usePipeSelect for piped observables
const debounced = usePipeSelect(store.count.pipe(debounceTime(100)));
```

## Performance Considerations

### Debouncing Prevents Render Thrashing

Without debouncing, high-frequency updates cause excessive re-renders:

```tsx
// ❌ Bad: Re-renders 60+ times per second
function MouseTracker() {
  const position = useSelect(store.mousePosition);
  return <div>X: {position.x}, Y: {position.y}</div>;
}

// ✅ Good: Re-renders at most 10 times per second
function MouseTracker() {
  const position = usePipeSelect(
    store.mousePosition.pipe(throttleTime(100))
  );
  return <div>X: {position?.x ?? 0}, Y: {position?.y ?? 0}</div>;
}
```

### Selectors Prevent Unnecessary Re-renders

Use selectors to extract only what you need:

```tsx
// ❌ Bad: Re-renders when ANY user property changes
function UserAge() {
  const user = useSelect(store.user);
  return <span>{user.age}</span>;
}

// ✅ Good: Only re-renders when age changes
function UserAge() {
  const age = useSelect(store.user, u => u.age);
  return <span>{age}</span>;
}

// ✅ Also good: Subscribe directly to the property
function UserAge() {
  const age = useSelect(store.user.age);
  return <span>{age}</span>;
}
```

### Memoize Expensive Computations

For expensive derived values, combine with `useMemo`:

```tsx
function ExpensiveList() {
  const items = useSelect(store.items);
  
  // Expensive computation only runs when items change
  const processed = useMemo(
    () => items.map(item => expensiveTransform(item)),
    [items]
  );
  
  return <List items={processed} />;
}
```

## Migration from Other State Libraries

### From Redux

```tsx
// Redux
const count = useSelector(state => state.counter.count);

// deepstate
const count = useSelect(store.counter.count);
// or with selector
const count = useSelect(store.counter, c => c.count);
```

### From Zustand

```tsx
// Zustand
const count = useStore(state => state.count);

// deepstate
const count = useSelect(store.count);
```

### From Jotai

```tsx
// Jotai
const [count] = useAtom(countAtom);

// deepstate
const count = useSelect(store.count);
```

## Troubleshooting

### "Initial value is undefined"

If you're using `useSelect` and getting `undefined`, you might be passing a piped observable:

```tsx
// Problem: pipe() returns Observable, not a deepstate node
const value = useSelect(store.count.pipe(filter(v => v > 0)));
// value is undefined!

// Solution: Use usePipeSelect for piped observables
const value = usePipeSelect(store.count.pipe(filter(v => v > 0)));
// value is number | undefined, handle accordingly
```

### "Too many re-renders"

Use debouncing or throttling for high-frequency updates:

```tsx
// Problem: store updates 60fps, component re-renders 60fps
const pos = useSelect(store.mousePosition);

// Solution: Throttle updates
const pos = usePipeSelect(store.mousePosition.pipe(throttleTime(100)));
```

### "Value doesn't update"

Make sure you're subscribing to the right level:

```tsx
// Problem: Subscribing to parent, but updating child
const user = useSelect(store.user);
store.user.name.set('Bob');  // This triggers user update!

// If not updating, check you're calling .set() correctly:
store.user.name.set('Bob');  // ✅ Correct
store.user.name = 'Bob';     // ❌ Won't work (values are frozen)
```
