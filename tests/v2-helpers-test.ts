/**
 * Test that helpers work with V2 state
 */
import { state } from "../src/deepstate-v2";
import { select, selectFromEach } from "../src/helpers";

console.log("=== Testing helpers with V2 ===\n");

// --- Test select() with object form ---
console.log("--- Test 1: select() with object form ---");
const store = state({
  user: { name: "Alice", age: 30 },
  settings: { theme: "dark" },
});

let selectEmissions = 0;
select({
  name: store.user.name,
  theme: store.settings.theme,
}).subscribe(({ name, theme }) => {
  selectEmissions++;
  console.log(`  Emission ${selectEmissions}: name=${name}, theme=${theme}`);
});

store.user.name.set("Bob");
store.settings.theme.set("light");

console.log(`  Total emissions: ${selectEmissions}`);
console.log(`  ${selectEmissions === 3 ? "PASS" : "FAIL"}: Expected 3 emissions (initial + 2 changes)\n`);

// --- Test select() with array form ---
console.log("--- Test 2: select() with array form ---");
const store2 = state({
  a: 1,
  b: 2,
  c: 3,
});

let arraySelectEmissions: [number, number][] = [];
select(store2.a, store2.c).subscribe((tuple) => {
  arraySelectEmissions.push(tuple as [number, number]);
});

store2.a.set(10);
store2.b.set(20); // Should NOT cause emission since we only selected a and c
store2.c.set(30);

console.log(`  Emissions: ${JSON.stringify(arraySelectEmissions)}`);
const expected = [[1, 3], [10, 3], [10, 30]];
const pass = JSON.stringify(arraySelectEmissions) === JSON.stringify(expected);
console.log(`  ${pass ? "PASS" : "FAIL"}: Expected ${JSON.stringify(expected)}\n`);

// --- Test selectFromEach() ---
console.log("--- Test 3: selectFromEach() ---");
const store3 = state({
  items: [
    { id: 1, name: "A", price: 10 },
    { id: 2, name: "B", price: 20 },
    { id: 3, name: "C", price: 30 },
  ],
});

let priceEmissions: number[][] = [];
selectFromEach(store3.items, (item) => item.price).subscribe((prices) => {
  priceEmissions.push([...prices]);
});

console.log(`  Initial prices: ${JSON.stringify(priceEmissions[0])}`);

// Change a price
store3.items.at(0)?.price.set(15);
console.log(`  After changing item[0].price: ${JSON.stringify(priceEmissions)}`);

// Change something that should NOT trigger selectFromEach (name, not price)
store3.items.at(1)?.name.set("Beta");
console.log(`  After changing item[1].name (should NOT add emission): ${JSON.stringify(priceEmissions)}`);

const expectedPrices = [[10, 20, 30], [15, 20, 30]];
const pricesPass = JSON.stringify(priceEmissions) === JSON.stringify(expectedPrices);
console.log(`  ${pricesPass ? "PASS" : "FAIL"}: Expected ${JSON.stringify(expectedPrices)}\n`);

// --- Test selectFromEach with derived values ---
console.log("--- Test 4: selectFromEach() with derived values ---");
const store4 = state({
  cart: [
    { name: "Widget", price: 10, qty: 2 },
    { name: "Gadget", price: 25, qty: 1 },
  ],
});

let totals: { name: string; total: number }[][] = [];
selectFromEach(store4.cart, (item) => ({
  name: item.name,
  total: item.price * item.qty,
})).subscribe((t) => {
  totals.push([...t]);
});

console.log(`  Initial totals: ${JSON.stringify(totals[0])}`);

store4.cart.at(0)?.qty.set(3); // Should change total from 20 to 30
console.log(`  After changing qty: ${JSON.stringify(totals)}`);

const expectedTotals = [
  [{ name: "Widget", total: 20 }, { name: "Gadget", total: 25 }],
  [{ name: "Widget", total: 30 }, { name: "Gadget", total: 25 }],
];
const totalsPass = JSON.stringify(totals) === JSON.stringify(expectedTotals);
console.log(`  ${totalsPass ? "PASS" : "FAIL"}: Expected ${JSON.stringify(expectedTotals)}\n`);

console.log("=== Helpers Tests Complete ===");
