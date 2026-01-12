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
store.user.name.subscribe((name) => console.log("Name:", name));

// Get values synchronously
console.log(store.user.name.get()); // "Alice"

// Set values
store.user.name.set("Bob"); // triggers subscription above
store.count.set(5);

// Subscribe to parent nodes (emits when any child changes)
store.user.subscribe((user) => console.log("User:", user));
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
store.user.name.subscribe((name) => console.log(name));
store.user.subscribe((user) => console.log(user)); // Emits when any child changes
```

## Batched Updates

Use `.update()` to batch multiple changes into a single emission:

```ts
// Without batching - emits twice
store.user.name.set("Bob");
store.user.age.set(31);

// With batching - emits once
store.user.update((user) => {
  user.name.set("Bob");
  user.age.set(31);
});
```

The callback receives the reactive state node, so you use `.set()` on properties.

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
store.items.length.subscribe((len) => console.log("Length:", len));

// Non-reactive iteration (use subscribe for reactive)
store.items.map((item, i) => item.name);
store.items.filter((item) => item.id > 1);

// Batched array updates
store.items.update((items) => {
  items.at(0)?.name.set("Modified");
  items.push({ id: 4, name: "New" });
});
```

## Nullable Objects

Properties typed as `{ ... } | null` are fully supported:

```ts
interface State {
  user: { name: string; age: number } | null;
}

const store = state<State>({ user: null });

// Access requires optional chaining (TypeScript enforces this)
store.user?.get();                    // null
store.user?.set({ name: "Alice", age: 30 });
store.user?.name.get();               // "Alice"
store.user?.name.set("Bob");
store.user?.set(null);                // Back to null

// Subscribe still works
store.user?.subscribe((user) => console.log(user));
```

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

store.user?.set(null);  // Works!
store.user?.set({ name: "Bob", age: 25 });  // Works!
```

### `updateIfPresent()`

Safely update nullable objects only when they're non-null:

```ts
store.user?.updateIfPresent((user) => {
  user.name.set("Updated");
  user.age.set(31);
});
// Callback only runs if user is not null
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
selectFromEach(store.items, (item) => item.price).subscribe((prices) => {
  console.log(prices); // [10, 20]
});

// Derive computed values
selectFromEach(store.items, (item) => item.price * item.qty).subscribe(
  (totals) => {
    console.log(totals); // [20, 20]
  }
);

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
    filter((name) => name.length > 0),
    map((name) => name.toUpperCase())
  )
  .subscribe((name) => console.log(name));
```

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
- Compare to O(subscribers) in single-observable architectures

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

### Exports

| Export | Description |
|--------|-------------|
| `state(init)` | Create reactive state |
| `nullable(value)` | Mark object as nullable |
| `select(...obs)` | Combine observables |
| `selectFromEach(arr, selector)` | Select from array items |

### Node Types

| Type | Methods |
|------|---------|
| `RxLeaf<T>` | `get()`, `set()`, `subscribe()`, `pipe()`, `subscribeOnce()` |
| `RxObject<T>` | Above + `update()`, child properties |
| `RxArray<T>` | Above + `at()`, `push()`, `pop()`, `length`, `map()`, `filter()` |
| `RxNullable<T>` | Above + `updateIfPresent()`, optional child access |

## License

MIT
