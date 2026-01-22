# @montra-interactive/deepstate

Proxy-based reactive state management powered by RxJS. Each property is its own observable with O(depth) change propagation.

## Features

- **Fine-grained reactivity**: Subscribe to any property at any depth
- **O(depth) performance**: Changes only notify ancestors, never siblings
- **Type-safe**: Full TypeScript support with inferred types
- **RxJS native**: Every node is an Observable - use `pipe()`, `combineLatest`, etc.
- **Batched updates**: Group multiple changes into a single emission
- **Mutable snapshots**: Reads return plain values; use `.set()` to update state
- **Nullable objects**: First-class support for `T | null` properties with deep subscription
- **Debug mode**: Optional logging for development

## Installation

```bash
npm install @montra-interactive/deepstate rxjs
# or
bun add @montra-interactive/deepstate rxjs
# or
yarn add @montra-interactive/deepstate rxjs
```

## Quick Start

```ts
import { state } from "@montra-interactive/deepstate";

// Create reactive state
const store = state({
  user: { name: "Alice", age: 30 },
  todos: [{ id: 1, text: "Learn deepstate", done: false }],
  count: 0,
});

// Subscribe to any property (it's an Observable)
store.user.name.subscribe(name => console.log("Name:", name));

// Get values synchronously
console.log(store.user.name.get()); // "Alice"

// Set values
store.user.name.set("Bob"); // triggers subscription

// Subscribe to parent nodes (emits when any child changes)
store.user.subscribe(user => console.log("User changed:", user));
```

## API Reference

### `state<T>(initialState, options?)`

Creates a reactive state store.

```ts
import { state } from "@montra-interactive/deepstate";

const store = state({
  user: { name: "Alice", age: 30 },
  items: [{ id: 1, name: "Item 1" }],
  count: 0,
});

// With debug mode
const debugStore = state(
  { count: 0 },
  { debug: true, name: "counter" }
);
// Logs: [deepstate:counter] set count: 0 -> 1
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `debug` | `boolean` | Enable debug logging for all set operations |
| `name` | `string` | Store name used in debug log prefix |

### Node Methods

Every property on the state is a reactive node with these methods:

| Method | Description |
|--------|-------------|
| `.get()` | Get current value synchronously |
| `.set(value)` | Update the value |
| `.subscribe(callback)` | Subscribe to changes (RxJS Observable) |
| `.pipe(operators...)` | Chain RxJS operators |
| `.subscribeOnce(callback)` | Subscribe to a single emission, then auto-unsubscribe |

```ts
// Primitives
store.count.get();          // 0
store.count.set(5);         // Updates to 5

// Objects
store.user.get();           // { name: "Alice", age: 30 }
store.user.name.get();      // "Alice"
store.user.name.set("Bob");

// Subscribe at any level
store.user.name.subscribe(name => console.log(name));
store.user.subscribe(user => console.log(user));
```

### Batched Updates with `.update()`

Batch multiple changes into a single emission:

```ts
// Without batching - emits twice
store.user.name.set("Bob");
store.user.age.set(31);
// Subscribers see intermediate state

// With batching - emits once
store.user.update(user => {
  user.name.set("Bob");
  user.age.set(31);
});
// Subscribers only see final state
```

### Arrays

Arrays have additional methods:

```ts
const store = state({
  items: [
    { id: 1, name: "First" },
    { id: 2, name: "Second" },
  ],
});

// Access by index
store.items.at(0)?.name.get();     // "First"
store.items.at(0)?.name.set("Updated");

// Array methods
store.items.push({ id: 3, name: "Third" });  // Returns new length
store.items.pop();                            // Returns removed item
store.items.length.get();                     // Current length

// Observable length
store.items.length.subscribe(len => console.log("Length:", len));

// Non-reactive iteration
store.items.map((item, i) => item.name);
store.items.filter(item => item.id > 1);

// Batched array updates
store.items.update(items => {
  items.at(0)?.name.set("Modified");
  items.push({ id: 4, name: "New" });
});
```

### `array(value, options?)` - Array with Distinct

Control array emission deduplication:

```ts
import { state, array } from "@montra-interactive/deepstate";

