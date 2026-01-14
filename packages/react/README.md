# @montra-interactive/deepstate-react

React bindings for [deepstate](https://www.npmjs.com/package/@montra-interactive/deepstate) - proxy-based reactive state management with RxJS.

## Features

- **Fine-grained subscriptions**: Subscribe to any nested property
- **Concurrent mode safe**: Uses `useSyncExternalStore` for React 18+
- **Type-safe**: Full TypeScript support with inferred types
- **RxJS integration**: Use `usePipeSelect` for debouncing, filtering, mapping
- **Multiple node combining**: Array form (tuple) or object form (named keys)
- **Custom equality**: Prevent unnecessary re-renders with custom comparators

## Installation

```bash
npm install @montra-interactive/deepstate @montra-interactive/deepstate-react rxjs
# or
bun add @montra-interactive/deepstate @montra-interactive/deepstate-react rxjs
# or
yarn add @montra-interactive/deepstate @montra-interactive/deepstate-react rxjs
```

## Quick Start

```tsx
import { state } from "@montra-interactive/deepstate";
import { useSelect } from "@montra-interactive/deepstate-react";

// Create your store
const store = state({
  user: { name: "Alice", age: 30 },
  count: 0,
});

// Use in components
function UserName() {
  const name = useSelect(store.user.name);
  return <span>{name}</span>;
}

function Counter() {
  const count = useSelect(store.count);
  return (
    <button onClick={() => store.count.set(count + 1)}>
      Count: {count}
    </button>
  );
}
```

## API Reference

### `useSelect` - Subscribe to Deepstate Nodes

The primary hook for using deepstate in React. Returns the current value and re-renders when it changes.

#### Single Node

```tsx
const value = useSelect(store.user.name);  // string
const user = useSelect(store.user);        // { name: string, age: number }
```

#### With Selector

Transform the value before returning. Only re-renders when the derived value changes.

```tsx
const fullName = useSelect(
  store.user,
  user => `${user.firstName} ${user.lastName}`
);

const adultCount = useSelect(
  store.users,
  users => users.filter(u => u.age >= 18).length
);
```

#### Multiple Nodes (Array Form)

Combine multiple nodes into a single derived value:

```tsx
const percentage = useSelect(
  [store.stats.completed, store.stats.total],
  ([completed, total]) => total > 0 ? (completed / total) * 100 : 0
);
```

#### Multiple Nodes (Object Form)

Same as array form, but with named keys:

```tsx
const summary = useSelect(
  { 
    name: store.user.name, 
    completed: store.stats.completed 
  },
  ({ name, completed }) => `${name} completed ${completed} tasks`
);
```

#### Custom Equality Function

Prevent re-renders with a custom equality check:

```tsx
const ids = useSelect(
  store.items,
  items => items.map(i => i.id),
  // Custom array equality
  (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
);
```

### `usePipeSelect` - Subscribe to Piped Observables

For observables transformed with RxJS operators. Returns `T | undefined` because the stream might not have emitted yet.

#### Debouncing

Reduce re-renders from high-frequency updates:

```tsx
import { debounceTime } from "rxjs";

function DebouncedSearch() {
  const query = usePipeSelect(
    store.searchQuery.pipe(debounceTime(300))
  );
  
  if (query === undefined) {
    return <span>Type to search...</span>;
  }
  
  return <SearchResults query={query} />;
}
```

#### Filtering

Only emit when conditions are met:

```tsx
import { filter } from "rxjs";

function PositiveOnly() {
  const value = usePipeSelect(
    store.count.pipe(filter(v => v > 0))
  );
  
  // undefined until count > 0
  return <span>{value ?? "Waiting for positive..."}</span>;
}
```

#### Mapping / Transforming

Transform values in the stream:

```tsx
import { map } from "rxjs";

function TotalDuration() {
  const total = usePipeSelect(
    store.clips.pipe(
      map(clips => clips.reduce((sum, c) => sum + c.duration, 0))
    )
  );
  
  return <span>Total: {total ?? 0}ms</span>;
}
```

#### Combined Operators

Chain multiple operators:

```tsx
import { debounceTime, filter, map } from "rxjs";

function SmartSearch() {
  const query = usePipeSelect(
    store.searchQuery.pipe(
      debounceTime(300),
      filter(q => q.length >= 2),
      map(q => q.trim().toLowerCase())
    )
  );
  
  if (query === undefined) {
    return <span>Type at least 2 characters...</span>;
  }
  
  return <SearchResults query={query} />;
}
```

### `useObservable` - Low-level Observable Hook

For any RxJS Observable when you need to provide the initial value getter:

```tsx
import { BehaviorSubject } from "rxjs";

const count$ = new BehaviorSubject(0);

function Counter() {
  const count = useObservable(count$, () => count$.getValue());
  return <span>{count}</span>;
}
```

## Why Two Hooks?

### The Sync/Async Boundary

deepstate is a **synchronous store** backed by **reactive streams**:

- `useSelect(store.x)` - Node has `.get()`, initial value always available. Returns `T`.
- `usePipeSelect(store.x.pipe(...))` - Piped stream has no sync value. Returns `T | undefined`.

When you `.pipe()` a node, you enter the async world of RxJS where:

| Operator | Why No Sync Value? |
|----------|-------------------|
| `debounceTime(300)` | Waits 300ms before emitting |
| `filter(v => v > 0)` | If value is `0`, nothing passed yet |
| `switchMap(...)` | Depends on async operation |

The `T | undefined` return type is **honest** - it forces you to handle the "not yet" case:

```tsx
// useSelect - always has value
const count = useSelect(store.count);
const doubled = count * 2;  // Safe

// usePipeSelect - might be undefined
const filtered = usePipeSelect(store.count.pipe(filter(v => v > 0)));
const doubled = (filtered ?? 0) * 2;  // Must handle undefined
```

## Type Exports

```ts
import type { DeepstateNode } from "@montra-interactive/deepstate-react";
```

| Type | Description |
|------|-------------|
| `DeepstateNode<T>` | Observable with `.get()` - what `useSelect` accepts |

## Full Type Signatures

```ts
// useSelect overloads
function useSelect<T>(node: DeepstateNode<T>): T;

function useSelect<T, R>(
  node: DeepstateNode<T>,
  selector: (value: T) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;

function useSelect<T1, T2, R>(
  nodes: [DeepstateNode<T1>, DeepstateNode<T2>],
  selector: (values: [T1, T2]) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;

// ... up to 5 nodes supported

function useSelect<T extends Record<string, DeepstateNode<unknown>>, R>(
  nodes: T,
  selector: (values: { [K in keyof T]: /* inferred */ }) => R,
  equalityFn?: (a: R, b: R) => boolean
): R;

// usePipeSelect
function usePipeSelect<T>(piped$: Observable<T>): T | undefined;

// useObservable
function useObservable<T>(
  observable$: Observable<T>,
  getSnapshot: () => T
): T;
```

## Common Patterns

### Debounced Search Input

```tsx
function SearchBox() {
  // Controlled input - immediate updates
  const rawQuery = useSelect(store.searchQuery);
  
  // Debounced for expensive operations
  const debouncedQuery = usePipeSelect(
    store.searchQuery.pipe(debounceTime(300))
  );
  
  return (
    <div>
      <input
        value={rawQuery}
        onChange={e => store.searchQuery.set(e.target.value)}
      />
      {debouncedQuery !== undefined && (
        <SearchResults query={debouncedQuery} />
      )}
    </div>
  );
}
```

### Computing Totals

```tsx
function CartTotal() {
  const total = usePipeSelect(
    store.cart.items.pipe(
      map(items => items.reduce((sum, i) => sum + i.price * i.qty, 0))
    )
  );
  
  return <span>${(total ?? 0).toFixed(2)}</span>;
}
```

### Conditional Rendering

```tsx
function ValidUser() {
  const user = usePipeSelect(
    store.user.pipe(filter(u => u.name.length > 0))
  );
  
  if (user === undefined) {
    return <span>Please enter your name</span>;
  }
  
  return <Profile user={user} />;
}
```

### Preventing Re-renders

```tsx
// Only re-render when age changes, not name
function UserAge() {
  const age = useSelect(store.user, u => u.age);
  return <span>{age}</span>;
}

// Or subscribe directly to the property
function UserAge() {
  const age = useSelect(store.user.age);
  return <span>{age}</span>;
}
```

## Peer Dependencies

- `react` ^18 || ^19
- `rxjs` ^7
- `@montra-interactive/deepstate` ^0.2.0

## License

MIT
