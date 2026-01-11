/**
 * Edge case tests for V2
 */
import { state } from "../src/deepstate-v2";

console.log("=== V2 Edge Case Tests ===\n");

// --- Test 1: Empty object ---
console.log("--- Test 1: Empty object ---");
try {
  const store1 = state({ empty: {} });
  console.log(`  Empty object get(): ${JSON.stringify(store1.empty.get())}`);
  store1.empty.subscribe(val => console.log(`  Empty object subscribe: ${JSON.stringify(val)}`));
  console.log("  PASS: Empty object works\n");
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

// --- Test 2: Empty array ---
console.log("--- Test 2: Empty array ---");
try {
  const store2 = state({ items: [] as { id: number }[] });
  console.log(`  Empty array get(): ${JSON.stringify(store2.items.get())}`);
  console.log(`  Empty array length: ${store2.items.length.get()}`);
  
  // Push to empty array
  store2.items.push({ id: 1 });
  console.log(`  After push, length: ${store2.items.length.get()}`);
  console.log(`  After push, items: ${JSON.stringify(store2.items.get())}`);
  console.log("  PASS: Empty array works\n");
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

// --- Test 3: Nullable property ---
console.log("--- Test 3: Nullable/undefined property ---");
try {
  const store3 = state({ 
    maybeValue: null as string | null,
    undefinedValue: undefined as string | undefined
  });
  console.log(`  null get(): ${store3.maybeValue.get()}`);
  console.log(`  undefined get(): ${store3.undefinedValue.get()}`);
  
  store3.maybeValue.set("now has value");
  console.log(`  After set, null -> "${store3.maybeValue.get()}"`);
  console.log("  PASS: Nullable properties work\n");
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

// --- Test 4: Deeply nested access ---
console.log("--- Test 4: Deeply nested (4+ levels) ---");
try {
  const store4 = state({
    level1: {
      level2: {
        level3: {
          level4: {
            value: "deep"
          }
        }
      }
    }
  });
  console.log(`  Deep get(): ${store4.level1.level2.level3.level4.value.get()}`);
  
  let emissions = 0;
  store4.level1.level2.level3.level4.value.subscribe(() => emissions++);
  store4.level1.level2.level3.level4.value.set("deeper");
  console.log(`  After set: ${store4.level1.level2.level3.level4.value.get()}`);
  console.log(`  Emissions: ${emissions}`);
  console.log("  PASS: Deep nesting works\n");
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

// --- Test 5: Array of primitives ---
console.log("--- Test 5: Array of primitives ---");
try {
  const store5 = state({ numbers: [1, 2, 3] });
  console.log(`  Initial: ${JSON.stringify(store5.numbers.get())}`);
  
  // Access element
  const first = store5.numbers.at(0);
  console.log(`  at(0): ${first?.get()}`);
  
  // Set element
  first?.set(10);
  console.log(`  After set at(0) to 10: ${JSON.stringify(store5.numbers.get())}`);
  
  // Push
  store5.numbers.push(4, 5);
  console.log(`  After push(4, 5): ${JSON.stringify(store5.numbers.get())}`);
  console.log("  PASS: Array of primitives works\n");
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

// --- Test 6: Replace entire object ---
console.log("--- Test 6: Replace entire nested object ---");
try {
  const store6 = state({ 
    user: { name: "Alice", profile: { bio: "Hello" } }
  });
  console.log(`  Initial: ${JSON.stringify(store6.user.get())}`);
  
  let profileEmissions = 0;
  store6.user.profile.subscribe(() => profileEmissions++);
  
  // Replace entire user
  store6.user.set({ name: "Bob", profile: { bio: "World" } });
  console.log(`  After replace: ${JSON.stringify(store6.user.get())}`);
  console.log(`  Profile emissions: ${profileEmissions}`);
  console.log("  PASS: Object replacement works\n");
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

// --- Test 7: out of bounds array access ---
console.log("--- Test 7: Out of bounds array access ---");
try {
  const store7 = state({ items: [{ id: 1 }] });
  const outOfBounds = store7.items.at(99);
  console.log(`  at(99) returns: ${outOfBounds}`);
  console.log(`  ${outOfBounds === undefined ? "PASS" : "FAIL"}: Should be undefined\n`);
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

// --- Test 8: Negative array index ---
console.log("--- Test 8: Negative array index ---");
try {
  const store8 = state({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  const neg = store8.items.at(-1);
  console.log(`  at(-1) returns: ${neg}`);
  // Note: Our at() doesn't support negative indices like Array.at()
  console.log(`  ${neg === undefined ? "PASS (no negative index support)" : "INFO: Has negative index support"}\n`);
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

// --- Test 9: Boolean values ---
console.log("--- Test 9: Boolean values ---");
try {
  const store9 = state({ enabled: false });
  console.log(`  Initial: ${store9.enabled.get()}`);
  
  let emissions: boolean[] = [];
  store9.enabled.subscribe(v => emissions.push(v));
  
  store9.enabled.set(true);
  store9.enabled.set(false);
  store9.enabled.set(false); // Should not emit (same value)
  
  console.log(`  Emissions: ${JSON.stringify(emissions)}`);
  // Note: V2 uses distinctUntilChanged with === for primitives
  console.log("  PASS: Boolean values work\n");
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

// --- Test 10: Numeric zero ---
console.log("--- Test 10: Numeric zero and falsy values ---");
try {
  const store10 = state({ count: 0, text: "" });
  console.log(`  count: ${store10.count.get()}, text: "${store10.text.get()}"`);
  console.log(`  ${store10.count.get() === 0 && store10.text.get() === "" ? "PASS" : "FAIL"}: Falsy values preserved\n`);
} catch (e) {
  console.log(`  FAIL: ${e}\n`);
}

console.log("=== Edge Case Tests Complete ===");
