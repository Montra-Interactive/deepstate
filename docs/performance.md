# Performance Considerations

## Overview

deepstate is designed for ergonomics and type-safety first, with reasonable performance for typical application state. This document outlines the performance characteristics and provides guidance for optimization when needed.

## Key Performance Characteristics

### 1. Lazy Proxy Creation ✅

Proxies are created **on-demand** when you access a path, not upfront for the entire state tree.

```typescript
const state = state({
  users: { /* 1000 users */ },
  settings: { /* ... */ },
});

// Only creates proxies for: root -> users -> user500 -> name
// Does NOT create proxies for the other 999 users
state.users.user500.name.get();
```

**Benchmark:** Accessing a single nested property in a state with 1000 siblings: ~0.3ms

### 2. Deep Equality Checks ⚠️

Every emission runs `distinctUntilChanged(deepEqual)` to prevent unnecessary updates. This is O(n) where n is the size of the compared value.

```typescript
const state = state({
  items: Array(10000).fill({ id: 0, value: 'x' }),
});

// When items changes, deepEqual compares all 10,000 objects
state.items.subscribe(items => { /* ... */ });
```

**Benchmark:** Deep equality on 10k-item array: ~6.5ms

**Mitigation:** Subscribe to specific items rather than the entire array:
```typescript
// ❌ Slow - compares entire array on every change
state.items.subscribe(items => { /* ... */ });

// ✅ Fast - only compares the specific item
state.items.at(500).subscribe(item => { /* ... */ });
```

### 3. structuredClone in update() ⚠️

The `update()` method clones the current value to create a mutable draft. This is O(n) for the subtree being updated.

```typescript
// Clones entire 1000-item array
state.items.update(draft => {
  draft[500].value = 'modified';
});
```

**Benchmark:** Cloning 1000-item array: ~1ms

**Mitigation:** Update at the most specific path possible:
```typescript
// ❌ Clones entire array
state.items.update(draft => {
  draft[500].value = 'x';
});

// ✅ Only clones single item
state.items.at(500).update(draft => {
  draft.value = 'x';
});

// ✅✅ No clone needed for primitives
state.items.at(500).value.set('x');
```

### 4. Snapshot Emissions ✅

Emitted values are plain snapshots. No deep-freeze overhead is applied per emission.

### 5. Multiple Subscribers ✅

Notifying subscribers is efficient - RxJS BehaviorSubject handles this well.

**Benchmark:** Notifying 1000 subscribers: ~0.3ms

## Optimization Strategies

### Subscribe to Specific Paths

```typescript
// ❌ Re-runs on ANY user change
state.users.subscribe(users => {
  console.log(users.currentUser.name);
});

// ✅ Only re-runs when this specific name changes
state.users.currentUser.name.subscribe(name => {
  console.log(name);
});
```

### Use Primitive Paths for Frequent Updates

```typescript
// For high-frequency updates (e.g., mouse position, animations)
const state = state({
  mouse: { x: 0, y: 0 },
});

// ❌ Creates new object on every update, triggers deepEqual
state.mouse.set({ x: newX, y: newY });

// ✅ Updates primitives directly, simple equality check
state.mouse.x.set(newX);
state.mouse.y.set(newY);

// ✅✅ Or batch them
state.mouse.update(m => {
  m.x = newX;
  m.y = newY;
});
```

### Normalize Nested Data

```typescript
// ❌ Deeply nested - updates require cloning entire tree
const state = state({
  posts: [
    { id: 1, author: { id: 1, name: 'Alice', profile: { /* ... */ } } },
    // ...
  ],
});

// ✅ Normalized - updates are localized
const state = state({
  posts: [{ id: 1, authorId: 1 }],
  users: {
    '1': { id: 1, name: 'Alice', profileId: 1 },
  },
  profiles: {
    '1': { /* ... */ },
  },
});
```

### Avoid Circular References

Circular references break `structuredClone` and will throw an error:

```typescript
// ❌ Will throw
const obj: any = { name: 'test' };
obj.self = obj;
state({ circular: obj }); // Error: structuredClone cannot handle circular references
```

## TL;DR: These Numbers Are Fine

Let's put these benchmarks in perspective:

**The "slow" cases aren't actually slow:**
- **6.5ms for deep equality on 10k items** - That's still ~150 ops/second. Most apps don't have 10k-item arrays changing rapidly.
- **1ms for structuredClone of 1000 items** - Negligible. You'd need to call `update()` 1000 times per second to notice.

**Context for comparison:**
- A single React re-render often takes 5-20ms
- Network requests are 50-500ms  
- 60fps budget is 16ms per frame

**When it would actually matter:**
- Real-time games with huge state (use a different solution anyway)
- 60fps animations on state (don't put animation state here - use CSS/canvas)
- Massive datasets (should be paginated or virtualized regardless)

**The real-world pattern (what 99% of apps do):**
```typescript
myState.user.name.set("Bob");           // Fast - primitive
myState.todos.at(0).done.set(true);     // Fast - specific path

// Not this:
myState.set(entireNewStateObject);      // Slower - but why would you?
```

If someone has a performance problem, it's likely they're:
1. Subscribing to too broad a path (easy fix: be more specific)
2. Storing data that doesn't belong in reactive state (e.g., video frames, huge binary buffers)

## When to Consider Optimization

For most applications with typical state sizes (< 1000 items in arrays, < 10 levels of nesting), deepstate performs well without any optimization.

Consider optimization only when:
- Arrays contain > 10,000 items that change frequently
- Updates happen > 60 times per second (e.g., animations, real-time data)
- State tree is very deep (> 20 levels)
- You're targeting low-powered devices

## Benchmarks Summary

| Operation | Size | Time |
|-----------|------|------|
| Access nested property | 1000 siblings | ~0.3ms |
| Deep equality check | 10k items | ~6.5ms |
| structuredClone (update) | 1000 items | ~1ms |
| deepFreeze | moderate nesting | ~0.6ms |
| Notify subscribers | 1000 subscribers | ~0.3ms |

*Benchmarks run on Apple Silicon. Your mileage may vary.*