const store = state({
  // No deduplication (default)
  items: [1, 2, 3],
  
  // Reference equality per element
  tags: array(["a", "b"], { distinct: "shallow" }),
  
  // JSON comparison (deep equality)
  settings: array([{ theme: "dark" }], { distinct: "deep" }),
  
  // Custom comparator
  custom: array([1, 2, 3], {
    distinct: (a, b) => a.length === b.length
  }),
});
```

**Distinct Options:**

| Value | Description |
|-------|-------------|
| `false` | No deduplication (default) |
| `"shallow"` | Reference equality: `a[i] === b[i]` |
| `"deep"` | JSON comparison: `JSON.stringify(a) === JSON.stringify(b)` |
| `(a, b) => boolean` | Custom comparator function |

### `nullable(value)` - Nullable Objects

For properties that can be `null` or an object:

```ts
import { state, nullable } from "@montra-interactive/deepstate";

const store = state({
  // Start as null, can become object
  user: nullable<{ name: string; age: number }>(null),
  
  // Start as object, can become null
  profile: nullable({ bio: "Hello", avatar: "url" }),
});

// Deep subscription works even when null!
store.user.name.subscribe(name => {
  console.log(name); // undefined when user is null, value when set
});

// Transitions
store.user.set({ name: "Alice", age: 30 });  // Now has value
store.user.name.set("Bob");                   // Update nested
store.user.set(null);                         // Back to null
```

### `select(...observables)` - Combine Observables

```ts
import { select } from "@montra-interactive/deepstate";

// Array form - returns tuple
select(store.user.name, store.count).subscribe(([name, count]) => {
  console.log(`${name}: ${count}`);
});

// Object form - returns object
select({
  name: store.user.name,
  count: store.count,
}).subscribe(({ name, count }) => {
  console.log(`${name}: ${count}`);
});
```

### `selectFromEach(arrayNode, selector)` - Select from Array Items

Derive values from each array item with precise change detection:

```ts
import { selectFromEach } from "@montra-interactive/deepstate";

const store = state({
  items: [
    { name: "A", price: 10, qty: 2 },
    { name: "B", price: 20, qty: 1 },
  ],
});

// Select single property from each item
selectFromEach(store.items, item => item.price).subscribe(prices => {
  console.log(prices); // [10, 20]
});

// Derive computed values
selectFromEach(store.items, item => item.price * item.qty).subscribe(totals => {
  console.log(totals); // [20, 20]
});

// Only emits when selected values change
store.items.at(0)?.name.set("Changed"); // No emission (name wasn't selected)
store.items.at(0)?.price.set(15);       // Emits [15, 20]
```

## RxJS Integration

Every node is a full RxJS Observable:

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

## TypeScript

Full type inference from your initial state:

```ts
const store = state({
  user: { name: "Alice", age: 30 },
  items: [{ id: 1 }],
  selectedId: null as string | null,
});

store.user.name.get();    // string
store.user.age.get();     // number
store.items.at(0)?.id;    // RxLeaf<number> | undefined
store.selectedId.get();   // string | null
```

### Type Exports

```ts
import type { RxState, Draft } from "@montra-interactive/deepstate";
```

| Type | Description |
|------|-------------|
| `RxState<T>` | The reactive state type returned by `state()` |
| `Draft<T>` | Type alias for values in update callbacks |

## Architecture

deepstate uses a **nested BehaviorSubject architecture**:

- **Primitives**: Each has its own `BehaviorSubject`
- **Objects**: Derived from `combineLatest(children)`
- **Arrays**: `BehaviorSubject<T[]>` with child projections

This gives **O(depth) performance**: updating `store.a.b.c` only notifies `c`, `b`, `a`, and the root - never siblings like `store.x.y.z`.

## React Integration

See [@montra-interactive/deepstate-react](https://www.npmjs.com/package/@montra-interactive/deepstate-react) for React hooks:

```tsx
import { useSelect, usePipeSelect } from "@montra-interactive/deepstate-react";

function UserName() {
  const name = useSelect(store.user.name);
  return <span>{name}</span>;
}

function DebouncedSearch() {
  const query = usePipeSelect(store.search.pipe(debounceTime(300)));
  return <input value={query ?? ""} />;
}
```

## License

MIT
