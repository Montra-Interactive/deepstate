/**
 * Wildcard Subscriptions Exploration
 * 
 * Demonstrates:
 * 1. The problem wildcards would solve
 * 2. Current workarounds with RxJS
 * 3. A proposed `selectFrom` helper as a simpler alternative
 */

import { state, selectFromEach } from '../src';
import { map, distinctUntilChanged } from 'rxjs/operators';

// Helper for array comparison (used in manual solution demos)
const arraysEqual = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

console.log('=== Wildcard Subscriptions Exploration ===\n');

// Sample state
const store = state({
  items: [
    { id: 1, name: 'Widget', price: 9.99, qty: 2 },
    { id: 2, name: 'Gadget', price: 19.99, qty: 1 },
    { id: 3, name: 'Gizmo', price: 29.99, qty: 3 },
  ],
  meta: { lastUpdated: new Date().toISOString() }
});

// ============================================
// PROBLEM: "I want to subscribe to all item prices"
// ============================================

console.log('--- Problem: Subscribe to all prices ---\n');

// What users might EXPECT to write (hypothetical):
// store.items.*.price.subscribe(prices => ...)
// store.items.$each.price.subscribe(prices => ...)

// ============================================
// CURRENT SOLUTION 1: Subscribe to array + map
// ============================================

console.log('Solution 1: Subscribe to array + map');
console.log('  store.items.pipe(map(items => items.map(i => i.price)))');

let solution1Emissions = 0;
const sub1 = store.items.pipe(
  map(items => items.map(i => i.price))
).subscribe(prices => {
  solution1Emissions++;
  console.log(`  [emit ${solution1Emissions}] prices:`, prices);
});

// Test: Change a price
console.log('\n  Changing item 0 price from 9.99 to 12.99...');
store.items.at(0)!.price.set(12.99);

// Test: Change a name (should still emit even though we only care about prices!)
console.log('  Changing item 0 name (we dont care about names)...');
store.items.at(0)!.name.set('Super Widget');

console.log(`  Total emissions: ${solution1Emissions} (emitted for name change too!)\n`);
sub1.unsubscribe();

// ============================================
// CURRENT SOLUTION 2: Add distinctUntilChanged
// ============================================

console.log('Solution 2: Add distinctUntilChanged on prices array');

let solution2Emissions = 0;
const sub2 = store.items.pipe(
  map(items => items.map(i => i.price)),
  distinctUntilChanged(arraysEqual)
).subscribe(prices => {
  solution2Emissions++;
  console.log(`  [emit ${solution2Emissions}] prices:`, prices);
});

// Test: Change a name (should NOT emit now)
console.log('\n  Changing item 1 name (we dont care about names)...');
store.items.at(1)!.name.set('Super Gadget');

// Test: Change a price (SHOULD emit)
console.log('  Changing item 1 price from 19.99 to 24.99...');
store.items.at(1)!.price.set(24.99);

console.log(`  Total emissions: ${solution2Emissions} (correctly skipped name change!)\n`);
sub2.unsubscribe();

// ============================================
// PROPOSED HELPER: selectFrom
// ============================================

console.log('--- Using selectFrom from deepstate ---\n');

console.log('Usage: selectFromEach(store.items, item => item.price)');
console.log('       selectFromEach(store.items, item => ({ name: item.name, price: item.price }))');

let selectFromEachEmissions = 0;
const sub3 = selectFromEach(store.items, (item: { price: number }) => item.price)
  .subscribe(prices => {
    selectFromEachEmissions++;
    console.log(`  [emit ${selectFromEachEmissions}] prices:`, prices);
  });

// Test: Change qty (should NOT emit - we only selected price)
console.log('\n  Changing item 2 qty (we only selected price)...');
store.items.at(2)!.qty.set(10);

// Test: Change price (SHOULD emit)
console.log('  Changing item 2 price from 29.99 to 34.99...');
store.items.at(2)!.price.set(34.99);

// Test: Add new item (SHOULD emit - array changed)
console.log('  Adding new item...');
store.items.push({ id: 4, name: 'Doohickey', price: 49.99, qty: 1 });

console.log(`  Total emissions: ${selectFromEachEmissions}\n`);
sub3.unsubscribe();

// ============================================
// COMPLEX SELECTION: Multiple fields
// ============================================

console.log('--- Complex Selection: Multiple fields ---\n');

type ItemSummary = { name: string; total: number };

const sub4 = selectFromEach(
  store.items, 
  (item: { name: string; price: number; qty: number }): ItemSummary => ({
    name: item.name,
    total: item.price * item.qty
  })
).subscribe(summaries => {
  console.log('  Item summaries:', summaries);
});

console.log('  Changing item 0 qty (affects total)...');
store.items.at(0)!.qty.set(5);

sub4.unsubscribe();

// ============================================
// WHY NOT PROXY-BASED WILDCARDS?
// ============================================

console.log('\n--- Why Not Proxy-Based Wildcards? ---\n');

console.log('Hypothetical: store.items.$each.price.subscribe(...)');
console.log('');
console.log('Problems:');
console.log('  1. TypeScript: What is the type of store.items.$each?');
console.log('     - $each is not a real property');
console.log('     - Cant infer that .price after $each returns Observable<number[]>');
console.log('');
console.log('  2. API Pollution: Adds magic symbols to a clean proxy API');
console.log('');
console.log('  3. Not faster: Still needs O(n) comparison on changes');
console.log('     selectFromEach does the same with simpler implementation');
console.log('');
console.log('  4. Edge cases: What about nested wildcards?');
console.log('     store.orders.$each.items.$each.price');
console.log('     This gets complex fast');
console.log('');
console.log('  5. Dynamic arrays: Need to manage subscriptions as items');
console.log('     are added/removed - complex and error-prone');

// ============================================
// COMPARISON TABLE
// ============================================

console.log('\n--- Comparison ---\n');
console.log('| Approach                  | Type-safe | Precise | Complexity |');
console.log('|---------------------------|-----------|---------|------------|');
console.log('| store.items.pipe(map(...))| Yes       | No*     | Low        |');
console.log('| + distinctUntilChanged    | Yes       | Yes     | Medium     |');
console.log('| selectFromEach(...)       | Yes       | Yes     | Low        |');
console.log('| store.items.$each.price   | No**      | Yes     | High       |');
console.log('');
console.log('* Emits on any change to any item');
console.log('** Would require complex types or any/unknown');

// ============================================
// RECOMMENDATION
// ============================================

console.log('\n--- Recommendation ---\n');
console.log('selectFromEach is now exported from deepstate.');
console.log('It provides the convenience without the complexity.');
console.log('');
console.log('```ts');
console.log('import { state, selectFromEach } from "deepstate";');
console.log('');
console.log('const store = state({ items: [...] });');
console.log('');
console.log('// Subscribe to all prices, only emit when prices change');
console.log('selectFromEach(store.items, item => item.price)');
console.log('  .subscribe(prices => console.log("Total:", prices.reduce((a,b) => a+b)));');
console.log('```');
