/**
 * Test file for deepstate-v2
 * 
 * Verifies:
 * 1. Basic get/set works
 * 2. Subscriptions emit correctly
 * 3. Siblings do NOT emit when one changes (the key feature!)
 * 4. Parents DO emit when children change
 * 5. Arrays work with at()
 * 6. Array push/pop
 * 7. Array map/filter
 * 8. subscribeOnce
 * 9. Deep freeze
 * 10. Array length observable
 */

import { state } from '../src/deepstate-v2';

console.log('=== deepstate-v2 Full Feature Tests ===\n');

// =============================================================================
// Test 1: Basic get/set
// =============================================================================

console.log('--- Test 1: Basic get/set ---');

const store = state({
  user: { name: 'Alice', age: 30 },
  settings: { theme: 'dark' },
});

console.log('Initial user.name:', store.user.name.get());
console.log('Initial user.age:', store.user.age.get());
console.log('Initial settings.theme:', store.settings.theme.get());

store.user.name.set('Bob');
console.log('After set, user.name:', store.user.name.get());

store.user.age.set(31);
console.log('After set, user.age:', store.user.age.get());

console.log('Full user object:', store.user.get());
console.log('');

// =============================================================================
// Test 2: Subscriptions emit correctly
// =============================================================================

console.log('--- Test 2: Subscriptions emit correctly ---');

let nameEmissions: string[] = [];
let ageEmissions: number[] = [];

const nameSub = store.user.name.subscribe((name) => {
  nameEmissions.push(name);
});

const ageSub = store.user.age.subscribe((age) => {
  ageEmissions.push(age);
});

console.log('After subscribing:');
console.log('  nameEmissions:', nameEmissions);
console.log('  ageEmissions:', ageEmissions);

store.user.name.set('Charlie');
console.log('After setting name to Charlie:');
console.log('  nameEmissions:', nameEmissions);
console.log('  ageEmissions:', ageEmissions);

store.user.age.set(32);
console.log('After setting age to 32:');
console.log('  nameEmissions:', nameEmissions);
console.log('  ageEmissions:', ageEmissions);

nameSub.unsubscribe();
ageSub.unsubscribe();
console.log('');

// =============================================================================
// Test 3: CRITICAL - Siblings do NOT emit
// =============================================================================

console.log('--- Test 3: CRITICAL - Siblings do NOT emit ---');

const store2 = state({
  user: { name: 'Alice', age: 30 },
  settings: { theme: 'dark', lang: 'en' },
});

let userNameEmits = 0;
let userAgeEmits = 0;
let settingsThemeEmits = 0;

store2.user.name.subscribe(() => userNameEmits++);
store2.user.age.subscribe(() => userAgeEmits++);
store2.settings.theme.subscribe(() => settingsThemeEmits++);

console.log('Initial emissions (from subscribe):');
console.log(`  user.name: ${userNameEmits}, user.age: ${userAgeEmits}, settings.theme: ${settingsThemeEmits}`);

// Reset counts after initial emission
userNameEmits = 0;
userAgeEmits = 0;
settingsThemeEmits = 0;

// Change user.name - only user.name should emit
store2.user.name.set('Bob');

console.log('After changing user.name to Bob:');
console.log(`  user.name: ${userNameEmits}, user.age: ${userAgeEmits}, settings.theme: ${settingsThemeEmits}`);
console.log(`  EXPECTED: user.name: 1, user.age: 0, settings.theme: 0`);

if (userNameEmits === 1 && userAgeEmits === 0 && settingsThemeEmits === 0) {
  console.log('  PASS: Siblings did not emit!');
} else {
  console.log('  FAIL: Siblings emitted when they should not have!');
}

console.log('');

// =============================================================================
// Test 4: Parents DO emit when children change
// =============================================================================

console.log('--- Test 4: Parents DO emit when children change ---');

const store3 = state({
  user: { name: 'Alice', age: 30 },
});

let userEmits = 0;
let userValues: unknown[] = [];

store3.user.subscribe((value) => {
  userEmits++;
  userValues.push(value);
});

console.log('Initial user emissions:', userEmits);

// Reset after initial
userEmits = 0;
userValues = [];

store3.user.name.set('Diana');

console.log('After changing user.name to Diana:');
console.log(`  user emits: ${userEmits}`);
console.log(`  user value: ${JSON.stringify(userValues[0])}`);

if (userEmits === 1 && (userValues[0] as any)?.name === 'Diana') {
  console.log('  PASS: Parent emitted with updated value!');
} else {
  console.log('  FAIL: Parent did not emit correctly!');
}

console.log('');

// =============================================================================
// Test 5: Arrays work with at()
// =============================================================================

console.log('--- Test 5: Arrays work with at() ---');

const store4 = state({
  items: [
    { id: 1, name: 'Widget' },
    { id: 2, name: 'Gadget' },
  ],
});

console.log('items.length:', store4.items.length.get());
console.log('items.at(0).name:', store4.items.at(0)?.name.get());
console.log('items.at(1).name:', store4.items.at(1)?.name.get());

// Change item name
store4.items.at(0)?.name.set('Super Widget');
console.log('After changing at(0).name:');
console.log('  items.at(0).name:', store4.items.at(0)?.name.get());
console.log('  Full items array:', JSON.stringify(store4.items.get()));

