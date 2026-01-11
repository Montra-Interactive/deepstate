/**
 * Test that exports work correctly
 */
import { state, stateV1, select, selectFromEach } from "../src";

console.log("=== Export Tests ===\n");

// Test V2 (default)
console.log("--- V2 (default export) ---");
const v2Store = state({ name: "Alice", count: 0 });
console.log(`  Initial name: ${v2Store.name.get()}`);
v2Store.name.set("Bob");
console.log(`  After set: ${v2Store.name.get()}`);

// Test V1
console.log("\n--- V1 (stateV1 export) ---");
const v1Store = stateV1({ name: "Charlie", count: 0 });
console.log(`  Initial name: ${v1Store.name.get()}`);
v1Store.name.set("Diana");
console.log(`  After set: ${v1Store.name.get()}`);

// Test helpers with V2
console.log("\n--- Helpers with V2 ---");
const store = state({ a: 1, b: 2 });
select(store.a, store.b).subscribe(([a, b]) => {
  console.log(`  select(): a=${a}, b=${b}`);
});

console.log("\n=== All exports work! ===");
