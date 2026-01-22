/**
 * Ergonomics Evaluation for deepstate
 * 
 * Testing common use cases to evaluate API feel and developer experience.
 */

import { state, select, selectFromEach } from "../src";
import { map, filter, debounceTime, switchMap, take } from "rxjs/operators";
import { combineLatest, of } from "rxjs";

// =============================================================================
// 1. BASIC STATE CREATION
// =============================================================================

console.log("=== 1. Basic State Creation ===\n");

// Simple and clean - just pass an object
const appState = state({
  user: {
    id: 1,
    name: "Alice",
    email: "alice@example.com",
    preferences: {
      theme: "dark" as "dark" | "light",
      notifications: true,
    },
  },
  cart: {
    items: [] as { id: number; name: string; price: number; qty: number }[],
    coupon: null as string | null,
  },
  ui: {
    isLoading: false,
    modal: null as string | null,
    sidebarOpen: true,
  },
});

console.log("✓ State created with nested objects, arrays, and nullable types\n");

// =============================================================================
// 2. READING STATE
// =============================================================================

console.log("=== 2. Reading State ===\n");

// Sync read - .get()
const userName = appState.user.name.get();
console.log("Sync read - appState.user.name.get():", userName);

// Deep nested sync read
const theme = appState.user.preferences.theme.get();
console.log("Deep nested - appState.user.preferences.theme.get():", theme);

// Get entire subtree
const user = appState.user.get();
console.log("Subtree - appState.user.get():", user);

console.log("");

// =============================================================================
// 3. WRITING STATE
// =============================================================================

console.log("=== 3. Writing State ===\n");

// Simple set
appState.user.name.set("Bob");
console.log("After .set('Bob'):", appState.user.name.get());

// Nested set
appState.user.preferences.theme.set("light");
console.log("Nested set - theme:", appState.user.preferences.theme.get());

// Nullable set
appState.cart.coupon.set("SAVE20");
console.log("Nullable set - coupon:", appState.cart.coupon.get());

appState.cart.coupon.set(null);
console.log("Set back to null - coupon:", appState.cart.coupon.get());

console.log("");

// =============================================================================
// 4. SUBSCRIBING TO CHANGES
// =============================================================================

console.log("=== 4. Subscribing to Changes ===\n");

// Subscribe to primitive
const sub1 = appState.user.name.subscribe((name) => {
  console.log("  [sub] user.name changed:", name);
});

// Subscribe to object
const sub2 = appState.user.preferences.subscribe((prefs) => {
  console.log("  [sub] preferences changed:", prefs);
});

// Trigger changes
console.log("Triggering name change...");
appState.user.name.set("Charlie");

console.log("Triggering theme change...");
appState.user.preferences.theme.set("dark");

sub1.unsubscribe();
sub2.unsubscribe();
console.log("");

// =============================================================================
// 5. BATCH UPDATES WITH update()
// =============================================================================

console.log("=== 5. Batch Updates with update() ===\n");

let emissions = 0;
const sub3 = appState.user.subscribe(() => emissions++);
emissions = 0; // reset after initial emission

// Multiple changes, single emission
appState.user.update((user) => {
  user.name.set("Diana");
  user.email.set("diana@example.com");
  user.preferences.theme.set("light");
  user.preferences.notifications.set(false);
});

console.log("Emissions after update() with 4 changes:", emissions, "(should be 1)");
console.log("User after update:", appState.user.get());

sub3.unsubscribe();
console.log("");

// =============================================================================
// 6. ARRAY OPERATIONS
// =============================================================================

console.log("=== 6. Array Operations ===\n");

// Push items
appState.cart.items.push(
  { id: 1, name: "Widget", price: 9.99, qty: 2 },
  { id: 2, name: "Gadget", price: 19.99, qty: 1 }
);
console.log("After push - items count:", appState.cart.items.length.get());

// Access by index
console.log("First item:", appState.cart.items.at(0)?.get());

// Subscribe to specific item
const sub4 = appState.cart.items.at(0)?.name.subscribe((name) => {
  console.log("  [sub] First item name:", name);
});

// Update specific item
appState.cart.items.at(0)?.name.set("Super Widget");

// Update item with batched changes
appState.cart.items.update((items) => {
  items.at(0)?.price.set(12.99);
  items.at(0)?.qty.set(3);
});
console.log("First item after update:", appState.cart.items.at(0)?.get());

// Pop
const popped = appState.cart.items.pop();
console.log("Popped item:", popped);
console.log("Items after pop:", appState.cart.items.length.get());

