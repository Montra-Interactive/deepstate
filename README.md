# deepstate

Proxy-based reactive state management powered by RxJS. Each property is its own observable with O(depth) change propagation.

## Features

- **Fine-grained reactivity**: Subscribe to any property at any depth
- **O(depth) performance**: Changes only notify ancestors, never siblings
- **Type-safe**: Full TypeScript support with inferred types
- **RxJS native**: Every node is an Observable - use `pipe()`, `combineLatest`, etc.
- **Batched updates**: Group multiple changes into a single emission
- **Immutable reads**: Values are deeply frozen to prevent accidental mutations
- **Nullable objects**: First-class support for `T | null` properties

## Installation

```bash
bun add deepstate rxjs
# or
npm install deepstate rxjs
```

## Quick Start

```ts
import { state } from "deepstate";

// Create reactive state
const store = state({
  user: { name: "Alice", age: 30 },
  count: 0,
});

// Subscribe to any property (it's an Observable)
store.user.name.subscribe(name => console.log("Name:", name));

// Get values synchronously
console.log(store.user.name.get()); // "Alice"

// Set values
store.user.name.set("Bob"); // triggers subscription above
store.count.set(5);

// Subscribe to parent nodes (emits when any child changes)
store.user.subscribe(user => console.log("User:", user));
```

## Core API

### `state<T>(initialState: T): RxState<T>`

Creates a reactive state object. Every property becomes an observable node.

```ts
const store = state({
  user: { name: "Alice", age: 30 },
  items: [{ id: 1, name: "Item 1" }],
  count: 0,
});
```

### Property Access

Every property on the state is a reactive node with these methods:

| Method | Description |
|--------|-------------|
| `.get()` | Get current value synchronously |
| `.set(value)` | Update the value |
| `.subscribe(callback)` | Subscribe to changes (RxJS Observable) |
| `.pipe(operators...)` | Chain RxJS operators |
| `.subscribeOnce(callback)` | Subscribe to a single emission |

```ts
// Primitives
store.count.get();      // 0
store.count.set(5);     // Updates to 5

// Objects
store.user.get();       // { name: "Alice", age: 30 }
store.user.name.get();  // "Alice"
store.user.name.set("Bob");

// Subscribe at any level
store.user.name.subscribe(name => console.log(name));
store.user.subscribe(user => console.log(user)); // Emits when any child changes
```

## Batched Updates

Use `.update()` to batch multiple changes into a single emission:

```ts
// Without batching - emits twice, intermediate state visible
store.user.name.set("Bob");
store.user.age.set(31);
// Subscribers see: { name: "Bob", age: 30 } then { name: "Bob", age: 31 }

// With batching - emits once, only final state visible
store.user.update(user => {
  user.name.set("Bob");
  user.age.set(31);
});
// Subscribers see: { name: "Bob", age: 31 }
```

The callback receives the reactive state node, so you use `.set()` on properties.

### Why batching matters

**Performance**: Without batching, N changes trigger N emissions. Each emission may cause React re-renders, DOM updates, or other expensive operations. Batching reduces this to 1 emission.

**Predictability**: Without batching, subscribers see intermediate states that may be inconsistent. For example, updating `firstName` and `lastName` separately means subscribers briefly see mismatched names. Batching ensures subscribers only see consistent, complete states.

**Debugging**: With batching, state transitions are atomic. You go from state A to state B with no intermediate states to reason about.

```ts
// Example: form submission
store.form.update(form => {
  form.isSubmitting.set(true);
  form.error.set(null);
  form.lastSubmitted.set(Date.now());
});
// Subscribers see one consistent update, not 3 separate changes
```

## Arrays

Arrays have additional methods for manipulation:

```ts
const store = state({
  items: [
    { id: 1, name: "First" },
    { id: 2, name: "Second" },
  ],
});

// Access elements by index
store.items.at(0)?.name.get();     // "First"
store.items.at(0)?.name.set("Updated");

// Array methods
store.items.push({ id: 3, name: "Third" });  // Returns new length
store.items.pop();                            // Returns removed item
store.items.length.get();                     // Current length (also observable)

// Observable length
store.items.length.subscribe(len => console.log("Length:", len));

// Non-reactive iteration (use subscribe for reactive)
store.items.map((item, i) => item.name);
store.items.filter(item => item.id > 1);

// Batched array updates
store.items.update(items => {
  items.at(0)?.name.set("Modified");
  items.push({ id: 4, name: "New" });
});
```

## Nullable Objects

Properties typed as `{ ... } | null` are fully supported with **deep subscription**:

```ts
interface State {
  user: { name: string; age: number } | null;
}

const store = state<State>({ user: null });

// Deep subscription - works even when user is null!
store.user.name.subscribe(name => {
  console.log(name); // undefined when user is null, actual value when set
});

// Access the nullable parent
store.user.get();                     // null
store.user.set({ name: "Alice", age: 30 }); // subscription above emits "Alice"
store.user.name.get();                // "Alice"
store.user.name.set("Bob");           // subscription emits "Bob"
store.user.set(null);                 // subscription emits undefined

// Subscribe to parent
store.user.subscribe(user => console.log(user));
```

This enables subscribing to deeply nested properties before the parent exists - useful for setting up subscriptions early in component lifecycle.

### `nullable()` Helper

Use `nullable()` when you want to **start with an object** but allow it to become null later:

```ts
import { state, nullable } from "deepstate";

const store = state({
  // Without nullable(): can't be set to null later
  profile: { bio: "Hello" },
  
  // With nullable(): can transition to null
  user: nullable({ name: "Alice", age: 30 }),
});

store.user.set(null);  // Works!
store.user.set({ name: "Bob", age: 25 });  // Works!
```

Nullable objects also support `update()` for batched changes:

```ts
store.user.update(user => {
  user.name.set("Updated");
  user.age.set(31);
});
```

## Helpers

### `select()`

Combine multiple observables into one. Supports both array and object forms:

```ts
import { select } from "deepstate";

// Array form - returns tuple
select(store.user.name, store.count).subscribe(([name, count]) => {
  console.log(name, count);
});

// Object form - returns object
select({
  name: store.user.name,
  count: store.count,
}).subscribe(({ name, count }) => {
  console.log(name, count);
});
```

### `selectFromEach()`

Derive values from array items with precise change detection:

```ts
import { selectFromEach } from "deepstate";

const store = state({
  items: [
    { name: "A", price: 10, qty: 2 },
    { name: "B", price: 20, qty: 1 },
  ],
});

// Select single property
selectFromEach(store.items, item => item.price).subscribe(prices => {
  console.log(prices); // [10, 20]
});

// Derive computed values
selectFromEach(store.items, item => item.price * item.qty).subscribe(totals => {
  console.log(totals); // [20, 20]
});

// Only emits when selected values change, not other properties
store.items.at(0)?.name.set("Changed"); // No emission (name wasn't selected)
store.items.at(0)?.price.set(15);       // Emits [15, 20]
```

## RxJS Integration

Every node is a full RxJS Observable. Use any RxJS operators:

```ts
import { debounceTime, filter, map } from "rxjs/operators";

store.user.name
  .pipe(
    debounceTime(300),
    filter(name => name.length > 0),
    map(name => name.toUpperCase())
  )
  .subscribe(name => console.log(name));
```

## React Integration

Install the React bindings:

```bash
bun add @montra-interactive/deepstate-react
# or
npm install @montra-interactive/deepstate-react
```

### `useSelect` - For Direct Node Access

Use `useSelect` when you want to subscribe to a deepstate node directly. It always has an initial value because nodes have a synchronous `.get()` method.