console.log('');

// =============================================================================
// Test 6: Array sibling test
// =============================================================================

console.log('--- Test 6: Array item siblings do NOT emit ---');

const store5 = state({
  items: [
    { id: 1, name: 'A', price: 10 },
    { id: 2, name: 'B', price: 20 },
  ],
});

let item0NameEmits = 0;
let item0PriceEmits = 0;
let item1NameEmits = 0;

store5.items.at(0)?.name.subscribe(() => item0NameEmits++);
store5.items.at(0)?.price.subscribe(() => item0PriceEmits++);
store5.items.at(1)?.name.subscribe(() => item1NameEmits++);

// Reset after initial
item0NameEmits = 0;
item0PriceEmits = 0;
item1NameEmits = 0;

// Change item 0's name
store5.items.at(0)?.name.set('AA');

console.log('After changing items[0].name to AA:');
console.log(`  item0.name: ${item0NameEmits}, item0.price: ${item0PriceEmits}, item1.name: ${item1NameEmits}`);
console.log(`  EXPECTED: item0.name: 1, item0.price: 0, item1.name: 0`);

if (item0NameEmits === 1 && item0PriceEmits === 0 && item1NameEmits === 0) {
  console.log('  PASS: Array item siblings did not emit!');
} else {
  console.log('  FAIL: Array item siblings emitted when they should not have!');
}

console.log('');

// =============================================================================
// Test 7: Array push/pop
// =============================================================================

console.log('--- Test 7: Array push/pop ---');

const store6 = state({
  items: [{ id: 1, name: 'First' }],
});

console.log('Initial length:', store6.items.length.get());

// Push
const newLen = store6.items.push({ id: 2, name: 'Second' }, { id: 3, name: 'Third' });
console.log('After push(2 items), length:', newLen);
console.log('Items:', store6.items.get());

// Pop
const popped = store6.items.pop();
console.log('Popped:', popped);
console.log('After pop, length:', store6.items.length.get());

if (store6.items.length.get() === 2 && popped?.id === 3) {
  console.log('  PASS: push/pop work correctly!');
} else {
  console.log('  FAIL: push/pop did not work correctly!');
}

console.log('');

// =============================================================================
// Test 8: Array map/filter
// =============================================================================

console.log('--- Test 8: Array map/filter ---');

const store7 = state({
  items: [
    { id: 1, name: 'A', active: true },
    { id: 2, name: 'B', active: false },
    { id: 3, name: 'C', active: true },
  ],
});

// Map
const names = store7.items.map(item => item.name);
console.log('Mapped names:', names);

// Filter
const activeItems = store7.items.filter(item => item.active);
console.log('Filtered (active):', activeItems);

if (names.join(',') === 'A,B,C' && activeItems.length === 2) {
  console.log('  PASS: map/filter work correctly!');
} else {
  console.log('  FAIL: map/filter did not work correctly!');
}

console.log('');

// =============================================================================
// Test 9: subscribeOnce
// =============================================================================

console.log('--- Test 9: subscribeOnce ---');

const store8 = state({
  value: 'initial',
});

let subscribeOnceCallCount = 0;
store8.value.subscribeOnce((v) => {
  subscribeOnceCallCount++;
  console.log('  subscribeOnce received:', v);
});

// Should have fired once already (BehaviorSubject emits current value)
console.log('  Call count after subscribe:', subscribeOnceCallCount);

// Change value - should NOT fire again
store8.value.set('changed');
console.log('  Call count after set:', subscribeOnceCallCount);

if (subscribeOnceCallCount === 1) {
  console.log('  PASS: subscribeOnce only fired once!');
} else {
  console.log('  FAIL: subscribeOnce fired wrong number of times!');
}

console.log('');

// =============================================================================
// Test 10: Deep freeze
// =============================================================================

console.log('--- Test 10: Deep freeze ---');

const store9 = state({
  user: { name: 'Alice', profile: { age: 30 } },
});

let frozenValue: any;
store9.user.subscribe((user) => {
  frozenValue = user;
});

// Try to mutate the received value
let mutationBlocked = false;
try {
  frozenValue.name = 'Hacked';
} catch (e) {
  mutationBlocked = true;
}

if (mutationBlocked) {
  console.log('  PASS: Mutation was blocked (frozen)!');
} else {
  console.log('  FAIL: Mutation was NOT blocked!');
}

console.log('');

// =============================================================================
// Test 11: Array length as observable
// =============================================================================

console.log('--- Test 11: Array length as observable ---');

const store10 = state({
  items: [1, 2, 3],
});

let lengthEmissions: number[] = [];
store10.items.length.subscribe((len) => {
  lengthEmissions.push(len);
});

console.log('Initial length emissions:', lengthEmissions);

store10.items.push(4);
console.log('After push(4), emissions:', lengthEmissions);

store10.items.pop();
console.log('After pop(), emissions:', lengthEmissions);

if (lengthEmissions.join(',') === '3,4,3') {
  console.log('  PASS: length observable emits correctly!');
} else {
  console.log('  FAIL: length observable did not emit correctly!');
}

console.log('');

// =============================================================================
// Summary
// =============================================================================

console.log('=== Tests Complete ===');