sub4?.unsubscribe();
console.log("");

// =============================================================================
// 7. RXJS COMPOSITION
// =============================================================================

console.log("=== 7. RxJS Composition ===\n");

// combineLatest
const userSummary$ = combineLatest([
  appState.user.name,
  appState.user.email,
]).pipe(map(([name, email]) => `${name} <${email}>`));

userSummary$.pipe(take(1)).subscribe((summary) => {
  console.log("Combined user summary:", summary);
});

// select() helper - object form
select({
  name: appState.user.name,
  theme: appState.user.preferences.theme,
  itemCount: appState.cart.items.length,
})
  .pipe(take(1))
  .subscribe(({ name, theme, itemCount }) => {
    console.log("select() result:", { name, theme, itemCount });
  });

// Derived state with map
const cartTotal$ = appState.cart.items.pipe(
  map((items) => items.reduce((sum, item) => sum + item.price * item.qty, 0))
);

cartTotal$.pipe(take(1)).subscribe((total) => {
  console.log("Cart total (derived):", total.toFixed(2));
});

// selectFromEach() - precise array item selection
// Only emits when the selected property changes, not other properties
console.log("\nselectFromEach() - subscribe to specific fields from array items:");
let selectFromEachEmissions = 0;
const pricesSub = selectFromEach(appState.cart.items, (item) => item.price).subscribe(
  (prices) => {
    selectFromEachEmissions++;
    console.log(`  [selectFromEach emit ${selectFromEachEmissions}] prices:`, prices);
  }
);

// Change qty - should NOT trigger selectFromEach (we only selected price)
appState.cart.items.at(0)?.qty.set(10);
console.log("  Changed qty (selectFromEach should NOT emit)");

// Change price - SHOULD trigger selectFromEach
appState.cart.items.at(0)?.price.set(15.99);
console.log("  Changed price (selectFromEach SHOULD emit)");

console.log(`  Total selectFromEach emissions: ${selectFromEachEmissions} (should be 2: initial + price change)`);
pricesSub.unsubscribe();

console.log("");

// =============================================================================
// 8. ONE-TIME SUBSCRIPTION
// =============================================================================

console.log("=== 8. One-Time Subscription ===\n");

appState.user.name.subscribeOnce((name) => {
  console.log("subscribeOnce got:", name);
});

console.log("Changing name (subscribeOnce should not fire again)...");
appState.user.name.set("Eve");
appState.user.name.set("Frank");

console.log("");

// =============================================================================
// 9. TYPE SAFETY DEMO
// =============================================================================

console.log("=== 9. Type Safety ===\n");

// These would cause TypeScript errors if uncommented:

// appState.user.name.set(123);  // Error: number not assignable to string
// appState.user.preferences.theme.set("blue");  // Error: "blue" not in "dark" | "light"
// appState.cart.items.set("not an array");  // Error: string not assignable to array

// Emitted values are mutable snapshots - use .set() to update state:
// appState.user.subscribe((user) => {
//   user.name = "Hacked";  // Allowed, but won't update the store
// });

console.log("✓ TypeScript catches invalid assignments at compile time");
console.log("✓ Emitted values are mutable snapshots (mutations do not update state)");
console.log("");

// =============================================================================
// 10. ERGONOMICS SUMMARY
// =============================================================================

console.log("=== 10. Ergonomics Summary ===\n");

console.log(`
PROS:
  ✓ Clean proxy-based access: appState.user.profile.age
  ✓ Full TypeScript inference at every level
  ✓ .get() and .set() are symmetrical and intuitive
  ✓ Native RxJS Observables - full operator support
  ✓ update() for batch changes with mutable draft
  ✓ select() helper for combining multiple paths
  ✓ selectFromEach() for precise array item field subscriptions
  ✓ subscribeOnce() for one-shot reads
  ✓ Arrays have .at(), .push(), .pop(), .length
  ✓ Nullable types work correctly

POTENTIAL IMPROVEMENTS TO CONSIDER:
  ? .at(index) returns undefined for out-of-bounds - could be confusing
  ? No computed/derived state built-in (use RxJS operators)
  ? No middleware/devtools integration yet
  ? No persistence helpers yet

COMPARISON TO ALTERNATIVES:
  vs Redux:     Way less boilerplate, no actions/reducers
  vs MobX:      Similar ergonomics, but RxJS instead of MobX observables  
  vs Zustand:   More nested state support, RxJS native
  vs Valtio:    Same proxy feel, but RxJS instead of React-specific
  vs Elf:       No string selectors, proxy-based access
`);
