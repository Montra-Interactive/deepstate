/**
 * Test update() functionality with lock$ batching
 */
import { state } from "../src/deepstate-v2";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    const result = fn();
    if (result) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ ${name} (threw: ${e})`);
    failed++;
  }
}

console.log("=== V2 update() Tests with Lock Batching ===\n");

// =============================================================================
// Basic Batching
// =============================================================================
console.log("--- Basic Batching ---");

test("Individual sets cause multiple emissions", () => {
  const store = state({ user: { name: "Alice", age: 30 } });
  let emissions = 0;
  store.user.subscribe(() => emissions++);
  emissions = 0;
  
  store.user.name.set("Bob");
  store.user.age.set(31);
  
  return emissions === 2;
});

test("update() causes single emission", () => {
  const store = state({ user: { name: "Alice", age: 30 } });
  let emissions = 0;
  store.user.subscribe(() => emissions++);
  emissions = 0;
  
  store.user.update((draft) => {
    draft.name.set("Bob");
    draft.age.set(31);
  });
  
  return emissions === 1;
});

test("update() with many changes still causes single emission", () => {
  const store = state({ 
    a: 1, b: 2, c: 3, d: 4, e: 5 
  });
  let emissions = 0;
  store.subscribe(() => emissions++);
  emissions = 0;
  
  store.update((draft) => {
    draft.a.set(10);
    draft.b.set(20);
    draft.c.set(30);
    draft.d.set(40);
    draft.e.set(50);
  });
  
  return emissions === 1;
});

// =============================================================================
// Value Correctness
// =============================================================================
console.log("\n--- Value Correctness ---");

test("update() returns correct final value", () => {
  const store = state({ name: "Alice", age: 30 });
  
  const result = store.update((draft) => {
    draft.name.set("Bob");
    draft.age.set(31);
  });
  
  return result.name === "Bob" && result.age === 31;
});

test("get() returns correct value after update()", () => {
  const store = state({ name: "Alice", age: 30 });
  
  store.update((draft) => {
    draft.name.set("Bob");
    draft.age.set(31);
  });
  
  return store.name.get() === "Bob" && store.age.get() === 31;
});

test("Subscriber receives correct value after update()", () => {
  const store = state({ name: "Alice", age: 30 });
  let receivedValue: any = null;
  store.subscribe((v) => { receivedValue = v; });
  
  store.update((draft) => {
    draft.name.set("Bob");
    draft.age.set(31);
  });
  
  return receivedValue?.name === "Bob" && receivedValue?.age === 31;
});

// =============================================================================
// Sibling Isolation
// =============================================================================
console.log("\n--- Sibling Isolation ---");

test("Siblings don't emit during update()", () => {
  const store = state({ 
    user: { name: "Alice" }, 
    settings: { theme: "dark" } 
  });
  let settingsEmissions = 0;
  store.settings.subscribe(() => settingsEmissions++);
  settingsEmissions = 0;
  
  store.user.update((draft) => {
    draft.name.set("Bob");
  });
  
  return settingsEmissions === 0;
});

test("Deeply nested siblings don't emit", () => {
  const store = state({ 
    a: { nested: { value: 1 } },
    b: { nested: { value: 2 } }
  });
  let bEmissions = 0;
  store.b.nested.value.subscribe(() => bEmissions++);
  bEmissions = 0;
  
  store.a.nested.update((draft) => {
    draft.value.set(100);
  });
  
  return bEmissions === 0;
});

// =============================================================================
// Parent Propagation
// =============================================================================
console.log("\n--- Parent Propagation ---");

test("Parent emits once when child update() completes", () => {
  const store = state({ user: { name: "Alice", age: 30 } });
  let rootEmissions = 0;
  store.subscribe(() => rootEmissions++);
  rootEmissions = 0;
  
  store.user.update((draft) => {
    draft.name.set("Bob");
    draft.age.set(31);
  });
  
  return rootEmissions === 1;
});

test("Grandparent emits once when deeply nested update() completes", () => {
  const store = state({ 
    level1: { 
      level2: { 
        value: 1, 
        other: 2 
      } 
    } 
  });
  let rootEmissions = 0;
  store.subscribe(() => rootEmissions++);
  rootEmissions = 0;
  
  store.level1.level2.update((draft) => {
    draft.value.set(10);
    draft.other.set(20);
  });
  
  return rootEmissions === 1;
});

// =============================================================================
// Array update()
// =============================================================================
console.log("\n--- Array update() ---");

test("Array update() causes single emission", () => {
  const store = state({ items: [{ id: 1, name: "A" }, { id: 2, name: "B" }] });
  let emissions = 0;
  store.items.subscribe(() => emissions++);
  emissions = 0;
  
  store.items.update((draft) => {
    draft.at(0)?.name.set("Alpha");
    draft.at(1)?.name.set("Beta");
  });
  
  return emissions === 1;
});

test("Array update() with push causes single emission", () => {
  const store = state({ items: [{ id: 1 }] });
  let emissions = 0;
  store.items.subscribe(() => emissions++);
  emissions = 0;
  
  store.items.update((draft) => {
    draft.push({ id: 2 });
    draft.push({ id: 3 });
  });
  
  return emissions === 1;
});

test("Array update() with pop causes single emission", () => {
  const store = state({ items: [1, 2, 3, 4, 5] });
  let emissions = 0;
  store.items.subscribe(() => emissions++);
  emissions = 0;
  
  store.items.update((draft) => {
    draft.pop();
    draft.pop();
  });
  
  return emissions === 1 && store.items.get().length === 3;
});

test("Array update() with mixed operations causes single emission", () => {
  const store = state({ items: [{ id: 1, name: "A" }] });
  let emissions = 0;
  store.items.subscribe(() => emissions++);
  emissions = 0;
  
  store.items.update((draft) => {
    draft.at(0)?.name.set("Alpha");
    draft.push({ id: 2, name: "Beta" });
    draft.push({ id: 3, name: "Gamma" });
  });
  
  const items = store.items.get();
  return emissions === 1 && 
         items.length === 3 && 
         items[0]?.name === "Alpha" &&
         items[2]?.name === "Gamma";
});

test("Array length observable updates correctly after update()", () => {
  const store = state({ items: [1, 2, 3] });
  let lengthValues: number[] = [];
  store.items.length.subscribe((len) => lengthValues.push(len));
  lengthValues = [];
  
  store.items.update((draft) => {
    draft.push(4);
    draft.push(5);
  });
  
  return lengthValues.length === 1 && lengthValues[0] === 5;
});

// =============================================================================
// Edge Cases
// =============================================================================
console.log("\n--- Edge Cases ---");

test("Empty update() still emits once", () => {
  const store = state({ value: 1 });
  let emissions = 0;
  store.subscribe(() => emissions++);
  emissions = 0;
  
  store.update(() => {
    // No changes
  });
  
  // Should still emit once when unlock happens
  return emissions === 1;
});

test("update() with no actual value change emits once", () => {
  const store = state({ value: 1 });
  let emissions = 0;
  store.subscribe(() => emissions++);
  emissions = 0;
  
  store.update((draft) => {
    draft.value.set(1); // Same value
  });
  
  return emissions === 1;
});

test("Nested update() calls work correctly", () => {
  const store = state({ a: 1, b: 2 });
  let emissions = 0;
  store.subscribe(() => emissions++);
  emissions = 0;
  
  store.update((draft) => {
    draft.a.set(10);
    // Note: nested update() on same store would be unusual,
    // but calling set() multiple times should still work
    draft.a.set(20);
    draft.b.set(30);
  });
  
  return emissions === 1 && store.a.get() === 20 && store.b.get() === 30;
});

test("update() after previous update() works correctly", () => {
  const store = state({ value: 1 });
  let emissions = 0;
  store.subscribe(() => emissions++);
  emissions = 0;
  
  store.update((draft) => { draft.value.set(10); });
  store.update((draft) => { draft.value.set(20); });
  
  return emissions === 2 && store.value.get() === 20;
});

test("Error in update() callback still unlocks", () => {
  const store = state({ value: 1 });
  let emissions = 0;
  store.subscribe(() => emissions++);
  emissions = 0;
  
  try {
    store.update(() => {
      throw new Error("Test error");
    });
  } catch (e) {
    // Expected
  }
  
  // After error, should still be able to use the store
  store.value.set(10);
  
  // Should have emitted: once for unlock (even with error), once for set
  return store.value.get() === 10;
});

// =============================================================================
// Root-level update()
// =============================================================================
console.log("\n--- Root-level update() ---");

test("Root update() batches all changes", () => {
  const store = state({ 
    user: { name: "Alice" },
    settings: { theme: "dark" },
    count: 0
  });
  let emissions = 0;
  store.subscribe(() => emissions++);
  emissions = 0;
  
  store.update((draft) => {
    draft.user.name.set("Bob");
    draft.settings.theme.set("light");
    draft.count.set(5);
  });
  
  return emissions === 1 &&
         store.user.name.get() === "Bob" &&
         store.settings.theme.get() === "light" &&
         store.count.get() === 5;
});

// =============================================================================
// Summary
// =============================================================================
console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) {
  process.exit(1);
}
