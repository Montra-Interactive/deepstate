import { state } from "../src/deepstate-v2";

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
// Example 2: Nullable object - treated as RxLeaf (only get/set whole object)
// =============================================================================

type NullableState = {
  user: { name: string; age: number } | null;
  profile: { avatarUrl: string };
};

const nullableStore = state<NullableState>({
  user: null,
  profile: { avatarUrl: "http://example.com/avatar.png" },
});

console.log("=== Nullable type Demo ===\n");

nullableStore.user?.subscribe(user => {
  console.log(`User: ${user ? `${user.name}, ${user.age}` : "null"}`);
});

// Set the whole object
nullableStore.user?.set({ name: "Charlie", age: 25 });

// For nullable types, you work with the whole object:
const currentUser = nullableStore.user?.get();
if (!!currentUser) {
  // Update by getting current value and setting a new one
  nullableStore.user?.set({ ...currentUser, name: "Dave" });
}

console.log(`\nFinal user: ${JSON.stringify(nullableStore.user?.get())}\n`);

// =============================================================================
// Example 3: Non-nullable nested object for when you need update()
// =============================================================================

// If you need update() on a user that might not exist yet,
// consider restructuring your state:

type BetterState = {
  hasUser: boolean;
  user: { name: string; age: number }; // Always exists, use hasUser flag
};

const betterStore = state<BetterState>({
  hasUser: false,
  user: { name: "", age: 0 }, // Default empty user
});

// Now you can use update() on user
betterStore.user.update(draft => {
  draft.name.set("Eve");
  draft.age.set(28);
});
betterStore.hasUser.set(true);

console.log("=== Better pattern for optional user ===");
console.log(`hasUser: ${betterStore.hasUser.get()}`);
console.log(`user: ${JSON.stringify(betterStore.user.get())}`);