```tsx
import { useSelect } from "@montra-interactive/deepstate-react";

function UserProfile() {
  // Subscribe to a primitive
  const name = useSelect(store.user.name);  // string
  
  // Subscribe to an object
  const user = useSelect(store.user);  // { name: string, age: number }
  
  // With selector - derive a value
  const fullName = useSelect(
    store.user,
    user => `${user.firstName} ${user.lastName}`
  );
  
  // Combine multiple nodes
  const summary = useSelect(
    [store.user.name, store.stats.completed],
    ([name, completed]) => `${name} completed ${completed} tasks`
  );
  
  return <div>{fullName}</div>;
}
```

### `usePipeSelect` - For RxJS Operators

Use `usePipeSelect` when you need to apply RxJS operators like `debounceTime`, `filter`, or `map`. The return type is `T | undefined` because the stream might not have emitted yet.

```tsx
import { usePipeSelect } from "@montra-interactive/deepstate-react";
import { debounceTime, filter, map } from "rxjs";

function SearchResults() {
  // Debounce high-frequency updates
  const debouncedQuery = usePipeSelect(
    store.searchQuery.pipe(debounceTime(300))
  );  // string | undefined
  
  // Filter values
  const positiveCount = usePipeSelect(
    store.count.pipe(filter(v => v > 0))
  );  // number | undefined (undefined until v > 0)
  
  // Transform with map
  const totalDuration = usePipeSelect(
    store.clips.pipe(
      map(clips => clips.reduce((sum, c) => sum + c.duration, 0))
    )
  );  // number | undefined
  
  // Handle the undefined case
  if (debouncedQuery === undefined) {
    return <div>Type to search...</div>;
  }
  
  return <div>Results for: {debouncedQuery}</div>;
}
```

### The Sync/Async Boundary

**Why two hooks? Why is `usePipeSelect` return type `T | undefined`?**

deepstate is a **synchronous store** backed by **reactive streams**. Every node always has a current value via `.get()`. But when you `.pipe()`, you enter the asynchronous world of RxJS where:

- `debounceTime(300)` - delays emissions, nothing to return immediately
- `filter(v => v > 0)` - if current value is `0`, nothing has passed yet
- `switchMap(v => fetch(...))` - depends on async operation completing

The piped observable **has no synchronous value** - it's a stream that will emit values over time. So `usePipeSelect` honestly returns `T | undefined`:

- `undefined` = "stream hasn't emitted yet (or operator blocked it)"
- `T` = "stream emitted a value"

| Hook | Initial Value | Use When |
|------|---------------|----------|
| `useSelect` | Always available (via `.get()`) | Direct node access, no operators |
| `usePipeSelect` | `undefined` until first emission | Using `.pipe()` with RxJS operators |

This separation is **type-safe**: `useSelect` returns `T`, while `usePipeSelect` returns `T | undefined`, forcing you to handle the "not yet" case.

```tsx
// ✅ useSelect - always has value (node has .get())
const count = useSelect(store.count);
const doubled = count * 2;  // Safe: count is always a number

// ✅ usePipeSelect - might be undefined (stream might not have emitted)
const filtered = usePipeSelect(store.count.pipe(filter(v => v > 0)));
const doubled = (filtered ?? 0) * 2;  // Must handle undefined
```

For comprehensive React documentation, see [React Integration Guide](./docs/REACT.md).

## Immutability

Values returned by `.get()` and emitted by subscriptions are deeply frozen:

```ts
const user = store.user.get();
user.name = "Bob"; // Error: Cannot assign to read only property
```

This prevents accidental mutations. Always use `.set()` to update values.

## Architecture

deepstate uses a **nested BehaviorSubject architecture**:

- **Primitives**: Each primitive has its own `BehaviorSubject`
- **Objects**: Derived from `combineLatest(children)` - children are the source of truth
- **Arrays**: `BehaviorSubject<T[]>` is the source of truth, with child projections

This gives you **O(depth) performance** per change:
- When you update `store.a.b.c`, only `c`, `b`, `a`, and `store` are notified
- Sibling properties like `store.x.y.z` are never touched

For a deep dive into the internal implementation, see [Internal Architecture](./docs/ARCHITECTURE.md).

### Comparison with Redux

