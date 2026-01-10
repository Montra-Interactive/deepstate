# Why Not Maps and Sets?

A reasonable question: if plain objects are supported, why not `Map`? If arrays are supported, why not `Set`?

## Short Answer

Maps and Sets break serialization, have incompatible proxy behavior, and don't offer ergonomic benefits for reactive state. Use plain objects as maps and arrays instead.

## Detailed Reasoning

### 1. JSON Serialization Breaks

```typescript
const myState = state({
  users: new Map([["alice", { name: "Alice" }]]),
  tags: new Set(["important", "urgent"]),
});

JSON.stringify(myState.getSnapshot());
// {"users":{}, "tags":{}}
// Map and Set become empty objects!
```

This matters for:
- **DevTools integration** - Redux DevTools and similar tools expect JSON-serializable state
- **Persistence** - Saving to localStorage, IndexedDB, or sending to a server
- **Logging/debugging** - `console.log` and error reporters need serializable data
- **State snapshots** - Comparing state over time, time-travel debugging

### 2. Structural Cloning Complexity

We use `structuredClone()` for creating mutable drafts in `update()`. While modern runtimes *do* support cloning Map/Set, the combination with our proxy system and immutable update patterns creates edge cases that are difficult to handle correctly.

### 3. Proxy Behavior Differs

Maps and Sets use methods (`.get()`, `.set()`, `.has()`, `.add()`, `.delete()`) that operate on internal slots, not property access. Our reactive system intercepts property access via Proxy:

```typescript
// Plain object - property access, works with Proxy
obj.alice           // [[Get]] trap fires
obj.alice = value   // [[Set]] trap fires

// Map - method calls, internal slot access
map.get("alice")    // No trap, accesses internal [[MapData]]
map.set("alice", v) // No trap, mutates internal [[MapData]]
```

To support Map/Set, we'd need to wrap every method, handle iterator protocols, and deal with the internal slot access - significant complexity for marginal benefit.

### 4. Ergonomics Don't Improve

What would the API even look like?

```typescript
// With Map - awkward, unclear
myState.users.get("alice").subscribe()?  // .get() returns value, not observable
myState.users.subscribe().get("alice")?  // subscribe first, then get?

// With plain object - clean and obvious
myState.users.alice.subscribe();
myState.users["alice"].subscribe();
```

The plain object approach gives you the same key-value semantics with cleaner reactive access.

### 5. Type Safety is Equivalent

TypeScript handles both patterns well:

```typescript
// Map style (not supported)
type State = {
  users: Map<string, User>;
};

// Object style (supported, equally type-safe)
type State = {
  users: { [id: string]: User };
  // or: users: Record<string, User>;
};
```

## Recommended Patterns

### Instead of Map, use plain objects:

```typescript
// ❌ Don't do this
const state = {
  users: new Map<string, User>(),
};

// ✅ Do this
const myState = state({
  users: {} as Record<string, User>,
});

// Access by key
myState.users["alice"].subscribe(user => console.log(user));

// Update
myState.users.update(users => {
  users["alice"] = { name: "Alice", age: 30 };
});
```

### Instead of Set, use arrays:

```typescript
// ❌ Don't do this  
const state = {
  tags: new Set<string>(),
};

// ✅ Do this
const myState = state({
  tags: [] as string[],
});

// Check membership
const hasTag = myState.tags.getValue().includes("important");

// Add unique (in update)
myState.tags.update(tags => {
  if (!tags.includes("important")) {
    tags.push("important");
  }
});

// Or use filter for Set-like behavior
myState.tags.update(tags => {
  const unique = [...new Set([...tags, "newTag"])];
  tags.length = 0;
  tags.push(...unique);
});
```

### If you really need Map/Set semantics:

Convert at the point of use:

```typescript
// Store as array/object
const myState = state({
  users: [] as User[],
});

// Convert when needed
const usersMap = new Map(
  myState.users.getValue().map(u => [u.id, u])
);

// Or create a derived observable
const usersMap$ = myState.users.pipe(
  map(users => new Map(users.map(u => [u.id, u])))
);
```

## Summary

| Feature | Map/Set | Plain Object/Array |
|---------|---------|-------------------|
| JSON serializable | ❌ | ✅ |
| DevTools compatible | ❌ | ✅ |
| Proxy-friendly | ❌ | ✅ |
| Clean reactive API | ❌ | ✅ |
| Type-safe | ✅ | ✅ |

The tradeoff is clear: plain objects and arrays give you the same data modeling capabilities with full compatibility for reactive state management.
