import { state } from "../src";

// =============================================================================
// Example 1: Non-nullable object - full nested access with update()
// =============================================================================

const store = state({
  user: {
    name: "Alice",
    age: 30,
  },
  settings: {
    theme: "dark",
    notifications: true,
  },
});

console.log("=== Non-nullable update() Demo ===\n");

// Subscribe to see emissions
let emissions = 0;
store.user.subscribe(user => {
  emissions++;
  console.log(`Emission #${emissions}: ${user.name}, ${user.age}`);
});

// Single update with batched changes
store.user.update(draft => {
  draft.name.set("Bob");
  draft.age.set(31);
});
// Only 2 emissions: initial + 1 batched update

console.log(`\nTotal emissions: ${emissions} (expected: 2)\n`);

// =============================================================================
// Example 2: Nullable object with deep subscription
// =============================================================================

type NullableState = {
  user: { name: string; age: number } | null;
  profile: { avatarUrl: string };
};

const nullableStore = state<NullableState>({
  user: null,
  profile: { avatarUrl: "http://example.com/avatar.png" },
});

console.log("=== Nullable type with Deep Subscription Demo ===\n");

// Subscribe to parent (nullable object itself)
nullableStore.user.subscribe(user => {
  console.log(`User object: ${user ? `${user.name}, ${user.age}` : "null"}`);
});

// Deep subscription - subscribe to nested property even when parent is null!
nullableStore.user.name.subscribe(name => {
  console.log(`User name: ${name === undefined ? "undefined (parent is null)" : name}`);
});

// Set the whole object - both subscriptions emit
nullableStore.user.set({ name: "Charlie", age: 25 });

// Update just the name - deep subscription tracks this
nullableStore.user.name.set("Dave");

// Set back to null - deep subscription emits undefined
nullableStore.user.set(null);

console.log(`\nFinal user: ${JSON.stringify(nullableStore.user.get())}\n`);

// =============================================================================
// Example 3: Nullable with update() after setting value
// =============================================================================

// You can use update() on nullable objects after they have a value:

const nullableWithUpdate = state<NullableState>({
  user: null,
  profile: { avatarUrl: "http://example.com/avatar.png" },
});

console.log("=== Nullable with update() Demo ===\n");

// Set initial value
nullableWithUpdate.user.set({ name: "Eve", age: 28 });

// Now you can use update() for batched changes
nullableWithUpdate.user.update(user => {
  user.name.set("Updated Eve");
  user.age.set(29);
});

console.log(`user: ${JSON.stringify(nullableWithUpdate.user.get())}`);