In Redux, every state change runs **all selectors** to check if their selected slice changed:

```ts
// Redux: O(selectors) per change
// If you have 100 selectors and update user.name, all 100 run
dispatch(setUserName("Bob")); // Runs ALL selectors

// With memoization (reselect), selectors short-circuit if inputs unchanged,
// but the selector function is still *called* for every subscriber
```

In deepstate, changes propagate **only to ancestors**:

```ts
// deepstate: O(depth) per change  
// If you update user.name, only user.name -> user -> store are notified
store.user.name.set("Bob"); // Only 3 nodes notified, regardless of store size

// Subscribers to store.settings, store.items, etc. are never invoked
```

| Store Size | Redux (per change) | deepstate (per change) |
|------------|-------------------|------------------------|
| 10 selectors | 10 calls | ~3 notifications |
| 100 selectors | 100 calls | ~3 notifications |
| 1000 selectors | 1000 calls | ~3 notifications |

The deeper your state tree and the more subscribers you have, the bigger the win.

### Comparison with Valtio

Valtio is clever - you just mutate and changes propagate automatically:

```ts
// Valtio: implicit mutations
const state = proxy({ user: { name: "Alice" } });
state.user.name = "Bob"; // Just mutate, magic happens
```

This feels great initially, but in larger apps it becomes problematic:

1. **Mutations anywhere**: Any code with a reference can mutate state. Hard to track where changes originate.

2. **No explicit update points**: With implicit mutation, there's no clear "this is where state changes" in your code. Debugging becomes harder.

3. **Accidental mutations**: Easy to mutate when you meant to read, especially with object/array references.

deepstate requires explicit `.set()` calls:

```ts
// deepstate: explicit updates
const store = state({ user: { name: "Alice" } });
store.user.name.set("Bob"); // Explicit - you know state is changing here

// Values are frozen - accidental mutation throws
const user = store.user.get();
user.name = "Bob"; // Error: Cannot assign to read only property
```

| Aspect | Valtio | deepstate |
|--------|--------|-----------|
| Mutation style | Implicit (just assign) | Explicit (`.set()`) |
| Change tracking | Hard to trace | Grep for `.set(` |
| Accidental mutations | Possible | Prevented (frozen values) |
| Learning curve | Lower | Slightly higher |
| Large codebase | Can get messy | Predictable |

Both libraries have fine-grained reactivity, but deepstate trades some convenience for explicitness that pays off as your codebase grows.

## TypeScript

deepstate is fully typed. Types are inferred from your initial state:

```ts
const store = state({
  user: { name: "Alice", age: 30 },
  items: [{ id: 1 }],
});

store.user.name.get();  // string
store.user.age.get();   // number
store.items.at(0)?.id;  // RxLeaf<number> | undefined

// Type exports for advanced use cases
import type { RxState, Draft, DeepReadonly } from "deepstate";
```

## API Reference

### Core Exports (`@montra-interactive/deepstate`)

| Export | Description |
|--------|-------------|
| `state(init)` | Create reactive state |
| `nullable(value)` | Mark object as nullable |
| `select(...obs)` | Combine observables |
| `selectFromEach(arr, selector)` | Select from array items |

### React Exports (`@montra-interactive/deepstate-react`)

| Export | Description |
|--------|-------------|
| `useSelect(node, selector?, equalityFn?)` | Subscribe to deepstate nodes (returns `T`) |
| `usePipeSelect(piped$)` | Subscribe to piped observables (returns `T \| undefined`) |
| `useObservable(obs$, getSnapshot)` | Low-level hook for any Observable |

### Node Types

| Type | Methods |
|------|---------|
| `RxLeaf<T>` | `get()`, `set()`, `subscribe()`, `pipe()`, `subscribeOnce()` |
| `RxObject<T>` | Above + `update()`, child properties |
| `RxArray<T>` | Above + `at()`, `push()`, `pop()`, `length`, `map()`, `filter()` |
| `RxNullable<T>` | Above + `update()`, optional child access |

## License

MIT
